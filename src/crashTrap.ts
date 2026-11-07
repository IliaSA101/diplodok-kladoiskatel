/**
 * Ловушка сбоев (design 001, раздел 8.1). DOM, без Phaser.
 *
 * Ставится побочным эффектом загрузки модуля, а `main.ts` импортирует его первой строкой:
 * ошибка при загрузке модуля сцены случилась бы раньше любого вызова из тела `main.ts`.
 *
 * По ESM тело модуля выполняется после всех его статических зависимостей, поэтому ловушка
 * тянет значением только то, что не вычисляет ничего на верхнем уровне: экран, файл, чистые
 * функции отчёта, ключи. Хранилище и журнал она получает позже из `main.ts` (`attachStore`),
 * а до того обходится `localStorage` напрямую. Граф зависимостей держит `tests/crashTrap.test.ts`.
 *
 * - Первая настоящая ошибка: запись в журнал, запись `…:crash`, игра засыпает, на экране
 *   «Позови взрослого». Следующие дописываются в тот же список (до `reportErrorsMax`, дальше
 *   счётчик) и обновляют `crash`; второго экрана нет.
 * - Шум (001-25) — только в журнал: ложная тревога хуже пропущенной мелочи.
 * - Ловушка не бросает никогда: каждый шаг в своём `try`.
 */
import { APP_VERSION } from './art/startLayout';
import { CONFIG } from './config';
import { showCrashScreen } from './crashScreen';
import { downloadJson } from './fileIo';
import {
  addCrashError,
  buildReport,
  crashError,
  isNoiseError,
  reportFileName,
  type CrashError,
  type CrashLog,
  type CrashReport,
} from './systems/crashReport';
import { DISPOSABLE_KEYS, SAVE_FORMAT, SAVE_PREFIX, SERVICE_KEYS } from './systems/saveKeys';
import type { JournalEntry } from './systems/journal';
import type { StoreMode } from './systems/saveStore';
import type { JournalKind } from './systems/storeEvents';

/** Сбой в одном виде для `error` и `unhandledrejection`. */
export interface RawFailure {
  type: CrashError['type'];
  message: string;
  stack?: string;
  source?: string;
  /** Файл, откуда пришла ошибка: по нему отсеивается чужое. У обещания его нет. */
  filename?: string;
}

interface ErrorEventLike {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

/** Что-то, похожее на `Error`: настоящий `Error` из другого окна под `instanceof` не пройдёт. */
function errorParts(value: unknown): { message?: string; stack?: string } {
  if (value === null || typeof value !== 'object') return {};
  const { message, stack } = value as { message?: unknown; stack?: unknown };
  return {
    message: typeof message === 'string' ? message : undefined,
    stack: typeof stack === 'string' ? stack : undefined,
  };
}

function textOf(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '[нечитаемо]';
  }
}

export function failureFromError(event: ErrorEventLike): RawFailure {
  const parts = errorParts(event.error);
  const file = event.filename ?? '';
  const raw: RawFailure = {
    type: 'error',
    message: event.message || parts.message || 'error',
    filename: file,
  };
  if (parts.stack !== undefined) raw.stack = parts.stack;
  if (file !== '') raw.source = `${file}:${event.lineno ?? 0}:${event.colno ?? 0}`;
  return raw;
}

export function failureFromRejection(event: { reason?: unknown }): RawFailure {
  const parts = errorParts(event.reason);
  const raw: RawFailure = {
    type: 'unhandledrejection',
    message: parts.message ?? textOf(event.reason),
  };
  if (parts.stack !== undefined) raw.stack = parts.stack;
  return raw;
}

export interface TrapDeps {
  /** Наш origin: файлы не оттуда — чужие. */
  origin: string;
  now: () => Date;
  /** Запись в журнал. */
  note: (detail: unknown) => void;
  /** Список ошибок изменился: обновить `crash`. */
  onChange: (log: CrashLog) => void;
  /** Первая настоящая ошибка: остановить игру и показать экран. Один раз. */
  onFirst: () => void;
}

/** Логика ловушки без `window`: события в неё приносит тонкая обвязка. */
export function createCrashTrap(deps: TrapDeps) {
  let log: CrashLog = { errors: [], dropped: 0 };
  let shown = false;

  function attempt(step: () => void): void {
    try {
      step();
    } catch {
      /* ловушка не бросает: один сорвавшийся шаг не отменяет остальные */
    }
  }

  return {
    handle(raw: RawFailure): void {
      attempt(() => {
        const noise = isNoiseError(raw, deps.origin);
        deps.note({
          type: raw.type,
          message: raw.message.slice(0, 100),
          ...(noise ? { noise: true } : {}),
        });
        if (noise) return;
        log = addCrashError(log, crashError(raw, deps.now()));
        attempt(() => deps.onChange(log));
        if (!shown) {
          shown = true;
          attempt(deps.onFirst);
        }
      });
    },
    /** Что собрано за сессию. */
    log(): CrashLog {
      return { errors: [...log.errors], dropped: log.dropped };
    },
  };
}

/**
 * Запись для `crash`: отчёт без `storage` (его снимают при скачивании, свежим), урезанный
 * до `maxChars` вместе с ключом. Режут сперва хвост прошлых сессий, потом эту сессию,
 * потом стеки: сообщения ошибок остаются всегда.
 */
export function crashRecord(report: CrashReport, maxChars: number): string {
  const cut: CrashReport = { ...report, journal: [...report.journal], journalSaved: [...report.journalSaved] };
  const fits = (): boolean => SERVICE_KEYS.crash.length + JSON.stringify(cut).length <= maxChars;
  while (!fits() && cut.journalSaved.length > 0) cut.journalSaved.shift();
  while (!fits() && cut.journal.length > 1) cut.journal.shift();
  if (!fits()) {
    cut.errors = cut.errors.map((error) => {
      const copy = { ...error };
      delete copy.stack;
      return copy;
    });
  }
  return JSON.stringify(cut);
}

/** Что ловушка берёт у хранилища и журнала; их отдаёт `main.ts`, когда они открыты. */
export interface TrapStore {
  mayWrite: () => boolean;
  putKey: (key: string, value: string) => boolean;
  snapshotAll: () => Record<string, string>;
  storeMode: () => StoreMode;
  heldBack: () => Record<string, string>;
  lastWriteOk: () => boolean;
  journal: {
    note: (kind: JournalKind, detail: unknown) => void;
    entries: () => readonly JournalEntry[];
    saved: () => readonly JournalEntry[];
  };
}

function rawGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Целое ≥ 1 из строки ключа формата или `null`: так же, как читает хранилище. */
function formatNumber(raw: string | null): number | null {
  if (raw === null) return null;
  try {
    const n: unknown = JSON.parse(raw);
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

/** Режим по номерам формата прямо из `localStorage`: то же правило, что у `saveStore`; сверяет тест. */
function rawMode(): StoreMode {
  try {
    void localStorage.length;
  } catch {
    return 'unavailable';
  }
  const format = formatNumber(rawGet(SERVICE_KEYS.format)) ?? 1;
  const writer = formatNumber(rawGet(SERVICE_KEYS.minWriter));
  const minWriter = writer === null || writer > format ? format : writer;
  if (format <= SAVE_FORMAT) return 'normal';
  return minWriter <= SAVE_FORMAT ? 'newer' : 'future';
}

/** Хранилище, пока `main.ts` его не отдал: сбой при загрузке модулей. Журнала нет, «сохранено» не обещается. */
const BARE: TrapStore = {
  mayWrite: () => rawMode() !== 'future' && rawMode() !== 'unavailable',
  putKey: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  snapshotAll: () => {
    const all: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key === null || !key.startsWith(SAVE_PREFIX) || DISPOSABLE_KEYS.includes(key)) continue;
        const raw = localStorage.getItem(key);
        if (raw !== null) all[key] = raw;
      }
    } catch {
      /* что успели снять, то и вернём */
    }
    return all;
  },
  storeMode: rawMode,
  heldBack: () => ({}),
  lastWriteOk: () => false,
  journal: { note: () => undefined, entries: () => [], saved: () => [] },
};

let store: TrapStore | null = null;

/** `main.ts` отдаёт хранилище и журнал, когда они открыты: до этого сбой считается сбоем загрузки. */
export function attachStore(next: TrapStore): void {
  store = next;
}

/** Минимум от игры, который нужен ловушке. */
export interface GameLike {
  loop: { sleep: () => void };
  renderer?: { type: number };
}

let game: GameLike | null = null;

/** `main.ts` отдаёт игру, когда она создана: ловушка останавливает её на первой ошибке. */
export function attachGame(next: GameLike): void {
  game = next;
}

/** Номера рендереров Phaser (`Phaser.CANVAS`, `Phaser.WEBGL`): сам Phaser здесь не нужен. */
function rendererName(): CrashReport['renderer'] {
  const type = game?.renderer?.type;
  if (type === 2) return 'webgl';
  if (type === 1) return 'canvas';
  return 'none';
}

function liveReport(log: CrashLog, withStorage: boolean): CrashReport {
  return buildReport({
    game: APP_VERSION,
    format: SAVE_FORMAT,
    store: (store ?? BARE).storeMode(),
    createdAt: new Date(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    renderer: rendererName(),
    window: {
      width: typeof innerWidth === 'number' ? innerWidth : 0,
      height: typeof innerHeight === 'number' ? innerHeight : 0,
      dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    },
    errors: log.errors,
    errorsDropped: log.dropped,
    journal: [...(store ?? BARE).journal.entries()],
    journalSaved: [...(store ?? BARE).journal.saved()],
    heldBack: (store ?? BARE).heldBack(),
    storage: withStorage ? (store ?? BARE).snapshotAll() : {},
  });
}

const INSTALLED = '__diplodokCrashTrap';

/** Повесить ловушку на окно. Повторный вызов ничего не делает. */
export function installCrashTrap(target: Window): boolean {
  const marked = target as unknown as Record<string, unknown>;
  if (marked[INSTALLED] === true) return false;
  marked[INSTALLED] = true;

  const trap = createCrashTrap({
    origin: target.location.origin,
    now: () => new Date(),
    note: (detail) => (store ?? BARE).journal.note('error', detail),
    onChange: (log) => {
      // В `future` и без доступа к хранилищу `crash` не пишется; отчёт остаётся в памяти.
      const target = store ?? BARE;
      if (!target.mayWrite()) return;
      target.putKey(SERVICE_KEYS.crash, crashRecord(liveReport(log, false), CONFIG.save.crashMaxBytes));
    },
    onFirst: () => {
      try {
        game?.loop.sleep();
      } catch {
        /* игра не спит — экран всё равно закроет её */
      }
      showCrashScreen({
        // Без хранилища ничего не сохранялось вовсе: «Прогресс сохранён» было бы неправдой.
        // Сбой до `attachStore` — сбой загрузки: ничего не записывалось и обещать нечего.
        saved: store !== null && store.lastWriteOk() && store.storeMode() !== 'unavailable',
        // Отчёт собирается в момент нажатия: в нём и ошибки, пришедшие после экрана.
        onSave: () => {
          const name = reportFileName(new Date());
          downloadJson(name, liveReport(trap.log(), true));
          return name;
        },
        onContinue: () => location.reload(),
      });
    },
  });

  // Фаза всплытия: ошибки загрузки картинок до окна не всплывают и сбоем не считаются.
  target.addEventListener('error', (event) => trap.handle(failureFromError(event)));
  target.addEventListener('unhandledrejection', (event) => trap.handle(failureFromRejection(event)));
  return true;
}

if (typeof window !== 'undefined') installCrashTrap(window);
