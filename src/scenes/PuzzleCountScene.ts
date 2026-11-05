/**
 * Задачка «Счёт на табло»: пример на табло стадиона, ответ ребёнок набирает сам.
 *
 * Первая задачка, где нужно считать, и первая, где есть набор цифр: на
 * ноутбуке работают цифры и Backspace, на планшете — клавиши на экране.
 *
 * Кнопки «готово» нет намеренно. Клеток под ответ ровно столько, сколько в нём
 * цифр, и табло проверяет само, как только все клетки заполнены: ребёнку
 * не нужно догадываться, чем закончить, а число клеток ещё и подсказывает,
 * десяток в ответе или нет.
 *
 * Проиграть нельзя: неверный ответ только дрожит и гаснет, можно набирать
 * заново. Ошибки считаются, но лишь для того, чтобы ступень сложности
 * (systems/skill.ts) в следующий раз не подняли слишком высоко.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import {
  COUNT_BOARD,
  COUNT_KEYS,
  countBoardWidth,
  countKeySpot,
  countPictureSpots,
  countSpots,
} from '../art/layout';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { countTasks, type CountTask } from '../systems/countTask';
import { SCENE } from '../types';

/** Ряд точек прогресса — тот же, что во всех задачках. */
const DOTS_Y = 128;

/** Цифры на клавишах: 1…5 в первом ряду, 6…9 и 0 во втором. */
const KEY_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

const DEPTH_BOARD = 3;
const DEPTH_DIGIT = 5;
const DEPTH_KEYS = 6;

const SOLVED_PAUSE_MS = 950;

export class PuzzleCountScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;
  private tasks: readonly CountTask[] = [];
  private taskIndex = 0;
  /** Набранные цифры ответа по порядку. */
  private typed: number[] = [];
  private dots: ProgressDots | null = null;

  /** Табло целиком: дрожит при неверном ответе, зоны касания стоят отдельно. */
  private board: Phaser.GameObjects.Container | null = null;
  /** Всё, что принадлежит текущему примеру. */
  private taskObjects: Phaser.GameObjects.GameObject[] = [];
  /** Клетки ответа и цифры в них. */
  private slots: Phaser.GameObjects.Graphics[] = [];
  private slotTexts: Phaser.GameObjects.Text[] = [];
  /** Клавиши с цифрами по порядку KEY_DIGITS: по ним отзывается и клавиатура. */
  private keys: Phaser.GameObjects.Container[] = [];

  private answered = false;
  private finished = false;
  private nextTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENE.PUZZLE_COUNT);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
    this.tasks = countTasks(data.step, data.variant);
    this.taskIndex = 0;
    this.typed = [];
    this.dots = null;
    this.board = null;
    this.taskObjects = [];
    this.slots = [];
    this.slotTexts = [];
    this.keys = [];
    this.answered = false;
    this.finished = false;
    this.nextTimer = null;
  }

  create(): void {
    addPuzzleBackdrop(this, 'Счёт на табло');
    this.dots = createProgressDots(this, { count: this.tasks.length, y: DOTS_Y });
    this.createKeys();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nextTimer?.remove(false);
      this.nextTimer = null;
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.input.keyboard?.off('keydown');
      this.board = null;
      this.taskObjects = [];
      this.slots = [];
      this.slotTexts = [];
      this.keys = [];
      this.dots = null;
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.onKey(event));

    if (this.tasks.length === 0) {
      // Примеров нет — не оставляем ребёнка в тупике.
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
    } else {
      this.showTask(0);
    }

    addBackToMap(this);
  }

  // ---------- Табло ----------

  private showTask(index: number): void {
    const task = this.tasks[index];
    if (task === undefined) return;
    this.taskIndex = index;
    this.typed = [];
    this.answered = false;
    this.slots = [];
    this.slotTexts = [];

    const digits = String(task.answer).length;
    const spots = countSpots(digits, task.pictures);
    const { centerX, centerY, height, digitSize } = COUNT_BOARD;
    const width = countBoardWidth(task.pictures);

    // Тёмное поле табло: цифры на нём светятся, как на стадионе.
    const plate = this.add.graphics();
    plate.fillStyle(PALETTE.boardBackDark, 1);
    plate.fillRoundedRect(centerX - width / 2, centerY - height / 2 + 6, width, height, 28);
    plate.fillStyle(PALETTE.boardBack, 1);
    plate.fillRoundedRect(centerX - width / 2, centerY - height / 2, width, height, 28);

    const board = this.add.container(0, 0, [plate]).setDepth(DEPTH_BOARD);
    this.board = board;
    this.taskObjects.push(board);

    const digitY = centerY - (task.pictures ? 26 : 2);
    const number = (x: number, value: string): void => {
      board.add(createText(this, x, digitY, value, digitSize, PALETTE.gold));
    };
    number(spots.left, String(task.left));
    number(spots.op, task.op === '+' ? '+' : '−');
    number(spots.right, String(task.right));
    number(spots.eq, '=');

    if (task.pictures) {
      this.addPictures(board, spots.left, task.left);
      this.addPictures(board, spots.right, task.right);
    }

    spots.slots.forEach((x) => {
      const cell = this.add.graphics();
      this.drawSlot(cell, x, digitY, false);
      board.add(cell);
      this.slots.push(cell);

      const text = createText(this, x, digitY, '', digitSize, PALETTE.uiTextLight);
      board.add(text);
      this.slotTexts.push(text);
    });

    board.setAlpha(0);
    this.tweens.add({ targets: board, alpha: 1, duration: 260 });
  }

  /** Мячи под числом: до пяти в ряд, дальше вторым рядом. */
  private addPictures(board: Phaser.GameObjects.Container, x: number, count: number): void {
    const size = COUNT_BOARD.pictureSize;
    for (const spot of countPictureSpots(count)) {
      board.add(
        this.add
          .image(x + spot.dx, COUNT_BOARD.centerY + spot.dy, TEX.FOOT[0])
          .setDisplaySize(size, size),
      );
    }
  }

  /** Клетка под цифру: пустая — тихая рамка, заполненная — золотая. */
  private drawSlot(cell: Phaser.GameObjects.Graphics, x: number, y: number, full: boolean): void {
    const size = COUNT_BOARD.slot;
    cell.clear();
    cell.lineStyle(6, full ? PALETTE.gold : PALETTE.uiButtonCalmDark, 1);
    cell.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 14);
  }

  // ---------- Клавиши ----------

  private createKeys(): void {
    KEY_DIGITS.forEach((digit, i) => {
      const { x, y } = countKeySpot(i);
      const size = COUNT_KEYS.size;
      const face = this.add.image(0, 0, TEX.SLOT).setDisplaySize(size, size);
      const label = createText(this, 0, -2, digit, 56, PALETTE.uiText);
      const key = this.add.container(x, y, [face, label]).setDepth(DEPTH_KEYS);
      key.setSize(size, size);
      key.setInteractive({ useHandCursor: true });
      key.on(Phaser.Input.Events.POINTER_DOWN, () => {
        this.press(i);
        this.enter(Number(digit));
      });
      this.keys.push(key);
    });

    const erase = createRoundButton(
      this,
      COUNT_KEYS.eraseX,
      COUNT_KEYS.eraseY,
      TEX.ICON_ERASE,
      () => this.erase(),
      { radius: COUNT_KEYS.eraseRadius, tone: 'calm' },
    );
    erase.container.setDepth(DEPTH_KEYS);
  }

  /**
   * Клавиша отзывается на нажатие: иначе непонятно, сработало ли.
   * Цифра с клавиатуры нажимает ту же клавишу на экране — ребёнок видит связь.
   */
  private press(index: number): void {
    const key = this.keys[index];
    if (key === undefined) return;
    this.tweens.killTweensOf(key);
    key.setScale(1);
    this.tweens.add({ targets: key, scale: 0.88, duration: 70, yoyo: true, ease: 'Sine.easeOut' });
  }

  private onKey(event: KeyboardEvent): void {
    const index = KEY_DIGITS.indexOf(event.key as (typeof KEY_DIGITS)[number]);
    if (index >= 0) {
      this.press(index);
      this.enter(Number(event.key));
      return;
    }
    if (event.key === 'Backspace') this.erase();
  }

  // ---------- Набор ответа ----------

  private enter(digit: number): void {
    if (this.answered || this.finished) return;
    const task = this.tasks[this.taskIndex];
    if (task === undefined) return;
    const digits = String(task.answer).length;
    if (this.typed.length >= digits) return;

    this.typed.push(digit);
    this.showTyped();
    audio.play('tap', { volume: 0.5 });

    if (this.typed.length === digits) this.check(task);
  }

  private erase(): void {
    if (this.answered || this.finished || this.typed.length === 0) return;
    this.typed.pop();
    this.showTyped();
    audio.play('tap', { pitch: 0.7, volume: 0.4 });
  }

  private showTyped(): void {
    this.slotTexts.forEach((text, i) => {
      const digit = this.typed[i];
      text.setText(digit === undefined ? '' : String(digit));
      const cell = this.slots[i];
      if (cell !== undefined) this.drawSlot(cell, text.x, text.y, digit !== undefined);
    });
  }

  private check(task: CountTask): void {
    const value = Number(this.typed.join(''));
    if (value === task.answer) {
      this.onCorrect();
      return;
    }
    notePuzzleMistake(this);
    audio.play('tap', { pitch: 0.55, volume: 0.5 });
    this.shake();
    // Ответ стирается сам: ребёнку не нужно гадать, что делать с неверным.
    this.time.delayedCall(420, () => {
      if (this.answered || this.finished) return;
      this.typed = [];
      this.showTyped();
    });
  }

  private shake(): void {
    const board = this.board;
    if (board === null) return;
    this.tweens.killTweensOf(board);
    board.setPosition(0, 0);
    this.tweens.chain({
      targets: board,
      tweens: [
        { x: 12, duration: 50 },
        { x: -12, duration: 90 },
        { x: 7, duration: 80 },
        { x: -3, duration: 60 },
        { x: 0, duration: 50 },
      ],
    });
  }

  private onCorrect(): void {
    this.answered = true;
    this.dots?.fill(this.taskIndex);
    audio.play('found');

    for (const text of this.slotTexts) {
      text.setColor('#ffd84d');
      this.tweens.add({
        targets: text,
        scale: 1.25,
        duration: 220,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    }

    const sparks = this.add.particles(COUNT_BOARD.centerX, COUNT_BOARD.centerY, TEX.SPARKLE, {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 900,
      scale: { start: 1, end: 0 },
      quantity: 18,
      emitting: false,
    });
    sparks.setDepth(DEPTH_DIGIT + 20);
    sparks.explode(18);
    this.taskObjects.push(sparks);

    this.nextTimer = this.time.delayedCall(SOLVED_PAUSE_MS, () => this.nextTask());
  }

  private nextTask(): void {
    this.nextTimer = null;
    if (this.finished) return;

    if (this.taskIndex + 1 >= this.tasks.length) {
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
      return;
    }

    for (const object of this.taskObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.taskObjects = [];
    this.board = null;
    this.showTask(this.taskIndex + 1);
  }
}
