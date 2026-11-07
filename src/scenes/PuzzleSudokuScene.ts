/**
 * Футбольное судоку для первоклассника: вместо цифр — мяч, бутса, свисток и кубок.
 *
 * Проиграть нельзя: неподходящий значок просто не ставится (клетка дрожит, тихий звук).
 * Головоломка строится детерминированно из SUDOKU_SEEDS[variant]: один вариант — одно поле.
 *
 * Сторона поля — от ступени: 4×4 на четырёх значках или 6×6 на шести. Правила поля
 * живут в `systems/sudokuBoard.ts`, числа раскладки — в `art/layout.ts`, и только
 * поэтому их проверяет тест. Здесь остались клетки, палитра и анимации.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { SUDOKU_BOARD, sudokuLayout, sudokuToolSpot } from '../art/sudokuLayout';
import type { SudokuLayout } from '../art/sudokuLayout';
import { PALETTE } from '../art/palette';
import { audio } from '../audio/AudioEngine';
import { sudokuLevel, sudokuSeed } from '../data/questDeals';
import { addBackToMap, addPuzzleBackdrop, finishPuzzle, notePuzzleMistake } from '../systems/quest';
import type { PuzzleSceneData } from '../systems/quest';
import { SUDOKU_EMPTY, buildSudoku, hasConflict } from '../systems/sudokuBoard';
import type { SudokuShape } from '../systems/sudokuBoard';
import { SCENE } from '../types';

/** Значки по номерам 0..5: мяч, бутса, свисток, кубок, перчатка, флаг. */
const SYMBOL_KEYS: readonly string[] = [
  TEX.FOOT[0],
  TEX.FOOT[1],
  TEX.FOOT[2],
  TEX.FOOT[3],
  TEX.FOOT[4],
  TEX.FOOT[5],
];

const COLOR_FIXED = 0xd9c3a0;
const COLOR_EMPTY = PALETTE.uiPanel;
const COLOR_FRAME = PALETTE.gold;
const COLOR_BOARD = PALETTE.uiText;

/** Что выбрано в палитре: номер значка, ластик или ничего. */
type Tool = number | 'erase' | null;

interface CellView {
  container: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  x: number;
  y: number;
}

interface ToolButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  tool: Exclude<Tool, null>;
}

export class PuzzleSudokuScene extends Phaser.Scene {
  private puzzleData!: PuzzleSceneData;

  private shape!: SudokuShape;
  private board!: SudokuLayout;
  private solution: number[] = [];
  private grid: number[] = [];
  private fixed: boolean[] = [];

  private cells: CellView[] = [];
  private toolButtons: ToolButton[] = [];
  private frame!: Phaser.GameObjects.Rectangle;

  private selectedCell: number | null = null;
  private selectedTool: Tool = null;
  /** После победы ввод закрыт, finishPuzzle вызывается ровно один раз. */
  private locked = false;

  constructor() {
    super(SCENE.PUZZLE_SUDOKU);
  }

  init(data: PuzzleSceneData): void {
    this.puzzleData = data;
  }

  create(): void {
    // Сцена переиспользуется между запусками — всё состояние заводим заново.
    this.cells = [];
    this.toolButtons = [];
    this.selectedCell = null;
    this.selectedTool = null;
    this.locked = false;

    const level = sudokuLevel(this.puzzleData.step);
    const puzzle = buildSudoku(level.size, sudokuSeed(this.puzzleData.variant), level.clues);
    this.shape = puzzle.shape;
    this.board = sudokuLayout(this.shape.size, this.shape.boxW, this.shape.boxH);
    this.solution = puzzle.solution;
    this.grid = puzzle.start.slice();
    this.fixed = puzzle.start.map((v) => v !== SUDOKU_EMPTY);

    addPuzzleBackdrop(this, 'Футбольное судоку');
    this.buildBoard();
    this.buildPalette();
    addBackToMap(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.input.keyboard?.off('keydown-ESC');
    });
  }

  // ---------- Построение экрана ----------

  private cellCenter(i: number): { x: number; y: number } {
    const { size, boxW, boxH } = this.shape;
    const { pitch, boardW, boardH, boardX, boardY } = this.board;
    const gap = SUDOKU_BOARD.blockGap;
    const r = Math.floor(i / size);
    const c = i % size;
    return {
      x: boardX - boardW / 2 + c * pitch + Math.floor(c / boxW) * gap + pitch / 2,
      y: boardY - boardH / 2 + r * pitch + Math.floor(r / boxH) * gap + pitch / 2,
    };
  }

  private buildBoard(): void {
    const { boardW, boardH, boardX, boardY, cell } = this.board;
    const pad = SUDOKU_BOARD.pad;
    // Тёмная подложка: в зазорах между клетками получается сетка с жирной линией между квадратами.
    this.add.rectangle(boardX, boardY, boardW + pad * 2, boardH + pad * 2, COLOR_BOARD).setDepth(1);

    const cells = this.shape.size * this.shape.size;
    for (let i = 0; i < cells; i += 1) {
      const { x, y } = this.cellCenter(i);
      const isFixed = this.fixed[i] === true;
      // Открытые заранее клетки — на чуть тёмной подложке, их не менять.
      const bg = this.add.rectangle(0, 0, cell, cell, isFixed ? COLOR_FIXED : COLOR_EMPTY);
      const icon = this.add.image(0, 0, SYMBOL_KEYS[0] ?? TEX.FOOT[0]).setVisible(false);
      const container = this.add.container(x, y, [bg, icon]).setDepth(2);
      bg.setInteractive({ useHandCursor: !isFixed });
      bg.on(Phaser.Input.Events.POINTER_DOWN, () => this.onCellTap(i));
      this.cells.push({ container, icon, x, y });

      const value = this.grid[i] ?? SUDOKU_EMPTY;
      if (value !== SUDOKU_EMPTY) this.showIcon(i, value, false);
    }

    // Жёлтая рамка выделения — один объект, ездит по клеткам.
    this.frame = this.add.rectangle(0, 0, cell + 6, cell + 6).setDepth(4).setVisible(false);
    this.frame.setStrokeStyle(8, COLOR_FRAME);
  }

  private buildPalette(): void {
    const side = SUDOKU_BOARD.paletteButton;
    for (let v = 0; v < this.shape.size; v += 1) {
      const { x, y } = sudokuToolSpot(this.board, v);
      const bg = this.add.rectangle(0, 0, side, side, PALETTE.waterLight);
      bg.setStrokeStyle(6, PALETTE.uiText);
      const icon = this.add.image(0, 0, SYMBOL_KEYS[v] ?? TEX.FOOT[0]);
      icon.setDisplaySize(side - 30, side - 30);
      this.addToolButton(x, y, [bg, icon], bg, v);
    }

    // Ластик: розовый брусок под наклоном с белой полосой.
    const bg = this.add.rectangle(0, 0, side, side, PALETTE.uiPanelShadow);
    bg.setStrokeStyle(6, PALETTE.uiText);
    const body = this.add.rectangle(0, 0, 76, 42, PALETTE.flowerPink).setStrokeStyle(5, PALETTE.uiText);
    const stripe = this.add.rectangle(-14, 0, 26, 42, PALETTE.flowerWhite).setStrokeStyle(5, PALETTE.uiText);
    const eraser = this.add.container(0, 0, [body, stripe]).setRotation(-0.5);
    this.addToolButton(this.board.paletteX, this.board.eraserY, [bg, eraser], bg, 'erase');
  }

  private addToolButton(
    x: number,
    y: number,
    parts: Phaser.GameObjects.GameObject[],
    bg: Phaser.GameObjects.Rectangle,
    tool: Exclude<Tool, null>,
  ): void {
    const container = this.add.container(x, y, parts).setDepth(2);
    bg.setInteractive({ useHandCursor: true });
    bg.on(Phaser.Input.Events.POINTER_DOWN, () => this.onToolTap(tool));
    this.toolButtons.push({ container, bg, tool });
  }

  // ---------- Ввод ----------

  private onCellTap(i: number): void {
    if (this.locked) return;
    if (this.fixed[i] === true) {
      // Заранее открытые клетки менять нельзя: лёгкое «нет» без звука.
      this.shake(i);
      return;
    }
    const tool = this.selectedTool;
    if (tool === 'erase') {
      this.eraseCell(i);
    } else if (tool !== null) {
      // Значок уже выбран — тап по клетке ставит его (значок остаётся выбранным).
      this.tryPlace(i, tool);
    } else {
      // Сначала клетка: выделяем (повторный тап снимает выделение).
      audio.play('tap', { volume: 0.4 });
      this.selectedCell = this.selectedCell === i ? null : i;
      this.refreshSelection();
    }
  }

  private onToolTap(tool: Exclude<Tool, null>): void {
    if (this.locked) return;
    const cell = this.selectedCell;
    if (cell !== null) {
      // Сначала клетка, потом значок или ластик.
      if (tool === 'erase') this.eraseCell(cell);
      else this.tryPlace(cell, tool);
      return;
    }
    // Клетки нет — запоминаем инструмент; повторный тап снимает.
    audio.play('tap', { volume: 0.4 });
    this.selectedTool = this.selectedTool === tool ? null : tool;
    this.refreshSelection();
  }

  /** Поставить значок v в клетку i, если он подходит; иначе клетка дрожит. */
  private tryPlace(i: number, v: number): void {
    if (this.fixed[i] === true) return;
    if (this.grid[i] === v) {
      this.clearCellSelection();
      return;
    }
    // Конфликт со строкой, столбцом или квадратом — не ставим. Кроме того, не ставим значок,
    // из-за которого поле уже не собрать (решение единственное), чтобы ребёнок не застрял.
    // Для ребёнка это выглядит одинаково: клетка дрожит, тихий звук, без сообщений.
    if (hasConflict(this.shape, this.grid, i, v) || this.solution[i] !== v) {
      this.reject(i);
      return;
    }
    this.grid[i] = v;
    this.showIcon(i, v, true);
    audio.play('tap');
    this.clearCellSelection();

    if (this.grid.every((value, k) => value !== SUDOKU_EMPTY && value === this.solution[k])) {
      this.locked = true;
      this.selectedTool = null;
      this.refreshSelection();
      // Даём последнему значку допрыгать, потом награда.
      this.time.delayedCall(450, () => finishPuzzle(this, this.puzzleData));
    }
  }

  private eraseCell(i: number): void {
    if (this.fixed[i] === true) return;
    if (this.grid[i] !== SUDOKU_EMPTY) {
      this.grid[i] = SUDOKU_EMPTY;
      const cell = this.cells[i];
      if (cell) {
        this.tweens.killTweensOf(cell.icon);
        cell.icon.setVisible(false);
      }
      audio.play('tap', { pitch: 0.8, volume: 0.5 });
    }
    this.clearCellSelection();
  }

  private clearCellSelection(): void {
    this.selectedCell = null;
    this.refreshSelection();
  }

  // ---------- Отрисовка ----------

  /** Показать значок v в клетке; animate — «пружинка» при постановке. */
  private showIcon(i: number, v: number, animate: boolean): void {
    const cell = this.cells[i];
    if (!cell) return;
    const size = this.board.icon;
    this.tweens.killTweensOf(cell.icon);
    cell.icon.setTexture(SYMBOL_KEYS[v] ?? TEX.FOOT[0]).setDisplaySize(size, size).setVisible(true);
    if (!animate) return;
    const bx = cell.icon.scaleX;
    const by = cell.icon.scaleY;
    cell.icon.setScale(bx * 0.4, by * 0.4);
    this.tweens.add({ targets: cell.icon, scaleX: bx, scaleY: by, duration: 360, ease: 'Back.easeOut' });
  }

  /** Обновить рамку клетки и подсветку выбранного значка в палитре. */
  private refreshSelection(): void {
    const sel = this.selectedCell;
    const cell = sel === null ? undefined : this.cells[sel];
    if (cell) this.frame.setPosition(cell.x, cell.y).setVisible(true);
    else this.frame.setVisible(false);

    for (const button of this.toolButtons) {
      const on = this.selectedTool === button.tool;
      button.bg.setStrokeStyle(on ? 10 : 6, on ? COLOR_FRAME : PALETTE.uiText);
      this.tweens.killTweensOf(button.container);
      this.tweens.add({ targets: button.container, scale: on ? 1.1 : 1, duration: 140, ease: 'Sine.easeOut' });
    }
  }

  /** Значок не подошёл: мягкий звук и дрожь клетки. */
  private reject(i: number): void {
    notePuzzleMistake(this);
    audio.play('tap', { pitch: 0.6, volume: 0.5 });
    this.shake(i);
  }

  private shake(i: number): void {
    const cell = this.cells[i];
    if (!cell) return;
    this.tweens.killTweensOf(cell.container);
    cell.container.x = cell.x;
    this.tweens.add({
      targets: cell.container,
      x: { from: cell.x - 9, to: cell.x + 9 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        cell.container.x = cell.x;
      },
    });
  }
}
