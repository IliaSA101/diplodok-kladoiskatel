/**
 * Задачка «Что дальше в ряду»: ряд картинок по правилу, последняя закрыта.
 *
 * Проиграть нельзя: неверная карточка мягко дрожит, тапать можно дальше.
 * Четыре ряда подряд, потом finishPuzzle.
 *
 * Правило ряда и картинки считает `systems/patternTask.ts`, места на экране —
 * `art/layout.ts`. Здесь только карточки и анимации.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PATTERN_ROW, patternCellSpot, patternOptionSpot } from '../art/layout';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { PATTERN_CELLS, patternTasks } from '../systems/patternTask';
import type { PatternRow } from '../systems/patternTask';
import { SCENE } from '../types';

/** Ряд точек прогресса — один на всю игру, см. art/progressDots.ts. */
const DOTS_Y = 128;
const FRAME_WIDTH = 10;
const SOLVED_PAUSE_MS = 1000;

/** Картинки для ролей узора: первые восемь футбольных значков. */
const FACES: readonly string[] = TEX.FOOT.slice(0, 8);

interface Card {
  root: Phaser.GameObjects.Container;
  /** Лицо карточки: дрожит отдельно от корня, зона касания стоит на месте. */
  face: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
}

export class PuzzlePatternScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;
  private rows: readonly PatternRow[] = [];
  private rowIndex = 0;

  private options: Card[] = [];
  /** Закрытая клетка в конце ряда: в неё приезжает ответ. */
  private riddle: Card | null = null;
  /** Всё, что принадлежит текущему ряду, — убираем одним махом. */
  private rowObjects: Phaser.GameObjects.GameObject[] = [];
  private dots: ProgressDots | null = null;

  private answered = false;
  private finished = false;
  private nextTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENE.PUZZLE_PATTERN);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
    this.rows = patternTasks(data.step, data.variant);
    this.rowIndex = 0;
    this.answered = false;
    this.finished = false;
    this.nextTimer = null;
    this.options = [];
    this.riddle = null;
    this.rowObjects = [];
    this.dots = null;
  }

  create(): void {
    addPuzzleBackdrop(this, 'Что дальше?');
    this.dots = createProgressDots(this, { count: this.rows.length, y: DOTS_Y });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nextTimer?.remove(false);
      this.nextTimer = null;
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.options = [];
      this.riddle = null;
      this.rowObjects = [];
      this.dots = null;
    });

    if (this.rows.length === 0) {
      // Рядов нет — не оставляем ребёнка в тупике.
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
    } else {
      this.showRow(0);
    }

    addBackToMap(this);
  }

  // ---------- Ряд ----------

  private showRow(index: number): void {
    const task = this.rows[index];
    if (task === undefined) return;
    this.rowIndex = index;
    this.answered = false;
    this.options = [];

    task.row.forEach((face, i) => {
      const spot = patternCellSpot(i, PATTERN_CELLS);
      const last = i === task.row.length - 1;
      const card = this.createCard(
        spot.x,
        spot.y,
        last ? null : FACES[face],
        PATTERN_ROW.cell,
        PATTERN_ROW.icon,
        i * 50,
      );
      if (last) this.riddle = card;
    });

    task.options.forEach((face, i) => {
      const spot = patternOptionSpot(i, task.options.length);
      const card = this.createCard(
        spot.x,
        spot.y,
        FACES[face],
        PATTERN_ROW.option,
        PATTERN_ROW.optionIcon,
        400 + i * 90,
      );
      card.root.setInteractive({ useHandCursor: true });
      card.root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onOptionTap(i));
      this.options.push(card);
    });
  }

  /** Карточка со значком; `face === null` — закрытая клетка с вопросом. */
  private createCard(
    x: number,
    y: number,
    face: string | undefined | null,
    size: number,
    iconSize: number,
    delay: number,
  ): Card {
    const base = this.add.image(0, 0, TEX.SLOT).setDisplaySize(size, size);
    const icon = this.add.image(0, -2, face ?? TEX.FOOT[0]).setDisplaySize(iconSize, iconSize);
    icon.setVisible(face !== null && face !== undefined);

    const parts: Phaser.GameObjects.GameObject[] = [base, icon];
    if (face === null) {
      // Вопрос вместо картинки: единственный знак, который тут нужен.
      parts.push(createText(this, 0, -2, '?', Math.round(size * 0.52), PALETTE.uiText));
    }

    const half = size / 2;
    const frame = this.add.graphics();
    frame.lineStyle(FRAME_WIDTH, PALETTE.gold, 1);
    frame.strokeRoundedRect(-half, -half, size, size, Math.round(size * 0.18));
    frame.setVisible(false);
    parts.push(frame);

    const cardFace = this.add.container(0, 0, parts);
    const root = this.add.container(x, y, [cardFace]).setDepth(5);
    // Зону нажатия строит сам Phaser по setSize: свой Rectangle он сдвинет ещё раз.
    root.setSize(size, size);

    root.setScale(0);
    this.tweens.add({ targets: root, scale: 1, duration: 320, delay, ease: 'Back.easeOut' });
    this.rowObjects.push(root);
    return { root, face: cardFace, frame, icon };
  }

  // ---------- Тапы ----------

  private onOptionTap(index: number): void {
    if (this.answered || this.finished) return;
    const task = this.rows[this.rowIndex];
    const card = this.options[index];
    if (task === undefined || card === undefined) return;

    if (task.options[index] === task.answer) {
      this.onCorrect(card, task.answer);
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

  private onCorrect(card: Card, face: number): void {
    this.answered = true;
    this.dots?.fill(this.rowIndex);
    audio.play('found');

    this.tweens.killTweensOf(card.face);
    card.face.setPosition(0, 0);
    card.frame.setVisible(true);
    this.options.forEach((other) => {
      if (other !== card) this.tweens.add({ targets: other.root, alpha: 0.55, duration: 260 });
    });

    // Ответ встаёт на место вопроса — ряд достроен, и это видно.
    const riddle = this.riddle;
    if (riddle) {
      const key = FACES[face];
      if (key !== undefined) riddle.icon.setTexture(key);
      riddle.icon.setDisplaySize(PATTERN_ROW.icon, PATTERN_ROW.icon).setVisible(true);
      riddle.frame.setVisible(true);
      // У картинки свой масштаб от setDisplaySize — пружиним от него, а не от единицы.
      const toX = riddle.icon.scaleX;
      const toY = riddle.icon.scaleY;
      riddle.icon.setScale(toX * 0.3, toY * 0.3);
      this.tweens.add({ targets: riddle.icon, scaleX: toX, scaleY: toY, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: riddle.root,
        scale: { from: 1.25, to: 1 },
        duration: 320,
        ease: 'Back.easeOut',
      });

      const sparks = this.add.particles(riddle.root.x, riddle.root.y, TEX.SPARKLE, {
        speed: { min: 80, max: 240 },
        angle: { min: 0, max: 360 },
        lifespan: 900,
        scale: { start: 1, end: 0 },
        quantity: 14,
        emitting: false,
      });
      sparks.setDepth(30);
      sparks.explode(14);
      this.rowObjects.push(sparks);
    }

    this.nextTimer = this.time.delayedCall(SOLVED_PAUSE_MS, () => this.nextRow());
  }

  private nextRow(): void {
    this.nextTimer = null;
    if (this.finished) return;

    if (this.rowIndex + 1 >= this.rows.length) {
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
      return;
    }

    for (const object of this.rowObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.rowObjects = [];
    this.options = [];
    this.riddle = null;
    this.showRow(this.rowIndex + 1);
  }
}
