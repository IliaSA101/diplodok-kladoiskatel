/**
 * «Найди слово»: поле 7×7, в нём спрятаны пять слов набора.
 *
 * Слово отмечается двумя тапами — первая буква и последняя. Тянуть пальцем
 * по планшету семилетке тяжело, а два тапа он делает уверенно. Слова лежат
 * только слева направо и сверху вниз: задом наперёд первокласснику рано.
 *
 * Само поле строит systems/wordGrid.ts — там же проверка, что лишних слов
 * в случайных буквах не появилось.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { ENGLISH_LIST } from '../art/layout';
import { PALETTE } from '../art/palette';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { englishSet, type EnglishWord } from '../data/english';
import { speech } from '../systems/speech';
import { buildWordGrid, wordAt, type Placement, type WordGrid } from '../systems/wordGrid';
import { SCENE, type EnglishGameData } from '../types';
import {
  addBackToEnglish,
  addEnglishBackdrop,
  createHintButton,
  createSpeakButton,
  finishEnglishGame,
  type Hint,
} from './englishUi';

const GRID_SIZE = 7;
const CELL = 68;
const CELL_GAP = 6;
const GRID_CX = 400;
const GRID_CY = 410;
const DOTS_Y = 126;

/** Список слов справа от поля. */
const LIST_X = ENGLISH_LIST.x;
const LIST_TOP = ENGLISH_LIST.top;
const LIST_STEP = ENGLISH_LIST.step;

interface Cell {
  row: number;
  col: number;
  tile: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  /** Клетка попала в найденное слово — больше не гаснет. */
  found: boolean;
}

interface WordRow {
  word: EnglishWord;
  text: Phaser.GameObjects.Text;
  hint: Hint;
}

export class EnglishSearchScene extends Phaser.Scene {
  private setIndex = 0;
  private words: readonly EnglishWord[] = [];
  private grid: WordGrid | null = null;
  private cells: Cell[] = [];
  private rows: WordRow[] = [];
  private dots: ProgressDots | null = null;
  private first: Cell | null = null;
  private foundWords = new Set<string>();
  private finished = false;

  constructor() {
    super(SCENE.ENGLISH_SEARCH);
  }

  init(data: EnglishGameData): void {
    this.setIndex = data.setIndex;
    this.words = englishSet(data.setIndex).words;
    this.cells = [];
    this.rows = [];
    this.grid = null;
    this.dots = null;
    this.first = null;
    this.foundWords = new Set();
    this.finished = false;
  }

  create(): void {
    addEnglishBackdrop(this, 'Find a word');
    this.dots = createProgressDots(this, { count: this.words.length, y: DOTS_Y });

    // Одно и то же поле при каждом заходе: ребёнок возвращается к знакомым буквам.
    this.grid = buildWordGrid(
      this.words.map((word) => word.en),
      GRID_SIZE,
      4200 + this.setIndex * 97,
    );

    this.buildCells();
    this.buildList();
    createSpeakButton(this, LIST_X + ENGLISH_LIST.speakDx, ENGLISH_LIST.speakY, () =>
      this.nextUnfound(),
    );
    addBackToEnglish(this, this.setIndex);

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
    const word = this.words.find((item) => !this.foundWords.has(item.en));
    return word?.en ?? '';
  }

  // ---------- Поле ----------

  private buildCells(): void {
    const grid = this.grid;
    if (grid === null) return;
    const step = CELL + CELL_GAP;
    const left = GRID_CX - ((GRID_SIZE - 1) * step) / 2;
    const top = GRID_CY - ((GRID_SIZE - 1) * step) / 2;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = left + col * step;
        const y = top + row * step;
        const tile = this.add
          .image(x, y, TEX.LETTER_TILE)
          .setDisplaySize(CELL, CELL)
          .setDepth(2)
          .setAlpha(0.92);
        const char = grid.letters[row]?.[col] ?? '?';
        const text = createText(this, x, y - 2, char, Math.round(CELL * 0.52), PALETTE.uiText);
        text.setDepth(3);

        const cell: Cell = { row, col, tile, text, found: false };
        tile.setInteractive({ useHandCursor: true });
        tile.on(Phaser.Input.Events.POINTER_DOWN, () => this.onCellTap(cell));
        this.cells.push(cell);
      }
    }
  }

  private buildList(): void {
    this.words.forEach((word, i) => {
      const y = LIST_TOP + i * LIST_STEP;
      const text = createText(this, LIST_X, y, word.en, 40, PALETTE.uiText).setDepth(3);
      // Перевод тут был просто подписью — теперь он за «?».
      const hint = createHintButton(this, LIST_X + ENGLISH_LIST.hintDx, y, word.ru, {
        depth: 3,
        size: 28,
        // Уже обычной: рядом стоят соседние строки списка, и широкая зона
        // перехватывала бы нажатия у них.
        hit: 64,
      });
      text.setInteractive({ useHandCursor: true });
      text.on(Phaser.Input.Events.POINTER_DOWN, () => {
        audio.unlock();
        speech.warmUp();
        speech.say(word.en);
      });
      this.rows.push({ word, text, hint });
    });
  }

  // ---------- Тапы ----------

  private onCellTap(cell: Cell): void {
    if (this.finished) return;
    audio.unlock();
    speech.warmUp();

    const first = this.first;
    if (first === null) {
      this.first = cell;
      this.highlight(cell, true);
      audio.play('tap', { pitch: 1.1, volume: 0.7 });
      return;
    }

    // Тап по той же клетке — передумал.
    if (first === cell) {
      this.clearSelection();
      audio.play('tap', { pitch: 0.85, volume: 0.6 });
      return;
    }

    const grid = this.grid;
    const place = grid === null ? null : wordAt(grid, first, cell);
    if (place === null || this.foundWords.has(place.word)) {
      audio.play('tap', { pitch: 0.6, volume: 0.5 });
      this.shakeCell(cell);
      this.clearSelection();
      return;
    }

    this.clearSelection();
    this.markFound(place);
  }

  private highlight(cell: Cell, on: boolean): void {
    if (cell.found) return;
    cell.tile.setTint(on ? PALETTE.uiButton : 0xffffff);
    if (!on) cell.tile.clearTint();
    this.tweens.add({
      targets: cell.tile,
      scale: { from: cell.tile.scale, to: cell.tile.scale * (on ? 1.08 : 1) },
      duration: 120,
      ease: 'Sine.easeOut',
    });
  }

  private clearSelection(): void {
    if (this.first !== null) this.highlight(this.first, false);
    this.first = null;
  }

  private shakeCell(cell: Cell): void {
    const x = cell.tile.x;
    this.tweens.chain({
      targets: [cell.tile, cell.text],
      tweens: [
        { x: x + 8, duration: 50 },
        { x: x - 8, duration: 80 },
        { x, duration: 60 },
      ],
    });
  }

  /** Слово найдено: буквы золотятся, слово звучит, строка в списке гаснет. */
  private markFound(place: Placement): void {
    this.foundWords.add(place.word);
    audio.play('found');
    speech.say(place.word);

    for (let i = 0; i < place.word.length; i += 1) {
      const row = place.row + (place.horizontal ? 0 : i);
      const col = place.col + (place.horizontal ? i : 0);
      const cell = this.cells.find((item) => item.row === row && item.col === col);
      if (cell === undefined) continue;
      cell.found = true;
      cell.tile.clearTint();
      cell.tile.setTint(PALETTE.gold);
      // Плашка и буква масштабируются порознь: у плашки свой масштаб от
      // setDisplaySize, и общий твин сплющил бы букву до его величины.
      for (const target of [cell.tile, cell.text]) {
        this.tweens.add({
          targets: target,
          scale: { from: target.scale * 1.25, to: target.scale },
          duration: 320,
          delay: i * 70,
          ease: 'Back.easeOut',
        });
      }
    }

    const index = this.words.findIndex((item) => item.en === place.word);
    this.dots?.fill(index < 0 ? 0 : index);
    const row = this.rows.find((item) => item.word.en === place.word);
    if (row !== undefined) {
      row.text.setColor('#caa21f');
      row.text.setAlpha(0.6);
      row.hint.dim();
    }

    if (this.foundWords.size >= this.words.length) {
      this.finished = true;
      this.time.delayedCall(900, () => {
        finishEnglishGame(this, englishSet(this.setIndex).id, this.setIndex, 'search');
      });
    }
  }
}
