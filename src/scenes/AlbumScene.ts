/**
 * Альбом наклеек: разворот 8×3 на двадцать четыре наклейки.
 * Полученные — в цвете и слегка покачиваются, остальные — тёмные силуэты.
 *
 * Ряд — это круг квеста: восемь наклеек первого круга, второго и третьего.
 * Видно и сколько собрано, и за какой круг осталось.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX } from '../art/keys';
import { createBackButton, createPanel, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { onEscape } from '../systems/quest';
import { questSave } from '../systems/questSave';
import { SCENE } from '../types';

const COLUMNS = 8;
const ROWS = 3;
const CELL_STEP_X = 150;
const CELL_STEP_Y = 170;
const FIRST_ROW_Y = 230;
/** Ячейка-подложка и наклейка в ней, длинная сторона в px. */
const SLOT_SIZE = 126;
const STICKER_SIZE = 100;
/** Прозрачность силуэта ещё не полученной наклейки. */
const MISSING_ALPHA = 0.18;

const POP_MS = 380;
const CELL_DELAY_MS = 40;
/** Наклейки начинают проявляться, когда панель почти встала на место. */
const CELLS_START_MS = 260;

/** Вписать картинку в квадрат size×size, сохранив пропорции. */
function fitImage(image: Phaser.GameObjects.Image, size: number): void {
  image.setScale(size / Math.max(image.width, image.height, 1));
}

export class AlbumScene extends Phaser.Scene {
  private leaving = false;
  private keyBack: (() => void) | null = null;

  constructor() {
    super(SCENE.ALBUM);
  }

  init(): void {
    this.leaving = false;
    this.keyBack = null;
  }

  create(): void {
    const owned = new Set(questSave.stickers());
    const golden = new Set(questSave.goldenStickers());
    const total = TEX.STICKER.length;
    const count = TEX.STICKER.filter((key) => owned.has(key)).length;

    this.drawBackground();
    this.createSheet(count, total);
    this.createCells(owned, golden);
    this.createBackButton();

    // iOS Safari: звук разблокируется только жестом пользователя.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      this.keyBack = () => this.goBack();
      onEscape(this, this.keyBack);
      keyboard.on('keydown-SPACE', this.keyBack);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      if (this.keyBack !== null) {
        this.input.keyboard?.off('keydown-ESC', this.keyBack);
        this.input.keyboard?.off('keydown-SPACE', this.keyBack);
      }
      this.keyBack = null;
    });
  }

  private goBack(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    this.scene.start(SCENE.QUEST_MAP);
  }

  /** Лужайка вокруг разворота. */
  private drawBackground(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PALETTE.grassMid).setOrigin(0, 0);
    this.add.rectangle(0, GAME_HEIGHT - 60, GAME_WIDTH, 60, PALETTE.grassDark).setOrigin(0, 0);
  }

  /** Страница альбома: панель, заголовок, счётчик и точки. «Выпрыгивает» целиком. */
  private createSheet(count: number, total: number): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const pad = CONFIG.ui.padding;
    const sheet = this.add.container(cx, cy);

    const panel = createPanel(this, 0, 0, GAME_WIDTH - pad, GAME_HEIGHT - pad);
    const title = createText(this, 380 - cx, 66 - cy, 'Мои наклейки', CONFIG.ui.fontSizeBig, PALETTE.uiText);
    const counter = createText(this, 1010 - cx, 66 - cy, `${count} из ${total}`, CONFIG.ui.fontSizeBig, PALETTE.uiText);
    sheet.add([panel, title, counter]);

    // Ряда точек здесь нет: двадцать четыре в строку не влезают, а сама
    // сетка показывает ровно то же — что собрано, а что ещё силуэт.

    sheet.setScale(0.85);
    this.tweens.add({ targets: sheet, scale: 1, duration: POP_MS, ease: 'Back.easeOut' });
  }

  /** Сетка 8×3, ряд на круг: ячейки появляются по очереди. */
  private createCells(owned: ReadonlySet<string>, golden: ReadonlySet<string>): void {
    TEX.STICKER.slice(0, COLUMNS * ROWS).forEach((key, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const x = GAME_WIDTH / 2 + (col - (COLUMNS - 1) / 2) * CELL_STEP_X;
      const y = FIRST_ROW_Y + row * CELL_STEP_Y;
      const got = owned.has(key);

      const cell = this.add.container(x, y);
      const slot = this.add.image(0, 0, TEX.SLOT);
      fitImage(slot, SLOT_SIZE);
      cell.add(slot);

      if (got && golden.has(key)) {
        // Золотая оправа: эту наклейку ребёнок добыл второй раз, на кругах 4-6.
        // Без неё второй проход квеста ничего не менял бы в альбоме.
        const ring = this.add.graphics();
        ring.lineStyle(7, PALETTE.gold, 1);
        ring.strokeCircle(0, 0, SLOT_SIZE / 2 - 4);
        cell.add(ring);
      }

      const sticker = this.add.image(0, 0, key);
      fitImage(sticker, STICKER_SIZE);
      if (got) {
        // Лёгкая тень под наклейкой и мягкое покачивание.
        const shadow = this.add.ellipse(4, STICKER_SIZE * 0.42, STICKER_SIZE * 0.8, 16, 0x000000, 0.2);
        cell.add([shadow, sticker]);
        this.tweens.add({
          targets: sticker,
          angle: { from: -3, to: 3 },
          duration: 1500 + (i % 4) * 150,
          delay: i * 90,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      } else {
        sticker.setTint(0x000000).setAlpha(MISSING_ALPHA);
        cell.add(sticker);
      }

      cell.setAlpha(0).setScale(0.6);
      this.tweens.add({
        targets: cell,
        alpha: 1,
        scale: 1,
        duration: 300,
        delay: CELLS_START_MS + i * CELL_DELAY_MS,
        ease: 'Back.easeOut',
      });
    });
  }

  /** Назад на карту — левый верхний угол; радиус поменьше, чтобы не лезть в сетку. */
  private createBackButton(): void {
    createBackButton(this, () => this.goBack(), { radius: 56 });
  }
}
