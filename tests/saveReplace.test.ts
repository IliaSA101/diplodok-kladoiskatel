/**
 * Замена прогресса, «Стереть всё», резервная копия и докат при запуске (design 001, 6.4–6.5).
 *
 * Ошибка здесь стоит прогресса ребёнка и не видна, пока не случится: стёрли без копии,
 * оборвалась запись цели — и на следующем запуске половина старого и половина нового,
 * откат вернул старую копию вместо пустого. Поэтому у каждого исхода проверяется
 * не ответ функции, а побайтное состояние хранилища.
 *
 * Отдельный файл: `saveFile.test.ts` у порога в шестьсот строк. Кейсы стирания из
 * `save.test.ts` остаются там и проходят без правки. Подмена хранилища — `memoryStorage.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { eraseAllProgress, eraseAnswerText } from '../src/systems/eraseAll';
import { questSave } from '../src/systems/questSave';
import { save } from '../src/systems/save';
import { checkProgressFile } from '../src/systems/saveFile';
import {
  PROGRESS_KEYS,
  SAVE_PREFIX as P,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
} from '../src/systems/saveKeys';
import {
  eraseProgress,
  parseMarker,
  replaceProgress,
  type BackupEnvelope,
  type ReplaceMeta,
} from '../src/systems/saveReplace';
import { clearHeldBack, heldBack, openStore, readKey } from '../src/systems/saveStore';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';

let storage: MemoryStorage;

beforeEach(() => {
  installMemoryStorage();
  openStore(); // сбрасывает режим прошлого кейса
  storage = installMemoryStorage();
  clearHeldBack();
});

const META: ReplaceMeta = { game: '1.2.0', now: new Date(Date.UTC(2026, 10, 6, 11, 32, 5)) };
const FORMAT = SERVICE_KEYS.format;
const MIN_WRITER = SERVICE_KEYS.minWriter;
const V1 = P + 'v1:collection';
const SOLVED = SPECS.solved.key;
const LEVELS = SPECS.levels.key;

function fixtureStorage(name: string): Record<string, string> {
  const path = join(__dirname, 'fixtures', `save-${name}.json`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { storage: Record<string, string> }).storage;
}

function load(name: string): void {
  for (const [key, value] of Object.entries(fixtureStorage(name))) storage.setItem(key, value);
  openStore();
}

/** Девять ключей прогресса как лежат в хранилище: «отпечаток» для сравнения до и после. */
function nine(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of PROGRESS_KEYS) {
    const raw = storage.getItem(spec.key);
    if (raw !== null) out[spec.key] = raw;
  }
  return out;
}

function backup(): BackupEnvelope {
  return JSON.parse(storage.getItem(SERVICE_KEYS.backup) ?? 'null') as BackupEnvelope;
}

function slots(prefix: string): string[] {
  return [...storage.items.keys()].filter((key) => key.startsWith(prefix)).sort();
}

/** Файл, который выгрузили бы из хранилища, — проверенный: его `keys` и есть цель замены. */
function targetOf(name: string, format = 2): Record<string, string> {
  const keys = fixtureStorage(name);
  const text = JSON.stringify({ kind: 'diplodok-progress', format, game: 'x', savedAt: 'y', keys });
  const verdict = checkProgressFile(text, text.length);
  if (!verdict.ok) throw new Error(`фикстура ${name} не проходит проверку`);
  return verdict.keys;
}

describe('«Стереть всё»: копия, потом стирание', () => {
  it('в backup — конверт, понятые keys, v1 и сырые копии битого; слоты освобождены', () => {
    load('1.1.1-broken');
    storage.setItem(V1, '["coin"]');
    const sources = fixtureStorage('1.1.1-broken');
    const broken = Object.fromEntries(
      slots(P + 'broken:').map((slot) => [slot, storage.getItem(slot) ?? '']),
    );
    expect(Object.keys(broken).length).toBeGreaterThan(0);
    const understood = Object.fromEntries(
      PROGRESS_KEYS.filter((spec) => spec.key in sources).map((spec) => [
        spec.key,
        JSON.stringify(readKey(spec)),
      ]),
    );

    expect(eraseProgress(META)).toBe('ok');

    expect(backup()).toEqual({
      kind: 'diplodok-progress',
      format: 2,
      game: '1.2.0',
      savedAt: '2026-11-06T11:32:05.000Z',
      reason: 'erase',
      keys: understood,
      v1: { [V1]: '["coin"]' },
      broken,
      heldBack: {},
    });
    expect(slots(P + 'broken:')).toEqual([]);
    expect(slots(P + 'v1:')).toEqual([]);
    // Звук в фикстуре с потерей: остаётся понятое, исходник лежит в backup.broken.
    expect(nine()).toEqual({ [SPECS.settings.key]: '{"muted":false}' });
    expect(save.loadCollection()).toEqual([]);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(storage.getItem(MIN_WRITER)).toBe('2');
  });

  it('обрезанный quest-solved после стирания не пропадает: его сырая строка — в backup.broken', () => {
    storage.setItem(SOLVED, '["q1","q2"');
    openStore();
    expect(questSave.solvedNodes()).toEqual([]);
    expect(eraseProgress(META)).toBe('ok');
    expect(backup().broken[brokenKey(SOLVED)]).toBe('["q1","q2"');
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
  });

  it('исходник, не лёгший в слот (heldBack), уходит в backup, а в памяти его больше нет', () => {
    openStore();
    storage.setItem(brokenKey(SOLVED), 'ранняя поломка');
    storage.setItem(SOLVED, '["q1",5]');
    expect(questSave.solvedNodes()).toEqual(['q1']);
    expect(heldBack()[SOLVED]).toBe('["q1",5]');

    expect(eraseProgress(META)).toBe('ok');

    expect(backup().heldBack).toEqual({ [SOLVED]: '["q1",5]' });
    expect(backup().broken[brokenKey(SOLVED)]).toBe('ранняя поломка');
    expect(heldBack()).toEqual({});
  });

  it('звук взрослого, журнал, крушение и номера формата остаются', () => {
    load('1.1.1');
    save.saveSettings({ muted: true });
    storage.setItem(SERVICE_KEYS.journal, '[1]');
    storage.setItem(SERVICE_KEYS.crash, '{}');
    expect(eraseProgress(META)).toBe('ok');
    expect(save.loadSettings()).toEqual({ muted: true });
    expect(storage.getItem(SERVICE_KEYS.journal)).toBe('[1]');
    expect(storage.getItem(SERVICE_KEYS.crash)).toBe('{}');
    expect(nine()).toEqual({ [SPECS.settings.key]: '{"muted":true}' });
  });

  it('второе стирание подряд копию не трогает (I2)', () => {
    load('1.1.1');
    expect(eraseProgress(META)).toBe('ok');
    const first = storage.getItem(SERVICE_KEYS.backup);
    expect(JSON.parse(first ?? 'null')).toMatchObject({ reason: 'erase' });
    expect(eraseProgress({ game: '9.9.9', now: new Date(0) })).toBe('ok');
    expect(storage.getItem(SERVICE_KEYS.backup)).toBe(first);
    expect(Object.keys(backup().keys)).toContain(SOLVED);
  });

  it('одно только выключенное звуком состояние — не повод для копии', () => {
    save.saveSettings({ muted: true });
    expect(eraseProgress(META)).toBe('ok');
    expect(storage.getItem(SERVICE_KEYS.backup)).toBeNull();
    expect(save.loadSettings()).toEqual({ muted: true });
  });

  it('метка ставится и снимается: соседняя вкладка видит событие, а после ok метки нет', () => {
    load('1.1.1');
    const seen: (string | null)[] = [];
    const set = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string): void => {
      if (key === SERVICE_KEYS.restore) seen.push(value);
      set(key, value);
    };
    expect(eraseProgress(META)).toBe('ok');
    expect(seen).toHaveLength(1);
    expect(parseMarker(seen[0] ?? '')).toMatchObject({ reason: 'erase', backup: true });
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
  });
});

describe('круг «в файл → стереть → из файла» и возврат из резервной копии', () => {
  it('полное сохранение 1.1.1: стереть, вернуть из файла — тот же отпечаток (C)', () => {
    load('1.1.1');
    const before = nine();
    const text = JSON.stringify({ kind: 'diplodok-progress', format: 2, game: 'x', savedAt: 'y', keys: before });
    expect(eraseProgress(META)).toBe('ok');
    expect(Object.keys(nine())).toEqual([SPECS.settings.key]);

    const verdict = checkProgressFile(text, text.length);
    if (!verdict.ok) throw new Error('свой файл отвергнут');
    expect(replaceProgress(verdict.keys, 'restore', META)).toBe('ok');

    expect(nine()).toEqual(before);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    // Состояние до замены было пустым — копия стирания осталась, пустое её не затёрло.
    expect(backup().reason).toBe('erase');
  });

  it('копия, скачанная файлом, принимается обычной проверкой и возвращает всё как было (I3)', () => {
    load('1.1.1');
    const before = nine();
    expect(eraseProgress(META)).toBe('ok');
    const text = JSON.stringify(backup(), null, 2);
    const verdict = checkProgressFile(text, text.length);
    if (!verdict.ok) throw new Error('копию отвергла проверка файла');
    expect(verdict.file.backupOf).toBe('2026-11-06T11:32:05.000Z');
    expect(replaceProgress(verdict.keys, 'restore', META)).toBe('ok');
    expect(nine()).toEqual(before);
  });

  it('замена убирает то, чего нет в файле: ключи, v1:* и копии битого; номера формата ставит', () => {
    load('1.0.0');
    storage.setItem(brokenKey(LEVELS), '{ сломано');
    const target = { [SPECS.current.key]: '3' };
    expect(replaceProgress(target, 'restore', META)).toBe('ok');
    expect(nine()).toEqual(target);
    expect(slots(P + 'v1:')).toEqual([]);
    expect(slots(P + 'broken:')).toEqual([]);
    expect(backup()).toMatchObject({ reason: 'restore', v1: { [V1]: expect.any(String) as string } });
    expect(backup().broken[brokenKey(LEVELS)]).toBe('{ сломано');
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(storage.getItem(MIN_WRITER)).toBe('2');
  });
});

describe('нет места: ничего не тронуто (E)', () => {
  it('под backup места нет: стирание и замена отвечают no-space, хранилище побайтно то же', () => {
    load('1.1.1');
    storage.setItem(SERVICE_KEYS.backup, '{"старая":"копия"}');
    storage.setItem(V1, '["coin"]');
    storage.quota = storage.used() + 10;
    const before = storage.dump();
    expect(eraseProgress(META)).toBe('no-space');
    expect(storage.dump()).toBe(before);
    expect(replaceProgress(targetOf('1.0.0', 1), 'restore', META)).toBe('no-space');
    expect(storage.dump()).toBe(before);
  });

  it('копия легла, метка нет: no-space, прогресс на месте, метки нет', () => {
    load('1.1.1');
    const before = nine();
    expect(eraseProgress(META)).toBe('ok'); // замер размера копии
    const size = (storage.getItem(SERVICE_KEYS.backup) ?? '').length + SERVICE_KEYS.backup.length;
    storage.clear();
    load('1.1.1');
    storage.quota = storage.used() + size + 10;
    expect(eraseProgress(META)).toBe('no-space');
    expect(nine()).toEqual(before);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(storage.getItem(SERVICE_KEYS.backup)).not.toBeNull();
  });
});

describe('обрыв: метка, докат и откат (D, J1, J2)', () => {
  it('обрыв на 4-й записи → interrupted, метка есть → запуск даёт ровно файл, метки нет (D)', () => {
    load('1.0.0');
    const target = targetOf('1.1.1');
    storage.failAfter(3); // копия, метка, первый ключ цели; четвёртая и дальше бросают
    expect(replaceProgress(target, 'restore', META)).toBe('interrupted');
    expect(parseMarker(storage.getItem(SERVICE_KEYS.restore) ?? '')).toMatchObject({
      backup: true,
      keys: target,
    });

    storage.failAfter(Infinity);
    expect(openStore()).toBe('rolled-forward');
    expect(nine()).toEqual(target);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(slots(P + 'v1:')).toEqual([]);
  });

  it('одна запись цели упала при пустом текущем → откат к пустому, а не к старой копии (J1)', () => {
    load('1.1.1');
    expect(eraseProgress(META)).toBe('ok');
    const old = storage.getItem(SERVICE_KEYS.backup);
    storage.failOnWrite(3); // метка, первый ключ цели, второй — падает
    expect(replaceProgress(targetOf('1.1.1'), 'restore', META)).toBe('no-space');
    expect(Object.keys(nine())).toEqual([SPECS.settings.key]);
    expect(storage.getItem(SERVICE_KEYS.backup)).toBe(old);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
  });

  it('то же при запуске: метка без копии и старая копия в слоте → откат к пустому, метка снята (J1)', () => {
    load('1.1.1');
    expect(eraseProgress(META)).toBe('ok');
    const marker = { format: 2, minWriter: 2, reason: 'restore', backup: false, keys: targetOf('1.1.1') };
    storage.setItem(SERVICE_KEYS.restore, JSON.stringify(marker));
    storage.failOnWrite(2);
    expect(openStore()).toBe('rolled-back');
    expect(Object.keys(nine())).toEqual([SPECS.settings.key]);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
  });

  it('замена упала посреди записи цели при непустом прогрессе → откат ровно к прежнему (J2)', () => {
    load('1.1.1');
    storage.setItem(V1, '["coin"]');
    storage.setItem(brokenKey(LEVELS), '{ сломано');
    const withoutCopy = (): string =>
      JSON.stringify([...storage.items].filter(([key]) => key !== SERVICE_KEYS.backup).sort());
    const before = withoutCopy();
    storage.failOnWrite(3); // копия, метка, первый ключ цели — падает
    expect(replaceProgress({ [SPECS.current.key]: '3' }, 'restore', META)).toBe('no-space');
    expect(withoutCopy()).toBe(before);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(backup().reason).toBe('restore');
  });

  it('стёрли, замена оборвана сразу после метки, докат упал → стёртое не воскресает (метка backup: false)', () => {
    load('1.1.1');
    expect(eraseProgress(META)).toBe('ok'); // в слоте лежит копия настоящего прогресса
    storage.failAfter(1); // метка ложится, первая запись цели — нет
    expect(replaceProgress(targetOf('1.0.0', 1), 'restore', META)).toBe('interrupted');
    // Состояние до замены было пустым: копию замена не делала, и метка не должна на неё ссылаться.
    const marker = parseMarker(storage.getItem(SERVICE_KEYS.restore) ?? '');
    expect(marker).toMatchObject({ reason: 'restore', backup: false });

    storage.failAfter(Infinity);
    storage.failOnWrite(1); // докат при запуске падает на первой записи
    expect(openStore()).toBe('rolled-back');
    expect(Object.keys(nine())).toEqual([SPECS.settings.key]);
    expect(slots(P + 'v1:')).toEqual([]);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(backup().reason).toBe('erase'); // копия стирания на месте, но к ней не откатывались
  });

  it('при запуске откат после упавшего доката возвращает и копии битого (J2)', () => {
    load('1.0.0');
    storage.setItem(brokenKey(LEVELS), '{ сломано');
    const brokenBefore = storage.getItem(brokenKey(LEVELS));
    storage.failAfter(3);
    expect(replaceProgress(targetOf('1.1.1'), 'restore', META)).toBe('interrupted');
    storage.failAfter(Infinity);
    storage.failOnWrite(1);
    expect(openStore()).toBe('rolled-back');
    expect(storage.getItem(brokenKey(LEVELS))).toBe(brokenBefore);
    expect(slots(P + 'broken:')).toEqual([brokenKey(LEVELS)]);
  });

  it('докат при запуске упал → откат к backup, метка снята, узел следующей сессии цел (J2)', () => {
    load('1.0.0');
    const before = nine();
    const v1 = storage.getItem(V1);
    storage.failAfter(3);
    expect(replaceProgress(targetOf('1.1.1'), 'restore', META)).toBe('interrupted');
    storage.failAfter(Infinity);
    storage.failOnWrite(1); // первая запись докатки падает

    expect(openStore()).toBe('rolled-back');
    expect(nine()).toEqual(before);
    expect(storage.getItem(V1)).toBe(v1);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();

    questSave.markSolved('q40', 'sticker-x');
    expect(questSave.isSolved('q40')).toBe(true);
    expect(openStore()).toBe('ok');
    expect(questSave.isSolved('q40')).toBe(true);
  });

  it('битый номер формата перед докаткой откладывается: докатка перепишет оба', () => {
    storage.setItem(FORMAT, 'абв');
    const marker = { format: 2, minWriter: 2, reason: 'restore', backup: false, keys: { [SPECS.current.key]: '5' } };
    storage.setItem(SERVICE_KEYS.restore, JSON.stringify(marker));
    expect(openStore()).toBe('rolled-forward');
    expect(storage.getItem(brokenKey(FORMAT))).toBe('абв');
    expect(storage.getItem(FORMAT)).toBe('2');
    expect(save.loadCurrentLevel()).toBe(5);
  });

  it('метка с цельным форматом, но непонятным телом — копия и снятие, прогресс не тронут', () => {
    storage.setItem(SPECS.current.key, '4');
    const bad = JSON.stringify({ format: 2, reason: 'restore', backup: true, keys: [] });
    storage.setItem(SERVICE_KEYS.restore, bad);
    openStore();
    expect(storage.getItem(brokenKey(SERVICE_KEYS.restore))).toBe(bad);
    expect(storage.getItem(SERVICE_KEYS.restore)).toBeNull();
    expect(save.loadCurrentLevel()).toBe(4);
  });
});

describe('режимы: замена и стирание только в normal (H1, H3)', () => {
  const marker = (format: number): string =>
    JSON.stringify({ format, minWriter: format, reason: 'restore', backup: true, keys: { [SPECS.current.key]: '9' } });

  it('метка формата 3 → future, хранилище побайтно то же, цель не записана (H3)', () => {
    storage.setItem(SPECS.current.key, '7');
    storage.setItem(SERVICE_KEYS.restore, marker(3));
    const before = storage.dump();
    expect(openStore()).toBe('future');
    expect(storage.dump()).toBe(before);
    expect(save.loadCurrentLevel()).toBe(7);
  });

  it('newer: стирание и замена — refused, хранилище то же; метка формата 2 не докатывается', () => {
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '2');
    storage.setItem(SPECS.current.key, '7');
    storage.setItem(SERVICE_KEYS.restore, marker(2));
    expect(openStore()).toBe('newer');
    const before = storage.dump();
    expect(eraseProgress(META)).toBe('refused');
    expect(eraseAllProgress()).toBe('refused');
    expect(replaceProgress({}, 'restore', META)).toBe('refused');
    expect(storage.dump()).toBe(before);
  });

  it('future: refused; сессия, в которой другая вкладка подняла формат, — тоже', () => {
    openStore();
    save.saveCurrentLevel(3);
    storage.setItem(FORMAT, '3');
    storage.setItem(MIN_WRITER, '3');
    const before = storage.dump();
    expect(eraseAllProgress()).toBe('refused');
    expect(storage.dump()).toBe(before);
  });

  it('хранилище недоступно: refused', () => {
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
    expect(eraseAllProgress()).toBe('refused');
  });

  it('метка: форма проверяется, а у метки новее формат не спрашивается', () => {
    expect(parseMarker(marker(2))).toMatchObject({ reason: 'restore', backup: true });
    expect(parseMarker(marker(3))).toBe('future');
    expect(parseMarker(JSON.stringify({ format: 3 }))).toBe('future');
    expect(parseMarker('{ сломано')).toBeNull();
    expect(parseMarker('[]')).toBeNull();
    expect(parseMarker(JSON.stringify({ format: 2, reason: 'wat', backup: true, keys: {} }))).toBeNull();
    expect(parseMarker(JSON.stringify({ format: 2, reason: 'erase', backup: 1, keys: {} }))).toBeNull();
    expect(parseMarker(JSON.stringify({ format: 2, reason: 'erase', backup: true, keys: { 'чужой': '1' } }))).toBeNull();
    expect(parseMarker(JSON.stringify({ format: 2, reason: 'erase', backup: true, keys: { [SOLVED]: 5 } }))).toBeNull();
  });
});

describe('ответ взрослому', () => {
  it('no-space и refused — слово, ok и interrupted — нет (перезапуск и перезагрузка делает сцена)', () => {
    expect(eraseAnswerText('ok')).toBeNull();
    expect(eraseAnswerText('interrupted')).toBeNull();
    expect(eraseAnswerText('no-space')).toContain('ничего не стёрто');
    expect(eraseAnswerText('refused')).toContain('нельзя');
  });

  it('сцена разбирает все четыре ответа: перезапуск, перезагрузка, слово', () => {
    // Стирание живёт в меню взрослых (этап 8): ответ разбирает оно, а не стартовая сцена.
    const scene = readFileSync('src/scenes/parentsMenu.ts', 'utf8');
    expect(scene).toContain("afterErase(scene, eraseAllProgress())");
    expect(scene).toContain("result === 'ok'");
    expect(scene).toContain("result === 'interrupted'");
    expect(scene).toContain('location.reload()');
    expect(scene).toContain('eraseAnswerText(result)');
  });
});
