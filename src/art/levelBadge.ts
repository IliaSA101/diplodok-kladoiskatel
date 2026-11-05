/**
 * Круглый значок с цифрой леса: общий для меню, выбора леса, победы и коллекции,
 * чтобы номер леса везде выглядел одинаково.
 */
import Phaser from 'phaser';
import { PALETTE } from './palette';
import { badgeLeafShape } from './badgeLeaf';
import type { LeafPoint } from './badgeLeaf';
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

/** Толстый отрезок с круглыми концами: у `lineBetween` концы рубленые. */
function capsule(
  g: Phaser.GameObjects.Graphics,
  from: LeafPoint,
  to: LeafPoint,
  width: number,
  color: number,
): void {
  g.fillStyle(color, 1);
  g.lineStyle(width, color, 1);
  g.lineBetween(from.x, from.y, to.x, to.y);
  g.fillCircle(from.x, from.y, width / 2);
  g.fillCircle(to.x, to.y, width / 2);
}

/**
 * Зелёный листок на кружке — украшение значка текущего леса в меню.
 *
 * Рисуется **под** кружком: черешок уходит под него, и наружу выходит одна
 * пластинка, как лист из-за яблока. Положи лист сверху — на оранжевой щеке
 * кружка останется лежать кусок черешка, и это выглядит наклейкой.
 */
export function addBadgeLeaf(scene: Phaser.Scene, badge: LevelBadge, radius: number): void {
  const leaf = badgeLeafShape(radius);
  const blade = leaf.blade.map((point) => ({ x: point.x, y: point.y }));
  const g = scene.add.graphics();

  capsule(g, leaf.stemFrom, leaf.stemTo, leaf.stemWidth + leaf.outline * 2, PALETTE.uiText);
  capsule(g, leaf.stemFrom, leaf.stemTo, leaf.stemWidth, PALETTE.leafDark);

  g.fillStyle(PALETTE.leafMid, 1);
  g.fillPoints(blade, true);
  g.lineStyle(leaf.outline, PALETTE.uiText, 1);
  g.strokePoints(blade, true);
  capsule(g, leaf.veinFrom, leaf.veinTo, leaf.outline, PALETTE.leafDark);

  badge.body.addAt(g, 0);
}
