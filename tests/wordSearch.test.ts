/**
 * «Find a word» заново: выбор слова по буквам (клик, нажатие, протягивание),
 * новый расклад на каждый заход, приглушение цветом, список слов.
 *
 * Досыпка букв и круги её ослабления — в `tests/wordFill.test.ts`, жест
 * (нажатие, протягивание, отпускание, тишина, abort) — в `tests/wordGesture.test.ts`:
 * вместе с этим блоком файл перешагнул бы порог в шестьсот строк.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ENGLISH_LIST,
  SEARCH_DOTS_Y,
  SEARCH_DRAG_MIN,
  SEARCH_GRID,
  SEARCH_LIT_SCALE,
  searchCellAt,
  searchCellCenter,
} from '../src/art/englishLayout';
import { PUZZLE_PANEL } from '../src/art/layout';
import { DOT_RADIUS } from '../src/art/progressDots';
import { ENGLISH_SETS } from '../src/data/english';
import { anagramLetters } from '../src/systems/anagramDeal';
import { randomSeed } from '../src/systems/rng';
import { buildWordGrid, type Placement } from '../src/systems/wordGrid';
import { createWordPick, placementCells } from '../src/systems/wordPick';

const GRID = 7;
/** Сколько раз прогоняем каждый набор: поле теперь новое при каждом заходе. */
const SEEDS = 200;

/**
 * Часы сцены, которые идут сами: время в `press`/`drag`/`click` обязательно (002-30).
 * Шаг больше окна тишины после находки, поэтому «молчание» проверяют тесты с
 * явным временем, а не случайное совпадение часов.
 */
let clock = 0;
const tick = (): number => (clock += 1000);

const NAMED_SETS = ENGLISH_SETS.map((set) => ({
  title: set.title,
  words: set.words.map((word) => word.en),
}));

describe('выбор слова по буквам', () => {
  it('верный путь кликами находит слово: на любом наборе и seed', () => {
    for (const { title, words } of NAMED_SETS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        const pick = createWordPick(grid.placements);
        const found: string[] = [];
        for (const place of grid.placements) {
          const cells = placementCells(place);
          cells.forEach((cell, i) => {
            const result = pick.click(cell, tick());
            const where = `${title}, ${place.word}, seed ${seed}, буква ${i}`;
            if (i === cells.length - 1) {
              expect(result.kind, where).toBe('found');
              if (result.kind === 'found') found.push(result.place.word);
            } else {
              expect(result.kind, where).toBe(i === 0 ? 'start' : 'extend');
            }
          });
        }
        expect(found, `${title}, seed ${seed}`).toEqual(words);
        expect(pick.path).toEqual([]);
      }
    }
  });

  it('слова находятся и в обратном порядке: пересечения не мешают', () => {
    for (const { words } of NAMED_SETS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        const pick = createWordPick(grid.placements);
        const found = new Set<string>();
        for (const place of [...grid.placements].reverse()) {
          for (const cell of placementCells(place)) {
            const result = pick.click(cell, tick());
            if (result.kind === 'found') found.add(result.place.word);
          }
        }
        expect(found.size).toBe(words.length);
      }
    }
  });

  it('протягивание: нажал на первую, провёл по остальным — слово найдено', () => {
    for (const { words } of NAMED_SETS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        const pick = createWordPick(grid.placements);
        for (const place of grid.placements) {
          const [first, ...rest] = placementCells(place);
          if (first === undefined) continue;
          expect(pick.click(first, tick()).kind).toBe('start');
          const kinds = rest.map((cell) => pick.drag(cell, SEARCH_DRAG_MIN, tick()).kind);
          expect(kinds[kinds.length - 1]).toBe('found');
          expect(kinds.slice(0, -1).every((kind) => kind === 'extend')).toBe(true);
        }
      }
    }
  });

  /** Три слова на руках: sun и bus пересекаются в `u`, cat лежит отдельно. */
  const sun: Placement = { word: 'sun', row: 1, col: 0, horizontal: true };
  const bus: Placement = { word: 'bus', row: 0, col: 1, horizontal: false };
  const cat: Placement = { word: 'cat', row: 5, col: 2, horizontal: true };
  const crossing: Placement[] = [sun, bus, cat];

  it('неверная буква не меняет путь', () => {
    const pick = createWordPick(crossing);
    expect(pick.click({ row: 4, col: 4 }, tick()).kind).toBe('wrong');
    expect(pick.path).toEqual([]);
    pick.click({ row: 1, col: 0 }, tick());
    pick.click({ row: 1, col: 1 }, tick());
    // Не следующая буква слова: ни чужая, ни соседняя по диагонали.
    expect(pick.click({ row: 2, col: 2 }, tick()).kind).toBe('wrong');
    // Первая буква другого слова тоже не продолжает это.
    expect(pick.click({ row: 5, col: 2 }, tick()).kind).toBe('wrong');
    expect(pick.path).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it('клик по выбранной снимает её и всё после неё', () => {
    const pick = createWordPick(crossing);
    pick.click({ row: 5, col: 2 }, tick());
    pick.click({ row: 5, col: 3 }, tick());
    expect(pick.click({ row: 5, col: 2 }, tick()).kind).toBe('trim');
    expect(pick.path).toEqual([]);

    pick.click({ row: 1, col: 0 }, tick());
    pick.click({ row: 1, col: 1 }, tick());
    pick.click({ row: 1, col: 0 }, tick());
    expect(pick.path).toEqual([]);

    // Снять можно и с середины: остаётся то, что до неё.
    pick.click({ row: 5, col: 2 }, tick());
    pick.click({ row: 5, col: 3 }, tick());
    pick.click({ row: 5, col: 3 }, tick());
    expect(pick.path).toEqual([{ row: 5, col: 2 }]);
    // И продолжить с того же места можно сразу.
    expect(pick.click({ row: 5, col: 3 }, tick()).kind).toBe('extend');
  });

  it('очистка снимает весь путь', () => {
    const pick = createWordPick(crossing);
    pick.click({ row: 1, col: 0 }, tick());
    pick.click({ row: 1, col: 1 }, tick());
    pick.clear();
    expect(pick.path).toEqual([]);
    expect(pick.click({ row: 1, col: 0 }, tick()).kind).toBe('start');
  });

  it('путь через букву найденного слова работает как обычный', () => {
    const pick = createWordPick(crossing);
    for (const cell of placementCells(sun)) pick.click(cell, tick());
    expect(pick.isFound('sun')).toBe(true);
    // `u` принадлежит найденному sun, но сверху на ней стоит bus.
    const kinds = placementCells(bus).map((cell) => pick.click(cell, tick()).kind);
    expect(kinds).toEqual(['start', 'extend', 'found']);
    // Найденное слово заново не начинается.
    expect(pick.click({ row: 1, col: 0 }, tick()).kind).toBe('wrong');
  });

  it('протягивание мимо ничего не ломает: чужая клетка молчит, выбранная не снимается', () => {
    const pick = createWordPick(crossing);
    // Без начатого пути протягивание ничего не начинает.
    expect(pick.drag({ row: 1, col: 0 }, SEARCH_DRAG_MIN, tick()).kind).toBe('ignore');
    expect(pick.path).toEqual([]);
    pick.click({ row: 1, col: 0 }, tick());
    expect(pick.drag({ row: 3, col: 3 }, SEARCH_DRAG_MIN, tick()).kind).toBe('ignore');
    expect(pick.drag({ row: 1, col: 0 }, SEARCH_DRAG_MIN, tick()).kind).toBe('ignore');
    expect(pick.path).toEqual([{ row: 1, col: 0 }]);
    // Верная следующая буква продолжает путь, чужая — нет (раньше это спрашивали
    // у `wouldExtend`; живая проверка та же: что делает протягивание).
    expect(pick.drag({ row: 1, col: 1 }, SEARCH_DRAG_MIN, tick()).kind).toBe('extend');
    expect(pick.path).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });
});

describe('новый расклад при каждом заходе', () => {
  it('без seed заходы разные: сцена берёт randomSeed, а не число из кода', () => {
    const seeds = new Set(Array.from({ length: 30 }, () => randomSeed()));
    expect(seeds.size).toBeGreaterThan(25);
    const words = NAMED_SETS[0]?.words ?? [];
    const grids = new Set(
      Array.from({ length: 10 }, () => buildWordGrid(words, GRID, randomSeed()).letters.join('|')),
    );
    expect(grids.size).toBeGreaterThan(8);
  });

  it('с одним seed поле и плитки слова те же', () => {
    const words = NAMED_SETS[1]?.words ?? [];
    expect(buildWordGrid(words, GRID, 99).letters).toEqual(buildWordGrid(words, GRID, 99).letters);
    expect(anagramLetters('look', 5)).toEqual(anagramLetters('look', 5));
  });

  it('плитки слова — его буквы и одна лишняя, и порядок не равен слову', () => {
    for (const set of ENGLISH_SETS) {
      for (const { en } of set.words) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const letters = anagramLetters(en, seed);
          expect(letters, `${en}, ${seed}`).toHaveLength(en.length + 1);
          const rest = [...letters];
          const spare: string[] = [];
          for (const ch of en) {
            const at = rest.indexOf(ch);
            expect(at, `${en}, ${seed}: нет буквы ${ch}`).toBeGreaterThanOrEqual(0);
            rest.splice(at, 1);
          }
          spare.push(...rest);
          expect(spare, `${en}, ${seed}`).toHaveLength(1);
          expect(en.includes(spare[0] ?? ''), `${en}: лишняя буква есть в слове`).toBe(false);
          // Плитки уже в порядке слова — ребёнку нечего собирать.
          const inOrder = letters.filter((ch) => en.includes(ch)).join('');
          expect(inOrder, `${en}, ${seed}: слово разложено готовым`).not.toBe(en);
        }
      }
    }
  });

  it('разные seed дают разный расклад плиток', () => {
    for (const set of ENGLISH_SETS) {
      for (const { en } of set.words) {
        const layouts = new Set(
          Array.from({ length: 40 }, (_, seed) => anagramLetters(en, seed + 1).join('')),
        );
        expect(layouts.size, en).toBeGreaterThan(5);
      }
    }
  });
});

/**
 * Приглушение — цветом, а не прозрачностью.
 *
 * Сквозь альфу просвечивает панель, и слово, «?» или плитка читаются как
 * сломанные, а не как отработавшие (чек-лист ux-review, пункт 2). Сцены на
 * Phaser тут не поднять, поэтому проверяем исходники — как стражи `setFillStyle`
 * и `Phaser.Geom` в соседних тестах.
 */
describe('приглушение в английской ветке', () => {
  const read = (path: string): string =>
    readFileSync(new URL(path, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  /** Строки, где альфа задана дробью: 0.92, 0.6, 0.45... */
  function fractionalAlpha(code: string): string[] {
    return code
      .split('\n')
      .filter((line) => /alpha/i.test(line) && /(?<![\d.])0?\.\d+/.test(line))
      .map((line) => line.trim());
  }

  /** Тело createHintButton: от объявления до следующей экспортируемой функции. */
  function hintButton(code: string): string {
    const from = code.indexOf('export function createHintButton');
    const to = code.indexOf('export function createWordPrompt');
    return code.slice(from, to);
  }

  it('плитки поля, слово в списке и его «?» не получают дробной альфы', () => {
    expect(fractionalAlpha(read('../src/scenes/EnglishSearchScene.ts'))).toEqual([]);
    const ui = read('../src/scenes/englishUi.ts');
    expect(hintButton(ui).length).toBeGreaterThan(500);
    expect(fractionalAlpha(hintButton(ui))).toEqual([]);
  });

  it('проверка отличает дробную альфу от целой', () => {
    expect(fractionalAlpha('tile.setAlpha(0.92);\nrow.setAlpha(1);\ntext.setAlpha(0);')).toEqual([
      'tile.setAlpha(0.92);',
    ]);
    expect(fractionalAlpha('alpha: next ? 0.85 * faded : 0')).toHaveLength(1);
    expect(fractionalAlpha('const x = 0.5;')).toEqual([]);
  });
});

describe('сцены берут seed из данных, а иначе случайный', () => {
  const code = (name: string): string =>
    readFileSync(new URL(`../src/scenes/${name}.ts`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('и поиск слова, и «Make a word» — `data.seed ?? randomSeed()`, без числа в коде', () => {
    for (const name of ['EnglishSearchScene', 'EnglishAnagramScene']) {
      const source = code(name);
      expect(source, name).toMatch(/this\.seed\s*=\s*data\.seed\s*\?\?\s*randomSeed\(\)/);
      expect(source, `${name}: расклад от номера набора`).not.toMatch(/\b(4200|7100)\b/);
    }
  });
});

describe('перевод за «?» в списке поиска', () => {
  it('самый длинный перевод раскрывается внутри панели и не наезжает на слово', () => {
    // Перевод встаёт по центру кнопки: «Мы — друзья» вылезал за правый край панели.
    const longest = Math.max(...ENGLISH_SETS.flatMap((set) => set.words.map((w) => w.ru.length)));
    const width = longest * ENGLISH_LIST.hintTextSize * ENGLISH_LIST.hintCharWidth;
    const centre = ENGLISH_LIST.x + ENGLISH_LIST.hintDx;
    expect(centre + width / 2, 'правый край перевода').toBeLessThanOrEqual(PUZZLE_PANEL.right - 16);
    expect(centre - width / 2, 'левый край перевода').toBeGreaterThan(
      ENGLISH_LIST.wordLeft + ENGLISH_LIST.wordMaxWidth,
    );
  });
});

describe('список слов в «Find a word»', () => {
  it('кнопка звука не лежит на кнопке «?» первого слова', () => {
    // Лежала — на десять пикселей, — и лечили это уменьшенной зоной нажатия
    // у подсказки: на экране один круг по-прежнему был поверх другого.
    const speakBottom = ENGLISH_LIST.speakY + ENGLISH_LIST.speakRadius;
    const firstHintTop = ENGLISH_LIST.top - ENGLISH_LIST.hintRadius;
    expect(firstHintTop - speakBottom).toBeGreaterThanOrEqual(ENGLISH_LIST.gap);
  });

  it('пять строк списка умещаются в панель', () => {
    const last = ENGLISH_LIST.top + 4 * ENGLISH_LIST.step + ENGLISH_LIST.hintRadius;
    expect(last).toBeLessThanOrEqual(PUZZLE_PANEL.bottom);
  });

  it('картинки слов стоят в своей колонке: правее поля, левее слов, строки не слипаются', () => {
    const gridRight = SEARCH_GRID.centerX + (SEARCH_GRID.size * (SEARCH_GRID.cell + SEARCH_GRID.gap)) / 2;
    const iconLeft = ENGLISH_LIST.iconX - ENGLISH_LIST.icon / 2;
    const iconRight = ENGLISH_LIST.iconX + ENGLISH_LIST.icon / 2;
    expect(iconLeft).toBeGreaterThan(gridRight);
    expect(iconRight).toBeLessThan(ENGLISH_LIST.wordLeft);
    // Самое длинное слово не доходит до «?».
    const hintLeft = ENGLISH_LIST.x + ENGLISH_LIST.hintDx - ENGLISH_LIST.hintRadius;
    expect(ENGLISH_LIST.wordLeft + ENGLISH_LIST.wordMaxWidth).toBeLessThan(hintLeft);
    // Соседние картинки разделены просветом, а не стоят встык.
    expect(ENGLISH_LIST.step - ENGLISH_LIST.icon).toBeGreaterThanOrEqual(ENGLISH_LIST.gap);
    // Верхняя картинка не наезжает на кнопку звука (она правее, но по высоте рядом).
    const iconTop = ENGLISH_LIST.top - ENGLISH_LIST.icon / 2;
    const speakBottom = ENGLISH_LIST.speakY + ENGLISH_LIST.speakRadius;
    expect(iconTop).toBeGreaterThanOrEqual(speakBottom - ENGLISH_LIST.gap);
    expect(ENGLISH_LIST.top + 4 * ENGLISH_LIST.step + ENGLISH_LIST.icon / 2).toBeLessThanOrEqual(
      PUZZLE_PANEL.bottom,
    );
  });

  it('ширина колонки слов считается по самому длинному слову наборов, а не числом', () => {
    // Пока слова — до пяти букв, это те же 140; придут sister и brother — колонка
    // вырастет сама, а тест про «?» ниже покажет, влезает ли она. Ниже 0,6 кегля
    // на букву жирный шрифт не сжимается: «green» на экране — 0,55.
    const longest = Math.max(...ENGLISH_SETS.flatMap((set) => set.words.map((word) => word.en.length)));
    expect(ENGLISH_LIST.wordMaxWidth).toBeGreaterThanOrEqual(longest * ENGLISH_LIST.wordSize * 0.6);
  });

  it('поле букв стоит в панели и под рядом точек, плитки с просветом', () => {
    const half = (SEARCH_GRID.size * (SEARCH_GRID.cell + SEARCH_GRID.gap) - SEARCH_GRID.gap) / 2;
    expect(SEARCH_GRID.centerX - half).toBeGreaterThanOrEqual(PUZZLE_PANEL.left);
    expect(SEARCH_GRID.centerY + half).toBeLessThanOrEqual(PUZZLE_PANEL.bottom);
    // Плитки начинаются ниже ряда точек: его высоту и радиус точки берём из кода.
    expect(SEARCH_GRID.centerY - half).toBeGreaterThan(SEARCH_DOTS_Y + DOT_RADIUS);
    // Подсвеченная плитка не налезает на соседей.
    expect(SEARCH_GRID.cell * (SEARCH_LIT_SCALE - 1)).toBeLessThan(SEARCH_GRID.gap);
  });

  it('плитка под рукой считается по координатам: центры, края, просветы, мимо поля', () => {
    const { size, cell, gap } = SEARCH_GRID;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const { x, y } = searchCellCenter(row, col);
        expect(searchCellAt(x, y)).toEqual({ row, col });
        // Край плитки — ещё она, просвет за краем — уже никто.
        expect(searchCellAt(x + cell / 2, y)).toEqual({ row, col });
        if (col < size - 1) expect(searchCellAt(x + cell / 2 + gap / 2, y)).toBeNull();
        if (row < size - 1) expect(searchCellAt(x, y + cell / 2 + gap / 2)).toBeNull();
      }
    }
    expect(searchCellAt(0, 0)).toBeNull();
    expect(searchCellAt(SEARCH_GRID.centerX, SEARCH_GRID.centerY + 600)).toBeNull();
  });

  it('дрожь руки меньше протягивания: больше просвета, но меньше половины плитки', () => {
    // Меньше просвета — небрежный клик на стыке добавлял бы вторую букву;
    // больше половины плитки — от центра одной до соседней не дотянуть.
    expect(SEARCH_DRAG_MIN).toBeGreaterThanOrEqual(SEARCH_GRID.gap * 2);
    expect(SEARCH_DRAG_MIN).toBeLessThanOrEqual(SEARCH_GRID.cell / 2);
  });
});
