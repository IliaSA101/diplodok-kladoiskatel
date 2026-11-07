/**
 * Столы задачек без слов: маджонг, «Запомни пары», судоку — ступени и расклады.
 * Без Phaser; вынесено из `quest.ts` по обязанностям.
 */
import { CARD_ICONS } from '../art/keys';
import { buildMahjongBoard, type MahjongBoard } from '../systems/mahjongBoard';
import { makeRng } from '../systems/rng';
import { tier } from './quest';

/**
 * Сколько пар в маджонге на ступени: чем выше, тем больше стол.
 *
 * Нулевая ступень плоская, там шесть и восемь пар — то есть 4×3 и 4×4. Числа
 * тут не любые: плоский стол кладётся в четыре колонки, и семь пар давали три
 * полных ряда и огрызок из двух карточек. Со второй ступени это горка, и она
 * сразу вдвое больше: двадцать четыре карточки на двенадцать пар. Двадцать
 * карточек, что были тут раньше, семилетний разбирал не думая — стол выходил
 * на четыре года. Двадцать пар — полный стол, больше на экран не влезает,
 * поэтому расти маджонгу дальше некуда и ступень тут упирается в потолок.
 */
export const MAHJONG_PAIRS: readonly number[] = [6, 8, 12, 16, 20];

/**
 * С какой ступени «Найди пару» становится настоящим маджонгом.
 *
 * На первых ступенях все карточки лежат в один слой: ребёнок просто ищет пары.
 * Дальше часть карточек ложится сверху, и начинает работать правило маджонга —
 * взять можно только ту, что ничем не накрыта.
 */
export const MAHJONG_STACKED_FROM = 2;

/**
 * Ступени «Запомни пары»: сколько групп, по скольку карточек и в сколько колонок.
 *
 * Таблица росла по одной карточке и дважды топталась на месте (6, 6, 8, 8):
 * два круга подряд выглядели одинаково, и ребёнок справедливо не видел, что
 * стало труднее. Теперь каждая строка больше предыдущей.
 *
 * `columns` тут же, а не считается из числа карточек: четыре колонки на
 * двадцать четыре карточки дают шесть рядов, они не влезают в панель по
 * высоте, и карточка усыхает. Ширины же вокруг было пусто — вот её и берём.
 *
 * `group` — по скольку карточек собирают вместе. Тройки стоят последними
 * нарочно: встретить знакомый значок в тройке легче (их три, а не два), но
 * держать в голове надо не «где лежит вторая», а «где лежат две» — и на
 * ребёнке это читается как самое трудное, что тут есть.
 */
export interface MemoryLevel {
  /** Сколько одинаковых наборов на столе. */
  groups: number;
  /** По скольку карточек в наборе: двойки, а наверху тройки. */
  group: number;
  columns: number;
}

export const MEMORY_LEVELS: readonly MemoryLevel[] = [
  { groups: 6, group: 2, columns: 4 },
  { groups: 8, group: 2, columns: 4 },
  { groups: 10, group: 2, columns: 5 },
  { groups: 12, group: 2, columns: 6 },
  { groups: 9, group: 3, columns: 6 },
  { groups: 10, group: 3, columns: 6 },
];

/** Seed судоку для варианта: какое именно поле — от варианта, а не от ступени. */
export const SUDOKU_SEEDS: readonly number[] = [
  4201, 9317, 5508, 7724, 3366, 6143, 2879, 8052, 1764, 9630, 4488, 7215,
];

/**
 * Судоку по ступени: сторона поля и сколько клеток открыто.
 *
 * 4×4 из четырёх значков семилетний разбирает не думая, и убавлять подсказки
 * там можно недолго — поле маленькое. Настоящий запас даёт 6×6: шесть значков,
 * квадраты 3×2, и в ряду их уже не перебрать взглядом. Клетка там мельче
 * (80 px против 118), поэтому 6×6 — про мышь на ноутбуке; габариты держит
 * `art/layout.ts` и тест на нижний порог.
 *
 * `clues` — нижняя граница: если дальше закрывать клетки нельзя без потери
 * единственного решения, открытых останется больше.
 */
export const SUDOKU_LEVELS: readonly { size: number; clues: number }[] = [
  { size: 4, clues: 8 },
  { size: 4, clues: 7 },
  { size: 4, clues: 6 },
  { size: 6, clues: 20 },
  { size: 6, clues: 16 },
];

/** Какое судоку на этой ступени. */
export function sudokuLevel(step: number): { size: number; clues: number } {
  return tier(SUDOKU_LEVELS, step, 0);
}

/** Сколько пар на столе маджонга на этой ступени. */
export function mahjongPairs(step: number): number {
  return tier(MAHJONG_PAIRS, step, 0);
}

/** Горка или плоский стол на этой ступени. */
export function mahjongStacked(step: number): boolean {
  return Math.round(step) >= MAHJONG_STACKED_FROM;
}

/** Какой стол «Запомни пары» на этой ступени. */
export function memoryLevel(step: number): MemoryLevel {
  return tier(MEMORY_LEVELS, step, 0);
}

/** Что лежит на столе «Запомни пары»: какие значки и в каком порядке. */
export interface MemoryDeal {
  /** Индексы в `CARD_ICONS` — по одному на набор. */
  icons: readonly number[];
  /** Номер набора в каждой клетке стола, по порядку. */
  layout: readonly number[];
}

/**
 * Все значки по кругу, перемешанные один раз: в одно окно попадают и мячи,
 * и форма, а не первые двенадцать листа подряд.
 */
const MEMORY_RING: readonly number[] = makeRng(2999).shuffle(CARD_ICONS.map((_, index) => index));

/**
 * Где на кольце центр окна узла.
 *
 * Шаг — четверть кольца (6 из 25): соседние варианты стоят в соседних кругах,
 * и им шага хватает. Два узла одного круга (варианты 0-1 и 2-3) должны
 * отстоять на два шага, иначе их окна по 12 значков пересекутся, поэтому
 * первые слоты меняются местами: 0, 2, 1, 3, 4, 5…
 */
export function memoryCentre(variant: number, ring = MEMORY_RING.length): number {
  const v = Math.max(0, Math.round(variant));
  const slot = v === 1 ? 2 : v === 2 ? 1 : v;
  return (slot * Math.floor(ring / 4)) % ring;
}

/**
 * Значки узла: окно в `groups` значков вокруг центра, меньший стол лежит
 * внутри большего. Так в одном круге общих значков нет, а в соседних их не
 * больше половины меньшего стола (у нечётного — вверх, 004-7).
 */
export function memoryIcons(
  groups: number,
  variant: number,
  ring: readonly number[] = MEMORY_RING,
): number[] {
  const n = ring.length;
  const from = memoryCentre(variant, n) - Math.floor(groups / 2);
  return Array.from({ length: Math.min(groups, n) }, (_, k) => ring[(((from + k) % n) + n) % n] ?? 0);
}

/**
 * Расклад «Запомни пары» для узла.
 *
 * Лежит тут, а не в сцене, по той же причине, по которой тут лежит поле
 * судоку: иначе «у двух узлов один и тот же стол» нельзя проверить тестом.
 * Один `rng` на выбор значков и на порядок — порознь их брать нельзя, поток
 * один, и разделение сменило бы все расклады сразу.
 *
 * Значки берутся из общего запаса окном на кольце (`memoryIcons`), а не
 * всегда с начала списка: расклад у каждого узла и раньше был свой, а набор
 * картинок — один и тот же, и со стороны это читалось как «то же самое».
 */
export function memoryDeal(step: number, variant: number): MemoryDeal {
  const level = memoryLevel(step);
  const rng = makeRng(2000 + Math.max(0, Math.round(variant)) * 41);
  const icons = memoryIcons(level.groups, variant);
  const symbols: number[] = [];
  for (let group = 0; group < level.groups; group += 1) {
    for (let copy = 0; copy < level.group; copy += 1) symbols.push(group);
  }
  return { icons, layout: rng.shuffle(symbols) };
}

/** Стол маджонга для узла: ступень даёт число пар и горку, вариант — расклад. */
export function mahjongDeal(step: number, variant: number): MahjongBoard {
  return buildMahjongBoard(
    mahjongPairs(step),
    1000 + Math.max(0, Math.round(variant)) * 37,
    mahjongStacked(step),
    CARD_ICONS.length,
  );
}

/**
 * Поле судоку для этого узла.
 *
 * Seed'ов тут должно быть не меньше, чем узлов судоку в квесте: пока их было
 * пять на восемь узлов, варианты 0 и 5 получали ровно одно и то же поле.
 * Что все двенадцать дают разные поля на каждой ступени — проверяет тест,
 * потому что разные seed'ы сами по себе этого не обещают.
 */
export function sudokuSeed(variant: number): number {
  return SUDOKU_SEEDS[Math.max(0, Math.round(variant)) % SUDOKU_SEEDS.length] ?? 4201;
}
