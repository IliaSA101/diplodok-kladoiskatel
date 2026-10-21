/**
 * Сохранение в localStorage. Ключи с префиксом игры, чтобы не мешать
 * другим играм на том же github.io.
 * Любая ошибка (приватный режим, переполнение, мусор в данных) гасится молча:
 * игра всегда должна запускаться.
 */
const PREFIX = 'diplodok-kladoiskatel:v1:';
const KEY_PROGRESS = PREFIX + 'progress';
const KEY_COLLECTION = PREFIX + 'collection';
const KEY_SETTINGS = PREFIX + 'settings';

/** Прогресс текущего леса. */
export interface Progress {
  seed: number;
  /** id найденных кладов (TreasureSpec.id). */
  found: string[];
}

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

export const save = {
  loadProgress(): Progress | null {
    const data = read(KEY_PROGRESS);
    if (data === null || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;
    const seed = obj['seed'];
    if (typeof seed !== 'number' || !Number.isFinite(seed)) return null;
    return { seed, found: asStringArray(obj['found']) };
  },

  saveProgress(progress: Progress): void {
    write(KEY_PROGRESS, progress);
  },

  clearProgress(): void {
    try {
      localStorage.removeItem(KEY_PROGRESS);
    } catch {
      /* ничего */
    }
  },

  /** Все предметы, найденные за всё время (музей). */
  loadCollection(): string[] {
    return asStringArray(read(KEY_COLLECTION));
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
