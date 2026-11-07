/**
 * Подготовка для `dinoWarp.test.ts`: сетка так, как её строит Phaser, позы
 * по твинам и меры грани. Отдельным файлом, чтобы тест остался читаемым и
 * влез в шестьсот строк.
 */
import { createRequire } from 'node:module';
import { DINO_MESH } from '../src/art/dinoArtMeta';
import { DIG, DIP, JOY, PUSH, REACH, WALK } from '../src/art/dinoPoses';
import { MESH_COLS, MESH_ROWS, shiftRestVertices, type WarpVertex } from '../src/art/dinoWarp';
import { readAlpha } from './pngAlpha';

export const W = DINO_MESH.imageWidth;
export const H = DINO_MESH.imageHeight;
export const COLS = MESH_COLS;
export const ROWS = MESH_ROWS;

/** Вершина Phaser: положение и текстурные координаты. */
export interface GridVertex extends WarpVertex {
  u: number;
  v: number;
}
interface GridResult {
  verts: GridVertex[];
}
type GenerateGridVerts = (config: object) => GridResult;

/**
 * Вершины ровно так, как их строит Phaser.Plane: сам `GenerateGridVerts` из
 * node_modules, а не наша копия его раскладки. Клетка — шесть вершин
 * (a, b, d и b, c, d), у каждой грани свои, грани — тройки подряд.
 */
export function plainGrid(): GridVertex[] {
  const generate = createRequire(import.meta.url)('phaser/src/geom/mesh/GenerateGridVerts.js') as GenerateGridVerts;
  const frame = { u0: 0, u1: 1, v0: 0, v1: 1, width: W, height: H };
  const result = generate({
    texture: { get: () => frame },
    widthSegments: COLS,
    heightSegments: ROWS,
    isOrtho: false,
  });
  return result.verts.map((vertex) => ({ x: vertex.x, y: vertex.y, u: vertex.u, v: vertex.v }));
}

/**
 * Сетка, какой её видит игра: вершины со сдвигами в просвет (`dinoParts.ts`
 * делает то же над вершинами Plane, а UV кладёт через `setUVs`).
 */
export function phaserGrid(): GridVertex[] {
  const grid = plainGrid();
  shiftRestVertices(grid, (vertex, du, dv) => {
    vertex.u += du;
    vertex.v += dv;
  });
  return grid;
}

/** Вершина сетки → пиксели рисунка. */
export function toPx(vertex: { x: number; y: number }): [number, number] {
  return [vertex.x * W + W / 2, H / 2 - vertex.y * H];
}

/** Альфа самого рисунка и порог краски (выше — краска). */
export const IMAGE = readAlpha('public/art/dino-whole.png');
export const PAINT = 40;

/** Вершины в покое, какими их строит игра (со сдвигами в просвет), px рисунка. */
export const REST = phaserGrid();
export const REST_PX = REST.map(toPx);
export const FACE_COUNT = REST.length / 3;

/** Три угла грани в покое, px рисунка. */
export function corners(face: number): [number, number][] {
  return [0, 1, 2].map((k) => REST_PX[face * 3 + k] ?? [0, 0]);
}

/** Индексы пикселей рисунка внутри грани в покое (по центрам пикселей). */
export function pixelsOf(face: number): number[] {
  const [[ax, ay], [bx, by], [cx, cy]] = corners(face) as [number[], number[], number[]] & [number, number][];
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  const out: number[] = [];
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const w1 = ((x + 0.5 - ax) * (cy - ay) - (cx - ax) * (y + 0.5 - ay)) / area;
      const w2 = ((bx - ax) * (y + 0.5 - ay) - (x + 0.5 - ax) * (by - ay)) / area;
      if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) out.push(y * W + x);
    }
  }
  return out;
}

/** Доля пикселей грани с краской. */
export function paintShare(): number[] {
  return Array.from({ length: FACE_COUNT }, (_, face) => {
    const pixels = pixelsOf(face);
    return pixels.filter((i) => (IMAGE.alpha[i] ?? 0) > PAINT).length / (pixels.length || 1);
  });
}

// --- позы ------------------------------------------------------------------

const sinOut = (v: number): number => Math.sin((v * Math.PI) / 2);
const sinIn = (v: number): number => 1 - Math.cos((v * Math.PI) / 2);
const sinInOut = (v: number): number => 0.5 * (1 - Math.cos(Math.PI * v));
const quadOut = (v: number): number => v * (2 - v);

type Ease = (v: number) => number;

/** От from к to за dur мс, начиная с t0; до начала стоит, после — на месте. */
function seg(t: number, t0: number, dur: number, from: number, to: number, ease: Ease): number {
  if (t <= t0) return from;
  if (t >= t0 + dur) return to;
  return from + (to - from) * ease((t - t0) / dur);
}

/** Твин с yoyo и паузой наверху: туда dur, держит hold, назад dur. */
function yoyo(t: number, from: number, to: number, dur: number, hold: number, ease: Ease): number {
  if (t <= 0) return from;
  if (t < dur) return from + (to - from) * ease(t / dur);
  if (t < dur + hold) return to;
  if (t < 2 * dur + hold) return from + (to - from) * ease(1 - (t - dur - hold) / dur);
  return from;
}

/** Бесконечный yoyo-цикл from → to → from. */
function loop(t: number, from: number, to: number, dur: number, ease: Ease): number {
  const k = Math.floor(t / dur);
  const v = (t - k * dur) / dur;
  return k % 2 === 0 ? from + (to - from) * ease(v) : to + (from - to) * ease(v);
}

interface State {
  head: [number, number];
  back: number;
  front: number;
  tail: number;
  /** Передняя ближняя лапа сама по себе (копание); нет — идёт вместе с передней парой. */
  paw?: number;
}

export interface Action {
  name: string;
  ms: number;
  walking?: boolean;
  /** Вес поворота основания шеи, как его ставит игра: 0 на копании (`playDigStroke`), иначе 1. */
  rootGain?: number;
  at(t: number): State;
}

const REST_X = DINO_MESH.headRestX;
const REST_Y = DINO_MESH.headRestY;

export const ACTIONS: Action[] = [
  {
    name: 'шаг',
    ms: WALK.stepMs * 6,
    walking: true,
    at(t) {
      const back = loop(t, WALK.legSwing, -WALK.legSwing, WALK.stepMs, sinInOut);
      return {
        head: [
          loop(t, REST_X, REST_X + WALK.swayX, WALK.stepMs * 2, sinInOut),
          loop(t, REST_Y, REST_Y - WALK.swayY, WALK.stepMs * 2, sinInOut),
        ],
        back,
        front: -back,
        tail: loop(t, -WALK.tailSwing, WALK.tailSwing, WALK.tailMs, sinInOut),
      };
    },
  },
  {
    name: 'радость',
    ms: JOY.ms,
    at(t) {
      const k = Math.min(2 * JOY.tailRepeat + 1, Math.floor(t / JOY.tailMs));
      const v = (t - k * JOY.tailMs) / JOY.tailMs;
      const swing = JOY.tailSwing;
      const tail = t >= JOY.tailMs * (2 * JOY.tailRepeat + 2) ? -swing : k % 2 === 0 ? -swing + 2 * swing * sinInOut(v) : swing - 2 * swing * sinInOut(v);
      return {
        head: [
          yoyo(t, REST_X, REST_X + JOY.headDx, JOY.headMs, JOY.headHold, sinOut),
          yoyo(t, REST_Y, REST_Y + JOY.headDy, JOY.headMs, JOY.headHold, sinOut),
        ],
        back: yoyo(t, 0, JOY.back, JOY.legsMs, JOY.legsHold, sinOut),
        front: yoyo(t, 0, JOY.front, JOY.legsMs, JOY.legsHold, sinOut),
        tail,
      };
    },
  },
  {
    name: 'копание',
    ms: DIG.ms,
    rootGain: 0,
    at(t) {
      return {
        head: [
          yoyo(t, REST_X, REST_X + DIG.headDx, DIG.headMs, DIG.headHold, sinIn),
          yoyo(t, REST_Y, DIG.headY, DIG.headMs, DIG.headHold, sinIn),
        ],
        back: 0,
        front: 0,
        tail: 0,
        // Лапа «гребёт»: задержка 110 мс, 130 мс вперёд, пауза 40 (`playDigStroke`).
        paw: yoyo(t - DIG.pawDelayMs, 0, DIG.paw, DIG.pawMs, DIG.pawHold, sinOut),
      };
    },
  },
  {
    name: 'толчок',
    ms: PUSH.downMs + PUSH.braceMs + PUSH.lungeMs + PUSH.backMs,
    at(t) {
      const lowX = DINO_MESH.shoulderX + PUSH.lowDx;
      const lowY = PUSH.lowY;
      const brace = PUSH.downMs;
      const lunge = brace + PUSH.braceMs;
      const back = lunge + PUSH.lungeMs;
      let x: number;
      let y: number;
      if (t < brace) {
        x = seg(t, 0, PUSH.downMs, REST_X, lowX, sinInOut);
        y = seg(t, 0, PUSH.downMs, REST_Y, lowY, sinInOut);
      } else if (t < lunge) {
        x = seg(t, brace, PUSH.braceMs, lowX, lowX + PUSH.braceDx, sinInOut);
        y = lowY;
      } else if (t < back) {
        x = seg(t, lunge, PUSH.lungeMs, lowX + PUSH.braceDx, lowX + PUSH.lungeDx, quadOut);
        y = seg(t, lunge, PUSH.lungeMs, lowY, lowY + PUSH.lungeDy, quadOut);
      } else {
        x = seg(t, back, PUSH.backMs, lowX + PUSH.lungeDx, REST_X, sinInOut);
        y = seg(t, back, PUSH.backMs, lowY + PUSH.lungeDy, REST_Y, sinInOut);
      }
      const frontLegs = t < back ? seg(t, 0, PUSH.downMs, 0, PUSH.front, sinOut) : seg(t, back, PUSH.backMs, PUSH.front, 0, sinInOut);
      const backLegs = t < back ? seg(t, brace, PUSH.braceMs, 0, PUSH.back, sinOut) : seg(t, back, PUSH.backMs, PUSH.back, 0, sinInOut);
      return { head: [x, y], back: backLegs, front: frontLegs, tail: 0 };
    },
  },
];

/** Нырок к воде с целью головы (x, y) в риге: цели разные, поэтому на выбор. */
export function dipAction(name: string, targetX: number, targetY: number): Action {
  const bobs = DIP.bobCycles * 2 * DIP.bobMs;
  return {
    name,
    ms: DIP.downMs + bobs + DIP.upMs,
    at(t) {
      const up = DIP.downMs + bobs;
      let x: number;
      let y: number;
      if (t < DIP.downMs) {
        x = seg(t, 0, DIP.downMs, REST_X, targetX, sinOut);
        y = seg(t, 0, DIP.downMs, REST_Y, targetY, sinIn);
      } else if (t < up) {
        const u = t - DIP.downMs;
        const k = Math.floor(u / DIP.bobMs);
        const v = (u - k * DIP.bobMs) / DIP.bobMs;
        const p = k % 2 === 0 ? sinInOut(v) : 1 - sinInOut(v);
        x = targetX + DIP.bobDx * p;
        y = targetY + DIP.bobDy * p;
      } else {
        x = seg(t, up, DIP.upMs, targetX, REST_X, sinIn);
        y = seg(t, up, DIP.upMs, targetY, REST_Y, sinOut);
      }
      const front = t < up ? seg(t, 0, DIP.downMs, 0, DIP.front, sinOut) : seg(t, up, DIP.upMs, DIP.front, 0, sinInOut);
      return { head: [x, y], back: 0, front, tail: 0 };
    },
  };
}

/** Шея к кроне с целью головы (x, y) в риге. */
export function reachAction(name: string, targetX: number, targetY: number): Action {
  return {
    name,
    ms: REACH.upMs + REACH.holdMs + REACH.backMs,
    at(t) {
      let x: number;
      let y: number;
      if (t < REACH.upMs) {
        x = seg(t, 0, REACH.upMs, REST_X, targetX, sinOut);
        y = seg(t, 0, REACH.upMs, REST_Y, targetY, sinOut);
      } else if (t < REACH.upMs + REACH.holdMs) {
        x = yoyo(t - REACH.upMs, targetX, targetX + REACH.bobDx, REACH.holdMs / 2, 0, sinInOut);
        y = targetY;
      } else {
        x = seg(t, REACH.upMs + REACH.holdMs, REACH.backMs, targetX, REST_X, sinInOut);
        y = seg(t, REACH.upMs + REACH.holdMs, REACH.backMs, targetY, REST_Y, sinInOut);
      }
      return { head: [x, y], back: 0, front: 0, tail: 0 };
    },
  };
}

export interface Frame {
  t: number;
  head: [number, number];
  legs: number[];
  lifts: number[];
  tail: number;
  lag: number;
  rootGain: number;
}

/**
 * Кадры действия через 1/60 с — ровно то, что `dinoRig.redrawNeck` отдаёт
 * `applyWarp`: подъём копыта на махе вперёд (`swingLift`) и хвост с отставанием
 * на `tailLagFrames` кадров (`rememberTail`).
 */
export function frames(action: Action): Frame[] {
  const out: Frame[] = [];
  const previous: (number | undefined)[] = [undefined, undefined];
  const history: (number | undefined)[] = new Array<number | undefined>(WALK.tailLagFrames).fill(undefined);
  let at = 0;
  for (let t = 0; t <= action.ms; t += 1000 / 60) {
    const state = action.at(t);
    const pair = [state.back, state.front];
    const lift = pair.map((angle, p) => {
      const before = previous[p] ?? angle;
      previous[p] = angle;
      if (action.walking !== true || angle >= before) return 0;
      const u = Math.max(-1, Math.min(1, angle / WALK.legSwing));
      return (1 - u * u) * WALK.legLift;
    });
    const oldest = history[at] ?? state.tail;
    history[at] = state.tail;
    at = (at + 1) % history.length;
    const order = [0, 1, 1, 0];
    const legs = order.map((w) => pair[w] ?? 0);
    // Как в `redrawNeck`: ближняя передняя лапа (индекс 2) берёт свой угол.
    legs[2] = state.paw ?? legs[2] ?? 0;
    out.push({
      t,
      head: state.head,
      legs,
      lifts: order.map((w) => lift[w] ?? 0),
      tail: state.tail,
      lag: oldest,
      rootGain: action.rootGain ?? 1,
    });
  }
  return out;
}

// --- меры грани -------------------------------------------------------------

export interface FaceMetric {
  face: number;
  /** Центр грани в покое, px рисунка. */
  cx: number;
  cy: number;
  /** Самое большое и самое малое растяжение якобиана; площадь со знаком. */
  s1: number;
  s2: number;
  det: number;
  /** Доля пикселей грани с краской (альфа > 40). */
  paint: number;
}

/** Растяжение и сжатие грани относительно покоя: сингулярные числа якобиана. */
export function jacobian(rest: number[][], now: number[][]): { s1: number; s2: number; det: number } {
  const [p0, p1, p2] = rest as [number[], number[], number[]];
  const [q0, q1, q2] = now as [number[], number[], number[]];
  const e = [p1[0] - p0[0], p2[0] - p0[0], p1[1] - p0[1], p2[1] - p0[1]];
  const g = [q1[0] - q0[0], q2[0] - q0[0], q1[1] - q0[1], q2[1] - q0[1]];
  const ed = e[0] * e[3] - e[1] * e[2];
  const inv = [e[3] / ed, -e[1] / ed, -e[2] / ed, e[0] / ed];
  const j = [
    g[0] * inv[0] + g[1] * inv[2],
    g[0] * inv[1] + g[1] * inv[3],
    g[2] * inv[0] + g[3] * inv[2],
    g[2] * inv[1] + g[3] * inv[3],
  ];
  const det = j[0] * j[3] - j[1] * j[2];
  const sum = j.reduce((a, b) => a + b * b, 0);
  const root = Math.sqrt(Math.max(0, sum * sum - 4 * det * det));
  return { s1: Math.sqrt((sum + root) / 2), s2: Math.sqrt(Math.max(0, (sum - root) / 2)), det };
}
