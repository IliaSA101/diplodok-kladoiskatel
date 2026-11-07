/**
 * Файл прогресса: проверка того, что принёс взрослый, и выгрузка своего.
 *
 * Без Phaser и без DOM — само скачивание и выбор файла живут в `fileIo.ts`.
 * Проверка ничего не пишет: хранилище открывает на запись уже замена
 * (`saveReplace.ts`), и только после того, как проверка сказала «да».
 *
 * Два обещания:
 * - **Чужое и битое не попадает в прогресс** (001-15, 001-17). Любое сомнение —
 *   отказ всего файла, а не «возьмём что поняли»: угаданное попало бы в игру ребёнка.
 * - **Свой файл игра принимает всегда** (001-31). В файл идёт `JSON.stringify` того,
 *   что игра поняла, а не исходная строка с потерей: иначе обрезанный `levels`
 *   выгрузился бы как есть, и проверка отвергла бы файл, который сама же написала.
 */
import { CONFIG } from '../config';
import { QUEST_NODES } from '../data/quest';
import {
  LEGACY_KEYS,
  PROGRESS_KEYS,
  SAVE_FORMAT,
  SPECS,
  type Decoded,
  type KeySpec,
} from './saveKeys';
import { migrateKV, type KV } from './saveMigrations';
import { peekKey, readKey, settleMigration, snapshotAll, storeMode } from './saveStore';

export const PROGRESS_KIND = 'diplodok-progress';

/** Конверт файла прогресса (6.1). Резервная копия (`backup`) — тот же конверт плюс свои поля. */
export interface ProgressEnvelope {
  kind: typeof PROGRESS_KIND;
  /** Формат данных в `keys`, а не версия игры (001-35). */
  format: number;
  /** Версия игры и время — для взрослого и отчёта, проверкой не используются. */
  game: string;
  savedAt: string;
  /** Полный ключ → `JSON.stringify` понятого значения. */
  keys: Record<string, string>;
}

export type RefuseReason = 'too-big' | 'not-json' | 'foreign' | 'future' | 'broken-value';

/** Что в наборе прогресса, по-взрослому: лесов, узлов квеста, игр английского. */
export interface ProgressSummary {
  forests: number;
  quest: number;
  english: number;
  /** Только у резервной копии: когда она снята. */
  backupOf?: string;
}

export type FileVerdict =
  | {
      ok: true;
      /** Формат файла (до миграции). */
      format: number;
      /** Проверенные строки ключей прогресса после миграции — цель замены. */
      keys: Record<string, string>;
      /** Что в файле и что в хранилище сейчас: взрослый сравнит перед «Да» (001-30). */
      file: ProgressSummary;
      current: ProgressSummary;
    }
  | { ok: false; reason: RefuseReason };

/** Первая строка ответа на любой отказ; вторая, мельче, — причина. */
export const REFUSED_TITLE = 'Файл не подходит';
export const REFUSED_REASON: Record<RefuseReason, string> = {
  'too-big': 'Файл слишком большой',
  'not-json': 'Файл обрезан или испорчен',
  foreign: 'Это не файл прогресса этой игры',
  future: 'Это файл из новой версии игры',
  // Значение не разобрать — для взрослого это тот же «испорчен».
  'broken-value': 'Файл обрезан или испорчен',
};

function isRecord(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

/**
 * Ключи, допустимые в файле этого формата. Набор берётся по формату *файла*, а не
 * игры: будущая версия, убравшая ключ, обязана принять старый файл. Формат 1
 * (1.1 и раньше) хранит ещё `v1:*` — они нужны миграции, в цель не идут.
 */
function allowedKeys(format: number): Set<string> {
  const keys = PROGRESS_KEYS.map((spec) => spec.key);
  return new Set(format < 2 ? [...keys, ...LEGACY_KEYS] : keys);
}

function decodeText<T>(spec: KeySpec<T>, text: string): Decoded<T> | null {
  try {
    return spec.decode(JSON.parse(text));
  } catch {
    return null;
  }
}

const KNOWN_NODES = new Set(QUEST_NODES.map((node) => node.id));

function summaryOf(
  completed: readonly number[],
  solved: readonly string[],
  english: readonly string[],
): ProgressSummary {
  return {
    forests: completed.length,
    // Узел, которого в этой сборке нет, взрослому не показываем: он не откроется.
    quest: new Set(solved.filter((id) => KNOWN_NODES.has(id))).size,
    english: english.length,
  };
}

/** Сводка по хранилищу. Читает через `peekKey`: сводка хранилище не трогает. */
export function summarizeStore(): ProgressSummary {
  return summaryOf(
    peekKey(SPECS.completed),
    peekKey(SPECS.solved),
    peekKey(SPECS.englishDone),
  );
}

/**
 * Проверить файл по порядку из 6.2; первая неудача — отказ. `sizeBytes` — `file.size`
 * до чтения: огромный файл не читается вовсе. Хранилище не трогает ни при каком исходе.
 */
export function checkProgressFile(text: string, sizeBytes: number): FileVerdict {
  const refuse = (reason: RefuseReason): FileVerdict => ({ ok: false, reason });
  if (sizeBytes > CONFIG.save.fileMaxBytes) return refuse('too-big');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return refuse('not-json');
  }
  if (!isRecord(data) || data['kind'] !== PROGRESS_KIND) return refuse('foreign');
  const format = data['format'];
  const keys = data['keys'];
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return refuse('foreign');
  if (!isRecord(keys)) return refuse('foreign');
  if (format > SAVE_FORMAT) return refuse('future');
  const allowed = allowedKeys(format);
  const kv: KV = new Map();
  for (const [key, value] of Object.entries(keys)) {
    if (!allowed.has(key) || typeof value !== 'string') return refuse('foreign');
    kv.set(key, value);
  }
  // Прочие поля верхнего уровня (`game`, `savedAt`, `reason`, `v1`, `broken`,
  // `heldBack`) не смотрятся: на этом стоит возврат резервной копии обычным импортом.
  migrateKV(kv, format);
  const target: Record<string, string> = {};
  const decoded = new Map<string, unknown>();
  // Только ключи прогресса: `v1:*` миграция уже использовала, в цель им хода нет.
  for (const spec of PROGRESS_KEYS) {
    const value = kv.get(spec.key);
    if (value === undefined) continue;
    const result = decodeText(spec, value);
    if (result === null || !result.lossless) return refuse('broken-value');
    target[spec.key] = value;
    decoded.set(spec.key, result.value);
  }
  const file = summaryOf(
    (decoded.get(SPECS.completed.key) as number[] | undefined) ?? [],
    (decoded.get(SPECS.solved.key) as string[] | undefined) ?? [],
    (decoded.get(SPECS.englishDone.key) as string[] | undefined) ?? [],
  );
  const savedAt = data['savedAt'];
  if ('reason' in data && typeof savedAt === 'string') file.backupOf = savedAt;
  return { ok: true, format, keys: target, file, current: summarizeStore() };
}

/**
 * Конверт для выгрузки (6.3). `refused` вне режима `normal` (001-35): только там формат
 * данных равен `SAVE_FORMAT`, и значит, `format` в файле не соврёт. Значения — понятое
 * (`readKey`, попутно откладывает исходник с потерей в `broken:*`), не сырая строка.
 *
 * Миграция, которая не легла при запуске, пробуется снова; не легла и теперь — музей
 * первой сборки берётся из неё в памяти: файл формата 2 без него потерял бы находки.
 * `too-big` — файл, который проверка не примет по размеру (раздел 14, 001-31).
 */
export function buildProgressFile(game: string, now: Date): ProgressEnvelope | 'refused' | 'too-big' {
  if (storeMode() !== 'normal') return 'refused';
  const from = settleMigration();
  const keys = currentKeys(from);
  const envelope: ProgressEnvelope = { kind: PROGRESS_KIND, format: SAVE_FORMAT, game, savedAt: now.toISOString(), keys };
  const size = new TextEncoder().encode(progressFileText(envelope)).length;
  return size > CONFIG.save.fileMaxBytes ? 'too-big' : envelope;
}

/**
 * Девять ключей прогресса как понятое (`readKey`, попутно откладывает исходник с потерей
 * в `broken:*`). `from` — формат, с которого миграция всё ещё не сделана (его вернул
 * `settleMigration`): перенесённое берётся из неё в памяти, потому что в хранилище его нет.
 * Общее для выгрузки и для копии перед заменой (`saveReplace.ts`).
 */
export function currentKeys(from: number | null): Record<string, string> {
  const present = snapshotAll();
  const migrated: KV = new Map(Object.entries(present));
  if (from !== null) migrateKV(migrated, from);
  const keys: Record<string, string> = {};
  for (const spec of PROGRESS_KEYS) {
    if (spec.key in present) keys[spec.key] = JSON.stringify(readKey(spec));
    else if (migrated.has(spec.key)) {
      const result = decodeText(spec, migrated.get(spec.key) ?? '');
      if (result !== null) keys[spec.key] = JSON.stringify(result.value);
    }
  }
  return keys;
}

/** Текст файла: с отступами, чтобы взрослый мог открыть его в блокноте. */
export function progressFileText(envelope: ProgressEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** `diplodok-progress-2026-11-06.json` — число по местному времени взрослого. */
export function progressFileName(now: Date): string {
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `diplodok-progress-${day}.json`;
}
