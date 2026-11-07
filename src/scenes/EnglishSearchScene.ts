/**
 * «Найди слово»: поле 7×7, в нём спрятаны пять слов набора.
 *
 * Слово ищут так, как его пишут, — буква за буквой. Клик по первой букве
 * слова на его месте начинает путь, каждый следующий клик по следующей букве
 * продолжает его, последняя буква — слово найдено. То же делает мышь с
 * нажатой кнопкой: провёл по буквам — слово. Неверная буква дрожит, выбранные
 * остаются; клик по выбранной снимает её и всё после, Esc — весь путь.
 * Нажатие на выбранную путь не трогает: снимает её отпускание на той же плитке
 * без протягивания (systems/wordPick.ts).
 * Раньше слово отмечалось двумя тапами (первая и последняя буква), и ребёнок
 * не понимал, чего от него хотят.
 *
 * Слова лежат только слева направо и сверху вниз. Поле строит
 * systems/wordGrid.ts (там же досыпка букв по правилам wordFill.ts), путь
 * считает systems/wordPick.ts — сцена только показывает результат.
 *
 * Поле каждый раз новое: seed берётся случайный, если его не передали
 * (`?shots` и e2e передают свой, чтобы кадр и сценарий были повторяемы).
 */
import Phaser from 'phaser';
import {
  ENGLISH_LIST,
  SEARCH_DOTS_Y,
  SEARCH_GRID,
  SEARCH_LIT_SCALE,
  searchCellAt,
  searchCellCenter,
} from '../art/englishLayout';
import { TEX } from '../art/keys';
import { hex, PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { englishSet, type EnglishWord } from '../data/english';
import { randomSeed } from '../systems/rng';
import { speech } from '../systems/speech';
import { buildWordGrid, type Placement, type WordGrid } from '../systems/wordGrid';
import { createWordPick, placementCells, type PickResult, type WordPick } from '../systems/wordPick';
import { SCENE, type EnglishGameData } from '../types';
import {
  addBackToEnglish,
  addEnglishBackdrop,
  createHintButton,
  createSpeakButton,
  createWordMark,
  finishEnglishGame,
  markEnglishDone,
  type Hint,
} from './englishUi';

/** Найденное слово в списке: приглушено цветом, а не прозрачностью. */
const FOUND_WORD_COLOR = PALETTE.uiButtonCalmDark;

type ScaleTarget = Phaser.GameObjects.Image | Phaser.GameObjects.Text;

interface Cell {
  row: number;
  col: number;
  tile: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  /** Масштаб в покое: плитка и буква каждая от своего, иначе буква сплющится. */
  tileScale: number;
  textScale: number;
  /** Свои места: дрожь возвращает сюда, а не туда, где её застали. */
  x: number;
  y: number;
  /** Клетка попала в найденное слово — больше не гаснет. */
  found: boolean;
  /** Клетка сейчас в выбранном пути. */
  lit: boolean;
  /** Идущие сейчас твины масштаба: новый сперва останавливает их. */
  scaling: Phaser.Tweens.Tween[];
  shake: Phaser.Tweens.TweenChain | null;
}

interface WordRow {
  word: EnglishWord;
  text: Phaser.GameObjects.Text;
  hint: Hint;
}

export class EnglishSearchScene extends Phaser.Scene {
  private setIndex = 0;
  private seed = 0;
  private words: readonly EnglishWord[] = [];
  private grid: WordGrid | null = null;
  private pick: WordPick | null = null;
  private cells: Cell[] = [];
  private rows: WordRow[] = [];
  private dots: ProgressDots | null = null;
  /** Кнопка мыши нажата на поле: движение по буквам тянет путь. */
  private pressed = false;
  private finished = false;

  constructor() {
    super(SCENE.ENGLISH_SEARCH);
  }

  init(data: EnglishGameData): void {
    this.setIndex = data.setIndex;
    this.seed = data.seed ?? randomSeed();
    this.words = englishSet(data.setIndex).words;
    this.cells = [];
    this.rows = [];
    this.grid = null;
    this.pick = null;
    this.dots = null;
    this.pressed = false;
    this.finished = false;
  }

  create(): void {
    addEnglishBackdrop(this, 'Find a word');
    this.dots = createProgressDots(this, { count: this.words.length, y: SEARCH_DOTS_Y });

    this.grid = buildWordGrid(
      this.words.map((word) => word.en),
      SEARCH_GRID.size,
      this.seed,
    );
    this.pick = createWordPick(this.grid.placements);

    this.buildCells();
    this.buildList();
    createSpeakButton(this, ENGLISH_LIST.x + ENGLISH_LIST.speakDx, ENGLISH_LIST.speakY, () =>
      this.nextUnfound(),
    );
    // Esc сперва снимает путь, и только с пустым путём выходит, как везде.
    addBackToEnglish(this, this.setIndex, () => this.cancelPath());

    // Плитку под рукой считаем по координатам, а не по «вошла в плитку»: так
    // протягивание, начатое у самого края, не теряет соседнюю плитку, а дрожь
    // руки на стыке — не добавляет лишнюю. Кнопку могут отпустить где угодно:
    // за полем, за краем окна.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      this.onMove(pointer),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) =>
      this.onRelease(pointer),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (pointer: Phaser.Input.Pointer) =>
      this.onRelease(pointer),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      speech.stop();
      this.cells = [];
      this.rows = [];
    });
  }

  /** Первое ещё не найденное слово — его и произносит кнопка. */
  private nextUnfound(): string {
    const word = this.words.find((item) => this.pick?.isFound(item.en) !== true);
    return word?.en ?? '';
  }

  // ---------- Поле ----------

  private buildCells(): void {
    const grid = this.grid;
    if (grid === null) return;
    const { size, cell: side } = SEARCH_GRID;

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const { x, y } = searchCellCenter(row, col);
        // Плитки не полупрозрачные: сквозь альфу просвечивает фон, и плитка
        // читается как сломанная, а не как обычная.
        const tile = this.add.image(x, y, TEX.LETTER_TILE).setDisplaySize(side, side).setDepth(2);
        const char = grid.letters[row]?.[col] ?? '?';
        const text = createText(this, x, y - 2, char, Math.round(side * 0.52), PALETTE.uiText);
        text.setDepth(3);

        const cell: Cell = {
          row,
          col,
          tile,
          text,
          tileScale: tile.scale,
          textScale: text.scale,
          x,
          y,
          found: false,
          lit: false,
          scaling: [],
          shake: null,
        };
        tile.setInteractive({ useHandCursor: true });
        tile.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) =>
          this.onDown(cell, pointer),
        );
        this.cells.push(cell);
      }
    }
  }

  private buildList(): void {
    const { x, top, step, icon, iconX, wordLeft } = ENGLISH_LIST;
    this.words.forEach((word, i) => {
      const y = top + i * step;
      const say = (): void => {
        audio.unlock();
        speech.warmUp();
        speech.say(word.en);
      };
      // Что искать: картинка (или пятно цвета) слева от слова. Ребёнок, который
      // слово не прочёл, видит, о чём речь.
      const mark = createWordMark(this, iconX, y, word, icon);
      if (mark !== null) {
        mark.setDepth(3);
        mark.setInteractive({ useHandCursor: true });
        mark.on(Phaser.Input.Events.POINTER_DOWN, say);
      }
      const text = createText(this, wordLeft, y, word.en, 40, PALETTE.uiText)
        .setOrigin(0, 0.5)
        .setDepth(3);
      // Перевод — последняя подсказка, за «?».
      const hint = createHintButton(this, x + ENGLISH_LIST.hintDx, y, word.ru, {
        depth: 3,
        size: ENGLISH_LIST.hintTextSize,
        // Уже обычной: рядом стоят соседние строки списка, и широкая зона
        // перехватывала бы нажатия у них.
        hit: 64,
      });
      text.setInteractive({ useHandCursor: true });
      text.on(Phaser.Input.Events.POINTER_DOWN, say);
      this.rows.push({ word, text, hint });
    });
  }

  // ---------- Нажатия ----------

  private onDown(cell: Cell, pointer: Phaser.Input.Pointer): void {
    // Жест начинает только левая кнопка (002-31): правая открывает меню браузера
    // и отпускания в игру не пришлёт (002-25), средняя и боковые не значат ничего.
    // 002-33: отвечаем на событие именно левой кнопки (`button`), а не на то, что
    // левая сейчас зажата: правая, нажатая поверх зажатой левой, иначе стала бы нажатием.
    if (this.finished || pointer.button !== 0 || !pointer.leftButtonDown()) return;
    audio.unlock();
    speech.warmUp();
    this.pressed = true;
    this.apply(cell, this.pick?.press(cell, this.time.now));
  }

  private cellAt(pointer: Phaser.Input.Pointer): Cell | null {
    const where = searchCellAt(pointer.x, pointer.y);
    if (where === null) return null;
    return this.cells.find((item) => item.row === where.row && item.col === where.col) ?? null;
  }

  /** Мышь с нажатой кнопкой над полем: путь тянется молча, пока ведут. */
  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.finished || !this.pressed) return;
    // Кнопки уже нет, а отпускания не было (alt-tab посреди протягивания): жест
    // гаснет без вердикта (002-28). Ребёнок ничего не отпускал на плитке под
    // курсором, и «неверно» или снятая буква были бы ему ни к чему.
    if (pointer.noButtonDown()) {
      this.pressed = false;
      this.pick?.abort();
      return;
    }
    const travelled = Phaser.Math.Distance.Between(
      pointer.downX,
      pointer.downY,
      pointer.x,
      pointer.y,
    );
    const cell = this.cellAt(pointer);
    this.apply(cell, this.pick?.drag(cell, travelled, this.time.now));
  }

  /**
   * Кнопку отпустили. Решает путь (`wordPick.release`): на выбранной без
   * протягивания — снять; если мышь тянули и остановили на букве, которая пути
   * не продолжает, — это неверная буква, и она дрожит. Пока вели, молчим:
   * по диагонали мышь всегда цепляет чужие плитки по дороге.
   */
  private onRelease(pointer: Phaser.Input.Pointer): void {
    // Отпустили не левую (002-33): жест левой кнопки продолжается, отпускание чужой его не кончает.
    if (pointer.button !== 0 || !this.pressed) return;
    this.pressed = false;
    if (this.finished) return;
    this.apply(this.cellAt(pointer), this.pick?.release(searchCellAt(pointer.x, pointer.y)));
  }

  private apply(cell: Cell | null, result: PickResult | undefined): void {
    if (result === undefined || result.kind === 'ignore') return;
    const length = this.pick?.path.length ?? 0;
    switch (result.kind) {
      case 'start':
      case 'extend':
        audio.play('tap', { pitch: 1.05 + 0.05 * length, volume: 0.7 });
        break;
      case 'trim':
        audio.play('tap', { pitch: 0.85, volume: 0.6 });
        break;
      case 'wrong':
        audio.play('tap', { pitch: 0.6, volume: 0.5 });
        if (cell !== null) this.shakeCell(cell);
        break;
      case 'found':
        this.markFound(result.place);
        break;
    }
    this.showPath();
  }

  /** Esc: с выбранным путём снять его и остаться, с пустым — выйти. */
  private cancelPath(): boolean {
    const pick = this.pick;
    if (pick === null || pick.path.length === 0) return false;
    pick.clear();
    audio.play('tap', { pitch: 0.85, volume: 0.6 });
    this.showPath();
    return true;
  }

  // ---------- Что нарисовано ----------

  /** Подсветить ровно те плитки, что в пути, — и погасить остальные. */
  private showPath(): void {
    const path = this.pick?.path ?? [];
    for (const cell of this.cells) {
      const lit = path.some((item) => item.row === cell.row && item.col === cell.col);
      if (lit === cell.lit) continue;
      cell.lit = lit;
      this.paint(cell);
      this.scaleTo(cell, lit ? SEARCH_LIT_SCALE : 1);
    }
  }

  /** Цвет плитки: выбрана — оранжевая, найдена — золотая, иначе своя. */
  private paint(cell: Cell): void {
    if (cell.lit) cell.tile.setTint(PALETTE.uiButton);
    else if (cell.found) cell.tile.setTint(PALETTE.gold);
    else cell.tile.clearTint();
  }

  /** Плитка и буква с их покойными масштабами: анимируются порознь. */
  private parts(cell: Cell): [ScaleTarget, number][] {
    return [
      [cell.tile, cell.tileScale],
      [cell.text, cell.textScale],
    ];
  }

  /** Остановить твины масштаба плитки и вернуть её с буквой к покою. */
  private resetScale(cell: Cell): void {
    for (const tween of cell.scaling) tween.stop();
    cell.scaling = [];
    cell.tile.setScale(cell.tileScale);
    cell.text.setScale(cell.textScale);
  }

  /**
   * Довести плитку и её букву до `k`-кратного покоя.
   *
   * Каждая считается от своего масштаба в покое, а не от текущего: твин «от
   * текущего ×1,08» накапливался с каждой неверной парой, и плитки расползались
   * по полю. Плашка и буква масштабируются порознь: у плашки свой масштаб от
   * setDisplaySize, и общий твин сплющил бы букву до его величины.
   */
  private scaleTo(cell: Cell, k: number): void {
    for (const tween of cell.scaling) tween.stop();
    cell.scaling = this.parts(cell).map(([target, base]) =>
      this.tweens.add({ targets: target, scale: base * k, duration: 120, ease: 'Sine.easeOut' }),
    );
  }

  private shakeCell(cell: Cell): void {
    cell.shake?.stop();
    cell.tile.x = cell.x;
    cell.text.x = cell.x;
    cell.shake = this.tweens.chain({
      targets: [cell.tile, cell.text],
      tweens: [
        { x: cell.x + 8, duration: 50 },
        { x: cell.x - 8, duration: 80 },
        { x: cell.x, duration: 60 },
      ],
    });
  }

  /** Слово найдено: буквы золотятся, слово звучит, строка в списке гаснет. */
  private markFound(place: Placement): void {
    audio.play('found');
    speech.say(place.word);

    placementCells(place).forEach((where, i) => {
      const cell = this.cells.find((item) => item.row === where.row && item.col === where.col);
      if (cell === undefined) return;
      cell.found = true;
      cell.lit = false;
      this.paint(cell);
      this.resetScale(cell);
      // Хлопок: чуть крупнее и обратно, по очереди вдоль слова — каждая от своего покоя.
      cell.scaling = this.parts(cell).map(([target, base]) =>
        this.tweens.add({
          targets: target,
          scale: { from: base * 1.25, to: base },
          duration: 320,
          delay: i * 70,
          ease: 'Back.easeOut',
        }),
      );
    });

    // Точка — по числу найденных, а не по номеру слова: слова находят в любом
    // порядке, и по номеру в ряду оставалась бы дыра (002-20).
    const total = this.words.filter((item) => this.pick?.isFound(item.en) === true).length;
    this.dots?.fill(total - 1);
    const row = this.rows.find((item) => item.word.en === place.word);
    if (row !== undefined) {
      row.text.setColor(hex(FOUND_WORD_COLOR));
      row.hint.dim();
    }

    if (this.words.every((word) => this.pick?.isFound(word.en) === true)) {
      this.finished = true;
      // Набор засчитан сразу, а не после праздника: Esc в эти 900 мс не должен его отнять.
      markEnglishDone(this.setIndex, 'search');
      this.time.delayedCall(900, () => {
        finishEnglishGame(this, englishSet(this.setIndex).id, this.setIndex, 'search');
      });
    }
  }
}
