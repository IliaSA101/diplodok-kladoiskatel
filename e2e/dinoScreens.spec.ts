/**
 * Диплодок на выборе леса, в «Моих сокровищах» и в альбоме наклеек (И6).
 *
 * Тест `tests/dinoSpots.test.ts` держит его место числами, а то, что сцена
 * его вообще поставила (и поставила в контейнер, который «выпрыгивает»),
 * видно только в живой игре. Кадры — `art-work/e2e/dino-screens-*.png`.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, settle, shot, waitScene } from './game';

/** Сколько раз в дереве объектов сцены (с контейнерами) стоит рисунок целого диплодока. */
const wholeDinoCount = (page: Page, key: string): Promise<number> =>
  page.evaluate((sceneKey): number => {
    const scene = window.game?.scene.getScene(sceneKey);
    if (scene === undefined || scene === null) return -1;
    let count = 0;
    const walk = (objects: readonly unknown[]): void => {
      for (const object of objects) {
        const node = object as { texture?: { key?: string }; list?: unknown[] };
        if (node.texture?.key === 'dino-whole') count += 1;
        if (Array.isArray(node.list)) walk(node.list);
      }
    };
    walk(scene.children.list);
    return count;
  }, key);

const startScene = (page: Page, key: string, data?: object): Promise<void> =>
  page.evaluate(
    ([sceneKey, sceneData]) => {
      const current = window.game?.scene.getScenes(true)[0];
      current?.scene.start(sceneKey, sceneData);
    },
    [key, data] as const,
  );

test('диплодок стоит на выборе леса, в альбоме наклеек и в сокровищах, всё собрано — подпрыгивает', async ({ page }) => {
  await openGame(page);
  await waitScene(page, 'Start');
  // Всё пройдено и собрано: именно тогда диплодок радуется. Модули берём теми же
  // адресами, что у игры, — это те же экземпляры и то же хранилище.
  await page.evaluate(async () => {
    // Путь — переменной: сборка и tsc не должны пытаться его разрешить.
    const base = '/diplodok-kladoiskatel/src/';
    const quest = (await import(/* @vite-ignore */ `${base}systems/questSave.ts`)) as {
      questSave: { markSolved(nodeId: string, sticker: string): void };
    };
    const progress = (await import(/* @vite-ignore */ `${base}systems/save.ts`)) as {
      save: { markLevelComplete(level: number): void };
    };
    const keys = (await import(/* @vite-ignore */ `${base}art/keys.ts`)) as {
      TEX: { STICKER: string[] };
    };
    keys.TEX.STICKER.forEach((key, i) => quest.questSave.markSolved(`dino-${i}`, key));
    for (let n = 1; n <= 8; n += 1) progress.save.markLevelComplete(n);
  });

  for (const [scene, name] of [
    ['Levels', 'levels'],
    ['Album', 'album'],
  ] as const) {
    await startScene(page, scene);
    await waitScene(page, scene);
    await settle(page, 1000);
    expect(await wholeDinoCount(page, scene), `диплодок на экране ${scene}`).toBe(1);
    await shot(page, `dino-screens-${name}`);
  }

  // «Мои сокровища»: сетка на панели, диплодок справа внизу. Найдена часть
  // предметов (радости нет) — проверяем, что сцена его вообще поставила.
  await startScene(page, 'Collection', {
    level: 1,
    itemIds: ['key', 'amber', 'bone', 'ring', 'starstone'],
    foundItemIds: ['key', 'amber'],
  });
  await waitScene(page, 'Collection');
  await settle(page, 1000);
  expect(await wholeDinoCount(page, 'Collection'), 'диплодок на экране Collection').toBe(1);
  await shot(page, 'dino-screens-collection');
});
