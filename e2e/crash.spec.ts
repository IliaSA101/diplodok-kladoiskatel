/**
 * Сбой в живой игре: ловушка, экран «Позови взрослого», отчёт, «Продолжить».
 *
 * Экран сбоя — DOM поверх холста, поэтому смотрим его через `page.screenshot` и
 * ищем по `[data-crash-screen]`. Ошибку бросаем из таймера: так её видит `window`
 * `error`, как видел бы при сбое в сцене.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openGame, settle, shot, waitScene } from './game';

const P = 'diplodok-kladoiskatel:';
const SCREEN = '[data-crash-screen]';
const SAVE = { [`${P}v2:current`]: 5, [`${P}v3:quest-solved`]: ['q1', 'q2'] };

/** Хранилище без одноразовых ключей: журнал и crash меняются сами. */
function progressOf(page: Page): Promise<Record<string, string>> {
  return page.evaluate((prefix) => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? '';
      if (!key.startsWith(prefix) || key === `${prefix}journal` || key === `${prefix}crash`) continue;
      out[key] = localStorage.getItem(key) ?? '';
    }
    return out;
  }, P);
}

function throwLater(page: Page, message: string): Promise<void> {
  return page.evaluate((text) => {
    setTimeout(() => {
      throw new Error(text);
    });
  }, message);
}

interface Report {
  kind: string;
  game: string;
  errors: { message: string; stack?: string }[];
  journal: { k: string; d?: string }[];
  storage: Record<string, string>;
}

async function downloadReport(page: Page): Promise<Report> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить отчёт' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^diplodok-report-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  return JSON.parse(readFileSync(await download.path(), 'utf8')) as Report;
}

test('сбой: экран, отчёт с двумя ошибками, Esc — первый экран, прогресс тот же', async ({ page }) => {
  await openGame(page, SAVE);
  await waitScene(page, 'Start');
  await settle(page, 800);
  const before = await progressOf(page);
  expect(before[`${P}v3:quest-solved`]).toBe('["q1","q2"]');

  await throwLater(page, 'e2e-crash');
  await expect(page.locator(SCREEN)).toBeVisible();
  await expect(page.locator(SCREEN)).toContainText('Позови взрослого');
  await expect(page.locator(SCREEN)).not.toContainText('Ошибка');
  // Диплодок на экране: картинка загрузилась, а не пустая рамка.
  await expect
    .poll(() => page.locator(`${SCREEN} img`).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // Фокус на «Сохранить отчёт»: Enter сразу делает нужное.
  await expect(page.getByRole('button', { name: 'Сохранить отчёт' })).toBeFocused();
  await settle(page, 300);
  await shot(page, 'crash-screen');

  const first = await downloadReport(page);
  expect(first.kind).toBe('diplodok-report');
  expect(first.game).toMatch(/^\d+\.\d+\.\d+/);
  // Событие error приносит сообщение с приставкой «Uncaught Error: ».
  expect(first.errors).toHaveLength(1);
  expect(first.errors[0]?.message).toMatch(/e2e-crash$/);
  expect(first.errors[0]?.stack).toContain('e2e-crash');
  expect(first.journal.length).toBeGreaterThan(0);
  expect(first.journal.map((e) => e.k)).toEqual(expect.arrayContaining(['boot', 'scene', 'error']));
  expect(first.journal.some((e) => e.k === 'scene' && (e.d ?? '').includes('Start'))).toBe(true);
  expect(Object.keys(first.storage)).toEqual(expect.arrayContaining([`${P}v2:current`, `${P}format`]));
  expect(first.storage[`${P}v3:quest-solved`]).toBe('["q1","q2"]');

  // Вторая ошибка второго экрана не даёт, а в следующем отчёте их две.
  await throwLater(page, 'e2e-crash-2');
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), `${P}crash`)).toContain('e2e-crash-2');
  await expect(page.locator(SCREEN)).toHaveCount(1);
  const second = await downloadReport(page);
  expect(second.errors).toHaveLength(2);
  expect(second.errors[1]?.message).toMatch(/e2e-crash-2$/);

  // Последний сбой лежит в crash — для угла взрослых, если ребёнок закроет экран раньше.
  const crash = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), `${P}crash`)) ?? 'null');
  expect(crash.kind).toBe('diplodok-report');
  expect(crash.errors).toHaveLength(2);

  await page.keyboard.press('Escape');
  await expect(page.locator(SCREEN)).toHaveCount(0);
  // После перезагрузки игры ещё нет, потом нет списка сцен: ждём, пока он появится.
  await expect
    .poll(() =>
      page.evaluate(() => window.game?.scene?.getScenes(true).map((s) => s.scene.key) ?? []),
    )
    .toContain('Start');
  await settle(page, 800);
  expect(await progressOf(page)).toEqual(before);
  await shot(page, 'crash-after-continue');
});

test('шум браузера экрана не даёт, но в журнале остаётся', async ({ page }) => {
  await openGame(page, SAVE);
  await waitScene(page, 'Start');
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
        filename: location.href,
      }),
    );
  });
  await settle(page, 500);
  await expect(page.locator(SCREEN)).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), `${P}crash`)).toBeNull();
  const journal = await page.evaluate((k) => localStorage.getItem(k), `${P}journal`);
  expect(journal).toContain('ResizeObserver');
  // Игра идёт: «Играть» по клавише 1 уводит со стартового экрана.
  await page.keyboard.press('Digit1');
  await expect.poll(() => page.evaluate(() => window.game?.scene.getScenes(true).map((s) => s.scene.key) ?? [])).not.toContain('Start');
});
