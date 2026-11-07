/**
 * Задачка «Собери слово»: сверху большая картинка-подсказка, под ней пустые клетки,
 * внизу — перемешанные буквы слова и две лишние. Ребёнок тапает буквы по порядку.
 *
 * Проиграть нельзя: ошибочная буква только дрожит и остаётся на месте,
 * ошибки нигде не считаются. Три слова подряд, потом finishPuzzle.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { rowFit } from '../art/layout';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { wordSet } from '../data/questWords';
import type { WordPuzzle } from '../data/questWords';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { addLetterInput, pickByKey } from '../systems/letterInput';
import { makeRng } from '../systems/rng';
import { SCENE } from '../types';

// ---------- Раскладка (экран 1280x720, панель задачки: x 80..1200, y 100..680) ----------

const CX = GAME_WIDTH / 2;
/** Три точки прогресса; сам ряд рисует art/progressDots.ts. */
const DOTS_Y = 128;
/** Картинка-подсказка. */
const PICTURE_SIZE = 240;
const PICTURE_Y = 272;
/** Плашки букв — и в клетках, и внизу. */
const TILE = 110;
const SLOTS_Y = 470;
/** Ряд клеток под слово: шаг и размер считает тот же rowFit, что и ряд букв. */
const SLOTS_LEFT = 140;
const SLOTS_RIGHT = GAME_WIDTH - 140;
const SLOT_MAX_STEP = 124;
const SLOT_GAP = 14;
/**
 * Ряд букв внизу: симметрично от центра экрана, с отступом от краёв панели. Был
 * 170..1180 (кнопку «назад» когда-то ставили вниз) — на девяти буквах ТРИБУНЫ
 * ряд уезжал вправо на 35 px.
 */
const POOL_Y = GAME_HEIGHT - 108;
const POOL_LEFT = 130;
const POOL_RIGHT = GAME_WIDTH - 130;
const POOL_MAX_STEP = 130;
/** Просвет между соседними плитками: по нему же ужимается плитка. */
const TILE_GAP = 8;
const LETTER_FONT = CONFIG.ui.fontSizeBig + 8;

/** Сколько лишних букв подмешиваем к слову. */
const EXTRA_LETTERS = 2;
/** Для первоклассника без «трудных» букв: нет Ъ, Ь, Ы, Й, Ё (в самих словах они могут быть). */
const ALPHABET = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

const SOLVED_PAUSE_MS = 1200;

/** Одна буква внизу: плашка, текст и где она «живёт». */
interface LetterTile {
  char: string;
  /** Корень: положение, масштаб и зона касания. */
  root: Phaser.GameObjects.Container;
  /** Лицо плашки: дрожит отдельно от корня, чтобы не спорить с полётом. */
  face: Phaser.GameObjects.Container;
  tile: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  /** Номер клетки, в которой стоит буква, или -1, если лежит внизу. */
  slot: number;
}

export class PuzzleWordScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;
  private words: readonly WordPuzzle[] = [];
  private wordIndex = 0;
  private word = '';
  private slotPositions: Phaser.Math.Vector2[] = [];
  private slots: (LetterTile | null)[] = [];
  private tiles: LetterTile[] = [];
  /** Всё, что принадлежит текущему слову, — убираем одним махом. */
  private wordObjects: Phaser.GameObjects.GameObject[] = [];
  private dots: ProgressDots | null = null;
  private picture: Phaser.GameObjects.Image | null = null;
  private wordDone = false;
  private finished = false;
  private nextTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENE.PUZZLE_WORD);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
    this.words = wordSet(data.step, data.variant);
    this.wordIndex = 0;
    this.word = '';
    this.finished = false;
    this.wordDone = false;
    this.nextTimer = null;
    this.picture = null;
    this.dots = null;
    this.tiles = [];
    this.slots = [];
    this.slotPositions = [];
    this.wordObjects = [];
  }

  create(): void {
    addPuzzleBackdrop(this, 'Собери слово');
    this.createDots();
    // Клавиатура делает то же, что мышь: на ноутбуке набрать слово быстрее,
    // чем возить восемь плашек по экрану.
    addLetterInput(this, {
      type: (candidates) => this.typeLetter(candidates),
      erase: () => this.eraseLetter(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nextTimer?.remove(false);
      this.nextTimer = null;
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.wordObjects = [];
      this.tiles = [];
      this.slots = [];
      this.dots = null;
      this.picture = null;
    });

    if (this.words.length === 0) {
      // Набора нет — не оставляем ребёнка в тупике.
      finishPuzzle(this, this.puzzleData);
      this.finished = true;
    } else {
      this.startWord(0);
    }

    addBackToMap(this);
  }

  // ---------- Прогресс ----------

  private createDots(): void {
    this.dots = createProgressDots(this, { count: this.words.length, y: DOTS_Y });
  }

  // ---------- Построение слова ----------

  private startWord(index: number): void {
    const puzzle = this.words[index];
    if (puzzle === undefined) return;
    this.wordIndex = index;
    this.word = puzzle.word;
    this.wordDone = false;
    this.tiles = [];
    this.slots = Array.from({ length: puzzle.word.length }, () => null);
    this.slotPositions = [];

    // Картинка-подсказка: она объясняет задание без единой буквы.
    const picture = this.add
      .image(CX, PICTURE_Y, puzzle.icon)
      .setDisplaySize(PICTURE_SIZE, PICTURE_SIZE)
      .setDepth(3);
    const pictureScale = picture.scaleX;
    picture.setScale(pictureScale * 0.5).setAlpha(0);
    this.tweens.add({
      targets: picture,
      scale: pictureScale,
      alpha: 1,
      duration: 420,
      ease: 'Back.easeOut',
    });
    this.picture = picture;
    this.wordObjects.push(picture);

    // Буквы внизу: слово + лишние, перемешанные одинаково при каждом запуске.
    const rng = makeRng(5000 + this.puzzleData.variant * 13 + index);
    const inWord = new Set(puzzle.word.split(''));
    const candidates = rng.shuffle(ALPHABET.split('').filter((ch) => !inWord.has(ch)));
    const chars = rng.shuffle([...puzzle.word.split(''), ...candidates.slice(0, EXTRA_LETTERS)]);

    // Длинное слово ужимает плитки: при десяти буквах шаг выходит меньше
    // плитки, и они налезают друг на друга.
    const { size, spots } = rowFit(chars.length, POOL_LEFT, POOL_RIGHT, POOL_MAX_STEP, TILE, TILE_GAP);

    // Пустые клетки под слово: размер берём от буквы, иначе буква в клетку
    // не попадёт по размеру. Своя ширина ряда — клеток всегда меньше, чем букв.
    const slotFit = rowFit(puzzle.word.length, SLOTS_LEFT, SLOTS_RIGHT, SLOT_MAX_STEP, size, SLOT_GAP);
    slotFit.spots.forEach((x) => {
      const cell = this.add
        .image(x, SLOTS_Y, TEX.LETTER_TILE)
        .setDisplaySize(slotFit.size, slotFit.size)
        .setAlpha(0.3)
        .setDepth(2);
      this.wordObjects.push(cell);
      this.slotPositions.push(new Phaser.Math.Vector2(x, SLOTS_Y));
    });

    chars.forEach((char, i) => {
      const x = spots[i] ?? (POOL_LEFT + POOL_RIGHT) / 2;
      // Бледный след на месте буквы: видно, куда она вернётся.
      const mark = this.add
        .image(x, POOL_Y, TEX.LETTER_TILE)
        .setDisplaySize(size, size)
        .setAlpha(0.15)
        .setDepth(2);
      this.wordObjects.push(mark);
      this.tiles.push(this.createTile(char, x, POOL_Y, i, size));
    });
  }

  private createTile(char: string, x: number, y: number, order: number, size: number): LetterTile {
    const tile = this.add.image(0, 0, TEX.LETTER_TILE).setDisplaySize(size, size);
    const label = createText(this, 0, -2, char, Math.round(LETTER_FONT * (size / TILE)), PALETTE.uiText);
    const face = this.add.container(0, 0, [tile, label]);
    const root = this.add.container(x, y, [face]).setDepth(5);
    // Зона нажатия строится из того же size, что и рисунок, — разойтись они
    // не могут. Свой Rectangle(-half, -half) Phaser сдвигает ещё раз на
    // половину, и попадать надо было в левый верхний угол буквы.
    root.setSize(size, size);
    root.setInteractive({ useHandCursor: true });

    const letter: LetterTile = { char, root, face, tile, homeX: x, homeY: y, slot: -1 };
    root.on(Phaser.Input.Events.POINTER_DOWN, () => this.onTileTap(letter));

    // Появление с лёгкой задержкой по очереди.
    root.setScale(0);
    this.tweens.add({ targets: root, scale: 1, duration: 320, delay: 120 + order * 50, ease: 'Back.easeOut' });
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
    const tile = pickByKey(candidates, this.tiles);
    if (tile !== undefined) this.onTileTap(tile);
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

    // Уже в клетке — ребёнок передумал, возвращаем вниз.
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
      notePuzzleMistake(this);
      audio.play('tap', { pitch: 0.6, volume: 0.5 });
      this.shake(letter);
    }
  }

  /** Перелёт плашки: на время полёта она поверх всех остальных. */
  private flyTo(letter: LetterTile, x: number, y: number): void {
    this.tweens.killTweensOf(letter.root);
    letter.root.setDepth(20).setScale(1);
    this.tweens.add({
      targets: letter.root,
      x,
      y,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => letter.root.setDepth(5),
    });
    this.tweens.add({
      targets: letter.root,
      scale: { from: 1.18, to: 1 },
      duration: 280,
      ease: 'Sine.easeOut',
    });
  }

  /** Короткая дрожь: двигаем только «лицо», зона касания остаётся на месте. */
  private shake(letter: LetterTile): void {
    this.tweens.killTweensOf(letter.face);
    letter.face.setPosition(0, 0);
    this.tweens.chain({
      targets: letter.face,
      tweens: [
        { x: 12, duration: 45 },
        { x: -12, duration: 80 },
        { x: 8, duration: 70 },
        { x: -5, duration: 60 },
        { x: 0, duration: 45 },
      ],
    });
  }

  // ---------- Слово собрано ----------

  private onWordSolved(): void {
    this.wordDone = true;
    this.dots?.fill(this.wordIndex);
    audio.play('found');

    // Буквы золотятся и по очереди подпрыгивают — после того, как долетит последняя.
    this.slots.forEach((letter, i) => {
      if (letter === null) return;
      letter.tile.setTint(PALETTE.gold);
      this.tweens.add({
        targets: letter.root,
        y: letter.root.y - 36,
        duration: 190,
        delay: 320 + i * 70,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    });

    const picture = this.picture;
    if (picture !== null) {
      const base = picture.scaleX;
      this.tweens.add({
        targets: picture,
        scale: base * 1.12,
        duration: 220,
        delay: 300,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }

    const sparks = this.add.particles(CX, SLOTS_Y, TEX.SPARKLE, {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 900,
      scale: { start: 1, end: 0 },
      quantity: 18,
      emitting: false,
    });
    sparks.setDepth(30);
    sparks.explode(18);
    this.wordObjects.push(sparks);

    this.nextTimer = this.time.delayedCall(SOLVED_PAUSE_MS, () => this.nextWord());
  }

  private nextWord(): void {
    this.nextTimer = null;
    if (this.finished) return;

    if (this.wordIndex + 1 >= this.words.length) {
      this.finished = true;
      finishPuzzle(this, this.puzzleData);
      return;
    }

    // Убираем всё старое слово вместе с его твинами.
    for (const letter of this.tiles) this.tweens.killTweensOf(letter.face);
    for (const object of this.wordObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.wordObjects = [];
    this.tiles = [];
    this.picture = null;
    this.startWord(this.wordIndex + 1);
  }
}
