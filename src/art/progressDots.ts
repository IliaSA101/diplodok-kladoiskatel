/**
 * Ряд точек «сколько уже сделано» — один на все задачки и все игры.
 *
 * Точка загорается золотом, когда шаг пройден: это тот же язык, что звёзды в
 * альбоме и золотые узлы на карте. Раньше ряд рисовали пять разных экранов, и
 * они разошлись: где-то точки загорались, а рядом стояла цифра, которая
 * убывала. Ребёнок видел «осталось» и «найдено» одинакового вида в сантиметре
 * друг от друга. Поэтому фабрика одна, и тест стережёт, что своих рядов нет.
 *
 * Сколько точек влезает в ряд и где этот ряд лежит — считает art/layout.ts.
 */
// Только типы: значений Phaser тут нет, и поэтому фабрику проверяет тест
// с поддельной сценой. Как только появится Phaser.Geom или Phaser.Math,
// импорт обязан стать обычным — иначе в браузере будет «Phaser is not defined».
import type Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { dotRows } from './layout';
import { PALETTE } from './palette';

export interface ProgressDots {
  /** Сами кружки, слева направо и сверху вниз. */
  readonly dots: readonly Phaser.GameObjects.Arc[];
  /** Зажечь точку с этим номером. */
  fill(index: number): void;
}

export interface ProgressDotsOptions {
  count: number;
  /** Середина ряда по вертикали. */
  y: number;
  /** Прижать ряд правым краем сюда. Без этого ряд центруется по centerX. */
  rightX?: number;
  centerX?: number;
  step?: number;
  radius?: number;
  depth?: number;
  /** Больше этого числа точек в ряд не ставим — остальные уходят вниз. */
  maxPerRow?: number;
  rowStep?: number;
}

const STEP = 60;
const RADIUS = 16;
const DEPTH = 2;
const STROKE = 4;

/**
 * Поставить ряд точек и вернуть ручку, которой их зажигают.
 *
 * Когда точек на ряд не хватает, они сворачиваются в два ряда и мельчают:
 * двадцать пар третьего круга иначе выстраивались в линию через весь верх.
 */
export function createProgressDots(
  scene: Phaser.Scene,
  options: ProgressDotsOptions,
): ProgressDots {
  const step = options.step ?? STEP;
  const { perRow, rows } = dotRows(options.count, options.maxPerRow ?? options.count);
  // Два ряда занимают вдвое больше места по высоте, поэтому точки мельче.
  const radius = (options.radius ?? RADIUS) * (rows > 1 ? 0.8 : 1);
  const rowStep = options.rowStep ?? step;
  const firstY = options.y - ((rows - 1) * rowStep) / 2;
  const centerX = options.centerX ?? GAME_WIDTH / 2;

  const dots: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < options.count; i += 1) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, options.count - row * perRow);
    const x =
      options.rightX === undefined
        ? centerX + (col - (inRow - 1) / 2) * step
        : options.rightX - (inRow - 1 - col) * step;
    dots.push(
      scene.add
        .circle(x, firstY + row * rowStep, radius, PALETTE.uiPanelShadow)
        .setStrokeStyle(STROKE, PALETTE.uiText)
        .setDepth(options.depth ?? DEPTH),
    );
  }

  return {
    dots,
    fill(index: number): void {
      const dot = dots[index];
      if (dot === undefined) return;
      dot.setFillStyle(PALETTE.gold);
      scene.tweens.add({
        targets: dot,
        scale: { from: 1.7, to: 1 },
        duration: 380,
        ease: 'Back.easeOut',
      });
    },
  };
}
