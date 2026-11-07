/**
 * Раздача «колодой»: строка таблицы перемешивается один раз, а узел берёт из
 * неё срез по своему варианту.
 *
 * Раньше каждый узел перемешивал строку сам, своим seed'ом, и два соседних
 * узла вытаскивали из неё одни и те же слова: на трёх словах из восьми это не
 * редкость, а правило. Колода одна на строку, срезы идут друг за другом без
 * наложения, поэтому узлы, чьи варианты стоят рядом, не делят ничего — пока
 * в строке хватает на все срезы разом. Окно по таблице не возвращается:
 * вариант двигает только начало среза, а не выбор строки.
 *
 * Без Phaser: раздачу проверяет тест `tests/repeats.test.ts`.
 */
import { makeRng } from '../systems/rng';

export interface DeckOptions<T> {
  /** Сколько элементов в срезе. */
  count: number;
  /** Шаг между началами срезов соседних вариантов; не меньше `count`. */
  stride: number;
  /**
   * Чем элементы считаются «одним и тем же» внутри среза (ответ вопроса):
   * второй такой пропускается. В таблицах сейчас ответы в строке не
   * повторяются, это запас на будущие вопросы.
   */
  key?: (item: T) => string;
}

/**
 * Срез колоды для варианта.
 *
 * Колода — строка, перемешанная своим seed'ом: при каждом вызове одинаково.
 * Начало среза — `variant * stride` по кругу; когда варианты обошли колоду, срез
 * ложится на уже выданные карты. Порядок внутри него сдвигается на номер
 * круга, чтобы узлы, далёкие друг от друга и берущие ту же тройку, хотя бы
 * выглядели по-разному: набор тот же, расклад другой. Сдвиг именно на круг, а
 * не на `variant + круг`: в колоде из шести карт по три вариант и круг растут
 * вместе, сумма по модулю трёх ходит по кругу 0,1,0,1 — и семь узлов делили
 * два расклада.
 */
export function dealFromDeck<T>(
  row: readonly T[],
  seed: number,
  variant: number,
  options: DeckOptions<T>,
): T[] {
  const { count, stride, key } = options;
  const deck = makeRng(seed).shuffle(row);
  const at = Math.max(0, Math.round(variant));
  const start = (at * stride) % deck.length;
  const picked: T[] = [];
  const used = new Set<string>();
  for (let step = 0; step < deck.length && picked.length < count; step += 1) {
    const item = deck[(start + step) % deck.length];
    if (item === undefined) continue;
    if (key !== undefined) {
      if (used.has(key(item))) continue;
      used.add(key(item));
    }
    picked.push(item);
  }
  const lap = Math.floor((at * stride) / deck.length);
  const turn = lap % Math.max(1, picked.length);
  return [...picked.slice(turn), ...picked.slice(0, turn)];
}
