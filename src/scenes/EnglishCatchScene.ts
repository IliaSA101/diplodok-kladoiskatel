/**
 * «Лови буквы»: снизу поднимаются шарики с буквами, ловить нужно ту,
 * что идёт в слове следующей.
 *
 * Проиграть нельзя и опоздать нельзя: нужная буква всегда есть на экране —
 * если она улетела вверх, следующий же шарик будет с ней. Неверный шарик
 * лопается без всяких последствий, ошибки нигде не считаются.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { CATCH_COLUMN, CATCH_ROW } from '../art/englishLayout';
import { rowFit } from '../art/layout';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { englishSet, type EnglishWord } from '../data/english';
import { makeRng, type Rng } from '../systems/rng';
import { speech } from '../systems/speech';
import { SCENE, type EnglishGameData } from '../types';
import {
  addBackToEnglish,
  addEnglishBackdrop,
  createSpeakButton,
  createWordPrompt,
  finishEnglishGame,
  markEnglishDone,
  type Hint,
} from './englishUi';

const CX = GAME_WIDTH / 2;
const DOTS_Y = CATCH_COLUMN.dotsY;
const HINT_Y = CATCH_COLUMN.promptY;
const SLOTS_Y = CATCH_COLUMN.slotsY;

/** Шарики живут ниже клеток слова и выше нижнего края. */
const BALLOON_RADIUS = 46;
const SPAWN_Y = GAME_HEIGHT + BALLOON_RADIUS;
const DEATH_Y = SLOTS_Y + 110;
const SPEED_MIN = 52;
const SPEED_MAX = 86;
/** Качание в стороны: шарик не летит по линейке. */
const SWAY_X = 26;
const SWAY_SPEED = 0.0013;

const SPAWN_MS = 620;
const MAX_BALLOONS = 7;
/** Кадр после возврата из фона бывает огромным — шарики не должны прыгать. */
const MAX_DELTA_MS = 50;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SOLVED_PAUSE_MS = 1400;

interface Balloon {
  char: string;
  root: Phaser.GameObjects.Container;
  baseX: number;
  speed: number;
  phase: number;
  popped: boolean;
}

export class EnglishCatchScene extends Phaser.Scene {
  private setIndex = 0;
  private words: readonly EnglishWord[] = [];
  private wordIndex = 0;
  private word = '';
  private caught = 0;
  private dots: ProgressDots | null = null;
  private slots: Phaser.GameObjects.Text[] = [];
  private slotTiles: Phaser.GameObjects.Image[] = [];
  private slotPositions: Phaser.Math.Vector2[] = [];
  private hint: Hint | null = null;
  private balloons: Balloon[] = [];
  private rng: Rng = makeRng(1);
  private sinceSpawn = 0;
  private clock = 0;
  private wordDone = false;
  private finished = false;

  constructor() {
    super(SCENE.ENGLISH_CATCH);
  }

  init(data: EnglishGameData): void {
    this.setIndex = data.setIndex;
    this.words = englishSet(data.setIndex).words;
    this.wordIndex = 0;
    this.caught = 0;
    this.word = '';
    this.dots = null;
    this.slots = [];
    this.slotTiles = [];
    this.slotPositions = [];
    this.hint = null;
    this.balloons = [];
    this.rng = makeRng(9300 + data.setIndex * 17);
    this.sinceSpawn = 0;
    this.clock = 0;
    this.wordDone = false;
    this.finished = false;
  }

  create(): void {
    addEnglishBackdrop(this, 'Catch letters');
    this.dots = createProgressDots(this, { count: this.words.length, y: DOTS_Y });
    createSpeakButton(this, CX - 330, HINT_Y, () => this.word);
    addBackToEnglish(this, this.setIndex);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      speech.stop();
      this.balloons = [];
      this.slots = [];
      this.slotTiles = [];
    });

    this.startWord(0);
  }

  override update(_time: number, delta: number): void {
    if (this.finished) return;
    const step = Math.min(delta, MAX_DELTA_MS);
    this.clock += step;

    for (const balloon of this.balloons) {
      if (balloon.popped) continue;
      balloon.root.y -= (balloon.speed * step) / 1000;
      balloon.root.x = balloon.baseX + Math.sin(this.clock * SWAY_SPEED + balloon.phase) * SWAY_X;
    }
    // Улетевшие вверх снимаем с экрана.
    for (const balloon of [...this.balloons]) {
      if (!balloon.popped && balloon.root.y < DEATH_Y) this.remove(balloon, false);
    }

    if (this.wordDone) return;
    this.sinceSpawn += step;
    if (this.sinceSpawn >= SPAWN_MS) {
      this.sinceSpawn = 0;
      this.spawn();
    }
  }

  // ---------- Слово ----------

  private startWord(index: number): void {
    const word = this.words[index];
    if (word === undefined) return;
    this.wordIndex = index;
    this.word = word.en;
    this.caught = 0;
    this.wordDone = false;

    this.hint = createWordPrompt(this, CX, HINT_Y, word, { size: CATCH_COLUMN.promptSize });
    this.time.delayedCall(260, () => {
      if (!this.finished) speech.say(word.en);
    });

    const { left, right, maxStep, tile: maxTile, gap } = CATCH_ROW;
    const row = rowFit(word.en.length, left, right, maxStep, maxTile, gap);
    row.spots.forEach((x) => {
      const tile = this.add
        .image(x, SLOTS_Y, TEX.LETTER_TILE)
        .setDisplaySize(row.size, row.size)
        .setAlpha(0.3)
        .setDepth(2);
      const text = createText(this, x, SLOTS_Y - 2, '', Math.round(row.size * 0.58), PALETTE.uiText);
      text.setDepth(3);
      this.slotTiles.push(tile);
      this.slots.push(text);
      this.slotPositions.push(new Phaser.Math.Vector2(x, SLOTS_Y));
    });

    // Первый шарик сразу, чтобы экран не пустовал.
    this.spawn();
  }

  private needed(): string {
    return this.word.charAt(this.caught);
  }

  // ---------- Шарики ----------

  private spawn(): void {
    const alive = this.balloons.filter((item) => !item.popped);
    if (alive.length >= MAX_BALLOONS) return;

    // Нужная буква обязана быть на экране: иначе ребёнку нечего ловить.
    const need = this.needed();
    const hasNeeded = alive.some((item) => item.char === need);
    const char = hasNeeded ? this.randomChar() : need;

    const baseX = this.rng.range(BALLOON_RADIUS + 60, GAME_WIDTH - BALLOON_RADIUS - 60);
    const circle = this.add
      .circle(0, 0, BALLOON_RADIUS, this.balloonColor(char))
      .setStrokeStyle(5, PALETTE.uiButtonDark);
    const string = this.add.graphics();
    string.lineStyle(4, PALETTE.uiText, 0.6);
    string.lineBetween(0, BALLOON_RADIUS, 0, BALLOON_RADIUS + 42);
    const label = createText(this, 0, -2, char, 54, PALETTE.uiText);
    const root = this.add.container(baseX, SPAWN_Y, [string, circle, label]).setDepth(8);
    root.setSize(BALLOON_RADIUS * 2, BALLOON_RADIUS * 2);
    root.setInteractive({ useHandCursor: true });

    const balloon: Balloon = {
      char,
      root,
      baseX,
      speed: this.rng.range(SPEED_MIN, SPEED_MAX),
      phase: this.rng.range(0, Math.PI * 2),
      popped: false,
    };
    root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onBalloonTap(balloon));
    this.balloons.push(balloon);
  }

  /** Буква из слова или любая другая — поровну, чтобы выбор был настоящий. */
  private randomChar(): string {
    const fromWord = this.rng.chance(0.5);
    if (fromWord) return this.rng.pick(this.word.split(''));
    const others = ALPHABET.split('').filter((ch) => !this.word.includes(ch));
    return others.length > 0 ? this.rng.pick(others) : this.rng.pick(ALPHABET.split(''));
  }

  /** Цвет шарика ни о чём не говорит: подсказывать, где нужная буква, нельзя. */
  private balloonColor(char: string): number {
    const colors = [PALETTE.uiButton, PALETTE.sky, PALETTE.grassLight, PALETTE.gold];
    const index = char.charCodeAt(0) % colors.length;
    return colors[index] ?? PALETTE.uiButton;
  }

  private onBalloonTap(balloon: Balloon): void {
    if (balloon.popped || this.wordDone || this.finished) return;
    audio.unlock();
    speech.warmUp();

    if (balloon.char !== this.needed()) {
      audio.play('tap', { pitch: 0.6, volume: 0.5 });
      this.remove(balloon, true);
      return;
    }

    audio.play('tap');
    const slot = this.slotPositions[this.caught];
    const text = this.slots[this.caught];
    const tile = this.slotTiles[this.caught];
    this.caught += 1;
    balloon.popped = true;
    balloon.root.disableInteractive();

    if (slot !== undefined && text !== undefined && tile !== undefined) {
      text.setText(balloon.char);
      text.setScale(0);
      tile.setAlpha(1);
      this.tweens.add({ targets: text, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: balloon.root,
        x: slot.x,
        y: slot.y,
        scale: 0.2,
        alpha: 0,
        duration: 300,
        ease: 'Cubic.easeIn',
        onComplete: () => this.drop(balloon),
      });
    } else {
      this.drop(balloon);
    }

    if (this.caught >= this.word.length) this.onWordSolved();
  }

  /** Убрать шарик: лопнуть с хлопком или просто снять улетевший. */
  private remove(balloon: Balloon, pop: boolean): void {
    balloon.popped = true;
    balloon.root.disableInteractive();
    if (!pop) {
      this.drop(balloon);
      return;
    }
    this.tweens.add({
      targets: balloon.root,
      scale: 1.3,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => this.drop(balloon),
    });
  }

  private drop(balloon: Balloon): void {
    this.tweens.killTweensOf(balloon.root);
    balloon.root.destroy();
    this.balloons = this.balloons.filter((item) => item !== balloon);
  }

  // ---------- Слово собрано ----------

  private onWordSolved(): void {
    this.wordDone = true;
    this.dots?.fill(this.wordIndex);
    // Последнее слово — набор засчитан сразу: Esc в паузе до звезды его не отнимет.
    if (this.wordIndex + 1 >= this.words.length) markEnglishDone(this.setIndex, 'catch');
    audio.play('found');
    speech.say(this.word);

    for (const tile of this.slotTiles) tile.setTint(PALETTE.gold);
    this.slots.forEach((text, i) => {
      this.tweens.add({
        targets: text,
        y: SLOTS_Y - 30,
        duration: 170,
        delay: 240 + i * 70,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    });

    const sparks = this.add.particles(CX, SLOTS_Y, TEX.SPARKLE, {
      speed: { min: 80, max: 240 },
      angle: { min: 0, max: 360 },
      lifespan: 900,
      scale: { start: 1, end: 0 },
      quantity: 16,
      emitting: false,
    });
    sparks.setDepth(30);
    sparks.explode(16);

    this.time.delayedCall(SOLVED_PAUSE_MS, () => {
      sparks.destroy();
      this.nextWord();
    });
  }

  private nextWord(): void {
    if (this.finished) return;
    if (this.wordIndex + 1 >= this.words.length) {
      this.finished = true;
      finishEnglishGame(this, englishSet(this.setIndex).id, this.setIndex, 'catch');
      return;
    }

    for (const balloon of [...this.balloons]) this.drop(balloon);
    this.balloons = [];
    for (const tile of this.slotTiles) tile.destroy();
    for (const text of this.slots) text.destroy();
    for (const part of this.hint?.parts ?? []) part.destroy();
    this.slotTiles = [];
    this.slots = [];
    this.slotPositions = [];
    this.hint = null;
    this.startWord(this.wordIndex + 1);
  }
}
