/**
 * Поле судоку: решение, открытые клетки и правило «сюда нельзя».
 *
 * Логика жила прямо в сцене, и проверить её было нечем — а проверять тут есть
 * что: поле должно решаться **единственным** способом. Иначе ребёнок ставит
 * значок, который по строкам и столбцам подходит, упирается в тупик и выйти
 * может только кнопкой «назад». Сцена этого не чинит: она лишь не даёт
 * поставить значок, отличный от решения, — а значит, решение обязано быть одно.
 *
 * Размер поля — ступень сложности. 4×4 с квадратами 2×2 ребёнок разбирает
 * не думая; 6×6 с квадратами 3×2 — уже настоящее судоку: шесть значков,
 * и в одном ряду их не перебрать взглядом.
 *
 * Модуль без Phaser: единственность решения проверяется тестом, а не ребёнком.
 */
import { makeRng } from './rng';
import type { Rng } from './rng';

/** Пустая клетка. */
export const SUDOKU_EMPTY = -1;

export interface SudokuShape {
  /** Сторона поля. */
  size: number;
  /** Ширина квадрата. */
  boxW: number;
  /** Высота квадрата; size === boxW * boxH. */
  boxH: number;
}

/**
 * Форма поля по его стороне.
 *
 * Квадрат 6×6 бьётся на прямоугольники 3×2, а не на квадраты: иначе значков
 * в квадрате было бы не шесть, и правило «в квадрате все разные» сломалось бы.
 */
export function sudokuShape(size: number): SudokuShape {
  return size >= 6 ? { size: 6, boxW: 3, boxH: 2 } : { size: 4, boxW: 2, boxH: 2 };
}

export interface SudokuPuzzle {
  shape: SudokuShape;
  /** Полное решение по клеткам слева направо, сверху вниз. */
  solution: number[];
  /** Стартовое поле: открытые клетки со значением, остальные SUDOKU_EMPTY. */
  start: number[];
}

/** Есть ли в строке, столбце или квадрате клетки i другая клетка со значением v. */
export function hasConflict(
  shape: SudokuShape,
  grid: readonly number[],
  i: number,
  v: number,
): boolean {
  const { size, boxW, boxH } = shape;
  const row = Math.floor(i / size);
  const col = i % size;
  for (let j = 0; j < size * size; j += 1) {
    if (j === i || grid[j] !== v) continue;
    const r = Math.floor(j / size);
    const c = j % size;
    const sameBox = Math.floor(r / boxH) === Math.floor(row / boxH)
      && Math.floor(c / boxW) === Math.floor(col / boxW);
    if (r === row || c === col || sameBox) return true;
  }
  return false;
}

/** Сколько способов дозаполнить поле; считаем не больше limit — важно «один или больше». */
function countSolutions(shape: SudokuShape, grid: number[], limit: number): number {
  const empty = grid.indexOf(SUDOKU_EMPTY);
  if (empty < 0) return 1;
  let total = 0;
  for (let v = 0; v < shape.size && total < limit; v += 1) {
    if (hasConflict(shape, grid, empty, v)) continue;
    grid[empty] = v;
    total += countSolutions(shape, grid, limit - total);
    grid[empty] = SUDOKU_EMPTY;
  }
  return total;
}

/** Числа 0…n-1 по порядку. */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Корректное решение: базовый латинский квадрат, перетасованный так,
 * чтобы квадраты остались целыми.
 *
 * Менять местами можно строки внутри полосы и сами полосы, столбцы внутри
 * стопки и сами стопки, а ещё значки между собой. Любая другая перестановка
 * ломает правило квадрата.
 */
function buildSolution(shape: SudokuShape, rng: Rng): number[] {
  const { size, boxW, boxH } = shape;
  const order = (groups: number, per: number): number[] =>
    rng.shuffle(range(groups)).flatMap((g) => rng.shuffle(range(per)).map((k) => g * per + k));
  const rows = order(size / boxH, boxH);
  const cols = order(size / boxW, boxW);
  const symbols = rng.shuffle(range(size));
  const grid: number[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const rr = rows[r] ?? r;
      const cc = cols[c] ?? c;
      const base = (boxW * (rr % boxH) + Math.floor(rr / boxH) + cc) % size;
      grid.push(symbols[base] ?? base);
    }
  }
  return grid;
}

/**
 * Поле с подсказками: закрываем клетки по одной, пока решение остаётся одним.
 *
 * Раньше клетки, наоборот, набирались случайной горстью и поле перебиралось
 * заново, пока решение не окажется единственным. На 4×4 это сходилось, на 6×6
 * не сошлось бы никогда: случайные двадцать клеток из тридцати шести почти
 * всегда дают несколько решений. Закрытие по одной сходится всегда и за один
 * проход — и единственность держится конструкцией, а не везением.
 *
 * `clues` — сколько клеток хочется оставить открытыми. Это нижняя граница:
 * если дальше закрывать нельзя без потери единственности, открытых останется
 * больше, и это нормально.
 */
export function buildSudoku(size: number, seed: number, clues: number): SudokuPuzzle {
  const shape = sudokuShape(size);
  const cells = shape.size * shape.size;
  const rng = makeRng(seed);
  const solution = buildSolution(shape, rng);
  const start = solution.slice();
  let open = cells;
  const target = Math.max(1, Math.min(cells, Math.round(clues)));

  for (const i of rng.shuffle(range(cells))) {
    if (open <= target) break;
    const kept = start[i] ?? SUDOKU_EMPTY;
    start[i] = SUDOKU_EMPTY;
    if (countSolutions(shape, start.slice(), 2) === 1) open -= 1;
    else start[i] = kept;
  }

  return { shape, solution, start };
}
