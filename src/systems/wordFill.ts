/**
 * Досыпка поля «Find a word»: случайные буквы в клетки, где слов нет.
 *
 * Модуль без Phaser. Случайная буква на поле — не мусор, а ловушка для
 * ребёнка, который ищет слово по буквам: одинокая `l` не на месте — самый
 * частый неверный первый клик, а пара `lo` не там, где лежит `love`, читается
 * как начало слова, которого нет. Поэтому досыпка подчиняется правилам, и у
 * каждого — своя причина:
 *
 * 1. не дописывать слов в чужих местах (нельзя ослабить никогда: ребёнок
 *    нашёл бы слово, а игра отказала бы ему в награде);
 * 2. не класть одну и ту же букву больше трёх раз, буквы слов считаются
 *    (поле из девяти `x` читается как «здесь что-то не так»);
 * 3. не класть первые буквы слов вовсе (одинокая `l` — ложный старт);
 * 4. не складывать с соседом две первые буквы слова не там, где оно лежит.
 *
 * Если правила не сошлись, ослабляются кругами — в таком порядке: сперва
 * повторы, потом первые буквы, потом ложные начала. Первое правило остаётся.
 */
import type { Rng } from './rng';
import type { Placement } from './wordGrid';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
/** Сколько раз одна и та же буква может стоять на поле (вместе с буквами слов). */
export const MAX_SAME_LETTER = 3;

interface Rules {
  limitRepeats: boolean;
  banFirstLetters: boolean;
  banFalseStarts: boolean;
}

/** Круги ослабления: от полного набора правил к одному запрету лишнего слова. */
const ROUNDS: readonly Rules[] = [
  { limitRepeats: true, banFirstLetters: true, banFalseStarts: true },
  { limitRepeats: false, banFirstLetters: true, banFalseStarts: true },
  { limitRepeats: false, banFirstLetters: false, banFalseStarts: true },
  { limitRepeats: false, banFirstLetters: false, banFalseStarts: false },
];

const keyOf = (place: Placement): string =>
  `${place.word}:${place.row}:${place.col}:${String(place.horizontal)}`;

/** Читается ли в этой точке именно это слово. */
function reads(letters: readonly string[][], place: Placement): boolean {
  const size = letters.length;
  const length = place.word.length;
  if (place.row < 0 || place.col < 0) return false;
  if (place.horizontal ? place.col + length > size : place.row + length > size) return false;
  for (let i = 0; i < length; i += 1) {
    const row = place.row + (place.horizontal ? 0 : i);
    const col = place.col + (place.horizontal ? i : 0);
    if (letters[row]?.[col] !== place.word.charAt(i)) return false;
  }
  return true;
}

/**
 * Читается ли через эту клетку слово не там, где его положили.
 * Смотрит только места, где клетка входит в слово, — не всё поле.
 */
function strayThrough(
  letters: readonly string[][],
  words: readonly string[],
  known: ReadonlySet<string>,
  row: number,
  col: number,
): boolean {
  for (const word of words) {
    for (const horizontal of [true, false]) {
      for (let i = 0; i < word.length; i += 1) {
        const place: Placement = {
          word,
          row: row - (horizontal ? 0 : i),
          col: col - (horizontal ? i : 0),
          horizontal,
        };
        if (reads(letters, place) && !known.has(keyOf(place))) return true;
      }
    }
  }
  return false;
}

/** Клетки слов: по ним понятно, что в паре «своё», а что чужое. */
function ownerCells(placements: readonly Placement[]): Set<string>[] {
  return placements.map((place) => {
    const cells = new Set<string>();
    for (let i = 0; i < place.word.length; i += 1) {
      cells.add(`${place.row + (place.horizontal ? 0 : i)}:${place.col + (place.horizontal ? i : 0)}`);
    }
    return cells;
  });
}

/**
 * Пара соседних клеток читается как две первые буквы слова, но не там, где оно
 * лежит. Две соседние буквы одного и того же слова не считаются: `lo` внутри
 * `look` — это начало `love`, и никакой досыпкой это не лечится.
 */
function falsePair(
  letters: readonly string[][],
  placements: readonly Placement[],
  owners: readonly Set<string>[],
  row: number,
  col: number,
  horizontal: boolean,
): boolean {
  const nextRow = row + (horizontal ? 0 : 1);
  const nextCol = col + (horizontal ? 1 : 0);
  const first = letters[row]?.[col];
  const second = letters[nextRow]?.[nextCol];
  if (first === undefined || second === undefined || first === '' || second === '') return false;
  const pair = first + second;
  const a = `${row}:${col}`;
  const b = `${nextRow}:${nextCol}`;
  const inOneWord = owners.some((cells) => cells.has(a) && cells.has(b));
  if (inOneWord) return false;
  return placements.some((place) => {
    if (place.word.slice(0, 2) !== pair) return false;
    const own = place.row === row && place.col === col && place.horizontal === horizontal;
    return !own;
  });
}

/** Есть ли в раскладке слов (без досыпки) ложное начало из букв двух разных слов. */
export function layoutFalseStart(
  letters: readonly string[][],
  placements: readonly Placement[],
): boolean {
  const owners = ownerCells(placements);
  for (let row = 0; row < letters.length; row += 1) {
    for (let col = 0; col < letters.length; col += 1) {
      for (const horizontal of [true, false]) {
        if (falsePair(letters, placements, owners, row, col, horizontal)) return true;
      }
    }
  }
  return false;
}

/** Ложное начало через эту клетку: четыре пары, в которые она входит. */
function startsFalsely(
  letters: readonly string[][],
  placements: readonly Placement[],
  owners: readonly Set<string>[],
  row: number,
  col: number,
): boolean {
  return (
    falsePair(letters, placements, owners, row, col - 1, true) ||
    falsePair(letters, placements, owners, row, col, true) ||
    falsePair(letters, placements, owners, row - 1, col, false) ||
    falsePair(letters, placements, owners, row, col, false)
  );
}

/** Досыпать случайные буквы в пустые клетки по правилам выше. */
export function fillRest(
  letters: string[][],
  words: readonly string[],
  placements: readonly Placement[],
  rng: Rng,
): void {
  const size = letters.length;
  const known = new Set(placements.map(keyOf));
  const owners = ownerCells(placements);
  const firsts = new Set(words.map((word) => word.charAt(0)));
  const counts = new Map<string, number>();
  for (const line of letters) {
    for (const letter of line) {
      if (letter !== '') counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
  }

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const line = letters[row];
      if (line === undefined || line[col] !== '') continue;
      const order = rng.shuffle(ALPHABET.split(''));
      let chosen: string | undefined;
      for (const rules of ROUNDS) {
        chosen = order.find((letter) => {
          if (rules.limitRepeats && (counts.get(letter) ?? 0) >= MAX_SAME_LETTER) return false;
          if (rules.banFirstLetters && firsts.has(letter)) return false;
          line[col] = letter;
          const bad =
            strayThrough(letters, words, known, row, col) ||
            (rules.banFalseStarts && startsFalsely(letters, placements, owners, row, col));
          line[col] = '';
          return !bad;
        });
        if (chosen !== undefined) break;
      }
      // Ни один круг не сошёлся (при 26 буквах так не бывает) — любая буква.
      const letter = chosen ?? rng.pick(ALPHABET.split(''));
      line[col] = letter;
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
  }
}
