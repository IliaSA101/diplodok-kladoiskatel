// Раннер фикстур сохранения (его запускает tools/save-fixture.mjs через vite-node).
//
// Проигрывает сценарий ПОДЛИННЫМИ модулями старой версии игры (деревья `src` лежат
// в `work/tree-<ref>/`, их распаковал git archive) на подменённом `localStorage`,
// снимает `storage`, и только потом, тем же кодом, — `seen`: что видит ребёнок.
// Порядок важен: `loadCollection` из 1.1 при пустом `v2:collection` сам пишет в
// хранилище, и снимок, взятый после отпечатка, был бы уже не тем, что лежало у ребёнка.
//
// Без типов и вне tsconfig: это инструмент, а не игра (tools/**/*.mjs линтер не берёт).
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { work, refs, scenario, out, name } = JSON.parse(process.env.DK_FIXTURE ?? '{}');
const PREFIX = 'diplodok-kladoiskatel:';

class MemoryStorage {
  items = new Map();
  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}
const storage = new MemoryStorage();
globalThis.localStorage = storage;

/** Модули одной версии. Чего в ней ещё нет (английский, ступени), там `undefined`. */
async function tree(ref) {
  const src = join(work, 'tree-' + ref, 'src') + '/';
  const pick = async (file) => (existsSync(src + file + '.ts') ? import(src + file + '.ts') : undefined);
  const [save, questSave, englishSave, skill, quest, levels, worldGen, english] = await Promise.all([
    pick('systems/save'),
    pick('systems/questSave'),
    pick('systems/englishSave'),
    pick('systems/skill'),
    pick('data/quest'),
    pick('data/levels'),
    // worldGen 03b2164 тянет Phaser (treasures.ts) — в node его не поднять; лесам той сборки
    // клады задаёт сценарий сам.
    pick('systems/worldGen').catch(() => undefined),
    pick('data/english'),
  ]);
  return {
    ref,
    save: save.save,
    questSave: questSave?.questSave,
    englishSave: englishSave?.englishSave,
    skillSave: skill?.skillSave,
    kinds: skill === undefined ? [] : Object.keys(skill.PACE_MS),
    nodes: quest?.QUEST_NODES ?? [],
    getLevel: levels?.getLevel,
    generateWorld: worldGen?.generateWorld,
    sets: english?.ENGLISH_SETS ?? [],
    games: english?.ENGLISH_GAMES ?? [],
  };
}

/** Лес `n` пройден полностью (или первые `only` кладов): клады, музей, корона. */
function playLevel(v, n, only) {
  const world = v.generateWorld(v.getLevel(n));
  const ids = world.treasures.map((t) => t.id);
  v.save.saveLevelFound(n, only === undefined ? ids : ids.slice(0, only));
  v.save.addToCollection(only === undefined ? world.itemIds : world.itemIds.slice(0, 1));
  if (only === undefined) v.save.markLevelComplete(n);
}

/** Игра в том виде, в каком её играет «самый прилежный» ребёнок этой версии. */
function playFull(v, plan) {
  for (const n of plan.levels) playLevel(v, n);
  if (plan.partial !== undefined) playLevel(v, plan.partial[0], plan.partial[1]);
  v.save.saveCurrentLevel(plan.current);
  if (plan.muted !== undefined) v.save.saveSettings({ muted: plan.muted });
  for (const node of v.nodes.slice(0, plan.nodes ?? v.nodes.length)) v.questSave.markSolved(node.id, node.sticker);
  for (const set of v.sets) for (const game of v.games) v.englishSave.markDone(set.id, game);
  // Быстрый прогон без ошибок поднимает ступень на одну: четыре прогона — до потолка.
  for (const kind of v.kinds) for (let i = 0; i < 4; i += 1) v.skillSave.note(kind, 1000, 0);
}

/**
 * Квест сборки 03b2164: его `questSave` жил внутри `systems/quest.ts` вместе с
 * Phaser и в node не поднимается. Эти строки — дословно его `read`/`write`/`markSolved`
 * (ключи те же, форма JSON-массива строк та же).
 */
function oldQuest03(v) {
  const read = (key) => {
    const raw = storage.getItem(key);
    const data = raw === null ? null : JSON.parse(raw);
    return Array.isArray(data) ? data.filter((x) => typeof x === 'string') : [];
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify([...value]));
  const solvedKey = PREFIX + 'v3:quest-solved';
  const stickersKey = PREFIX + 'v3:quest-stickers';
  for (const node of v.nodes) {
    write(solvedKey, new Set([...read(solvedKey), node.id]));
    write(stickersKey, new Set([...read(stickersKey), node.sticker]));
  }
}

const LOOK_LEVELS = 60;

/** «Что видит ребёнок»: ответы публичного API этой версии, по полям, которые в ней есть. */
function look(v) {
  const seen = {
    current: v.save.loadCurrentLevel(),
    levels: {},
    completed: v.save.loadCompleted(),
    muted: v.save.loadSettings().muted,
  };
  for (let n = 1; n <= LOOK_LEVELS; n += 1) {
    const found = v.save.loadLevelFound(n);
    if (found.length > 0) seen.levels[String(n)] = found;
  }
  // Музей — последним: у 1.1 чтение пустого `v2` ещё и пишет в хранилище.
  seen.museum = v.save.loadCollection();
  if (v.questSave !== undefined) {
    seen.solved = v.questSave.solvedNodes();
    seen.stickers = v.questSave.stickers();
    if (v.questSave.goldenStickers !== undefined) seen.golden = v.questSave.goldenStickers();
  }
  if (v.englishSave !== undefined) {
    seen.english = Object.fromEntries(v.sets.map((set) => [set.id, v.englishSave.doneCount(set.id)]));
  }
  if (v.skillSave !== undefined) {
    seen.skill = Object.fromEntries(v.kinds.map((kind) => [kind, v.skillSave.of(kind)]));
  }
  return seen;
}

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

const SCENARIOS = {
  // Ребёнок «до 1.0»: квест 03b2164 (8 узлов, старый порядок наклеек), потом 8077300
  // (три круга по 8 узлов, в наклейках `sticker-ball-boot`, которой теперь нет в игре).
  async 'pre-1.0'() {
    const [first, last] = await Promise.all(refs.map(tree));
    // Леса 03b2164 — руками: ни worldGen, ни id кладов оттуда в node не достать.
    for (const n of [1, 2]) {
      first.save.saveLevelFound(n, ['t0', 't1', 't2', 'secret']);
      first.save.addToCollection(n === 1 ? ['crystal', 'coin'] : ['egg']);
      first.save.markLevelComplete(n);
    }
    first.save.saveCurrentLevel(3);
    first.save.saveSettings({ muted: true });
    oldQuest03(first);
    playFull(last, { levels: [3], partial: [4, 2], current: 4, nodes: undefined, muted: false });
    return {
      game: 'pre-1.0',
      about: 'ребёнок до выхода 1.0: квест 03b2164 решён целиком, затем три круга 8077300; в наклейках sticker-ball-boot',
      look: () => look(last),
    };
  },

  // С первой сборки (21.10): `v1:*` от 15d061c, затем всё, что даёт 1.0.0.
  async 'since-first'() {
    const [first, last] = await Promise.all(refs.map(tree));
    first.save.addToCollection(['crystal', 'coin', 'egg']);
    first.save.saveProgress({ seed: 1001, found: ['t0', 't1'] });
    first.save.saveSettings({ muted: true });
    playFull(last, { levels: range(8), current: 9, muted: false });
    return {
      game: '1.0.0',
      about: 'ребёнок с первой сборки 21.10: v1:* и всё, что даёт 1.0.0; v1:settings не переносится',
      look: () => look(last),
    };
  },

  // Максимальное сохранение одной версии: 8 лесов и 40 бесконечных, все узлы, все игры.
  async max() {
    const [v] = await Promise.all(refs.map(tree));
    playFull(v, { levels: range(48), current: 49, muted: false });
    return { game: name, about: 'максимальное сохранение: 48 лесов, все узлы и наклейки, весь английский, ступени', look: () => look(v) };
  },

  // «Стёрто в 1.1»: музей первой сборки в `v1:collection`, `v2:collection = []`.
  async erased() {
    const [first, last] = await Promise.all(refs.map(tree));
    first.save.addToCollection(['crystal', 'coin']);
    last.save.loadCollection(); // выбор леса открыли: музей перенесён в v2
    playFull(last, { levels: [1, 2], current: 3, nodes: 6, muted: true });
    // Так стирал StartScene 1.1.1: resetAll и два reset; ступени живы.
    last.save.resetAll();
    last.questSave.reset();
    last.englishSave.reset();
    for (const node of last.nodes.slice(0, 2)) last.questSave.markSolved(node.id, node.sticker);
    return {
      game: '1.1.1',
      about: 'стёрто в 1.1.1: v1:collection первой сборки жив, v2:collection = [], после стирания два узла; выбор леса не открывали',
      look: () => look(last),
      expect: { museum: [] },
      why: '1.1 воскрешает музей из v1:collection при пустом v2; 1.2 пустой музей оставляет пустым (миграция 1→2 трогает v2 только если его нет вовсе)',
    };
  },

  // Максимальное 1.1.1, потом руками пять ключей испорчены.
  async broken() {
    const [v] = await Promise.all(refs.map(tree));
    playFull(v, { levels: range(48), current: 49, muted: false });
    const key = (k) => PREFIX + k;
    const stickers = JSON.parse(storage.getItem(key('v3:quest-stickers')));
    const skill = JSON.parse(storage.getItem(key('v3:quest-skill')));
    const broken = {
      [key('v3:quest-solved')]: '["q1","q2","q3"',
      [key('v3:quest-stickers')]: JSON.stringify([stickers[0], 5, ...stickers.slice(1)]),
      [key('v2:settings')]: '{"muted":"yes"}',
      [key('v3:quest-skill')]: JSON.stringify({ ...skill, sudoku: '2' }),
      [key('v2:levels')]: '{"1":["t0"',
    };
    for (const [k, value] of Object.entries(broken)) storage.setItem(k, value);
    return {
      game: '1.1.1',
      about: 'максимальное 1.1.1, затем руками: обрезанный quest-solved, число среди наклеек, muted строкой, ступень строкой, levels не JSON',
      look: () => look(v),
      broken,
    };
  },
};

const make = SCENARIOS[scenario];
if (make === undefined) throw new Error('сценарий? ' + Object.keys(SCENARIOS).join(' | '));
const result = await make();
// storage — до seen (см. шапку файла).
const snapshot = Object.fromEntries([...storage.items].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const seen = result.look();
const file = {
  game: result.game,
  ref: refs.join('+'),
  about: result.about,
  storage: snapshot,
  seen,
  ...(result.expect === undefined ? {} : { expect: result.expect, why: result.why }),
  ...(result.broken === undefined ? {} : { broken: result.broken }),
};
writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
console.log(out, Object.keys(snapshot).length, 'ключей', JSON.stringify(snapshot).length, 'байт');
