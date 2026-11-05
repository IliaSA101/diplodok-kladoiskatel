/**
 * Задачка «Футбольная викторина»: вопрос крупным текстом и карточки с картинками.
 *
 * Проиграть нельзя: неверная карточка только мягко дрожит, ошибки не считаются,
 * можно тапать дальше. Вопросы идут подряд, потом finishPuzzle.
 *
 * Сколько вопросов и сколько картинок под каждым — решает ступень
 * (`quizTask` в `data/quest.ts`): три картинки угадываются тыком, пять уже нет.
 * Ряд карточек поэтому не вбит числами, а считается `rowFit`: на трёх
 * карточках он даёт ровно прежние 260 px, на пяти ужимает их до 172.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { rowFit } from '../art/layout';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { GAME_WIDTH } from '../config';
import { quizTask } from '../data/quest';
import type { QuizQuestion } from '../data/quest';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { makeRng } from '../systems/rng';
import { SCENE } from '../types';

// ---------- Раскладка (экран 1280x720, панель задачки: x 80..1200, y 100..680) ----------

const CX = GAME_WIDTH / 2;
/** Три точки прогресса; сам ряд рисует art/progressDots.ts. */
const DOTS_Y = 128;
/** Вопрос: одна-две строки по центру. */
const QUESTION_Y = 215;
const QUESTION_SIZE = 44;
const QUESTION_WIDTH = 1000;
/** Границы ряда карточек: кнопка «назад» висит выше, тут она не мешает. */
const CARDS_LEFT = 110;
const CARDS_RIGHT = 1170;
/** Шаг и сторона карточки при трёх вариантах — тот самый вид, что был всегда. */
const CARD_STEP_MAX = 330;
const CARD_SIZE_MAX = 260;
/** Просвет между карточками: из него `rowFit` и считает сторону. */
const CARD_GAP = 40;
const CARD_Y = 480;
/** Картинка от стороны карточки: 180 из 260 — то же, что было вбито числом. */
const ICON_RATIO = 180 / 260;
/** Скругление золотой рамки от стороны карточки: 40 из 260. */
const FRAME_RADIUS_RATIO = 40 / 260;
const FRAME_WIDTH = 10;

const SOLVED_PAUSE_MS = 1000;

interface Card {
  /** Какая картинка на карточке: по ней и проверяется ответ. */
  iconKey: string;
  root: Phaser.GameObjects.Container;
  /** Лицо карточки: дрожит отдельно от корня. */
  face: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
}

export class PuzzleQuizScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;
  private questions: readonly QuizQuestion[] = [];
  /** Сколько картинок под вопросом, считая правильную. */
  private optionCount = 3;
  private questionIndex = 0;
  private cards: Card[] = [];
  /** Всё, что принадлежит текущему вопросу, — убираем одним махом. */
  private questionObjects: Phaser.GameObjects.GameObject[] = [];
  private dots: ProgressDots | null = null;
  /** Правильная карточка уже выбрана — до следующего вопроса тапы не нужны. */
  private answered = false;
  private finished = false;
  private nextTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENE.PUZZLE_QUIZ);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
    const task = quizTask(data.step, data.variant);
    this.questions = task.questions;
    this.optionCount = task.options;
    this.questionIndex = 0;
    this.answered = false;
    this.finished = false;
    this.nextTimer = null;
    this.cards = [];
    this.questionObjects = [];
    this.dots = null;
  }

  create(): void {
    addPuzzleBackdrop(this, 'Футбольная викторина');
    this.createDots();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nextTimer?.remove(false);
      this.nextTimer = null;
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.cards = [];
      this.questionObjects = [];
      this.dots = null;
    });

    if (this.questions.length === 0) {
      // Вопросов нет — не оставляем ребёнка в тупике.
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
    } else {
      this.showQuestion(0);
    }

    addBackToMap(this);
  }

  // ---------- Прогресс ----------

  private createDots(): void {
    this.dots = createProgressDots(this, { count: this.questions.length, y: DOTS_Y });
  }

  // ---------- Вопрос ----------

  private showQuestion(index: number): void {
    const question = this.questions[index];
    if (question === undefined) return;
    this.questionIndex = index;
    this.answered = false;
    this.cards = [];

    const text = createText(this, CX, QUESTION_Y, question.question, QUESTION_SIZE, PALETTE.uiText);
    text.setWordWrapWidth(QUESTION_WIDTH, true).setDepth(3);
    text.setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 300 });
    this.questionObjects.push(text);

    const options = this.optionsFor(question, index);
    const row = rowFit(
      options.length,
      CARDS_LEFT,
      CARDS_RIGHT,
      CARD_STEP_MAX,
      CARD_SIZE_MAX,
      CARD_GAP,
    );
    options.forEach((iconKey, i) => {
      const card = this.createCard(row.spots[i] ?? CX, CARD_Y, iconKey, i, row.size);
      this.cards.push(card);
      card.root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onCardTap(i));
    });
  }

  /**
   * Что показать под вопросом: правильная картинка и столько неправильных,
   * сколько просит ступень.
   *
   * Перемешано не `Math.random`, а своим генератором от варианта и номера
   * вопроса: ребёнок возвращается на тот же узел и видит те же карточки на
   * тех же местах, а не новую раскладку каждый заход.
   */
  private optionsFor(question: QuizQuestion, index: number): string[] {
    const rng = makeRng(8000 + this.puzzleData.variant * 97 + index * 13);
    const wrong = question.wrong.slice(0, Math.max(1, this.optionCount - 1));
    return rng.shuffle([question.answer, ...wrong]);
  }

  private createCard(x: number, y: number, iconKey: string, order: number, size: number): Card {
    const base = this.add.image(0, 0, TEX.SLOT).setDisplaySize(size, size);
    const iconSize = size * ICON_RATIO;
    const icon = this.add.image(0, -4, iconKey).setDisplaySize(iconSize, iconSize);
    // Золотая рамка спрятана, пока карточка не выбрана правильно.
    const half = size / 2;
    const frame = this.add.graphics();
    frame.lineStyle(FRAME_WIDTH, PALETTE.gold, 1);
    frame.strokeRoundedRect(-half, -half, size, size, size * FRAME_RADIUS_RATIO);
    frame.setVisible(false);

    const face = this.add.container(0, 0, [base, icon, frame]);
    const root = this.add.container(x, y, [face]).setDepth(5);
    // Зону нажатия строит сам Phaser по setSize: см. PuzzleWordScene —
    // свой Rectangle(-half, -half) он сдвигает ещё раз на полкарточки.
    root.setSize(size, size);
    root.setInteractive({ useHandCursor: true });

    // Появление по очереди.
    root.setScale(0);
    this.tweens.add({ targets: root, scale: 1, duration: 340, delay: 100 + order * 90, ease: 'Back.easeOut' });
    this.questionObjects.push(root);
    return { iconKey, root, face, frame, icon };
  }

  // ---------- Тапы ----------

  private onCardTap(index: number): void {
    if (this.answered || this.finished) return;
    const question = this.questions[this.questionIndex];
    const card = this.cards[index];
    if (question === undefined || card === undefined) return;

    // Сравниваем картинку, а не номер: карточки перемешаны, и номер правильной
    // у каждого вопроса свой — хранить его отдельно значит однажды разойтись.
    if (card.iconKey === question.answer) {
      this.onCorrect(card);
    } else {
      notePuzzleMistake(this);
      audio.play('tap', { pitch: 0.6, volume: 0.5 });
      this.shake(card);
    }
  }

  /** Мягкая дрожь: двигаем только «лицо», зона касания остаётся на месте. */
  private shake(card: Card): void {
    this.tweens.killTweensOf(card.face);
    card.face.setPosition(0, 0);
    this.tweens.chain({
      targets: card.face,
      tweens: [
        { x: 10, duration: 50 },
        { x: -10, duration: 90 },
        { x: 6, duration: 80 },
        { x: -3, duration: 60 },
        { x: 0, duration: 50 },
      ],
    });
  }

  private onCorrect(card: Card): void {
    this.answered = true;
    this.dots?.fill(this.questionIndex);
    audio.play('found');

    this.tweens.killTweensOf(card.face);
    card.face.setPosition(0, 0);
    card.frame.setVisible(true);
    card.root.setDepth(10);

    // Карточка растёт и подпрыгивает, остальные отступают на второй план.
    this.tweens.add({ targets: card.root, scale: 1.12, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: card.icon,
      y: card.icon.y - 26,
      duration: 200,
      delay: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeOut',
    });
    this.cards.forEach((other) => {
      if (other !== card) this.tweens.add({ targets: other.root, alpha: 0.55, duration: 260 });
    });

    const sparks = this.add.particles(card.root.x, card.root.y, TEX.SPARKLE, {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 900,
      scale: { start: 1, end: 0 },
      quantity: 16,
      emitting: false,
    });
    sparks.setDepth(30);
    sparks.explode(16);
    this.questionObjects.push(sparks);

    this.nextTimer = this.time.delayedCall(SOLVED_PAUSE_MS, () => this.nextQuestion());
  }

  private nextQuestion(): void {
    this.nextTimer = null;
    if (this.finished) return;

    if (this.questionIndex + 1 >= this.questions.length) {
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
      return;
    }

    // Убираем старый вопрос вместе с его твинами.
    for (const card of this.cards) {
      this.tweens.killTweensOf(card.face);
      this.tweens.killTweensOf(card.icon);
    }
    for (const object of this.questionObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.questionObjects = [];
    this.cards = [];
    this.showQuestion(this.questionIndex + 1);
  }
}
