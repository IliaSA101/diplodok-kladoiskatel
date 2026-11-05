/**
 * Задачки, которые строятся кодом: судоку 4×4 и 6×6.
 *
 * Главное обещание судоку — решение единственное. Сцена на него опирается:
 * она не даёт поставить значок, отличный от решения, и если решений два,
 * ребёнок получит дрожащую клетку там, где по правилам всё верно. Проверить
 * это глазами нельзя — только перебором, поэтому перебор живёт здесь.
 *
 * Второе обещание — поле влезает в панель задачки (1120×580 по центру экрана)
 * и не наезжает на палитру. На 6×6 клеток вдвое больше, и это уже не очевидно.
 */
import { describe, expect, it } from 'vitest';
import { letterCandidates, pickByKey } from '../src/systems/letterInput';
import { ENGLISH_SETS } from '../src/data/english';
import {
  PATTERN_ROW,
  SEQUENCE_PADS,
  patternCellSpot,
  patternOptionSpot,
  sequencePadSize,
  sequencePadSpot,
} from '../src/art/layout';
import { SUDOKU_BOARD, sudokuLayout, sudokuToolSpot } from '../src/art/sudokuLayout';
import { PUZZLE_PANEL as PANEL } from '../src/art/layout';
import { SUDOKU_LEVELS, SUDOKU_SEEDS, WORD_TIERS, sudokuLevel, sudokuSeed } from '../src/data/quest';
import {
  PATTERN_CELLS,
  PATTERN_MAX_LEVEL,
  PATTERN_POOL,
  PATTERN_TASKS,
  patternTasks,
} from '../src/systems/patternTask';
import {
  SEQUENCE_MAX_LEVEL,
  sequenceLevel,
  sequenceTask,
} from '../src/systems/sequenceTask';
import { SUDOKU_EMPTY, buildSudoku, hasConflict, sudokuShape } from '../src/systems/sudokuBoard';
import type { SudokuShape } from '../src/systems/sudokuBoard';

/** Панель задачки: createPanel(640, 390, 1120, 580). */


/** Сколько способов дозаполнить поле; считаем не больше limit. */
function solutions(shape: SudokuShape, grid: number[], limit: number): number {
  const empty = grid.indexOf(SUDOKU_EMPTY);
  if (empty < 0) return 1;
  let total = 0;
  for (let v = 0; v < shape.size && total < limit; v += 1) {
    if (hasConflict(shape, grid, empty, v)) continue;
    grid[empty] = v;
    total += solutions(shape, grid, limit - total);
    grid[empty] = SUDOKU_EMPTY;
  }
  return total;
}

/** Все уровни судоку, какие игра может выдать, по одному варианту на каждый. */
const LEVELS = SUDOKU_LEVELS.map((level, step) => ({ ...level, step, seed: sudokuSeed(step) }));

describe('судоку: форма поля', () => {
  it('квадраты бьют поле без остатка', () => {
    for (const size of [4, 6]) {
      const shape = sudokuShape(size);
      expect(shape.size).toBe(size);
      expect(shape.boxW * shape.boxH).toBe(size);
      expect(size % shape.boxW).toBe(0);
      expect(size % shape.boxH).toBe(0);
    }
  });

  it('правило квадрата работает, а не только строка со столбцом', () => {
    // Все остальные проверки судоку спрашивают hasConflict — и если из него
    // убрать квадрат, они согласованно этого не заметят. Поэтому квадрат
    // проверяется прямо: соседка по квадрату спорит, дальняя — нет.
    const six = sudokuShape(6);
    const big = new Array<number>(36).fill(SUDOKU_EMPTY);
    big[0] = 2;
    // (1,1) — другая строка и другой столбец, но тот же квадрат 3×2.
    expect(hasConflict(six, big, 1 * 6 + 1, 2)).toBe(true);
    // (2,1) — уже следующая полоса: там тот же значок законен.
    expect(hasConflict(six, big, 2 * 6 + 1, 2)).toBe(false);

    const four = sudokuShape(4);
    const small = new Array<number>(16).fill(SUDOKU_EMPTY);
    small[0] = 1;
    expect(hasConflict(four, small, 1 * 4 + 1, 1)).toBe(true);
    expect(hasConflict(four, small, 2 * 4 + 1, 1)).toBe(false);
  });

  it('ступень поднимает сторону поля до шести', () => {
    expect(sudokuLevel(0).size).toBe(4);
    expect(sudokuLevel(9).size).toBe(6);
    // Ступень не роняет сложность: ни подсказок больше, ни поля меньше.
    for (let step = 1; step < SUDOKU_LEVELS.length; step += 1) {
      const prev = sudokuLevel(step - 1);
      const now = sudokuLevel(step);
      expect(now.size).toBeGreaterThanOrEqual(prev.size);
      if (now.size === prev.size) expect(now.clues).toBeLessThan(prev.clues);
    }
  });
});

describe('судоку: поле', () => {
  it('решение — настоящее судоку: в строке, столбце и квадрате все значки разные', () => {
    for (const level of LEVELS) {
      const { shape, solution } = buildSudoku(level.size, level.seed, level.clues);
      const { size, boxW, boxH } = shape;
      for (let i = 0; i < size * size; i += 1) {
        const v = solution[i];
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(size);
        // Та же проверка, что в игре: значок в своей клетке ни с кем не спорит.
        const without = solution.slice();
        without[i] = SUDOKU_EMPTY;
        expect(hasConflict(shape, without, i, v ?? 0)).toBe(false);
      }
      // И квадраты целы: каждый содержит все size значков.
      for (let box = 0; box < size; box += 1) {
        const r0 = Math.floor(box / (size / boxW)) * boxH;
        const c0 = (box % (size / boxW)) * boxW;
        const inBox = new Set<number>();
        for (let r = r0; r < r0 + boxH; r += 1) {
          for (let c = c0; c < c0 + boxW; c += 1) inBox.add(solution[r * size + c] ?? -1);
        }
        expect(inBox.size).toBe(size);
      }
    }
  });

  it('стартовое поле — часть решения, а не свои числа', () => {
    for (const level of LEVELS) {
      const { solution, start } = buildSudoku(level.size, level.seed, level.clues);
      expect(start).toHaveLength(solution.length);
      start.forEach((v, i) => {
        if (v !== SUDOKU_EMPTY) expect(v).toBe(solution[i]);
      });
    }
  });

  it('решение единственное — иначе ребёнок упрётся в тупик', () => {
    for (const level of LEVELS) {
      const { shape, start } = buildSudoku(level.size, level.seed, level.clues);
      expect(solutions(shape, start.slice(), 3)).toBe(1);
    }
  });

  it('открытых клеток ровно столько, сколько просили', () => {
    for (const level of LEVELS) {
      const { start } = buildSudoku(level.size, level.seed, level.clues);
      const open = start.filter((v) => v !== SUDOKU_EMPTY).length;
      expect(open).toBe(level.clues);
    }
  });

  it('одно поле на вариант: к задачке можно вернуться', () => {
    const level = SUDOKU_LEVELS[3] ?? { size: 6, clues: 20 };
    const once = buildSudoku(level.size, 4201, level.clues);
    const again = buildSudoku(level.size, 4201, level.clues);
    expect(again.start).toEqual(once.start);
    expect(again.solution).toEqual(once.solution);
    // Другой вариант — другое поле.
    const other = buildSudoku(level.size, 9317, level.clues);
    expect(other.start).not.toEqual(once.start);
  });

  it('все seed’ы дают разные поля на каждой ступени', () => {
    // Разные seed’ы сами по себе разных полей не обещают: генератор мог бы
    // прийти к одной и той же расстановке. Пока seed’ов было пять на восемь
    // узлов, варианты 0 и 5 давали ребёнку буквально ту же задачку.
    for (let step = 0; step < SUDOKU_LEVELS.length; step += 1) {
      const level = sudokuLevel(step);
      const seen = new Map<string, number>();
      for (let variant = 0; variant < SUDOKU_SEEDS.length; variant += 1) {
        const { start } = buildSudoku(level.size, sudokuSeed(variant), level.clues);
        const key = start.join(',');
        const twin = seen.get(key);
        expect(twin, `ступень ${step}: вариант ${variant} повторяет вариант ${String(twin)}`).toBe(
          undefined,
        );
        seen.set(key, variant);
      }
    }
  });

  it('каждый вариант каждого уровня решается единственным способом', () => {
    for (let step = 0; step < SUDOKU_LEVELS.length; step += 1) {
      const level = sudokuLevel(step);
      for (let variant = 0; variant < 5; variant += 1) {
        const { shape, start } = buildSudoku(level.size, sudokuSeed(variant), level.clues);
        expect(solutions(shape, start.slice(), 3)).toBe(1);
      }
    }
  });
});

describe('судоку: раскладка', () => {
  it('поле 4×4 — крупная клетка и палитра в две колонки', () => {
    // Было 126×512: поле забирало всю высоту панели, какая есть. Теперь высоту
    // задаёт общий отступ от края (`margin`), и клетка выходит из него, а не
    // из потолка `maxPitch`. Для 4×4 это четыре пикселя клетки — не видно;
    // ради этого и сделано, потому что шестёрке потолка не хватало.
    const layout = sudokuLayout(4, 2, 2);
    expect(layout.pitch).toBe(122);
    expect(layout.boardW).toBe(496);
    expect(layout.boardH).toBe(496);
    expect(layout.paletteCols).toBe(2);
  });

  it('поле не прижимается к краю панели ни на одном размере', () => {
    // Шестёрка вставала в шесть пикселей от верхнего края: рамка поля
    // закрывала скруглённый угол панели, и поле читалось обрезанным.
    for (const size of [4, 6]) {
      const shape = sudokuShape(size);
      const layout = sudokuLayout(shape.size, shape.boxW, shape.boxH);
      const top = layout.boardY - layout.boardH / 2 - SUDOKU_BOARD.pad;
      const bottom = layout.boardY + layout.boardH / 2 + SUDOKU_BOARD.pad;
      // Порог — число, а не `SUDOKU_BOARD.margin`: поле считается от margin,
      // и сверка с ним согласилась бы с любым значением, хоть с нулём.
      expect(top - PANEL.top, `${size}×${size} сверху`).toBeGreaterThanOrEqual(24);
      expect(PANEL.bottom - bottom, `${size}×${size} снизу`).toBeGreaterThanOrEqual(24);
    }
  });

  it('поле и палитра влезают в панель задачки', () => {
    for (const size of [4, 6]) {
      const shape = sudokuShape(size);
      const layout = sudokuLayout(shape.size, shape.boxW, shape.boxH);
      expect(layout.boardX - layout.boardW / 2 - SUDOKU_BOARD.pad).toBeGreaterThanOrEqual(PANEL.left);
      expect(layout.boardY - layout.boardH / 2 - SUDOKU_BOARD.pad).toBeGreaterThanOrEqual(PANEL.top);
      expect(layout.boardY + layout.boardH / 2 + SUDOKU_BOARD.pad).toBeLessThanOrEqual(PANEL.bottom);

      const half = SUDOKU_BOARD.paletteButton / 2;
      const spots = [
        ...Array.from({ length: size }, (_, v) => sudokuToolSpot(layout, v)),
        { x: layout.paletteX, y: layout.eraserY },
      ];
      for (const spot of spots) {
        // Палитра правее поля и внутри панели — ни одна кнопка не на поле и не за краем.
        expect(spot.x - half).toBeGreaterThan(layout.boardX + layout.boardW / 2 + SUDOKU_BOARD.pad);
        expect(spot.x + half).toBeLessThanOrEqual(PANEL.right);
        expect(spot.y - half).toBeGreaterThanOrEqual(PANEL.top);
        expect(spot.y + half).toBeLessThanOrEqual(PANEL.bottom);
      }
      // И друг на друга кнопки не налезают.
      for (let a = 0; a < spots.length; a += 1) {
        for (let b = a + 1; b < spots.length; b += 1) {
          const one = spots[a];
          const two = spots[b];
          if (!one || !two) continue;
          const apart = Math.abs(one.x - two.x) >= SUDOKU_BOARD.paletteButton
            || Math.abs(one.y - two.y) >= SUDOKU_BOARD.paletteButton;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('клетка не мельче порога даже на шестёрке', () => {
    for (const size of [4, 6]) {
      const shape = sudokuShape(size);
      const layout = sudokuLayout(shape.size, shape.boxW, shape.boxH);
      expect(layout.pitch).toBeGreaterThanOrEqual(SUDOKU_BOARD.minPitch);
      expect(layout.cell).toBeGreaterThan(0);
      // Значок меньше клетки: иначе он вылезет на сетку.
      expect(layout.icon).toBeLessThan(layout.cell);
    }
  });

  it('на шестёрке клетки мельче, но палитра на шесть значков', () => {
    const four = sudokuLayout(4, 2, 2);
    const six = sudokuLayout(6, 3, 2);
    expect(six.pitch).toBeLessThan(four.pitch);
    expect(six.paletteCols).toBe(3);
    // Шесть кнопок в сетке 3×2 — ряды не пустые и не лишние.
    expect(sudokuToolSpot(six, 3).y).toBeGreaterThan(sudokuToolSpot(six, 0).y);
    expect(sudokuToolSpot(six, 5).y).toBe(sudokuToolSpot(six, 3).y);
  });
});

/** Самый короткий период, с которым ряд повторяется; у ряда из одинаковых — 1. */
function periodOf(row: readonly number[]): number {
  for (let p = 1; p <= row.length; p += 1) {
    if (row.every((v, i) => v === row[i % p])) return p;
  }
  return row.length;
}

describe('что дальше в ряду', () => {
  it('ряд и правда повторяет мотив — иначе правила нет', () => {
    for (let step = 0; step <= PATTERN_MAX_LEVEL + 2; step += 1) {
      patternTasks(step, 0).forEach((task) => {
        expect(task.row).toHaveLength(PATTERN_CELLS);
        // Период ищем сами, начиная с единицы: ряд из одинаковых картинок
        // формально «повторяется» с периодом 2, но узора в нём нет и
        // продолжать нечего, поэтому минимальный период обязан быть длиннее.
        expect(periodOf(task.row)).toBeGreaterThanOrEqual(2);
        expect(periodOf(task.row)).toBeLessThanOrEqual(4);
        expect(new Set(task.row).size).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it('ответ — последняя клетка, и он есть среди вариантов', () => {
    for (let step = 0; step <= PATTERN_MAX_LEVEL; step += 1) {
      for (let variant = 0; variant < 5; variant += 1) {
        patternTasks(step, variant).forEach((task) => {
          expect(task.answer).toBe(task.row[PATTERN_CELLS - 1]);
          expect(task.options).toContain(task.answer);
          // Вариантов хватает на выбор, но не на кашу.
          expect(task.options.length).toBeGreaterThanOrEqual(3);
          expect(task.options.length).toBeLessThanOrEqual(4);
          expect(new Set(task.options).size).toBe(task.options.length);
        });
      }
    }
  });

  it('ступень поднимает нижнюю границу мотива', () => {
    // Период первого ряда на высокой ступени не короче, чем на низкой.
    let previous = 0;
    for (let step = 0; step <= PATTERN_MAX_LEVEL; step += 1) {
      const first = patternTasks(step, 0)[0];
      expect(first).toBeDefined();
      const now = periodOf(first?.row ?? []);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });

  it('внутри узла ряды идут от простого к сложному', () => {
    const tasks = patternTasks(0, 1);
    expect(tasks).toHaveLength(PATTERN_TASKS);
    const roles = tasks.map((t) => new Set(t.row).size);
    for (let i = 1; i < roles.length; i += 1) {
      expect(roles[i] ?? 0).toBeGreaterThanOrEqual(roles[i - 1] ?? 0);
    }
  });

  it('один узел — одна задачка: к ней можно вернуться', () => {
    expect(patternTasks(2, 3)).toEqual(patternTasks(2, 3));
    expect(patternTasks(2, 3)).not.toEqual(patternTasks(2, 4));
  });

  it('картинки берутся из набора и не повторяются в ролях', () => {
    for (let step = 0; step <= PATTERN_MAX_LEVEL; step += 1) {
      for (const task of patternTasks(step, 2)) {
        for (const face of [...task.row, ...task.options]) {
          expect(face).toBeGreaterThanOrEqual(0);
          expect(face).toBeLessThan(PATTERN_POOL);
        }
      }
    }
  });
});

describe('повтори порядок', () => {
  it('два одинаковых огонька подряд не идут', () => {
    for (let step = 0; step <= SEQUENCE_MAX_LEVEL + 2; step += 1) {
      for (let variant = 0; variant < 6; variant += 1) {
        const task = sequenceTask(step, variant);
        task.order.forEach((pad, i) => {
          expect(pad).toBeGreaterThanOrEqual(0);
          expect(pad).toBeLessThan(task.pads);
          if (i > 0) expect(pad).not.toBe(task.order[i - 1]);
        });
      }
    }
  });

  it('подходы растут по одному и последний — вся цепочка', () => {
    for (let step = 0; step <= SEQUENCE_MAX_LEVEL; step += 1) {
      const task = sequenceTask(step, 0);
      const level = sequenceLevel(step);
      expect(task.steps[0]).toBe(level.from);
      expect(task.steps[task.steps.length - 1]).toBe(level.to);
      expect(task.order).toHaveLength(level.to);
      task.steps.forEach((n, i) => {
        if (i > 0) expect(n).toBe((task.steps[i - 1] ?? 0) + 1);
      });
    }
  });

  it('подход — продолжение прошлого, а не новая цепочка', () => {
    const task = sequenceTask(3, 1);
    for (let i = 1; i < task.steps.length; i += 1) {
      const before = task.order.slice(0, task.steps[i - 1]);
      const now = task.order.slice(0, task.steps[i]);
      expect(now.slice(0, before.length)).toEqual(before);
    }
  });

  it('ступень не делает задачку легче', () => {
    for (let step = 1; step <= SEQUENCE_MAX_LEVEL; step += 1) {
      const prev = sequenceLevel(step - 1);
      const now = sequenceLevel(step);
      expect(now.pads).toBeGreaterThanOrEqual(prev.pads);
      expect(now.to).toBeGreaterThanOrEqual(prev.to);
      expect(now.pads + now.to).toBeGreaterThan(prev.pads + prev.to);
    }
  });

  it('один узел — одна цепочка: к ней можно вернуться', () => {
    expect(sequenceTask(2, 3)).toEqual(sequenceTask(2, 3));
    expect(sequenceTask(2, 3).order).not.toEqual(sequenceTask(2, 4).order);
  });
});

describe('раскладка новых задачек', () => {
  /** Края ряда прямоугольников: [левый, правый]. */
  const spread = (spots: { x: number }[], side: number): [number, number] => [
    Math.min(...spots.map((s) => s.x)) - side / 2,
    Math.max(...spots.map((s) => s.x)) + side / 2,
  ];

  it('ряд из восьми клеток влезает в панель и не слипается', () => {
    const spots = Array.from({ length: PATTERN_CELLS }, (_, i) => patternCellSpot(i, PATTERN_CELLS));
    const [left, right] = spread(spots, PATTERN_ROW.cell);
    expect(left).toBeGreaterThanOrEqual(PANEL.left);
    expect(right).toBeLessThanOrEqual(PANEL.right);
    for (let i = 1; i < spots.length; i += 1) {
      const gap = (spots[i]?.x ?? 0) - (spots[i - 1]?.x ?? 0) - PATTERN_ROW.cell;
      expect(gap).toBeGreaterThan(0);
    }
    // Клетка выше картинки в ней: иначе значок вылезет на соседнюю.
    expect(PATTERN_ROW.icon).toBeLessThan(PATTERN_ROW.cell);
  });

  it('карточки ответа стоят под рядом и не наезжают на него', () => {
    for (const total of [3, 4]) {
      const spots = Array.from({ length: total }, (_, i) => patternOptionSpot(i, total));
      const [left, right] = spread(spots, PATTERN_ROW.option);
      expect(left).toBeGreaterThanOrEqual(PANEL.left);
      expect(right).toBeLessThanOrEqual(PANEL.right);
      expect(PATTERN_ROW.optionsY - PATTERN_ROW.option / 2)
        .toBeGreaterThan(PATTERN_ROW.rowY + PATTERN_ROW.cell / 2);
      expect(PATTERN_ROW.optionsY + PATTERN_ROW.option / 2).toBeLessThanOrEqual(PANEL.bottom);
      expect(PATTERN_ROW.optionStep).toBeGreaterThan(PATTERN_ROW.option);
    }
  });

  it('кнопки «повтори порядок» крупные, сколько бы их ни было', () => {
    for (const pads of [4, 5, 6]) {
      const size = sequencePadSize(pads);
      // Порог пальца: ниже него кнопка перестаёт быть кнопкой.
      expect(size).toBeGreaterThanOrEqual(110);
      const spots = Array.from({ length: pads }, (_, i) => sequencePadSpot(i, pads));
      const [left, right] = spread(spots, size);
      expect(left).toBeGreaterThanOrEqual(PANEL.left);
      expect(right).toBeLessThanOrEqual(PANEL.right);
      expect(SEQUENCE_PADS.centerY - size / 2).toBeGreaterThanOrEqual(PANEL.top);
      expect(SEQUENCE_PADS.centerY + size / 2).toBeLessThanOrEqual(PANEL.bottom);
      for (let i = 1; i < spots.length; i += 1) {
        expect((spots[i]?.x ?? 0) - (spots[i - 1]?.x ?? 0) - size).toBeGreaterThan(0);
      }
    }
  });

  it('кнопок больше — кнопки мельче, но ряд остаётся по центру', () => {
    expect(sequencePadSize(6)).toBeLessThanOrEqual(sequencePadSize(4));
    for (const pads of [4, 5, 6]) {
      const spots = Array.from({ length: pads }, (_, i) => sequencePadSpot(i, pads));
      const middle = ((spots[0]?.x ?? 0) + (spots[pads - 1]?.x ?? 0)) / 2;
      expect(middle).toBeCloseTo(SEQUENCE_PADS.centerX, 6);
    }
  });
});

/**
 * Клавиатура в «Собери слово» и английской анаграмме.
 *
 * Ребёнок не переключает раскладку. Клавиша с буквой К в английской раскладке
 * присылает `r`, и без перевода раскладок русская игра на ноутбуке молчала бы
 * в ответ на половину нажатий.
 */
describe('буквы с клавиатуры', () => {
  it('своя раскладка понимается как есть', () => {
    expect(letterCandidates('к')).toContain('К');
    expect(letterCandidates('C')).toContain('C');
  });

  it('русская игра понимает английскую раскладку', () => {
    expect(letterCandidates('r')).toContain('К');
    expect(letterCandidates('g')).toContain('П');
  });

  it('английская игра понимает русскую раскладку', () => {
    expect(letterCandidates('к')).toContain('R');
    expect(letterCandidates('с')).toContain('C');
  });

  it('не буквы ничего не значат', () => {
    for (const key of ['Shift', 'ArrowLeft', ' ', 'Enter', '1']) {
      expect(letterCandidates(key), key).toHaveLength(0);
    }
  });

  it('каждой русской букве есть клавиша', () => {
    const alphabet = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
    const reachable = new Set<string>();
    for (const key of "qwertyuiop[]asdfghjkl;'zxcvbnm,.") {
      for (const letter of letterCandidates(key)) reachable.add(letter);
    }
    for (const letter of alphabet) {
      expect(reachable.has(letter), `буква ${letter} недостижима`).toBe(true);
    }
  });

  /**
   * Клавиши записаны руками, по рядам физической клавиатуры, а не взяты из
   * `RU_BY_LATIN`: иначе тест согласился бы с любой ошибкой в таблице.
   */
  const ROWS_LATIN = ["qwertyuiop[]", "asdfghjkl;'", 'zxcvbnm,.'];
  const ROWS_RUSSIAN = ['ЙЦУКЕНГШЩЗХЪ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮ'];
  /** Клавиша латинской раскладки → русская буква на ней. */
  const RUSSIAN_ON_KEY = new Map<string, string>();
  /** Латинская буква → что напечатает та же клавиша в русской раскладке. */
  const KEY_IN_RUSSIAN = new Map<string, string>();
  ROWS_LATIN.forEach((row, r) => {
    [...row].forEach((key, i) => {
      const ru = ROWS_RUSSIAN[r]?.charAt(i) ?? '';
      RUSSIAN_ON_KEY.set(ru, key);
      if (/[a-z]/.test(key)) KEY_IN_RUSSIAN.set(key, ru.toLowerCase());
    });
  });

  const tilesOf = (word: string): { char: string; slot: number }[] =>
    [...word].map((char) => ({ char, slot: -1 }));

  it('каждая буква каждого английского слова выбирается своей клавишей в обеих раскладках', () => {
    let checked = 0;
    for (const set of ENGLISH_SETS) {
      for (const { en } of set.words) {
        for (const letter of en) {
          const tiles = tilesOf(en);
          const russianKey = KEY_IN_RUSSIAN.get(letter);
          expect(russianKey, `нет русской клавиши для ${letter}`).toBeDefined();
          for (const key of [letter, letter.toUpperCase(), russianKey ?? '']) {
            const tile = pickByKey(letterCandidates(key), tiles);
            expect(tile?.char, `слово ${en}, клавиша ${key}`).toBe(letter);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('каждая буква каждого русского слова квеста выбирается своей клавишей в обеих раскладках', () => {
    let checked = 0;
    for (const tier of WORD_TIERS) {
      for (const { word } of tier) {
        for (const letter of word) {
          const latinKey = RUSSIAN_ON_KEY.get(letter);
          expect(latinKey, `нет клавиши для ${letter}`).toBeDefined();
          for (const key of [letter, letter.toLowerCase(), latinKey ?? '']) {
            const tile = pickByKey(letterCandidates(key), tilesOf(word));
            expect(tile?.char, `слово ${word}, клавиша ${key}`).toBe(letter);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('занятая плашка не выбирается, пока есть свободная с той же буквой', () => {
    const tiles = [
      { char: 'o', slot: 3 },
      { char: 'o', slot: -1 },
    ];
    expect(pickByKey(letterCandidates('o'), tiles)).toBe(tiles[1]);
    expect(pickByKey(letterCandidates('z'), tiles)).toBeUndefined();
  });
});
