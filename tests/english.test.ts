/**
 * Английская ветка: наборы слов и поле «найди слово».
 *
 * Эти проверки ловят то, что не видно ни типам, ни глазам: слово с русской
 * буквой внутри английского, слово длиннее поля поиска, набор, в котором
 * слов больше, чем точек прогресса, поле, где слово не читается там, где
 * игра его ждёт, и — самое обидное — слово, случайно сложившееся из
 * досыпанных букв в стороне: ребёнок его находит, а игра не засчитывает.
 */
import { describe, expect, it } from 'vitest';
import {
  ENGLISH_GAMES,
  ENGLISH_SETS,
  MAX_WORD_LENGTH,
  WORDS_PER_SET,
  englishSet,
  wordHint,
} from '../src/data/english';
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
