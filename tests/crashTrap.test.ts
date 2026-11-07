/**
 * Ловушка сбоев ставится первой, и поэтому граф её зависимостей — сам по себе правило
 * (design 001, раздел 8.1): по ESM тело модуля выполняется после всех его статических
 * зависимостей, и всё, что ловушка тянет значением, она не сможет поймать. Верхний уровень
 * `data/quest.ts` (`QUEST_NODES = buildNodes()`) падал бы до того, как слушатель встал.
 *
 * Здесь же — ловушка до `attachStore`: сбой при загрузке модулей. Подготовка другая, чем
 * в `crashReport.test.ts`: модуль ловушки грузится заново на каждый кейс (`resetModules`),
 * потому что «хранилище подключено» живёт в его переменной.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_PREFIX as P, SERVICE_KEYS } from '../src/systems/saveKeys';
import { installMemoryStorage, type MemoryStorage } from './memoryStorage';

const ROOT = resolve(__dirname, '..');

/** Все модули, которые ловушка тянет значением: `import type` и `export type` стираются при сборке. */
function graphOf(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const from = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm;
  const walk = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    if (!file.endsWith('.ts')) return;
    for (const m of readFileSync(file, 'utf8').matchAll(from)) {
      const spec = m[1] ?? m[2] ?? '';
      if (!spec.startsWith('.')) {
        bare.add(spec);
        continue;
      }
      const base = resolve(dirname(file), spec);
      const next = [base, base + '.ts', base + '/index.ts'].find((p) => /\.\w+$/.test(p) && existsSync(p));
      if (next === undefined) throw new Error(`не нашёл ${spec} из ${file}`);
      walk(next);
    }
  };
  walk(entry);
  return { files, bare };
}

describe('граф зависимостей ловушки', () => {
  const { files, bare } = graphOf(resolve(ROOT, 'src/crashTrap.ts'));
  const names = [...files].map((f) => relative(ROOT, f));

  it('обход видит ловушку и её честные зависимости', () => {
    expect(names).toContain('src/crashTrap.ts');
    expect(names).toContain('src/crashScreen.ts');
    expect(names).toContain('src/systems/crashReport.ts');
  });

  it('данные игры, хранилище и журнал в графе не участвуют', () => {
    const bad = names.filter(
      (n) =>
        n.startsWith('src/data/') ||
        /\/(saveStore|saveReplace|saveFile|saveMigrations|storeEvents|journal|openStatus)\.ts$/.test(n),
    );
    expect(bad).toEqual([]);
  });

  it('Phaser и прочие пакеты в графе не участвуют', () => {
    expect([...bare]).toEqual([]);
  });
});

describe('ловушка до attachStore: сбой при загрузке модулей', () => {
  const ORIGIN = 'https://example.github.io';
  const own = `${ORIGIN}/diplodok-kladoiskatel/assets/index.js`;
  let storage: MemoryStorage;
  let shown: { saved: boolean; onSave: () => string }[];
  let downloads: { name: string; data: Record<string, unknown> }[];

  /** Ловушка свежей загрузки, повешенная на поддельное окно. */
  async function freshTrap() {
    vi.resetModules();
    vi.doMock('../src/crashScreen', () => ({
      showCrashScreen: (options: { saved: boolean; onSave: () => string }) => shown.push(options),
    }));
    vi.doMock('../src/fileIo', () => ({
      downloadJson: (name: string, data: Record<string, unknown>) => downloads.push({ name, data }),
    }));
    const trap = await import('../src/crashTrap');
    const handlers = new Map<string, (event: unknown) => void>();
    const target = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
    };
    trap.installCrashTrap(target as unknown as Window);
    const fail = (message: string): void => handlers.get('error')?.({ message, filename: own });
    return { trap, fail };
  }

  beforeEach(() => {
    storage = installMemoryStorage();
    shown = [];
    downloads = [];
  });

  it('экран есть, «Прогресс сохранён» не обещается', async () => {
    const { fail } = await freshTrap();
    fail('boom при загрузке');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.saved).toBe(false);
  });

  it('отчёт: storage снят по префиксу игры, журнала нет, режим понятен', async () => {
    storage.setItem(P + 'v2:current', '5');
    storage.setItem(P + 'v3:quest-solved', '["q1"]');
    storage.setItem(SERVICE_KEYS.journal, '[]');
    storage.setItem('other-game:score', '9');
    const { fail } = await freshTrap();
    fail('boom при загрузке');
    shown[0]?.onSave();
    const report = downloads[0]?.data ?? {};
    expect(report['kind']).toBe('diplodok-report');
    expect(report['storage']).toEqual({ [P + 'v2:current']: '5', [P + 'v3:quest-solved']: '["q1"]' });
    expect(report['journal']).toEqual([]);
    expect(report['store']).toBe('normal');
    expect((report['errors'] as { message: string }[])[0]?.message).toBe('boom при загрузке');
  });

  it('запись crash ложится прямо в localStorage, без хранилища', async () => {
    const { fail } = await freshTrap();
    fail('boom при загрузке');
    const record = JSON.parse(storage.getItem(SERVICE_KEYS.crash) ?? 'null');
    expect(record.kind).toBe('diplodok-report');
    expect(record.errors[0].message).toBe('boom при загрузке');
    expect(record.storage).toEqual({});
  });

  it('хранилище новее игры и закрыто для записи: crash не пишется, режим future в отчёте', async () => {
    storage.setItem(SERVICE_KEYS.format, '9');
    storage.setItem(SERVICE_KEYS.minWriter, '9');
    storage.setItem(P + 'v2:current', '5');
    const before = storage.dump();
    const { fail } = await freshTrap();
    fail('boom при загрузке');
    expect(storage.dump()).toBe(before);
    shown[0]?.onSave();
    expect((downloads[0]?.data as { store: string }).store).toBe('future');
  });

  it('режим до подключения хранилища тот же, что назовёт само хранилище', async () => {
    const cases: [string | null, string | null][] = [
      [null, null],
      ['2', null],
      ['1', null],
      ['3', '2'],
      ['3', '3'],
      ['9', null],
      ['мусор', null],
      ['2', 'мусор'],
    ];
    for (const [format, minWriter] of cases) {
      storage = installMemoryStorage();
      downloads = [];
      shown = [];
      if (format !== null) storage.setItem(SERVICE_KEYS.format, format);
      if (minWriter !== null) storage.setItem(SERVICE_KEYS.minWriter, minWriter);
      const { fail } = await freshTrap();
      fail('boom');
      shown[0]?.onSave();
      const pre = (downloads[0]?.data as { store: string }).store;
      const real = await import('../src/systems/saveStore');
      real.openStore();
      expect(pre, `format=${format} minWriter=${minWriter}`).toBe(real.storeMode());
    }
  });

  it('без localStorage вовсе: экран есть, режим unavailable, не бросает', async () => {
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new Error('нет доступа');
      },
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
      key: () => {
        throw new Error('нет доступа');
      },
    });
    try {
      const { fail } = await freshTrap();
      fail('boom');
      expect(shown).toHaveLength(1);
      shown[0]?.onSave();
      const report = downloads[0]?.data as { store: string; storage: object };
      expect(report.store).toBe('unavailable');
      expect(report.storage).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('после attachStore экран обещает сохранённое, а отчёт берёт журнал и снимок у хранилища', async () => {
    const { trap, fail } = await freshTrap();
    const notes: unknown[] = [];
    trap.attachStore({
      mayWrite: () => true,
      putKey: () => true,
      snapshotAll: () => ({ [P + 'v2:current']: '7' }),
      storeMode: () => 'normal',
      heldBack: () => ({ [P + 'v2:levels']: '{}' }),
      lastWriteOk: () => true,
      journal: {
        note: (_kind: string, detail: unknown) => notes.push(detail),
        entries: () => [{ t: 1, k: 'scene' as const, d: 'Start' }],
        saved: () => [{ t: 0, k: 'save' as const, d: 'v2:current' }],
      },
    });
    fail('boom позже');
    expect(shown[0]?.saved).toBe(true);
    expect(notes).toHaveLength(1);
    shown[0]?.onSave();
    const report = downloads[0]?.data ?? {};
    expect(report['storage']).toEqual({ [P + 'v2:current']: '7' });
    expect(report['heldBack']).toEqual({ [P + 'v2:levels']: '{}' });
    expect(report['journal']).toHaveLength(1);
    expect(report['journalSaved']).toHaveLength(1);
  });

  it('хранилище подключено, но последняя запись не легла: «сохранён» не обещается', async () => {
    const { trap, fail } = await freshTrap();
    trap.attachStore({
      mayWrite: () => true,
      putKey: () => true,
      snapshotAll: () => ({}),
      storeMode: () => 'normal',
      heldBack: () => ({}),
      lastWriteOk: () => false,
      journal: { note: () => undefined, entries: () => [], saved: () => [] },
    });
    fail('boom');
    expect(shown[0]?.saved).toBe(false);
  });
});
