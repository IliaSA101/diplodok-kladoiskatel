/**
 * Журнал: что делала игра перед сбоем (design 001, раздел 7).
 *
 * Модуль без Phaser. Пишет в хранилище сам, через `saveStore.ts`; хранилище в ответ
 * сообщает ему о своих делах не импортом, а через `storeEvents.ts` — иначе круг.
 *
 * - В памяти — кольцо `journalMemory` записей этой сессии.
 * - В хранилище — `…:journal`: последние `journalSaved` записей **через сессии**, не больше
 *   `journalMaxBytes` знаков. Ключ одноразовый: `writeKey` вправе убрать его ради прогресса
 *   (001-34), и тогда следующая запись начинает хвост заново из кольца.
 * - Пишется сразу на каждую запись и только там, где игре писать можно (`normal`, `newer`).
 * - Не бросает никогда и ничего не откладывает: битый журнал — не прогресс, его просто
 *   затирают. Журнал не отнимает место ни у прогресса, ни у `crash`: одна попытка записи.
 */
import { CONFIG } from '../config';
import { SERVICE_KEYS } from './saveKeys';
import { mayWrite, putDisposable, rawKey, storeMode } from './saveStore';
import { JOURNAL_KINDS, setStoreObserver, type JournalKind } from './storeEvents';

export type { JournalKind };

/** `t` — мс от начала сессии; `d` — короткая строка, не длиннее `journalEntryChars`. */
export interface JournalEntry {
  t: number;
  k: JournalKind;
  d?: string;
}

export interface JournalDeps {
  /** Часы в мс; по умолчанию `Date.now`. Тесты ведут их руками. */
  now?: () => number;
}

const KEY = SERVICE_KEYS.journal;

function isKind(value: unknown): value is JournalKind {
  return typeof value === 'string' && (JOURNAL_KINDS as readonly string[]).includes(value);
}

/** Хвост из хранилища: годные записи, не больше `journalSaved`; мусор отбрасывается. */
function parseTail(raw: string | null): JournalEntry[] {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const tail: JournalEntry[] = [];
    for (const item of data as unknown[]) {
      if (item === null || typeof item !== 'object') continue;
      const { t, k, d } = item as { t?: unknown; k?: unknown; d?: unknown };
      if (typeof t !== 'number' || !Number.isFinite(t) || !isKind(k)) continue;
      if (d !== undefined && typeof d !== 'string') continue;
      tail.push(d === undefined ? { t, k } : { t, k, d: d.slice(0, CONFIG.save.journalEntryChars) });
    }
    return tail.slice(-CONFIG.save.journalSaved);
  } catch {
    return [];
  }
}

/** Деталь → короткая строка. Что не сериализуется, становится строкой, а не ошибкой. */
function detailText(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  let text: string | undefined;
  try {
    text = JSON.stringify(detail);
  } catch {
    // Цикл или BigInt: само значение показать нельзя, но след оставить можно.
    text = JSON.stringify(typeof detail === 'bigint' ? detail.toString() : '[не сериализуется]');
  }
  return text === undefined ? undefined : text.slice(0, CONFIG.save.journalEntryChars);
}

export function createJournal(deps: JournalDeps = {}) {
  const now = deps.now ?? Date.now;
  const start = now();
  /** Записи этой сессии. */
  const ring: JournalEntry[] = [];
  /** То, что должно лежать в хранилище: прошлые сессии и эта. */
  let tail: JournalEntry[] = [];
  let loaded: JournalEntry[] | null = null;
  let wrote = false;

  /** Один раз, до первой записи: что лежало с прошлых сессий. */
  function load(): JournalEntry[] {
    if (loaded === null) {
      loaded = parseTail(rawKey(KEY));
      tail = [...loaded];
    }
    return loaded;
  }

  function flush(): void {
    // Режим читаем раньше хвоста: смена режима сама может оставить запись.
    if (!mayWrite()) return;
    // Ключа нет, хотя мы его писали: его убрали ради прогресса. Хвост — заново из кольца.
    if (wrote && rawKey(KEY) === null) tail = ring.slice(-CONFIG.save.journalSaved);
    let text = JSON.stringify(tail);
    while (tail.length > 1 && KEY.length + text.length > CONFIG.save.journalMaxBytes) {
      tail.shift();
      text = JSON.stringify(tail);
    }
    if (putDisposable(KEY, text)) wrote = true;
  }

  function note(k: JournalKind, detail?: unknown): void {
    try {
      load();
      const d = detailText(detail);
      const entry: JournalEntry = { t: Math.max(0, Math.round(now() - start)), k };
      if (d !== undefined) entry.d = d;
      ring.push(entry);
      if (ring.length > CONFIG.save.journalMemory) ring.shift();
      tail.push(entry);
      if (tail.length > CONFIG.save.journalSaved) tail.shift();
      flush();
    } catch {
      /* журнал не вправе ломать игру */
    }
  }

  return {
    /** Первая запись сессии: версия игры, формат хранилища, режим, время запуска. */
    boot(game: string, format: number, at: Date): void {
      note('boot', { game, format, mode: storeMode(), at: at.toISOString() });
    },
    note,
    /** Эта сессия, не больше `journalMemory`. */
    entries(): readonly JournalEntry[] {
      return [...ring];
    },
    /** Хвост из хранилища на момент запуска (прошлые сессии). */
    saved(): readonly JournalEntry[] {
      try {
        return [...load()];
      } catch {
        return [];
      }
    },
  };
}

export type Journal = ReturnType<typeof createJournal>;

/** Журнал игры: его слушает хранилище и в него пишут сцены. */
export const journal: Journal = createJournal();
setStoreObserver((kind, detail) => journal.note(kind, detail));
