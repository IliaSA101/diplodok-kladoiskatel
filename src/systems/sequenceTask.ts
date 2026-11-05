/**
 * «Повтори порядок»: кнопки загораются по очереди, ребёнок повторяет.
 *
 * Единственная задачка, где память работает не на «где лежит», а на «в каком
 * порядке». Цепочка растёт внутри узла: сначала три огонька, потом четыре,
 * потом пять — и каждый раз это **та же** цепочка с новым хвостом, а не новая.
 * Так ребёнок достраивает запомненное, а не учит всё заново на каждом подходе.
 *
 * Два одинаковых огонька подряд запрещены: на экране это читается как один
 * долгий, и ребёнок честно повторяет не то.
 *
 * Модуль без Phaser: длины и соседство проверяет тест.
 */
import { makeRng } from './rng';

export interface SequenceLevel {
  /** Сколько кнопок на экране. */
  pads: number;
  /** Длина первого подхода. */
  from: number;
  /** Длина последнего подхода, она же длина всей цепочки. */
  to: number;
}

/** Ступени по возрастанию: кнопок больше, цепочка длиннее. */
export const SEQUENCE_LEVELS: readonly SequenceLevel[] = [
  { pads: 4, from: 2, to: 4 },
  { pads: 4, from: 3, to: 5 },
  { pads: 5, from: 3, to: 5 },
  { pads: 6, from: 3, to: 6 },
  { pads: 6, from: 4, to: 7 },
];

/** Выше этой ступени цепочка не растёт — дальше таблица кончается. */
export const SEQUENCE_MAX_LEVEL = SEQUENCE_LEVELS.length - 1;

export interface SequenceTask {
  pads: number;
  /** Длины подходов по возрастанию: столько же точек в ряду прогресса. */
  steps: number[];
  /** Вся цепочка; подход k — это order.slice(0, steps[k]). */
  order: number[];
}

/** Уровень по ступени: таблица кончается, дальше держим последнюю строку. */
export function sequenceLevel(step: number): SequenceLevel {
  const level = Math.min(SEQUENCE_MAX_LEVEL, Math.max(0, Math.round(step)));
  return SEQUENCE_LEVELS[level] ?? { pads: 4, from: 2, to: 4 };
}

/**
 * Цепочка для узла: от ступени — длина и число кнопок, от варианта — порядок.
 *
 * Один и тот же узел всегда даёт одну и ту же цепочку: ребёнок возвращается
 * на круг и доигрывает знакомое, а не начинает с нуля.
 */
export function sequenceTask(step: number, variant: number): SequenceTask {
  const level = sequenceLevel(step);
  const rng = makeRng(5000 + level.to * 307 + level.pads * 53 + Math.max(0, Math.round(variant)) * 11);

  const order: number[] = [];
  while (order.length < level.to) {
    const pad = rng.int(0, level.pads - 1);
    // Два одинаковых подряд на экране сливаются в один долгий огонёк.
    if (order[order.length - 1] === pad) continue;
    order.push(pad);
  }

  const steps: number[] = [];
  for (let n = level.from; n <= level.to; n += 1) steps.push(n);

  return { pads: level.pads, steps, order };
}
