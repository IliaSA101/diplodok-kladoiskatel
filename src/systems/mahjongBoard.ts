/**
 * Расклад маджонга: где лежит карточка, какую можно взять и есть ли ход.
 *
 * Модуль без Phaser — чистая арифметика, и только поэтому расклад проверяется
 * тестом. Сцена берёт отсюда клетки и правило «свободна ли», а рисование
 * и анимации остаются ей.
 *
 * Правило ровно одно: **карточку нельзя взять, если на ней что-то лежит**.
 * Классический маджонг запрещает ещё и зажатую с обоих боков карточку, но на
 * плоском экране этого не видно: ребёнок видит две одинаковые картинки рядом
 * и не понимает, почему они не берутся. Поэтому остался только запрет, у
 * которого есть картинка — накрывшая карточка.
 *
 * Сложность набирается не хитростью правила, а размером горки: к третьему
 * кругу это сорок карточек в три этажа, и половину стола сразу не видно.
 * Значков всего дюжина, поэтому на большой горке одна и та же картинка лежит
 * четырьмя карточками — как в настоящем маджонге, и подходит любая пара.
 *
 * Проиграть нельзя, и это держится конструкцией, а не удачей:
 * - раздача снимает карточки с двух самых высоких стопок, поэтому обе
 *   карточки пары лежат в разных стопках. Отсюда следует, что ни одна стопка
 *   не выше половины стола, а значит свободных карточек всегда хотя бы две;
 * - первая розданная пара ложится на верхушки стопок, то есть сразу после
 *   раздачи ход заведомо есть;
 * - если ход всё-таки кончился, `reshuffle` раскладывает значки заново тем же
 *   способом — и ход появляется снова.
 */
import { makeRng, type Rng } from './rng';

export interface MahjongCell {
  col: number;
  row: number;
  /** 0 — на столе, дальше вверх. */
  layer: number;
  /** Какой значок лежит: индекс в TEX.FOOT. */
  symbol: number;
}

export interface MahjongBoard {
  columns: number;
  rows: number;
  layers: number;
  /** Лежат ли карточки горкой: от этого зависят и правило, и вид. */
  stacked: boolean;
  cells: readonly MahjongCell[];
}

/** Плоский расклад: четыре колонки, как было с самого начала. */
const FLAT_COLUMNS = 4;
/** Шире стол не делаем: при девяти колонках карточка мельче 110 px. */
const MAX_COLUMNS = 8;
/** Узкое основание ставим в два ряда, широкое — в три. */
const NARROW_COLUMNS = 5;
/**
 * Сколько мен значков перебирает `polish`. Сорока карточкам хватает с запасом,
 * а стол строится один раз за задачку — считать тут нечего.
 */
const POLISH_ROUNDS = 1200;
/** Сколько раз раздаём заново, если расклад вышел с соседями. */
const LAYOUT_TRIES = 40;

/** Одна раздача: две карточки, которым достался общий значок. */
type Deal = [MahjongCell, MahjongCell];

interface Spot {
  col: number;
  row: number;
  layer: number;
}

/** Сколько рядов у основания шириной `columns`. */
function baseRows(columns: number): number {
  return columns <= NARROW_COLUMNS ? 2 : 3;
}

/**
 * Места этажа: второй уже основания на колонку с каждого бока, третий — ещё
 * на одну, и оба только в верхних рядах. Внутри этажа места идут от середины
 * к краям, поэтому недостроенный этаж всё равно выходит симметричной шапкой.
 */
function layerSpots(columns: number, layer: number): { col: number; row: number }[] {
  const width = columns - layer * 2;
  if (width < 1) return [];
  const rows = Math.min(baseRows(columns), layer === 1 ? 2 : 1);
  const middle = (columns - 1) / 2;
  const places: { col: number; row: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = layer; col < layer + width; col += 1) places.push({ col, row });
  }
  return places.sort(
    (a, b) => a.row - b.row || Math.abs(a.col - middle) - Math.abs(b.col - middle) || a.col - b.col,
  );
}

/** Сколько карточек поместится на горку шириной `columns`. */
function capacity(columns: number): number {
  return (
    columns * baseRows(columns) + layerSpots(columns, 1).length + layerSpots(columns, 2).length
  );
}

/** Самая узкая горка, на которую влезет `count` карточек. */
function fittingColumns(count: number): number {
  for (let columns = FLAT_COLUMNS; columns < MAX_COLUMNS; columns += 1) {
    if (capacity(columns) >= count && columns * baseRows(columns) <= count) return columns;
  }
  return MAX_COLUMNS;
}

/** Больше карточек положить некуда: самый широкий стол кончается. */
export const MAHJONG_MAX_PAIRS = capacity(MAX_COLUMNS) / 2;

/** Места под карточки: сначала основание рядами, потом этажи горки. */
function spots(count: number, stacked: boolean): Spot[] {
  if (!stacked) {
    return Array.from({ length: count }, (_, i) => ({
      col: i % FLAT_COLUMNS,
      row: Math.floor(i / FLAT_COLUMNS),
      layer: 0,
    }));
  }
  const columns = fittingColumns(count);
  const rows = baseRows(columns);
  const placed: Spot[] = [];
  for (let i = 0; i < Math.min(count, columns * rows); i += 1) {
    placed.push({ col: i % columns, row: Math.floor(i / columns), layer: 0 });
  }
  for (const layer of [1, 2]) {
    for (const spot of layerSpots(columns, layer)) {
      if (placed.length >= count) break;
      placed.push({ col: spot.col, row: spot.row, layer });
    }
  }
  return placed;
}

/** Можно ли взять карточку: на ней ничего не лежит. */
export function isFree(remaining: readonly MahjongCell[], cell: MahjongCell): boolean {
  return !remaining.some(
    (other) => other.layer > cell.layer && other.col === cell.col && other.row === cell.row,
  );
}

/** Карточки, которые можно взять прямо сейчас. */
export function freeCells(remaining: readonly MahjongCell[]): MahjongCell[] {
  return remaining.filter((cell) => isFree(remaining, cell));
}

/** Есть ли ход: среди свободных карточек найдутся две с одним значком. */
export function hasMove(remaining: readonly MahjongCell[]): boolean {
  const seen = new Set<number>();
  for (const cell of freeCells(remaining)) {
    if (seen.has(cell.symbol)) return true;
    seen.add(cell.symbol);
  }
  return false;
}

/** Стопки: карточки одного места, снизу вверх. */
function stacksOf(cells: readonly MahjongCell[]): MahjongCell[][] {
  const bySpot = new Map<string, MahjongCell[]>();
  for (const cell of cells) {
    const key = `${cell.col}:${cell.row}`;
    const stack = bySpot.get(key);
    if (stack === undefined) bySpot.set(key, [cell]);
    else stack.push(cell);
  }
  const stacks = [...bySpot.values()];
  for (const stack of stacks) stack.sort((a, b) => a.layer - b.layer);
  return stacks;
}

/** Стоят ли стопки вплотную — хоть боком, хоть углом. */
function adjacent(a: MahjongCell[], b: MahjongCell[]): boolean {
  const first = a[0];
  const second = b[0];
  if (first === undefined || second === undefined) return false;
  return Math.abs(first.col - second.col) <= 1 && Math.abs(first.row - second.row) <= 1;
}

/** Лежит ли уже карточка с этим значком вплотную к этому месту. */
function symbolNearby(
  placed: readonly MahjongCell[],
  symbol: number,
  spot: MahjongCell,
): boolean {
  return placed.some(
    (cell) =>
      cell.symbol === symbol &&
      Math.abs(cell.col - spot.col) <= 1 &&
      Math.abs(cell.row - spot.row) <= 1,
  );
}

/**
 * Разложить значки по карточкам.
 *
 * Места под пару выбираются ради того, чтобы стол разбирался: пара всегда
 * уходит на верхушки двух самых высоких стопок — отсюда обещание, что обе
 * карточки пары лежат в разных стопках. Вторая стопка вдобавок берётся
 * подальше от первой; если все подходящие оказались соседними, берём соседнюю
 * — обещание про разные стопки важнее.
 *
 * А вот *какой* значок лечь на выбранные места — это свобода, и она уходит на
 * то, чтобы одинаковые картинки не оказались рядом. Выбирать подальше только
 * напарника мало: значков дюжина, а пар на большом столе двадцать, поэтому
 * одна и та же картинка лежит тремя-четырьмя карточками. Соседями оказывались
 * карточки из *разных* пар — на экране это десяток очевидных пар бок о бок,
 * и стол снова решался взглядом. Поэтому значок выбирается из тех, которых
 * ещё нет вплотную ни к одному из двух мест.
 */
function assign(cells: readonly MahjongCell[], symbols: readonly number[], rng: Rng): Deal[] {
  const stacks = stacksOf(cells);
  const pool = [...symbols];
  const placed: MahjongCell[] = [];
  const deal: Deal[] = [];
  for (;;) {
    const live = stacks.filter((stack) => stack.length > 0);
    if (live.length < 2) break;
    live.sort((a, b) => b.length - a.length);
    const tallest = live[0]?.length ?? 0;
    const onTop = live.filter((stack) => stack.length === tallest);
    // Из самых высоких берём ту, которой есть с кем встать врозь: иначе пара
    // ляжет бок о бок, и этого уже ничем не исправить — значки у неё общие.
    const roomy = onTop.filter((stack) => live.some((other) => !adjacent(stack, other)));
    const first = rng.pick(roomy.length > 0 ? roomy : onTop);
    if (first === undefined) break;

    // Второй — самая высокая из тех, что не вплотную. Высота важна, чтобы
    // стопки убывали ровно и до конца раздачи оставалось куда класть пару;
    // live отсортирован по убыванию, и фильтры этот порядок хранят.
    const rest = live.filter((stack) => stack !== first);
    const far = rest.filter((stack) => !adjacent(first, stack));
    const choices = far.length > 0 ? far : rest;
    const tier = choices.filter((stack) => stack.length === (choices[0]?.length ?? 0));
    const second = rng.pick(tier);

    const a = first.pop();
    const b = second.pop();
    if (a === undefined || b === undefined) break;
    if (pool.length === 0) break;

    // Повторы в pool — это копии значка, которым ещё лежать: чем их больше,
    // тем охотнее значок выпадает, и к концу раздачи остатка не копится.
    const free = pool.filter(
      (symbol) => !symbolNearby(placed, symbol, a) && !symbolNearby(placed, symbol, b),
    );
    const symbol = rng.pick(free.length > 0 ? free : pool);
    pool.splice(pool.indexOf(symbol), 1);
    a.symbol = symbol;
    b.symbol = symbol;
    placed.push(a, b);
    deal.push([a, b]);
  }
  return deal;
}

/**
 * Сколько пар одинаковых значков лежат вплотную — хоть боком, хоть углом,
 * хоть одна на другой. По этому числу стол и «решается взглядом»: ребёнку
 * нечего искать, совпадения сами лезут в глаза.
 */
export function neighbourClashes(cells: readonly MahjongCell[]): number {
  let clashes = 0;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = cells[i];
      const b = cells[j];
      if (a === undefined || b === undefined) continue;
      if (a.symbol !== b.symbol) continue;
      if (Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1) clashes += 1;
    }
  }
  return clashes;
}

/**
 * Развести одинаковые значки, меняя их местами.
 *
 * Жадной раздачи не хватает: к концу свободных мест не остаётся, и последние
 * значки ложатся куда придётся. На двадцати парах так набиралось до одиннадцати
 * соседских пар — половина стола решалась без поиска. Поэтому после раздачи
 * идёт перебор: две раздачи меняются значками, мена принимается, если соседств
 * стало не больше.
 *
 * Меняются именно *раздачи целиком*, а не отдельные карточки. Разбор стола
 * обещан тем, что пары снимаются в обратном порядке раздачи — для этого обе
 * карточки одной раздачи обязаны нести один значок. Перебор по карточкам это
 * ломал: соседей он разводил, а стол переставал разбираться (на шести парах
 * тупик ловился уже на девятом seed). Мена целыми раздачами ничего из
 * обещанного не трогает: места карточек стоят, пары остаются парами.
 *
 * Мену «поровну» принимаем сознательно: на строгом улучшении перебор застревал
 * на одной-двух соседских парах и дальше не шёл. Разрешённое топтание по
 * равным раскладам выводит из таких тупиков, а хуже стать не может — число
 * соседств только убывает. С ним все столы игры сходятся к нулю.
 */
function polish(deal: readonly Deal[], rng: Rng, rounds: number): void {
  const cells = deal.flat();
  let best = neighbourClashes(cells);
  for (let round = 0; round < rounds && best > 0; round += 1) {
    const here = rng.pick(deal);
    const there = rng.pick(deal);
    if (here === undefined || there === undefined) continue;
    const was = { here: here[0].symbol, there: there[0].symbol };
    if (was.here === was.there) continue;

    setSymbol(here, was.there);
    setSymbol(there, was.here);
    const now = neighbourClashes(cells);
    if (now <= best) {
      best = now;
    } else {
      setSymbol(here, was.here);
      setSymbol(there, was.there);
    }
  }
}

/**
 * Разложить значки, выбрав лучший расклад из нескольких.
 *
 * Перебор мен сходится в свой локальный минимум и дальше не идёт — на большом
 * столе это оставляло в среднем одну-две соседские пары. Раздача же каждый раз
 * получается другая, поэтому дешевле раздать заново, чем выдумывать хитрый
 * перебор: расклад без соседей находится за одну-две попытки.
 */
function layOut(cells: readonly MahjongCell[], symbols: readonly number[], rng: Rng): void {
  let best: number[] = [];
  let fewest = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt += 1) {
    polish(assign(cells, symbols, rng), rng, POLISH_ROUNDS);
    const clashes = neighbourClashes(cells);
    if (clashes < fewest) {
      fewest = clashes;
      best = cells.map((cell) => cell.symbol);
    }
    if (fewest === 0) return;
  }
  cells.forEach((cell, index) => {
    cell.symbol = best[index] ?? cell.symbol;
  });
}

/** Обе карточки раздачи несут один значок — на этом держится разбор стола. */
function setSymbol(pair: Deal, symbol: number): void {
  pair[0].symbol = symbol;
  pair[1].symbol = symbol;
}

/** Значки по парам: картинка, лежащая четырьмя карточками, даёт две пары. */
function pairSymbols(cells: readonly MahjongCell[]): number[] {
  const counts = new Map<number, number>();
  for (const cell of cells) counts.set(cell.symbol, (counts.get(cell.symbol) ?? 0) + 1);
  const symbols: number[] = [];
  for (const [symbol, count] of counts) {
    for (let i = 0; i < Math.floor(count / 2); i += 1) symbols.push(symbol);
  }
  return symbols.sort((a, b) => a - b);
}

/**
 * Переложить значки у оставшихся карточек: ход снова появится.
 *
 * Значки берутся те же самые, что лежали на столе, — для ребёнка карточки
 * перемешались, а не превратились в другие.
 */
export function reshuffle(remaining: readonly MahjongCell[], seed: number): void {
  const rng = makeRng(seed);
  layOut(remaining, rng.shuffle(pairSymbols(remaining)), rng);
}

/**
 * Расклад на заданное число пар. Один и тот же seed даёт один и тот же стол:
 * ребёнок, вернувшийся в задачку, видит знакомые карточки на знакомых местах.
 *
 * `icons` — сколько разных картинок есть у игры. Пар бывает больше, и тогда
 * картинка повторяется: на столе лежат четыре одинаковые карточки, и парой
 * считаются любые две из них.
 */
export function buildMahjongBoard(
  pairs: number,
  seed: number,
  stacked: boolean,
  icons = pairs,
): MahjongBoard {
  if (pairs < 1) throw new Error('пар должно быть хотя бы одна');
  if (icons < 1) throw new Error('нужна хотя бы одна картинка');
  if (stacked && pairs > MAHJONG_MAX_PAIRS) throw new Error('столько карточек на стол не ляжет');

  const rng = makeRng(seed);
  const cells: MahjongCell[] = spots(pairs * 2, stacked).map((spot) => ({ ...spot, symbol: -1 }));
  layOut(cells, rng.shuffle(Array.from({ length: pairs }, (_, i) => i % icons)), rng);

  const columns = stacked ? fittingColumns(pairs * 2) : FLAT_COLUMNS;
  const rows = Math.max(...cells.map((cell) => cell.row)) + 1;
  const layers = Math.max(...cells.map((cell) => cell.layer)) + 1;
  return { columns, rows, layers, stacked, cells };
}
