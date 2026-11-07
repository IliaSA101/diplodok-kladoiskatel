/**
 * «Find a word»: нажатия, которых ждёшь от настоящей мыши, а не от идеального клика.
 *
 * - правый клик ничего не делает (002-25): он открывает меню браузера, и
 *   отпускание кнопки в игру может не прийти;
 * - потерянное отпускание (alt-tab, меню) не оставляет жест живым: движение мыши
 *   без нажатой кнопки гасит его, иначе буквы загораются от простого движения
 *   (002-25), — и без вердикта: плитка под курсором не дрожит «неверно» и
 *   выбранная буква не снимается (002-28);
 * - правая кнопка, нажатая и отпущенная поверх зажатой левой, не мешает жесту:
 *   Phaser у такого нажатия всё ещё видит левую зажатой, поэтому сцена смотрит на
 *   кнопку самого события (002-33);
 * - двойной клик по последней букве слова не кричит «неверно» поверх фанфары (002-26).
 *
 * Логику жеста стережёт `tests/wordGesture.test.ts`; здесь — проводка сцены к ней.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, settle, shot, waitScene } from './game';
import { openSearch, searchState, spotOf, tapCell, wordCells } from './searchHelpers';

async function openField(page: Page): Promise<Awaited<ReturnType<typeof searchState>>> {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await openSearch(page, { setIndex: 0, seed: 11 });
  return searchState(page);
}

test('«Find a word»: правый клик не нажимает, потерянное отпускание гасит жест', async ({ page }) => {
  test.setTimeout(120_000);
  const start = await openField(page);
  const word = start.placements[0];
  expect(word).toBeDefined();
  const cells = wordCells(word);
  expect(cells.length, 'слову нужны три буквы для проверки').toBeGreaterThan(2);
  const [a, b, c] = cells.map((cell) => spotOf(start.cells, cell));

  // Правая кнопка зажата на первой букве слова и проведена дальше: путь не начался.
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down({ button: 'right' });
  expect((await searchState(page)).path, 'правый клик начал путь').toEqual([]);
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0, { steps: 6 });
  await page.mouse.move(c?.x ?? 0, c?.y ?? 0, { steps: 6 });
  expect((await searchState(page)).path, 'правая кнопка протянула путь').toEqual([]);
  await page.mouse.up({ button: 'right' });
  await settle(page, 300);

  // Левая нажата на первой букве, а отпускание потерялось: дальше приходит только
  // движение без кнопки (так шлёт браузер после alt-tab или закрытого меню).
  const cdp = await page.context().newCDPSession(page);
  const moveWithoutButton = async (x: number, y: number): Promise<void> => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
  };
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  expect((await searchState(page)).path, 'первая буква выбрана').toHaveLength(1);
  await moveWithoutButton(b?.x ?? 0, b?.y ?? 0);
  await moveWithoutButton(c?.x ?? 0, c?.y ?? 0);
  await settle(page, 300);
  const after = await searchState(page);
  expect(after.path, 'движение без кнопки растит путь').toHaveLength(1);
  expect(
    after.cells.filter((cell) => cell.shaken),
    'плитки дрожат от движения без кнопки',
  ).toEqual([]);
  await shot(page, 'search-lost-release');
  await page.mouse.up();
  await settle(page, 300);

  // То же после протягивания (002-28): путь из двух букв, отпускание потерялось, мышь
  // ушла на чужую плитку далеко от пути. Ребёнок ничего не отпускал на ней: ни одна
  // плитка не дрожит, путь остался.
  const wordSpots = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const far = start.cells
    .filter((cell) => !wordSpots.has(`${cell.row}:${cell.col}`))
    .sort(
      (p, q) =>
        Math.hypot(q.x - (a?.x ?? 0), q.y - (a?.y ?? 0)) - Math.hypot(p.x - (a?.x ?? 0), p.y - (a?.y ?? 0)),
    )[0];
  expect(far, 'нужна чужая плитка').toBeDefined();
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0, { steps: 6 });
  expect((await searchState(page)).path, 'протянули две буквы').toHaveLength(2);
  await moveWithoutButton(far?.x ?? 0, far?.y ?? 0);
  await settle(page, 300);
  const dragged = await searchState(page);
  expect(dragged.path, 'потерянное отпускание после протягивания тронуло путь').toHaveLength(2);
  expect(
    dragged.cells.filter((cell) => cell.shaken),
    'потерянное отпускание после протягивания: плитка под курсором дрожит как неверная',
  ).toEqual([]);
  await shot(page, 'search-lost-release-after-drag');
  await page.mouse.up();
});

test('«Find a word»: двойной клик по последней букве найденного слова не дрожит «неверно»', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const start = await openField(page);
  const word = start.placements[0];
  const cells = wordCells(word);
  for (const cell of cells.slice(0, -1)) await tapCell(page, start.cells, cell.row, cell.col);
  const last = spotOf(start.cells, cells[cells.length - 1]);
  await page.mouse.dblclick(last.x, last.y);
  await expect.poll(async () => (await searchState(page)).found).toHaveLength(1);
  const lastCell = cells[cells.length - 1];
  const state = await searchState(page);
  expect(
    state.cells.find((cell) => cell.row === lastCell?.row && cell.col === lastCell?.col)?.shaken,
    'вторая половина двойного клика дрожит как неверная',
  ).toBe(false);
  expect(state.path, 'двойной клик начал новый путь').toEqual([]);
  await shot(page, 'search-double-click-last');
});

test('«Find a word»: правая кнопка поверх зажатой левой ничего не нажимает и не отпускает', async ({ page }) => {
  test.setTimeout(120_000);
  const start = await openField(page);
  const word = start.placements[0];
  const cells = wordCells(word);
  expect(cells.length, 'слову нужны четыре буквы: на третьей путь ещё не слово').toBeGreaterThan(3);
  const [a, b] = cells.map((cell) => spotOf(start.cells, cell));
  const wordSpots = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const far = start.cells.find((cell) => !wordSpots.has(`${cell.row}:${cell.col}`));
  expect(far, 'нужна чужая плитка').toBeDefined();

  // Левая зажата на первой букве и протянута на вторую.
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0, { steps: 6 });
  expect((await searchState(page)).path, 'протянули две буквы').toHaveLength(2);

  // Правая нажимается и отпускается над чужой плиткой, левая всё это время зажата.
  await page.mouse.move(far?.x ?? 0, far?.y ?? 0, { steps: 6 });
  await page.mouse.down({ button: 'right' });
  await settle(page, 200);
  const pressed = await searchState(page);
  expect(pressed.path, 'нажатие правой тронуло путь').toHaveLength(2);
  expect(
    pressed.cells.filter((cell) => cell.shaken),
    'нажатие правой над чужой плиткой: она дрожит',
  ).toEqual([]);
  await page.mouse.up({ button: 'right' });
  await settle(page, 200);
  const released = await searchState(page);
  expect(released.path, 'отпускание правой тронуло путь').toHaveLength(2);
  expect(
    released.cells.filter((cell) => cell.shaken),
    'отпускание правой над чужой плиткой: она дрожит как неверная',
  ).toEqual([]);
  await shot(page, 'search-second-button');

  // Жест левой жив: возвращаемся на вторую букву и ведём на третью.
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0, { steps: 6 });
  const c = spotOf(start.cells, cells[2]);
  await page.mouse.move(c?.x ?? 0, c?.y ?? 0, { steps: 6 });
  expect((await searchState(page)).path, 'после правой жест левой не продолжился').toHaveLength(3);
  await page.mouse.up();
});
