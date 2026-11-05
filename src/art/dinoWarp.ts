/**
 * Изгиб диплодока сеткой.
 *
 * Диплодок — одна картинка, а не набор кусков, поэтому швов у него нет вовсе.
 * Phaser.Plane натягивает рисунок на сетку вершин, а здесь каждый кадр
 * пересчитываются только те вершины, что попали в шею и голову: они ложатся
 * на кривую от плеча к тому месту, куда диплодок тянется.
 *
 * Считаем в пикселях рисунка: так ближе к измерениям инструмента, а в
 * координаты вершин переводим в самом конце одной формулой.
 */
import Phaser from 'phaser';
import { DINO_MESH } from './dinoArtMeta';

/** Клеток по ширине и высоте. По длине шеи их нужно больше, чем поперёк. */
const COLS = 24;
const ROWS = 44;
/** Сколько точек кривой считаем за кадр: вершины берут из этой таблицы. */
const SAMPLES = 24;
/**
 * Насколько шея выгибается дугой, когда голова уходит в сторону от покоя.
 * В покое ноль: нетронутый рисунок обязан остаться нетронутым.
 */
const BOW = 0.22;
/**
 * Докуда вбок от оси гнутся вершины: у шеи узко, у головы шире.
 *
 * Без этого изгиб хватал и вершины в пустоте по бокам, а с ними тянулся
 * верх спины: треугольник одним углом стоял на теле, другим уезжал вверх.
 */
const NECK_REACH = 1.9;
const HEAD_REACH = 4.5;
/** Докуда вбок от середины лапы берутся её вершины, долей ширины лапы. */
const LEG_REACH = 0.62;
/** На этой высоте ниже живота поворот лапы набирает полную силу, px рисунка. */
const LEG_FADE = 34;
/** А подъём — на этой: короткая тянущаяся перемычка прячется в брюхе. */
const LIFT_FADE = 12;
/**
 * На каком удалении от основания хвост качается в полную силу, px рисунка.
 * У самого крупа качания нет — иначе рисунок рвётся по спине.
 */
const TAIL_FADE = Math.max(1, DINO_MESH.tailReach * 0.45);

/** Что про вершину известно заранее: где она на шее и насколько в стороне. */
interface NeckBound {
  kind: 'neck';
  /** Доля вдоль шеи, 0 у плеча, 1 у головы. */
  t: number;
  /** Расстояние вбок от оси, px рисунка. Знак — с какой стороны. */
  side: number;
  /** Сколько вершина выступает за конец шеи: так едет голова. */
  beyond: number;
}

/** Вершина хвоста: крутится вокруг крупа тем сильнее, чем ближе к кончику. */
interface TailBound {
  kind: 'tail';
  /** Исходное место вершины: поворот всегда считается от него. */
  restX: number;
  restY: number;
  /** 0 у крупа, 1 на кончике: у основания рисунок не должен ломаться. */
  weight: number;
}

/** Вершина лапы: крутится вокруг бедра тем сильнее, чем дальше от живота. */
interface LegBound {
  kind: 'leg';
  leg: number;
  pivotX: number;
  pivotY: number;
  /** Исходное место вершины: поворот всегда считается от него, иначе копится. */
  restX: number;
  restY: number;
  /** 0 у самого живота, 1 ниже по лапе: у бедра рисунок не рвётся. */
  weight: number;
  /** То же для подъёма, но набирается круто: нога должна подниматься целиком,
   *  а не складываться телескопом — иначе копыто смазывается в кляксу. */
  liftWeight: number;
}

type Bound = NeckBound | LegBound | TailBound;

/** Точка и нормаль кривой: таблица заполняется заново каждый кадр. */
const curveX = new Float32Array(SAMPLES + 1);
const curveY = new Float32Array(SAMPLES + 1);
const normalX = new Float32Array(SAMPLES + 1);
const normalY = new Float32Array(SAMPLES + 1);

/** Плечо и покой головы в пикселях рисунка. */
function toImage(rigX: number, rigY: number): { x: number; y: number } {
  return {
    x: (rigX - DINO_MESH.shoulderX) / DINO_MESH.scale + DINO_MESH.shoulderImageX,
    y: rigY / DINO_MESH.scale + DINO_MESH.imageHeight,
  };
}

const SHOULDER = toImage(DINO_MESH.shoulderX, DINO_MESH.shoulderY);
const HEAD_REST = toImage(DINO_MESH.headRestX, DINO_MESH.headRestY);
const REST_DX = HEAD_REST.x - SHOULDER.x;
const REST_DY = HEAD_REST.y - SHOULDER.y;
const REST_LENGTH = Math.max(1, Math.hypot(REST_DX, REST_DY));
const REST_ANGLE = Math.atan2(REST_DY, REST_DX);
/** Половина толщины шеи в пикселях рисунка. */
const HALF_THICKNESS = DINO_MESH.neckThickness / DINO_MESH.scale / 2;

/** Сетка с рисунком диплодока, уже в масштабе рига. */
export function createDinoPlane(scene: Phaser.Scene): Phaser.GameObjects.Plane {
  const plane = scene.add.plane(0, 0, DINO_MESH.key, undefined, COLS, ROWS);
  // Картинка кладётся так, чтобы её низ встал на землю, а плечо — в плечо рига.
  const centre = {
    x: (DINO_MESH.imageWidth / 2 - DINO_MESH.shoulderImageX) * DINO_MESH.scale + DINO_MESH.shoulderX,
    y: (DINO_MESH.imageHeight / 2 - DINO_MESH.imageHeight) * DINO_MESH.scale,
  };
  plane.setPosition(centre.x, centre.y).setScale(DINO_MESH.scale);
  // Вершины двигаем мы сами, и Mesh об этом не знает: без этого флага он
  // пересчитывает их только когда сам объект сдвинулся, и шея не гнётся.
  plane.ignoreDirtyCache = true;
  return plane;
}

/**
 * Разложить вершины по шее один раз: их место на рисунке больше не меняется,
 * а значит и доля вдоль шеи со смещением вбок считаются заранее.
 */
export function prepareWarp(plane: Phaser.GameObjects.Plane): (Bound | null)[] {
  const dirX = REST_DX / REST_LENGTH;
  const dirY = REST_DY / REST_LENGTH;

  return plane.vertices.map((vertex) => {
    const px = vertex.x * DINO_MESH.imageHeight + DINO_MESH.imageWidth / 2;
    const py = DINO_MESH.imageHeight / 2 - vertex.y * DINO_MESH.imageHeight;

    // Хвост — крюк: от крупа влево и вниз, а кончиком обратно вправо под
    // брюхо, ниже копыт. Поэтому он и левее задней лапы, и ниже лап; по
    // одному «левее» кончик оставался на месте и рисунок рвался у задней лапы.
    if (px < DINO_MESH.tailBaseX || py > DINO_MESH.tailFloorY) {
      const reach = Math.hypot(px - DINO_MESH.tailBaseX, py - DINO_MESH.tailBaseY);
      return {
        kind: 'tail' as const,
        restX: px,
        restY: py,
        weight: Math.min(1, reach / TAIL_FADE),
      };
    }

    // Ниже живота — лапы: каждая крутится вокруг своего бедра.
    if (py >= DINO_MESH.bellyY) {
      for (let i = 0; i < DINO_MESH.legs.length; i += 1) {
        const leg = DINO_MESH.legs[i];
        if (leg === undefined || Math.abs(px - leg.x) > leg.width * LEG_REACH) continue;
        // Удержание копыта пробовали — нога от него ломалась в голени,
        // стало хуже прежнего. Поворот простой: вся нога вокруг бедра.
        return {
          kind: 'leg' as const,
          leg: i,
          pivotX: leg.x,
          pivotY: DINO_MESH.bellyY,
          restX: px,
          restY: py,
          weight: Math.min(1, (py - DINO_MESH.bellyY) / LEG_FADE),
          liftWeight: Math.min(1, (py - DINO_MESH.bellyY) / LIFT_FADE),
        };
      }
      return null;
    }

    const along = (px - SHOULDER.x) * dirX + (py - SHOULDER.y) * dirY;
    // Ниже плеча — тело: оно не шевелится, иначе поплывёт спина.
    if (along < 0) return null;
    const side = (px - SHOULDER.x) * -dirY + (py - SHOULDER.y) * dirX;
    const beyond = Math.max(0, along - REST_LENGTH);
    const reach = (beyond > 0 ? HEAD_REACH : NECK_REACH) * HALF_THICKNESS;
    if (Math.abs(side) > reach) return null;
    return { kind: 'neck' as const, t: Math.min(1, along / REST_LENGTH), side, beyond };
  });
}

/** Пересчитать таблицу кривой под новое положение головы. */
function sampleCurve(headX: number, headY: number): void {
  const head = toImage(headX, headY);
  const dx = head.x - SHOULDER.x;
  const dy = head.y - SHOULDER.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  // Контрольная точка — середина хорды, отведённая вбок тем сильнее, чем
  // дальше голова ушла от покоя. В покое отвод нулевой.
  const turn = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - REST_ANGLE);
  const bow = turn * length * BOW;
  const midX = SHOULDER.x + dx * 0.5 - (dy / length) * bow;
  const midY = SHOULDER.y + dy * 0.5 + (dx / length) * bow;

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const inv = 1 - t;
    curveX[i] = inv * inv * SHOULDER.x + 2 * inv * t * midX + t * t * head.x;
    curveY[i] = inv * inv * SHOULDER.y + 2 * inv * t * midY + t * t * head.y;
  }
  for (let i = 0; i <= SAMPLES; i += 1) {
    const prev = i === 0 ? 0 : i - 1;
    const next = i === SAMPLES ? SAMPLES : i + 1;
    const tx = curveX[next] - curveX[prev];
    const ty = curveY[next] - curveY[prev];
    const len = Math.max(0.0001, Math.hypot(tx, ty));
    normalX[i] = -ty / len;
    normalY[i] = tx / len;
  }
}

/** Положить шею и голову на кривую, ведущую к точке, куда тянется диплодок. */
/**
 * Положить шею и голову на кривую, поднять и повернуть лапы вокруг бёдер,
 * а хвост качнуть волной: tailAngle — угол сейчас, tailLag — он же
 * несколько кадров назад, им и ведётся кончик.
 *
 * Возвращает, на сколько повернулась голова: по этому углу едут глаз и
 * листик, нарисованные отдельно от сетки.
 */
export function applyWarp(
  plane: Phaser.GameObjects.Plane,
  bounds: (Bound | null)[],
  headX: number,
  headY: number,
  legAngles: readonly number[],
  legLifts: readonly number[],
  tailAngle: number,
  tailLag: number,
): number {
  sampleCurve(headX, headY);
  const endIndex = SAMPLES;
  const tailX = curveX[endIndex] - curveX[endIndex - 1];
  const tailY = curveY[endIndex] - curveY[endIndex - 1];
  const tailLen = Math.max(0.0001, Math.hypot(tailX, tailY));

  const vertices = plane.vertices;
  for (let i = 0; i < vertices.length; i += 1) {
    const bound = bounds[i];
    const vertex = vertices[i];
    if (bound === undefined || bound === null || vertex === undefined) continue;

    if (bound.kind === 'tail') {
      // Кончик повторяет движение крупа с запозданием: по хвосту идёт волна,
      // а не поворот доски. Чем дальше от основания, тем старее угол.
      const angle = tailAngle + (tailLag - tailAngle) * bound.weight;
      rotate(vertex, bound, DINO_MESH.tailBaseX, DINO_MESH.tailBaseY, angle * bound.weight);
      continue;
    }

    if (bound.kind === 'leg') {
      rotate(
        vertex,
        bound,
        bound.pivotX,
        bound.pivotY,
        (legAngles[bound.leg] ?? 0) * bound.weight,
        // Нога на махе поднимается: без этого все четыре копыта скребут
        // землю и диплодок едет, а не идёт.
        (legLifts[bound.leg] ?? 0) * bound.liftWeight,
      );
      continue;
    }

    const sample = bound.t * SAMPLES;
    const low = Math.min(SAMPLES - 1, Math.floor(sample));
    const frac = sample - low;
    const baseX = curveX[low] + (curveX[low + 1] - curveX[low]) * frac;
    const baseY = curveY[low] + (curveY[low + 1] - curveY[low]) * frac;
    const nx = normalX[low] + (normalX[low + 1] - normalX[low]) * frac;
    const ny = normalY[low] + (normalY[low + 1] - normalY[low]) * frac;

    setVertex(
      vertex,
      baseX + nx * bound.side + (tailX / tailLen) * bound.beyond,
      baseY + ny * bound.side + (tailY / tailLen) * bound.beyond,
    );
  }

  return Math.atan2(tailY, tailX) - REST_ANGLE;
}

/**
 * Повернуть вершину вокруг точки на столько-то градусов и, если надо,
 * приподнять её на rise пикселей рисунка.
 *
 * Считаем от исходного места вершины, а не от текущего: иначе поворот
 * копится за кадры и лапа сминается в комок за полсекунды.
 */
function rotate(
  vertex: Phaser.Geom.Mesh.Vertex,
  rest: { restX: number; restY: number },
  pivotX: number,
  pivotY: number,
  degrees: number,
  rise = 0,
): void {
  const angle = Phaser.Math.DegToRad(degrees);
  const dx = rest.restX - pivotX;
  const dy = rest.restY - pivotY;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  setVertex(vertex, pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos - rise);
}

/** Положить вершину по координатам рисунка. */
function setVertex(vertex: Phaser.Geom.Mesh.Vertex, px: number, py: number): void {
  vertex.x = (px - DINO_MESH.imageWidth / 2) / DINO_MESH.imageHeight;
  vertex.y = (DINO_MESH.imageHeight / 2 - py) / DINO_MESH.imageHeight;
}

/** Смещение точки рисунка от основания головы, в пикселях рига. */
function fromHeadRest(imageX: number, imageY: number): { x: number; y: number } {
  return {
    x: (imageX - HEAD_REST.x) * DINO_MESH.scale,
    y: (imageY - HEAD_REST.y) * DINO_MESH.scale,
  };
}

/** Где на голове глаз и рот: глаз моргает, ко рту едет листик. */
export const HEAD_EYE = fromHeadRest(DINO_MESH.eyeX, DINO_MESH.eyeY);
export const HEAD_MOUTH = fromHeadRest(DINO_MESH.mouthX, DINO_MESH.mouthY);
