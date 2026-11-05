/**
 * «Счёт на табло»: примеры для задачки на арифметику.
 *
 * Это первая задачка, где ребёнок не ищет и не запоминает, а считает, и
 * первая, где он набирает ответ — на табло, цифрами. Её завели потому, что
 * остальные пять видов уперлись в потолок: стол маджонга больше экрана не
 * станет, слов в наборе не прибавится, а семилетний прошёл всё за полчаса.
 * Счёт растёт без предела — сначала в пределах пяти, потом через десяток.
 *
 * Примеры **перечисляются целиком**, а не бросаются костями: так видно, что
 * в наборе нет повторов, что вычитание никогда не уходит в минус и что на
 * каждой ступени примеров хватает на всю задачку. Внутри задачки они идут
 * по возрастанию ответа — ребёнок въезжает на лёгких и доходит до трудных.
 *
 * Модуль без Phaser: правила проверяет тест, а не ребёнок.
 */
import { makeRng } from './rng';

/** Сколько примеров в одной задачке: столько же точек в ряду прогресса. */
export const COUNT_TASKS = 5;

/** Больше этого ответ не бывает: на табло две цифры и не больше. */
export const COUNT_MAX_ANSWER = 20;

/** Выше этой ступени счёт не растёт — дальше таблица кончается. */
export const COUNT_MAX_LEVEL = 4;

export interface CountTask {
  left: number;
  /** Плюс или минус: вычитание появляется со второй ступени. */
  op: '+' | '-';
  right: number;
  /** Ответ: 0…COUNT_MAX_ANSWER, в минус не уходит никогда. */
  answer: number;
  /**
   * Рисовать ли мячи под числами.
   *
   * Только у сложения и только на двух первых ступенях: «столько и столько»
   * ребёнок видит сразу. У вычитания честной картинки из тех же мячей не
   * выходит — два ряда по бокам от минуса читаются как сложение, а зачёркнутые
   * мячи на тёмном табло сливаются в пятно (это мы уже попробовали и
   * посмотрели). Лучше без картинки, чем с врущей.
   */
  pictures: boolean;
}

function task(left: number, op: '+' | '-', right: number, pictures: boolean): CountTask {
  return { left, op, right, answer: op === '+' ? left + right : left - right, pictures };
}

/**
 * Все примеры ступени.
 *
 * Ступени 0–1 — сложение в пределах пяти и десяти, с мячами под числами;
 * 2 — вычитание в пределах десяти; 3 — сложение через десяток; 4 — и сложение,
 * и вычитание за десятком. Ступень выше четвёртой упирается в четвёртую:
 * трёхзначный ответ на табло не влезает.
 */
function pool(level: number): CountTask[] {
  const out: CountTask[] = [];
  const pictures = level <= 1;

  if (level <= 1) {
    const limit = level === 0 ? 5 : 10;
    for (let left = 1; left < limit; left += 1) {
      for (let right = 1; left + right <= limit; right += 1) {
        out.push(task(left, '+', right, pictures));
      }
    }
    return out;
  }

  if (level === 2) {
    for (let left = 3; left <= 10; left += 1) {
      for (let right = 1; right < left; right += 1) {
        out.push(task(left, '-', right, false));
      }
    }
    return out;
  }

  // Через десяток: ответ строго больше десяти, иначе это та же вторая ступень.
  for (let left = 2; left <= 9; left += 1) {
    for (let right = 2; right <= 9; right += 1) {
      if (left + right > 10 && left + right <= COUNT_MAX_ANSWER) {
        out.push(task(left, '+', right, false));
      }
    }
  }
  if (level >= 4) {
    for (let left = 11; left <= COUNT_MAX_ANSWER; left += 1) {
      for (let right = 2; right <= 9; right += 1) {
        if (left - right > 0) out.push(task(left, '-', right, false));
      }
    }
  }
  return out;
}

/**
 * Пять примеров для узла: от ступени — трудность, от варианта — какие именно.
 *
 * Один и тот же узел всегда даёт одно и то же: ребёнок возвращается на круг
 * и видит знакомую задачку, а не новую в каждый заход.
 */
export function countTasks(step: number, variant: number): CountTask[] {
  const level = Math.min(COUNT_MAX_LEVEL, Math.max(0, Math.round(step)));
  const all = pool(level);
  const rng = makeRng(9000 + level * 131 + Math.max(0, Math.round(variant)) * 17);
  const picked = rng.shuffle(all).slice(0, COUNT_TASKS);
  return picked.sort((a, b) => a.answer - b.answer);
}
