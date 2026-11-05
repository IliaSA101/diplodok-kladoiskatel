/**
 * «Что дальше в ряду»: узор из картинок, последняя клетка закрыта вопросом.
 *
 * Задачка про правило, а не про память и не про счёт: ряд повторяет короткий
 * мотив, и ребёнку надо увидеть, что мяч-бутса-мяч-бутса продолжается мячом.
 * Читать тут нечего, считать тоже — только смотреть.
 *
 * Мотив задаётся номерами ролей (0, 1, 2…), а картинки на роли раздаёт
 * вариант. Поэтому на одной ступени узор один и тот же, а выглядит каждый
 * раз по-новому — и ребёнок разбирает правило, а не запоминает картинку.
 *
 * Внутри узла мотивы идут по возрастанию: первый ряд проще последнего.
 *
 * Модуль без Phaser: правило проверяет тест.
 */
import { makeRng } from './rng';

/** Сколько клеток в ряду, считая закрытую вопросом. */
export const PATTERN_CELLS = 8;

/** Сколько рядов в одной задачке: столько же точек в ряду прогресса. */
export const PATTERN_TASKS = 4;

/** Из скольких картинок раздаются роли: хватает и на узор, и на лишний вариант. */
export const PATTERN_POOL = 8;

/**
 * Мотивы по возрастанию сложности: период длиннее, ролей больше.
 *
 * Роль — это номер, а не картинка. `[0, 0, 1]` читается как «две одинаковые,
 * потом другая»: какие именно — решает вариант.
 */
export const PATTERN_MOTIFS: readonly (readonly number[])[] = [
  [0, 1],
  [0, 0, 1],
  [0, 1, 2],
  [0, 1, 1, 2],
  [0, 1, 2, 1],
  [0, 1, 2, 3],
];

/** Выше этой ступени узоры не усложняются — дальше таблица кончается. */
export const PATTERN_MAX_LEVEL = PATTERN_MOTIFS.length - 1;

export interface PatternRow {
  /** Весь ряд слева направо; последняя клетка закрыта вопросом. */
  row: number[];
  /** Правильная картинка: она же последняя в ряду. */
  answer: number;
  /** Что предложено на выбор, среди них ответ; порядок перемешан. */
  options: number[];
}

/** Номера 0…n-1 по порядку. */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Четыре ряда для узла: от ступени — с какого мотива начинаем, от варианта —
 * какие картинки играют роли.
 *
 * Один и тот же узел всегда даёт одно и то же: ребёнок возвращается на круг
 * и видит знакомую задачку, а не новую в каждый заход.
 */
export function patternTasks(step: number, variant: number): PatternRow[] {
  const level = Math.min(PATTERN_MAX_LEVEL, Math.max(0, Math.round(step)));
  const seed = Math.max(0, Math.round(variant));
  const out: PatternRow[] = [];

  for (let k = 0; k < PATTERN_TASKS; k += 1) {
    // Внутри узла мотив растёт, но ниже ступени не опускается.
    const motif = PATTERN_MOTIFS[Math.min(PATTERN_MAX_LEVEL, level + k)] ?? PATTERN_MOTIFS[0] ?? [0, 1];
    const rng = makeRng(7000 + level * 211 + seed * 29 + k * 7);
    const faces = rng.shuffle(range(PATTERN_POOL));

    const row = Array.from({ length: PATTERN_CELLS }, (_, i) => {
      const role = motif[i % motif.length] ?? 0;
      return faces[role] ?? role;
    });
    const answer = row[PATTERN_CELLS - 1] ?? 0;

    // Варианты — это картинки самого ряда: лишние со стороны только путают.
    // Если в узоре их всего две, добавляем третью, чтобы выбор не был «из двух».
    const options = [...new Set(row)];
    for (const face of faces) {
      if (options.length >= 3) break;
      if (!options.includes(face)) options.push(face);
    }

    out.push({ row, answer, options: rng.shuffle(options) });
  }

  return out;
}
