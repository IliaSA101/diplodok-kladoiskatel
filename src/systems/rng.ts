/**
 * Детерминированный генератор случайных чисел (mulberry32).
 * Один и тот же seed — один и тот же лес.
 */
export interface Rng {
  /** Следующее число в [0, 1). */
  next(): number;
  /** Дробное число в [min, max). */
  range(min: number, max: number): number;
  /** Целое число в [min, max] включительно. */
  int(min: number, max: number): number;
  /** Случайный элемент массива. */
  pick<T>(items: readonly T[]): T;
  /** true с вероятностью p (0..1). */
  chance(p: number): boolean;
  /** Перемешанная копия массива. */
  shuffle<T>(items: readonly T[]): T[];
}

export function makeRng(seed: number): Rng {
  let state = (seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));

  return {
    next,
    range,
    int,
    pick<T>(items: readonly T[]): T {
      const item = items[int(0, items.length - 1)];
      if (item === undefined) throw new Error('pick из пустого массива');
      return item;
    },
    chance: (p: number): boolean => next() < p,
    shuffle<T>(items: readonly T[]): T[] {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        const a = copy[i] as T;
        const b = copy[j] as T;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    },
  };
}

/** Новый seed для кнопки «Ещё лес!». */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}
