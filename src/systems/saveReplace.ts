/**
 * Замена прогресса и «Стереть всё»: один путь (design 001, раздел 6.4, 001-44).
 *
 * Модуль без Phaser и без DOM. Порядок такой, чтобы обрыв на любом шаге не оставлял
 * ребёнку половину старого и половину нового:
 *
 *   копия текущего в `backup` → метка `restore` с целью → запись цели → снять метку.
 *
 * - Копия не легла — ничего не сделано (`no-space`): терять прогресс ради стирания нельзя.
 * - Пустое текущее состояние непустую копию не затирает: второе стирание подряд
 *   не губит копию первого.
 * - Обрыв посреди записи цели оставляет метку; следующий запуск (`openStore`) докатит
 *   цель либо, если и докат упал, откатит и снимет метку в любом случае (001-38):
 *   иначе каждый запуск перетирал бы то, что ребёнок успел сыграть.
 * - Откат идёт к `backup`, только если метка говорит `backup: true` (001-43): при пустом
 *   текущем в слоте лежит более старая копия, и откат к ней вернул бы стёртое.
 */
import { PROGRESS_KIND, currentKeys, type ProgressEnvelope } from './saveFile';
import {
  BROKEN_PREFIX,
  PROGRESS_KEYS,
  SAVE_FORMAT,
  SAVE_MIN_WRITER,
  SAVE_PREFIX,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
} from './saveKeys';
import {
  clearHeldBack,
  heldBack,
  mayWrite,
  putKey,
  rawKey,
  readKey,
  removeKey,
  settleMigration,
  snapshotAll,
  storeMode,
} from './saveStore';
import { noteStore } from './storeEvents';

export type ReplaceReason = 'erase' | 'restore';
export type ReplaceResult = 'ok' | 'no-space' | 'interrupted' | 'refused';

/** Версия игры и время для конверта копии: их знает вызывающий, а не хранилище. */
export interface ReplaceMeta {
  game: string;
  now: Date;
}

/** Резервная копия (6.5): конверт файла прогресса плюс то, чего в файле нет. */
export interface BackupEnvelope extends ProgressEnvelope {
  reason: ReplaceReason;
  /** Сырые `v1:*`: в формате 2 они не ключи формата. */
  v1: Record<string, string>;
  /** Сырые копии битого: слоты `broken:*` освобождаются, пока их содержимое не здесь. */
  broken: Record<string, string>;
  /** Исходники, которые не легли в слоты: память сессии. */
  heldBack: Record<string, string>;
}

/** Метка незаконченной замены (раздел 13, п. 5): имя и форма — навсегда. */
export interface RestoreMarker {
  format: number;
  minWriter: number;
  reason: ReplaceReason;
  /** Была ли копия сделана этой заменой (001-43). */
  backup: boolean;
  /** Цель: полные ключи девяти → строки, как их положить. */
  keys: Record<string, string>;
}

const V1_PREFIX = SAVE_PREFIX + 'v1:';
/**
 * Копии, которые запуск откладывает сам перед докаткой (битые номера и метка): в `backup`
 * их нет, потому что легли уже после копии, и докатка их не удаляет.
 */
const BOOT_COPIES = [SERVICE_KEYS.format, SERVICE_KEYS.minWriter, SERVICE_KEYS.restore].map(brokenKey);
const PROGRESS_NAMES = new Set(PROGRESS_KEYS.map((spec) => spec.key));

function isRecord(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

/** Объект «ключ → строка», где каждый ключ подходит `accept`; иначе `null`. */
function stringMap(data: unknown, accept: (key: string) => boolean): Record<string, string> | null {
  if (!isRecord(data)) return null;
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || !accept(key)) return null;
    map[key] = value;
  }
  return map;
}

const isProgressKey = (key: string): boolean => PROGRESS_NAMES.has(key);

/**
 * Разобрать метку. `'future'` — её сделала игра новее этой, ничего не трогать;
 * `null` — не разобрать (у такой формата не спрашивают: у новой форма может быть другой,
 * поэтому формат смотрится первым).
 */
export function parseMarker(raw: string): RestoreMarker | 'future' | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return null;
    const { format, minWriter, reason, backup } = data;
    if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return null;
    if (format > SAVE_FORMAT) return 'future';
    const keys = stringMap(data['keys'], isProgressKey);
    if (keys === null || typeof backup !== 'boolean') return null;
    if (reason !== 'erase' && reason !== 'restore') return null;
    const writer = typeof minWriter === 'number' ? minWriter : format;
    return { format, minWriter: writer, reason, backup, keys };
  } catch {
    return null;
  }
}

/** Что записать целиком: ключи прогресса и, при откате к копии, `v1:*` и `broken:*`. */
interface Plan {
  keys: Record<string, string>;
  v1?: Record<string, string>;
  broken?: Record<string, string>;
}

/**
 * Привести хранилище к плану. Бросает, если запись не легла. Сперва удаляется всё, что
 * плану не нужно, — это и освобождает место; потом ключи, второй номер, формат.
 */
function applyPlan(plan: Plan, keep: readonly string[] = []): void {
  const stored = Object.keys(snapshotAll());
  const v1 = plan.v1 ?? {};
  for (const key of stored) {
    if (key.startsWith(BROKEN_PREFIX)) {
      if (!keep.includes(key)) removeKey(key);
    }
    else if (isProgressKey(key) && !(key in plan.keys)) removeKey(key);
    else if (key.startsWith(V1_PREFIX) && !(key in v1)) removeKey(key);
  }
  const writes = [
    ...Object.entries(plan.keys),
    ...Object.entries(v1),
    ...Object.entries(plan.broken ?? {}),
    [SERVICE_KEYS.minWriter, JSON.stringify(SAVE_MIN_WRITER)],
    [SERVICE_KEYS.format, JSON.stringify(SAVE_FORMAT)],
  ];
  for (const [key, value] of writes) {
    if (key === undefined || value === undefined || !putKey(key, value)) {
      throw new Error(`не легла запись ${key ?? '?'}`);
    }
  }
}

/** «Только звук»: цель стирания и откат при пустом текущем. */
function soundOnly(keys: Record<string, string>): Record<string, string> {
  const sound = keys[SPECS.settings.key];
  return sound === undefined ? {} : { [SPECS.settings.key]: sound };
}

function entriesWith(prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshotAll()).filter(([key]) => key.startsWith(prefix)),
  );
}

interface State {
  keys: Record<string, string>;
  v1: Record<string, string>;
  broken: Record<string, string>;
  held: Record<string, string>;
  /** Нечего беречь: все стираемые ключи пусты, нет `v1:*`, копий битого и отложенного. */
  empty: boolean;
}

/**
 * Снять текущее. Читает девять ключей через `readKey` (поломка откладывается в
 * `broken:*` до этого места), а копии и `v1:*` берёт уже после чтения. `from` — формат,
 * с которого миграция так и не легла: музей первой сборки тогда есть только в памяти,
 * и в копию он идёт оттуда (иначе откат записал бы формат 2 поверх неперенесённого `v1:*`).
 */
function takeState(from: number | null): State {
  const keys = currentKeys(from);
  const v1 = entriesWith(V1_PREFIX);
  const broken = entriesWith(BROKEN_PREFIX);
  const held = heldBack();
  const bare = PROGRESS_KEYS.every(
    (spec) =>
      !spec.erasable || !(spec.key in keys) || keys[spec.key] === JSON.stringify(spec.fallback()),
  );
  const empty =
    bare &&
    Object.keys(v1).length === 0 &&
    Object.keys(broken).length === 0 &&
    Object.keys(held).length === 0;
  return { keys, v1, broken, held, empty };
}

function backupOf(state: State, reason: ReplaceReason, meta: ReplaceMeta): BackupEnvelope {
  return {
    kind: PROGRESS_KIND,
    format: SAVE_FORMAT,
    game: meta.game,
    savedAt: meta.now.toISOString(),
    reason,
    keys: state.keys,
    v1: state.v1,
    broken: state.broken,
    heldBack: state.held,
  };
}

/**
 * Заменить прогресс целью (`target` — проверенные строки ключей, см. `checkProgressFile`)
 * или стереть, если цель — «только звук». Вне режима `normal` — `refused`.
 */
export function replaceProgress(
  target: Record<string, string>,
  reason: ReplaceReason,
  meta: ReplaceMeta,
): ReplaceResult {
  const result = replace(target, reason, meta);
  noteStore(reason, { result });
  return result;
}

function replace(
  target: Record<string, string>,
  reason: ReplaceReason,
  meta: ReplaceMeta,
): ReplaceResult {
  if (!mayWrite() || storeMode() !== 'normal') return 'refused';
  const state = takeState(settleMigration());
  if (!state.empty && !putKey(SERVICE_KEYS.backup, JSON.stringify(backupOf(state, reason, meta)))) {
    return 'no-space';
  }
  const marker: RestoreMarker = {
    format: SAVE_FORMAT,
    minWriter: SAVE_MIN_WRITER,
    reason,
    backup: !state.empty,
    keys: target,
  };
  // Не легла метка — тронута только копия, а она и есть текущее состояние.
  if (!putKey(SERVICE_KEYS.restore, JSON.stringify(marker))) return 'no-space';
  try {
    applyPlan({ keys: target });
  } catch {
    // Откат берёт то, что было, из памяти: хранилище к этому моменту наполовину другое.
    const back: Plan = state.empty
      ? { keys: soundOnly(state.keys) }
      : { keys: state.keys, v1: state.v1, broken: state.broken };
    try {
      applyPlan(back);
    } catch {
      return 'interrupted';
    }
    removeKey(SERVICE_KEYS.restore);
    return 'no-space';
  }
  removeKey(SERVICE_KEYS.restore);
  clearHeldBack();
  return 'ok';
}

/** «Стереть весь прогресс»: цель — только звук (он принадлежит взрослому, 001-29). */
export function eraseProgress(meta: ReplaceMeta): ReplaceResult {
  const key = SPECS.settings.key;
  const sound = rawKey(key) === null ? {} : { [key]: JSON.stringify(readKey(SPECS.settings)) };
  return replaceProgress(sound, 'erase', meta);
}

/** Копия из хранилища для отката при запуске; `null` — нет или не разобрать. */
function storedBackup(): Plan | null {
  const raw = rawKey(SERVICE_KEYS.backup);
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return null;
    const keys = stringMap(data['keys'], isProgressKey);
    const v1 = stringMap(data['v1'] ?? {}, (key) => key.startsWith(V1_PREFIX));
    const broken = stringMap(data['broken'] ?? {}, (key) => key.startsWith(BROKEN_PREFIX));
    return keys === null || v1 === null || broken === null ? null : { keys, v1, broken };
  } catch {
    return null;
  }
}

/**
 * Докат метки при запуске (режим `normal`, формат метки не новее игры). Цель записана —
 * метка снята. Не вышло — откат (к копии, если `backup: true`, иначе «только звук») и метка
 * снимается в любом случае. Не бросает.
 */
export function rollMarker(marker: RestoreMarker): 'rolled-forward' | 'rolled-back' {
  try {
    applyPlan({ keys: marker.keys }, BOOT_COPIES);
    removeKey(SERVICE_KEYS.restore);
    noteStore('restore', { rolled: 'forward', reason: marker.reason });
    return 'rolled-forward';
  } catch {
    /* ниже: откат */
  }
  try {
    const back = marker.backup
      ? storedBackup()
      : { keys: soundOnly(entriesWith(SPECS.settings.key)) };
    if (back !== null) applyPlan(back, BOOT_COPIES);
  } catch {
    /* откат не удался: метка всё равно снимается, 001-38 */
  }
  noteStore('restore', { rolled: 'back', reason: marker.reason });
  removeKey(SERVICE_KEYS.restore);
  return 'rolled-back';
}
