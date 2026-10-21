/**
 * «Мои сокровища»: сетка 4x2 с находками текущего леса.
 * Запускается поверх лесной сцены, стоящей на паузе; закрытие возвращает лес.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX, itemTexture } from '../art/keys';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { SCENE } from '../types';
import type { CollectionSceneData } from '../types';

const COLUMNS = 4;
const SLOT_SIZE = 180;
const SLOT_GAP = 24;
/** Во сколько пикселей вписывается предмет в ячейку. */
const ITEM_SIZE = 130;
const ITEM_TEXTURE_SIZE = 256;

const PANEL_W = 1200;
const PANEL_H = 640;

export class CollectionScene extends Phaser.Scene {
  private itemIds: string[] = [];
  private foundItemIds: string[] = [];
  private closing = false;

  constructor() {
    super(SCENE.COLLECTION);
  }

  init(data: CollectionSceneData): void {
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
    root.add(createText(this, 0, -272, 'Мои сокровища', CONFIG.ui.fontSizeBig, PALETTE.uiText));

    this.buildGrid(root);
    this.buildCounter(root);

    const backButton = createRoundButton(this, 0, 240, TEX.ICON_BACK, () => this.close(), { radius: 56 });
    root.add(backButton.container);

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

  /** Сетка ячеек: найденное — в цвете с тенью, ненайденное — тёмный силуэт. */
  private buildGrid(root: Phaser.GameObjects.Container): void {
    const itemScale = ITEM_SIZE / ITEM_TEXTURE_SIZE;
    const stepX = SLOT_SIZE + SLOT_GAP;
    const stepY = SLOT_SIZE + SLOT_GAP;
    const firstRowY = -140;

    this.itemIds.forEach((itemId, index) => {
      const col = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x = (col - (COLUMNS - 1) / 2) * stepX;
      const y = firstRowY + row * stepY;
      const itemY = y + 4;
      const found = this.foundItemIds.includes(itemId);
      const key = itemTexture(itemId);
      const delay = 120 + index * 40;

      root.add(this.add.image(x, y, TEX.SLOT));

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

  /** Крупное «5 из 8», под ним ряд точек; справа от кнопки — рюкзак для настроения. */
  private buildCounter(root: Phaser.GameObjects.Container): void {
    const total = this.itemIds.length;
    const found = this.itemIds.filter((id) => this.foundItemIds.includes(id)).length;

    const counterX = -300;
    root.add(createText(this, counterX, 200, `${found} из ${total}`, CONFIG.ui.fontSizeCounter, PALETTE.uiText));

    const dotStep = 34;
    const dotsStartX = counterX - ((total - 1) * dotStep) / 2;
    for (let i = 0; i < total; i += 1) {
      const isFound = i < found;
      const dot = this.add.circle(
        dotsStartX + i * dotStep,
        270,
        12,
        isFound ? PALETTE.gold : PALETTE.uiButtonCalm,
      );
      dot.setStrokeStyle(3, isFound ? PALETTE.goldDark : PALETTE.uiButtonCalmDark);
      root.add(dot);
    }

    root.add(this.add.image(300, 236, TEX.ICON_BACKPACK).setScale(1.2));
  }

  /** Вернуть лес: эту сцену останавливаем, лес снимаем с паузы. */
  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.scene.resume(SCENE.FOREST);
  }
}
