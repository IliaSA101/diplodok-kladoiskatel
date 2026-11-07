/**
 * Ключи сохранения и то, как каждый читается. Только данные и чистые функции:
 * ни `localStorage`, ни Phaser здесь нет. Хранилище (`saveStore.ts`) берёт
 * отсюда спецификацию ключа и само решает, когда читать, писать и откладывать.
 *
 * Декодер возвращает не только понятое значение, но и признак `lossless`:
 * пришлось ли что-то выбросить. Выброшенное нельзя терять молча — хранилище
 * кладёт исходную строку в `broken:<ключ>` раньше любой записи (001-11, 001-40).
 */

/** Префикс у всех ключей игры: чтобы не мешать другим играм на том же github.io. */
export const SAVE_PREFIX = 'diplodok-kladoiskatel:';

/**
 * Формат данных в хранилище. Нет ключа `format` = 1 (так пишут сборки до 1.1.1 включительно).
 * Любой новый ключ, переименование или смена формы значения — новый номер и миграция.
 */
export const SAVE_FORMAT = 2;

/**
 * Самый старый формат, игре которого ещё можно писать в это хранилище (001-37).
 * 2: формат 2 к формату 1 не добавочный — `v1:collection` больше не читается, и
 * 1.1, записав туда музей, потеряла бы находку молча.
 */
export const SAVE_MIN_WRITER = 2;

/** Выше этого ступень сложности не поднимается (`MAX_SKILL` в `skill.ts` берёт отсюда). */
export const SKILL_STEP_MAX = 4;

export interface Decoded<T> {
  value: T;
  /** Ложь, если из строки пришлось что-то выбросить или заменить умолчанием. */
  lossless: boolean;
}

export interface KeySpec<T> {
  /** Полный ключ, с префиксом. */
  key: string;
  /** Что видит игра, когда ключа нет. Каждый раз новый объект: его правят на месте. */
  fallback: () => T;
  /** Разобранный JSON → понятое значение. Приведение (`floor`, `clamp`) — не потеря. */
  decode: (data: unknown) => Decoded<T>;
  /** Стирает ли его «Стереть всё»: звук взрослого — нет (001-29). */
  erasable: boolean;
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

function stringArray(data: unknown): Decoded<string[]> {
  if (!Array.isArray(data)) return { value: [], lossless: false };
  const value = data.filter((v): v is string => typeof v === 'string');
  return { value, lossless: value.length === data.length };
}

function numberArray(data: unknown): Decoded<number[]> {
  if (!Array.isArray(data)) return { value: [], lossless: false };
  const value = data.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return { value, lossless: value.length === data.length };
}

function clampSkill(step: number): number {
  return Math.min(SKILL_STEP_MAX, Math.max(0, Math.round(step)));
}

const SPEC_CURRENT: KeySpec<number> = {
  key: SAVE_PREFIX + 'v2:current',
  fallback: () => 1,
  decode: (data) =>
    typeof data === 'number' && Number.isFinite(data) && data >= 1
      ? { value: Math.floor(data), lossless: true }
      : { value: 1, lossless: false },
  erasable: true,
};

/** Найденные клады по номерам лесов: { "3": ["t0", "t5"] }. */
const SPEC_LEVELS: KeySpec<Record<string, string[]>> = {
  key: SAVE_PREFIX + 'v2:levels',
  fallback: () => ({}),
  decode: (data) => {
    if (!isRecord(data)) return { value: {}, lossless: false };
    let lossless = true;
    // fromEntries, а не присваивание по ключу: лес с именем `__proto__` иначе
    // не записался бы свойством, и декодер перестал бы быть идемпотентным.
    const value = Object.fromEntries(
      Object.entries(data).map(([level, found]) => {
        const part = stringArray(found);
        lossless &&= part.lossless;
        return [level, part.value];
      }),
    );
    return { value, lossless };
  },
  erasable: true,
};

const SPEC_COMPLETED: KeySpec<number[]> = {
  key: SAVE_PREFIX + 'v2:completed',
  fallback: () => [],
  decode: numberArray,
  erasable: true,
};

const SPEC_COLLECTION: KeySpec<string[]> = {
  key: SAVE_PREFIX + 'v2:collection',
  fallback: () => [],
  decode: stringArray,
  erasable: true,
};

export interface Settings {
  muted: boolean;
}

const SPEC_SETTINGS: KeySpec<Settings> = {
  key: SAVE_PREFIX + 'v2:settings',
  fallback: () => ({ muted: false }),
  decode: (data) =>
    isRecord(data) && typeof data['muted'] === 'boolean'
      ? { value: { muted: data['muted'] }, lossless: true }
      : { value: { muted: false }, lossless: false },
  erasable: false,
};

const SPEC_SOLVED: KeySpec<string[]> = {
  key: SAVE_PREFIX + 'v3:quest-solved',
  fallback: () => [],
  decode: stringArray,
  erasable: true,
};

const SPEC_STICKERS: KeySpec<string[]> = {
  key: SAVE_PREFIX + 'v3:quest-stickers',
  fallback: () => [],
  decode: stringArray,
  erasable: true,
};

/** Пары «набор:игра», пройденные в английской ветке. */
const SPEC_ENGLISH_DONE: KeySpec<string[]> = {
  key: SAVE_PREFIX + 'v3:english-done',
  fallback: () => [],
  decode: stringArray,
  erasable: true,
};

/** Ступень сложности по виду задачки: { "sudoku": 2 }. */
const SPEC_SKILL: KeySpec<Record<string, number>> = {
  key: SAVE_PREFIX + 'v3:quest-skill',
  fallback: () => ({}),
  decode: (data) => {
    if (!isRecord(data)) return { value: {}, lossless: false };
    const steps = Object.entries(data).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    );
    return {
      value: Object.fromEntries(steps.map(([kind, step]) => [kind, clampSkill(step)])),
      lossless: steps.length === Object.keys(data).length,
    };
  },
  erasable: true,
};

/** Музей первой сборки: игра его больше не читает, переносит миграция 1→2; здесь — чтобы стереть. */
const SPEC_COLLECTION_V1: KeySpec<string[]> = {
  key: SAVE_PREFIX + 'v1:collection',
  fallback: () => [],
  decode: stringArray,
  erasable: true,
};

export const SPECS = {
  current: SPEC_CURRENT,
  levels: SPEC_LEVELS,
  completed: SPEC_COMPLETED,
  collection: SPEC_COLLECTION,
  settings: SPEC_SETTINGS,
  solved: SPEC_SOLVED,
  stickers: SPEC_STICKERS,
  englishDone: SPEC_ENGLISH_DONE,
  skill: SPEC_SKILL,
  collectionV1: SPEC_COLLECTION_V1,
} as const;

/** Ровно девять ключей прогресса, порядок фиксирован. */
export const PROGRESS_KEYS: readonly KeySpec<unknown>[] = [
  SPEC_CURRENT,
  SPEC_LEVELS,
  SPEC_COMPLETED,
  SPEC_COLLECTION,
  SPEC_SETTINGS,
  SPEC_SOLVED,
  SPEC_STICKERS,
  SPEC_ENGLISH_DONE,
  SPEC_SKILL,
];

/** Ключи первой сборки: лежат, но игра их не читает (музей переносит миграция 1→2). */
export const LEGACY_KEYS: readonly string[] = [
  SAVE_PREFIX + 'v1:collection',
  SAVE_PREFIX + 'v1:progress',
  SAVE_PREFIX + 'v1:settings',
];

/** Служебные ключи. Имена занимают пространство имён навсегда (design, раздел 13.4). */
export const SERVICE_KEYS = {
  format: SAVE_PREFIX + 'format',
  minWriter: SAVE_PREFIX + 'format-min-writer',
  backup: SAVE_PREFIX + 'backup',
  restore: SAVE_PREFIX + 'restore',
  journal: SAVE_PREFIX + 'journal',
  crash: SAVE_PREFIX + 'crash',
} as const;

/** Одноразовые: любая версия вправе удалить их ради записи прогресса (001-34). */
export const DISPOSABLE_KEYS: readonly string[] = [SERVICE_KEYS.journal, SERVICE_KEYS.crash];

/** Префикс слотов с копиями битого. */
export const BROKEN_PREFIX = SAVE_PREFIX + 'broken:';

/** Слот копии битого значения этого ключа: `broken:v2:levels`. */
export function brokenKey(key: string): string {
  return BROKEN_PREFIX + (key.startsWith(SAVE_PREFIX) ? key.slice(SAVE_PREFIX.length) : key);
}
