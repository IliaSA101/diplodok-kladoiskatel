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
 *
 * Phaser здесь нет: сетку модуль знает только как список вершин с x и y, и
 * поэтому глаз, едущий отдельной картинкой, проверяется тестом в node
 * (`tests/dinoLayout.test.ts`). Сама сетка заводится в `entities/dinoParts.ts`.
 *
 * Лапы и хвост делятся по граням, а не по вершинам. Phaser.Plane хранит
 * вершины тройками (клетка — шесть вершин: a, b, d и b, c, d), у каждой грани
 * свои, и грань целиком принадлежит тому, чья на ней краска (`faceOwners`,
 * считает tools/dino_owners.py). Делить по вершинам нельзя: линия класса идёт
 * по сетке, а не по рисунку, и там, где она режет лапу или просвет между
 * ногами, две вершины одной грани уходили разным хозяевам — обводка рвалась.
 */
import { DINO_MESH } from './dinoArtMeta';
import { rootAngle, rootBound, rootControls, type RootBound } from './dinoNeckRoot';

/** Всё, что нужно изгибу от сетки: вершины в её собственных единицах. */
export interface WarpVertex {
  x: number;
  y: number;
}
export interface WarpMesh {
  vertices: readonly WarpVertex[];
}

/** Клеток по ширине и высоте. По длине шеи их нужно больше, чем поперёк. */
export const MESH_COLS = 24;
export const MESH_ROWS = 44;
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
/** Допуск у линии плеча, px рисунка. */
const SHOULDER_SLACK = 0.3;
/**
 * Докуда вбок от оси лапы берутся её вершины, долей ширины лапы. Края лапы
 * лежат на 0.5, и ещё на 0.17 (около 10 px) сетка должна достать: грань, в
 * которой лежит край лапы, целиком ходит с ногой, иначе её левая обводка
 * растягивается между вершиной лапы и вершиной тела. Эти числа подбирались на
 * сетке, чьи вершины лежали на 7 % ближе к середине, и после того как x стали
 * делить на ширину, а не на высоту, их пришлось вернуть на рисунок заново.
 */
const LEG_REACH = 0.67;
/** На этой высоте ниже живота поворот лапы набирает полную силу, px рисунка. */
const LEG_FADE = 34;
/**
 * То же для вершин за полушириной лапы (в просвете у брюха): соседние лапы
 * крутятся вокруг разных бёдер на один угол, и вершина, которую делят две
 * грани, расходится на 30 px рисунка. Медленнее набираем — меньше разводим.
 * Больше 60 хуже: на 90 в радости 143 плохих грани.
 */
const LEG_GAP_FADE = 60;
/** А подъём — на этой: короткая тянущаяся перемычка прячется в брюхе. */
const LIFT_FADE = 12;
/** Ширина клетки сетки, px рисунка: вершины стоят не чаще. */
const CELL_X = DINO_MESH.imageWidth / MESH_COLS;
const CELL_Y = DINO_MESH.imageHeight / MESH_ROWS;
/**
 * Левее этого x вершины — хвост. Границей служит не сама точка выхода хвоста
 * (tailBaseX — левый край задней лапы), а клетка левее неё: вершина в трёх
 * пикселях от края лапы принадлежит лапе, иначе грань с краем лапы рвётся.
 */
const TAIL_EDGE_X = DINO_MESH.tailBaseX - CELL_X;
/**
 * Правее этого x под копытами хвоста уже нет: его кончик ложится под первые
 * две лапы. Вершина ниже копыта у задней дальней и передней лап — продолжение
 * ноги, а хвостовая рвала грань между копытом и хвостом.
 */
const TAIL_END_X = (DINO_MESH.legs[1]?.x ?? 0) + (DINO_MESH.legs[1]?.width ?? 0) / 2 + CELL_X;
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
  /**
   * Высота оси поворота на спине. Хвост выходит из крупа не точкой, а всей
   * его высотой: вершины высоко на спине, вращаясь вокруг одной точки у
   * основания, уезжали на 40 px от неподвижного тела рядом.
   */
  pivotY: number;
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
  /** Вершина за полушириной лапы (у просвета): вес набирается за LEG_GAP_FADE, а не LEG_FADE. */
  gap: boolean;
  /** То же для подъёма, но набирается круто: нога должна подниматься целиком,
   *  а не складываться телескопом — иначе копыто смазывается в кляксу. */
  liftWeight: number;
}

type Bound = NeckBound | LegBound | TailBound | RootBound;

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
/**
 * С какого места вдоль шеи вершина берётся с запасом головы, px рисунка.
 *
 * Строка вершин сразу под основанием головы — нижний край граней головы. Она
 * ложилась по ту или другую сторону границы из-за доли пикселя (ось шеи
 * наклонена на 1.5°), и тогда голова едет, а нижняя вершина её грани стоит:
 * на копании грань растягивалась в 33 раза, и от плеча вверх вставала тёмная
 * игла обводки челюсти. Поэтому голова начинается на полстроки раньше.
 */
const HEAD_EDGE = REST_LENGTH - CELL_Y / 2;
/** Половина толщины шеи в пикселях рисунка. */
const HALF_THICKNESS = DINO_MESH.neckThickness / DINO_MESH.scale / 2;

/** Где сетка стоит в риге в покое: низ рисунка на земле, плечо в плече рига. */
export function meshRestPosition(): { x: number; y: number } {
  return {
    x: (DINO_MESH.imageWidth / 2 - DINO_MESH.shoulderImageX) * DINO_MESH.scale + DINO_MESH.shoulderX,
    y: (DINO_MESH.imageHeight / 2 - DINO_MESH.imageHeight) * DINO_MESH.scale,
  };
}

/** Угол в границах от −π до π. */
function wrapAngle(angle: number): number {
  const range = Math.PI * 2;
  return -Math.PI + ((((angle + Math.PI) % range) + range) % range);
}

/** Чья грань по символу из `faceOwners`: 'tail', номер лапы или никто. */
type FaceOwner = 'tail' | number | null;

/**
 * Хозяин каждой вершины по её грани. Грань — тройка подряд, а раскладка
 * Phaser.Plane одна: клетка (по строкам слева направо) даёт две грани подряд,
 * a-b-d и b-c-d. Номер грани — это клетка и сторона; по положению вершин её
 * искать нельзя, потому что вершины сдвинуты с линий сетки (`vertexShifts`).
 * Раскладку сверяет тест на настоящем GenerateGridVerts.
 */
function faceOwnersOf(vertices: readonly WarpVertex[]): FaceOwner[] {
  const owners: FaceOwner[] = new Array<FaceOwner>(vertices.length).fill(null);
  for (let first = 0; first + 2 < vertices.length; first += 3) {
    const face = first / 3;
    const cell = Math.floor(face / 2);
    const row = Math.floor(cell / MESH_COLS);
    const symbol = DINO_MESH.faceOwners[row - DINO_MESH.faceOwnersRow]?.charAt((cell % MESH_COLS) * 2 + (face % 2));
    const owner: FaceOwner = symbol === 't' ? 'tail' : symbol !== undefined && symbol >= '0' && symbol <= '3' ? Number(symbol) : null;
    for (let k = 0; k < 3; k += 1) owners[first + k] = owner;
  }
  return owners;
}

/**
 * Увести вершины с краски в просвет (`vertexShifts`) вместе с их UV, один раз
 * на свежей сетке и до `prepareWarp`. У каждой грани свои копии вершины, и там,
 * где сходятся грани разных хозяев, копии едут в разные стороны: на краске это
 * трещина до 85 px. В просвете трещина никого не режет, а рисунок в покое тот
 * же — текстура едет с вершиной. `moveUV` получает сдвиг в долях рисунка и
 * кладёт его в u и v; как — знает Phaser (`Vertex.setUVs`), не этот модуль.
 */
export function shiftRestVertices<V extends WarpVertex>(
  vertices: readonly V[],
  moveUV: (vertex: V, du: number, dv: number) => void,
): void {
  const shifts = new Map<string, readonly [number, number]>();
  for (const [ix, iy, dx, dy] of DINO_MESH.vertexShifts) shifts.set(`${ix},${iy}`, [dx, dy]);
  for (const vertex of vertices) {
    const ix = Math.round((vertex.x + 0.5) * MESH_COLS);
    const iy = Math.round((0.5 - vertex.y) * MESH_ROWS);
    const shift = shifts.get(`${ix},${iy}`);
    if (shift === undefined) continue;
    vertex.x += shift[0] / DINO_MESH.imageWidth;
    vertex.y -= shift[1] / DINO_MESH.imageHeight;
    moveUV(vertex, shift[0] / DINO_MESH.imageWidth, shift[1] / DINO_MESH.imageHeight);
  }
}

/** Вершина хвоста в этой точке рисунка: ось поворота — на крупе, на высоте вершины. */
function tailBound(px: number, py: number): TailBound {
  const pivotY = Math.min(DINO_MESH.tailBaseY, Math.max(DINO_MESH.croupTopY, py));
  const reach = Math.hypot(px - DINO_MESH.tailBaseX, py - pivotY);
  return { kind: 'tail', restX: px, restY: py, pivotY, weight: Math.min(1, reach / TAIL_FADE) };
}

/**
 * Вершина лапы с этим номером: крутится вокруг своего бедра. Удержание копыта
 * пробовали — нога от него ломалась в голени, стало хуже прежнего. Поворот
 * простой: вся нога вокруг бедра.
 */
function legBound(legIndex: number, px: number, py: number): LegBound | null {
  const leg = DINO_MESH.legs[legIndex];
  if (leg === undefined) return null;
  const below = Math.max(0, py - DINO_MESH.bellyY);
  const inGap = Math.abs(px - leg.x) / leg.width > 0.5;
  return {
    kind: 'leg',
    leg: legIndex,
    pivotX: leg.x,
    pivotY: DINO_MESH.bellyY,
    restX: px,
    restY: py,
    weight: Math.min(1, below / (inGap ? LEG_GAP_FADE : LEG_FADE)),
    gap: inGap,
    liftWeight: Math.min(1, below / LIFT_FADE),
  };
}

/** Номер лапы, в чью полосу попала вершина, а если ни в чью — -1. */
function nearestLeg(px: number): number {
  let best = -1;
  let bestDistance = LEG_REACH;
  for (let i = 0; i < DINO_MESH.legs.length; i += 1) {
    const leg = DINO_MESH.legs[i];
    if (leg === undefined) continue;
    const distance = Math.abs(px - leg.x) / leg.width;
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Разложить вершины по шее один раз: их место на рисунке больше не меняется,
 * а значит и доля вдоль шеи со смещением вбок считаются заранее.
 */
export function prepareWarp(plane: WarpMesh): (Bound | null)[] {
  const dirX = REST_DX / REST_LENGTH;
  const dirY = REST_DY / REST_LENGTH;

  const owners = faceOwnersOf(plane.vertices);
  return plane.vertices.map((vertex, index) => {
    const px = vertex.x * DINO_MESH.imageWidth + DINO_MESH.imageWidth / 2;
    const py = DINO_MESH.imageHeight / 2 - vertex.y * DINO_MESH.imageHeight;

    // Грань с краской ниже живота целиком идёт хозяину по рисунку.
    const owner = owners[index];
    if (owner === 'tail') return tailBound(px, py);
    if (typeof owner === 'number') return legBound(owner, px, py);

    // Хвост — крюк: от крупа влево и вниз, а кончиком обратно вправо под
    // брюхо, ниже копыт. Поэтому он и левее задней лапы, и ниже лап; по
    // одному «левее» кончик оставался на месте и рисунок рвался у задней лапы.
    if (px < TAIL_EDGE_X || (py > DINO_MESH.tailFloorY && px < TAIL_END_X)) {
      return tailBound(px, py);
    }

    // Ниже живота — лапы: каждая крутится вокруг своего бедра. Вершина идёт к
    // той лапе, к чьей оси она ближе (в долях ширины): между двумя лапами
    // «первая подошедшая» отдавала её не той, и грань рвалась между ногами.
    if (py >= DINO_MESH.bellyY) {
      return legBound(nearestLeg(px), px, py);
    }

    const along = (px - SHOULDER.x) * dirX + (py - SHOULDER.y) * dirY;
    // Ниже плеча — тело: оно стоит, иначе поплывёт спина, и лишь у самого плеча
    // поворачивается вместе с основанием шеи (`dinoNeckRoot.ts`). Строка
    // вершин лежит в 0.9 px над плечом, и без допуска наклон оси шеи решал,
    // какая из соседних вершин строки поедет, а какая останется: грань между
    // ними рвалась на копании.
    if (along < SHOULDER_SLACK) return rootBound(px, py, SHOULDER, vertex);
    const side = (px - SHOULDER.x) * -dirY + (py - SHOULDER.y) * dirX;
    const beyond = Math.max(0, along - REST_LENGTH);
    const reach = (along >= HEAD_EDGE ? HEAD_REACH : NECK_REACH) * HALF_THICKNESS;
    if (Math.abs(side) > reach) return rootBound(px, py, SHOULDER, vertex);
    return { kind: 'neck' as const, t: Math.min(1, along / REST_LENGTH), side, beyond };
  });
}

/**
 * Пересчитать таблицу кривой под новое положение головы. Возвращает поворот
 * основания шеи со знаком (радианы): 0 — кривая прежняя, квадратичная.
 */
function sampleCurve(headX: number, headY: number, rootGain: number): number {
  const head = toImage(headX, headY);
  const dx = head.x - SHOULDER.x;
  const dy = head.y - SHOULDER.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  // Контрольная точка — середина хорды, отведённая вбок тем сильнее, чем
  // дальше голова ушла от покоя. В покое отвод нулевой.
  const turn = wrapAngle(Math.atan2(dy, dx) - REST_ANGLE);
  const bow = turn * length * BOW;
  const midX = SHOULDER.x + dx * 0.5 - (dy / length) * bow;
  const midY = SHOULDER.y + dy * 0.5 + (dx / length) * bow;

  const tangent = wrapAngle(Math.atan2(midY - SHOULDER.y, midX - SHOULDER.x) - REST_ANGLE);
  const root = rootAngle(turn, tangent, rootGain);
  const mid = { x: midX, y: midY };
  const cubic = root.phi === 0 ? null : rootControls(SHOULDER, mid, head, REST_ANGLE, root.start);

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const inv = 1 - t;
    if (cubic !== null) {
      curveX[i] = inv * inv * inv * SHOULDER.x + 3 * inv * inv * t * cubic.c1x + 3 * inv * t * t * cubic.c2x + t * t * t * head.x;
      curveY[i] = inv * inv * inv * SHOULDER.y + 3 * inv * inv * t * cubic.c1y + 3 * inv * t * t * cubic.c2y + t * t * t * head.y;
      continue;
    }
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
  return root.phi;
}

/**
 * Положить шею и голову на кривую, поднять и повернуть лапы вокруг бёдер,
 * а хвост качнуть волной: tailAngle — угол сейчас, tailLag — он же
 * несколько кадров назад, им и ведётся кончик.
 *
 * rootGain — вес поворота основания шеи: 1 в обычных позах, 0 на копании
 * (голова там проходит у самого плеча, и поворот только сломал бы шею).
 *
 * Возвращает, на сколько повернулась голова: по этому углу едут глаз и
 * листик, нарисованные отдельно от сетки.
 */
export function applyWarp(
  plane: WarpMesh,
  bounds: (Bound | null)[],
  headX: number,
  headY: number,
  legAngles: readonly number[],
  legLifts: readonly number[],
  tailAngle: number,
  tailLag: number,
  rootGain = 1,
): number {
  const rootPhi = sampleCurve(headX, headY, rootGain);
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
      rotate(vertex, bound, DINO_MESH.tailBaseX, bound.pivotY, angle * bound.weight);
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

    if (bound.kind === 'root') {
      // Без поворота вершина возвращается туда, где её поставил Phaser: сетка одна на все кадры.
      if (rootPhi === 0) setUnit(vertex, bound.unitX, bound.unitY);
      else rotate(vertex, bound, SHOULDER.x, SHOULDER.y, ((rootPhi * 180) / Math.PI) * bound.weight);
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
  vertex: WarpVertex,
  rest: { restX: number; restY: number },
  pivotX: number,
  pivotY: number,
  degrees: number,
  rise = 0,
): void {
  const angle = (degrees * Math.PI) / 180;
  const dx = rest.restX - pivotX;
  const dy = rest.restY - pivotY;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  setVertex(vertex, pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos - rise);
}

/**
 * Положить вершину по координатам рисунка.
 *
 * Сетка — единичный квадрат: Phaser растягивает его на рисунок, по ширине на
 * `imageWidth`, по высоте на `imageHeight`. Делить x на высоту нельзя: рисунок
 * шире, чем выше (640×597), и согнутая голова уезжала вбок на 7 % от своего
 * расстояния до середины — глаз, едущий отдельной картинкой, отставал от неё.
 */
function setVertex(vertex: WarpVertex, px: number, py: number): void {
  vertex.x = (px - DINO_MESH.imageWidth / 2) / DINO_MESH.imageWidth;
  vertex.y = (DINO_MESH.imageHeight / 2 - py) / DINO_MESH.imageHeight;
}

/** Вернуть вершину в единицы сетки как есть. */
function setUnit(vertex: WarpVertex, x: number, y: number): void {
  vertex.x = x;
  vertex.y = y;
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
