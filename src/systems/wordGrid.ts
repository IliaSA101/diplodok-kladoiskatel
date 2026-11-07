/**
 * Поле «найди слово»: буквы 7×7 и спрятанные в них слова.
 *
 * Модуль без Phaser — чистая арифметика, и только поэтому поле проверяется
 * тестом. Слова лежат слева направо и сверху вниз, задом наперёд не бывает:
 * первокласснику хватает и двух направлений.
 *
 * Инвариант держится конструкцией, а не удачей: случайная раскладка берётся
 * только если она сошлась, иначе есть запасная — каждое слово в своей строке
 * от левого края. Она не может не сойтись, пока слов не больше, чем строк,
 * и слово не длиннее строки, а это проверяется на входе.
 *
 * Досыпку случайных букв (и её правила) держит `wordFill.ts`, выбор слова
 * кликами — `wordPick.ts`.
 */
import { makeRng, type Rng } from './rng';
import { fillRest, layoutFalseStart } from './wordFill';

export interface Placement {
  word: string;
  /** Строка и столбец первой буквы. */
  row: number;
  col: number;
  /** true — слово лежит слева направо, false — сверху вниз. */
  horizontal: boolean;
}

export interface WordGrid {
  size: number;
  /** letters[row][col] — одна строчная буква. */
  letters: string[][];
  /** Где лежит каждое слово; порядок тот же, что у входного списка. */
  placements: readonly Placement[];
}

/**
 * Сколько раз пробуем случайную раскладку, прежде чем взять запасную.
 * Лишнее попытки дешёвы, а чистая раскладка (без ложного начала из букв двух
 * разных слов) нужна: досыпка её уже не исправит.
 */
const TRIES = 60;

function emptyLetters(size: number): string[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ''));
}

/** Помещается ли слово в эту точку: за край не вылезает, чужие буквы совпадают. */
function fits(letters: readonly string[][], place: Placement): boolean {
  const size = letters.length;
  const length = place.word.length;
  if (place.row < 0 || place.col < 0) return false;
  if (place.horizontal ? place.col + length > size : place.row + length > size) return false;
  for (let i = 0; i < length; i += 1) {
    const row = place.row + (place.horizontal ? 0 : i);
    const col = place.col + (place.horizontal ? i : 0);
    const cell = letters[row]?.[col];
    if (cell === undefined) return false;
    if (cell !== '' && cell !== place.word.charAt(i)) return false;
  }
  return true;
}

function put(letters: string[][], place: Placement): void {
  for (let i = 0; i < place.word.length; i += 1) {
    const row = letters[place.row + (place.horizontal ? 0 : i)];
    if (row === undefined) continue;
    row[place.col + (place.horizontal ? i : 0)] = place.word.charAt(i);
  }
}

function spots(letters: readonly string[][], word: string): Placement[] {
  const size = letters.length;
  const found: Placement[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const horizontal of [true, false]) {
        const place: Placement = { word, row, col, horizontal };
        if (fits(letters, place)) found.push(place);
      }
    }
  }
  return found;
}

/** Одна попытка случайной раскладки; null — какому-то слову места не нашлось. */
function tryLayout(words: readonly string[], size: number, rng: Rng): Placement[] | null {
  const letters = emptyLetters(size);
  // Длинные слова раскладываем первыми: им труднее найти место.
  const order = words
    .map((word, index) => ({ word, index }))
    .sort((a, b) => b.word.length - a.word.length || a.index - b.index);

  const placed: Placement[] = [];
  for (const { word, index } of order) {
    const options = spots(letters, word);
    const choice = options.length > 0 ? options[rng.int(0, options.length - 1)] : undefined;
    if (choice === undefined) return null;
    put(letters, choice);
    placed[index] = choice;
  }
  return placed;
}

/** Запасная раскладка: слово за словом сверху вниз, каждое от левого края. */
function rowLayout(words: readonly string[]): Placement[] {
  return words.map((word, index) => ({ word, row: index, col: 0, horizontal: true }));
}

/**
 * Поле со спрятанными словами. Один и тот же seed даёт одно и то же поле —
 * на этом держатся тесты, `?shots` и e2e; игра при каждом входе берёт новый
 * seed (`randomSeed`), чтобы поле не повторялось.
 */
export function buildWordGrid(words: readonly string[], size: number, seed: number): WordGrid {
  if (words.length > size) throw new Error('слов больше, чем строк в поле');
  for (const word of words) {
    if (word.length > size) throw new Error('слово длиннее поля: ' + word);
    if (word.length === 0) throw new Error('пустое слово');
  }

  // Первая сошедшаяся раскладка — запасная; чистая (без ложного начала на стыке
  // двух слов) берётся, как только попалась.
  let placements: Placement[] | null = null;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const layout = tryLayout(words, size, makeRng(seed + attempt * 7919));
    if (layout === null) continue;
    placements ??= layout;
    const letters = emptyLetters(size);
    for (const place of layout) put(letters, place);
    if (!layoutFalseStart(letters, layout)) {
      placements = layout;
      break;
    }
  }
  const final = placements ?? rowLayout(words);

  const letters = emptyLetters(size);
  for (const place of final) put(letters, place);
  fillRest(letters, words, final, makeRng(seed + 104729));

  return { size, letters, placements: final };
}

/**
 * Какое слово лежит между первой и последней буквой.
 *
 * Игра так слово больше не выбирает (два тапа «не логично» — выбор пути в
 * `wordPick.ts`); функция оставлена как проверка границ слова и держится тестом.
 */
export function wordAt(
  grid: WordGrid,
  from: { row: number; col: number },
  to: { row: number; col: number },
): Placement | null {
  for (const place of grid.placements) {
    const last = place.word.length - 1;
    const endRow = place.row + (place.horizontal ? 0 : last);
    const endCol = place.col + (place.horizontal ? last : 0);
    const sameStart = from.row === place.row && from.col === place.col;
    const sameEnd = to.row === endRow && to.col === endCol;
    if (sameStart && sameEnd) return place;
  }
  return null;
}
