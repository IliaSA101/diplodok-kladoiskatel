/**
 * Лес руками ребёнка: войти, выйти «назад», войти снова — и побегать.
 *
 * Phaser при повторном входе зовёт `create` у того же объекта сцены, и поле
 * `busy = true`, поставленное кнопкой «назад», замораживало второй лес:
 * ни клика по траве, ни ходьбы, ни выхода. Секретный сундук, зажжённый в
 * одном лесу, горел сразу в следующем. Чистая логика этого не видит —
 * нужна живая сцена.
 */
import { expect, test, type Page } from '@playwright/test';
import { activeScenes, openGame, settle, shot, tap, waitScene } from './game';

/** Кнопка-карта «Леса» в меню (справа, под «Играть»). */
const MAP_BUTTON = { x: 1172, y: 539 };
/** Карточка «Лес с кладами» — первая из трёх внизу стартового экрана. */
const FOREST_CARD = { x: 240, y: 584 };
/** Круглая кнопка «назад» в левом верхнем углу. */
const BACK_BUTTON = { x: 98, y: 98 };
/** Лес 8 в сетке «Выбери лес»: четыре в ряд, шаг 230×235. */
const FOREST_8 = { x: 985, y: 440 };
/** Кнопка «Следующий лес» на экране победы. */
const NEXT_FOREST = { x: 768, y: 548 };

interface ForestState {
  busy: boolean;
  secretLit: boolean;
  /** Кнопка действия нажимается (то, что видит ребёнок: тёплая или спокойная). */
  actionEnabled: boolean;
  level: number;
  dino: [number, number];
}

/** Ставит диплодока на секретный сундук леса. */
const standOnSecret = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const scene = window.game?.scene.getScene('Forest') as unknown as {
      world: { treasures: { x: number; y: number; kind: string }[] };
      dinoX: number;
      dinoY: number;
    };
    const secret = scene.world.treasures.find((t) => t.kind === 'secret');
    scene.dinoX = secret?.x ?? 0;
    scene.dinoY = secret?.y ?? 0;
  });

const forestState = (page: Page): Promise<ForestState> =>
  page.evaluate(() => {
    const scene = window.game?.scene.getScene('Forest') as unknown as {
      busy: boolean;
      secretLit: boolean;
      hud: { actionEnabled: boolean };
      level: { number: number };
      dinoX: number;
      dinoY: number;
    };
    return {
      busy: scene.busy,
      secretLit: scene.secretLit,
      actionEnabled: scene.hud.actionEnabled,
      level: scene.level.number,
      dino: [Math.round(scene.dinoX), Math.round(scene.dinoY)],
    };
  });

test('лес 8: «назад» и снова лес 8 — диплодок идёт на клик, «назад» выводит в «Выбери лес»', async ({
  page,
}) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page);
  await tap(page, FOREST_CARD.x, FOREST_CARD.y);
  await waitScene(page, 'Menu');
  await settle(page, 1200);
  await tap(page, MAP_BUTTON.x, MAP_BUTTON.y);
  await waitScene(page, 'Levels');
  await settle(page, 1200);

  await tap(page, FOREST_8.x, FOREST_8.y);
  await waitScene(page, 'Forest');
  await settle(page, 1200);
  expect((await forestState(page)).level).toBe(8);
  await shot(page, 'forest-01-first-entry');

  await tap(page, BACK_BUTTON.x, BACK_BUTTON.y);
  await waitScene(page, 'Levels');
  await settle(page, 1200);

  await tap(page, FOREST_8.x, FOREST_8.y);
  await waitScene(page, 'Forest');
  await settle(page, 1500);
  const before = await forestState(page);
  expect(before.level).toBe(8);
  expect(before.busy, 'после «назад» лес не должен оставаться занятым').toBe(false);

  // Клик по траве левее и ниже старта: диплодок должен пойти.
  await tap(page, 300, 600);
  await expect
    .poll(async () => (await forestState(page)).dino.join(), { message: 'диплодок стоит на месте' })
    .not.toBe(before.dino.join());
  await settle(page, 600);
  await shot(page, 'forest-02-second-entry-walked');

  await tap(page, BACK_BUTTON.x, BACK_BUTTON.y);
  await waitScene(page, 'Levels');
  expect(await activeScenes(page)).not.toContain('Forest');
});

test('секретный сундук не зажигается в следующем лесу после победы', async ({ page }) => {
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await page.evaluate(() => {
    window.game?.scene.getScene('Start').scene.start('Forest', { level: 1 });
  });
  await waitScene(page, 'Forest');
  await settle(page, 800);

  // Все обычные клады леса 1 найдены; перезапускаем лес с таким сохранением.
  await page.evaluate(() => {
    const scene = window.game?.scene.getScene('Forest') as unknown as {
      world: { treasures: { id: string; kind: string }[] };
      scene: { restart: (data: { level: number }) => void };
    };
    const ids = scene.world.treasures.filter((t) => t.kind !== 'secret').map((t) => t.id);
    localStorage.setItem('diplodok-kladoiskatel:v2:levels', JSON.stringify({ 1: ids }));
    scene.scene.restart({ level: 1 });
  });
  await settle(page, 1500);
  expect((await forestState(page)).secretLit, 'в лесу 1 всё найдено — сундук горит').toBe(true);

  // Диплодок у секретного сундука: кнопка горит, действие — победа.
  await standOnSecret(page);
  await settle(page, 400);
  expect((await forestState(page)).actionEnabled, 'у горящего сундука кнопка нажимается').toBe(true);
  await page.evaluate(() => {
    (window.game?.scene.getScene('Forest') as unknown as { performAction: () => void }).performAction();
  });
  // Корона лежит в рюкзаке, а победа ещё впереди (пауза 700 мс): «назад» в это
  // окно раньше уводила в «Выбери лес» мимо экрана победы.
  await page.waitForFunction(
    () => {
      const scene = window.game?.scene.getScene('Forest') as unknown as {
        world: { treasures: { id: string; kind: string }[] };
        foundIds: Set<string>;
      };
      const secret = scene.world.treasures.find((t) => t.kind === 'secret');
      return secret !== undefined && scene.foundIds.has(secret.id);
    },
    undefined,
    { polling: 20, timeout: 20000 },
  );
  await page.keyboard.press('Escape');
  // Нажатие обязано лечь в окно до победы: в Victory Esc не слушают, и поздний
  // Esc прошёл бы этот тест, ничего не проверив (повторное ревью 1.1.1).
  expect(await activeScenes(page), 'Esc пришёл уже после ухода из леса').toContain('Forest');
  await waitScene(page, 'Victory');
  await settle(page, 1800);
  expect(await activeScenes(page), 'после Esc победа всё равно показана').not.toContain('Levels');
  await shot(page, 'forest-03-victory');

  await tap(page, NEXT_FOREST.x, NEXT_FOREST.y);
  await waitScene(page, 'Forest');
  await settle(page, 1500);
  const next = await forestState(page);
  expect(next.level).toBe(2);
  expect(next.secretLit, 'в новом лесу клады ещё не найдены — сундук не горит').toBe(false);
  expect(next.busy).toBe(false);

  // Рядом с секретным сундуком нового леса кнопка выключена: он ещё не горит.
  await standOnSecret(page);
  await settle(page, 600);
  expect((await forestState(page)).actionEnabled, 'сундук не горит — кнопка спокойная').toBe(false);
  await shot(page, 'forest-04-next-forest');
});

test('обычный клад: после находки лес снова слушается, Esc выводит в «Выбери лес»', async ({ page }) => {
  // busy поднимается на время находки и снимается в конце revealTreasure. Если снятие
  // пропадёт, лес замрёт после первого же клада — а ни один другой тест обычный клад
  // не находит (повторное ревью 1.1.1).
  await openGame(page);
  await waitScene(page, 'Start');
  await settle(page, 1000);
  await page.evaluate(() => {
    window.game?.scene.getScene('Start').scene.start('Forest', { level: 1 });
  });
  await waitScene(page, 'Forest');
  await settle(page, 800);

  const id = await page.evaluate(() => {
    const scene = window.game?.scene.getScene('Forest') as unknown as {
      world: { treasures: { id: string; kind: string; x: number; y: number }[] };
      dinoX: number;
      dinoY: number;
    };
    const ground = scene.world.treasures.find((t) => t.kind === 'ground');
    if (ground === undefined) return null;
    scene.dinoX = ground.x;
    scene.dinoY = ground.y;
    return ground.id;
  });
  expect(id, 'в лесу 1 есть клад в земле').not.toBeNull();
  await settle(page, 400);
  expect((await forestState(page)).actionEnabled, 'у клада кнопка «копать» нажимается').toBe(true);

  // Копаем, пока клад не найден: число ударов задаёт лес (digTaps).
  for (let i = 0; i < 20; i += 1) {
    const found = await page.evaluate((treasureId) => {
      const scene = window.game?.scene.getScene('Forest') as unknown as {
        foundIds: Set<string>;
        performAction: () => void;
      };
      if (scene.foundIds.has(treasureId)) return true;
      scene.performAction();
      return false;
    }, id as string);
    if (found) break;
    await settle(page, 150);
  }
  await expect
    .poll(async () => (await forestState(page)).busy, { message: 'после находки лес остался занятым', timeout: 20000 })
    .toBe(false);
  await shot(page, 'forest-05-ground-found');

  await page.keyboard.press('Escape');
  await waitScene(page, 'Levels');
  expect(await activeScenes(page)).not.toContain('Forest');
});
