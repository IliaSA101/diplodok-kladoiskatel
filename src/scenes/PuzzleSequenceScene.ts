/**
 * Задачка «Повтори порядок»: кнопки загораются по очереди, ребёнок повторяет.
 *
 * Проиграть нельзя: ошибся — цепочка той же длины показывается заново, с начала.
 * Длина растёт от подхода к подходу, и каждый следующий — продолжение прошлого.
 *
 * Пока цепочка показывается, тапы не принимаются: иначе ребёнок жмёт по ходу
 * показа, сбивается и не понимает, за что его «не поняли». Поэтому у кнопок
 * в это время снята интерактивность, а не просто стоит флаг.
 *
 * Сама цепочка живёт в `systems/sequenceTask.ts`, места кнопок — в `art/layout.ts`.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { sequencePadSize, sequencePadSpot } from '../art/layout';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { audio } from '../audio/AudioEngine';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { sequenceTask } from '../systems/sequenceTask';
import type { SequenceTask } from '../systems/sequenceTask';
import { SCENE } from '../types';

const DOTS_Y = 128;

/** Сколько кнопка горит и сколько тишины между огоньками. */
const FLASH_MS = 420;
const GAP_MS = 190;
/** Пауза перед показом: ребёнок успевает перевести взгляд на ряд. */
const BEFORE_MS = 700;
/** Пауза после удачного подхода, прежде чем показать цепочку подлиннее. */
const AFTER_MS = 900;

/**
 * Цвет и значок у каждой кнопки свои.
 *
 * Только цветом нельзя: кнопки отличались бы одним признаком, и ребёнок,
 * который путает похожие оттенки на ноутбучном экране, повторял бы вслепую.
 */
const PAD_COLORS: readonly number[] = [
  PALETTE.flowerPink,
  PALETTE.grassLight,
  PALETTE.flowerBlue,
  PALETTE.shell,
  PALETTE.stumpTop,
  PALETTE.water,
];

/** Обводка кнопки: обычная и «горит сейчас». */
const STROKE = 8;
const STROKE_LIT = 16;

interface Pad {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
}

export class PuzzleSequenceScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;
  private task!: SequenceTask;
  /** Какой подход идёт: индекс в task.steps. */
  private stepIndex = 0;
  /** Сколько огоньков уже повторено в этом подходе. */
  private typed = 0;

  private pads: Pad[] = [];
  private dots: ProgressDots | null = null;
  /** Пока true — показываем цепочку, тапы не принимаются. */
  private showing = true;
  private finished = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super(SCENE.PUZZLE_SEQUENCE);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
    this.task = sequenceTask(data.step, data.variant);
    this.stepIndex = 0;
    this.typed = 0;
    this.pads = [];
    this.dots = null;
    this.showing = true;
    this.finished = false;
    this.timers = [];
  }

  create(): void {
    addPuzzleBackdrop(this, 'Повтори порядок');
    this.dots = createProgressDots(this, { count: this.task.steps.length, y: DOTS_Y });
    this.buildPads();
    addBackToMap(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearTimers();
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.pads = [];
      this.dots = null;
    });

    this.playChain();
  }

  private buildPads(): void {
    const size = sequencePadSize(this.task.pads);
    for (let i = 0; i < this.task.pads; i += 1) {
      const spot = sequencePadSpot(i, this.task.pads);
      const color = PAD_COLORS[i] ?? PALETTE.flowerBlue;
      const body = this.add.rectangle(0, 0, size, size, color);
      body.setStrokeStyle(STROKE, PALETTE.uiText);
      const icon = this.add.image(0, 0, TEX.FOOT[i] ?? TEX.FOOT[0]);
      icon.setDisplaySize(size * 0.56, size * 0.56);
      const root = this.add.container(spot.x, spot.y, [body, icon]).setDepth(5);
      root.setSize(size, size);
      this.pads.push({ root, body, icon });
    }
  }

  // ---------- Показ цепочки ----------

  private playChain(): void {
    // Хвосты прошлого показа: иначе после ошибки две цепочки идут внахлёст.
    this.clearTimers();
    this.showing = true;
    this.typed = 0;
    this.setPadsEnabled(false);
    // Приглушаем ряд: «сейчас смотрим», а не «сейчас жмём».
    for (const pad of this.pads) this.tweens.add({ targets: pad.root, scale: 0.92, duration: 200 });

    const length = this.task.steps[this.stepIndex] ?? this.task.order.length;
    for (let k = 0; k < length; k += 1) {
      const index = this.task.order[k];
      if (index === undefined) continue;
      this.after(BEFORE_MS + k * (FLASH_MS + GAP_MS), () => this.flash(index));
    }
    this.after(BEFORE_MS + length * (FLASH_MS + GAP_MS), () => this.startRepeat());
  }

  private startRepeat(): void {
    this.showing = false;
    for (const pad of this.pads) this.tweens.add({ targets: pad.root, scale: 1, duration: 200 });
    this.setPadsEnabled(true);
  }

  private setPadsEnabled(on: boolean): void {
    this.pads.forEach((pad, i) => {
      if (on) {
        pad.root.setInteractive({ useHandCursor: true });
        pad.root.off(Phaser.Input.Events.POINTER_DOWN);
        pad.root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onPadTap(i));
      } else {
        pad.root.disableInteractive();
      }
    });
  }

  /** Кнопка загорается: вырастает, светлеет и звучит своей нотой. */
  private flash(index: number): void {
    const pad = this.pads[index];
    if (!pad) return;
    audio.play('tap', { pitch: 0.7 + index * 0.16 });
    this.tweens.killTweensOf(pad.root);
    this.tweens.add({
      targets: pad.root,
      scale: { from: this.showing ? 0.92 : 1, to: 1.16 },
      duration: FLASH_MS * 0.4,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        pad.root.setScale(this.showing ? 0.92 : 1);
      },
    });
    // Горящая кнопка не перекрашивается, а обводится золотом: цвет — это её
    // имя, и если на вспышке все кнопки одинаково золотые, повторять нечего.
    pad.body.setStrokeStyle(STROKE_LIT, PALETTE.gold);
    this.after(FLASH_MS, () => pad.body.setStrokeStyle(STROKE, PALETTE.uiText));
  }

  // ---------- Повтор ----------

  private onPadTap(index: number): void {
    if (this.showing || this.finished) return;
    const expected = this.task.order[this.typed];
    if (expected === undefined) return;

    if (index !== expected) {
      notePuzzleMistake(this);
      audio.play('tap', { pitch: 0.5, volume: 0.5 });
      this.shake(index);
      // Тот же подход с начала: ребёнок смотрит ещё раз, а не теряет сделанное.
      this.setPadsEnabled(false);
      this.after(650, () => this.playChain());
      return;
    }

    this.flash(index);
    this.typed += 1;

    const length = this.task.steps[this.stepIndex] ?? this.task.order.length;
    if (this.typed < length) return;

    this.dots?.fill(this.stepIndex);
    audio.play('found');
    this.setPadsEnabled(false);
    this.showing = true;

    if (this.stepIndex + 1 >= this.task.steps.length) {
      this.finished = true;
      this.after(AFTER_MS, () => finishPuzzle(this, this.puzzleData));
      return;
    }
    this.stepIndex += 1;
    this.after(AFTER_MS, () => this.playChain());
  }

  private shake(index: number): void {
    const pad = this.pads[index];
    if (!pad) return;
    const home = sequencePadSpot(index, this.task.pads).x;
    this.tweens.killTweensOf(pad.root);
    pad.root.x = home;
    this.tweens.add({
      targets: pad.root,
      x: { from: home - 10, to: home + 10 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        pad.root.x = home;
      },
    });
  }

  // ---------- Таймеры ----------

  /** Отложенный вызов, который гарантированно умрёт вместе со сценой. */
  private after(ms: number, run: () => void): void {
    this.timers.push(this.time.delayedCall(ms, run));
  }

  private clearTimers(): void {
    for (const timer of this.timers) timer.remove(false);
    this.timers = [];
  }
}
