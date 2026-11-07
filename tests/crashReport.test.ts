/**
 * Отчёт о сбое (design 001, раздел 8.3): сборка, имя файла, отсев шума, счёт ошибок.
 *
 * Вынесен из `journal.test.ts` на подходе к шестистам строкам: там остались журнал и то,
 * что хранилище ему сообщает, здесь — чистые функции `crashReport.ts`. Подготовка та же:
 * подмена хранилища из `memoryStorage.ts`, часы руками.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  addCrashError,
  buildReport,
  crashError,
  isNoiseError,
  REPORT_KIND,
  reportFileName,
  type CrashError,
  type CrashLog,
  type ReportInput,
} from '../src/systems/crashReport';
import {
  attachStore,
  createCrashTrap,
  crashRecord,
  failureFromError,
  failureFromRejection,
  installCrashTrap,
  type RawFailure,
  type TrapDeps,
} from '../src/crashTrap';
import { createJournal, journal, type JournalEntry } from '../src/systems/journal';
import { checkProgressFile } from '../src/systems/saveFile';
import { SAVE_PREFIX as P, SERVICE_KEYS, SPECS } from '../src/systems/saveKeys';
import { replaceProgress } from '../src/systems/saveReplace';
import {
  clearHeldBack,
  heldBack,
  lastWriteOk,
  mayWrite,
  openStore,
  putKey,
  readKey,
  snapshotAll,
  storeMode,
  writeKey,
} from '../src/systems/saveStore';
import { installMemoryStorage, type MemoryStorage } from './memoryStorage';

let storage: MemoryStorage;
const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1];
const JOURNAL = SERVICE_KEYS.journal;
const META = { game: '1.2.0', now: new Date(Date.UTC(2026, 10, 6, 11, 32, 5)) };

beforeEach(() => {
  installMemoryStorage();
  openStore();
  storage = installMemoryStorage();
  clearHeldBack();
});

describe('отчёт о сбое', () => {
  const NOW = new Date(Date.UTC(2026, 10, 6, 14, 32, 5));
  const input = (over: Partial<ReportInput> = {}): ReportInput => ({
    game: '1.2.0',
    format: 2,
    store: 'normal',
    createdAt: NOW,
    userAgent: 'Mozilla/5.0 (test)',
    renderer: 'webgl',
    window: { width: 1280, height: 720, dpr: 1 },
    errors: [],
    errorsDropped: 0,
    journal: [],
    journalSaved: [],
    heldBack: {},
    storage: {},
    ...over,
  });
  const err = (n: number): CrashError => ({
    at: NOW.toISOString(),
    type: 'error',
    message: `ошибка ${n}`,
  });

  it('несёт версию, формат, режим, время, окно и рендерер', () => {
    const report = buildReport(input({ store: 'newer', renderer: 'none' }));
    expect(report).toMatchObject({
      kind: 'diplodok-report',
      report: 1,
      game: '1.2.0',
      format: 2,
      store: 'newer',
      createdAt: '2026-11-06T14:32:05.000Z',
      userAgent: 'Mozilla/5.0 (test)',
      renderer: 'none',
      window: { width: 1280, height: 720, dpr: 1 },
      errorsDropped: 0,
    });
  });

  it('ошибки, журнал, хвост прошлых сессий и отложенное идут как есть', () => {
    const journal: JournalEntry[] = [{ t: 1520, k: 'scene', d: '{"key":"quest-map"}' }];
    const saved: JournalEntry[] = [{ t: 0, k: 'boot' }];
    const report = buildReport(
      input({ errors: [err(1)], journal, journalSaved: saved, heldBack: { a: 'b' } }),
    );
    expect(report.errors).toEqual([err(1)]);
    expect(report.journal).toEqual(journal);
    expect(report.journalSaved).toEqual(saved);
    expect(report.heldBack).toEqual({ a: 'b' });
  });

  it('storage настоящего хранилища: broken, v1, backup, оба номера — и без journal и crash', () => {
    storage.setItem(P + 'v1:collection', '["coin"]');
    storage.setItem(SPECS.levels.key, '{ сломано');
    openStore();
    writeKey(SPECS.solved, ['q1']);
    const j = createJournal({ now: () => 1000 });
    j.note('scene', { key: 'a' });
    storage.setItem(SERVICE_KEYS.crash, '{}');
    expect(storage.getItem(JOURNAL)).not.toBeNull();
    const before = Object.keys(buildReport(input({ storage: snapshotAll() })).storage);
    expect(before).toEqual(
      expect.arrayContaining([
        SERVICE_KEYS.format,
        SERVICE_KEYS.minWriter,
        P + 'broken:v2:levels',
        P + 'v1:collection',
        SPECS.solved.key,
      ]),
    );
    // Замена кладёт копию и освобождает слоты: теперь в отчёте backup.
    replaceProgress({ [SPECS.solved.key]: '["q2"]' }, 'restore', META);
    const report = buildReport(input({ storage: snapshotAll() }));
    const keys = Object.keys(report.storage);
    expect(keys).toContain(SERVICE_KEYS.backup);
    for (const list of [before, keys]) {
      expect(list).not.toContain(JOURNAL);
      expect(list).not.toContain(SERVICE_KEYS.crash);
    }
    expect(buildReport(input({ storage: { [P + 'broken:v2:levels']: '{ сломано' } })).storage).toEqual({
      [P + 'broken:v2:levels']: '{ сломано',
    });
  });

  it('journal и crash вычищаются и тогда, когда их подсунули во вход', () => {
    const report = buildReport(
      input({ storage: { [JOURNAL]: '[]', [SERVICE_KEYS.crash]: '{}', [SERVICE_KEYS.format]: '2' } }),
    );
    expect(Object.keys(report.storage)).toEqual([SERVICE_KEYS.format]);
  });

  it('ошибок сверх 20 в отчёт не идёт: лишние считаются в errorsDropped', () => {
    const many = Array.from({ length: 27 }, (_, i) => err(i));
    const report = buildReport(input({ errors: many, errorsDropped: 3 }));
    expect(report.errors).toHaveLength(CONFIG.save.reportErrorsMax);
    expect(report.errors[0]?.message).toBe('ошибка 0');
    expect(report.errorsDropped).toBe(3 + 7);
  });

  it('addCrashError копит до 20, дальше только счётчик', () => {
    let log: CrashLog = { errors: [], dropped: 0 };
    for (let i = 0; i < 25; i += 1) log = addCrashError(log, err(i));
    expect(log.errors).toHaveLength(20);
    expect(last(log.errors)?.message).toBe('ошибка 19');
    expect(log.dropped).toBe(5);
  });

  it('crashError обрезает длинное сообщение и стек, но не выбрасывает поля', () => {
    const e = crashError(
      { type: 'error', message: 'м'.repeat(5000), stack: 'с'.repeat(50_000), source: 'main.js:10:5' },
      NOW,
    );
    expect(e.message).toHaveLength(CONFIG.save.reportMessageChars);
    expect(e.stack).toHaveLength(CONFIG.save.reportStackChars);
    expect(e).toMatchObject({ at: NOW.toISOString(), type: 'error', source: 'main.js:10:5' });
    expect(crashError({ type: 'unhandledrejection', message: 'x' }, NOW).stack).toBeUndefined();
  });

  it('имя файла — diplodok-report-ГГГГ-ММ-ДД-ЧЧММ.json по местному времени', () => {
    expect(reportFileName(new Date(2026, 10, 6, 9, 5))).toBe('diplodok-report-2026-11-06-0905.json');
    expect(reportFileName(new Date(2026, 0, 2, 23, 59))).toBe('diplodok-report-2026-01-02-2359.json');
  });

  describe('местная полночь не уезжает на вчера по UTC', () => {
    const was = process.env['TZ'];
    afterEach(() => {
      if (was === undefined) delete process.env['TZ'];
      else process.env['TZ'] = was;
    });
    it('в Окленде полвторого ночи 6 ноября — отчёт от 6 ноября, 0130', () => {
      process.env['TZ'] = 'Pacific/Auckland';
      const now = new Date(2026, 10, 6, 1, 30);
      expect(now.toISOString().slice(0, 10)).toBe('2026-11-05');
      expect(reportFileName(now)).toBe('diplodok-report-2026-11-06-0130.json');
    });
  });

  it('файл прогресса отчёт не принимает: другой kind', () => {
    storage.setItem(SERVICE_KEYS.format, '2');
    const text = JSON.stringify(buildReport(input()));
    const result = checkProgressFile(text, text.length);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('foreign');
  });
});

describe('шум не считается сбоем (001-25)', () => {
  const ORIGIN = 'https://example.github.io';
  const own = `${ORIGIN}/diplodok-kladoiskatel/assets/index.js`;

  it('ResizeObserver loop — шум, в любой из двух формулировок', () => {
    expect(
      isNoiseError({ message: 'ResizeObserver loop limit exceeded', filename: own }, ORIGIN),
    ).toBe(true);
    expect(
      isNoiseError(
        { message: 'ResizeObserver loop completed with undelivered notifications.', filename: own },
        ORIGIN,
      ),
    ).toBe(true);
  });

  it('чужой origin и расширения браузера — шум', () => {
    expect(isNoiseError({ message: 'boom', filename: 'https://cdn.other.org/x.js' }, ORIGIN)).toBe(true);
    expect(isNoiseError({ message: 'boom', filename: 'chrome-extension://abc/inject.js' }, ORIGIN)).toBe(true);
    expect(isNoiseError({ message: 'boom', filename: 'moz-extension://abc/inject.js' }, ORIGIN)).toBe(true);
  });

  it('Script error. без файла — шум', () => {
    expect(isNoiseError({ message: 'Script error.', filename: '' }, ORIGIN)).toBe(true);
    expect(isNoiseError({ message: 'Script error.' }, ORIGIN)).toBe(true);
  });

  it('наша ошибка — не шум; origin, у которого наш — только начало, тоже чужой', () => {
    expect(isNoiseError({ message: 'x is not a function', filename: own }, ORIGIN)).toBe(false);
    expect(isNoiseError({ message: 'x is not a function', filename: `${ORIGIN}.evil.org/a.js` }, ORIGIN)).toBe(true);
  });

  it('отклонённое обещание без файла — не шум: файла у него и не бывает', () => {
    expect(isNoiseError({ message: 'Cannot read properties of undefined' }, ORIGIN)).toBe(false);
    expect(isNoiseError({ message: 'Cannot read properties of undefined', filename: '' }, ORIGIN)).toBe(false);
  });
});

describe('ловушка сбоев: экран только за настоящую ошибку', () => {
  const ORIGIN = 'https://example.github.io';
  const own = `${ORIGIN}/diplodok-kladoiskatel/assets/index.js`;
  const NOW = new Date(Date.UTC(2026, 10, 6, 14, 32, 5));
  const failure = (message: string, over: Partial<RawFailure> = {}): RawFailure => ({
    type: 'error',
    message,
    filename: own,
    ...over,
  });

  function makeTrap(over: Partial<TrapDeps> = {}) {
    const calls = { first: 0, changes: [] as number[], notes: [] as unknown[] };
    const trap = createCrashTrap({
      origin: ORIGIN,
      now: () => NOW,
      note: (detail) => calls.notes.push(detail),
      onChange: (log) => calls.changes.push(log.errors.length),
      onFirst: () => {
        calls.first += 1;
      },
      ...over,
    });
    return { trap, calls };
  }

  it('шум пишется в журнал, но экрана и записи crash не даёт', () => {
    const { trap, calls } = makeTrap();
    trap.handle(failure('ResizeObserver loop completed with undelivered notifications.'));
    trap.handle(failure('boom', { filename: 'chrome-extension://abc/inject.js' }));
    trap.handle(failure('Script error.', { filename: '' }));
    expect(calls.first).toBe(0);
    expect(calls.changes).toEqual([]);
    expect(trap.log()).toEqual({ errors: [], dropped: 0 });
    expect(calls.notes).toHaveLength(3);
    expect(calls.notes[0]).toMatchObject({ noise: true });
  });

  it('отклонённое обещание без файла — настоящий сбой', () => {
    const { trap, calls } = makeTrap();
    trap.handle({ type: 'unhandledrejection', message: 'Cannot read properties of undefined' });
    expect(calls.first).toBe(1);
  });

  it('первая ошибка — один экран, вторая только дописывается и обновляет crash', () => {
    const { trap, calls } = makeTrap();
    trap.handle(failure('первая'));
    trap.handle(failure('вторая'));
    expect(calls.first).toBe(1);
    expect(calls.changes).toEqual([1, 2]);
    expect(trap.log().errors.map((e) => e.message)).toEqual(['первая', 'вторая']);
  });

  it('ошибок сверх предела: в списке двадцать, остальные в счётчике', () => {
    const { trap } = makeTrap();
    const total = CONFIG.save.reportErrorsMax + 5;
    for (let i = 0; i < total; i += 1) trap.handle(failure(`e${i}`));
    expect(trap.log().errors).toHaveLength(CONFIG.save.reportErrorsMax);
    expect(trap.log().dropped).toBe(5);
  });

  it('сорвавшаяся запись crash не отменяет экран, сорвавшийся экран — следующие ошибки', () => {
    const broken = makeTrap({ onChange: () => { throw new Error('нет места'); } });
    broken.trap.handle(failure('a'));
    expect(broken.calls.first).toBe(1);
    const noScreen = makeTrap({ onFirst: () => { throw new Error('нет DOM'); } });
    noScreen.trap.handle(failure('a'));
    noScreen.trap.handle(failure('b'));
    expect(noScreen.calls.changes).toEqual([1, 2]);
  });

  it('событие error → сообщение, стек, место; пустое сообщение берётся из ошибки', () => {
    const error = Object.assign(new Error('внутри'), { stack: 'Error: внутри\n    at f (main.js:1:1)' });
    expect(failureFromError({ message: 'Uncaught Error: x', filename: own, lineno: 10, colno: 5, error })).toEqual({
      type: 'error',
      message: 'Uncaught Error: x',
      filename: own,
      stack: error.stack,
      source: `${own}:10:5`,
    });
    expect(failureFromError({ message: '', error }).message).toBe('внутри');
    expect(failureFromError({}).source).toBeUndefined();
  });

  it('отклонённое обещание: строка, ошибка и значение, которое не превращается в строку', () => {
    expect(failureFromRejection({ reason: 'просто строка' })).toEqual({
      type: 'unhandledrejection',
      message: 'просто строка',
    });
    expect(failureFromRejection({ reason: new Error('e') }).message).toBe('e');
    const hostile = { toString: () => { throw new Error('нельзя'); } };
    expect(failureFromRejection({ reason: hostile }).message).toBe('[нечитаемо]');
  });

  describe('запись crash', () => {
    const report = (journal: number, saved: number, stack = 'S'): ReturnType<typeof buildReport> =>
      buildReport({
        game: '1.2.0',
        format: 2,
        store: 'normal',
        createdAt: NOW,
        userAgent: 'ua',
        renderer: 'webgl',
        window: { width: 1, height: 1, dpr: 1 },
        errors: [{ at: NOW.toISOString(), type: 'error', message: 'главное', stack }],
        errorsDropped: 0,
        journal: Array.from({ length: journal }, (_, t) => ({ t, k: 'scene' as const, d: 'x'.repeat(150) })),
        journalSaved: Array.from({ length: saved }, (_, t) => ({ t, k: 'save' as const, d: 'y'.repeat(150) })),
        heldBack: {},
        storage: {},
      });

    it('влезает в предел вместе с ключом; сперва уходит хвост прошлых сессий', () => {
      const max = 8000;
      const text = crashRecord(report(40, 50), max);
      expect(SERVICE_KEYS.crash.length + text.length).toBeLessThanOrEqual(max);
      const back = JSON.parse(text);
      expect(back.kind).toBe(REPORT_KIND);
      expect(back.journal).toHaveLength(40);
      expect(back.journalSaved.length).toBeLessThan(50);
      expect(back.errors[0].message).toBe('главное');
    });

    it('не влезло и так — режется эта сессия с начала, ошибка остаётся; стеки уходят последними', () => {
      const text = crashRecord(report(200, 50, 'z'.repeat(4000)), 3000);
      const back = JSON.parse(text);
      expect(back.journalSaved).toEqual([]);
      expect(back.journal.length).toBeLessThan(200);
      expect(back.journal.at(-1).t).toBe(199);
      expect(back.errors[0].message).toBe('главное');
      expect(back.errors[0].stack).toBeUndefined();
    });
  });

  describe('обвязка на окне', () => {
    // Как в `main.ts`: хранилище и журнал отданы ловушке. До этого — `crashTrap.test.ts`.
    beforeEach(() => {
      attachStore({
        mayWrite,
        putKey,
        snapshotAll,
        storeMode,
        heldBack,
        lastWriteOk,
        journal: {
          note: (kind, detail) => journal.note(kind, detail),
          entries: () => journal.entries(),
          saved: () => journal.saved(),
        },
      });
    });

    function fakeWindow() {
      const handlers = new Map<string, (event: unknown) => void>();
      const target = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
      };
      return { target: target as unknown as Window, handlers };
    }

    it('вешается один раз и слушает error и unhandledrejection', () => {
      const { target, handlers } = fakeWindow();
      expect(installCrashTrap(target)).toBe(true);
      expect(installCrashTrap(target)).toBe(false);
      expect([...handlers.keys()].sort()).toEqual(['error', 'unhandledrejection']);
    });

    it('настоящая ошибка ложится в crash отчётом, шум — нет', () => {
      const { target, handlers } = fakeWindow();
      installCrashTrap(target);
      // Прогресс есть: в запись о сбое он не попадает (снимок берут при скачивании).
      storage.setItem(P + 'v2:current', '5');
      handlers.get('error')?.({ message: 'ResizeObserver loop limit exceeded', filename: own });
      expect(storage.getItem(SERVICE_KEYS.crash)).toBeNull();
      handlers.get('error')?.({ message: 'e2e-boom', filename: own, lineno: 3, colno: 4 });
      handlers.get('unhandledrejection')?.({ reason: new Error('обещание') });
      const saved = JSON.parse(storage.getItem(SERVICE_KEYS.crash) ?? 'null');
      expect(saved.kind).toBe(REPORT_KIND);
      expect(saved.errors.map((e: CrashError) => e.message)).toEqual(['e2e-boom', 'обещание']);
      expect(saved.errors[0].source).toBe(`${own}:3:4`);
      // storage снимается при скачивании, свежим; в crash он не хранится.
      expect(saved.storage).toEqual({});
      expect(saved.journal.map((e: JournalEntry) => e.k)).toContain('error');
    });

    it('в future crash не пишется: хранилище побайтно то же', () => {
      storage.setItem(SERVICE_KEYS.format, '3');
      storage.setItem(SERVICE_KEYS.minWriter, '3');
      storage.setItem(P + 'v3:quest-solved', '["q1"]');
      expect(openStore()).toBe('future');
      const before = storage.dump();
      const { target, handlers } = fakeWindow();
      installCrashTrap(target);
      handlers.get('error')?.({ message: 'e2e-boom', filename: own });
      expect(storage.dump()).toBe(before);
    });
  });
});

describe('журнал и хранилище на деле', () => {
  it('настоящий journal слышит хранилище без подмены наблюдателя: запись ключа — save', () => {
    const before = journal.entries().length;
    writeKey(SPECS.current, 4);
    const added = journal.entries().slice(before);
    expect(added.map((e) => e.k)).toContain('save');
  });
});

describe('переполнение: журнал уходит первым, отчёт о сбое — последним (001-79)', () => {
  const CRASH = SERVICE_KEYS.crash;

  it('хватает места, если убрать один журнал: crash на месте, запись легла', () => {
    storage.setItem(JOURNAL, 'j'.repeat(2000));
    storage.setItem(CRASH, 'c'.repeat(2000));
    storage.quota = storage.used() + 10;
    writeKey(SPECS.current, 7);
    // Журнал настоящий и пишет о записи сам: старого содержимого в нём уже нет.
    expect(storage.getItem(JOURNAL)).not.toBe('j'.repeat(2000));
    expect(storage.getItem(CRASH)).toBe('c'.repeat(2000));
    expect(readKey(SPECS.current)).toBe(7);
  });

  it('не хватает и после журнала: уходит и crash, запись легла', () => {
    storage.setItem(JOURNAL, 'j');
    storage.setItem(CRASH, 'c'.repeat(2000));
    storage.quota = storage.used();
    writeKey(SPECS.current, 7);
    expect(storage.getItem(JOURNAL)).not.toBe('j');
    expect(storage.getItem(CRASH)).toBeNull();
    expect(readKey(SPECS.current)).toBe(7);
  });
});
