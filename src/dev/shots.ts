/**
 * Обход всех экранов со съёмкой в файлы — только в режиме разработки.
 *
 * Правка сцены обязана кончаться взглядом в браузер, но взгляд стоил десяти
 * действий на экран, и поэтому пропускался. Хвост диплодока трижды уехал в
 * игру обрубком именно так. Теперь один адрес
 *
 *     http://localhost:5173/diplodok-kladoiskatel/?shots
 *
 * прогоняет все экраны подряд и кладёт каждый кадр в `art-work/shots/` —
 * в натуральную величину 1280×720, а не ужатым вдвое, как скриншот панели
 * браузера. На ужатом ни ровного среза, ни лесенки на глазу не видно.
 *
 * Кадры пишет middleware из `vite.config.ts`, а рядом с ними ложится
 * `_stamp.json` — по нему хук `.claude/hooks/before-stop.mjs` и понимает,
 * смотрели ли экраны после последней правки.
 *
 * Берём всегда **крайний** вариант задачки: самый большой стол, самое длинное
 * слово, самый полный альбом. На первом варианте всё всегда хорошо.
 */
import type Phaser from 'phaser';
import { ENGLISH_SETS } from '../data/english';
import { LEVELS, getLevel } from '../data/levels';
import { SECRET_ITEM_ID } from '../data/treasures';
import { generateWorld } from '../systems/worldGen';
import { SCENE } from '../types';

/** Один снимок: как назвать файл, какую сцену поднять и с чем. */
interface Shot {
  name: string;
  scene: string;
  data?: object;
  /** Сколько ждать раскладки до снимка, мс. Больше — у медленных экранов. */
  settle?: number;
}

/**
 * Сколько ждать, пока экран уляжется, мс.
 *
 * Две секунды, а не полсекунды: на первом прогоне кадры поймали буквы и
 * варианты ответа **в полёте** — плитки ещё съезжались, и экран выглядел
 * полупустым. Снимок на влёте врёт ровно так же, как ужатый скриншот.
 */
const SETTLE_MS = 2000;

/**
 * Самый большой лес — по его собственному номеру, а не по индексу в массиве.
 *
 * `getLevel` принимает номер с единицы, и `LEVELS.length - 1` давало лес
 * номер семь: обход, который заведён ровно затем, чтобы смотреть крайний
 * вариант, сам брал предпоследний.
 */
const LAST_LEVEL = LEVELS[LEVELS.length - 1]?.number ?? 1;
/** А вот набор английских слов — именно индекс, с нуля. */
const LAST_ENGLISH = ENGLISH_SETS.length - 1;

/** Предметы самого большого леса — те же, что увидит ребёнок, пройдя его. */
function lastForestItems(): string[] {
  return generateWorld(getLevel(LAST_LEVEL)).itemIds;
}

/** Задачка квеста на самой высокой ступени — там, где раскладка уже тесная. */
function puzzle(name: string, scene: string, kind: string, step: number, variant: number): Shot {
  return {
    name,
    scene,
    data: { nodeId: `shots-${name}`, variant, sticker: 'sticker-ball', kind, step },
  };
}

const SHOTS: readonly Shot[] = [
  { name: '01-start', scene: SCENE.START },
  { name: '02-menu', scene: SCENE.MENU },
  { name: '03-levels', scene: SCENE.LEVELS },
  { name: '04-forest', scene: SCENE.FOREST, data: { level: LAST_LEVEL }, settle: 3000 },
  {
    name: '05-collection',
    scene: SCENE.COLLECTION,
    // Пустыми списками эти два экрана снимались белыми, и «посмотрели»
    // означало «посмотрели на пустую панель». Предметы берём настоящие —
    // тем же генератором, которым их берёт лес.
    data: {
      level: LAST_LEVEL,
      itemIds: lastForestItems(),
      foundItemIds: lastForestItems().slice(0, 3),
    },
  },
  {
    name: '06-victory',
    scene: SCENE.VICTORY,
    data: {
      level: LAST_LEVEL,
      itemIds: lastForestItems().filter((id) => id !== SECRET_ITEM_ID),
      crownItemId: SECRET_ITEM_ID,
    },
    settle: 3000,
  },
  { name: '07-quest-map', scene: SCENE.QUEST_MAP, settle: 3000 },
  puzzle('08-sudoku', SCENE.PUZZLE_SUDOKU, 'sudoku', 8, 7),
  puzzle('09-mahjong', SCENE.PUZZLE_MAHJONG, 'mahjong', 8, 8),
  puzzle('10-word', SCENE.PUZZLE_WORD, 'word', 8, 6),
  puzzle('11-quiz', SCENE.PUZZLE_QUIZ, 'quiz', 8, 7),
  puzzle('12-memory', SCENE.PUZZLE_MEMORY, 'memory', 8, 7),
  puzzle('13-count', SCENE.PUZZLE_COUNT, 'count', 8, 3),
  puzzle('14-pattern', SCENE.PUZZLE_PATTERN, 'pattern', 8, 1),
  puzzle('15-sequence', SCENE.PUZZLE_SEQUENCE, 'sequence', 8, 1),
  { name: '16-album', scene: SCENE.ALBUM },
  { name: '17-english', scene: SCENE.ENGLISH, data: { setIndex: LAST_ENGLISH } },
  { name: '18-english-anagram', scene: SCENE.ENGLISH_ANAGRAM, data: { setIndex: LAST_ENGLISH } },
  { name: '19-english-search', scene: SCENE.ENGLISH_SEARCH, data: { setIndex: LAST_ENGLISH } },
  { name: '20-english-catch', scene: SCENE.ENGLISH_CATCH, data: { setIndex: LAST_ENGLISH } },
];

/**
 * Шаг очереди задач, который браузер не тормозит в фоновой вкладке.
 *
 * `setTimeout` там зажимается до секунды, и обход двадцати экранов растягивался
 * на полчаса — выглядело как зависший обход. У `MessageChannel` такого зажима
 * нет, а макрозадачей он остаётся: загрузчик и `fetch` между шагами успевают.
 */
const tick = (): Promise<void> =>
  new Promise((done) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (): void => done();
    channel.port2.postMessage(0);
  });

/**
 * Прокрутить кадры руками.
 *
 * В фоновой вкладке rAF не вызывается, и Phaser стоит: сцена не стартует,
 * снимок не приходит, и всё это выглядит как зависшая игра. `game.loop.step()`
 * тут не годится — он берёт время сам и присылает в сцены `delta = NaN`.
 *
 * Часы продолжают часы самой игры, а не начинаются с нуля: часы сцены берут
 * время как есть, и прыжок назад на минуту вешает все `delayedCall` — экран
 * тогда застывает на полпути, с половиной плиток в полёте.
 */
const FRAME_MS = 16.67;

/**
 * Дать экрану улечься: крутим кадры ровно по настоящим часам.
 *
 * Просто прокрутить N кадров подряд не выходит: часть анимаций Phaser идёт не
 * от той дельты, которую мы передаём, а от реального времени. На быстрой
 * прокрутке они почти не двигались, и кадры ловили плитки в полёте — экран
 * выглядел полупустым. Просто подождать тоже нельзя: в фоновой вкладке rAF не
 * вызывается, и игра стоит. Поэтому шагаем сами, но столько кадров, сколько
 * их прошло бы за это время на самом деле.
 */
async function settle(game: Phaser.Game, ms: number): Promise<void> {
  const start = performance.now();
  let clock = game.loop.time;
  let done = 0;
  while (performance.now() - start < ms) {
    const want = Math.floor((performance.now() - start) / FRAME_MS);
    while (done < want) {
      done += 1;
      clock += FRAME_MS;
      game.step(clock, FRAME_MS);
    }
    await tick();
  }
}

/** Снять холст целиком. Снимок приходит на следующем кадре, поэтому крутим. */
async function capture(game: Phaser.Game): Promise<Blob | null> {
  let src: string | null = null;
  game.renderer.snapshot((image) => {
    src = image instanceof HTMLImageElement ? image.src : null;
  });
  for (let i = 0; i < 40 && src === null; i += 1) await settle(game, 50);
  if (src === null) return null;
  return await (await fetch(src)).blob();
}

/** Поднять сцену в одиночку: остальные гасим, иначе чужой HUD попадёт в кадр. */
async function show(game: Phaser.Game, shot: Shot): Promise<void> {
  for (const live of game.scene.getScenes(true)) game.scene.stop(live.scene.key);
  await settle(game, 120);
  game.scene.start(shot.scene, shot.data);
  await settle(game, shot.settle ?? SETTLE_MS);
}

function say(line: string): void {
  const log = document.getElementById('shots-log');
  if (log !== null) log.textContent = `${log.textContent ?? ''}${line}\n`;
}

/** Обойти все экраны и сложить кадры в файлы. */
export async function takeShots(game: Phaser.Game): Promise<void> {
  const screen = document.createElement('pre');
  screen.id = 'shots-log';
  screen.style.cssText =
    'position:fixed;inset:0;z-index:9999;margin:0;padding:24px;overflow:auto;' +
    'background:#101014;color:#d8d8e0;font:16px/1.5 monospace;white-space:pre-wrap';
  document.body.appendChild(screen);
  say('Снимаю экраны. Закрывать вкладку не надо.\n');

  // Игра стартует с загрузчика: без этого все снимки будут пустым экраном.
  await settle(game, 3000);

  const taken: string[] = [];
  const failed: string[] = [];
  for (const shot of SHOTS) {
    try {
      await show(game, shot);
      const blob = await capture(game);
      if (blob === null) throw new Error('снимок не пришёл');
      const reply = await fetch(`/__shot?name=${encodeURIComponent(shot.name)}`, {
        method: 'POST',
        body: blob,
      });
      if (!reply.ok) throw new Error(`сервер ответил ${reply.status}`);
      taken.push(shot.name);
      say(`  ${shot.name}`);
    } catch (error) {
      failed.push(shot.name);
      say(`  ${shot.name} — не вышло: ${String(error)}`);
    }
  }

  await fetch('/__shot-done', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taken, failed }),
  });
  say(`\nГотово: ${taken.length} из ${SHOTS.length}. Кадры в art-work/shots/.`);
}
