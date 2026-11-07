/**
 * «Мои сокровища»: сетка находок текущего леса — 4 колонки, строк столько, сколько нужно.
 * Последний предмет в списке — секретный: его ячейка золотая и чуть крупнее.
 * Слева сетка, справа счётчик и кнопка «назад» — так даже четыре строки влезают без мелочи.
 * Запускается поверх лесной сцены, стоящей на паузе; закрытие возвращает лес.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import {
  ALBUM_ITEM_FILL,
  ALBUM_PANEL,
  TREASURE_DESIGN,
  albumLayout,
  albumSide,
} from '../art/treasureLayout';
import { PALETTE } from '../art/palette';
import { TEX, itemTexture } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { createLevelBadge } from '../art/levelBadge';
import { DINO_COLLECTION_SPOT, dinoSpotIn } from '../art/dinoLayout';
import { DinoWatcher } from '../entities/DinoWatcher';
import { SCENE } from '../types';
import type { CollectionSceneData } from '../types';

/** Исходный размер текстуры ячейки TEX.SLOT. */
const SLOT_TEXTURE_SIZE = 180;
/** Секретная ячейка крупнее остальных во столько раз. */
const SECRET_SCALE = 1.1;
/** Какую долю ячейки занимает предмет. */
const ITEM_FILL = ALBUM_ITEM_FILL;
const ITEM_TEXTURE_SIZE = TREASURE_DESIGN;

const PANEL_W = ALBUM_PANEL.width;
const PANEL_H = ALBUM_PANEL.height;

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
    this.addDino(root);

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

  /**
   * Диплодок стоит справа внизу, правее кнопки «назад», и выпрыгивает вместе
   * с панелью. Всё найдено — он радуется, когда панель встала на место.
   */
  private addDino(root: Phaser.GameObjects.Container): void {
    const spot = dinoSpotIn(DINO_COLLECTION_SPOT, root.x, root.y);
    const dino = DinoWatcher.create(this, 0, spot, root);
    const complete = this.itemIds.every((id) => this.foundItemIds.includes(id));
    if (complete) this.time.delayedCall(450, () => dino?.cheer());
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

  /** Сетка ячеек: найденное — в цвете с тенью, ненайденное — тёмный силуэт. */
  private buildGrid(root: Phaser.GameObjects.Container): void {
    const count = this.itemIds.length;
    // Где стоит каждая ячейка, считает treasureLayout: его же проверяет тест.
    const { slot, spots } = albumLayout(count);
    const slotScale = slot / SLOT_TEXTURE_SIZE;

    this.itemIds.forEach((itemId, index) => {
      const spot = spots[index];
      if (spot === undefined) return;
      const secret = index === count - 1;
      const { x, y } = spot;
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

  /** Правая колонка: крупное «5 из 8», рюкзак и кнопка «назад». */
  private buildSide(root: Phaser.GameObjects.Container): void {
    const total = this.itemIds.length;
    const found = this.itemIds.filter((id) => this.foundItemIds.includes(id)).length;

    for (const part of albumSide(found, total)) {
      if (part.kind === 'counter') {
        root.add(createText(this, part.x, part.y, part.text, CONFIG.ui.fontSizeCounter, PALETTE.uiText));
      } else if (part.kind === 'backpack') {
        root.add(this.add.image(part.x, part.y, TEX.ICON_BACKPACK).setScale(1.2));
      } else {
        const backButton = createRoundButton(this, part.x, part.y, TEX.ICON_BACK, () => this.close(), {
          radius: part.radius,
        });
        root.add(backButton.container);
      }
    }
  }

  /** Вернуть лес: эту сцену останавливаем, лес снимаем с паузы. */
  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.scene.resume(SCENE.FOREST);
  }
}
