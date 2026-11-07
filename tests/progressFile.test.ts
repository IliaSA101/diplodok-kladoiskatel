/**
 * Файл прогресса: проверка того, что принёс взрослый, и выгрузка своего (design 001, 6.1–6.3).
 *
 * Ошибка здесь тихая в обе стороны. Приняли лишнее — «Прогресс из файла» стёр бы
 * настоящий прогресс ребёнка чужим или битым. Отказали своему файлу — взрослый не может
 * вернуть то, что сам выгрузил. Поэтому у каждого отказа проверяется, что хранилище после
 * него побайтно то же, а у каждой выгрузки — что собственный файл проходит проверку.
 *
 * Отдельный файл: `saveFile.test.ts` у порога в шестьсот строк, там тесные места хранилища.
 * Хранилище — `tests/memoryStorage.ts`, фикстуры — `tests/fixtures/save-*.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  PROGRESS_KEYS,
  SAVE_FORMAT,
  SAVE_PREFIX as P,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
} from '../src/systems/saveKeys';
import {
  PROGRESS_KIND,
  REFUSED_REASON,
  REFUSED_TITLE,
  buildProgressFile,
  checkProgressFile,
  progressFileName,
  progressFileText,
  type FileVerdict,
  type ProgressEnvelope,
  type RefuseReason,
} from '../src/systems/saveFile';
import { clearHeldBack, openStore, readKey } from '../src/systems/saveStore';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';

let storage: MemoryStorage;

beforeEach(() => {
  installMemoryStorage();
  openStore(); // сбрасывает режим прошлого кейса
  storage = installMemoryStorage();
  clearHeldBack();
});

const NAMES = ['pre-1.0', '1.0.0', '1.1.0', '1.1.1', '1.1.1-erased', '1.1.1-broken'];

function fixtureStorage(name: string): Record<string, string> {
  const path = join(__dirname, 'fixtures', `save-${name}.json`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { storage: Record<string, string> }).storage;
}

function load(name: string): void {
  for (const [key, value] of Object.entries(fixtureStorage(name))) storage.setItem(key, value);
  openStore();
}

const K = {
  current: SPECS.current.key,
  levels: SPECS.levels.key,
  completed: SPECS.completed.key,
  collection: SPECS.collection.key,
  settings: SPECS.settings.key,
  solved: SPECS.solved.key,
  stickers: SPECS.stickers.key,
  english: SPECS.englishDone.key,
  skill: SPECS.skill.key,
  v1Collection: P + 'v1:collection',
};

const NOW = new Date(2026, 10, 6, 14, 32, 5);

function envelope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: PROGRESS_KIND, format: 2, game: '1.2.0', savedAt: '2026-11-06T11:32:05.000Z', keys: {}, ...over };
}

function verdictOf(file: unknown): FileVerdict {
  const text = typeof file === 'string' ? file : JSON.stringify(file);
  return checkProgressFile(text, new TextEncoder().encode(text).length);
}

function refusal(verdict: FileVerdict): RefuseReason | 'accepted' {
  return verdict.ok ? 'accepted' : verdict.reason;
}

describe('полное сохранение: в файл и обратно', () => {
  it('фикстура 1.1.1 → файл меньше десятой доли предела → проходит проверку', () => {
    load('1.1.1');
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    const text = progressFileText(file);
    const size = new TextEncoder().encode(text).length;
    expect(size).toBeLessThan(CONFIG.save.fileMaxBytes / 10);
    const verdict = checkProgressFile(text, size);
    expect(refusal(verdict)).toBe('accepted');
    if (!verdict.ok) return;
    // Фикстура лежит в формате JSON.stringify, поэтому строки в файле — те же, что в хранилище.
    const nine = Object.fromEntries(PROGRESS_KEYS.map((spec) => [spec.key, fixtureStorage('1.1.1')[spec.key]]));
    expect(verdict.keys).toEqual(nine);
    expect(file.keys).toEqual(nine);
    expect(verdict.format).toBe(2);
  });

  it('сводка: 48 лесов, 48 узлов, все игры английского; «сейчас» — то же хранилище', () => {
    load('1.1.1');
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    const verdict = verdictOf(file);
    if (!verdict.ok) throw new Error('свой файл отвергнут');
    const english = (JSON.parse(fixtureStorage('1.1.1')[K.english] ?? '[]') as string[]).length;
    expect(english).toBeGreaterThan(0);
    expect(verdict.file).toEqual({ forests: 48, quest: 48, english });
    expect(verdict.current).toEqual(verdict.file);
  });

  for (const name of NAMES) {
    it(`сборка ${name}: свой файл проходит проверку, значения — то, что показывает игра`, () => {
      load(name);
      const file = buildProgressFile('1.2.0', NOW);
      if (typeof file === 'string') throw new Error('normal не выгрузил');
      const verdict = verdictOf(file);
      expect(refusal(verdict)).toBe('accepted');
      for (const spec of PROGRESS_KEYS) {
        const text = file.keys[spec.key];
        if (text === undefined) continue;
        expect(text, spec.key).toBe(JSON.stringify(readKey(spec)));
      }
    });
  }

  it('в файл идут только девять ключей, и только те, что есть в хранилище', () => {
    storage.setItem(K.current, '4');
    openStore();
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(file.keys).toEqual({ [K.current]: '4' });
    expect(file).toMatchObject({ kind: 'diplodok-progress', format: SAVE_FORMAT, game: '1.2.0' });
    expect(file.savedAt).toBe(NOW.toISOString());
  });

  it('служебные ключи, v1:* и копии битого в файл не идут', () => {
    load('1.0.0');
    storage.setItem(brokenKey(K.levels), '{x');
    storage.setItem(SERVICE_KEYS.backup, '{}');
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    const nine = PROGRESS_KEYS.map((spec) => spec.key);
    expect(Object.keys(file.keys).length).toBeGreaterThan(0);
    expect(Object.keys(file.keys).every((key) => nine.includes(key))).toBe(true);
  });

  it('пустое хранилище: файл без ключей тоже файл', () => {
    openStore();
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(file.keys).toEqual({});
    expect(refusal(verdictOf(file))).toBe('accepted');
  });
});

describe('отказы: хранилище после них побайтно то же (C)', () => {
  const cases: [string, unknown, RefuseReason][] = [
    ['формат 3', envelope({ format: 3 }), 'future'],
    ['формат 3 с чужим ключом — новее важнее', envelope({ format: 3, keys: { 'x:y': '1' } }), 'future'],
    ['{"a":1}', { a: 1 }, 'foreign'],
    ['отчёт о сбое', { kind: 'diplodok-report', format: 2, game: '1.2.0', keys: {}, storage: {} }, 'foreign'],
    ['массив', [1, 2], 'foreign'],
    ['число', 5, 'foreign'],
    ['null', null, 'foreign'],
    ['формат 0', envelope({ format: 0 }), 'foreign'],
    ['формат 1.5', envelope({ format: 1.5 }), 'foreign'],
    ['формат строкой', envelope({ format: '2' }), 'foreign'],
    ['без формата', { kind: PROGRESS_KIND, keys: {} }, 'foreign'],
    ['keys — массив', envelope({ keys: [] }), 'foreign'],
    ['keys — null', envelope({ keys: null }), 'foreign'],
    ['чужой kind', envelope({ kind: 'other' }), 'foreign'],
    ['чужой ключ', envelope({ keys: { [P + 'v9:wat']: '1' } }), 'foreign'],
    ['служебный ключ', envelope({ keys: { [SERVICE_KEYS.backup]: '{}' } }), 'foreign'],
    ['копия битого в keys', envelope({ keys: { [brokenKey(K.levels)]: '{}' } }), 'foreign'],
    ['ключ из чужой игры', envelope({ keys: { 'other:v2:current': '1' } }), 'foreign'],
    ['значение — число, а не строка', envelope({ keys: { [K.current]: 4 } }), 'foreign'],
    ['v1:* в файле формата 2', envelope({ keys: { [K.v1Collection]: '["coin"]' } }), 'foreign'],
    ['неизвестный v1-ключ в формате 1', envelope({ format: 1, keys: { [P + 'v1:wat']: '1' } }), 'foreign'],
    ['"0" у v2:current', envelope({ keys: { [K.current]: '0' } }), 'broken-value'],
    ['обрезанный quest-solved', envelope({ keys: { [K.solved]: '["q1","q2"' } }), 'broken-value'],
    ['число среди наклеек', envelope({ keys: { [K.stickers]: '["a",5]' } }), 'broken-value'],
    ['звук строкой', envelope({ keys: { [K.settings]: '{"muted":"yes"}' } }), 'broken-value'],
    ['ступень строкой', envelope({ keys: { [K.skill]: '{"sudoku":"2"}' } }), 'broken-value'],
    ['леса — массив', envelope({ keys: { [K.levels]: '[]' } }), 'broken-value'],
    ['одно битое среди хороших', envelope({ keys: { [K.current]: '3', [K.solved]: '["q1"]', [K.completed]: '[1,"x"]' } }), 'broken-value'],
  ];

  for (const [name, file, reason] of cases) {
    it(`${name} → ${reason}`, () => {
      load('1.1.1');
      const before = storage.dump();
      const sets = storage.sets;
      expect(refusal(verdictOf(file))).toBe(reason);
      expect(storage.dump()).toBe(before);
      expect(storage.sets).toBe(sets);
    });
  }

  it('обрезанный текст и не-JSON → not-json', () => {
    load('1.1.1');
    const before = storage.dump();
    const whole = JSON.stringify(envelope({ keys: { [K.current]: '3' } }));
    for (const text of [whole.slice(0, whole.length - 5), '', 'не json', '{']) {
      expect(refusal(verdictOf(text)), text).toBe('not-json');
    }
    expect(storage.dump()).toBe(before);
  });

  it('больше предела → too-big по размеру, а текст при этом исправный', () => {
    load('1.1.1');
    const before = storage.dump();
    const text = JSON.stringify(envelope());
    expect(refusal(checkProgressFile(text, CONFIG.save.fileMaxBytes + 1))).toBe('too-big');
    expect(refusal(checkProgressFile(text, CONFIG.save.fileMaxBytes))).toBe('accepted');
    expect(refusal(checkProgressFile('{ обрезано', CONFIG.save.fileMaxBytes + 1))).toBe('too-big');
    expect(storage.dump()).toBe(before);
  });

  it('удачная проверка тоже ничего не пишет, даже при битом хранилище', () => {
    load('1.1.1');
    storage.setItem(K.completed, '[1,"x"]'); // после openStore: копии ещё нет, а сводка это ключ читает
    const before = storage.dump();
    expect(refusal(verdictOf(envelope({ keys: { [K.current]: '3' } })))).toBe('accepted');
    expect(storage.dump()).toBe(before);
  });

  it('у каждой причины есть текст для взрослого, и тексты разные там, где причины разные', () => {
    expect(REFUSED_TITLE).toBe('Файл не подходит');
    expect(REFUSED_REASON['future']).toBe('Это файл из новой версии игры');
    expect(REFUSED_REASON['not-json']).toBe('Файл обрезан или испорчен');
    expect(REFUSED_REASON['foreign']).toBe('Это не файл прогресса этой игры');
    expect(REFUSED_REASON['too-big']).toBe('Файл слишком большой');
    expect(REFUSED_REASON['broken-value']).toBeTruthy();
  });
});

describe('набор ключей берётся по формату файла (6.2.5)', () => {
  it('файл формата 1 из фикстуры 1.0.0, с v1:*, принимается; v1:* в ключи цели не идут (C2)', () => {
    const fx = fixtureStorage('1.0.0');
    expect(Object.keys(fx).some((key) => key.includes(':v1:'))).toBe(true);
    const verdict = verdictOf(envelope({ format: 1, keys: fx }));
    expect(refusal(verdict)).toBe('accepted');
    if (!verdict.ok) return;
    const nine = PROGRESS_KEYS.map((spec) => spec.key);
    expect(Object.keys(verdict.keys).every((key) => nine.includes(key))).toBe(true);
    expect(Object.keys(verdict.keys).sort()).toEqual(nine.filter((key) => key in fx).sort());
  });

  it('музей первой сборки переносится, если v2:collection нет вовсе', () => {
    const verdict = verdictOf(envelope({ format: 1, keys: { [K.v1Collection]: '["coin","egg"]' } }));
    expect(verdict.ok && verdict.keys).toEqual({ [K.collection]: '["coin","egg"]' });
  });

  it('пустой v2:collection (стёрто в 1.1) музей не воскрешает', () => {
    const keys = { [K.v1Collection]: '["coin"]', [K.collection]: '[]' };
    const verdict = verdictOf(envelope({ format: 1, keys }));
    expect(verdict.ok && verdict.keys).toEqual({ [K.collection]: '[]' });
  });

  it('v1:collection, который не разобрать, файл не портит', () => {
    const verdict = verdictOf(envelope({ format: 1, keys: { [K.v1Collection]: '{ обрезано' } }));
    expect(verdict.ok && verdict.keys).toEqual({});
  });

  it('файл формата 2 без v1:* и формата 1 без них — оба принимаются', () => {
    expect(refusal(verdictOf(envelope({ format: 2, keys: { [K.current]: '2' } })))).toBe('accepted');
    expect(refusal(verdictOf(envelope({ format: 1, keys: { [K.current]: '2' } })))).toBe('accepted');
  });

  it('фикстуры всех сборок как файлы формата 1 проходят проверку', () => {
    for (const name of NAMES) {
      const verdict = verdictOf(envelope({ format: 1, keys: fixtureStorage(name) }));
      if (name === '1.1.1-broken') expect(refusal(verdict), name).toBe('broken-value');
      else expect(refusal(verdict), name).toBe('accepted');
    }
  });
});

describe('прочие поля верхнего уровня не смотрятся (6.2.6)', () => {
  it('reason, v1, broken, heldBack, game, savedAt любого вида не мешают', () => {
    const file = envelope({
      game: 5,
      savedAt: null,
      reason: 'erase',
      v1: { [K.v1Collection]: '["coin"]' },
      broken: { [brokenKey(K.solved)]: '["q1"' },
      heldBack: { [K.levels]: '{' },
      whatever: [1, 2, 3],
      keys: { [K.solved]: '["q1"]' },
    });
    expect(refusal(verdictOf(file))).toBe('accepted');
  });

  it('резервная копия — по сводке «от такого-то»; обычный файл — без backupOf', () => {
    const plain = verdictOf(envelope({ keys: { [K.solved]: '["q1"]' } }));
    const copy = verdictOf(envelope({ reason: 'erase', keys: { [K.solved]: '["q1"]' } }));
    expect(plain.ok && 'backupOf' in plain.file).toBe(false);
    expect(copy.ok && copy.file.backupOf).toBe('2026-11-06T11:32:05.000Z');
  });
});

describe('выгрузка при ключе с потерей: свой файл принят, исходник в broken:* (F, 001-31)', () => {
  const RAW = {
    [K.levels]: '{"1":["t0","t1"],"2":["t5"',
    [K.stickers]: '["sticker-header",5]',
    [K.settings]: '{"muted":"yes"}',
    [K.skill]: '{"sudoku":"2","mahjong":1}',
  };

  it('в файле — понятое, оно проходит проверку', () => {
    openStore();
    for (const [key, raw] of Object.entries(RAW)) storage.setItem(key, raw);
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(refusal(verdictOf(file))).toBe('accepted');
    expect(file.keys[K.stickers]).toBe('["sticker-header"]');
    expect(file.keys[K.settings]).toBe('{"muted":false}');
    expect(file.keys[K.skill]).toBe('{"mahjong":1}');
    expect(file.keys[K.levels]).toBe('{}');
    for (const [key, raw] of Object.entries(RAW)) expect(storage.getItem(brokenKey(key)), key).toBe(raw);
  });
});

describe('выгрузка: размер и музей первой сборки, который не успели перенести', () => {
  it('6000 лесов — файл больше предела, выгрузка отвечает too-big, а не файлом, который проверка не примет', () => {
    const levels = Object.fromEntries(
      Array.from({ length: 6000 }, (_, i) => [String(i + 1), ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']]),
    );
    storage.setItem(K.levels, JSON.stringify(levels));
    openStore();
    const before = storage.dump();
    const file = buildProgressFile('1.2.0', NOW);
    expect(typeof file === 'string' ? file : 'файл').toBe('too-big');
    expect(storage.dump() === before).toBe(true);
  });

  it('файл в пределе выгружается, как раньше', () => {
    storage.setItem(K.levels, JSON.stringify({ 1: ['t0'] }));
    openStore();
    expect(typeof buildProgressFile('1.2.0', NOW)).toBe('object');
  });

  it('миграция не легла (нет места): музей v1 попадает в файл, хранилище не тронуто', () => {
    storage.setItem(K.v1Collection, '["coin","egg"]');
    storage.setItem(K.solved, '["q1"]');
    storage.quota = storage.used();
    expect(openStore()).toBe('ok');
    expect(storage.getItem(SERVICE_KEYS.format)).toBeNull();
    const before = storage.dump();
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(file.keys[K.collection]).toBe('["coin","egg"]');
    expect(file.keys[K.solved]).toBe('["q1"]');
    const verdict = verdictOf(file);
    expect(verdict.ok && verdict.keys[K.collection]).toBe('["coin","egg"]');
    expect(storage.dump()).toBe(before);
  });

  it('миграция не легла один раз: выгрузка повторяет её, формат встаёт, музей в файле', () => {
    storage.setItem(K.v1Collection, '["coin","egg"]');
    storage.failOnWrite(1);
    openStore();
    expect(storage.getItem(SERVICE_KEYS.format)).toBeNull();
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(storage.getItem(SERVICE_KEYS.format)).toBe('2');
    expect(file.keys[K.collection]).toBe('["coin","egg"]');
  });

  it('музей, стёртый в 1.1 (v2 = []), при невложенной миграции не воскресает', () => {
    storage.setItem(K.collection, '[]');
    storage.setItem(K.v1Collection, '["coin"]');
    storage.quota = storage.used();
    openStore();
    const file = buildProgressFile('1.2.0', NOW);
    if (typeof file === 'string') throw new Error('normal не выгрузил');
    expect(file.keys[K.collection]).toBe('[]');
  });
});

describe('выгрузка не в обычном режиме → refused (H1, 001-35)', () => {
  function expectRefused(): void {
    const before = storage.dump();
    expect(buildProgressFile('1.2.0', NOW)).toBe('refused');
    expect(storage.dump()).toBe(before);
  }

  it('newer: хранилище новее, но писать можно', () => {
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '2');
    storage.setItem(K.current, '4');
    expect(openStore()).toBe('newer');
    expectRefused();
  });

  it('future: хранилище новее, писать нельзя', () => {
    storage.setItem(SERVICE_KEYS.format, '3');
    storage.setItem(SERVICE_KEYS.minWriter, '3');
    storage.setItem(K.current, '4');
    expect(openStore()).toBe('future');
    expectRefused();
  });

  it('unavailable: к хранилищу нет доступа', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
      removeItem: () => {},
    };
    expect(openStore()).toBe('unavailable');
    expect(buildProgressFile('1.2.0', NOW)).toBe('refused');
  });
});

describe('сводка и имя файла', () => {
  it('узлы считаются только известные QUEST_NODES, без повторов', () => {
    const solved = JSON.stringify(['q1', 'q2', 'q48', 'q49', 'q0', 'wat', 'q1']);
    const verdict = verdictOf(envelope({ keys: { [K.solved]: solved, [K.completed]: '[1,2,3]', [K.english]: '["a:b"]' } }));
    expect(verdict.ok && verdict.file).toEqual({ forests: 3, quest: 3, english: 1 });
  });

  it('«сейчас» считается по хранилищу, а «в файле» — по файлу', () => {
    storage.setItem(K.solved, '["q1","q2","q3","nope"]');
    storage.setItem(K.completed, '[1,2]');
    openStore();
    const verdict = verdictOf(envelope({ keys: { [K.solved]: '["q1"]' } }));
    expect(verdict.ok && verdict.file).toEqual({ forests: 0, quest: 1, english: 0 });
    expect(verdict.ok && verdict.current).toEqual({ forests: 2, quest: 3, english: 0 });
  });

  it('diplodok-progress-2026-11-06.json — по местному времени, с нулями', () => {
    expect(progressFileName(new Date(2026, 10, 6, 14, 32))).toBe('diplodok-progress-2026-11-06.json');
    expect(progressFileName(new Date(2027, 0, 5, 9, 0))).toBe('diplodok-progress-2027-01-05.json');
  });

  describe('местная полночь не уезжает на вчера по UTC', () => {
    const was = process.env['TZ'];
    afterEach(() => {
      if (was === undefined) delete process.env['TZ'];
      else process.env['TZ'] = was;
    });

    it('в Окленде полвторого ночи 6 ноября — файл от 6 ноября', () => {
      process.env['TZ'] = 'Pacific/Auckland';
      const now = new Date(2026, 10, 6, 1, 30);
      expect(now.toISOString().slice(0, 10)).toBe('2026-11-05');
      expect(progressFileName(now)).toBe('diplodok-progress-2026-11-06.json');
    });
  });

  it('текст файла — JSON.stringify(file, null, 2)', () => {
    const file: ProgressEnvelope = {
      kind: PROGRESS_KIND,
      format: 2,
      game: '1.2.0',
      savedAt: NOW.toISOString(),
      keys: { [K.current]: '4' },
    };
    expect(progressFileText(file)).toBe(JSON.stringify(file, null, 2));
  });
});
