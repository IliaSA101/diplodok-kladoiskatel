/**
 * Досыпка поля «Find a word»: правила и круги их ослабления.
 *
 * Вынесено из `tests/wordSearch.test.ts`: вместе с выбором пути, новым раскладом
 * и раскладкой списка файл перешагнул бы порог в шестьсот строк.
 */
import { describe, expect, it } from 'vitest';
import { ENGLISH_SETS } from '../src/data/english';
import { makeRng } from '../src/systems/rng';
import { fillRest } from '../src/systems/wordFill';
import { buildWordGrid, type Placement, type WordGrid } from '../src/systems/wordGrid';
import { placementCells, type Cell } from '../src/systems/wordPick';

const GRID = 7;

/** Читается ли слово в поле начиная с этой клетки. */
function readsAt(grid: WordGrid, word: string, row: number, col: number, horizontal: boolean): boolean {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + (horizontal ? 0 : i);
    const c = col + (horizontal ? i : 0);
    if (grid.letters[r]?.[c] !== word.charAt(i)) return false;
  }
  return true;
}

/** Сколько мест, где слово читается в поле. */
function occurrences(grid: WordGrid, word: string): number {
  let count = 0;
  for (let row = 0; row < grid.size; row += 1) {
    for (let col = 0; col < grid.size; col += 1) {
      if (readsAt(grid, word, row, col, true)) count += 1;
      if (readsAt(grid, word, row, col, false)) count += 1;
    }
  }
  return count;
}

/** Сколько раз прогоняем каждый набор: поле теперь новое при каждом заходе. */
const SEEDS = 200;

/** Клетки слов: на них досыпка не лежит. */
function wordCells(grid: WordGrid): Set<string> {
  const own = new Set<string>();
  for (const place of grid.placements) {
    for (const cell of placementCells(place)) own.add(`${cell.row}:${cell.col}`);
  }
  return own;
}

/** Клетки, где букву положил случай, а не слово. */
function fillerCells(grid: WordGrid): Cell[] {
  const own = wordCells(grid);
  const found: Cell[] = [];
  for (let row = 0; row < grid.size; row += 1) {
    for (let col = 0; col < grid.size; col += 1) {
      if (!own.has(`${row}:${col}`)) found.push({ row, col });
    }
  }
  return found;
}

/**
 * Ложные начала, посчитанные заново (не кодом игры): пара соседних клеток
 * вправо или вниз читается как две первые буквы слова, но это не то место,
 * где слово лежит. Пара из двух соседних букв одного и того же слова не
 * считается: `lo` внутри `look` читается как начало `love`, и досыпкой это
 * не лечится.
 */
function falseStarts(grid: WordGrid): string[] {
  const bad: string[] = [];
  const key = (cell: Cell): string => `${cell.row}:${cell.col}`;
  const inOnePlace = (a: Cell, b: Cell): boolean =>
    grid.placements.some((place) => {
      const cells = placementCells(place).map(key);
      return cells.includes(key(a)) && cells.includes(key(b));
    });
  for (let row = 0; row < grid.size; row += 1) {
    for (let col = 0; col < grid.size; col += 1) {
      for (const horizontal of [true, false]) {
        const a = { row, col };
        const b = { row: row + (horizontal ? 0 : 1), col: col + (horizontal ? 1 : 0) };
        const pair = (grid.letters[a.row]?.[a.col] ?? '') + (grid.letters[b.row]?.[b.col] ?? '');
        if (pair.length < 2) continue;
        for (const place of grid.placements) {
          if (place.word.slice(0, 2) !== pair) continue;
          const own = place.row === row && place.col === col && place.horizontal === horizontal;
          if (!own && !inOnePlace(a, b)) {
            bad.push(`${place.word}@${row}:${col}${horizontal ? '→' : '↓'}`);
          }
        }
      }
    }
  }
  return bad;
}

const NAMED_SETS = ENGLISH_SETS.map((set) => ({
  title: set.title,
  words: set.words.map((word) => word.en),
}));

describe('досыпка поля', () => {
  it('случайная буква не бывает первой буквой слова набора', () => {
    for (const { title, words } of NAMED_SETS) {
      const firsts = new Set(words.map((word) => word.charAt(0)));
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        for (const { row, col } of fillerCells(grid)) {
          expect(firsts.has(grid.letters[row]?.[col] ?? ''), `${title}, seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('ложных начал нет: ни `lo` не там, где лежит love, ни другой пары', () => {
    for (const { title, words } of NAMED_SETS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        expect(falseStarts(grid), `${title}, seed ${seed}`).toEqual([]);
      }
    }
  });

  it('одну и ту же досыпанную букву не кладут больше трёх раз (буквы слов считаются)', () => {
    for (const { title, words } of NAMED_SETS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        const total = new Map<string, number>();
        for (const row of grid.letters) {
          for (const ch of row) total.set(ch, (total.get(ch) ?? 0) + 1);
        }
        for (const { row, col } of fillerCells(grid)) {
          const ch = grid.letters[row]?.[col] ?? '';
          expect(total.get(ch), `${title}, seed ${seed}, буква ${ch}`).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('лишних слов по-прежнему ноль на каждом seed', () => {
    for (const { title, words } of NAMED_SETS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        for (const word of words) {
          expect(occurrences(grid, word), `${title}, ${word}, ${seed}`).toBe(1);
        }
      }
    }
  });

  it('последняя пустая клетка не дописывает слово из чужих букв', () => {
    // `l`, `o`, `v` лежат в ряду не как слово, а справа пустая клетка: буква `e` сложила бы
    // `love` там, где игра его не ждёт. Каждая другая буква разрешена.
    const placement: Placement = { word: 'love', row: 0, col: 0, horizontal: true };
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const letters = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => 'z'));
      letters[0] = ['l', 'o', 'v', 'e', 'z', 'z', 'z'];
      letters[3] = ['l', 'o', 'v', '', 'z', 'z', 'z'];
      fillRest(letters, ['love'], [placement], makeRng(seed));
      expect(letters[3]?.[3], `seed ${seed}`).not.toBe('e');
      expect(letters[3]?.[3]).toMatch(/^[a-z]$/);
    }
  });

  it('тесное поле собирается: пустых клеток нет, каждое слово читается один раз', () => {
    // Пять слов по пять букв на 7×7: свободных клеток мало, а первых букв — пять.
    // Круги ослабления сюда не обязаны доходить — их проверяет блок ниже,
    // на поле, собранном руками.
    const tight = ['abcde', 'fghij', 'klmno', 'pqrst', 'uvwxy'];
    for (let seed = 1; seed <= 40; seed += 1) {
      const grid = buildWordGrid(tight, GRID, seed);
      for (const word of tight) expect(occurrences(grid, word), `${word}, ${seed}`).toBe(1);
      for (const row of grid.letters) {
        for (const ch of row) expect(ch).toMatch(/^[a-z]$/);
      }
    }
  });
});


/**
 * Круги ослабления на поле, собранном руками: строгий круг тут невозможен, и
 * видно, какое правило снято первым, а какое — вторым. На настоящих наборах до
 * ослабления дело не доходит, и без этого блока круги никто не проверял.
 *
 * Слова здесь не настоящие: они кончаются на `0`, а на поле такой клетки нет, так
 * что слово никогда не «читается» и запрет лишнего слова молчит. Ложное начало —
 * пара соседних букв, равная двум первым буквам слова, — задаётся парой букв.
 */
describe('круги ослабления досыпки', () => {
  const ABC = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const FREE = { row: 3, col: 3 };

  /** Поле, где свободна одна клетка (3,3), а остальное залито `fill(row, col)`. */
  function oneFree(fill: (row: number, col: number) => string): string[][] {
    const letters = Array.from({ length: GRID }, (_, row) =>
      Array.from({ length: GRID }, (_, col) => fill(row, col)),
    );
    const line = letters[FREE.row];
    if (line !== undefined) line[FREE.col] = '';
    return letters;
  }

  /** Слова лежат в нижней строке и пар в центре поля не задевают. */
  const parked = (words: readonly string[]): Placement[] =>
    words.map((word) => ({ word, row: GRID - 1, col: 0, horizontal: true }));

  const pickedAt = (letters: string[][]): string => letters[FREE.row]?.[FREE.col] ?? '';

  it('первым снимается предел повторов: буква берётся из тех, что уже стоят много раз', () => {
    // Первые буквы слов — a…t; остальные шесть (u…z) стоят по восемь раз. Строгий
    // круг пуст: u…z исчерпали предел, a…t — первые буквы. Предел снимается, а
    // запрет первых букв остаётся: выбор — из u…z.
    const words = ABC.slice(0, 20).map((letter) => `${letter}0`);
    const tail = ABC.slice(20);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const letters = oneFree((row, col) => tail[(row * GRID + col) % tail.length] ?? 'u');
      fillRest(letters, words, [], makeRng(seed));
      const chosen = pickedAt(letters);
      expect(tail, `seed ${seed}: выбрана первая буква слова ${chosen}`).toContain(chosen);
      seen.add(chosen);
    }
    // Выбор настоящий, а не «всегда одна и та же».
    expect(seen.size).toBeGreaterThan(2);
  });

  it('вторыми снимаются первые буквы, а не ложные начала: выбрана `a`, хоть она и первая', () => {
    // Поле из одних `a`; слова `ab0`…`az0`. `a` — первая буква всех слов, и круги
    // 1–2 её не пускают; любая другая буква даёт пару `aX` — начало слова. Круг 3
    // снимает запрет первых букв и оставляет запрет ложных начал: выбор — `a`.
    // Если бы вторым снимался запрет ложных начал, выбралась бы любая из b…z.
    const words = ABC.slice(1).map((letter) => `a${letter}0`);
    for (let seed = 1; seed <= 60; seed += 1) {
      const letters = oneFree(() => 'a');
      fillRest(letters, words, parked(words), makeRng(seed));
      expect(pickedAt(letters), `seed ${seed}`).toBe('a');
    }
  });

  it('последним снимается запрет ложных начал: ложное начало лучше дыры в поле', () => {
    // Теперь и `aa0` — слово: каждая буква складывает с соседней `a` начало
    // какого-то слова. Строгие круги пусты, круг 4 оставляет один запрет — лишнего
    // слова, — и клетка не остаётся пустой.
    const words = ABC.map((letter) => `a${letter}0`);
    for (let seed = 1; seed <= 60; seed += 1) {
      const letters = oneFree(() => 'a');
      fillRest(letters, words, parked(words), makeRng(seed));
      expect(pickedAt(letters), `seed ${seed}`).toMatch(/^[a-z]$/);
    }
  });

  it('когда не сошёлся ни один круг, запасная буква случайная, а не всегда одна и та же', () => {
    // Слова `aa`…`az` и соседние `a`: любая буква дописывает чужое слово, и пусто
    // во всех четырёх кругах. Остаётся запасная буква из алфавита.
    const words = ABC.map((letter) => `a${letter}`);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const letters = oneFree(() => 'a');
      fillRest(letters, words, [], makeRng(seed));
      const chosen = pickedAt(letters);
      expect(chosen, `seed ${seed}`).toMatch(/^[a-z]$/);
      seen.add(chosen);
    }
    expect(seen.size, 'запасная буква не меняется от seed').toBeGreaterThan(10);
  });

  it('запасная буква не дописывает настоящее слово: и в последнем круге лишнее слово под запретом', () => {
    // Всё как в прошлом кейсе, но среди слов есть и настоящее `ab`: слева от
    // свободной клетки стоит `a`, и `b` сложила бы его там, где игра его не ждёт.
    // Без четвёртого круга (одного запрета лишнего слова) запасная буква брала бы
    // любую из алфавита — и `b` выпадала бы, как любая другая.
    const words = [...ABC.map((letter) => `a${letter}0`), 'ab'];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const letters = oneFree(() => 'a');
      fillRest(letters, words, parked(words), makeRng(seed));
      const chosen = pickedAt(letters);
      expect(chosen, `seed ${seed}: дописано слово ab`).not.toBe('b');
      expect(chosen).toMatch(/^[a-z]$/);
      seen.add(chosen);
    }
    // Выбор остался случайным среди разрешённых, а не одной буквой.
    expect(seen.size).toBeGreaterThan(10);
  });
});
