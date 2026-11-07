/**
 * Английская ветка: наборы слов и поле «найди слово».
 *
 * Эти проверки ловят то, что не видно ни типам, ни глазам: слово с русской
 * буквой внутри английского, слово длиннее поля поиска, набор, в котором
 * слов больше, чем точек прогресса, поле, где слово не читается там, где
 * игра его ждёт, и — самое обидное — слово, случайно сложившееся из
 * досыпанных букв в стороне: ребёнок его находит, а игра не засчитывает.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANAGRAM_ROW,
  CATCH_COLUMN,
  CATCH_ROW,
  SET_PICKER,
  SWATCH_OUTLINE,
  setPickerSpots,
} from '../src/art/englishLayout';
import { TEX } from '../src/art/keys';
import { rowFit } from '../src/art/layout';
import { DOT_RADIUS } from '../src/art/progressDots';
import { PALETTE } from '../src/art/palette';
import {
  ENGLISH_GAMES,
  ENGLISH_SETS,
  MAX_WORD_LENGTH,
  WORDS_PER_SET,
  englishSet,
  longestWordSetIndex,
  setBadge,
  wordHint,
} from '../src/data/english';
import { GAME_WIDTH } from '../src/config';
import { anagramLetters } from '../src/systems/anagramDeal';
import { englishSave } from '../src/systems/englishSave';
import { installMemoryStorage, type MemoryStorage } from './memoryStorage';
import { buildWordGrid, wordAt, type WordGrid } from '../src/systems/wordGrid';

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

/** Все места, где слово читается в поле. */
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

describe('наборы слов', () => {
  it('у каждого набора свой id', () => {
    expect(new Set(ENGLISH_SETS.map((set) => set.id)).size).toBe(ENGLISH_SETS.length);
  });

  it('в наборе ровно столько слов, сколько точек прогресса рисует игра', () => {
    for (const set of ENGLISH_SETS) {
      expect(set.words).toHaveLength(WORDS_PER_SET);
    }
  });

  it('слово — только строчная латиница и не длиннее поля поиска', () => {
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        expect(word.en).toMatch(/^[a-z]+$/);
        expect(word.en.length).toBeLessThanOrEqual(MAX_WORD_LENGTH);
      }
    }
  });

  it('перевод есть у каждого слова и написан по-русски', () => {
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        expect(word.ru.length).toBeGreaterThan(0);
        expect(word.ru).toMatch(/[а-яё]/i);
      }
    }
  });

  it('are переведён фразой целиком: «Мы — друзья»', () => {
    // Перевод одного слова «мы есть» ребёнку ничего не говорил: перевод всей фразы We __ friends.
    const word = ENGLISH_SETS.flatMap((set) => set.words).find((item) => item.en === 'are');
    expect(word?.ru).toBe('Мы — друзья');
  });

  it('внутри набора слова не повторяются', () => {
    for (const set of ENGLISH_SETS) {
      expect(new Set(set.words.map((word) => word.en)).size).toBe(set.words.length);
    }
  });

  it('слов в наборе не больше, чем строк в поле: иначе их некуда разложить', () => {
    expect(WORDS_PER_SET).toBeLessThanOrEqual(GRID);
  });

  it('номер набора за границами списка приводится к крайнему', () => {
    expect(englishSet(-5).id).toBe(ENGLISH_SETS[0]?.id);
    expect(englishSet(99).id).toBe(ENGLISH_SETS[ENGLISH_SETS.length - 1]?.id);
  });

  it('игр ровно три — по числу карточек на экране ветки', () => {
    expect(ENGLISH_GAMES).toHaveLength(3);
    expect(new Set(ENGLISH_GAMES).size).toBe(ENGLISH_GAMES.length);
  });
});

/**
 * Шесть наборов (И12): три старых на своих местах и три новых за ними.
 * Порядок и `id` держатся тестом: `id` лежат в сохранении, и переименованный
 * набор для ребёнка снова непройденный.
 */
describe('шесть наборов', () => {
  it('порядок: First, Animals, Colours, Football, Food, Family', () => {
    expect(ENGLISH_SETS.map((set) => set.id)).toEqual([
      'first',
      'animals',
      'colours',
      'football',
      'food',
      'family',
    ]);
    expect(ENGLISH_SETS.map((set) => set.title)).toEqual([
      'First words',
      'Animals',
      'Colours',
      'Football',
      'Food',
      'Family',
    ]);
  });

  it('новые слова — ровно те, что обещает спека, и с переводом', () => {
    const wanted: Record<string, [string, string][]> = {
      football: [['ball', 'мяч'], ['boot', 'бутса'], ['cup', 'кубок'], ['flag', 'флаг'], ['goal', 'ворота']],
      food: [['apple', 'яблоко'], ['milk', 'молоко'], ['bread', 'хлеб'], ['egg', 'яйцо'], ['cake', 'торт']],
      family: [['mum', 'мама'], ['dad', 'папа'], ['baby', 'малыш'], ['sister', 'сестра'], ['brother', 'брат']],
    };
    for (const [id, pairs] of Object.entries(wanted)) {
      const set = ENGLISH_SETS.find((item) => item.id === id);
      expect(set?.words.map((w) => [w.en, w.ru]), id).toEqual(pairs);
    }
  });

  it('у каждого нового слова подсказка — картинка, и она ещё и с английской фразой', () => {
    for (const set of ENGLISH_SETS.slice(3)) {
      for (const word of set.words) {
        expect(wordHint(word), `${set.id}: ${word.en}`).toBe('picture');
        expect(word.clue, `${set.id}: ${word.en}`).toBeDefined();
      }
    }
  });

  it('предел длины слова — семь, и самое длинное слово — brother', () => {
    expect(MAX_WORD_LENGTH).toBe(7);
    const longest = Math.max(...ENGLISH_SETS.flatMap((set) => set.words.map((word) => word.en.length)));
    expect(longest).toBe(MAX_WORD_LENGTH);
    expect(ENGLISH_SETS.flatMap((set) => set.words).some((word) => word.en === 'brother')).toBe(true);
  });

  it('обход ?shots берёт набор с самым длинным словом, а не последний', () => {
    const index = longestWordSetIndex();
    expect(englishSet(index).words.some((word) => word.en.length === MAX_WORD_LENGTH)).toBe(true);
    expect(englishSet(index).id).toBe('family');
    // Если самое длинное слово окажется в другом наборе — обход должен пойти туда.
    const lengths = ENGLISH_SETS.map((set) => Math.max(...set.words.map((word) => word.en.length)));
    expect(lengths[index]).toBe(Math.max(...lengths));
  });

  it('семья читается по картинке: у каждого человека своя картинка и своя фраза', () => {
    const family = ENGLISH_SETS.find((set) => set.id === 'family');
    const icons = family?.words.map((word) => word.icon) ?? [];
    expect(new Set(icons).size).toBe(WORDS_PER_SET);
    const clues = family?.words.map((word) => word.clue) ?? [];
    expect(new Set(clues).size).toBe(WORDS_PER_SET);
  });

  it('картинка слова «goal» — ворота, а подпись в игре «net» не нужна: фраза отличает от сетки', () => {
    const goal = ENGLISH_SETS.flatMap((set) => set.words).find((word) => word.en === 'goal');
    expect(goal?.icon).toBe(TEX.FOOT[6]);
    expect(goal?.clue).toMatch(/score/i);
  });

  it('каждая картинка набора есть в TEX: ключ слова не придуман', () => {
    const known = new Set<string>([...TEX.FOOT, ...Object.values(TEX.EN_CLUE), ...Object.values(TEX.EN_SET)]);
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        if (word.icon !== undefined) expect(known.has(word.icon), `${set.id}: ${word.en}`).toBe(true);
      }
    }
  });
});

/**
 * Сохранение 1.1 хранит пары `набор:игра`. Наборов стало шесть, и всё, что
 * ребёнок уже прошёл, обязано остаться пройденным (спека 003, сценарий 4).
 */
describe('сохранение после добавления наборов', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = installMemoryStorage();
  });

  it('старые пары читаются без потерь, новые наборы начинаются пустыми', () => {
    storage.setItem(
      'diplodok-kladoiskatel:v3:english-done',
      JSON.stringify(['first:anagram', 'animals:search', 'colours:catch']),
    );
    expect(englishSave.isDone('first', 'anagram')).toBe(true);
    expect(englishSave.isDone('animals', 'search')).toBe(true);
    expect(englishSave.isDone('colours', 'catch')).toBe(true);
    for (const set of ENGLISH_SETS.slice(3)) {
      expect(englishSave.doneCount(set.id), set.id).toBe(0);
    }
    englishSave.markDone('family', 'anagram');
    expect(englishSave.doneCount('family')).toBe(1);
    expect(englishSave.doneCount('first')).toBe(1);
  });
});

/**
 * Кружок набора: картинка вместо цифры (003-2). Одна фигура на кружок, а
 * у «Colours» картинки нет — там колесо из пятен тех же цветов, что в словах.
 */
describe('кружки наборов', () => {
  it('у каждого набора своя картинка кружка', () => {
    const shown = ENGLISH_SETS.map((set) => JSON.stringify(setBadge(set)));
    expect(new Set(shown).size).toBe(ENGLISH_SETS.length);
  });

  it('картинка кружка — из текстур игры; у цветов — колесо из их пятен', () => {
    const known = new Set<string>([
      ...TEX.FOOT,
      ...Object.values(TEX.EN_CLUE),
      ...Object.values(TEX.EN_SET),
    ]);
    for (const set of ENGLISH_SETS) {
      const badge = setBadge(set);
      if (badge.kind === 'picture') expect(known.has(badge.key), set.id).toBe(true);
      else expect(badge.colours, set.id).toEqual(set.words.map((word) => word.swatch));
    }
    expect(setBadge(englishSet(2)).kind).toBe('wheel');
    expect(setBadge(englishSet(3))).toEqual({ kind: 'picture', key: TEX.FOOT[0] });
    expect(setBadge(englishSet(4)).kind).toBe('picture');
    expect(setBadge(englishSet(5))).toEqual({ kind: 'picture', key: TEX.EN_SET.family });
  });

  it('кружки стоят рядом, по центру, не наезжают друг на друга и на углы', () => {
    const spots = setPickerSpots(ENGLISH_SETS.length);
    expect(spots).toHaveLength(6);
    const big = SET_PICKER.radius * SET_PICKER.selectedScale;
    for (let i = 1; i < spots.length; i += 1) {
      // выбранный кружок крупнее остальных: считаем по нему, самый тесный случай
      expect((spots[i] ?? 0) - (spots[i - 1] ?? 0) - big - SET_PICKER.radius).toBeGreaterThan(4);
    }
    const first = spots[0] ?? 0;
    const last = spots[spots.length - 1] ?? 0;
    expect((first + last) / 2).toBeCloseTo(GAME_WIDTH / 2, 6);
    // Слева кнопка «назад» (правый край 168), справа кнопка звука (левый край 1160).
    expect(first - big).toBeGreaterThan(168 + 40);
    expect(last + big).toBeLessThan(1160 - 40);
  });

  it('картинка на кружке крупная, но в кружок вписана', () => {
    const side = SET_PICKER.radius * 2 * SET_PICKER.pictureShare;
    expect(side).toBeGreaterThanOrEqual(48);
    expect(side).toBeLessThanOrEqual(SET_PICKER.radius * 2 * 0.85);
  });
});

/**
 * Самое длинное слово в играх: `brother` из семи букв.
 * «Make a word» кладёт плитки слова и одну лишнюю — восемь в ряд; «Catch letters» —
 * семь клеток. Меньше 64 пикселей ребёнку не попасть, меньше 80 — не прочесть букву.
 */
describe('семь букв в играх ветки', () => {
  it('«Make a word»: восемь плиток и семь ячеек не мельче порога и не вылезают', () => {
    const letters = anagramLetters('brother', 1);
    expect(letters).toHaveLength(8);
    const { left, right, maxStep, tile, gap } = ANAGRAM_ROW;
    const pool = rowFit(letters.length, left, right, maxStep, tile, gap);
    expect(pool.size).toBeGreaterThanOrEqual(80);
    const cells = rowFit(7, left, right, maxStep, pool.size, gap + ANAGRAM_ROW.cellGap);
    expect(cells.size).toBeGreaterThanOrEqual(80);
    for (const row of [pool, cells]) {
      expect((row.spots[0] ?? 0) - row.size / 2).toBeGreaterThanOrEqual(left);
      expect((row.spots[row.spots.length - 1] ?? 0) + row.size / 2).toBeLessThanOrEqual(right);
    }
  });

  it('«Catch letters»: семь клеток слова не мельче порога', () => {
    const { left, right, maxStep, tile, gap } = CATCH_ROW;
    const row = rowFit(MAX_WORD_LENGTH, left, right, maxStep, tile, gap);
    expect(row.size).toBeGreaterThanOrEqual(80);
    expect((row.spots[0] ?? 0) - row.size / 2).toBeGreaterThanOrEqual(left);
    expect((row.spots[6] ?? 0) + row.size / 2).toBeLessThanOrEqual(right);
  });
});

describe('«Catch letters»: картинка-задание между точками и клетками', () => {
  it('портрет без полей не касается ни ряда точек, ни клеток слова', () => {
    const half = (CATCH_COLUMN.promptSize * 2.4) / 2;
    const dotsBottom = CATCH_COLUMN.dotsY + DOT_RADIUS;
    expect(CATCH_COLUMN.promptY - half - dotsBottom).toBeGreaterThanOrEqual(6);
    // Клетки семи букв крупнее всего у короткого слова: берём плитку наибольшего размера.
    const slotTop = CATCH_COLUMN.slotsY - CATCH_ROW.tile / 2;
    expect(slotTop - (CATCH_COLUMN.promptY + half)).toBeGreaterThanOrEqual(6);
  });
});

describe('поле «найди слово»', () => {
  const sets = ENGLISH_SETS.map((set) => set.words.map((word) => word.en));

  it('каждое слово лежит там, где обещает раскладка', () => {
    for (const words of sets) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        expect(grid.placements).toHaveLength(words.length);
        grid.placements.forEach((place, i) => {
          expect(place.word).toBe(words[i]);
          expect(readsAt(grid, place.word, place.row, place.col, place.horizontal)).toBe(true);
        });
      }
    }
  });

  it('поле 7×7 раскладывает каждый набор без запасной раскладки: 200 seed на набор', () => {
    // Запасная — слово за словом сверху вниз от левого края: поле выглядит
    // «лесенкой» и каждый раз одинаково. «Семья» (brother, sister) самая тесная.
    for (const words of sets) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        const ladder = grid.placements.every(
          (place, i) => place.row === i && place.col === 0 && place.horizontal,
        );
        expect(ladder, `${words.join(',')} seed ${seed}`).toBe(false);
      }
    }
  });

  it('слово читается в поле ровно один раз: лишних находок не бывает', () => {
    for (const words of sets) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const grid = buildWordGrid(words, GRID, seed);
        for (const word of words) {
          expect(occurrences(grid, word)).toBe(1);
        }
      }
    }
  });

  it('пустых клеток не остаётся', () => {
    const grid = buildWordGrid(sets[0] ?? [], GRID, 17);
    for (const row of grid.letters) {
      expect(row).toHaveLength(GRID);
      for (const cell of row) expect(cell).toMatch(/^[a-z]$/);
    }
  });

  it('один и тот же seed даёт одно и то же поле', () => {
    const words = sets[1] ?? [];
    expect(buildWordGrid(words, GRID, 55).letters).toEqual(buildWordGrid(words, GRID, 55).letters);
  });

  it('первая и последняя буква слова его находят, любая другая пара — нет', () => {
    const words = sets[0] ?? [];
    const grid = buildWordGrid(words, GRID, 9);
    for (const place of grid.placements) {
      const last = place.word.length - 1;
      const end = {
        row: place.row + (place.horizontal ? 0 : last),
        col: place.col + (place.horizontal ? last : 0),
      };
      expect(wordAt(grid, place, end)?.word).toBe(place.word);
      // Концы наоборот — это чтение задом наперёд, его мы не считаем.
      expect(wordAt(grid, end, place)).toBeNull();
    }
    expect(wordAt(grid, { row: 0, col: 0 }, { row: 6, col: 6 })).toBeNull();
  });

  it('слово длиннее поля или лишнее слово — это ошибка, а не кривое поле', () => {
    expect(() => buildWordGrid(['elephant'], GRID, 1)).toThrow();
    expect(() => buildWordGrid(['a'], 0, 1)).toThrow();
    expect(() => buildWordGrid(Array.from({ length: GRID + 1 }, () => 'cat'), GRID, 1)).toThrow();
  });
});

/**
 * Английская ветка должна быть английской.
 *
 * Русское слово было подписью под каждым английским: ребёнок читал перевод и
 * английское слово не смотрел вовсе. Теперь перевод — подсказка за кнопкой
 * «?», а на виду стоит английское: фраза с пропуском, звук или пятно цвета.
 */
describe('подсказки английских слов', () => {
  it('у каждого слова есть английская подсказка, а не один перевод', () => {
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        expect(wordHint(word), `${set.title}: ${word.en}`).not.toBe('translation');
      }
    }
  });

  it('в самой подсказке нет русских букв — она и есть английская часть', () => {
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        if (word.clue === undefined) continue;
        expect(/[А-Яа-яЁё]/.test(word.clue), `${word.en}: ${word.clue}`).toBe(false);
      }
    }
  });

  it('фраза с пропуском и правда с пропуском, а слово в неё не вписано', () => {
    for (const set of ENGLISH_SETS) {
      for (const word of set.words) {
        if (word.clue === undefined || !word.clue.includes('__')) continue;
        const without = word.clue.replace(/__/g, ' ');
        expect(without.toLowerCase().includes(word.en.toLowerCase()), word.clue).toBe(false);
      }
    }
  });

  it('заголовки наборов — по-английски', () => {
    for (const set of ENGLISH_SETS) {
      expect(/[А-Яа-яЁё]/.test(set.title), set.title).toBe(false);
    }
  });
});

/**
 * Обводка пятна цвета. `white` залит цветом панели, и без заметной обводки он
 * читается пустым кружком (002-21): контраст обводки с панелью считаем, а не
 * смотрим глазом.
 */
describe('пятно цвета у слова', () => {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (rgb: number): number =>
    0.2126 * channel((rgb >> 16) & 255) +
    0.7152 * channel((rgb >> 8) & 255) +
    0.0722 * channel(rgb & 255);
  const contrast = (a: number, b: number): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };

  it('обводка отличается от панели заметно (3:1, как для значков), у каждого пятна', () => {
    const swatches = ENGLISH_SETS.flatMap((set) => set.words).filter((w) => w.swatch !== undefined);
    expect(swatches.map((w) => w.en)).toContain('white');
    for (const word of swatches) {
      expect(contrast(SWATCH_OUTLINE.color, PALETTE.uiPanel), word.en).toBeGreaterThanOrEqual(3);
    }
    expect(SWATCH_OUTLINE.width).toBeGreaterThanOrEqual(4);
  });

  it('проверка контраста отличает серую обводку от тёмной', () => {
    expect(contrast(PALETTE.uiButtonCalmDark, PALETTE.uiPanel)).toBeLessThan(3);
    expect(contrast(PALETTE.uiText, PALETTE.uiPanel)).toBeGreaterThan(7);
  });

  it('значок слова в списке берёт эту обводку, а не свою', () => {
    const ui = readFileSync(new URL('../src/scenes/englishUi.ts', import.meta.url), 'utf8');
    const from = ui.indexOf('export function createWordMark');
    expect(from).toBeGreaterThan(0);
    expect(ui.slice(from)).toContain('setStrokeStyle(SWATCH_OUTLINE.width, SWATCH_OUTLINE.color)');
  });
});

/**
 * Сцены Phaser тут не поднять, поэтому то, что стережёт чтение исходников, —
 * проводка, а не поведение; поведение — в e2e (`e2e/english.spec.ts`).
 */
describe('проводка английских сцен', () => {
  const code = (name: string): string =>
    readFileSync(new URL(`../src/scenes/${name}.ts`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('ряд точек в «Find a word» стоит на SEARCH_DOTS_Y, а не на своём числе', () => {
    expect(code('EnglishSearchScene')).toMatch(/createProgressDots\(this,\s*\{[^}]*y:\s*SEARCH_DOTS_Y/);
  });

  it('набор засчитывается в тот миг, когда найдено последнее слово, — в каждой из трёх игр', () => {
    // Esc в паузе перед звездой уходил раньше `finishEnglishGame`, и набор не
    // засчитывался (002-22). Запись зовётся в самой сцене, не на финале.
    for (const [name, game] of [
      ['EnglishSearchScene', 'search'],
      ['EnglishAnagramScene', 'anagram'],
      ['EnglishCatchScene', 'catch'],
    ] as const) {
      expect(code(name), name).toContain(`markEnglishDone(this.setIndex, '${game}')`);
    }
  });

  it('«Find a word»: жест начинает левая кнопка, потерянное отпускание гасит жест, время идёт в wordPick', () => {
    // 002-25/31: правый клик открывает меню браузера, отпускания игра не получит, и
    // буквы потом загорались от простого движения мыши; жест начинает только левая
    // кнопка. 002-28: потерянное отпускание — abort, а не отпускание. 002-26: нажатие и шаг
    // протягивания несут часы сцены, иначе защита от двойного клика спит.
    const scene = code('EnglishSearchScene');
    expect(scene).toMatch(/onDown\(cell: Cell, pointer[^)]*\)[^{]*\{[^}]*!pointer\.leftButtonDown\(\)\) return/);
    // 002-33: и нажатие, и отпускание отвечают только на событие левой кнопки: правая поверх
    // зажатой левой оставляет `leftButtonDown()` истинным, но ничем из жеста не является.
    expect(scene).toMatch(/onDown\(cell: Cell, pointer[^)]*\)[^{]*\{[^}]*pointer\.button !== 0 \|\| !pointer\.leftButtonDown\(\)\) return/);
    expect(scene).toMatch(/onRelease\(pointer[^)]*\)[^{]*\{[^}]*pointer\.button !== 0 \|\| !this\.pressed\) return/);
    expect(scene).toMatch(/pointer\.noButtonDown\(\)\)\s*\{\s*this\.pressed = false;\s*this\.pick\?\.abort\(\)/);
    expect(scene).toContain('.press(cell, this.time.now)');
    expect(scene).toContain('.drag(cell, travelled, this.time.now)');
  });
});
