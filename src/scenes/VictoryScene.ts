/**
 * Праздник после находки всех кладов: конфетти, танцующий диплодок,
 * все восемь находок в ряд и большая кнопка «Ещё лес!».
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX, itemTexture } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import type { RoundButton } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { Diplodocus } from '../entities/Diplodocus';
import { randomSeed } from '../systems/rng';
import { SCENE } from '../types';
import type { VictorySceneData } from '../types';

const HORIZON_Y = Math.round(GAME_HEIGHT * 0.72);
const ITEM_TEXTURE_SIZE = 256;
/** Размер значка находки в ряду. */
const ITEM_ICON_SIZE = 108;
const ITEM_STEP = 140;
const ITEMS_Y = 250;

export class VictoryScene extends Phaser.Scene {
  private itemIds: string[] = [];
  private dino: Diplodocus | null = null;
  private leaving = false;

  constructor() {
    super(SCENE.VICTORY);
  }

  init(data: VictorySceneData): void {
    this.itemIds = data.itemIds.slice();
    this.leaving = false;
  }

  create(): void {
    this.drawBackground();
    this.createConfetti();

    // Подложка под ряд находок, чтобы значки читались на фоне неба.
    createPanel(this, GAME_WIDTH / 2, ITEMS_Y, ITEM_STEP * 8 + 60, ITEM_ICON_SIZE + 70);
    this.createItemsRow();

    createText(this, GAME_WIDTH / 2, 88, 'Ура!', CONFIG.ui.fontSizeCounter);

    // Танцующий диплодок: радуется каждые ~1.1 с.
    const dino = new Diplodocus(this, GAME_WIDTH * 0.29, HORIZON_Y + 110, { scale: 1.4 });
    dino.showHint(false);
    this.dino = dino;
    dino.playJoy();
    this.time.addEvent({ delay: 1100, loop: true, callback: () => dino.playJoy() });

    // Кнопка «Ещё лес!» и подпись.
    const againX = GAME_WIDTH * 0.73;
    const againY = GAME_HEIGHT * 0.66;
    const againButton = createRoundButton(this, againX, againY, TEX.ICON_AGAIN, () => this.nextForest(), {
      radius: 110,
    });
    this.tweens.add({
      targets: againButton.container,
      scale: 1.05,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    createText(this, againX, againY + 110 + 46, 'Ещё лес!', CONFIG.ui.fontSizeBig);

    // Звуки: фанфары, потом несколько хлопушек (не бесконечно).
    audio.play('win');
    this.time.addEvent({
      delay: 1400,
      repeat: 2,
      callback: () => audio.play('confetti', { volume: 0.5 }),
    });

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.on('keydown-SPACE', () => this.pressAgain(againButton));
      keyboard.on('keydown-ENTER', () => this.pressAgain(againButton));
    }

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.input.keyboard?.removeAllListeners();
      this.dino?.destroy();
      this.dino = null;
    });
  }

  override update(time: number, delta: number): void {
    this.dino?.update(time, delta);
  }

  private pressAgain(button: RoundButton): void {
    if (this.leaving) return;
    button.press();
  }

  private nextForest(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE.FOREST, { seed: randomSeed() });
  }

  /** Все находки в ряд; каждая по очереди легко подпрыгивает. */
  private createItemsRow(): void {
    const count = this.itemIds.length;
    const scale = ITEM_ICON_SIZE / ITEM_TEXTURE_SIZE;
    const startX = GAME_WIDTH / 2 - ((count - 1) * ITEM_STEP) / 2;

    this.itemIds.forEach((itemId, index) => {
      const x = startX + index * ITEM_STEP;
      this.add.image(x + 3, ITEMS_Y + 7, itemTexture(itemId)).setScale(scale).setTint(0x000000).setAlpha(0.18);
      const item = this.add.image(x, ITEMS_Y, itemTexture(itemId)).setScale(scale);
      this.tweens.add({
        targets: item,
        y: ITEMS_Y - 18,
        duration: 380,
        delay: 300 + index * 110,
        ease: 'Sine.easeOut',
        yoyo: true,
        repeat: -1,
        repeatDelay: 1100,
      });
    });
  }

  /** Три спокойных потока конфетти сверху вниз. */
  private createConfetti(): void {
    const third = GAME_WIDTH / 3;
    TEX.CONFETTI.forEach((key, i) => {
      this.add.particles(0, -30, key, {
        x: { min: i * third, max: (i + 1) * third },
        lifespan: 4000,
        frequency: 160,
        quantity: 1,
        speedY: { min: 110, max: 190 },
        speedX: { min: -35, max: 35 },
        rotate: { start: 0, end: i % 2 === 0 ? 360 : -360 },
        scale: { min: 0.7, max: 1.1 },
        alpha: { start: 1, end: 0.7 },
      });
    });
  }

  /** Тот же фон, что у меню: небо, облака, холм, земля и деревья. */
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
    g.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 20);

    g.fillStyle(0xffffff, 0.75);
    const clouds: ReadonlyArray<readonly [number, number, number]> = [
      [GAME_WIDTH * 0.12, 420, 0.9],
      [GAME_WIDTH * 0.9, 130, 1],
    ];
    for (const [cx, cy, k] of clouds) {
      g.fillEllipse(cx, cy, 190 * k, 54 * k);
      g.fillEllipse(cx - 40 * k, cy - 22 * k, 100 * k, 56 * k);
      g.fillEllipse(cx + 34 * k, cy - 18 * k, 120 * k, 60 * k);
    }

    g.fillStyle(PALETTE.grassLight, 1);
    g.fillEllipse(GAME_WIDTH * 0.7, HORIZON_Y + 24, GAME_WIDTH * 0.9, 120);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y);
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, 12);
    g.fillStyle(PALETTE.grassDark, 1);
    g.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);

    this.add.image(70, HORIZON_Y + 70, TEX.TREE[0]).setOrigin(0.5, 1).setScale(0.9);
    this.add.image(GAME_WIDTH - 60, HORIZON_Y + 80, TEX.TREE[1]).setOrigin(0.5, 1).setScale(0.9);
  }
}
