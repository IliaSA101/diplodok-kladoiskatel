/**
 * Победа в конкретном лесу: цифра леса и «Ура!», секретный приз в сиянии по центру,
 * остальные находки рядом в ряд, конфетти, танцующий диплодок,
 * большая кнопка «Следующий лес» и кнопка «Леса».
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX, itemTexture } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import type { RoundButton } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { Diplodocus } from '../entities/Diplodocus';
import { createLevelBadge } from '../art/levelBadge';
import { save } from '../systems/save';
import { SCENE } from '../types';
import type { VictorySceneData } from '../types';

const HORIZON_Y = Math.round(GAME_HEIGHT * 0.72);
const ITEM_TEXTURE_SIZE = 256;
/** Размер значка обычной находки в ряду. */
const ITEM_ICON_SIZE = 72;
const ITEM_STEP = 84;
const ITEMS_Y = 160;
/** Главный приз: размер значка и положение (правее диплодока). */
const PRIZE_SIZE = 190;
const PRIZE_X = GAME_WIDTH * 0.6;
const PRIZE_Y = 305;
/** Кнопки справа внизу, под призом. */
const NEXT_X = PRIZE_X;
const NEXT_Y = 548;
const LEVELS_X = GAME_WIDTH * 0.84;
const LEVELS_Y = 560;

export class VictoryScene extends Phaser.Scene {
  private level = 1;
  private itemIds: string[] = [];
  private crownItemId = '';
  private dino: Diplodocus | null = null;
  private leaving = false;

  constructor() {
    super(SCENE.VICTORY);
  }

  init(data: VictorySceneData): void {
    this.level = data.level;
    this.crownItemId = data.crownItemId;
    // Секретный приз показывается отдельно — в ряду он не нужен.
    this.itemIds = data.itemIds.filter((id) => id !== data.crownItemId);
    this.leaving = false;
  }

  create(): void {
    this.drawBackground();
    this.createConfetti();

    // Приз рисуем первым: сияние остаётся позади ряда находок и заголовка.
    this.createPrize();

    // Подложка под ряд находок, чтобы значки читались на фоне неба.
    if (this.itemIds.length > 0) {
      createPanel(this, GAME_WIDTH / 2, ITEMS_Y, ITEM_STEP * this.itemIds.length + 40, ITEM_ICON_SIZE + 36);
    }
    this.createItemsRow();

    // Вверху: цифра пройденного леса и «Ура!».
    const hurray = createText(this, 0, 62, 'Ура!', CONFIG.ui.fontSizeCounter);
    const badgeRadius = 46;
    const gap = 24;
    const totalW = badgeRadius * 2 + gap + hurray.width;
    const left = GAME_WIDTH / 2 - totalW / 2;
    createLevelBadge(this, left + badgeRadius, 62, this.level, badgeRadius, 'gold', CONFIG.ui.fontSizeBig);
    hurray.setX(left + badgeRadius * 2 + gap + hurray.width / 2);

    // Танцующий диплодок: радуется каждые ~1.1 с.
    const dino = new Diplodocus(this, GAME_WIDTH * 0.29, HORIZON_Y + 110, { scale: 1.4 });
    dino.showHint(false);
    this.dino = dino;
    dino.playJoy();
    this.time.addEvent({ delay: 1100, loop: true, callback: () => dino.playJoy() });

    // Главная кнопка «Следующий лес» и подпись.
    const nextButton = createRoundButton(this, NEXT_X, NEXT_Y, TEX.ICON_NEXT, () => this.nextForest(), {
      radius: 110,
    });
    this.tweens.add({
      targets: nextButton.container,
      scale: 1.05,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    createText(this, NEXT_X, NEXT_Y + 110 + 28, 'Следующий лес', CONFIG.ui.fontSizeText);

    // Вторая кнопка: к выбору леса.
    const levelsRadius = CONFIG.ui.buttonRadius;
    createRoundButton(this, LEVELS_X, LEVELS_Y, TEX.ICON_MAP, () => this.openLevels(), {
      radius: levelsRadius,
      tone: 'calm',
    });
    createText(this, LEVELS_X, LEVELS_Y + levelsRadius + 30, 'Леса', CONFIG.ui.fontSizeText);

    // Звуки: фанфары, потом несколько хлопушек (не бесконечно).
    audio.play('win');
    this.time.addEvent({
      delay: 1400,
      repeat: 2,
      callback: () => audio.play('confetti', { volume: 0.5 }),
    });

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.on('keydown-SPACE', () => this.pressNext(nextButton));
      keyboard.on('keydown-ENTER', () => this.pressNext(nextButton));
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

  private pressNext(button: RoundButton): void {
    if (this.leaving) return;
    button.press();
  }

  private nextForest(): void {
    if (this.leaving) return;
    this.leaving = true;
    const next = this.level + 1;
    save.saveCurrentLevel(next);
    this.scene.start(SCENE.FOREST, { level: next });
  }

  private openLevels(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE.LEVELS);
  }

  /** Главный приз: крупно в центре, вокруг сияние и мерцающие звёздочки. */
  private createPrize(): void {
    const glow = this.add.image(PRIZE_X, PRIZE_Y, TEX.GLOW).setTint(PALETTE.gold).setScale(3).setAlpha(0.85);
    this.tweens.add({
      targets: glow,
      scale: 3.5,
      alpha: 0.6,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    const rays = this.add.image(PRIZE_X, PRIZE_Y, TEX.STAR).setTint(0xffffff).setScale(5).setAlpha(0.25);
    this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });

    // Звёздочки по кругу мерцают по очереди.
    const sparkles = 6;
    for (let i = 0; i < sparkles; i += 1) {
      const angle = (i / sparkles) * Math.PI * 2;
      const star = this.add
        .image(PRIZE_X + Math.cos(angle) * PRIZE_SIZE * 0.72, PRIZE_Y + Math.sin(angle) * PRIZE_SIZE * 0.62, TEX.SPARKLE)
        .setScale(0.6);
      this.tweens.add({
        targets: star,
        scale: 1.4,
        alpha: 0.35,
        duration: 600,
        delay: i * 180,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    const key = itemTexture(this.crownItemId);
    const scale = PRIZE_SIZE / ITEM_TEXTURE_SIZE;
    this.add.image(PRIZE_X + 5, PRIZE_Y + 12, key).setScale(scale).setTint(0x000000).setAlpha(0.18);
    const prize = this.add.image(PRIZE_X, PRIZE_Y, key).setScale(0);
    this.tweens.add({ targets: prize, scale, duration: 500, delay: 200, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: prize,
      y: PRIZE_Y - 14,
      duration: 900,
      delay: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Остальные находки в ряд; каждая по очереди легко подпрыгивает. */
  private createItemsRow(): void {
    const count = this.itemIds.length;
    const scale = ITEM_ICON_SIZE / ITEM_TEXTURE_SIZE;
    const startX = GAME_WIDTH / 2 - ((count - 1) * ITEM_STEP) / 2;

    this.itemIds.forEach((itemId, index) => {
      const x = startX + index * ITEM_STEP;
      this.add.image(x + 3, ITEMS_Y + 5, itemTexture(itemId)).setScale(scale).setTint(0x000000).setAlpha(0.18);
      const item = this.add.image(x, ITEMS_Y, itemTexture(itemId)).setScale(scale);
      this.tweens.add({
        targets: item,
        y: ITEMS_Y - 14,
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
