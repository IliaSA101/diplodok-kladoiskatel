/**
 * Фикстуры сохранения: хранилища детей, игравших в выпущенные сборки, открытые
 * нынешней игрой (design 001, раздел 11).
 *
 * Файлы `tests/fixtures/save-*.json` собраны кодом тех версий
 * (`tools/save-fixture.mjs`): `storage` — что лежало в `localStorage`, `seen` — что
 * этому ребёнку показывала та версия. Выдуманный вручную снимок согласился бы с любой
 * ошибкой в нашем понимании старых форматов; снимок настоящего кода — нет.
 *
 * Ошибка здесь тихая: игра запускается, но ребёнок не находит наклейку, музей или
 * ступень. Отдельный файл: `saveFile.test.ts` у порога в шестьсот строк.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PuzzleKind } from '../src/data/quest';
import { englishSave } from '../src/systems/englishSave';
import { questSave } from '../src/systems/questSave';
import { SAVE_PREFIX as P, SERVICE_KEYS, brokenKey } from '../src/systems/saveKeys';
import { save } from '../src/systems/save';
import { clearHeldBack, heldBack, openStore } from '../src/systems/saveStore';
import { skillSave } from '../src/systems/skill';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';

const DIR = join(__dirname, 'fixtures');

interface Fixture {
  game: string;
  ref: string;
  about: string;
  storage: Record<string, string>;
  seen: Record<string, unknown>;
  expect?: Record<string, unknown>;
  why?: string;
  broken?: Record<string, string>;
}

const NAMES = ['pre-1.0', '1.0.0', '1.1.0', '1.1.1', '1.1.1-erased', '1.1.1-broken'] as const;
type Name = (typeof NAMES)[number];

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(DIR, `save-${name}.json`), 'utf8')) as Fixture;
}

/**
 * Какие поля отпечатка в этой фикстуре обязаны быть непустыми. Пустое с обеих сторон
 * (`undefined === undefined`, `[] === []`) проходит само, и тест ничего не проверяет.
 * Пусто по делу: «стёрто» (леса и английский стёрты), «битые» (обрезанные узлы и леса
 * 1.1 не понимает — понятое пусто).
 */
const FILLED: Record<Name, readonly string[]> = {
  'pre-1.0': ['levels', 'completed', 'museum', 'solved', 'stickers'],
  '1.0.0': ['levels', 'completed', 'museum', 'solved', 'stickers', 'golden', 'english', 'skill'],
  '1.1.0': ['levels', 'completed', 'museum', 'solved', 'stickers', 'golden', 'english', 'skill'],
  '1.1.1': ['levels', 'completed', 'museum', 'solved', 'stickers', 'golden', 'english', 'skill'],
  '1.1.1-erased': ['museum', 'solved', 'stickers', 'skill'],
  '1.1.1-broken': ['completed', 'museum', 'stickers', 'skill'],
};

function filled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      (item) => (Array.isArray(item) && item.length > 0) || (typeof item === 'number' && item > 0),
    );
  }
  return false;
}

/** Сколько лесов просматривает снимок (как в раннере): с запасом над 48. */
const LOOK_LEVELS = 60;

/** То же, что снимал раннер, но нынешними модулями и только по полям фикстуры. */
function lookNow(fields: Record<string, unknown>): Record<string, unknown> {
  const now: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    switch (key) {
      case 'current':
        now[key] = save.loadCurrentLevel();
        break;
      case 'levels': {
        const levels: Record<string, string[]> = {};
        for (let n = 1; n <= LOOK_LEVELS; n += 1) {
          const found = save.loadLevelFound(n);
          if (found.length > 0) levels[String(n)] = found;
        }
        now[key] = levels;
        break;
      }
      case 'completed':
        now[key] = save.loadCompleted();
        break;
      case 'muted':
        now[key] = save.loadSettings().muted;
        break;
      case 'museum':
        now[key] = save.loadCollection();
        break;
      case 'solved':
        now[key] = questSave.solvedNodes();
        break;
      case 'stickers':
        now[key] = questSave.stickers();
        break;
      case 'golden':
        now[key] = questSave.goldenStickers();
        break;
      case 'english':
        now[key] = Object.fromEntries(
          Object.keys(fields[key] as object).map((set) => [set, englishSave.doneCount(set)]),
        );
        break;
      case 'skill':
        now[key] = Object.fromEntries(
          Object.keys(fields[key] as object).map((kind) => [kind, skillSave.of(kind as PuzzleKind)]),
        );
        break;
      default:
        throw new Error('поле отпечатка, которого тест не знает: ' + key);
    }
  }
  return now;
}

let storage: MemoryStorage;

/** Хранилище с содержимым фикстуры, и игра его открыла. Возвращает ответ `openStore`. */
function openFixture(fx: Fixture): ReturnType<typeof openStore> {
  for (const [key, value] of Object.entries(fx.storage)) storage.setItem(key, value);
  return openStore();
}

beforeEach(() => {
  installMemoryStorage();
  openStore(); // сбрасывает режим прошлого кейса
  storage = installMemoryStorage();
  clearHeldBack();
});

describe('фикстуры формата 1: что видел ребёнок, то он видит и в 1.2', () => {
  it('в каталоге ровно шесть фикстур раздела 11', () => {
    const files = readdirSync(DIR)
      .filter((f) => /^save-.*\.json$/.test(f))
      .sort();
    expect(files).toEqual(NAMES.map((n) => `save-${n}.json`).sort());
  });

  for (const name of NAMES) {
    describe(name, () => {
      const fx = fixture(name);

      it('отпечаток не пуст там, где ему положено быть непустым', () => {
        for (const field of FILLED[name]) {
          expect(fx.seen[field], `${name}: поле ${field} отсутствует`).toBeDefined();
          expect(filled(fx.seen[field]), `${name}: поле ${field} пусто`).toBe(true);
        }
      });

      it('{ ...seen, ...expect } после openStore совпадает с ответами нынешних модулей', () => {
        openFixture(fx);
        const want = { ...fx.seen, ...fx.expect };
        expect(lookNow(want)).toEqual(want);
      });

      it('миграция ничего в ключах фикстуры не меняет и добавляет только номера и копии битого', () => {
        expect(openFixture(fx)).toBe('migrated');
        for (const [key, value] of Object.entries(fx.storage)) {
          expect(storage.getItem(key), key).toBe(value);
        }
        const added = [...storage.items.keys()].filter((k) => !(k in fx.storage));
        const brokenSlots = Object.keys(fx.broken ?? {}).map(brokenKey);
        expect(added.sort()).toEqual([SERVICE_KEYS.format, SERVICE_KEYS.minWriter, ...brokenSlots].sort());
        expect(storage.getItem(SERVICE_KEYS.format)).toBe('2');
        expect(storage.getItem(SERVICE_KEYS.minWriter)).toBe('2');
      });

      it('второй запуск ничего не пишет', () => {
        openFixture(fx);
        const dump = storage.dump();
        const sets = storage.sets;
        expect(openStore()).toBe('ok');
        expect(storage.sets).toBe(sets);
        expect(storage.dump()).toBe(dump);
      });

      it('копии битого есть только там, где фикстура битая', () => {
        openFixture(fx);
        const slots = [...storage.items.keys()].filter((k) => k.startsWith(P + 'broken:'));
        expect(slots.sort()).toEqual(Object.keys(fx.broken ?? {}).map(brokenKey).sort());
        expect(heldBack()).toEqual({});
      });
    });
  }
});

describe('«до 1.0»: наклейка, которой в игре больше нет', () => {
  it('sticker-ball-boot осталась в наклейках, ключ не тронут, в карантин не ушла', () => {
    const fx = fixture('pre-1.0');
    const stickersKey = P + 'v3:quest-stickers';
    // Фикстура и вправду хранит её: иначе тест проверял бы пустоту.
    expect(JSON.parse(fx.storage[stickersKey] ?? '[]') as string[]).toContain('sticker-ball-boot');
    openFixture(fx);
    expect(questSave.stickers()).toContain('sticker-ball-boot');
    expect(storage.getItem(stickersKey)).toBe(fx.storage[stickersKey]);
    expect(storage.getItem(brokenKey(stickersKey))).toBeNull();
  });

  it('вторая запись наклеек её не теряет', () => {
    openFixture(fixture('pre-1.0'));
    questSave.markSolved('q1', 'sticker-header');
    expect(questSave.stickers()).toContain('sticker-ball-boot');
  });
});

describe('«стёрто в 1.1»: пустой музей остаётся пустым', () => {
  const fx = fixture('1.1.1-erased');

  it('в хранилище v2:collection = [] при живом v1:collection, а 1.1 показала бы музей', () => {
    expect(fx.storage[P + 'v2:collection']).toBe('[]');
    expect(JSON.parse(fx.storage[P + 'v1:collection'] ?? 'null')).not.toEqual([]);
    // Снимок хранилища взят раньше отпечатка: иначе ленивый перенос 1.1 уже лежал бы в v2.
    expect(filled(fx.seen['museum'])).toBe(true);
    expect(fx.expect).toEqual({ museum: [] });
    expect(fx.why).toBeTruthy();
  });

  it('музей пуст, v1:collection на месте, ступени живы', () => {
    openFixture(fx);
    expect(save.loadCollection()).toEqual([]);
    expect(storage.getItem(P + 'v2:collection')).toBe('[]');
    expect(storage.getItem(P + 'v1:collection')).toBe(fx.storage[P + 'v1:collection']);
    const kinds = Object.keys(fx.seen['skill'] as object);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(skillSave.of(kind as PuzzleKind)).toBeGreaterThan(0);
    expect(questSave.solvedNodes()).toEqual(['q1', 'q2']);
  });
});

describe('«битые»: пять копий равны исходникам, понятое — как у 1.1', () => {
  const fx = fixture('1.1.1-broken');
  const broken = fx.broken ?? {};

  it('пять ключей, и фикстура кладёт в хранилище именно эти строки', () => {
    expect(Object.keys(broken)).toHaveLength(5);
    for (const [key, raw] of Object.entries(broken)) expect(fx.storage[key]).toBe(raw);
  });

  it('до всякой записи каждая копия в broken:<ключ> побайтно равна исходнику', () => {
    openFixture(fx);
    for (const [key, raw] of Object.entries(broken)) {
      expect(storage.getItem(brokenKey(key)), key).toBe(raw);
    }
  });

  it('запись нового не стирает копию, а понятое остаётся', () => {
    openFixture(fx);
    questSave.markSolved('q9', 'sticker-header');
    for (const [key, raw] of Object.entries(broken)) {
      expect(storage.getItem(brokenKey(key)), key).toBe(raw);
    }
    // Число среди наклеек выброшено, строки живы.
    expect(questSave.stickers()).toContain('sticker-whistle');
    expect(questSave.stickers()).not.toContain(5);
    expect(questSave.solvedNodes()).toEqual(['q9']);
  });
});
