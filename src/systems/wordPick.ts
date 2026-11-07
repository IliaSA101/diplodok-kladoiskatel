/**
 * Выбор слова в поле «Find a word»: путь по буквам, клик за кликом.
 *
 * Модуль без Phaser. Раньше слово отмечалось двумя тапами — первая и последняя
 * буква, — и ребёнок не понимал, что от него хотят. Теперь слово ищут так, как
 * его пишут: буква за буквой. Клик по первой букве ненайденного слова на его
 * месте начинает путь, каждый следующий клик по следующей букве продолжает его,
 * последняя буква — слово найдено. Протягивание мышью делает то же самое.
 *
 * Правила, у которых есть картинка (иначе это «нельзя», которого не видно):
 * - неверная буква — это та, которой нет в написанном слове на этом месте;
 *   выбранные при этом остаются, ошибка ничего не стоит;
 * - клик по выбранной букве снимает её и всё после неё. Клик — это нажал и
 *   отпустил на той же плитке: само нажатие путь не трогает. Ребёнок отпустил
 *   кнопку раньше времени, жмёт на последнюю выбранную и тянет дальше — буква
 *   не должна погаснуть под рукой, а следующая задрожать как неверная;
 * - буква найденного слова, через которую проходит другое слово, кликается как
 *   обычная: золото не запрет;
 * - жест, начатый с неверной буквы, мёртв: протянул на другую неверную — дрожит
 *   одна, та, с которой начал;
 * - несколько пикселей дрожи руки — ещё не протягивание: небрежный клик на
 *   стыке плиток не добавляет вторую букву;
 * - вторая половина двойного клика по только что найденному слову не кричит
 *   «неверно» поверх фанфары (002-26): глушится только этот исход, а новое
 *   слово с той же клетки начинается как обычно (002-29). Время приходит от
 *   сцены (`now`, миллисекунды, обязательно — 002-30), часов в модуле нет;
 * - потерянное отпускание (alt-tab посреди протягивания) гасит жест без
 *   вердикта: `abort()` (002-28).
 */
import { SEARCH_DRAG_MIN } from '../art/englishLayout';
import type { Placement } from './wordGrid';

/** Столько миллисекунд после находки на клетках этого слова молчит «неверно» (остальное отвечает как обычно). */
export const FOUND_QUIET_MS = 300;

export interface Cell {
  row: number;
  col: number;
}

/** Что случилось с кликом: сцене остаётся только показать это. */
export type PickResult =
  | { kind: 'start' }
  | { kind: 'extend' }
  | { kind: 'found'; place: Placement }
  | { kind: 'trim'; removed: number }
  | { kind: 'wrong' }
  | { kind: 'ignore' };

export interface WordPick {
  /** Выбранные буквы по порядку. Копия: снаружи путь не правят. */
  readonly path: readonly Cell[];
  /**
   * Кнопку нажали на клетке. Невыбранная буква продолжает (или начинает) путь
   * сразу, выбранную нажатие не трогает: что с ней будет, решит отпускание.
   * `now` — часы сцены: без них защита от двойного клика не работает, поэтому
   * время обязательно.
   */
  press(cell: Cell, now: number): PickResult;
  /**
   * Мышь с нажатой кнопкой над клеткой (`null` — над просветом или за полем);
   * `travelled` — сколько пикселей от точки нажатия. Путь только растёт, молча.
   */
  drag(cell: Cell | null, travelled: number, now: number): PickResult;
  /**
   * Кнопку отпустили (над клеткой или нет). Без протягивания на выбранной —
   * снимает её и всё после. После протягивания — неверная буква, если на ней
   * остановились.
   */
  release(cell: Cell | null): PickResult;
  /**
   * Кнопки уже нет, а отпускания не было (alt-tab, меню браузера): жест гаснет
   * без вердикта. Путь не трогается, ни «неверно», ни снятия буквы.
   */
  abort(): void;
  /** Нажал и отпустил на одной клетке. */
  click(cell: Cell, now: number): PickResult;
  /** Снять весь путь. */
  clear(): void;
  isFound(word: string): boolean;
}

/** Клетки слова по порядку букв. */
export function placementCells(place: Placement): Cell[] {
  return Array.from({ length: place.word.length }, (_, i) => ({
    row: place.row + (place.horizontal ? 0 : i),
    col: place.col + (place.horizontal ? i : 0),
  }));
}

function same(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col;
}

export function createWordPick(placements: readonly Placement[]): WordPick {
  const cellsOf = new Map<Placement, Cell[]>(placements.map((place) => [place, placementCells(place)]));
  const found = new Set<string>();
  let path: Cell[] = [];
  /**
   * Жест с нажатой кнопкой. `idle` — кнопка не нажата (или слово только что
   * найдено); `live` — нажали на букву, которая пошла в путь; `hold` — нажали на
   * уже выбранную, ждём отпускания; `dead` — нажали на неверную.
   */
  let gesture: 'idle' | 'live' | 'hold' | 'dead' = 'idle';
  /** Выбранная буква, на которой нажали (`hold`). */
  let held: Cell | null = null;
  /** С нажатия рука ушла дальше дрожи: это протягивание, а не клик. */
  let moved = false;
  /** Последнее найденное слово: его клетки недолго молчат. */
  let lastFound: { cells: Cell[]; at: number } | null = null;
  /** Время текущего нажатия или шага протягивания. */
  let clock = 0;

  /** Ненайденные слова, которые начинаются с этого пути. */
  const candidates = (prefix: readonly Cell[]): Placement[] =>
    placements.filter((place) => {
      if (found.has(place.word)) return false;
      const cells = cellsOf.get(place) ?? [];
      if (prefix.length > cells.length) return false;
      return prefix.every((cell, i) => {
        const own = cells[i];
        return own !== undefined && same(cell, own);
      });
    });

  const extend = (cell: Cell): PickResult => {
    const next = [...path, cell];
    const options = candidates(next);
    if (options.length === 0) return { kind: 'wrong' };
    const done = options.find((place) => place.word.length === next.length);
    if (done !== undefined) {
      found.add(done.word);
      lastFound = { cells: cellsOf.get(done) ?? [], at: clock };
      path = [];
      return { kind: 'found', place: done };
    }
    path = next;
    return { kind: next.length === 1 ? 'start' : 'extend' };
  };

  /** Снять выбранную букву номер `at` и всё после неё. */
  const trimAt = (at: number): PickResult => {
    const removed = path.length - at;
    path = path.slice(0, at);
    return { kind: 'trim', removed };
  };

  /** Выбранная буква, на которой нажали, — последняя: от неё можно тянуть дальше. */
  const holdsLast = (): boolean => {
    const last = path[path.length - 1];
    return held !== null && last !== undefined && same(held, last);
  };

  const pick: WordPick = {
    get path(): readonly Cell[] {
      return path.slice();
    },

    press(cell: Cell, now: number): PickResult {
      moved = false;
      held = null;
      clock = now;
      if (path.some((item) => same(item, cell))) {
        gesture = 'hold';
        held = cell;
        return { kind: 'ignore' };
      }
      const quiet =
        lastFound !== null &&
        now - lastFound.at < FOUND_QUIET_MS &&
        lastFound.cells.some((item) => same(item, cell));
      const result = extend(cell);
      // Найденное слово заканчивает жест: отпускание на его последней букве — не ошибка.
      gesture = result.kind === 'wrong' ? 'dead' : result.kind === 'found' ? 'idle' : 'live';
      // Тишина — только для «неверно»: жест после него мёртв, протягивание ничего не растит.
      return quiet && result.kind === 'wrong' ? { kind: 'ignore' } : result;
    },

    drag(cell: Cell | null, travelled: number, now: number): PickResult {
      if (gesture === 'dead' || travelled < SEARCH_DRAG_MIN) return { kind: 'ignore' };
      clock = now;
      moved = true;
      // Жест, начатый на средней выбранной букве, ничего не растит.
      if (cell === null || (gesture === 'hold' && !holdsLast())) return { kind: 'ignore' };
      if (path.length === 0 || path.some((item) => same(item, cell))) return { kind: 'ignore' };
      const result = extend(cell);
      if (result.kind !== 'wrong') gesture = result.kind === 'found' ? 'idle' : 'live';
      return result.kind === 'wrong' ? { kind: 'ignore' } : result;
    },

    release(cell: Cell | null): PickResult {
      const was = gesture;
      const grew = moved;
      gesture = 'idle';
      moved = false;
      if (was === 'hold' && !grew) {
        const at = path.findIndex((item) => held !== null && same(item, held));
        return at < 0 ? { kind: 'ignore' } : trimAt(at);
      }
      if (was === 'idle' || was === 'dead' || !grew || cell === null) return { kind: 'ignore' };
      if (was === 'hold' && !holdsLast()) return { kind: 'ignore' };
      if (path.some((item) => same(item, cell))) return { kind: 'ignore' };
      return { kind: 'wrong' };
    },

    abort(): void {
      gesture = 'idle';
      moved = false;
      held = null;
    },

    click(cell: Cell, now: number): PickResult {
      const pressed = pick.press(cell, now);
      const released = pick.release(cell);
      return released.kind === 'trim' ? released : pressed;
    },

    clear(): void {
      path = [];
      gesture = 'idle';
    },

    isFound(word: string): boolean {
      return found.has(word);
    },
  };
  return pick;
}
