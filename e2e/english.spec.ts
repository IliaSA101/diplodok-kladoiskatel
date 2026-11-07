/**
 * «Make a word» руками ребёнка: слово набирается с клавиатуры.
 *
 * Плашки английской анаграммы строчные, а `letterCandidates` отдаёт заглавные
 * буквы, и сравнение «как есть» не совпадало никогда: ребёнок молотил по
 * клавишам, а слово не складывалось. В русском «Собери слово» буквы
 * заглавные, там всё работало, — поэтому поломку не видел ни один сценарий.
 */
import { expect, test } from '@playwright/test';
import { openGame, settle, shot, tap, waitScene } from './game';
import {
  dragAlong,
  openSearch,
  searchState,
  spotOf,
  startScene,
  tapCell,
  wordCells,
  type Spot,
} from './searchHelpers';

/**
 * Что напечатает клавиша в русской раскладке вместо латинской буквы.
 * Записано руками, по рядам ЙЦУКЕН, — не из кода игры.
 */
const RUSSIAN_KEY: Readonly<Record<string, string>> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
};

test('«Make a word» набирается с клавиатуры: латиницей и в русской раскладке', async ({ page }) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await page.evaluate(() => {
    window.game?.scene.getScene('Start').scene.start('EnglishAnagram', { setIndex: 0 });
  });
  await waitScene(page, 'EnglishAnagram');
  await settle(page, 2500);

  const wordState = (): Promise<{ index: number; word: string; done: boolean }> =>
    page.evaluate(() => {
      const scene = window.game?.scene.getScene('EnglishAnagram') as unknown as {
        wordIndex: number;
        word: string;
        wordDone: boolean;
      };
      return { index: scene.wordIndex, word: scene.word, done: scene.wordDone };
    });

  // Первое слово — латиницей, второе — клавишами русской раскладки, третье снова латиницей.
  for (const [round, russian] of [false, true, false].entries()) {
    await expect.poll(async () => (await wordState()).index).toBe(round);
    await expect.poll(async () => (await wordState()).done).toBe(false);
    const { word } = await wordState();
    // Пустое слово сделало бы проверку ниже согласной с чем угодно.
    expect(word.length, 'слово задачки пустое').toBeGreaterThan(1);
    await shot(page, `english-${round + 1}-before`);
    for (const letter of word) {
      const key = russian ? RUSSIAN_KEY[letter] : letter;
      expect(key, `нет клавиши для буквы ${letter}`).toBeDefined();
      if (russian) {
        // Playwright не знает кириллических клавиш: шлём то, что прислал бы браузер.
        await page.evaluate((k) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
        }, key ?? '');
      } else {
        await page.keyboard.press(key ?? '');
      }
    }
    await expect
      .poll(async () => (await wordState()).done, { message: `слово ${word} не набралось` })
      .toBe(true);
    await settle(page, 600);
    await shot(page, `english-${round + 1}-typed`);
    // Переход к следующему слову идёт по таймеру.
    await settle(page, 1800);
  }
});

test('«Find a word»: клики, протягивание, нажатие на выбранную, плитки не раздуваются, все слова — финиш', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await openSearch(page, { setIndex: 0, seed: 11 });

  const start = await searchState(page);
  const starts = new Set(start.placements.map((p) => `${p.row}:${p.col}`));
  expect(start.placements, 'в наборе пять слов').toHaveLength(5);
  await shot(page, 'search-1-start');

  // Самый длинный перевод — «Мы — друзья» у `are` (третья строка): не вылезает ли за панель.
  await page.mouse.move(1110, 396);
  await settle(page, 500);
  await shot(page, 'search-1b-hint-are');
  await page.mouse.move(640, 700);

  // Слова 1 и 3 ниже играются мышью (протягивание, нажатие на выбранную): их клетки
  // неверными кликами не трогаем, дрожь от такого клика спутала бы проверку
  // «после верного протягивания не дрожит».
  const key = (c: Spot): string => `${c.row}:${c.col}`;
  const played = new Set(
    [1, 3].flatMap((i) => (start.placements[i] === undefined ? [] : wordCells(start.placements[i]))).map(key),
  );
  const spare = start.cells.filter((c) => !starts.has(key(c)) && !played.has(key(c)));
  // Десять неверных кликов подряд по клеткам, где слово не начинается, и десять
  // нажатий-снятий первой буквы: масштаб каждой плитки должен вернуться к начальному.
  const wrong = spare.slice(0, 10);
  for (const cell of wrong) await tap(page, cell.x, cell.y);
  const first = start.placements[0];
  expect(first).toBeDefined();
  const firstCell = wordCells(first)[0];
  for (let i = 0; i < 5; i += 1) {
    await tapCell(page, start.cells, firstCell?.row ?? 0, firstCell?.col ?? 0);
    await tapCell(page, start.cells, firstCell?.row ?? 0, firstCell?.col ?? 0);
  }
  await settle(page, 600);
  const after = await searchState(page);
  expect(after.path, 'путь снят нажатиями по выбранной').toEqual([]);
  for (const cell of after.cells) {
    const was = start.cells.find((c) => c.row === cell.row && c.col === cell.col);
    expect(cell.scale, `плитка ${cell.row}:${cell.col} раздулась`).toBeCloseTo(was?.scale ?? 0, 5);
    expect(cell.textScale, `буква ${cell.row}:${cell.col} раздулась`).toBeCloseTo(
      was?.textScale ?? 0,
      5,
    );
  }
  await shot(page, 'search-2-after-wrong');

  // Нажал на неверную и протянул на другую неверную: дрожит одна, та, с которой начал.
  const rest = spare.slice(10);
  const from = rest.find((c) => rest.some((d) => d.row === c.row && d.col === c.col + 1));
  const to = rest.find((d) => d.row === from?.row && d.col === (from?.col ?? 0) + 1);
  expect(from, 'нет пары соседних клеток для проверки').toBeDefined();
  await dragAlong(page, start.cells, [from as Spot, to as Spot]);
  await settle(page, 300);
  const shaken = (await searchState(page)).cells.filter((c) => c.shaken);
  const touched = new Set([...wrong, from as Spot].map(key));
  expect(
    shaken.filter((c) => !touched.has(key(c))),
    'дрогла плитка, на которой всего лишь остановились',
  ).toEqual([]);
  expect(shaken.some((c) => c.row === from?.row && c.col === from?.col), 'начальная не дрогнула').toBe(
    true,
  );

  // Слово 3: протянул две буквы, отпустил, нажал на последнюю выбранную и дотянул.
  // Раньше нажатие снимало её сразу — буква гасла, а следующая дрожала.
  const fourth = wordCells(start.placements[3]);
  expect(fourth.length, 'слову нужна третья буква для этого шага').toBeGreaterThan(2);
  await dragAlong(page, start.cells, fourth.slice(0, 2));
  expect((await searchState(page)).path, 'две буквы выбраны').toHaveLength(2);
  const second = spotOf(start.cells, fourth[1]);
  await page.mouse.move(second.x, second.y);
  await page.mouse.down();
  expect((await searchState(page)).path, 'нажатие на выбранную путь не трогает').toHaveLength(2);
  await shot(page, 'search-2b-press-on-selected');
  for (const at of fourth.slice(2)) {
    const spot = spotOf(start.cells, at);
    await page.mouse.move(spot.x, spot.y, { steps: 6 });
  }
  await page.mouse.up();
  await expect.poll(async () => (await searchState(page)).found).toHaveLength(1);
  const afterFourth = await searchState(page);
  expect(
    afterFourth.cells.filter((c) => fourth.some((f) => f.row === c.row && f.col === c.col && c.shaken)),
    'буквы слова дрожали',
  ).toEqual([]);
  // Точка горит по числу найденных: слово было четвёртым в списке, а загорелась первая.
  expect(afterFourth.dots[0], 'первая точка не загорелась').not.toBe(start.dots[0]);
  expect(afterFourth.dots.slice(1), 'загорелась не первая точка').toEqual(start.dots.slice(1));
  await shot(page, 'search-2c-found-fourth');

  // Слово 0 — кликами, буква за буквой.
  for (const cell of wordCells(start.placements[0])) {
    await tapCell(page, start.cells, cell.row, cell.col);
  }
  await expect.poll(async () => (await searchState(page)).found).toHaveLength(2);

  // Слово 1 — протягиванием: нажал на первую, провёл по остальным, отпустил на последней.
  const second1 = wordCells(start.placements[1]);
  await dragAlong(page, start.cells, second1);
  await expect.poll(async () => (await searchState(page)).found).toHaveLength(3);
  // Кнопку отпустили на последней букве — это не «остановился на неверной»: плитка не дрожит.
  const last = second1[second1.length - 1];
  const released = (await searchState(page)).cells.find(
    (c) => c.row === last?.row && c.col === last?.col,
  );
  expect(released?.shaken, 'плитка дрожит после верного протягивания').toBe(false);
  await settle(page, 600);

  // Слово 2 — две буквы, и Esc снимает путь, оставаясь в игре; клик по выбранной
  // снимает её и всё после.
  const third = wordCells(start.placements[2]);
  await tapCell(page, start.cells, third[0]?.row ?? 0, third[0]?.col ?? 0);
  await tapCell(page, start.cells, third[1]?.row ?? 0, third[1]?.col ?? 0);
  expect((await searchState(page)).path).toHaveLength(2);
  await shot(page, 'search-3-path');
  await tapCell(page, start.cells, third[1]?.row ?? 0, third[1]?.col ?? 0);
  expect((await searchState(page)).path).toHaveLength(1);
  await tapCell(page, start.cells, third[1]?.row ?? 0, third[1]?.col ?? 0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await searchState(page)).path).toEqual([]);
  expect((await searchState(page)).scene).toContain('EnglishSearch');

  // Остальные — кликами; после последнего — финиш и возврат на экран ветки.
  for (const place of [start.placements[2], start.placements[4]]) {
    if (place === undefined) continue;
    for (const cell of wordCells(place)) await tapCell(page, start.cells, cell.row, cell.col);
  }
  await shot(page, 'search-4-all-found');
  await waitScene(page, 'English');
});

test('«Find a word» и «Make a word»: без seed каждый заход свой, с seed — один и тот же', async ({
  page,
}) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);

  const fieldAfterOpening = async (seed?: number): Promise<string> => {
    await page.evaluate((payload) => {
      const game = window.game;
      for (const live of game?.scene.getScenes(true) ?? []) {
        if (live.scene.key !== 'Start') game?.scene.stop(live.scene.key);
      }
      game?.scene.getScene('Start').scene.start('EnglishSearch', payload);
    }, seed === undefined ? { setIndex: 0 } : { setIndex: 0, seed });
    await waitScene(page, 'EnglishSearch');
    await settle(page, 600);
    return (await searchState(page)).letters.map((row) => row.join('')).join('|');
  };

  const a = await fieldAfterOpening();
  const b = await fieldAfterOpening();
  expect(a, 'два захода без seed дали одно и то же поле').not.toBe(b);
  const c = await fieldAfterOpening(5);
  const d = await fieldAfterOpening(5);
  expect(c, 'с одним seed поле то же').toBe(d);

  // «Make a word»: плитки слова.
  const poolAfterOpening = async (seed?: number): Promise<string> => {
    await page.evaluate((payload) => {
      const game = window.game;
      for (const live of game?.scene.getScenes(true) ?? []) {
        if (live.scene.key !== 'Start') game?.scene.stop(live.scene.key);
      }
      game?.scene.getScene('Start').scene.start('EnglishAnagram', payload);
    }, seed === undefined ? { setIndex: 0 } : { setIndex: 0, seed });
    await waitScene(page, 'EnglishAnagram');
    await settle(page, 600);
    return page.evaluate(() => {
      const scene = window.game?.scene.getScene('EnglishAnagram') as unknown as {
        tiles: { char: string }[];
      };
      return scene.tiles.map((tile) => tile.char).join('');
    });
  };
  const seen = new Set<string>();
  for (let i = 0; i < 4; i += 1) seen.add(await poolAfterOpening());
  expect(seen.size, 'плитки «Make a word» каждый заход те же').toBeGreaterThan(1);
  expect(await poolAfterOpening(9)).toBe(await poolAfterOpening(9));
  await shot(page, 'anagram-fresh');
});

/**
 * Esc в паузе после последнего слова. Набор засчитывался на финале, а Esc в
 * первые секунды уходил раньше, — и ребёнок, выбежавший из игры в самый миг
 * победы, терял набор (002-22). Теперь запись идёт в тот миг, когда найдено
 * последнее слово.
 */
test('Esc сразу после последнего слова засчитывает набор во всех английских играх', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);

  // Ключ — тот же, что у `englishSave`; запись «набор:игра».
  const done = (): Promise<string[]> =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('diplodok-kladoiskatel:v3:english-done') ?? '[]') as string[],
    );
  /** Сцена ещё стоит, а звезды «Well done!» на ней нет: пауза, ради которой тест. */
  const inPause = (sceneKey: string): Promise<boolean> =>
    page.evaluate((keyName) => {
      const scene = window.game?.scene.getScene(keyName);
      const texts = (scene?.children.list ?? []) as { text?: string }[];
      return scene?.scene.isActive() === true && !texts.some((item) => item.text === 'Well done!');
    }, sceneKey);

  // Find a word. Сперва четыре слова из пяти и Esc: набор ещё не пройден и засчитан
  // быть не должен (иначе запись шла бы на любом слове, и тест выше этого не заметил).
  await startScene(page, 'EnglishSearch', { setIndex: 0, seed: 11 });
  await settle(page, 1200);
  const early = await searchState(page);
  expect(early.placements, 'в наборе пять слов').toHaveLength(5);
  for (const place of early.placements.slice(0, 4)) {
    for (const cell of wordCells(place)) await tapCell(page, early.cells, cell.row, cell.col);
  }
  expect((await searchState(page)).found, 'четыре слова найдены').toHaveLength(4);
  expect(await done(), 'набор засчитан после четырёх слов из пяти').not.toContain('first:search');
  // Путь пуст: один Esc выводит из игры, а не снимает путь.
  await page.keyboard.press('Escape');
  await waitScene(page, 'English');
  expect(await done(), 'Esc после четырёх слов засчитал Find a word').not.toContain('first:search');

  // Теперь все слова кликами, Esc тут же.
  await startScene(page, 'EnglishSearch', { setIndex: 0, seed: 11 });
  await settle(page, 1200);
  const field = await searchState(page);
  for (const place of field.placements) {
    for (const cell of wordCells(place)) await tapCell(page, field.cells, cell.row, cell.col);
  }
  expect(await inPause('EnglishSearch'), 'пауза до звезды уже кончилась — тест ничего не проверяет').toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await waitScene(page, 'English');
  expect(await done(), 'Find a word не засчитан').toContain('first:search');

  // Make a word: пять слов с клавиатуры, Esc сразу после последнего.
  await startScene(page, 'EnglishAnagram', { setIndex: 0 });
  await settle(page, 2000);
  const anagram = (): Promise<{ index: number; word: string; done: boolean }> =>
    page.evaluate(() => {
      const scene = window.game?.scene.getScene('EnglishAnagram') as unknown as {
        wordIndex: number;
        word: string;
        wordDone: boolean;
        words: unknown[];
      };
      return { index: scene.wordIndex, word: scene.word, done: scene.wordDone };
    });
  for (let round = 0; round < 5; round += 1) {
    await expect.poll(async () => (await anagram()).index).toBe(round);
    await expect.poll(async () => (await anagram()).done).toBe(false);
    for (const letter of (await anagram()).word) await page.keyboard.press(letter);
    if (round < 4) {
      await expect.poll(async () => (await anagram()).index, { timeout: 20_000 }).toBe(round + 1);
      // Слова 1–4 набор не засчитывают: только последнее.
      expect(await done(), `набор засчитан после слова ${round + 1} из 5`).not.toContain('first:anagram');
    }
  }
  await expect.poll(async () => (await anagram()).done).toBe(true);
  expect(await inPause('EnglishAnagram'), 'пауза до звезды уже кончилась').toBe(true);
  await page.keyboard.press('Escape');
  await waitScene(page, 'English');
  expect(await done(), 'Make a word не засчитан').toContain('first:anagram');

  // Catch letters: шарики ловить долго, поэтому слово засчитываем тем же ходом,
  // каким его закрывает игра. Сперва первое слово из нескольких и Esc: набор
  // не засчитан. Потом последнее — и засчитан.
  await startScene(page, 'EnglishCatch', { setIndex: 0 });
  await settle(page, 2000);
  await page.evaluate(() => {
    const scene = window.game?.scene.getScene('EnglishCatch') as unknown as {
      words: unknown[];
      wordIndex: number;
      onWordSolved(): void;
    };
    if (scene.words.length < 2) throw new Error('в наборе одно слово: проверка ничего не значит');
    scene.wordIndex = 0;
    scene.onWordSolved();
  });
  await page.keyboard.press('Escape');
  await waitScene(page, 'English');
  expect(await done(), 'Esc после первого слова засчитал Catch letters').not.toContain('first:catch');

  await startScene(page, 'EnglishCatch', { setIndex: 0 });
  await settle(page, 2000);
  await page.evaluate(() => {
    const scene = window.game?.scene.getScene('EnglishCatch') as unknown as {
      words: unknown[];
      wordIndex: number;
      onWordSolved(): void;
    };
    scene.wordIndex = scene.words.length - 1;
    scene.onWordSolved();
  });
  expect(await inPause('EnglishCatch'), 'пауза до звезды уже кончилась').toBe(true);
  await page.keyboard.press('Escape');
  await waitScene(page, 'English');
  expect(await done(), 'Catch letters не засчитан').toContain('first:catch');
});

/**
 * Перевод `are` — «Мы — друзья» — шире кружка «?» и ложился бы на картинку слова.
 * На время перевода картинка гаснет (`onToggle` у кнопки в словаре).
 */
test('словарь набора: пока открыт перевод «Мы — друзья», картинка слова are погашена', async ({
  page,
}) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await startScene(page, 'English', { setIndex: 0 });
  await settle(page, 1500);

  const state = (): Promise<{ picture: number | null; translation: number | null }> =>
    page.evaluate(() => {
      const scene = window.game?.scene.getScene('English');
      const list = (scene?.children.list ?? []) as unknown as {
        alpha: number;
        text?: string;
        texture?: { key: string };
      }[];
      const picture = list.find((item) => item.texture?.key === 'en-are');
      const translation = list.find((item) => item.text === 'Мы — друзья');
      return { picture: picture?.alpha ?? null, translation: translation?.alpha ?? null };
    });

  const before = await state();
  expect(before.picture, 'в словаре нет картинки слова are').toBe(1);
  expect(before.translation, 'перевод не нарисован').toBe(0);
  await shot(page, 'vocab-are-closed');

  // Третье слово набора: кнопка «?» справа от его картинки (раскладка словаря в сцене).
  await page.mouse.move(668, 300);
  await expect
    .poll(async () => (await state()).picture, { message: 'картинка are не погасла' })
    .toBe(0);
  await expect.poll(async () => (await state()).translation).toBe(1);
  await shot(page, 'vocab-are-open');

  await page.mouse.move(640, 650);
  await expect.poll(async () => (await state()).picture, { message: 'картинка не вернулась' }).toBe(1);
  await expect.poll(async () => (await state()).translation).toBe(0);
  await shot(page, 'vocab-are-closed-again');
});

test('кружок 6 → «Make a word» → семь букв `brother` набираются с клавиатуры → набор записан', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await page.evaluate(() => {
    window.game?.scene.getScene('Start').scene.start('English', { setIndex: 0 });
  });
  await waitScene(page, 'English');
  await settle(page, 1200);
  await shot(page, 'english-sets-1-hub');

  // Шесть кружков по шагу 88 вокруг середины экрана: шестой — x 640 + 2.5 × 88.
  await tap(page, 640 + 2.5 * 88, 124);
  await settle(page, 1200);
  await shot(page, 'english-sets-2-family');
  // Первая карточка — «Make a word».
  await tap(page, 640 - 400, 478);
  await waitScene(page, 'EnglishAnagram');
  await settle(page, 2500);

  const wordState = (): Promise<{ index: number; word: string; done: boolean }> =>
    page.evaluate(() => {
      const scene = window.game?.scene.getScene('EnglishAnagram') as unknown as {
        wordIndex: number;
        word: string;
        wordDone: boolean;
      };
      return { index: scene.wordIndex, word: scene.word, done: scene.wordDone };
    });

  const seen: string[] = [];
  for (let round = 0; round < 5; round += 1) {
    await expect.poll(async () => (await wordState()).index).toBe(round);
    await expect.poll(async () => (await wordState()).done).toBe(false);
    const { word } = await wordState();
    seen.push(word);
    if (word === 'brother') await shot(page, 'english-sets-3-brother-before');
    for (const letter of word) await page.keyboard.press(letter);
    await expect
      .poll(async () => (await wordState()).done, { message: `слово ${word} не набралось` })
      .toBe(true);
    if (word === 'brother') await shot(page, 'english-sets-4-brother-typed');
    // Следующее слово или финал — по таймеру.
    await settle(page, 1800);
  }
  expect(seen).toEqual(['mum', 'dad', 'baby', 'sister', 'brother']);

  await expect
    .poll(
      () =>
        page.evaluate(() => localStorage.getItem('diplodok-kladoiskatel:v3:english-done') ?? ''),
      { message: 'набор «Family» не записан пройденным' },
    )
    .toContain('family:anagram');
});
