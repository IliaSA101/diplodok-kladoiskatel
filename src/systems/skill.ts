/**
 * Ступень сложности по видам задачек: игра подстраивается под ребёнка сама.
 *
 * Семилетний прошёл все двадцать четыре задачки за полчаса. Беда не в том,
 * что их мало, а в том, что круг растил *размер* задачки, а не требование
 * к голове, и никакой обратной связи не было: решил мгновенно — получи то же
 * самое. Теперь после каждой задачки игра смотрит, сколько ушло времени и
 * сколько было ошибок, и двигает ступень этого вида.
 *
 * Правила, без которых это превратилось бы в наказание:
 * - ступень меняется **не больше чем на одну** за задачку. Иначе один везучий
 *   прогон уносит ребёнка на два уровня вверх, и дальше он только буксует;
 * - ступень **падает** так же легко, как растёт: долго возился или наошибался
 *   — вернулись назад. Застрять наверху нельзя;
 * - ступень не влияет на то, **можно ли** решить задачку. Проиграть по-прежнему
 *   нельзя: ступень меняет размер стола и длину примера, а не правила.
 *
 * Модуль без Phaser — правило роста проверяется тестом, а не на ребёнке.
 */
import type { PuzzleKind } from '../data/quest';
import { SKILL_STEP_MAX, SPECS } from './saveKeys';
import { readKey, writeKey } from './saveStore';

/** Выше этого ступень не поднимается: дальше у задачек кончается запас. */
export const MAX_SKILL = SKILL_STEP_MAX;

/**
 * За сколько уверенный семилетка решает задачку этого вида, мс.
 *
 * Это не норматив, а точка отсчёта: быстрее — значит вид освоен, вдвое с
 * лишним дольше — значит рано. Числа сняты с того, как ребёнок прошёл квест:
 * двадцать четыре задачки за тридцать минут, то есть в среднем по 75 секунд
 * вместе с переходами по карте.
 */
export const PACE_MS: Record<PuzzleKind, number> = {
  sudoku: 60_000,
  mahjong: 75_000,
  word: 45_000,
  quiz: 30_000,
  memory: 60_000,
  count: 70_000,
  pattern: 40_000,
  // Показ цепочки идёт сам по себе: эти секунды ребёнок только смотрит.
  sequence: 60_000,
};

/** Во сколько раз дольше обычного — это «рано, вернёмся на ступень назад». */
const SLOW_FACTOR = 2.5;
/** Столько ошибок уже значит, что задачка не по зубам. */
const MISTAKES_BACK = 3;

/**
 * Куда двинуть ступень после решённой задачки.
 *
 * Решил быстро и без ошибок — вверх. Возился или ошибался — вниз.
 * Между этим — ступень стоит: большинство задачек ничего не меняют, и это
 * правильно, иначе сложность скачет от настроения.
 */
export function nextSkill(
  skill: number,
  kind: PuzzleKind,
  ms: number,
  mistakes: number,
): number {
  const pace = PACE_MS[kind];
  const here = clamp(skill);
  if (mistakes === 0 && ms <= pace) return clamp(here + 1);
  if (mistakes >= MISTAKES_BACK || ms >= pace * SLOW_FACTOR) return clamp(here - 1);
  return here;
}

function clamp(skill: number): number {
  if (!Number.isFinite(skill)) return 0;
  return Math.min(MAX_SKILL, Math.max(0, Math.round(skill)));
}

function read(): Record<string, number> {
  return readKey(SPECS.skill);
}

function write(all: Record<string, number>): void {
  writeKey(SPECS.skill, all);
}

export const skillSave = {
  /** Ступень этого вида задачек, 0…MAX_SKILL. */
  of(kind: PuzzleKind): number {
    return clamp(read()[kind] ?? 0);
  },

  /** Записать прогон и вернуть новую ступень. */
  note(kind: PuzzleKind, ms: number, mistakes: number): number {
    const all = read();
    const next = nextSkill(all[kind] ?? 0, kind, ms, mistakes);
    all[kind] = next;
    write(all);
    return next;
  },

  reset(): void {
    write({});
  },
};
