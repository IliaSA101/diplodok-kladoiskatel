/**
 * Основание шеи: тело у плеча поворачивается вместе со шеей (И13-3).
 *
 * Когда голова уходит вниз и вперёд, шея у плеча круто сгибается, а тело рядом
 * с ней оставалось на месте: ступенька у плеча, белый срез и зеркальная краска.
 * Теперь вершины тела вокруг плеча поворачиваются вокруг него на тот же угол,
 * что и начало шеи, и тем слабее, чем дальше от оси шеи. Цена — холка встаёт
 * горбом (решение владельца 06.11): зато шея идёт от неё плавной аркой.
 *
 * Без Phaser и без сетки: модуль считает числа, а вершины двигает `dinoWarp.ts`.
 * Шаг, радость и «к кроне» сюда не попадают: хорда плечо → голова там не уходит
 * дальше `ROOT_START`, угол нулевой и кривая остаётся прежней квадратичной.
 */

/** Ближе этого к плечу (px рисунка) вершина тела поворачивается целиком. */
export const ROOT_NEAR = 30;
/** Дальше этого от плеча тело не поворачивается вовсе. */
export const ROOT_FAR = 220;
/** С какого поворота хорды плечо → голова основание начинает гнуться. */
export const ROOT_START = (30 * Math.PI) / 180;
/** За сколько поворота сверх старта угол набирает полную силу. */
export const ROOT_BLEND = (30 * Math.PI) / 180;
/** Какую долю поворота сверх старта берёт основание. */
export const ROOT_GAIN_K = 0.88;
/** Потолок поворота основания: дальше голова ушла бы вверх ногами. */
export const ROOT_MAX = (120 * Math.PI) / 180;
/** Длина первой ручки кубической кривой от длины ручки квадратичной. */
export const ROOT_ARM = 0.65;
/**
 * Длина второй ручки у головы от ручки квадратичной. Направление то же, поэтому
 * конечная касательная не меняется; короче 1 — потому что при 1 под челюстью
 * грани портились (толчок 104 плохих против 96, высокий нырок 108 против 44).
 */
export const ROOT_END_ARM = 0.7;

/** Вершина тела у плеча: крутится вокруг него, а в покое стоит там, где её поставил Phaser. */
export interface RootBound {
  kind: 'root';
  /** Исходное место вершины, px рисунка: поворот считается от него, иначе копится. */
  restX: number;
  restY: number;
  /** Она же в единицах сетки: при нулевом угле вершина возвращается точно, без округления. */
  unitX: number;
  unitY: number;
  /** 1 у плеча, 0 на ROOT_FAR. */
  weight: number;
}

const smooth = (v: number): number => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * (3 - 2 * u);
};

/** Вершина тела в этой точке рисунка: берётся ли она под поворот и с каким весом. */
export function rootBound(
  px: number,
  py: number,
  shoulder: { x: number; y: number },
  unit: { x: number; y: number },
): RootBound | null {
  const distance = Math.hypot(px - shoulder.x, py - shoulder.y);
  if (distance >= ROOT_FAR) return null;
  const weight = 1 - smooth((distance - ROOT_NEAR) / (ROOT_FAR - ROOT_NEAR));
  if (weight <= 0) return null;
  return { kind: 'root', restX: px, restY: py, unitX: unit.x, unitY: unit.y, weight };
}

/**
 * Поворот основания φ и угол, под которым шея уходит от плеча, оба со знаком
 * (по стороне поворота хорды), радианы от оси шеи в покое.
 *
 * Ведёт φ угол хорды плечо → голова (`turn`), а не касательная квадратичной у
 * плеча (`tangent`): та прыгала по кадрам на 37 → 149 → 200°. `gain` 0 выключает
 * основание (копание: голова проходит в 18 px от плеча, и шея там складывается
 * в ноль при любой модели), 1 включает; между — плавно.
 */
export function rootAngle(turn: number, tangent: number, gain: number): { phi: number; start: number } {
  const side = turn < 0 ? -1 : 1;
  const over = Math.abs(turn) - ROOT_START;
  const blend = smooth(over / ROOT_BLEND) * gain;
  if (blend <= 0) return { phi: 0, start: tangent };
  const natural = tangent * side;
  const target = Math.min(ROOT_MAX, ROOT_GAIN_K * over);
  const start = Math.abs(natural + (target - natural) * blend);
  return { phi: side * blend * start, start: side * start };
}

/**
 * Две ручки кубической кривой от плеча к голове. Первая смотрит под `start`
 * и короче ручки квадратичной; вторая лежит на той же прямой от головы, что
 * и у квадратичной, поэтому конечная касательная, а с ней поворот головы и
 * глаза, остаются как были.
 * Плечо — ось поворота основания, так что начало кривой не сдвигается.
 */
export function rootControls(
  shoulder: { x: number; y: number },
  mid: { x: number; y: number },
  head: { x: number; y: number },
  restAngle: number,
  start: number,
): { c1x: number; c1y: number; c2x: number; c2y: number } {
  const arm = (2 / 3) * Math.hypot(mid.x - shoulder.x, mid.y - shoulder.y) * ROOT_ARM;
  return {
    c1x: shoulder.x + arm * Math.cos(restAngle + start),
    c1y: shoulder.y + arm * Math.sin(restAngle + start),
    c2x: head.x + (2 / 3) * (mid.x - head.x) * ROOT_END_ARM,
    c2y: head.y + (2 / 3) * (mid.y - head.y) * ROOT_END_ARM,
  };
}
