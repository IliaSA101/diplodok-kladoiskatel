/**
 * Футбольный квест: диплодок бежит по стадиону круг за кругом и за каждую
 * задачку получает наклейку в альбом.
 *
 * Здесь узлы, круги и `tier`; начинка лежит рядом: слова — `questWords.ts`,
 * вопросы — `questQuiz.ts`, столы маджонга, памяти и судоку — `questDeals.ts`.
 * Добавить задачку = добавить узел сюда, сцены ничего не знают о составе.
 *
 * Кругов шесть, в каждом восемь узлов на одной и той же дорожке стадиона.
 * Круг задаёт **нижнюю** ступень сложности, а сверху прибавляется то, что
 * ребёнок набрал сам (`systems/skill.ts`): решает быстро и без ошибок —
 * задачки этого вида растут, возится — возвращаются назад.
 *
 * Наклеек по-прежнему двадцать четыре: круги с четвёртого выдают те же, но
 * «золотыми». Рисовать сорок восемь наклеек ради шести кругов не стоит, да и
 * альбом в три ряда по восемь — ровно та страница, которую видно целиком.
 */
import { TEX } from '../art/keys';

export type PuzzleKind =
  | 'sudoku'
  | 'mahjong'
  | 'word'
  | 'quiz'
  | 'memory'
  | 'count'
  | 'pattern'
  | 'sequence';

export interface QuestNode {
  id: string;
  kind: PuzzleKind;
  /** Позиция узла на карте в координатах экрана 1280x720. */
  x: number;
  y: number;
  /** Наклейка в награду — ключ текстуры из TEX.STICKER. */
  sticker: string;
  /** Какой набор заданий своего типа брать: нужен ради разнообразия. */
  variant: number;
  /** Круг, 1…ROUND_COUNT. Он задаёт нижнюю ступень сложности. */
  round: number;
}

export const ROUND_COUNT = 6;
export const NODES_PER_ROUND = 8;
/** Столько кругов дают свою наклейку; дальше те же, но золотые. */
export const PLAIN_ROUNDS = 3;

/** Круг, который выдаёт золотую наклейку вместо новой. */
export function isGoldenRound(round: number): boolean {
  return round > PLAIN_ROUNDS;
}

/** Восемь мест на дорожке стадиона: круги проходят по ним же. */
const TRACK: readonly { x: number; y: number }[] = [
  { x: 190, y: 530 },
  { x: 360, y: 400 },
  { x: 520, y: 540 },
  { x: 690, y: 390 },
  { x: 840, y: 530 },
  { x: 980, y: 380 },
  { x: 1110, y: 520 },
  { x: 1180, y: 330 },
];

/**
 * Что за задачка на каждом месте каждого круга.
 *
 * В круге есть все виды, а повторы расставлены так, чтобы два одинаковых
 * не шли подряд: ребёнку скучно решать то же самое дважды.
 *
 * Первые три круга оставлены ровно такими, какими их прошёл ребёнок: узлы
 * помечены решёнными по id, и если сменить вид у решённого узла, новая задачка
 * ему уже не достанется. Поэтому «Счёт на табло» живёт в кругах с четвёртого —
 * там, где ребёнок сейчас и находится, — и занимает там восемь узлов из
 * двадцати четырёх.
 */
const ROUND_KINDS: readonly (readonly PuzzleKind[])[] = [
  ['mahjong', 'memory', 'sudoku', 'quiz', 'mahjong', 'memory', 'sudoku', 'word'],
  ['memory', 'quiz', 'mahjong', 'sudoku', 'quiz', 'memory', 'sudoku', 'word'],
  ['quiz', 'mahjong', 'memory', 'word', 'sudoku', 'quiz', 'mahjong', 'word'],
  ['count', 'mahjong', 'word', 'memory', 'quiz', 'count', 'sudoku', 'mahjong'],
  ['memory', 'pattern', 'sudoku', 'word', 'sequence', 'mahjong', 'count', 'quiz'],
  ['pattern', 'quiz', 'mahjong', 'sequence', 'memory', 'sudoku', 'count', 'word'],
];

/** Узлы всех кругов подряд: q1…q48, наклейка по порядку из TEX.STICKER. */
function buildNodes(): QuestNode[] {
  const nodes: QuestNode[] = [];
  // Вариант считается отдельно по каждому виду: это номер набора заданий.
  const seen: Partial<Record<PuzzleKind, number>> = {};
  ROUND_KINDS.forEach((kinds, roundIndex) => {
    kinds.forEach((kind, place) => {
      const index = roundIndex * NODES_PER_ROUND + place;
      const spot = TRACK[place] ?? { x: 0, y: 0 };
      const variant = seen[kind] ?? 0;
      seen[kind] = variant + 1;
      nodes.push({
        id: `q${index + 1}`,
        kind,
        x: spot.x,
        y: spot.y,
        // Наклеек двадцать четыре, узлов сорок восемь: со второй половины
        // квеста те же наклейки идут по второму разу (круги 4-6 — золотые).
        sticker: TEX.STICKER[index % TEX.STICKER.length] ?? TEX.STICKER[0] ?? '',
        variant,
        round: roundIndex + 1,
      });
    });
  });
  return nodes;
}

export const QUEST_NODES: readonly QuestNode[] = buildNodes();

/** Узлы одного круга, 1…ROUND_COUNT. */
export function roundNodes(round: number): readonly QuestNode[] {
  return QUEST_NODES.filter((node) => node.round === round);
}

/**
 * Что взять из таблицы, упорядоченной от простого к сложному.
 *
 * Ступень задаёт **нижнюю** границу, вариант крутит всё, что выше неё. На
 * нулевой ступени ребёнок получает наборы по кругу с самого начала, на верхней
 * — только последний. Так одна таблица даёт и рост сложности, и разнообразие:
 * без второй половины ребёнок на третьем круге получал бы один и тот же
 * сложный набор три раза подряд.
 *
 * Ступень выше таблицы — не ошибка: ступень растёт от круга и от самого
 * ребёнка (`systems/skill.ts`) и доходит до девяти, а таблицы короче. Запас
 * просто кончается, и дальше идёт самое сложное, что есть.
 */
/** Какую строку таблицы берёт `tier`: номер нужен, когда таблиц несколько. */
export function tierIndex(length: number, step: number, variant: number): number {
  const last = length - 1;
  const from = Math.min(last, Math.max(0, Math.round(step)));
  const spread = length - from;
  return from + (Math.max(0, Math.round(variant)) % spread);
}

export function tier<T>(table: readonly T[], step: number, variant: number): T {
  const last = table.length - 1;
  const value = table[tierIndex(table.length, step, variant)] ?? table[last];
  // Пустая таблица — это опечатка в данных, а не случай игры: лучше упасть
  // на тесте, чем молча выдать ребёнку задачку без содержимого.
  if (value === undefined) throw new Error('tier из пустой таблицы');
  return value;
}
