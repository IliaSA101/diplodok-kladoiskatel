/**
 * Футбольный квест: круги, узлы, слова, вопросы и дорожка карты.
 *
 * Эти проверки ловят то, что не видно ни типам, ни глазам: наклейку
 * с опечаткой в ключе, вопрос с ответом за границей списка, слово,
 * которое из выданных букв не собирается, круг, в котором одна и та же
 * задачка идёт дважды подряд, и дорожку, уехавшую за край экрана.
 */
import { describe, expect, it } from 'vitest';
import { TEX } from '../src/art/keys';
import {
  MAHJONG_PAIRS,
  MAHJONG_STACKED_FROM,
  MEMORY_LEVELS,
  NODES_PER_ROUND,
  PLAIN_ROUNDS,
  QUEST_NODES,
  ROUND_COUNT,
  SUDOKU_SEEDS,
  WORD_TIERS,
  WORDS_PER_PUZZLE,
  isGoldenRound,
  mahjongPairs,
  quizTask,
  memoryLevel,
  roundNodes,
  sudokuSeed,
  wordSet,
} from '../src/data/quest';
import type { PuzzleKind } from '../src/data/quest';
import { COUNT_TASKS, countTasks } from '../src/systems/countTask';
import { MAX_SKILL } from '../src/systems/skill';
import { pathBetween, pathLength, trackSegments } from '../src/systems/questTrack';
import {
  MAHJONG_MAX_PAIRS,
  buildMahjongBoard,
  freeCells,
  hasMove,
  isFree,
  neighbourClashes,
  reshuffle,
  type MahjongBoard,
  type MahjongCell,
} from '../src/systems/mahjongBoard';
import { makeRng } from '../src/systems/rng';

const STICKERS = new Set<string>(TEX.STICKER);
// Подсказка к слову и ответ викторины берутся из обоих листов готового арта.
const ICONS = new Set<string>([...TEX.FOOT, ...TEX.GEAR]);

describe('узлы квеста', () => {
  it('у каждого свой id', () => {
    expect(new Set(QUEST_NODES.map((node) => node.id)).size).toBe(QUEST_NODES.length);
  });

  it('каждая награда — настоящая наклейка из альбома', () => {
    for (const node of QUEST_NODES) {
      expect(STICKERS.has(node.sticker), `узел ${node.id}: ${node.sticker}`).toBe(true);
    }
  });

  it('наклейки заполняют альбом целиком: иначе альбом не собрать', () => {
    // Узлов сорок восемь, а мест в альбоме двадцать четыре, и каждое должно
    // достаться какому-то узлу. Что круги 4-6 повторяют наклейки кругов 1-3
    // и что внутри половины повторов нет — проверяет тест ниже.
    expect(new Set(QUEST_NODES.map((node) => node.sticker)).size).toBe(TEX.STICKER.length);
  });

  it('все узлы на экране 1280x720', () => {
    for (const node of QUEST_NODES) {
      expect(node.x, `узел ${node.id}`).toBeGreaterThan(60);
      expect(node.x, `узел ${node.id}`).toBeLessThan(1220);
      expect(node.y, `узел ${node.id}`).toBeGreaterThan(60);
      expect(node.y, `узел ${node.id}`).toBeLessThan(660);
    }
  });

  it('у каждого узла есть задание его типа на любой ступени', () => {
    // Вариантов и ступеней теперь больше, чем наборов в таблицах: сорок восемь
    // узлов против пяти наборов, и ступень доходит до девяти. Проверяем не
    // «вариант меньше длины таблицы», а то, ради чего это писалось: ни один
    // узел ни на одной ступени не остаётся без задания.
    for (const node of QUEST_NODES) {
      for (let skill = 0; skill <= MAX_SKILL; skill += 1) {
        const step = node.round - 1 + skill;
        const where = `${node.id} (${node.kind}), ступень ${step}`;
        if (node.kind === 'word') {
          expect(wordSet(step, node.variant).length, where).toBeGreaterThan(0);
        } else if (node.kind === 'quiz') {
          expect(quizTask(step, node.variant).questions.length, where).toBeGreaterThan(0);
        } else if (node.kind === 'sudoku') {
          expect(SUDOKU_SEEDS, where).toContain(sudokuSeed(node.variant));
        } else if (node.kind === 'mahjong') {
          expect(MAHJONG_PAIRS, where).toContain(mahjongPairs(step));
        } else if (node.kind === 'memory') {
          expect(MEMORY_LEVELS, where).toContain(memoryLevel(step));
        } else {
          expect(countTasks(step, node.variant), where).toHaveLength(COUNT_TASKS);
        }
      }
    }
  });

  it('наклейки кругов 4-6 — те же, что в кругах 1-3', () => {
    // Наклеек двадцать четыре, и рисовать ещё двадцать четыре ради шести
    // кругов мы не стали: альбом в три ряда по восемь виден целиком.
    const plain = QUEST_NODES.filter((node) => !isGoldenRound(node.round));
    const golden = QUEST_NODES.filter((node) => isGoldenRound(node.round));
    expect(plain.length).toBe(PLAIN_ROUNDS * NODES_PER_ROUND);
    expect(golden.map((node) => node.sticker)).toEqual(plain.map((node) => node.sticker));
    expect(new Set(plain.map((node) => node.sticker)).size).toBe(plain.length);
  });
});

describe('собери слово', () => {
  it('слова русскими заглавными и по силам первому классу', () => {
    for (const set of WORD_TIERS) {
      for (const puzzle of set) {
        expect(puzzle.word, puzzle.word).toMatch(/^[А-ЯЁ]+$/u);
        expect(puzzle.word.length, puzzle.word).toBeGreaterThanOrEqual(3);
        // Восемь букв плюс две лишние — это десять плиток, предел ряда.
        expect(puzzle.word.length, puzzle.word).toBeLessThanOrEqual(8);
      }
    }
  });

  it('строки идут от простого к сложному, а не как попало', () => {
    // Строка задаёт длину слов: третий круг не должен оказаться легче первого.
    let previous = 0;
    WORD_TIERS.forEach((row, index) => {
      const shortest = Math.min(...row.map((puzzle) => puzzle.word.length));
      expect(shortest, `строка ${index}`).toBeGreaterThan(previous);
      previous = shortest;
    });
  });

  it('в каждой строке хватает слов на задачку', () => {
    // Строка короче трёх слов означала бы задачку из двух — и молча.
    for (const row of WORD_TIERS) expect(row.length).toBeGreaterThanOrEqual(WORDS_PER_PUZZLE);
  });

  it('в наборе нет одного слова дважды', () => {
    for (const step of [0, 3, 6, 9]) {
      for (let variant = 0; variant < 8; variant += 1) {
        const words = wordSet(step, variant).map((puzzle) => puzzle.word);
        expect(words).toHaveLength(WORDS_PER_PUZZLE);
        expect(new Set(words).size, `ступень ${step}, вариант ${variant}`).toBe(WORDS_PER_PUZZLE);
      }
    }
  });

  it('у каждого слова есть картинка-подсказка из набора значков', () => {
    for (const set of WORD_TIERS) {
      for (const puzzle of set) {
        expect(ICONS.has(puzzle.icon), `${puzzle.word}: ${puzzle.icon}`).toBe(true);
      }
    }
  });
});

describe('найди пару', () => {
  it('каждая картинка лежит чётным числом карточек и есть в списке значков', () => {
    // Раньше тут стояло «карточек не больше, чем значков»: один значок — одна
    // пара. На большой горке пар больше, чем картинок, и картинка повторяется
    // четырьмя карточками, как в настоящем маджонге. Чётность важнее: нечётная
    // картинка — это карточка, которой не с чем встать в пару.
    MAHJONG_PAIRS.forEach((pairs, variant) => {
      expect(pairs).toBeGreaterThanOrEqual(3);
      const stacked = variant >= MAHJONG_STACKED_FROM;
      const board = buildMahjongBoard(pairs, 11, stacked, TEX.FOOT.length);
      const counts = new Map<number, number>();
      for (const cell of board.cells) {
        expect(cell.symbol, `пар ${pairs}`).toBeLessThan(TEX.FOOT.length);
        expect(cell.symbol).toBeGreaterThanOrEqual(0);
        counts.set(cell.symbol, (counts.get(cell.symbol) ?? 0) + 1);
      }
      for (const [symbol, count] of counts) {
        expect(count % 2, `значок ${symbol} при ${pairs} парах`).toBe(0);
      }
    });
  });
});

describe('круги квеста', () => {
  it('три круга по восемь узлов', () => {
    expect(QUEST_NODES.length).toBe(ROUND_COUNT * NODES_PER_ROUND);
    for (let round = 1; round <= ROUND_COUNT; round += 1) {
      expect(roundNodes(round).length, `круг ${round}`).toBe(NODES_PER_ROUND);
    }
  });

  it('круги идут по одной дорожке: места узлов совпадают', () => {
    // На этом держится «три круга по стадиону»: карта одна, новый фон не нужен.
    const first = roundNodes(1).map((node) => `${node.x},${node.y}`);
    for (let round = 2; round <= ROUND_COUNT; round += 1) {
      expect(roundNodes(round).map((node) => `${node.x},${node.y}`), `круг ${round}`).toEqual(first);
    }
  });

  it('новый вид задачки заводят только в ещё не пройденном круге', () => {
    // Круги, которые ребёнок уже прошёл, помечены решёнными: новый вид на
    // месте решённого узла ему бы просто не достался. Поэтому у каждого вида
    // есть круг, с которого он начинается, и раньше него его в игре нет.
    // «Счёт на табло» завели четвёртым кругом, «что дальше» и «повтори
    // порядок» — пятым; ниже этих чисел виды не опускаются.
    const FROM: Record<PuzzleKind, number> = {
      sudoku: 1,
      mahjong: 1,
      word: 1,
      quiz: 1,
      memory: 1,
      count: 4,
      pattern: 5,
      sequence: 5,
    };
    const kindList = Object.keys(FROM) as PuzzleKind[];
    for (let round = 1; round <= ROUND_COUNT; round += 1) {
      const kinds = [...new Set(roundNodes(round).map((node) => node.kind))].sort();
      const want = kindList.filter((kind) => FROM[kind] <= round).sort();
      expect(kinds, `круг ${round}`).toEqual(want);
    }
    // И первый золотой круг — всё ещё тот, с которого началось новое.
    expect(isGoldenRound(4)).toBe(true);
    expect(isGoldenRound(3)).toBe(false);
  });

  it('две одинаковые задачки подряд не идут', () => {
    for (let i = 1; i < QUEST_NODES.length; i += 1) {
      const previous = QUEST_NODES[i - 1];
      const node = QUEST_NODES[i];
      expect(node.kind, `${previous.id} и ${node.id}`).not.toBe(previous.kind);
    }
  });

  it('сложность не падает: вариант задачки своего вида только растёт', () => {
    const seen = new Map<string, number>();
    for (const node of QUEST_NODES) {
      const previous = seen.get(node.kind);
      if (previous !== undefined) {
        expect(node.variant, `${node.id} (${node.kind})`).toBeGreaterThan(previous);
      }
      seen.set(node.kind, node.variant);
    }
  });
});

describe('запомни пары', () => {
  it('наборов хватает значков', () => {
    for (const level of MEMORY_LEVELS) {
      expect(level.groups).toBeGreaterThanOrEqual(3);
      expect(level.groups).toBeLessThanOrEqual(TEX.FOOT.length);
      expect(level.group).toBeGreaterThanOrEqual(2);
    }
  });

  it('карточка остаётся под детский палец на самом большом поле', () => {
    // Числа сцены: колонки из ступени, панель 580 с отступом 18 и просветом 12.
    for (const level of MEMORY_LEVELS) {
      const cards = level.groups * level.group;
      const rows = Math.ceil(cards / level.columns);
      const free = 580 - 18 * 2 - (rows - 1) * 12;
      const size = Math.min(150, Math.floor(free / rows));
      expect(size, `${cards} карточек — ${rows} ряда`).toBeGreaterThanOrEqual(64);
      // И вширь стол должен влезать в панель 1120 с тем же отступом.
      expect((size + 12) * level.columns, `${cards} карточек вширь`).toBeLessThanOrEqual(1120 - 36);
    }
  });
});

describe('дорожка карты', () => {
  const nodes = roundNodes(1);
  // Шаг точек тот же, что в сцене.
  const segments = trackSegments(nodes, 38);

  it('по отрезку на каждую пару соседних узлов', () => {
    expect(segments.length).toBe(nodes.length - 1);
    for (const points of segments) expect(points.length).toBeGreaterThanOrEqual(4);
  });

  it('дорожка не уезжает за край экрана', () => {
    // Изгиб считается от длины отрезка: на длинном он легко вынесет точки за край.
    for (const points of segments) {
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1280);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(720);
      }
    }
  });

  it('путь начинается в одном узле и кончается в другом — в любую сторону', () => {
    for (const [from, to] of [[0, 3], [5, 1], [0, 7], [7, 0]] as const) {
      const path = pathBetween(segments, from, to);
      const first = path[0];
      const last = path[path.length - 1];
      const a = nodes[from];
      const b = nodes[to];
      expect(first?.x, `${from}→${to}`).toBeCloseTo(a?.x ?? -1, 6);
      expect(first?.y, `${from}→${to}`).toBeCloseTo(a?.y ?? -1, 6);
      expect(last?.x, `${from}→${to}`).toBeCloseTo(b?.x ?? -1, 6);
      expect(last?.y, `${from}→${to}`).toBeCloseTo(b?.y ?? -1, 6);
    }
  });

  it('от узла к себе пути нет: диплодок просто радуется на месте', () => {
    expect(pathBetween(segments, 2, 2)).toEqual([]);
  });

  it('туда и обратно — одна и та же длина', () => {
    expect(pathLength(pathBetween(segments, 1, 6))).toBeCloseTo(
      pathLength(pathBetween(segments, 6, 1)),
      6,
    );
  });
});

describe('расклад маджонга', () => {
  /** Стопка карточки: место на столе, в котором она лежит. */
  const stackOf = (cell: MahjongCell): string => `${cell.col}:${cell.row}`;

  /**
   * Разбирается ли стол до конца: перебор с памятью о тупиках.
   *
   * Жадного прохода мало — одинаковых значков на столе по два, и выбор
   * «какую пару снять первой» бывает важен. Карточек не больше двадцати,
   * поэтому полный перебор по множеству оставшихся дёшев.
   */
  function solvable(board: MahjongBoard): boolean {
    const seen = new Set<string>();
    const walk = (remaining: readonly MahjongCell[]): boolean => {
      if (remaining.length === 0) return true;
      const key = remaining
        .map((cell) => `${cell.layer}.${cell.row}.${cell.col}`)
        .sort()
        .join('|');
      if (seen.has(key)) return false;
      seen.add(key);

      const free = freeCells(remaining);
      for (let i = 0; i < free.length; i += 1) {
        for (let j = i + 1; j < free.length; j += 1) {
          const a = free[i];
          const b = free[j];
          if (a === undefined || b === undefined || a.symbol !== b.symbol) continue;
          const rest = remaining.filter((cell) => cell !== a && cell !== b);
          if (walk(rest)) return true;
        }
      }
      return false;
    };
    return walk(board.cells);
  }

  /**
   * Ребёнок играет как попало: снимает первую попавшуюся доступную пару.
   *
   * Это и есть главная проверка обещания «проиграть нельзя»: перебор выше
   * доказывает, что решение существует, а здесь стол разбирается без всякого
   * расчёта, случайным порядком ходов.
   */
  function playOut(board: MahjongBoard, seed: number): { moves: number; shuffles: number } {
    const rng = makeRng(seed);
    let remaining: MahjongCell[] = board.cells.map((cell) => ({ ...cell }));
    let moves = 0;
    let shuffles = 0;

    while (remaining.length > 0) {
      if (!hasMove(remaining)) {
        shuffles += 1;
        if (shuffles > board.cells.length) throw new Error('перемешиваем без конца');
        reshuffle(remaining, 500 + shuffles);
        expect(hasMove(remaining), 'после перемешивания хода так и нет').toBe(true);
      }
      const free = rng.shuffle(freeCells(remaining));
      const first = free.find((cell) =>
        free.some((other) => other !== cell && other.symbol === cell.symbol),
      );
      const second = free.find((cell) => cell !== first && cell.symbol === first?.symbol);
      if (first === undefined || second === undefined) throw new Error('ход есть, а пары нет');
      remaining = remaining.filter((cell) => cell !== first && cell !== second);
      moves += 1;
    }
    return { moves, shuffles };
  }

  it('каждый значок лежит ровно дважды, места не повторяются', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const board = buildMahjongBoard(pairs, seed, true);
        expect(board.cells).toHaveLength(pairs * 2);
        const counts = new Map<number, number>();
        for (const cell of board.cells) {
          counts.set(cell.symbol, (counts.get(cell.symbol) ?? 0) + 1);
        }
        expect([...counts.values()].every((n) => n === 2)).toBe(true);
        const places = board.cells.map((c) => `${c.layer}.${c.row}.${c.col}`);
        expect(new Set(places).size).toBe(places.length);
      }
    }
  });

  it('пара никогда не лежит в одной стопке: из этого и следует, что тупика нет', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const board = buildMahjongBoard(pairs, seed, true);
        const bySymbol = new Map<number, MahjongCell[]>();
        for (const cell of board.cells) {
          bySymbol.set(cell.symbol, [...(bySymbol.get(cell.symbol) ?? []), cell]);
        }
        for (const [symbol, cells] of bySymbol) {
          const [a, b] = cells;
          expect(a && b, `значок ${symbol}`).toBeTruthy();
          if (a === undefined || b === undefined) continue;
          expect(stackOf(a), `значок ${symbol}, пар ${pairs}, seed ${seed}`).not.toBe(stackOf(b));
        }
      }
    }
  });

  it('одинаковые значки нигде не лежат вплотную', () => {
    // На экране второго круга пять пар из восьми стояли бок о бок, и ребёнок
    // не искал, а просто видел.
    //
    // Значков берём столько же, сколько у игры: это и есть вся соль. Пока
    // тест брал значок на пару, он проверял несуществующий стол — настоящий
    // кладёт дюжину картинок на двадцать пар, одна и та же лежит тремя-
    // четырьмя карточками, и соседями оказывались карточки из разных пар.
    // На двадцати парах их набиралось до одиннадцати за стол.
    for (const [variant, pairs] of MAHJONG_PAIRS.entries()) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const board = buildMahjongBoard(pairs, seed, variant >= MAHJONG_STACKED_FROM, TEX.FOOT.length);
        expect(neighbourClashes(board.cells), `пар ${pairs}, seed ${seed}`).toBe(0);
      }
    }
  });

  it('плоский стол — полный прямоугольник, без огрызка в последнем ряду', () => {
    // Семь пар давали три ряда по четыре и две карточки сбоку: взрослому
    // всё равно, а ребёнок видит незаконченную картинку.
    for (const [variant, pairs] of MAHJONG_PAIRS.entries()) {
      if (variant >= MAHJONG_STACKED_FROM) continue;
      const board = buildMahjongBoard(pairs, 1, false, TEX.FOOT.length);
      const inRow = new Map<number, number>();
      for (const cell of board.cells) inRow.set(cell.row, (inRow.get(cell.row) ?? 0) + 1);
      expect([...new Set(inRow.values())], `пар ${pairs}`).toEqual([board.columns]);
    }
  });

  it('свободных карточек всегда хотя бы две, пока на столе есть пара', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const board = buildMahjongBoard(pairs, seed, true);
        expect(freeCells(board.cells).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('ход есть сразу: первая пара ложится на верхушки самых высоких стопок', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        expect(hasMove(buildMahjongBoard(pairs, seed, true).cells), `пар ${pairs}, seed ${seed}`)
          .toBe(true);
      }
    }
  });

  it('стол со стопками всегда разбирается до конца', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 12; seed += 1) {
        expect(solvable(buildMahjongBoard(pairs, seed, true)), `пар ${pairs}, seed ${seed}`).toBe(
          true,
        );
      }
    }
  });

  it('случайная игра без расчёта тоже доходит до конца', () => {
    for (const pairs of MAHJONG_PAIRS) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const board = buildMahjongBoard(pairs, seed, true);
        const played = playOut(board, seed * 31 + 7);
        expect(played.moves, `пар ${pairs}, seed ${seed}`).toBe(pairs);
      }
    }
  });

  it('в плоском раскладе берётся любая карточка', () => {
    const board = buildMahjongBoard(7, 3, false);
    expect(board.layers).toBe(1);
    expect(board.cells.every((cell) => isFree(board.cells, cell))).toBe(true);
  });

  it('закрывает карточку только та, что лежит прямо на ней', () => {
    const cells: MahjongCell[] = [
      { col: 0, row: 0, layer: 0, symbol: 0 },
      { col: 1, row: 0, layer: 0, symbol: 1 },
      { col: 2, row: 0, layer: 0, symbol: 2 },
      { col: 1, row: 0, layer: 1, symbol: 3 },
    ];
    const [left, middle, right, top] = cells;
    expect(isFree(cells, top)).toBe(true);
    expect(isFree(cells, middle)).toBe(false);
    expect(isFree(cells, left)).toBe(true);
    expect(isFree(cells, right)).toBe(true);
    // Сняли верхнюю — средняя свободна, хотя соседи с обеих сторон на месте.
    // Правило «зажата с боков» мы не вернём: на экране его не видно, и ребёнок
    // спрашивал, почему две одинаковые карточки рядом не берутся.
    const noTop = cells.filter((cell) => cell !== top);
    expect(isFree(noTop, middle)).toBe(true);
  });

  it('у каждой закрытой карточки есть та, что её накрыла', () => {
    for (const pairs of MAHJONG_PAIRS) {
      const board = buildMahjongBoard(pairs, 5, true);
      for (const cell of board.cells) {
        if (isFree(board.cells, cell)) continue;
        const cover = board.cells.some(
          (other) => other.col === cell.col && other.row === cell.row && other.layer > cell.layer,
        );
        expect(cover, `закрыта без причины: ${cell.col}.${cell.row}.${cell.layer}`).toBe(true);
      }
    }
  });

  it('перемешивание не меняет набор значков и возвращает ход', () => {
    const board = buildMahjongBoard(10, 4, true);
    const cells = board.cells.map((cell) => ({ ...cell }));
    const before = cells.map((cell) => cell.symbol).sort((a, b) => a - b);
    reshuffle(cells, 77);
    expect(cells.map((cell) => cell.symbol).sort((a, b) => a - b)).toEqual(before);
    expect(hasMove(cells)).toBe(true);
  });

  it('один и тот же seed даёт один и тот же стол', () => {
    expect(buildMahjongBoard(9, 42, true).cells).toEqual(buildMahjongBoard(9, 42, true).cells);
  });

  it('пар больше, чем мест на столе, — это ошибка, а не кривой расклад', () => {
    expect(() => buildMahjongBoard(MAHJONG_MAX_PAIRS + 1, 1, true)).toThrow();
    expect(() => buildMahjongBoard(0, 1, true)).toThrow();
  });

  it('стопки начинаются со второго круга: в первом варианты проще', () => {
    for (const node of QUEST_NODES.filter((item) => item.kind === 'mahjong')) {
      const stacked = node.variant >= MAHJONG_STACKED_FROM;
      expect(stacked, `узел ${node.id} круга ${node.round}`).toBe(node.round > 1);
    }
  });

  it('на любой вариант маджонга хватает мест на столе', () => {
    for (const pairs of MAHJONG_PAIRS) {
      expect(pairs).toBeLessThanOrEqual(MAHJONG_MAX_PAIRS);
    }
  });
});
