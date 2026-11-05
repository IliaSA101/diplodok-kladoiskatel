/**
 * «Собери слово»: слово звучит голосом, перевод написан по-русски,
 * внизу лежат его буквы вперемешку и одна лишняя.
 *
 * Проиграть нельзя: неверная буква дрожит и остаётся на месте, ошибки нигде
 * не считаются. Пять слов набора — и ветка засчитана.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { rowFit } from '../art/layout';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { englishSet, type EnglishWord } from '../data/english';
import { addLetterInput } from '../systems/letterInput';
import { makeRng } from '../systems/rng';
import { speech } from '../systems/speech';
import { SCENE, type EnglishGameData } from '../types';
import {
  addBackToEnglish,
  addEnglishBackdrop,
  createSpeakButton,
  createWordPrompt,
  finishEnglishGame,
} from './englishUi';

const CX = GAME_WIDTH / 2;
const DOTS_Y = 126;
const WORD_Y = 232;
const SLOTS_Y = 410;
const POOL_Y = GAME_HEIGHT - 120;

const TILE = 104;
const TILE_GAP = 10;
const ROW_LEFT = 200;
const ROW_RIGHT = GAME_WIDTH - 200;
const MAX_STEP = 124;

/** Одна лишняя буква: выбор есть, но перебирать нечего. */
const EXTRA_LETTERS = 1;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SOLVED_PAUSE_MS = 1500;

interface LetterTile {
  char: string;
  root: Phaser.GameObjects.Container;
  /** Лицо дрожит отдельно от корня, чтобы не спорить с полётом. */
  face: Phaser.GameObjects.Container;
  tile: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  slot: number;
}

export class EnglishAnagramScene extends Phaser.Scene {
  private setIndex = 0;
  private words: readonly EnglishWord[] = [];
  private wordIndex = 0;
  private word = '';
  private dots: ProgressDots | null = null;
  private slotPositions: Phaser.Math.Vector2[] = [];
  private slots: (LetterTile | null)[] = [];
  private tiles: LetterTile[] = [];
  /** Всё, что принадлежит текущему слову: убирается одним махом. */
  private wordObjects: Phaser.GameObjects.GameObject[] = [];
  private wordDone = false;
  private finished = false;

  constructor() {
    super(SCENE.ENGLISH_ANAGRAM);
  }

  init(data: EnglishGameData): void {
    this.setIndex = data.setIndex;
    this.words = englishSet(data.setIndex).words;
    this.wordIndex = 0;
    this.wordDone = false;
    this.finished = false;
    this.dots = null;
    this.slotPositions = [];
    this.slots = [];
    this.tiles = [];
    this.wordObjects = [];
  }

  create(): void {
    addEnglishBackdrop(this, 'Make a word');
    // Клавиатура делает то же, что мышь: на ноутбуке набрать слово быстрее,
    // чем возить восемь плашек по экрану.
    addLetterInput(this, {
      type: (candidates) => this.typeLetter(candidates),
      erase: () => this.eraseLetter(),
    });
    this.dots = createProgressDots(this, { count: this.words.length, y: DOTS_Y });
    createSpeakButton(this, CX - 330, WORD_Y + 10, () => this.word);
    addBackToEnglish(this, this.setIndex);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      speech.stop();
      this.wordObjects = [];
      this.tiles = [];
      this.slots = [];
    });

    this.startWord(0);
  }

  // ---------- Одно слово ----------

  private startWord(index: number): void {
    const puzzle = this.words[index];
    if (puzzle === undefined) return;
    this.wordIndex = index;
    this.word = puzzle.en;
    this.wordDone = false;
    this.tiles = [];
    this.slots = Array.from({ length: puzzle.en.length }, () => null);
    this.slotPositions = [];

    // Задание — английская подсказка (фраза с пропуском, пятно цвета, картинка).
    // Перевод рядом, за «?»: без него не разгадавший ребус застрял бы.
    const prompt = createWordPrompt(this, CX, WORD_Y, puzzle, { clueBelow: true });
    this.wordObjects.push(...prompt.parts);
    this.time.delayedCall(260, () => {
      if (!this.finished) speech.say(puzzle.en);
    });

    // Буквы слова и одна лишняя, перемешанные одинаково при каждом запуске.
    const rng = makeRng(7100 + this.setIndex * 31 + index * 7);
    const inWord = new Set(puzzle.en.split(''));
    const spare = rng.shuffle(ALPHABET.split('').filter((ch) => !inWord.has(ch)));
    const chars = rng.shuffle([...puzzle.en.split(''), ...spare.slice(0, EXTRA_LETTERS)]);

    const pool = rowFit(chars.length, ROW_LEFT, ROW_RIGHT, MAX_STEP, TILE, TILE_GAP);
    const cells = rowFit(puzzle.en.length, ROW_LEFT, ROW_RIGHT, MAX_STEP, pool.size, TILE_GAP + 4);

    cells.spots.forEach((x) => {
      const cell = this.add
        .image(x, SLOTS_Y, TEX.LETTER_TILE)
        .setDisplaySize(cells.size, cells.size)
        .setAlpha(0.3)
        .setDepth(2);
      this.wordObjects.push(cell);
      this.slotPositions.push(new Phaser.Math.Vector2(x, SLOTS_Y));
    });

    chars.forEach((char, i) => {
      const x = pool.spots[i] ?? CX;
      const mark = this.add
        .image(x, POOL_Y, TEX.LETTER_TILE)
        .setDisplaySize(pool.size, pool.size)
        .setAlpha(0.15)
        .setDepth(2);
      this.wordObjects.push(mark);
      this.tiles.push(this.createTile(char, x, POOL_Y, i, pool.size));
    });
  }

  private createTile(char: string, x: number, y: number, order: number, size: number): LetterTile {
    const tile = this.add.image(0, 0, TEX.LETTER_TILE).setDisplaySize(size, size);
    const label = createText(this, 0, -2, char, Math.round(size * 0.58), PALETTE.uiText);
    const face = this.add.container(0, 0, [tile, label]);
    const root = this.add.container(x, y, [face]).setDepth(5);
    // Зона нажатия строится из того же size, что и рисунок: разойтись они
    // не могут. Свой Rectangle Phaser сдвигает ещё раз на половину стороны.
    root.setSize(size, size);
    root.setInteractive({ useHandCursor: true });

    const letter: LetterTile = { char, root, face, tile, homeX: x, homeY: y, slot: -1 };
    root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onTileTap(letter));

    root.setScale(0);
    this.tweens.add({
      targets: root,
      scale: 1,
      duration: 320,
      delay: 120 + order * 50,
      ease: 'Back.easeOut',
    });
    this.wordObjects.push(root);
    return letter;
  }

  // ---------- Тапы ----------

  /**
   * Нажата клавиша: это то же самое, что тап по плашке с этой буквой.
   *
   * Кандидатов несколько — на клавише две буквы, по одной на раскладку.
   * Берём первого, для кого внизу нашлась неиспользованная плашка; если не
   * нашлось ни одного, нажатие молча пропадает: пищать на каждую лишнюю
   * клавишу значит ругать ребёнка за то, что он трогает клавиатуру.
   */
  private typeLetter(candidates: string[]): void {
    if (this.wordDone || this.finished) return;
    for (const char of candidates) {
      const tile = this.tiles.find((one) => one.slot < 0 && one.char === char);
      if (tile !== undefined) {
        this.onTileTap(tile);
        return;
      }
    }
  }

  /** Backspace: вниз возвращается последняя поставленная буква. */
  private eraseLetter(): void {
    if (this.wordDone || this.finished) return;
    for (let i = this.slots.length - 1; i >= 0; i -= 1) {
      const tile = this.slots[i];
      if (tile !== null && tile !== undefined) {
        this.onTileTap(tile);
        return;
      }
    }
  }

  private onTileTap(letter: LetterTile): void {
    if (this.wordDone || this.finished) return;
    audio.unlock();
    speech.warmUp();

    if (letter.slot >= 0) {
      this.slots[letter.slot] = null;
      letter.slot = -1;
      audio.play('tap', { pitch: 0.85 });
      this.flyTo(letter, letter.homeX, letter.homeY);
      return;
    }

    const target = this.slots.indexOf(null);
    if (target < 0) return;

    if (letter.char === this.word.charAt(target)) {
      const pos = this.slotPositions[target];
      if (pos === undefined) return;
      this.slots[target] = letter;
      letter.slot = target;
      audio.play('tap');
      this.flyTo(letter, pos.x, pos.y);
      if (this.slots.every((item) => item !== null)) this.onWordSolved();
    } else {
      audio.play('tap', { pitch: 0.6, volume: 0.5 });
      this.shake(letter);
    }
  }

  private flyTo(letter: LetterTile, x: number, y: number): void {
    this.tweens.killTweensOf(letter.root);
    letter.root.setDepth(20).setScale(1);
    this.tweens.add({
      targets: letter.root,
      x,
      y,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => letter.root.setDepth(5),
    });
    this.tweens.add({
      targets: letter.root,
      scale: { from: 1.18, to: 1 },
      duration: 260,
      ease: 'Sine.easeOut',
    });
  }

  private shake(letter: LetterTile): void {
    this.tweens.killTweensOf(letter.face);
    letter.face.setPosition(0, 0);
    this.tweens.chain({
      targets: letter.face,
      tweens: [
        { x: 12, duration: 45 },
        { x: -12, duration: 80 },
        { x: 8, duration: 70 },
        { x: 0, duration: 50 },
      ],
    });
  }

  // ---------- Слово собрано ----------

  private onWordSolved(): void {
    this.wordDone = true;
    this.dots?.fill(this.wordIndex);
    audio.play('found');
    // Собранное слово тут же звучит целиком: буквы сложились в то, что слышно.
    speech.say(this.word);

    this.slots.forEach((letter, i) => {
      if (letter === null) return;
      letter.tile.setTint(PALETTE.gold);
      this.tweens.add({
        targets: letter.root,
        y: letter.root.y - 32,
        duration: 180,
        delay: 300 + i * 70,
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
    this.wordObjects.push(sparks);

    this.time.delayedCall(SOLVED_PAUSE_MS, () => this.nextWord());
  }

  private nextWord(): void {
    if (this.finished) return;
    if (this.wordIndex + 1 >= this.words.length) {
      this.finished = true;
      finishEnglishGame(this, englishSet(this.setIndex).id, this.setIndex, 'anagram');
      return;
    }

    for (const letter of this.tiles) this.tweens.killTweensOf(letter.face);
    for (const object of this.wordObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.wordObjects = [];
    this.tiles = [];
    this.startWord(this.wordIndex + 1);
  }
}
