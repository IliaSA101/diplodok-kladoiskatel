/**
 * Картинка на кружке набора слов (003-2): рисует то, что назвал `setBadge`.
 *
 * Картинка — готовый арт слова, а у «Colours» — колесо из пятен тех же цветов,
 * что и в словах набора: один рисунок, а не пять точек.
 */
import Phaser from 'phaser';
import { setBadge, type EnglishSet } from '../data/english';
import { SET_PICKER } from './englishLayout';
import { PALETTE } from './palette';

/** Картинка или колесо для кружка радиуса `radius`; центр в (0, 0). */
export function createSetBadgeFigure(
  scene: Phaser.Scene,
  set: EnglishSet,
  radius: number,
): Phaser.GameObjects.GameObject {
  const side = radius * 2 * SET_PICKER.pictureShare;
  const badge = setBadge(set);
  if (badge.kind === 'picture') {
    const image = scene.add.image(0, 0, badge.key);
    image.setScale(side / Math.max(image.width, image.height, 1));
    return image;
  }
  // Колесо: сектора по кругу от верхней точки, у каждого тёмная обводка —
  // белый и чёрный сектора без неё слились бы с кружком и друг с другом.
  const g = scene.add.graphics();
  const wheel = side / 2;
  const step = (Math.PI * 2) / badge.colours.length;
  const start = -Math.PI / 2;
  badge.colours.forEach((colour, i) => {
    g.fillStyle(colour, 1);
    g.slice(0, 0, wheel, start + i * step, start + (i + 1) * step, false);
    g.fillPath();
  });
  g.lineStyle(3, PALETTE.uiText, 1);
  badge.colours.forEach((_, i) => {
    const a = start + i * step;
    g.lineBetween(0, 0, Math.cos(a) * wheel, Math.sin(a) * wheel);
  });
  g.strokeCircle(0, 0, wheel);
  return g;
}
