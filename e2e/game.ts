/**
 * Общее для сценариев: запуск игры, ожидание сцены, клик по координатам
 * игры, кадр шага.
 *
 * Холст FIT вписан в окно 1280×720 целиком, поэтому координаты игры и
 * страницы совпадают — клик идёт ровно туда, куда ткнул бы ребёнок.
 * Состояние сцен читается через `window.game` (есть только в dev-сборке).
 */
import { expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Куда класть кадры шагов: вне git, рядом с обходом `?shots`. */
const SHOTS_DIR = 'art-work/e2e';

/** Phaser.WEBGL: сам Phaser в node не импортировать — он лезет в window. */
const WEBGL = 2;

/** Открыть игру с чистым сохранением (или с тем, что передали). */
export async function openGame(page: Page, save: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((entries) => {
    // Только при первом заходе: иначе перезагрузка затёрла бы прогресс сценария.
    if (sessionStorage.getItem('e2e-seeded') !== null) return;
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    sessionStorage.setItem('e2e-seeded', '1');
  }, save);
  await page.goto('./');
  await expect
    .poll(() => page.evaluate(() => window.game?.renderer?.type ?? null), {
      message: 'игре нужен WebGL: без него кадры врут (docs/new-machine.md)',
    })
    .toBe(WEBGL);
}

/** Ключи активных сцен, кроме служебной загрузки. */
export function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window.game?.scene.getScenes(true) ?? []).map((scene) => scene.scene.key),
  );
}

/** Дождаться, пока сцена станет активной. */
export async function waitScene(page: Page, key: string): Promise<void> {
  await expect.poll(() => activeScenes(page), { message: `ждём сцену ${key}` }).toContain(key);
}

/** Нажать в точку игры (координаты 1280×720). */
export async function tap(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y);
}

/** Дать сцене улечься: твины и появления идут по реальному времени. */
export async function settle(page: Page, ms = 1500): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Кадр шага в натуральную величину. */
export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}
