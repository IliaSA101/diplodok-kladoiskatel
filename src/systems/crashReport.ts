/**
 * Отчёт о сбое: чистые функции без Phaser и DOM (design 001, раздел 8.3).
 *
 * Отчёт взрослый присылает человеку, который чинит игру; сама игра его никогда не читает
 * обратно, поэтому содержимое можно менять свободно. Но одно держится крепко: `kind` другой,
 * чем у файла прогресса, и «Прогресс из файла» отчёт не примет. Скачивание — `fileIo.ts`.
 */
import { CONFIG } from '../config';
import { DISPOSABLE_KEYS } from './saveKeys';
import type { JournalEntry } from './journal';
import type { StoreMode } from './saveStore';

export const REPORT_KIND = 'diplodok-report';
export const REPORT_VERSION = 1;

export interface CrashError {
  at: string;
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  source?: string;
}

/** Ошибки, собранные за сессию: до `reportErrorsMax`, дальше — счётчик. */
export interface CrashLog {
  errors: CrashError[];
  dropped: number;
}

export interface ReportInput {
  game: string;
  format: number;
  store: StoreMode;
  createdAt: Date;
  userAgent: string;
  renderer: 'webgl' | 'canvas' | 'none';
  window: { width: number; height: number; dpr: number };
  errors: readonly CrashError[];
  errorsDropped: number;
  journal: readonly JournalEntry[];
  journalSaved: readonly JournalEntry[];
  heldBack: Readonly<Record<string, string>>;
  storage: Readonly<Record<string, string>>;
}

export interface CrashReport {
  kind: typeof REPORT_KIND;
  report: number;
  game: string;
  format: number;
  store: StoreMode;
  createdAt: string;
  userAgent: string;
  renderer: ReportInput['renderer'];
  window: ReportInput['window'];
  errors: CrashError[];
  errorsDropped: number;
  journal: JournalEntry[];
  journalSaved: JournalEntry[];
  heldBack: Record<string, string>;
  storage: Record<string, string>;
}

/** Ошибка в виде, который кладут в отчёт: сообщение и стек обрезаны. */
export function crashError(
  raw: { type: CrashError['type']; message: string; stack?: string; source?: string },
  at: Date,
): CrashError {
  const error: CrashError = {
    at: at.toISOString(),
    type: raw.type,
    message: raw.message.slice(0, CONFIG.save.reportMessageChars),
  };
  if (raw.stack !== undefined) error.stack = raw.stack.slice(0, CONFIG.save.reportStackChars);
  if (raw.source !== undefined) error.source = raw.source;
  return error;
}

/** Добавить ошибку: после `reportErrorsMax` она только прибавляет счётчик. */
export function addCrashError(log: CrashLog, error: CrashError): CrashLog {
  if (log.errors.length >= CONFIG.save.reportErrorsMax) {
    return { errors: log.errors, dropped: log.dropped + 1 };
  }
  return { errors: [...log.errors, error], dropped: log.dropped };
}

/** Собрать отчёт. Одноразовые `journal` и `crash` из `storage` уходят: они уже в своих полях. */
export function buildReport(input: ReportInput): CrashReport {
  const errors = input.errors.slice(0, CONFIG.save.reportErrorsMax);
  const storage = Object.fromEntries(
    Object.entries(input.storage).filter(([key]) => !DISPOSABLE_KEYS.includes(key)),
  );
  return {
    kind: REPORT_KIND,
    report: REPORT_VERSION,
    game: input.game,
    format: input.format,
    store: input.store,
    createdAt: input.createdAt.toISOString(),
    userAgent: input.userAgent,
    renderer: input.renderer,
    window: input.window,
    errors,
    errorsDropped: input.errorsDropped + (input.errors.length - errors.length),
    journal: [...input.journal],
    journalSaved: [...input.journalSaved],
    heldBack: { ...input.heldBack },
    storage,
  };
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** `diplodok-report-2026-11-06-0905.json` — по местному времени взрослого. */
export function reportFileName(now: Date): string {
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `diplodok-report-${day}-${two(now.getHours())}${two(now.getMinutes())}.json`;
}

/**
 * Сбой, который не стоит экрана «Позови взрослого» (001-25): записывается в журнал, и всё.
 * `ResizeObserver loop…`, файл не с нашего origin (расширения браузера — это `chrome-extension:` и
 * `moz-extension:`, то есть тоже чужой origin), `Script error.` без файла.
 * У отклонённого обещания файла нет вовсе — это не повод считать его чужим.
 */
export function isNoiseError(e: { message?: string; filename?: string }, origin: string): boolean {
  const message = e.message ?? '';
  const file = e.filename ?? '';
  if (message.startsWith('ResizeObserver loop')) return true;
  if (file === '') return message === 'Script error.';
  return !(file === origin || file.startsWith(origin + '/'));
}
