/**
 * Сохранение в localStorage. Ключи с префиксом игры, чтобы не мешать
 * другим играм на том же github.io.
 * Любая ошибка (приватный режим, переполнение, мусор в данных) гасится молча:
 * игра всегда должна запускаться.
 */
const PREFIX = 'diplodok-kladoiskatel:';
const V2 = PREFIX + 'v2:';

const KEY_CURRENT = V2 + 'current';
const KEY_LEVELS = V2 + 'levels';
const KEY_DONE = V2 + 'completed';
const KEY_COLLECTION = V2 + 'collection';
const KEY_SETTINGS = V2 + 'settings';
/** Коллекция первой версии игры — переносим её один раз, чтобы музей не обнулился. */
const KEY_COLLECTION_V1 = PREFIX + 'v1:collection';

export interface Settings {
  muted: boolean;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* сохранять некуда — не беда */
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
}

/** Найденные клады по номерам лесов: { "3": ["t0", "t5"] }. */
function readLevels(): Record<string, string[]> {
  const data = read(KEY_LEVELS);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    result[key] = asStringArray(value);
  }
  return result;
}

export const save = {
  /** Лес, который открывается кнопкой «Играть». */
  loadCurrentLevel(): number {
    const value = read(KEY_CURRENT);
    return typeof value === 'number' && Number.isFinite(value) && value >= 1
      ? Math.floor(value)
      : 1;
  },

  saveCurrentLevel(level: number): void {
    write(KEY_CURRENT, Math.max(1, Math.floor(level)));
  },

  /** id кладов, найденных в этом лесу. */
  loadLevelFound(level: number): string[] {
    return readLevels()[String(level)] ?? [];
  },

  saveLevelFound(level: number, found: readonly string[]): void {
    const levels = readLevels();
    levels[String(level)] = [...found];
    write(KEY_LEVELS, levels);
  },

  /** Леса, пройденные полностью (включая секретный клад). */
  loadCompleted(): number[] {
    return asNumberArray(read(KEY_DONE));
  },

  isLevelComplete(level: number): boolean {
    return save.loadCompleted().includes(level);
  },

  markLevelComplete(level: number): void {
    const done = new Set(save.loadCompleted());
    done.add(level);
    write(KEY_DONE, [...done].sort((a, b) => a - b));
  },

  /** Все предметы, найденные за всё время (музей). */
  loadCollection(): string[] {
    const current = asStringArray(read(KEY_COLLECTION));
    if (current.length > 0) return current;
    // Первый запуск после обновления игры: забираем музей из старой версии.
    const old = asStringArray(read(KEY_COLLECTION_V1));
    if (old.length > 0) write(KEY_COLLECTION, old);
    return old;
  },

  addToCollection(itemIds: readonly string[]): void {
    const all = new Set(save.loadCollection());
    for (const id of itemIds) all.add(id);
    write(KEY_COLLECTION, [...all]);
  },

  loadSettings(): Settings {
    const data = read(KEY_SETTINGS);
    if (data !== null && typeof data === 'object') {
      const muted = (data as Record<string, unknown>)['muted'];
      if (typeof muted === 'boolean') return { muted };
    }
    return { muted: false };
  },

  saveSettings(settings: Settings): void {
    write(KEY_SETTINGS, settings);
  },
};
