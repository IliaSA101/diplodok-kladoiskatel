/**
 * Что угол взрослых делает с файлами (design 001, раздел 9). Без Phaser и без DOM:
 * само скачивание и окно выбора — `fileIo.ts`, меню — `scenes/parentsMenu.ts`.
 *
 * Сюда вынесено всё, что можно получить неверным тихо: размер файла смотрится до
 * чтения, отчёт достраивается свежим `storage`, имя копии берётся по дню, когда её сняли.
 * Ничего здесь не пишет в хранилище — пишет только замена (`saveReplace.ts`).
 */
import { PARENTS_TEXT } from '../art/parentsLayout';
import { CONFIG } from '../config';
import { DISPOSABLE_KEYS, SERVICE_KEYS } from './saveKeys';
import { reportFileName } from './crashReport';
import {
  buildProgressFile,
  checkProgressFile,
  progressFileName,
  progressFileText,
  type FileVerdict,
  type ProgressSummary,
} from './saveFile';
import { rawKey, snapshotAll } from './saveStore';

/** То, что нужно от выбранного файла; настоящий `File` подходит. */
export interface PickedFile {
  readonly size: number;
  text(): Promise<string>;
}

/**
 * Проверить выбранный файл. Размер смотрится по `file.size` **до** `file.text()`: слишком
 * большой файл не читается вовсе, иначе случайный гигабайт из «Загрузок» зависил бы вкладку.
 * Файл, который не прочёлся, — тот же «обрезан или испорчен». Хранилище не трогает.
 */
export async function readPickedFile(file: PickedFile): Promise<FileVerdict> {
  if (file.size > CONFIG.save.fileMaxBytes) return { ok: false, reason: 'too-big' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  return checkProgressFile(text, file.size);
}

export interface Download {
  name: string;
  text: string;
}

/** `none` — отдавать нечего; `refused` — сейчас нельзя; `too-big` — не влезет в предел файла. */
export type DownloadResult =
  | { ok: true; file: Download }
  | { ok: false; why: 'none' | 'refused' | 'too-big' };

/** Слово взрослому на отказ скачать. */
export function downloadRefusal(why: 'none' | 'refused' | 'too-big'): string {
  return why === 'too-big' ? PARENTS_TEXT.exportTooBig : PARENTS_TEXT.exportRefused;
}

export function progressDownload(game: string, now: Date): DownloadResult {
  const envelope = buildProgressFile(game, now);
  if (envelope === 'refused' || envelope === 'too-big') return { ok: false, why: envelope };
  return { ok: true, file: { name: progressFileName(now), text: progressFileText(envelope) } };
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** Местный день из времени в строке; `null`, если это не время. */
function localDay(iso: string | undefined): Date | null {
  if (iso === undefined) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** `diplodok-backup-2026-11-06.json` — день, когда копия снята; не знаем его — сегодня. */
export function backupFileName(savedAt: string | undefined, now: Date): string {
  const at = localDay(savedAt) ?? now;
  return `diplodok-backup-${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}.json`;
}

/** Лежит ли резервная копия: от этого зависит пункт «Резервная копия в файл». */
export function hasBackupFile(): boolean {
  return rawKey(SERVICE_KEYS.backup) !== null;
}

/** Лежит ли отчёт о последнем сбое: от этого зависит пункт «Отчёт о сбое». */
export function hasCrashReport(): boolean {
  return rawKey(SERVICE_KEYS.crash) !== null;
}

function parsed(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

/**
 * Копия как есть: с отступами, если разобралась, и дословно, если нет. Ничего не пишет,
 * поэтому доступна и в режимах «только чтение».
 */
export function backupDownload(now: Date): DownloadResult {
  const raw = rawKey(SERVICE_KEYS.backup);
  if (raw === null) return { ok: false, why: 'none' };
  const data = parsed(raw);
  if (!isRecord(data)) return { ok: true, file: { name: backupFileName(undefined, now), text: raw } };
  const savedAt = typeof data['savedAt'] === 'string' ? data['savedAt'] : undefined;
  return { ok: true, file: { name: backupFileName(savedAt, now), text: JSON.stringify(data, null, 2) } };
}

/**
 * Отчёт о последнем сбое из `crash`; `storage` достраивается свежим снимком, как это делает
 * экран сбоя (001-86). Одноразовые `journal` и `crash` в снимок не идут: они уже в полях.
 */
export function reportDownload(now: Date): DownloadResult {
  const raw = rawKey(SERVICE_KEYS.crash);
  if (raw === null) return { ok: false, why: 'none' };
  const name = reportFileName(now);
  const data = parsed(raw);
  if (!isRecord(data)) return { ok: true, file: { name, text: raw } };
  const storage = Object.fromEntries(
    Object.entries(snapshotAll()).filter(([key]) => !DISPOSABLE_KEYS.includes(key)),
  );
  return { ok: true, file: { name, text: JSON.stringify({ ...data, storage }, null, 2) } };
}

export interface SummaryParts {
  /** «Резервная копия от 06.11.2026» — только у копии. */
  head: string | null;
  file: string;
  current: string;
  question: string;
}

/** Дата для взрослого: `06.11.2026`, по местному времени. */
function dayText(at: Date): string {
  return `${two(at.getDate())}.${two(at.getMonth() + 1)}.${at.getFullYear()}`;
}

/** Слова сводки перед «Заменить?» (001-30): что в файле и что в игре сейчас. */
export function summaryParts(file: ProgressSummary, current: ProgressSummary): SummaryParts {
  const at = localDay(file.backupOf);
  return {
    head: at === null ? null : `Резервная копия от ${dayText(at)}`,
    file: `В файле — лесов пройдено: ${file.forests}, задачек квеста: ${file.quest}, английских игр: ${file.english}.`,
    current: `Сейчас — лесов: ${current.forests}, задачек: ${current.quest}, игр: ${current.english}.`,
    question: PARENTS_TEXT.replaceQuestion,
  };
}
