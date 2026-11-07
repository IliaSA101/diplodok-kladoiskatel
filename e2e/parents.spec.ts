/**
 * Угол взрослых в живой игре (design 001, раздел 9): файл прогресса туда и обратно,
 * «Стереть всё», резервная копия и вторая вкладка.
 *
 * Координаты кнопок берутся из `art/startLayout.ts`, откуда их берёт и сама сцена: свои
 * числа здесь разошлись бы с панелью при первой же правке. Окно выбора файла — настоящее
 * (`filechooser`), скачивание — настоящее (`download`).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  PARENTS_TEXT,
  parentsAnswerRects,
  parentsMainRects,
  refusedBlockLines,
  summaryBlockLines,
  type ParentsItem,
} from '../src/art/parentsLayout';
import type { Rect } from '../src/art/startLayout';
import { QUEST_NODES } from '../src/data/quest';
import { summaryParts } from '../src/systems/parentsFiles';
import { REFUSED_REASON, REFUSED_TITLE } from '../src/systems/saveFile';
import { activeScenes, openGame, settle, shot, tap, waitScene } from './game';

const P = 'diplodok-kladoiskatel:';
const SOLVED_KEY = `${P}v3:quest-solved`;
const NODES = QUEST_NODES.map((node) => node.id);
const SAVE = { [SOLVED_KEY]: NODES, [`${P}v2:current`]: 5 };
const CORNER = { x: 30, y: 690 };
/** Кнопка «Да» окна «точно?». */
const YES = { x: 530, y: 442 };

const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

async function openMenu(page: Page): Promise<void> {
  await page.mouse.move(CORNER.x, CORNER.y);
  await page.mouse.down();
  await page.waitForTimeout(2400);
  await page.mouse.up();
  await settle(page, 500);
}

/** Нажать пункт меню: его место — по числу пунктов, которые сейчас есть. */
async function press(page: Page, items: readonly ParentsItem[], item: ParentsItem): Promise<void> {
  const rect = parentsMainRects(items.length, 0).buttons[items.indexOf(item)];
  if (rect === undefined) throw new Error(`нет пункта ${item}`);
  const { x, y } = centre(rect);
  await tap(page, x, y);
}

function stored(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Все надписи стартовой сцены: что сейчас видит взрослый на панели. */
function startTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    interface Node {
      text?: unknown;
      list?: Node[];
    }
    // Подписи кнопок лежат внутри контейнеров: обходим и их.
    const walk = (nodes: Node[]): string[] =>
      nodes.flatMap((node) => [
        ...(typeof node.text === 'string' ? [node.text] : []),
        ...walk(node.list ?? []),
      ]);
    return walk((window.game?.scene.getScene('Start')?.children.list ?? []) as unknown as Node[]);
  });
}

async function reloaded(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  // Пока страница перезагружается, выполнить в ней нельзя: это «ещё нет», а не провал.
  const scenes = (): Promise<string[]> =>
    page
      .evaluate(() => window.game?.scene?.getScenes(true).map((s) => s.scene.key) ?? [])
      .catch(() => []);
  await expect.poll(scenes).toContain('Start');
  await settle(page, 800);
}

test('файл туда и обратно: в файл, стереть, копия на месте, из файла — всё как было', async ({ page }) => {
  expect(NODES).toHaveLength(48);
  await openGame(page, SAVE);
  await waitScene(page, 'Start');
  await settle(page, 800);

  // Меню без копии и сбоя: файл, из файла, стереть.
  await openMenu(page);
  await shot(page, 'parents-menu');
  const three: ParentsItem[] = ['export', 'import', 'erase'];
  const exported = page.waitForEvent('download');
  await press(page, three, 'export');
  const file = await exported;
  expect(file.suggestedFilename()).toMatch(/^diplodok-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  const body = JSON.parse(readFileSync(path, 'utf8')) as { kind: string; keys: Record<string, string> };
  expect(body.kind).toBe('diplodok-progress');
  expect(JSON.parse(body.keys[SOLVED_KEY] ?? '[]')).toHaveLength(48);

  // «Стереть всё» → «Да»: прогресс стёрт, экран начат заново.
  await press(page, three, 'erase');
  await settle(page, 500);
  await tap(page, YES.x, YES.y);
  await expect.poll(() => stored(page, SOLVED_KEY)).toBeNull();
  await waitScene(page, 'Start');
  await settle(page, 800);

  // Теперь есть копия: пункт виден, и она скачивается.
  await openMenu(page);
  const four: ParentsItem[] = ['export', 'import', 'backup', 'erase'];
  await shot(page, 'parents-menu-backup');
  const backup = page.waitForEvent('download');
  await press(page, four, 'backup');
  expect((await backup).suggestedFilename()).toMatch(/^diplodok-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // «Прогресс из файла»: окно выбора, сводка, «Да».
  const chooser = page.waitForEvent('filechooser');
  await press(page, four, 'import');
  await (await chooser).setFiles(path);
  await settle(page, 800);
  await shot(page, 'parents-summary');
  const parts = summaryParts(
    { forests: 0, quest: 48, english: 0 },
    { forests: 0, quest: 0, english: 0 },
  );
  const text = [parts.file, parts.current].join('\n');
  const yes = parentsAnswerRects(2, summaryBlockLines(text)).buttons[0];
  if (yes === undefined) throw new Error('нет кнопки «Да»');
  await tap(page, centre(yes).x, centre(yes).y);
  await reloaded(page);

  expect(JSON.parse((await stored(page, SOLVED_KEY)) ?? '[]')).toEqual(NODES);
  expect(await stored(page, `${P}restore`)).toBeNull();
  await page.keyboard.press('Digit2');
  await waitScene(page, 'QuestMap');
  await settle(page, 1500);
  await shot(page, 'parents-restored-map');
});

test('двойной клик по «Да» в сводке не затирает копию прогрессом из файла', async ({ page }) => {
  // Второй клик успевал до выгрузки страницы и запускал замену ещё раз: копией становился
  // уже прогресс из файла, и свежий прогресс ребёнка пропадал насовсем (ревью этапа 8).
  await openGame(page, { [SOLVED_KEY]: [NODES[0]] });
  await waitScene(page, 'Start');
  await settle(page, 800);
  await openMenu(page);
  const three: ParentsItem[] = ['export', 'import', 'erase'];
  const exported = page.waitForEvent('download');
  await press(page, three, 'export');
  const path = await (await exported).path();

  // Ребёнок играл дальше: теперь все 48 узлов, а в файле — один.
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SOLVED_KEY, JSON.stringify(NODES)] as const);
  await page.reload();
  await reloaded(page);
  await openMenu(page);
  const chooser = page.waitForEvent('filechooser');
  await press(page, three, 'import');
  await (await chooser).setFiles(path);
  await settle(page, 800);
  const parts = summaryParts({ forests: 0, quest: 1, english: 0 }, { forests: 0, quest: 48, english: 0 });
  const yes = parentsAnswerRects(2, summaryBlockLines([parts.file, parts.current].join('\n'))).buttons[0];
  if (yes === undefined) throw new Error('нет кнопки «Да»');
  await page.mouse.dblclick(centre(yes).x, centre(yes).y);
  await reloaded(page);

  const backup = JSON.parse((await stored(page, `${P}backup`)) ?? 'null') as { keys: Record<string, string> };
  expect(JSON.parse(backup.keys[SOLVED_KEY] ?? '[]')).toHaveLength(48);
  expect(JSON.parse((await stored(page, SOLVED_KEY)) ?? '[]')).toHaveLength(1);
});

test('чужой файл не принимается: отказ, «Понятно», прогресс тот же', async ({ page }) => {
  await openGame(page, SAVE);
  await waitScene(page, 'Start');
  await settle(page, 800);
  await openMenu(page);
  const three: ParentsItem[] = ['export', 'import', 'erase'];
  const chooser = page.waitForEvent('filechooser');
  await press(page, three, 'import');
  await (await chooser).setFiles({
    name: 'report.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ "kind": "diplodok-report" }'),
  });
  await settle(page, 600);
  await shot(page, 'parents-refused');
  expect(await startTexts(page)).toEqual(expect.arrayContaining([REFUSED_TITLE, REFUSED_REASON.foreign]));
  // «Понятно» — единственная кнопка ответа: после неё снова главное меню.
  const ok = parentsAnswerRects(1, refusedBlockLines(REFUSED_REASON.foreign)).buttons[0];
  if (ok === undefined) throw new Error('нет кнопки «Понятно»');
  await tap(page, centre(ok).x, centre(ok).y);
  await settle(page, 400);
  const after = await startTexts(page);
  expect(after).toContain(PARENTS_TEXT.items.erase);
  expect(after).not.toContain(REFUSED_TITLE);
  expect(JSON.parse((await stored(page, SOLVED_KEY)) ?? '[]')).toEqual(NODES);
  expect(await stored(page, `${P}restore`)).toBeNull();
});

test('вторая вкладка: стёрли в первой — вторая перезагрузилась и показывает пустую карту', async ({
  context,
}) => {
  const first = await context.newPage();
  await openGame(first, SAVE);
  await waitScene(first, 'Start');
  // Вторая вкладка открывается без `openGame`: тот чистит хранилище, общее на обе вкладки,
  // и первая перезагрузилась бы от этого, а не от стирания.
  const second = await context.newPage();
  await second.goto('./');
  await waitScene(second, 'Start');
  await settle(second, 500);
  await second.keyboard.press('Digit2');
  await waitScene(second, 'QuestMap');
  await second.evaluate(() => {
    (window as unknown as { tab2?: boolean }).tab2 = true;
  });

  await first.bringToFront();
  await settle(first, 500);
  await openMenu(first);
  const three: ParentsItem[] = ['export', 'import', 'erase'];
  await press(first, three, 'erase');
  await settle(first, 500);
  await tap(first, YES.x, YES.y);
  await expect.poll(() => stored(first, SOLVED_KEY)).toBeNull();

  // Метка в `window` пропала: вкладка перезагрузилась сама, без нажатий.
  // Во время самой перезагрузки выполнить в странице нельзя — это тоже «метки больше нет».
  await expect
    .poll(() =>
      second.evaluate(() => (window as unknown as { tab2?: boolean }).tab2).catch(() => undefined),
    )
    .toBeUndefined();
  await reloaded(second);
  await second.keyboard.press('Digit2');
  await waitScene(second, 'QuestMap');
  await settle(second, 1500);
  expect(await activeScenes(second)).toContain('QuestMap');
  expect(await stored(second, SOLVED_KEY)).toBeNull();
  await shot(second, 'parents-second-tab-empty-map');
});
