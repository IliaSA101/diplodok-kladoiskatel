/**
 * Главное меню: небо, лес по краям, большой диплодок и огромная кнопка «Играть»
 * с цифрой текущего леса. Рядом — кнопка-карта «Леса» для выбора другого леса.
 * Текст минимальный — всё понятно по иконкам и цифрам.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { createLevelBadge } from '../art/levelBadge';
import type { RoundButton } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { Diplodocus } from '../entities/Diplodocus';
import { save } from '../systems/save';
import { SCENE } from '../types';

/** Линия горизонта: выше — небо, ниже — трава. */
const HORIZON_Y = Math.round(GAME_HEIGHT * 0.72);

export class MenuScene extends Phaser.Scene {
  private dino: Diplodocus | null = null;
  private started = false;

  constructor() {
    super(SCENE.MENU);
  }

  create(): void {
    this.started = false;

    this.drawBackground();

    // Диплодок слева: просто стоит, дышит и моргает.
    const dino = new Diplodocus(this, GAME_WIDTH * 0.29, HORIZON_Y + 90, { scale: 1.6 });
    dino.showHint(false);
    this.dino = dino;

    // Название вверху, чуть покачивается.
    const title = createText(this, GAME_WIDTH / 2, 92, 'Диплодок Кладоискатель', CONFIG.ui.fontSizeBig);
    title.setAngle(-1.2);
    this.tweens.add({
      targets: title,
      angle: 1.2,
      duration: 2300,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Одна огромная кнопка «Играть» и подпись.
    const playX = GAME_WIDTH * 0.73;
    const playY = GAME_HEIGHT * 0.54;
    const playButton = createRoundButton(this, playX, playY, TEX.ICON_PLAY, () => this.startGame(), {
      radius: 110,
    });
    this.tweens.add({
      targets: playButton.container,
      scale: 1.06,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    createText(this, playX, playY + 110 + 62, 'Играть ▶', CONFIG.ui.fontSizeBig);

    // Цифра текущего леса у кнопки «Играть»: видно, куда она ведёт.
    this.createCurrentLevelBadge(playX + 150, playY - 104);

    // Кнопка-карта «Леса» — выбрать другой лес.
    const mapRadius = CONFIG.ui.buttonRadius;
    const mapX = GAME_WIDTH - CONFIG.ui.padding - mapRadius - 10;
    const mapY = playY + 150;
    createRoundButton(this, mapX, mapY, TEX.ICON_MAP, () => this.openLevels(), { radius: mapRadius });
    createText(this, mapX, mapY + mapRadius + 30, 'Леса', CONFIG.ui.fontSizeText);

    this.createSoundButton();
    this.createMuseumCounter();

    // iOS Safari: звук разблокируется только жестом пользователя.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.once('keydown', () => audio.unlock());
      keyboard.on('keydown-SPACE', () => this.pressPlay(playButton));
      keyboard.on('keydown-ENTER', () => this.pressPlay(playButton));
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

  /** Нажатие кнопки с клавиатуры: с анимацией и звуком, как от тапа. */
  private pressPlay(button: RoundButton): void {
    if (this.started) return;
    audio.unlock();
    button.press();
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    audio.unlock();
    this.scene.start(SCENE.FOREST, { level: save.loadCurrentLevel() });
  }

  private openLevels(): void {
    if (this.started) return;
    this.started = true;
    audio.unlock();
    this.scene.start(SCENE.LEVELS);
  }

  /** Оранжевый кружок с цифрой текущего леса и листочком сверху. */
  private createCurrentLevelBadge(x: number, y: number): void {
    const radius = 52;
    const badge = createLevelBadge(this, x, y, save.loadCurrentLevel(), radius, 'warm', CONFIG.ui.fontSizeBig);
    badge.body.add(this.add.image(0, -radius + 2, TEX.ICON_LEAF).setScale(0.55));
  }

  /** Небо с градиентом, холмы, облака, земля и пара деревьев по краям. */
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
    g.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 20);

    // Мягкие облака.
    g.fillStyle(0xffffff, 0.75);
    const clouds: ReadonlyArray<readonly [number, number, number]> = [
      [GAME_WIDTH * 0.2, 190, 1],
      [GAME_WIDTH * 0.55, 150, 0.8],
      [GAME_WIDTH * 0.86, 230, 1.1],
    ];
    for (const [cx, cy, k] of clouds) {
      g.fillEllipse(cx, cy, 190 * k, 54 * k);
      g.fillEllipse(cx - 40 * k, cy - 22 * k, 100 * k, 56 * k);
      g.fillEllipse(cx + 34 * k, cy - 18 * k, 120 * k, 60 * k);
    }

    // Дальний холм и земля.
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillEllipse(GAME_WIDTH * 0.7, HORIZON_Y + 24, GAME_WIDTH * 0.9, 120);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y);
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, 12);
    g.fillStyle(PALETTE.grassDark, 1);
    g.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);

    // Деревья по краям.
    this.add.image(70, HORIZON_Y + 70, TEX.TREE[0]).setOrigin(0.5, 1).setScale(0.9);
    this.add.image(GAME_WIDTH - 60, HORIZON_Y + 80, TEX.TREE[1]).setOrigin(0.5, 1).setScale(0.9);
    this.add.image(GAME_WIDTH * 0.47, HORIZON_Y + 30, TEX.TREE[2]).setOrigin(0.5, 1).setScale(0.55);
  }

  /** Кнопка звука в правом верхнем углу. */
  private createSoundButton(): void {
    const iconFor = (): string => (audio.muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON);
    const radius = CONFIG.ui.smallButtonRadius;
    const button = createRoundButton(
      this,
      GAME_WIDTH - CONFIG.ui.padding - radius,
      CONFIG.ui.padding + radius,
      iconFor(),
      () => {
        audio.unlock();
        audio.toggleMuted();
        button.setIcon(iconFor());
      },
      { radius, tone: 'calm' },
    );
  }

  /** «Музей»: рюкзак и цифра — сколько разных сокровищ найдено за всё время. */
  private createMuseumCounter(): void {
    const w = 200;
    const h = 92;
    const x = CONFIG.ui.padding + w / 2;
    const y = CONFIG.ui.padding + h / 2;
    createPanel(this, x, y, w, h);
    this.add.image(x - 52, y - 2, TEX.ICON_BACKPACK).setScale(0.72);
    createText(this, x + 46, y - 2, String(save.loadCollection().length), CONFIG.ui.fontSizeBig, PALETTE.uiText);
  }
}
