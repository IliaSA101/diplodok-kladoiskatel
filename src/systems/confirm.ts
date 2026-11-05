/**
 * Окошко «точно?»: стереть прогресс можно только двумя нажатиями.
 *
 * Откат нужен самому ребёнку — пройти любимый лес заново, — но случайный тап
 * по кнопке не должен стирать вечер работы. Поэтому между нажатием и стиранием
 * стоит это окно: большая зелёная «Да» и серая «Нет», тап мимо панели — тоже нет.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Выше интерфейса (100000) и находки (200000): окно поверх всего. */
const DEPTH = 300000;
const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 368;
const BUTTON_RADIUS = 64;

export interface ConfirmOptions {
  /** Короткий вопрос крупными буквами. */
  question: string;
  /** Картинка над вопросом: что именно стирается. */
  icon?: string;
  onYes: () => void;
}

/** Спросить и, если ребёнок подтвердил, выполнить onYes. */
export function askConfirm(scene: Phaser.Scene, options: ConfirmOptions): void {
  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2;
  const parts: { destroy(): void }[] = [];

  const veil = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x14321f, 0.6)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setInteractive({ useHandCursor: false });
  parts.push(veil);

  const panel = createPanel(scene, centerX, centerY, PANEL_WIDTH, PANEL_HEIGHT);
  panel.setScrollFactor(0).setDepth(DEPTH + 1);
  parts.push(panel);

  if (options.icon !== undefined) {
    const picture = scene.add.image(centerX, centerY - 96, options.icon);
    picture.setScale(80 / Math.max(picture.width, picture.height, 1));
    picture.setScrollFactor(0).setDepth(DEPTH + 2);
    parts.push(picture);
  }

  const question = createText(scene, centerX, centerY - 18, options.question, 52, PALETTE.uiText);
  question.setScrollFactor(0).setDepth(DEPTH + 2);
  parts.push(question);

  const close = (): void => {
    for (const part of parts) part.destroy();
    parts.length = 0;
  };

  const buttonY = centerY + 82;
  const yes = createRoundButton(scene, centerX - 110, buttonY, TEX.ICON_AGAIN, () => {
    close();
    options.onYes();
  }, { radius: BUTTON_RADIUS });
  yes.container.setScrollFactor(0).setDepth(DEPTH + 2);
  parts.push(yes);

  const no = createRoundButton(scene, centerX + 110, buttonY, TEX.ICON_BACK, close, {
    radius: BUTTON_RADIUS,
    tone: 'calm',
  });
  no.container.setScrollFactor(0).setDepth(DEPTH + 2);
  parts.push(no);

  // Подписи под кнопками: «заново» и «назад» похожи стрелками, а слова разные.
  for (const [x, word] of [[centerX - 110, 'Да'], [centerX + 110, 'Нет']] as const) {
    const label = createText(scene, x, buttonY + BUTTON_RADIUS + 22, word, 34, PALETTE.uiText);
    label.setScrollFactor(0).setDepth(DEPTH + 2);
    parts.push(label);
  }

  // Тап мимо панели — тоже «нет»: выйти из окна можно всегда.
  veil.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
    const insidePanel =
      Math.abs(pointer.x - centerX) <= PANEL_WIDTH / 2 &&
      Math.abs(pointer.y - centerY) <= PANEL_HEIGHT / 2 + BUTTON_RADIUS;
    if (insidePanel) return;
    audio.play('tap', { pitch: 0.8, volume: 0.5 });
    close();
  });
}
