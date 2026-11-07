/**
 * Журнал и отчёт о сбое (design 001, разделы 7 и 8.3).
 *
 * Журнал пишется на каждое действие, а читается раз в жизни — когда взрослый
 * присылает отчёт. Поэтому ломаться он должен тихо: не бросать, не отнимать место
 * у прогресса, не писать туда, куда писать нельзя. Чего журнал не должен — проверяется
 * хранилищем побайтно, а не ответом функции. Подмена хранилища — `memoryStorage.ts`,
 * часы подставляются руками.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { CRASH_SCREEN } from '../src/crashScreen';
import { eraseAllProgress } from '../src/systems/eraseAll';
import { createJournal, type JournalEntry } from '../src/systems/journal';
import { SAVE_PREFIX as P, SERVICE_KEYS, SPECS } from '../src/systems/saveKeys';
import {
  clearHeldBack,
  heldBack,
  openStore,
  readKey,
  snapshotAll,
  writeKey,
} from '../src/systems/saveStore';
import { replaceProgress } from '../src/systems/saveReplace';
import { setStoreObserver } from '../src/systems/storeEvents';
import { installMemoryStorage, type MemoryStorage } from './memoryStorage';

let storage: MemoryStorage;
const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1];
const JOURNAL = SERVICE_KEYS.journal;
const META = { game: '1.2.0', now: new Date(Date.UTC(2026, 10, 6, 11, 32, 5)) };

beforeEach(() => {
  installMemoryStorage();
  openStore(); // сбрасывает режим прошлого кейса
  storage = installMemoryStorage();
  clearHeldBack();
  setStoreObserver(null);
});
afterEach(() => setStoreObserver(null));

/** Часы, которые идут только когда им скажут. */
function clock(start = 1000) {
  let now = start;
  return {
    now: () => now,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

function stored(): JournalEntry[] {
  return JSON.parse(storage.getItem(JOURNAL) ?? '[]') as JournalEntry[];
}

function kinds(entries: readonly JournalEntry[]): string[] {
  return entries.map((e) => e.k);
}

describe('журнал: кольцо и хвост', () => {
  it('1000 записей: в памяти 200, в хранилище 50 и не больше 16 КБ, деталь обрезана', () => {
    openStore();
    const c = clock();
    const j = createJournal({ now: c.now });
    j.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6)));
    for (let i = 0; i < 1000; i += 1) {
      c.tick(10);
      j.note('scene', { key: 'quest-map', n: i, pad: 'x'.repeat(400) });
    }
    expect(j.entries()).toHaveLength(CONFIG.save.journalMemory);
    expect(last(j.entries())?.t).toBe(10_000);
    const tail = stored();
    expect(tail).toHaveLength(CONFIG.save.journalSaved);
    expect(last(tail)).toEqual(last(j.entries()));
    for (const entry of j.entries()) {
      expect((entry.d ?? '').length).toBeLessThanOrEqual(CONFIG.save.journalEntryChars);
    }
    expect(JOURNAL.length + (storage.getItem(JOURNAL) ?? '').length).toBeLessThanOrEqual(
      CONFIG.save.journalMaxBytes,
    );
  });

  it('деталь с кавычками: после экранирования хвост всё равно не больше 16 КБ, уходят старые', () => {
    openStore();
    const j = createJournal({ now: clock().now });
    for (let i = 0; i < 80; i += 1) j.note('error', { msg: '"'.repeat(300), i });
    const raw = storage.getItem(JOURNAL) ?? '';
    expect(JOURNAL.length + raw.length).toBeLessThanOrEqual(CONFIG.save.journalMaxBytes);
    const tail = stored();
    expect(tail.length).toBeGreaterThan(10);
    expect(tail.length).toBeLessThan(CONFIG.save.journalSaved);
    // Уходят самые старые, последняя запись на месте.
    expect(last(tail)).toEqual(last(j.entries()));
  });

  it('деталь любого вида не бросает: циклическая ссылка, BigInt, undefined', () => {
    openStore();
    const j = createJournal({ now: clock().now });
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    expect(() => j.note('error', loop)).not.toThrow();
    expect(() => j.note('error', 10n)).not.toThrow();
    expect(() => j.note('error')).not.toThrow();
    expect(j.entries()).toHaveLength(3);
    expect(j.entries()[2]?.d).toBeUndefined();
  });

  it('boot несёт игру, формат, режим и время запуска', () => {
    openStore();
    const j = createJournal({ now: clock().now });
    j.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6, 14, 32, 5)));
    const first = j.entries()[0];
    expect(first?.k).toBe('boot');
    expect(JSON.parse(first?.d ?? '{}')).toEqual({
      game: '1.2.0',
      format: 2,
      mode: 'normal',
      at: '2026-11-06T14:32:05.000Z',
    });
  });

  it('хвост переживает перезапуск: новый экземпляр видит boot прошлой сессии', () => {
    openStore();
    const a = createJournal({ now: clock().now });
    a.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6)));
    a.note('scene', { key: 'quest-map' });
    const b = createJournal({ now: clock(5).now });
    expect(b.entries()).toEqual([]);
    expect(kinds(b.saved())).toEqual(['boot', 'scene']);
    expect(b.saved()[0]).toEqual(a.entries()[0]);
    b.boot('1.2.1', 2, new Date(Date.UTC(2026, 10, 7)));
    // Хвост: прошлая сессия, потом новая; у новой время свои.
    const tail = stored();
    expect(kinds(tail)).toEqual(['boot', 'scene', 'boot']);
    expect(tail[2]?.t).toBe(0);
    // saved() — на момент запуска, а не живое зеркало.
    expect(kinds(b.saved())).toEqual(['boot', 'scene']);
  });

  it('хвост через много сессий не больше 50', () => {
    openStore();
    for (let s = 0; s < 8; s += 1) {
      const j = createJournal({ now: clock().now });
      j.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6)));
      for (let i = 0; i < 9; i += 1) j.note('scene', { key: 'k', i });
    }
    expect(stored()).toHaveLength(CONFIG.save.journalSaved);
    expect(stored().filter((e) => e.k === 'boot').length).toBeGreaterThan(4);
  });

  it('битый журнал: saved() пуст, слот broken:journal не заводится, новая запись затирает', () => {
    openStore();
    storage.setItem(JOURNAL, '{ сломано');
    const sets = storage.sets;
    const j = createJournal({ now: clock().now });
    expect(j.saved()).toEqual([]);
    expect(storage.sets).toBe(sets);
    j.note('scene', { key: 'a' });
    expect(kinds(stored())).toEqual(['scene']);
    expect([...storage.items.keys()].some((key) => key.includes('broken:journal'))).toBe(false);
    expect(heldBack()).toEqual({});
  });

  it('записи прошлой сессии с мусором внутри: валидные остаются, мусор отброшен', () => {
    openStore();
    storage.setItem(
      JOURNAL,
      JSON.stringify([{ t: 1, k: 'boot' }, { t: 'x', k: 'scene' }, { t: 2, k: 'нет такого' }, 7, { t: 3, k: 'scene', d: 'ok' }]),
    );
    const j = createJournal({ now: clock().now });
    expect(j.saved()).toEqual([{ t: 1, k: 'boot' }, { t: 3, k: 'scene', d: 'ok' }]);
  });
});

describe('журнал: тесное хранилище и режимы', () => {
  it('нет места: note не бросает, чужие ключи и crash целы, прогресс не страдает', () => {
    openStore();
    writeKey(SPECS.solved, ['q1']);
    storage.setItem(SERVICE_KEYS.crash, '{"errors":[]}');
    storage.quota = storage.used() + 20;
    const before = storage.dump();
    const j = createJournal({ now: clock().now });
    expect(() => j.note('scene', { key: 'quest-map', pad: 'y'.repeat(100) })).not.toThrow();
    // Журналу места не нашлось — и он не отнял его ни у crash, ни у прогресса.
    expect(storage.dump()).toBe(before);
    expect(j.entries()).toHaveLength(1);
  });

  it('writeKey убрал journal на переполнении: следующая note пишет хвост заново из кольца', () => {
    openStore();
    storage.setItem(JOURNAL, JSON.stringify([{ t: 5, k: 'boot', d: 'старая сессия' }]));
    const j = createJournal({ now: clock().now });
    j.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6)));
    for (let i = 0; i < 12; i += 1) j.note('scene', { key: 'k', i, pad: 'z'.repeat(60) });
    expect(stored().length).toBeGreaterThan(10);
    // Места хватает ровно на то, чтобы записать узел, если journal уйдёт.
    storage.quota = storage.used() + 10;
    writeKey(SPECS.solved, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']);
    expect(storage.getItem(JOURNAL)).toBeNull();
    expect(readKey(SPECS.solved)).toHaveLength(8);
    storage.quota = Infinity;
    j.note('solved', { node: 'q8' });
    const tail = stored();
    expect(last(tail)?.k).toBe('solved');
    // Хвост начат заново из кольца: записи прошлой сессии в нём нет, нынешняя вся.
    expect(tail.some((e) => e.d === 'старая сессия')).toBe(false);
    expect(tail.length).toBe(Math.min(CONFIG.save.journalSaved, j.entries().length));
    expect(tail[0]?.k).toBe('boot');
  });

  it('future: note не трогает хранилище ни записью, ни удалением, но кольцо помнит', () => {
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    storage.setItem(P + 'v3:quest-solved', '["q1"]');
    expect(openStore()).toBe('future');
    const before = storage.dump();
    const [sets, removes] = [storage.sets, storage.removes];
    const j = createJournal({ now: clock().now });
    j.boot('1.2.0', 2, new Date(Date.UTC(2026, 10, 6)));
    j.note('scene', { key: 'a' });
    expect(storage.dump()).toBe(before);
    expect([storage.sets, storage.removes]).toEqual([sets, removes]);
    expect(kinds(j.entries())).toEqual(['boot', 'scene']);
    expect(JSON.parse(j.entries()[0]?.d ?? '{}').mode).toBe('future');
  });

  it('newer пишет журнал: хранилище новее, но свои ключи игре разрешены', () => {
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '2');
    expect(openStore()).toBe('newer');
    const j = createJournal({ now: clock().now });
    j.note('scene', { key: 'a' });
    expect(kinds(stored())).toEqual(['scene']);
  });

  it('хранилища нет (unavailable): note не бросает', () => {
    const broken = {
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
      removeItem: () => {
        throw new Error('нет доступа');
      },
      key: () => null,
      length: 0,
    };
    (globalThis as { localStorage?: unknown }).localStorage = broken;
    expect(openStore()).toBe('unavailable');
    const j = createJournal({ now: clock().now });
    expect(() => j.note('scene')).not.toThrow();
    expect(j.entries()).toHaveLength(1);
    expect(j.saved()).toEqual([]);
  });

  it('формат поднят соседней вкладкой посреди сессии: следующая note не пишет', () => {
    openStore();
    const j = createJournal({ now: clock().now });
    j.note('scene', { key: 'a' });
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    const before = storage.dump();
    j.note('scene', { key: 'b' });
    expect(storage.dump()).toBe(before);
    expect(j.entries()).toHaveLength(2);
  });
});

describe('журнал: что сообщает хранилище', () => {
  function watch() {
    const j = createJournal({ now: clock().now });
    setStoreObserver((k, d) => j.note(k, d));
    return j;
  }
  const detailOf = (j: ReturnType<typeof watch>, kind: string): unknown => {
    const entry = j.entries().find((e) => e.k === kind);
    return entry?.d === undefined ? undefined : JSON.parse(entry.d);
  };

  it('запись ключа — save с коротким именем, отказ в записи тоже виден', () => {
    openStore();
    const j = watch();
    writeKey(SPECS.solved, ['q1']);
    expect(j.entries().map((e) => e.k)).toEqual(['save']);
    expect(detailOf(j, 'save')).toEqual({ key: 'v3:quest-solved', ok: true });
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    writeKey(SPECS.solved, ['q1', 'q2']);
    expect(last(j.entries())?.k).toBe('save');
    expect(JSON.parse(last(j.entries())?.d ?? '{}')).toMatchObject({ ok: false });
  });

  it('смена режима посреди сессии — store', () => {
    openStore();
    const j = watch();
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    writeKey(SPECS.solved, ['q1']);
    expect(detailOf(j, 'store')).toEqual({ mode: 'future', from: 'normal' });
    // Не повторяется, пока режим тот же.
    writeKey(SPECS.solved, ['q1']);
    expect(j.entries().filter((e) => e.k === 'store')).toHaveLength(1);
  });

  it('запуск в future — store в кольце, на диск ничего', () => {
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    const j = watch();
    const before = storage.dump();
    openStore();
    expect(detailOf(j, 'store')).toEqual({ status: 'future' });
    expect(storage.dump()).toBe(before);
  });

  it('битое значение: broken при первой копии, broken-again при второй, другой строке', () => {
    storage.setItem(SPECS.levels.key, '{ сломано');
    const j = watch();
    openStore();
    expect(detailOf(j, 'broken')).toMatchObject({ key: 'v2:levels' });
    expect(j.entries().some((e) => e.k === 'broken-again')).toBe(false);
    // Повторное чтение той же строки шума не добавляет.
    const count = j.entries().length;
    readKey(SPECS.levels);
    expect(j.entries()).toHaveLength(count);
    storage.setItem(SPECS.levels.key, '{ сломано иначе');
    readKey(SPECS.levels);
    expect(detailOf(j, 'broken-again')).toMatchObject({ key: 'v2:levels' });
  });

  it('миграция 1→2 — migrate с исходным форматом', () => {
    storage.setItem(P + 'v1:collection', '["coin"]');
    const j = watch();
    expect(openStore()).toBe('migrated');
    expect(detailOf(j, 'migrate')).toEqual({ from: 1, ok: true });
  });

  it('стирание — erase с ответом, замена — restore с ответом', () => {
    openStore();
    writeKey(SPECS.solved, ['q1']);
    const j = watch();
    expect(eraseAllProgress()).toBe('ok');
    expect(detailOf(j, 'erase')).toMatchObject({ result: 'ok' });
    expect(replaceProgress({ [SPECS.solved.key]: '["q9"]' }, 'restore', META)).toBe('ok');
    expect(detailOf(j, 'restore')).toMatchObject({ result: 'ok' });
  });

  it('обрыв замены: метка докатана при запуске — restore с rolled', () => {
    openStore();
    writeKey(SPECS.solved, ['q1']);
    storage.failAfter(3);
    expect(replaceProgress({ [SPECS.solved.key]: '["q9"]' }, 'restore', META)).toBe('interrupted');
    storage.failAfter(Infinity);
    const j = watch();
    expect(openStore()).toBe('rolled-forward');
    expect(detailOf(j, 'restore')).toMatchObject({ rolled: 'forward' });
  });

  it('докат упал при запуске: откат — restore с rolled back', () => {
    openStore();
    writeKey(SPECS.solved, ['q1']);
    const marker = {
      format: 2,
      minWriter: 2,
      reason: 'restore',
      backup: false,
      keys: { [SPECS.solved.key]: '["q9"]' },
    };
    storage.setItem(SERVICE_KEYS.restore, JSON.stringify(marker));
    storage.failOnWrite(1); // первая запись цели при запуске падает
    const j = watch();
    expect(openStore()).toBe('rolled-back');
    expect(detailOf(j, 'restore')).toEqual({ rolled: 'back', reason: 'restore' });
  });

  it('наблюдатель, который бросает, прогресс не ломает', () => {
    openStore();
    setStoreObserver(() => {
      throw new Error('журнал сломан');
    });
    expect(() => writeKey(SPECS.solved, ['q1'])).not.toThrow();
    expect(readKey(SPECS.solved)).toEqual(['q1']);
  });

  it('запись журнала не порождает событий и не трогает снимок хранилища', () => {
    openStore();
    const j = watch();
    j.note('scene', { key: 'a' });
    expect(j.entries()).toHaveLength(1);
    expect(Object.keys(snapshotAll())).not.toContain(JOURNAL);
  });
});

describe('журнал: проводка сцен', () => {
  const quest = readFileSync('src/systems/quest.ts', 'utf8');
  const english = readFileSync('src/scenes/englishUi.ts', 'utf8');

  it('finishPuzzle пишет solved с номером узла раньше запоминания', () => {
    const body = quest.slice(quest.indexOf('export function finishPuzzle'));
    const note = body.indexOf("journal.note('solved'");
    expect(note).toBeGreaterThan(0);
    expect(note).toBeLessThan(body.indexOf('questSave.markSolved'));
    expect(body.slice(note, note + 120)).toContain('data.nodeId');
  });

  it('английские игры: обе записи набора идут через одну функцию с английским событием', () => {
    expect(english).toContain("journal.note('english'");
    expect(english.match(/englishSave\.markDone\(/g)).toHaveLength(1);
    expect(english.match(/recordEnglishDone\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('экран сбоя: тексты и проводка в main.ts', () => {
  // Без комментариев: «после `openStore()`» в комментарии не должно выдавать себя за вызов.
  const main = readFileSync('src/main.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const trap = readFileSync('src/crashTrap.ts', 'utf8');

  it('первым — «Позови взрослого», слова «Ошибка» нигде нет', () => {
    expect(CRASH_SCREEN.title.startsWith('Позови взрослого')).toBe(true);
    for (const text of Object.values(CRASH_SCREEN)) expect(text.toLowerCase()).not.toContain('ошибк');
  });

  it('вторая фраза зависит от того, легла ли последняя запись', () => {
    expect(CRASH_SCREEN.saved).toContain('Прогресс сохранён');
    expect(CRASH_SCREEN.notSaved).toContain('Последнее действие могло не сохраниться');
    expect(CRASH_SCREEN.notSaved).not.toContain('Прогресс сохранён');
  });

  it('ловушка — первый импорт main.ts, игра отдана ей, boot идёт после openStore (001-80)', () => {
    const imports = main.match(/^import .*$/gm) ?? [];
    expect(imports[0]).toContain("'./crashTrap'");
    expect(main.indexOf('openStore()')).toBeLessThan(main.indexOf('journal.boot('));
    expect(main.indexOf('journal.boot(')).toBeLessThan(main.indexOf('new Phaser.Game('));
    expect(main.indexOf('new Phaser.Game(')).toBeLessThan(main.indexOf('attachGame(game)'));
    // Хранилище и журнал отданы ловушке после boot и до игры: иначе отчёт выйдет без журнала (ревью этапа 8).
    expect(main.indexOf('journal.boot(')).toBeLessThan(main.indexOf('attachStore('));
    expect(main.indexOf('attachStore(')).toBeLessThan(main.indexOf('new Phaser.Game('));
    expect(main).toContain("trackScenes(game, (detail) => journal.note('scene', detail))");
  });

  it('ловушка ставится при загрузке модуля, а не из тела main.ts', () => {
    expect(trap).toContain("if (typeof window !== 'undefined') installCrashTrap(window)");
  });

  it('старты сцен ловятся после READY и по START каждой сцены; Phaser импортирован значением', () => {
    const scenes = readFileSync('src/systems/journalScenes.ts', 'utf8');
    expect(scenes).toContain("import Phaser from 'phaser'");
    expect(scenes).toContain('Phaser.Core.Events.READY');
    expect(scenes).toContain('Phaser.Scenes.Events.START');
    expect(scenes).toContain('scene.sys.settings.data');
  });
});
