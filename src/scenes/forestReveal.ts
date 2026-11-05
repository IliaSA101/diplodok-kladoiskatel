/**
 * Находка крупно на весь экран — главное событие игры.
 *
 * Предмет выплывает в центре, покачивается столько, сколько велит
 * CONFIG.treasures.revealMs, и улетает в рюкзак. Ничего про лес, клады и
 * сохранение эта часть не знает: ей дают картинку, имя и точку рюкзака.
 */
import Phaser from 'phaser';
import { itemTexture, TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Выше интерфейса (100000) и ночной вуали: находку не перекрывает ничто. */
const REVEAL_DEPTH = 200000;

export interface RevealOptions {
  /** Какой предмет показываем: id из каталога находок. */
  itemId: string;
  /** Подпись под картинкой. */
  name: string;
  /** Предмет из секретного сундука — крупнее и ярче обычного. */
  secret: boolean;
  /** Куда предмет улетает в конце. */
  target: { x: number; y: number };
}

function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => scene.time.delayedCall(ms, resolve));
}

/** Показать находку и увести её в рюкзак. Возвращается, когда полёт закончен. */
export async function showFound(scene: Phaser.Scene, options: RevealOptions): Promise<void> {
  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2 - 40;
  const { secret } = options;

  const glow = scene.add
    .image(centerX, centerY, TEX.GLOW)
    .setScrollFactor(0)
    .setDepth(REVEAL_DEPTH - 1)
    .setTint(PALETTE.gold)
    .setAlpha(0);
  const picture = scene.add
    .image(centerX, centerY, itemTexture(options.itemId))
    .setScrollFactor(0)
    .setDepth(REVEAL_DEPTH)
    .setScale(0.2)
    .setAlpha(0);
  const label = createText(scene, centerX, centerY + 180, options.name, CONFIG.ui.fontSizeBig);
  label.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(REVEAL_DEPTH).setAlpha(0);

  scene.tweens.add({
    targets: glow,
    alpha: secret ? 0.7 : 0.5,
    scale: secret ? 3.4 : 2.6,
    duration: 500,
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: picture,
    scale: secret ? 1.3 : 1.05,
    alpha: 1,
    duration: 420,
    ease: 'Back.easeOut',
  });
  scene.tweens.add({ targets: label, alpha: 1, duration: 360, delay: 160 });
  const wobble = scene.tweens.add({
    targets: picture,
    angle: { from: -4, to: 4 },
    duration: 900,
    delay: 420,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  await wait(scene, CONFIG.treasures.revealMs);

  // ...и улетает в рюкзак.
  wobble.remove();
  scene.tweens.add({ targets: glow, alpha: 0, duration: 300, onComplete: () => glow.destroy() });
  scene.tweens.add({ targets: label, alpha: 0, duration: 260, onComplete: () => label.destroy() });
  await new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: picture,
      x: options.target.x,
      y: options.target.y,
      angle: 0,
      scale: 0.16,
      alpha: 0.85,
      duration: 620,
      ease: 'Cubic.easeIn',
      onComplete: () => resolve(),
    });
  });
  picture.destroy();
  audio.play('found');
}
