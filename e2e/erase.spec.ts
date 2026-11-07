/**
 * «Стереть весь прогресс» руками взрослого: удержание в левом нижнем углу, окно «точно?»,
 * кнопка «Да». Копия, метка и ответ — в живом `localStorage`, а не в подмене из `tests/`.
 */
import { expect, test, type Page } from '@playwright/test';
import { parentsMainRects } from '../src/art/parentsLayout';
import { openGame, settle, shot, tap, waitScene } from './game';

const P = 'diplodok-kladoiskatel:';
/** Угол взрослых: левый нижний 64×64, держать дольше двух секунд. */
const CORNER = { x: 30, y: 690 };
/** «Стереть всё» — последний из трёх пунктов (прогресс в файл, из файла, стереть), когда копии и сбоя нет. */
const ERASE = parentsMainRects(3, 0).buttons[2] ?? { x: 0, y: 0, w: 0, h: 0 };
/** Кнопка «Да» в окне «точно?». */
const YES = { x: 530, y: 442 };

async function holdCornerAndConfirm(page: Page): Promise<void> {
  await page.mouse.move(CORNER.x, CORNER.y);
  await page.mouse.down();
  await page.waitForTimeout(2400);
  await page.mouse.up();
  await settle(page, 500);
  await tap(page, ERASE.x + ERASE.w / 2, ERASE.y + ERASE.h / 2);
  await settle(page, 500);
  await shot(page, 'erase-confirm');
  await tap(page, YES.x, YES.y);
}

test('стереть всё: прогресс стёрт, копия на месте, метки нет, экран начат заново', async ({ page }) => {
  await openGame(page, { [`${P}v2:current`]: 5, [`${P}v3:quest-solved`]: ['q1', 'q2'] });
  await waitScene(page, 'Start');
  await settle(page, 800);

  await holdCornerAndConfirm(page);
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), `${P}v3:quest-solved`))
    .toBeNull();
  const state = await page.evaluate((p) => {
    return {
      backup: JSON.parse(localStorage.getItem(`${p}backup`) ?? 'null') as {
        reason: string;
        keys: Record<string, string>;
      } | null,
      restore: localStorage.getItem(`${p}restore`),
      format: localStorage.getItem(`${p}format`),
      current: localStorage.getItem(`${p}v2:current`),
    };
  }, P);
  expect(state.backup?.reason).toBe('erase');
  expect(state.backup?.keys[`${P}v3:quest-solved`]).toBe('["q1","q2"]');
  expect(state.restore).toBeNull();
  expect(state.format).toBe('2');
  expect(state.current).toBeNull();
  await waitScene(page, 'Start');
  await settle(page, 800);
  await shot(page, 'erase-done');
});

test('стереть всё, когда браузер полон: ничего не стёрто, взрослому сказано', async ({ page }) => {
  await openGame(page, { [`${P}v2:current`]: 5, [`${P}v3:quest-solved`]: ['q1', 'q2'] });
  await waitScene(page, 'Start');
  await settle(page, 800);
  // Забить хранилище до последнего знака: копии (больше десятка знаков) места нет.
  await page.evaluate(() => {
    for (const size of [100000, 10000, 1000, 100, 10, 1]) {
      for (let i = 0; i < 100000; i += 1) {
        try {
          localStorage.setItem(`filler-${size}-${i}`, 'x'.repeat(size));
        } catch {
          break;
        }
      }
    }
  });

  await holdCornerAndConfirm(page);
  await settle(page, 600);
  const shown = await page.evaluate(() =>
    (window.game?.scene.getScene('Start')?.children.list ?? []).some(
      (child) => 'text' in child && String((child as { text: unknown }).text).includes('ничего не стёрто'),
    ),
  );
  expect(shown).toBe(true);
  await shot(page, 'erase-no-space');
  const left = await page.evaluate((k) => localStorage.getItem(k), `${P}v3:quest-solved`);
  expect(left).toBe('["q1","q2"]');
  expect(await page.evaluate((k) => localStorage.getItem(k), `${P}restore`)).toBeNull();
});
