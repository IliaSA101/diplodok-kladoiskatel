/**
 * Номер формата сохранения, четыре режима хранилища и миграция 1→2.
 *
 * Отдельный файл: `save.test.ts` и `saveFile.test.ts` у порога в шестьсот строк,
 * а здесь другая подготовка — хранилище с номерами формата «из будущего».
 * Ошибка тут не видна на экране, пока не случится: игра новее запишет в хранилище
 * свой формат, откатят выкладку, и старая игра либо молча затрёт чужое, либо
 * замолчит без причины; музей первой сборки без миграции пропадает.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateKV, type KV } from '../src/systems/saveMigrations';
import { save } from '../src/systems/save';
import { questSave } from '../src/systems/questSave';
import { replaceProgress } from '../src/systems/saveReplace';
import {
  PROGRESS_KEYS,
  SAVE_FORMAT,
  SAVE_MIN_WRITER,
  SAVE_PREFIX as P,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
} from '../src/systems/saveKeys';
import {
  clearHeldBack,
  heldBack,
  isStoreArea,
  lastWriteOk,
  openStore,
  readKey,
  removeKey,
  shouldReloadOn,
  storeMode,
  writeKey,
} from '../src/systems/saveStore';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';

let storage: MemoryStorage;

beforeEach(() => {
  installMemoryStorage();
  openStore(); // сбрасывает режим прошлого кейса
  storage = installMemoryStorage(); // и чистая память со счётчиками в нуле
  clearHeldBack();
});

const V1 = P + 'v1:collection';
const V2 = P + 'v2:collection';
const FORMAT = SERVICE_KEYS.format;
const MIN_WRITER = SERVICE_KEYS.minWriter;

function keys(): string[] {
  return [...storage.items.keys()].sort();
}

describe('номер формата на свежей игре и повторный запуск', () => {
  it('формат 2 и 2, и больше ничего', () => {
    expect(SAVE_FORMAT).toBe(2);
    expect(SAVE_MIN_WRITER).toBe(2);
    expect(openStore()).toBe('fresh');
    expect(keys()).toEqual([FORMAT, MIN_WRITER].sort());
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(storage.getItem(MIN_WRITER)).toBe('2');
    expect(storeMode()).toBe('normal');
  });

  it('второй запуск не меняет ни одного ключа и ничего не пишет', () => {
    storage.setItem(V1, JSON.stringify(['acorn']));
    storage.setItem(P + 'v2:current', '4');
    openStore();
    const before = storage.dump();
    const sets = storage.sets;
    expect(openStore()).toBe('ok');
    expect(storage.dump()).toBe(before);
    expect(storage.sets).toBe(sets);
  });

  it('сохранение формата 1 (без номера) помечается, прогресс цел', () => {
    storage.setItem(P + 'v2:current', '4');
    storage.setItem(P + 'v3:quest-solved', '["q1","q2"]');
    expect(openStore()).toBe('migrated');
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(storage.getItem(MIN_WRITER)).toBe('2');
    expect(save.loadCurrentLevel()).toBe(4);
    expect(questSave.solvedNodes()).toEqual(['q1', 'q2']);
  });
});

describe('миграция 1→2: музей первой сборки', () => {
  it('v1:collection при отсутствующем v2 переносится, v1:* остаётся на месте', () => {
    storage.setItem(V1, JSON.stringify(['acorn', 'pine']));
    storage.setItem(P + 'v1:progress', '{"seed":1001,"found":["t0"]}');
    storage.setItem(P + 'v1:settings', '{"muted":true}');
    openStore();
    expect(JSON.parse(storage.getItem(V2) ?? 'null')).toEqual(['acorn', 'pine']);
    expect(storage.getItem(V1)).toBe(JSON.stringify(['acorn', 'pine']));
    expect(storage.getItem(P + 'v1:progress')).toBe('{"seed":1001,"found":["t0"]}');
    expect(storage.getItem(P + 'v1:settings')).toBe('{"muted":true}');
  });

  it('музей первой версии игры переносится, а не теряется', () => {
    storage.setItem(V1, JSON.stringify(['acorn']));
    openStore();
    expect(save.loadCollection()).toEqual(['acorn']);
    save.addToCollection(['ball']);
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'ball']));
  });

  it('v2 = [] («стёрто» в 1.1) музей не воскрешает', () => {
    storage.setItem(V2, '[]');
    storage.setItem(V1, JSON.stringify(['acorn']));
    openStore();
    expect(storage.getItem(V2)).toBe('[]');
    expect(save.loadCollection()).toEqual([]);
    expect(storage.getItem(V1)).toBe(JSON.stringify(['acorn']));
  });

  it('битый v2 миграция не трогает: его дело карантин', () => {
    storage.setItem(V2, '{ сломано');
    storage.setItem(V1, JSON.stringify(['acorn']));
    openStore();
    expect(storage.getItem(V2)).toBe('{ сломано');
    expect(storage.getItem(brokenKey(V2))).toBe('{ сломано');
  });

  it('v1, который не разобрать или пуст, v2 не создаёт и не бросает', () => {
    for (const raw of ['{ сломано', '[]', '"строка"', '[1,2]', 'null']) {
      storage.clear();
      storage.setItem(V1, raw);
      expect(() => openStore()).not.toThrow();
      expect(storage.getItem(V2)).toBeNull();
      expect(storage.getItem(V1)).toBe(raw);
      expect(storage.getItem(FORMAT)).toBe('2');
    }
  });

  it('migrateKV идемпотентна и от формата 2 ничего не делает', () => {
    const kv: KV = new Map([[V1, '["a"]']]);
    migrateKV(kv, 2);
    expect(kv.has(V2)).toBe(false);
    migrateKV(kv, 1);
    const once = [...kv];
    migrateKV(kv, 1);
    expect([...kv]).toEqual(once);
    const zero: KV = new Map([[V1, '["a"]']]);
    migrateKV(zero, 0);
    expect(zero.get(V2)).toBe('["a"]');
  });
});

describe('номер формата: битый и поздний карантин', () => {
  it('битый номер откладывается в broken:format, миграции проходят, формат 2', () => {
    for (const raw of ['abc', '"2"', '2.5', '0', '-1', 'null']) {
      storage.clear();
      clearHeldBack();
      storage.setItem(FORMAT, raw);
      storage.setItem(V1, JSON.stringify(['acorn']));
      openStore();
      expect(storage.getItem(brokenKey(FORMAT))).toBe(raw);
      expect(storage.getItem(FORMAT)).toBe('2');
      expect(JSON.parse(storage.getItem(V2) ?? 'null')).toEqual(['acorn']);
    }
  });

  it('битое в ключах прогресса откладывается при запуске, а не на экране', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1","q2"');
    openStore();
    expect(storage.getItem(brokenKey(P + 'v3:quest-solved'))).toBe('["q1","q2"');
  });

  it('битый второй номер при формате 2 откладывается, режим обычный', () => {
    storage.setItem(FORMAT, '2');
    storage.setItem(MIN_WRITER, 'abc');
    expect(openStore()).toBe('ok');
    expect(storage.getItem(brokenKey(MIN_WRITER))).toBe('abc');
    expect(storeMode()).toBe('normal');
  });
});

describe('режимы хранилища новее игры', () => {
  const seedFuture = (format: string, minWriter: string | null): void => {
    storage.setItem(FORMAT, format);
    if (minWriter !== null) storage.setItem(MIN_WRITER, minWriter);
    storage.setItem(P + 'v2:current', '7');
    storage.setItem(P + 'v3:quest-solved', '["q1"');
    storage.setItem(V1, '["acorn"]'); // его «стереть всё» убирает — в future не должно
  };

  it('формат 3 при W = 3 и без W — future: хранилище побайтно то же (H2)', () => {
    for (const w of ['3', null]) {
      storage.clear();
      clearHeldBack();
      seedFuture('3', w);
      const before = storage.dump();
      const [sets, removes] = [storage.sets, storage.removes];
      expect(openStore()).toBe('future');
      expect(storeMode()).toBe('future');
      writeKey(SPECS.current, 9);
      save.saveCurrentLevel(9);
      readKey(SPECS.solved); // битое читается, но слот не пишется
      save.resetAll(); // и стирание в `future` — тоже ничего
      removeKey(V1); // и прямое удаление: сторож в самом хранилище, а не только у стирания
      expect(save.loadCurrentLevel()).toBe(7);
      expect(lastWriteOk()).toBe(false);
      expect(storage.dump()).toBe(before);
      expect(storage.sets).toBe(sets);
      expect(storage.removes).toBe(removes);
      expect(heldBack()[P + 'v3:quest-solved']).toBe('["q1"');
    }
  });

  it('формат 3 при W = 2 — newer: игра пишет свои ключи, номера не трогает (H1)', () => {
    seedFuture('3', '2');
    expect(openStore()).toBe('newer');
    expect(storeMode()).toBe('newer');
    writeKey(SPECS.current, 9);
    expect(save.loadCurrentLevel()).toBe(9);
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(FORMAT)).toBe('3');
    expect(storage.getItem(MIN_WRITER)).toBe('2');
    // Карантин в newer работает: поломка откладывается, пока игра пишет свои ключи.
    expect(storage.getItem(brokenKey(P + 'v3:quest-solved'))).toBe('["q1"');
    // Миграций в newer нет: музей первой сборки не переносится.
    expect(storage.getItem(V2)).toBeNull();
  });

  it('W больше формата считается равным формату', () => {
    storage.setItem(FORMAT, '2');
    storage.setItem(MIN_WRITER, '9');
    expect(openStore()).toBe('ok');
    expect(storeMode()).toBe('normal');
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '9');
    expect(openStore()).toBe('future');
  });

  it('формат подняли посреди сессии (оба номера 3) — запись молчит, режим future (H4)', () => {
    expect(openStore()).toBe('fresh');
    save.saveCurrentLevel(3);
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '3');
    const before = storage.dump();
    save.saveCurrentLevel(8);
    expect(storeMode()).toBe('future');
    expect(lastWriteOk()).toBe(false);
    expect(storage.dump()).toBe(before);
    expect(save.loadCurrentLevel()).toBe(3);
  });

  it('формат подняли посреди сессии при W = 2 — запись идёт, это newer', () => {
    openStore();
    storage.setItem(FORMAT, '3');
    save.saveCurrentLevel(8);
    expect(storeMode()).toBe('newer');
    expect(save.loadCurrentLevel()).toBe(8);
    expect(storage.getItem(FORMAT)).toBe('3');
  });

  it('метка restore формата новее — future, ничего не тронуто', () => {
    const marker = JSON.stringify({
      format: 3,
      minWriter: 3,
      reason: 'restore',
      backup: true,
      keys: {},
    });
    storage.setItem(SERVICE_KEYS.restore, marker);
    storage.setItem(P + 'v2:current', '7');
    const before = storage.dump();
    expect(openStore()).toBe('future');
    expect(storage.dump()).toBe(before);
  });

  it('метка restore, которую не разобрать, откладывается и снимается', () => {
    storage.setItem(SERVICE_KEYS.restore, '{ сломано');
    openStore();
    expect(storage.getItem(brokenKey(SERVICE_KEYS.restore))).toBe('{ сломано');
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(storage.getItem(FORMAT)).toBe('2');
  });

  it('нечитаемая метка restore в future снимается не раньше режима: ничего не тронуто', () => {
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '3');
    storage.setItem(P + 'v2:current', '7');
    storage.setItem(SERVICE_KEYS.restore, '{ сломано');
    const before = storage.dump();
    const [sets, removes] = [storage.sets, storage.removes];
    expect(openStore()).toBe('future');
    expect(storage.dump()).toBe(before);
    expect(storage.sets).toBe(sets);
    expect(storage.removes).toBe(removes);
  });

  it('формат подняли посреди сессии: битое при чтении откладывается в память, слот не пишется', () => {
    openStore();
    storage.setItem(P + 'v2:current', '0');
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '3');
    const before = storage.dump();
    expect(save.loadCurrentLevel()).toBe(1);
    expect(storage.dump()).toBe(before);
    expect(heldBack()[P + 'v2:current']).toBe('0');
  });

  it('хранилище недоступно — unavailable, игра не падает и не пишет', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('запрет', 'SecurityError');
      },
    });
    try {
      expect(openStore()).toBe('unavailable');
      expect(storeMode()).toBe('unavailable');
      expect(() => save.saveCurrentLevel(3)).not.toThrow();
      expect(save.loadCurrentLevel()).toBe(1);
      expect(lastWriteOk()).toBe(false);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('обрыв посреди миграции', () => {
  it('сперва ключи прогресса, потом второй номер, потом формат; повтор доделывает', () => {
    storage.setItem(V1, JSON.stringify(['acorn']));
    storage.failAfter(1);
    openStore();
    expect(storage.getItem(V2)).toBe(JSON.stringify(['acorn']));
    expect(storage.getItem(MIN_WRITER)).toBeNull();
    expect(storage.getItem(FORMAT)).toBeNull();

    storage.failAfter(Infinity);
    storage.clear();
    storage.setItem(V1, JSON.stringify(['acorn']));
    storage.failAfter(2);
    openStore();
    expect(storage.getItem(MIN_WRITER)).toBe('2');
    expect(storage.getItem(FORMAT)).toBeNull();

    storage.failAfter(Infinity);
    expect(openStore()).toBe('migrated');
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(JSON.parse(storage.getItem(V2) ?? 'null')).toEqual(['acorn']);
  });

  it('обрыв после стирания в 1.1: повтор музей не воскрешает', () => {
    storage.setItem(V2, '[]');
    storage.setItem(V1, JSON.stringify(['acorn']));
    storage.failAfter(0);
    openStore();
    storage.failAfter(Infinity);
    openStore();
    expect(storage.getItem(V2)).toBe('[]');
  });
});

describe('миграция не легла, а находка записалась (О9-2)', () => {
  it('повтор перед записью: музей первой сборки переносится, формат встаёт', () => {
    storage.setItem(V1, JSON.stringify(['acorn', 'pine']));
    storage.failOnWrite(1);
    openStore();
    expect(storage.getItem(V2)).toBeNull();
    save.addToCollection(['ball']);
    expect(storage.getItem(FORMAT)).toBe('2');
    openStore();
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'pine', 'ball']));
  });

  it('повтор тоже не лёг: v2:collection пишется объединением с v1, а не одной находкой', () => {
    storage.setItem(V1, JSON.stringify(['acorn', 'pine']));
    storage.failOnWrite(1);
    openStore();
    storage.failOnWrite(1);
    save.addToCollection(['ball']);
    expect(storage.getItem(FORMAT)).toBeNull();
    openStore();
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'pine', 'ball']));
    expect(storage.getItem(FORMAT)).toBe('2');
  });

  it('музей, стёртый в 1.1 (v2 = []), от такой записи не воскресает', () => {
    storage.setItem(V2, '[]');
    storage.setItem(V1, JSON.stringify(['acorn']));
    storage.failOnWrite(1);
    openStore();
    save.addToCollection(['ball']);
    expect(save.loadCollection()).toEqual(['ball']);
    openStore();
    expect(save.loadCollection()).toEqual(['ball']);
  });
});

describe('миграция не легла, а потом упала замена (О9-5)', () => {
  const target = { [SPECS.current.key]: '3' };
  const META = { game: '1.2.0', now: new Date(0) };

  it('повтор перед заменой лёг, сама замена упала → откат оставляет музей первой сборки', () => {
    storage.setItem(V1, JSON.stringify(['acorn', 'pine']));
    storage.failOnWrite(1);
    openStore();
    expect(storage.getItem(V2)).toBeNull();

    // Повтор миграции: v2, второй номер, формат; потом копия, метка и первая запись цели — падает.
    storage.failOnWrite(6);
    expect(replaceProgress(target, 'restore', META)).toBe('no-space');
    expect(storage.getItem(FORMAT)).toBe('2');
    openStore();
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'pine']));
  });

  it('повтор перед заменой тоже не лёг: музей из памяти уходит в копию и возвращается откатом', () => {
    storage.setItem(V1, JSON.stringify(['acorn', 'pine']));
    storage.failOnWrite(1);
    openStore();

    // v2:collection не ложится, пока не упадёт запись цели: тогда место «освобождается».
    const set = storage.setItem.bind(storage);
    let blocked = true;
    storage.setItem = (key: string, value: string): void => {
      if (blocked && key === V2) throw new Error('v2 не ложится');
      if (key === SPECS.current.key) {
        blocked = false;
        throw new Error('цель не легла');
      }
      set(key, value);
    };
    expect(replaceProgress(target, 'restore', META)).toBe('no-space');
    const backup = JSON.parse(storage.getItem(SERVICE_KEYS.backup) ?? 'null') as {
      keys: Record<string, string>;
    };
    expect(JSON.parse(backup.keys[V2] ?? 'null')).toEqual(['acorn', 'pine']);
    storage.setItem = set;
    openStore();
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'pine']));
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
  });
});

describe('проводка main.ts: хранилище до игры, перезагрузка только по своим ключам', () => {
  // Сцену и main не запустить без браузера: читаем код, как для «уголок взрослых зовёт общий сброс».
  // Без комментариев: «после `openStore()`» в комментарии не должно выдавать себя за вызов.
  const main = readFileSync('src/main.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '');

  it('openStore() вызван раньше new Phaser.Game(', () => {
    const open = main.indexOf('openStore()');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(open).toBeLessThan(main.indexOf('new Phaser.Game('));
  });

  it('слушатель storage зовёт shouldReloadOn(event.key), и только для localStorage', () => {
    const listener = main.slice(main.indexOf("addEventListener('storage'"));
    const line = listener.slice(0, listener.indexOf('\n  });'));
    expect(line).toContain('shouldReloadOn(event.key)');
    expect(line).toContain('isStoreArea(event.storageArea)');
    expect(line).toContain('location.reload()');
  });

  it('isStoreArea: свой localStorage — да, чужое хранилище и null — нет', () => {
    expect(isStoreArea(storage as unknown as Storage)).toBe(true);
    expect(isStoreArea(new MemoryStorage() as unknown as Storage)).toBe(false);
    expect(isStoreArea(null)).toBe(false);
  });
});

describe('перезагрузка вкладки по чужой записи (001-36)', () => {
  it('номера, метка замены и clear() перезагружают; прогресс и журнал нет', () => {
    expect(shouldReloadOn(FORMAT)).toBe(true);
    expect(shouldReloadOn(MIN_WRITER)).toBe(true);
    expect(shouldReloadOn(SERVICE_KEYS.restore)).toBe(true);
    expect(shouldReloadOn(null)).toBe(true);
    expect(shouldReloadOn(SERVICE_KEYS.journal)).toBe(false);
    expect(shouldReloadOn(SERVICE_KEYS.crash)).toBe(false);
    expect(shouldReloadOn(SERVICE_KEYS.backup)).toBe(false);
    for (const spec of PROGRESS_KEYS) expect(shouldReloadOn(spec.key)).toBe(false);
    expect(shouldReloadOn('чужой-ключ')).toBe(false);
  });
});
