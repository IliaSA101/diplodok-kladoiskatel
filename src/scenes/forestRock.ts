/**
 * Камень, который толкнули: откатывается в сторону, поднимает пыль и больше не мешает ходить.
 */
import type Phaser from 'phaser';
import { TEX } from '../art/keys';
import type { ForestObject } from '../entities/ForestObject';

/** `away` — куда катится камень: 1 вправо, -1 влево. */
export function rollRockAway(scene: Phaser.Scene, rock: ForestObject, away: 1 | -1): void {
  // Камень больше не мешает ходить.
  if (rock.obstacle !== null) rock.obstacle.radius = 0;
  scene.tweens.add({
    targets: rock.image,
    x: rock.image.x + 110 * away,
    angle: 55 * away,
    duration: 620,
    ease: 'Cubic.easeOut',
  });
  const dust = scene.add.particles(rock.image.x, rock.image.y, TEX.DIRT_CHUNK, {
    speed: { min: 60, max: 170 },
    angle: { min: 200, max: 340 },
    gravityY: 700,
    lifespan: 600,
    scale: { start: 0.9, end: 0.4 },
    quantity: 8,
    emitting: false,
  });
  dust.setDepth(rock.image.y + 1);
  dust.explode(8);
  scene.time.delayedCall(800, () => dust.destroy());
}
