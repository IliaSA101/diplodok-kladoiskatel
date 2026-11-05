/**
 * «Make a word» руками ребёнка: слово набирается с клавиатуры.
 *
 * Плашки английской анаграммы строчные, а `letterCandidates` отдаёт заглавные
 * буквы, и сравнение «как есть» не совпадало никогда: ребёнок молотил по
 * клавишам, а слово не складывалось. В русском «Собери слово» буквы
 * заглавные, там всё работало, — поэтому поломку не видел ни один сценарий.
 */
import { expect, test } from '@playwright/test';
import { openGame, settle, shot, waitScene } from './game';

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
