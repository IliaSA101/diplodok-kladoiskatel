/**
 * Погода над лесом: листопад и ночная вуаль.
 *
 * И то, и другое висит на экране, а не в мире, и только поэтому живёт выше
 * любого дерева: декор леса получает depth по мировому y (до 2160).
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { THEMES } from '../art/themes';
import type { ThemeId } from '../data/levels';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Ночь ниже интерфейса (100000), но выше листопада и всего леса. */
const NIGHT_DEPTH = 90000;
const WEATHER_DEPTH = 80000;

/** Редкие листья, падающие через весь экран. */
export function addFallingLeaves(scene: Phaser.Scene): void {
  for (const texture of TEX.FALLING_LEAF) {
    const leaves = scene.add.particles(0, -40, texture, {
      x: { min: 0, max: GAME_WIDTH },
      speedY: { min: 26, max: 58 },
      speedX: { min: -24, max: 24 },
      rotate: { min: -180, max: 180 },
      lifespan: 14000,
      scale: { min: 0.7, max: 1.1 },
      alpha: { min: 0.75, max: 1 },
      frequency: 900,
      quantity: 1,
    });
    leaves.setScrollFactor(0).setDepth(WEATHER_DEPTH);
  }
}

/** Ночь — мягкая синяя вуаль поверх мира; интерфейс остаётся ярким. */
export function addNightVeil(scene: Phaser.Scene, theme: ThemeId): void {
  const ambient = THEMES[theme].ambient;
  if (ambient === null) return;
  scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, ambient.color, ambient.alpha)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(NIGHT_DEPTH);
}
