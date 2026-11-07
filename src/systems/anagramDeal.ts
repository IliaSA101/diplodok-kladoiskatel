/**
 * Плитки «Make a word»: буквы слова и лишняя, разложенные по seed.
 *
 * Модуль без Phaser, чтобы расклад проверялся тестом. Раскладка была одной и
 * той же при каждом заходе, и «набор картинок — тоже содержимое»: теперь seed
 * берётся новый на каждый вход (`randomSeed`), а `?shots` и e2e подставляют свой.
 */
import { makeRng } from './rng';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
/** Одна лишняя буква: выбор есть, но перебирать нечего. */
const EXTRA_LETTERS = 1;
/** Сколько раз перемешиваем, пока плитки не перестанут лежать готовым словом. */
const SHUFFLES = 12;

/** Буквы слова остались в своём порядке — собирать нечего. */
function alreadySpelled(chars: readonly string[], word: string): boolean {
  return chars.filter((ch) => word.includes(ch)).join('') === word;
}

/** Плитки для слова: его буквы и лишняя, перемешанные. Один seed — один расклад. */
export function anagramLetters(word: string, seed: number): string[] {
  const rng = makeRng(seed);
  const inWord = new Set(word.split(''));
  const spare = rng.shuffle(ALPHABET.split('').filter((ch) => !inWord.has(ch)));
  const pool = [...word.split(''), ...spare.slice(0, EXTRA_LETTERS)];
  let chars = rng.shuffle(pool);
  // Новый расклад каждый раз — значит, и «слово выложено само» бывает чаще,
  // чем при одном проверенном seed. Три буквы и одна лишняя: каждая шестая.
  for (let attempt = 0; attempt < SHUFFLES && alreadySpelled(chars, word); attempt += 1) {
    chars = rng.shuffle(pool);
  }
  // Двенадцать раз подряд не повезло (шанс ничтожный) — переворачиваем ряд
  // плиток. Не у каждого слова это помогает: палиндром (dad, mum) читается так же,
  // и у него плитки в порядке слова остаются возможными.
  return alreadySpelled(chars, word) ? chars.slice().reverse() : chars;
}
