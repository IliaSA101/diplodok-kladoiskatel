/**
 * Общее для сценариев английской ветки: снимок поля «Find a word» и жесты по нему.
 * Вынесено из `english.spec.ts`, когда тот подошёл к порогу в шестьсот строк.
 */
import { expect, type Page } from '@playwright/test';
import { settle, tap, waitScene } from './game';

/** Что сцена поиска слова знает о себе: читаем через `window.game` (dev-сборка). */
export interface SearchState {
  cells: {
    row: number;
    col: number;
    x: number;
    y: number;
    scale: number;
    textScale: number;
    /** Плитка когда-либо дрожала (неверная буква). */
    shaken: boolean;
  }[];
  placements: { word: string; row: number; col: number; horizontal: boolean }[];
  letters: string[][];
  path: { row: number; col: number }[];
  found: string[];
  scene: string[];
  /** Цвет заливки каждой точки ряда: загоревшаяся отличается от исходной. */
  dots: number[];
}

export function searchState(page: Page): Promise<SearchState> {
  return page.evaluate(() => {
    const game = window.game;
    const scene = game?.scene.getScene('EnglishSearch') as unknown as {
      cells: {
        row: number;
        col: number;
        x: number;
        y: number;
        shake: unknown;
        tile: { scaleX: number };
        text: { scaleX: number };
      }[];
      grid: { placements: SearchState['placements']; letters: string[][] };
      pick: { path: SearchState['path']; isFound(word: string): boolean };
      dots: { dots: { fillColor: number }[] };
    };
    return {
      cells: scene.cells.map((c) => ({
        row: c.row,
        col: c.col,
        x: c.x,
        y: c.y,
        scale: c.tile.scaleX,
        textScale: c.text.scaleX,
        shaken: c.shake !== null,
      })),
      placements: scene.grid.placements,
      letters: scene.grid.letters,
      // Сцена кладёт в путь свои клетки (с плитками Phaser): наружу уходят только строка и столбец,
      // иначе упавшая проверка пытается разобрать весь граф сцены и роняет процесс по памяти.
      path: scene.pick.path.map((cell) => ({ row: cell.row, col: cell.col })),
      found: scene.grid.placements.map((p) => p.word).filter((w) => scene.pick.isFound(w)),
      scene: (game?.scene.getScenes(true) ?? []).map((item) => item.scene.key),
      dots: scene.dots.dots.map((dot) => dot.fillColor),
    };
  });
}

/**
 * Нажать в центр клетки поля. Координаты берутся из снимка, снятого один раз:
 * плитки стоят на местах, а каждый `evaluate` на программном WebGL стоит секунды.
 */
export async function tapCell(
  page: Page,
  cells: SearchState['cells'],
  row: number,
  col: number,
): Promise<void> {
  const cell = cells.find((c) => c.row === row && c.col === col);
  expect(cell, `клетки ${row}:${col} нет`).toBeDefined();
  await tap(page, cell?.x ?? 0, cell?.y ?? 0);
}

/** Клетки слова по порядку букв. */
export function wordCells(place: SearchState['placements'][number]): { row: number; col: number }[] {
  return Array.from({ length: place.word.length }, (_, i) => ({
    row: place.row + (place.horizontal ? 0 : i),
    col: place.col + (place.horizontal ? i : 0),
  }));
}

export type Spot = { row: number; col: number };

/** Где на экране клетка: по снимку, снятому один раз. */
export function spotOf(cells: SearchState['cells'], at: Spot | undefined): { x: number; y: number } {
  const cell = cells.find((c) => c.row === at?.row && c.col === at?.col);
  expect(cell, `клетки ${at?.row}:${at?.col} нет`).toBeDefined();
  return { x: cell?.x ?? 0, y: cell?.y ?? 0 };
}

/** Нажать на первую клетку пути и провести мышь по остальным; отпустить, если `up`. */
export async function dragAlong(
  page: Page,
  cells: SearchState['cells'],
  path: readonly Spot[],
  up = true,
): Promise<void> {
  const first = spotOf(cells, path[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const at of path.slice(1)) {
    const spot = spotOf(cells, at);
    await page.mouse.move(spot.x, spot.y, { steps: 6 });
  }
  if (up) await page.mouse.up();
}

/** Запустить сцену, закрыв всё живое, кроме стартовой. */
export async function startScene(page: Page, key: string, data: object): Promise<void> {
  await page.evaluate(
    ({ key: scene, data: payload }) => {
      const game = window.game;
      for (const live of game?.scene.getScenes(true) ?? []) {
        if (live.scene.key !== 'Start') game?.scene.stop(live.scene.key);
      }
      game?.scene.getScene('Start').scene.start(scene, payload);
    },
    { key, data },
  );
  await waitScene(page, key);
}

export async function openSearch(page: Page, data: { setIndex: number; seed?: number }): Promise<void> {
  await page.evaluate((payload) => {
    window.game?.scene.getScene('Start').scene.start('EnglishSearch', payload);
  }, data);
  await waitScene(page, 'EnglishSearch');
  await settle(page, 1200);
}
