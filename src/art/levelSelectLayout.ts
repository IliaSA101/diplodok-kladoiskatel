/**
 * Раскладка «Выбери лес»: кружки, точки кладов под ними, линия травы.
 *
 * Числа жили в сцене, но диплодок на этом экране стоит в свободной полосе под
 * рядами точек, и тест должен знать, где эти ряды кончаются. Phaser тут нет.
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { dotRows, dotsPerRowLimit } from './layout';

/** Линия горизонта: выше — небо, ниже — трава (как в меню). */
export const LEVEL_HORIZON_Y = Math.round(GAME_HEIGHT * 0.72);

export const LEVEL_GRID = {
  columns: 4,
  /** Радиус кружка: диаметр 150px, с запасом под палец. */
  badgeRadius: 75,
  stepX: 230,
  rowStepY: 235,
  firstRowY: 205,
} as const;

/** Точки кладов под кружком. */
export const LEVEL_DOTS = {
  radius: 8,
  step: 24,
  rowStep: 22,
  gapBelowBadge: 26,
  /** Просвет между рядами точек соседних лесов. */
  rowGap: 22,
} as const;

/** Если кладов больше этого числа — точки идут в два ряда. */
export const LEVEL_DOTS_ONE_ROW_MAX = dotsPerRowLimit(
  LEVEL_GRID.stepX,
  LEVEL_DOTS.rowGap,
  LEVEL_DOTS.radius,
  LEVEL_DOTS.step,
);

/** Центр кружка леса n (с единицы). */
export function levelBadgeCentre(n: number): { x: number; y: number } {
  const col = (n - 1) % LEVEL_GRID.columns;
  const row = Math.floor((n - 1) / LEVEL_GRID.columns);
  return {
    x: GAME_WIDTH / 2 + (col - (LEVEL_GRID.columns - 1) / 2) * LEVEL_GRID.stepX,
    y: LEVEL_GRID.firstRowY + row * LEVEL_GRID.rowStepY,
  };
}

/** Где стоит первая точка кладов под кружком, считая от верха первой строки точек. */
export function levelDotsTop(n: number): number {
  return levelBadgeCentre(n).y + LEVEL_GRID.badgeRadius + LEVEL_DOTS.gapBelowBadge;
}

/** Низ последней строки точек под кружком леса с `total` кладами. */
export function levelDotsBottom(n: number, total: number): number {
  const { rows } = dotRows(total, LEVEL_DOTS_ONE_ROW_MAX);
  return levelDotsTop(n) + Math.max(0, rows - 1) * LEVEL_DOTS.rowStep + LEVEL_DOTS.radius;
}
