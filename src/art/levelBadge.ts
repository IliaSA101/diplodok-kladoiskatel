/**
 * Круглый значок с цифрой леса: общий для меню, выбора леса, победы и коллекции,
 * чтобы номер леса везде выглядел одинаково.
 */
import Phaser from 'phaser';
import { PALETTE } from './palette';
import { createText } from './ui';

export type BadgeTone = 'gold' | 'warm' | 'calm';

const TONES: Record<BadgeTone, { main: number; dark: number }> = {
  gold: { main: PALETTE.gold, dark: PALETTE.goldDark },
  warm: { main: PALETTE.uiButton, dark: PALETTE.uiButtonDark },
  calm: { main: PALETTE.uiButtonCalm, dark: PALETTE.uiButtonCalmDark },
};

export interface LevelBadge {
  /** Внешний контейнер в нужной точке — его двигают и делают интерактивным. */
  readonly container: Phaser.GameObjects.Container;
  /** «Тело» значка — его масштабируют твинами, чтобы зона касания не дрожала. */
  readonly body: Phaser.GameObjects.Container;
}

/**
 * Кружок с цифрой. Размер шрифта по умолчанию подбирается по радиусу,
 * а для двузначных и трёхзначных номеров (бесконечные леса) уменьшается.
 */
export function createLevelBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  level: number,
  radius: number,
  tone: BadgeTone,
  fontSize: number = Math.round(radius * 0.96),
): LevelBadge {
  const colors = TONES[tone];
  const label = String(level);
  const size = Math.round(fontSize * (label.length >= 3 ? 0.6 : label.length === 2 ? 0.78 : 1));

  const shadow = scene.add.circle(0, radius * 0.1, radius, colors.dark);
  const main = scene.add.circle(0, 0, radius, colors.main);
  main.setStrokeStyle(Math.max(3, Math.round(radius * 0.06)), colors.dark);
  const shine = scene.add.ellipse(0, -radius * 0.52, radius * 1.15, radius * 0.5, 0xffffff, 0.3);
  const text = createText(scene, 0, radius * 0.03, label, size);

  const body = scene.add.container(0, 0, [shadow, main, shine, text]);
  const container = scene.add.container(x, y, [body]);
  return { container, body };
}
