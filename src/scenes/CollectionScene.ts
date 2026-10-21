/**
 * «Мои сокровища»: сетка находок текущего леса — 4 колонки, строк столько, сколько нужно.
 * Последний предмет в списке — секретный: его ячейка золотая и чуть крупнее.
 * Слева сетка, справа счётчик и кнопка «назад» — так даже четыре строки влезают без мелочи.
 * Запускается поверх лесной сцены, стоящей на паузе; закрытие возвращает лес.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX, itemTexture } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { createLevelBadge } from '../art/levelBadge';
import { SCENE } from '../types';
import type { CollectionSceneData } from '../types';

const COLUMNS = 4;
/** Исходный размер текстуры ячейки TEX.SLOT. */
const SLOT_TEXTURE_SIZE = 180;
/** Самая большая ячейка и самая маленькая, которой ещё можно доверять палец и глаз. */
const SLOT_MAX = 165;
const SLOT_MIN = 120;
const SLOT_GAP = 16;
/** Секретная ячейка крупнее остальных во столько раз. */
const SECRET_SCALE = 1.1;
/** Какую долю ячейки занимает предмет. */
const ITEM_FILL = 0.72;
const ITEM_TEXTURE_SIZE = 256;

const PANEL_W = 1200;
const PANEL_H = 680;
const PANEL_PADDING = 40;

/** Область под сетку (координаты внутри панели, центр панели — ноль). */
const GRID_TOP = -245;
const GRID_BOTTOM = 320;
/** Правая колонка: счётчик, точки, рюкзак и кнопка «назад». */
const SIDE_X = 354;
const DOTS_PER_ROW = 7;
const DOT_STEP = 36;

export class CollectionScene extends Phaser.Scene {
  private level = 1;
  private itemIds: string[] = [];
  private foundItemIds: string[] = [];
  private closing = false;

  constructor() {
    super(SCENE.COLLECTION);
  }

  init(data: CollectionSceneData): void {
    this.level = data.level;
    this.itemIds = data.itemIds.slice();
    this.foundItemIds = data.foundItemIds.slice();
    this.closing = false;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Тёмная подложка: тап по ней (мимо панели) закрывает экран.
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45);
    overlay.setInteractive();
    const panelRect = new Phaser.Geom.Rectangle(cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H);
    overlay.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (panelRect.contains(pointer.x, pointer.y)) return;
      this.close();
    });

    // Всё содержимое лежит в одном контейнере в центре экрана — им и «выпрыгиваем».
    const root = this.add.container(cx, cy);
    root.setScale(0.8);

    root.add(createPanel(this, 0, 0, PANEL_W, PANEL_H));
    this.buildTitle(root);
    this.buildGrid(root);
    this.buildSide(root);

    this.tweens.add({ targets: root, scale: 1, duration: 250, ease: 'Back.easeOut' });

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.on('keydown-ESC', () => this.close());
      keyboard.on('keydown-SPACE', () => this.close());
    }

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.input.keyboard?.removeAllListeners();
    });
  }

  /** Цифра леса в золотом кружке и «Мои сокровища» рядом. */
  private buildTitle(root: Phaser.GameObjects.Container): void {
    const y = -PANEL_H / 2 + 52;
    const badgeRadius = 36;
    const gap = 20;
    const title = createText(this, 0, y, 'Мои сокровища', CONFIG.ui.fontSizeBig, PALETTE.uiText);
    const totalW = badgeRadius * 2 + gap + title.width;
    const left = -totalW / 2;
    title.setX(left + badgeRadius * 2 + gap + title.width / 2);
    root.add(title);
    const badge = createLevelBadge(this, left + badgeRadius, y, this.level, badgeRadius, 'gold', 44);
    root.add(badge.container);
  }

  /** Размер ячейки: как можно крупнее, но чтобы все строки влезли в область сетки. */
  private slotSize(rows: number): number {
    const available = GRID_BOTTOM - GRID_TOP;
    const fit = Math.floor((available - SLOT_GAP * (rows - 1)) / rows);
    return Phaser.Math.Clamp(fit, SLOT_MIN, SLOT_MAX);
  }

  /** Сетка ячеек: найденное — в цвете с тенью, ненайденное — тёмный силуэт. */
  private buildGrid(root: Phaser.GameObjects.Container): void {
    const count = this.itemIds.length;
    const rows = Math.max(1, Math.ceil(count / COLUMNS));
    const slot = this.slotSize(rows);
    const step = slot + SLOT_GAP;
    const slotScale = slot / SLOT_TEXTURE_SIZE;

    // Сетка прижата к левому краю панели, по вертикали — в середине области.
    const firstColX = -PANEL_W / 2 + PANEL_PADDING + slot / 2;
    const gridH = rows * slot + (rows - 1) * SLOT_GAP;
    const firstRowY = (GRID_TOP + GRID_BOTTOM) / 2 - gridH / 2 + slot / 2;

    this.itemIds.forEach((itemId, index) => {
      const col = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const secret = index === count - 1;
      const x = firstColX + col * step;
      const y = firstRowY + row * step;
      const k = secret ? slotScale * SECRET_SCALE : slotScale;
      // Ячейка «вдавлена» сверху, поэтому предмет чуть ниже её центра.
      const itemY = y + 4 * k;
      const found = this.foundItemIds.includes(itemId);
      const key = itemTexture(itemId);
      const delay = 120 + index * 40;

      const slotImage = this.add.image(x, y, TEX.SLOT).setScale(k);
      root.add(slotImage);
      if (secret) root.add(this.drawGoldFrame(x, y, slot * SECRET_SCALE));

      const itemScale = (slot * ITEM_FILL * (secret ? SECRET_SCALE : 1)) / ITEM_TEXTURE_SIZE;
      const popped: Phaser.GameObjects.Image[] = [];
      if (found) {
        // Мягкая тень под найденным предметом.
        const shadow = this.add.image(x + 4, itemY + 8, key).setTint(0x000000).setAlpha(0.22);
        root.add(shadow);
        popped.push(shadow);
      }
      const item = this.add.image(x, itemY, key);
      if (!found) item.setTint(0x000000).setAlpha(0.22);
      root.add(item);
      popped.push(item);

      // Предметы появляются по очереди.
      for (const image of popped) {
        image.setScale(0);
        this.tweens.add({ targets: image, scale: itemScale, duration: 260, delay, ease: 'Back.easeOut' });
      }
    });
  }

  /** Золотая рамка секретной ячейки: тёмно-золотой ободок и золотая линия поверх. */
  private drawGoldFrame(x: number, y: number, size: number): Phaser.GameObjects.Graphics {
    const radius = 34 * (size / SLOT_TEXTURE_SIZE);
    const g = this.add.graphics();
    g.lineStyle(10, PALETTE.goldDark, 1);
    g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, radius);
    g.lineStyle(6, PALETTE.gold, 1);
    g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, radius);
    return g;
  }

  /** Правая колонка: крупное «5 из 8», ряды точек, рюкзак и кнопка «назад». */
  private buildSide(root: Phaser.GameObjects.Container): void {
    const total = this.itemIds.length;
    const found = this.itemIds.filter((id) => this.foundItemIds.includes(id)).length;

    root.add(createText(this, SIDE_X, -140, `${found} из ${total}`, CONFIG.ui.fontSizeCounter, PALETTE.uiText));

    // Точки: найденные золотые; когда их много — несколько рядов по DOTS_PER_ROW.
    const dotRows = Math.max(1, Math.ceil(total / DOTS_PER_ROW));
    for (let i = 0; i < total; i += 1) {
      const row = Math.floor(i / DOTS_PER_ROW);
      const col = i % DOTS_PER_ROW;
      const inRow = Math.min(DOTS_PER_ROW, total - row * DOTS_PER_ROW);
      const isFound = i < found;
      const dot = this.add.circle(
        SIDE_X + (col - (inRow - 1) / 2) * DOT_STEP,
        -60 + (row - (dotRows - 1) / 2) * 34,
        12,
        isFound ? PALETTE.gold : PALETTE.uiButtonCalm,
      );
      dot.setStrokeStyle(3, isFound ? PALETTE.goldDark : PALETTE.uiButtonCalmDark);
      root.add(dot);
    }

    root.add(this.add.image(SIDE_X, 60, TEX.ICON_BACKPACK).setScale(1.2));

    const backButton = createRoundButton(this, SIDE_X, 220, TEX.ICON_BACK, () => this.close(), { radius: 70 });
    root.add(backButton.container);
  }

  /** Вернуть лес: эту сцену останавливаем, лес снимаем с паузы. */
  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.scene.resume(SCENE.FOREST);
  }
}
