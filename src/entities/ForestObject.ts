/**
 * Декор леса: дерево, куст, камень, пенёк, цветок, травка.
 *
 * Физика нарочно простая: вместо Arcade-тел — круглые препятствия и
 * выталкивание диплодока из круга. Это дешевле, полностью предсказуемо
 * и даёт мягкое скольжение вдоль ствола вместо залипания.
 */
import type Phaser from 'phaser';
import type { DecorSpec } from '../systems/worldGen';

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
}

export interface ForestObject {
  image: Phaser.GameObjects.Image;
  spec: DecorSpec;
  obstacle: Obstacle | null;
}

export function createForestObject(scene: Phaser.Scene, spec: DecorSpec): ForestObject {
  const image = scene.add.image(spec.x, spec.y, spec.texture);
  image.setOrigin(0.5, 1).setScale(spec.scale);
  // Глубина по точке касания земли: что ниже на экране — то ближе к зрителю.
  image.setDepth(spec.y);

  const obstacle: Obstacle | null =
    spec.solid && spec.colliderRadius > 0
      ? // Центр круга чуть выше основания: перед стволом можно пройти вплотную.
        { x: spec.x, y: spec.y - spec.colliderRadius * 0.4, radius: spec.colliderRadius }
      : null;

  return { image, spec, obstacle };
}

/**
 * Выталкивает точку (x, y) с радиусом radius из всех препятствий.
 * Возвращает исправленные координаты.
 */
export function pushOutOfObstacles(
  x: number,
  y: number,
  radius: number,
  obstacles: readonly Obstacle[],
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  for (const obstacle of obstacles) {
    const dx = nx - obstacle.x;
    // Препятствия приплюснуты по вертикали: так ощущается «вид сверху-сбоку».
    const dy = (ny - obstacle.y) * 1.6;
    const minDistance = obstacle.radius + radius;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDistance || distance === 0) continue;
    const push = (minDistance - distance) / distance;
    nx += dx * push;
    ny += (dy * push) / 1.6;
  }
  return { x: nx, y: ny };
}
