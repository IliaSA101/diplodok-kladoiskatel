/**
 * Футбольный квест руками ребёнка: клики по экрану и набор с клавиатуры.
 *
 * Координаты — те, что на экране: карточка «Футбол» на стартовом экране,
 * узлы — места дорожки стадиона (TRACK в src/data/quest.ts).
 */
import { expect, test } from '@playwright/test';
import { activeScenes, openGame, settle, shot, tap, waitScene } from './game';

/** Карточка «Футбол» — средняя из трёх внизу стартового экрана. */
const FOOTBALL_CARD = { x: 640, y: 585 };
/** Первое и восьмое места дорожки (TRACK[0], TRACK[7]). */
const NODE_1 = { x: 190, y: 530 };
const NODE_8 = { x: 1180, y: 330 };
/** Круглая кнопка «назад» в левом верхнем углу задачки. */
const BACK_BUTTON = { x: 80, y: 80 };

const SOLVED_KEY = 'diplodok-kladoiskatel:v3:quest-solved';

/**
 * Русская буква → клавиша, на которой она сидит в ЙЦУКЕН.
 *
 * Набираем латиницей нарочно: так играет ребёнок, который не умеет
 * переключать раскладку, и это самый трудный путь для letterInput.ts.
 * Таблица переписана здесь заново, а не взята из кода: иначе тест
 * согласился бы с любой ошибкой в ней.
 */
const KEY_FOR: Readonly<Record<string, string>> = {
  Й: 'q', Ц: 'w', У: 'e', К: 'r', Е: 't', Н: 'y', Г: 'u', Ш: 'i', Щ: 'o', З: 'p',
  Х: '[', Ъ: ']', Ф: 'a', Ы: 's', В: 'd', А: 'f', П: 'g', Р: 'h', О: 'j', Л: 'k',
  Д: 'l', Ж: ';', Э: "'", Я: 'z', Ч: 'x', С: 'c', М: 'v', И: 'b', Т: 'n', Ь: 'm',
  Б: ',', Ю: '.',
};

test('с главного экрана кликами — в первую задачку квеста и обратно', async ({ page }) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page);
  await shot(page, 'quest-01-start');

  await tap(page, FOOTBALL_CARD.x, FOOTBALL_CARD.y);
  await waitScene(page, 'QuestMap');
  await settle(page, 2500);
  await shot(page, 'quest-02-map');

  await tap(page, NODE_1.x, NODE_1.y);
  // Первый узел первого круга — маджонг (ROUND_KINDS в src/data/quest.ts).
  await waitScene(page, 'PuzzleMahjong');
  await settle(page, 2500);
  await shot(page, 'quest-03-mahjong');
  expect(await activeScenes(page)).not.toContain('QuestMap');

  await tap(page, BACK_BUTTON.x, BACK_BUTTON.y);
  await waitScene(page, 'QuestMap');
  expect(await activeScenes(page)).not.toContain('PuzzleMahjong');
});

test('«Собери слово» набирается с клавиатуры в английской раскладке', async ({ page }) => {
  // Первые семь узлов решены — открыт восьмой, «Собери слово».
  const solved = Array.from({ length: 7 }, (_, i) => `q${i + 1}`);
  await openGame(page, { [SOLVED_KEY]: solved });
  await waitScene(page, 'Start');
  await settle(page);
  await tap(page, FOOTBALL_CARD.x, FOOTBALL_CARD.y);
  await waitScene(page, 'QuestMap');
  await settle(page, 2500);
  await tap(page, NODE_8.x, NODE_8.y);
  await waitScene(page, 'PuzzleWord');
  await settle(page, 2500);

  const wordState = (): Promise<{ index: number; word: string; done: boolean }> =>
    page.evaluate(() => {
      const scene = window.game?.scene.getScene('PuzzleWord') as unknown as {
        wordIndex: number;
        word: string;
        wordDone: boolean;
      };
      return { index: scene.wordIndex, word: scene.word, done: scene.wordDone };
    });

  for (let round = 0; round < 3; round += 1) {
    await expect.poll(async () => (await wordState()).index).toBe(round);
    await expect.poll(async () => (await wordState()).done).toBe(false);
    const { word } = await wordState();
    // Пустое слово сделало бы проверку ниже согласной с чем угодно.
    expect(word.length, 'слово задачки пустое').toBeGreaterThan(1);
    await shot(page, `word-${round + 1}-before`);
    for (const letter of word) {
      const key = KEY_FOR[letter];
      expect(key, `нет клавиши для буквы ${letter}`).toBeDefined();
      await page.keyboard.press(key ?? '');
    }
    await expect.poll(async () => (await wordState()).done).toBe(true);
    await settle(page, 600);
    await shot(page, `word-${round + 1}-typed`);
  }

  // Три слова — задачка решена, узел записан в сохранение.
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], SOLVED_KEY),
    )
    .toContain('q8');
  await settle(page, 2500);
  await shot(page, 'word-4-finished');
});
