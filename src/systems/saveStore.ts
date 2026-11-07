/**
 * Хранилище сохранения: единственное место, где игра трогает `localStorage`.
 *
 * Модуль без Phaser. Модули-читатели (`save`, `questSave`, `englishSave`, `skill`)
 * отдают сюда спецификацию ключа из `saveKeys.ts` и получают понятое значение.
 *
 * Три обещания:
 * - **Битое не пропадает бесследно.** Если из строки пришлось что-то выбросить,
 *   исходник сперва откладывается в `broken:<ключ>` и только потом игра идёт
 *   дальше с тем, что поняла. Первая копия на ключ выигрывает (001-40): поздняя
 *   поломка живёт только в памяти сессии (`heldBack`), чужую копию ради неё не стираем.
 * - **Запись не бросает и на переполнении лечится** (001-34): убираются одноразовые
 *   `journal` и `crash`, запись повторяется. Иначе решённый узел остаётся без
 *   наклейки навсегда.
 * - **Любое обращение к `localStorage` — в `try`.** Приватный режим и запрет cookie
 *   дают игру без сохранения, а не пустой экран.
 *
 * Кэша нет: e2e и `?shots` кладут данные прямо в `localStorage`, кэш разошёлся бы с ними.
 */
import { CONFIG } from '../config';
import {
  BROKEN_PREFIX,
  DISPOSABLE_KEYS,
  PROGRESS_KEYS,
  SAVE_FORMAT,
  SAVE_MIN_WRITER,
  SAVE_PREFIX,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
  type Decoded,
  type KeySpec,
} from './saveKeys';
import { migrateKV, type KV } from './saveMigrations';
import { rememberOpenStatus } from './openStatus';
import { parseMarker, rollMarker } from './saveReplace';
import { noteStore, shortKey } from './storeEvents';

/**
 * Что хранилище позволяет этой игре (design 001, раздел 2):
 * - `normal` — формат хранилища не новее игры: миграции и запись;
 * - `newer` — хранилище новее, но его второй номер разрешает писать свои ключи;
 * - `future` — хранилище новее, писать нельзя: игра только читает;
 * - `unavailable` — к `localStorage` нет доступа: игра идёт без сохранения.
 */
export type StoreMode = 'normal' | 'newer' | 'future' | 'unavailable';
export type StoreStatus =
  | 'fresh'
  | 'ok'
  | 'migrated'
  | 'rolled-forward'
  | 'rolled-back'
  | StoreMode;

let mode: StoreMode = 'normal';
/** Формат, с которого миграция не легла: пока не `null`, перед записью её пробуют снова. */
let pendingFrom: number | null = null;

/** Текущий режим: после `openStore` он меняется только на `future` (чужая вкладка подняла формат). */
export function storeMode(): StoreMode {
  return mode;
}

/** Пишет ли игра в хранилище: в `future` и `unavailable` — ни байта. */
function readOnly(): boolean {
  return mode === 'future' || mode === 'unavailable';
}

/** Исходники, которые не удалось отложить в `broken:*`: живут до конца сессии. */
const held = new Map<string, string>();
let writeOk = true;

/** Исходники, не легшие в `broken:*` (слот занят, предел, нет места): для отчёта. */
export function heldBack(): Record<string, string> {
  return Object.fromEntries(held);
}

/** Забыть отложенное в памяти: после удачной замены и стирания, а в тестах — между кейсами. */
export function clearHeldBack(): void {
  held.clear();
}

/** Удалась ли последняя запись: для строки «Прогресс сохранён» на экране сбоя. */
export function lastWriteOk(): boolean {
  return writeOk;
}

function isQuota(error: unknown): boolean {
  // Бросить можно что угодно, и `null` тоже: разбирать нечего — это не переполнение.
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** Итог записи: легла, не легла из-за места (после повтора) или по другой причине. */
type PutResult = 'ok' | 'full' | 'error';

/** `setItem` с повтором на переполнении (001-34). Не бросает. */
function putResult(key: string, value: string): PutResult {
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (error) {
    if (!isQuota(error)) return 'error';
  }
  // Одноразовые уходят по одному, журнал первым: отчёт о прошлом сбое дороже журнала
  // (001-79). Порядок — порядок `DISPOSABLE_KEYS`: журнал, потом `crash`.
  let removed = false;
  for (const spare of DISPOSABLE_KEYS) {
    try {
      if (localStorage.getItem(spare) === null) continue;
      localStorage.removeItem(spare);
      removed = true;
      localStorage.setItem(key, value);
      return 'ok';
    } catch (error) {
      if (!isQuota(error)) return 'error';
    }
  }
  if (removed) return 'full';
  // Убирать было нечего: одна попытка ещё, место могла освободить соседняя вкладка.
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (error) {
    return isQuota(error) ? 'full' : 'error';
  }
}

function put(key: string, value: string): boolean {
  return putResult(key, value) === 'ok';
}

/** Записать строку как есть, с повтором на переполнении (001-34): для `saveReplace.ts`. Не бросает. */
export function putKey(key: string, value: string): boolean {
  return put(key, value);
}

/**
 * Записать одноразовый ключ (журнал) одной попыткой: без повтора и без освобождения места.
 * Повтор на переполнении убрал бы `crash` ради журнала, а это наоборот. Не бросает.
 */
export function putDisposable(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Прочитать строку как есть, ничего не разбирая и не откладывая: для `saveReplace.ts`. */
export function rawKey(key: string): string | null {
  return getRaw(key);
}

function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Сколько знаков занято ключами с таким началом (так считает и квота). Не бросает. */
function sizeOf(prefix: string): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      total += key.length + (localStorage.getItem(key) ?? '').length;
    }
    return total;
  } catch {
    return Infinity;
  }
}

/** Сколько знаков уже занято всеми копиями `broken:*`. */
function brokenSize(): number {
  return sizeOf(BROKEN_PREFIX);
}

/**
 * Отложить исходную строку битого ключа. Первая копия выигрывает. Не бросает.
 * `retry` — сразу после удачной записи ключа (001-57): если исходник лежит только
 * в памяти, а слот пуст, ещё раз положить его в слот; удалось — из памяти он уходит.
 * Неудачная попытка копию не кладёт, но на переполнении, как любая запись, стирает
 * одноразовые `journal` и `crash`. Круга нет без всякой памяти: пробуют один раз за
 * удачную запись, а ключ, чья запись не легла, сюда не заходит; чтение же такого ключа
 * (`!retry`) исходник в памяти не трогает — иначе чтение клало бы копию в слот,
 * а следующая запись чужого ключа снова убирала бы её.
 */
function quarantine(key: string, raw: string, retry = false): void {
  const heldAlready = held.get(key) === raw;
  if (heldAlready && !retry) return;
  if (!mayWrite()) {
    // В `future` не пишем даже копию: исходник живёт в памяти сессии и в отчёте.
    // Номера перечитываются: другая вкладка могла поднять формат с прошлой записи.
    held.set(key, raw);
    noteStore('broken-again', { key: shortKey(key), why: 'readonly' });
    return;
  }
  try {
    const slot = brokenKey(key);
    const there = localStorage.getItem(slot);
    if (there === raw) {
      if (heldAlready) held.delete(key);
      return;
    }
    if (there !== null) {
      held.set(key, raw);
      noteStore('broken-again', { key: shortKey(key), why: 'slot-taken' });
      return;
    }
    const fits = brokenSize() + slot.length + raw.length <= CONFIG.save.brokenMaxBytes;
    if (fits && put(slot, raw)) {
      if (heldAlready) held.delete(key);
      noteStore('broken', { key: shortKey(key), chars: raw.length });
    } else {
      held.set(key, raw);
      noteStore('broken-again', { key: shortKey(key), why: fits ? 'no-space' : 'limit' });
    }
  } catch {
    held.set(key, raw);
    noteStore('broken-again', { key: shortKey(key), why: 'error' });
  }
}

function decodeRaw<T>(spec: KeySpec<T>, raw: string): Decoded<T> {
  try {
    return spec.decode(JSON.parse(raw));
  } catch {
    return { value: spec.fallback(), lossless: false };
  }
}

/**
 * Прочитать ключ. Нет значения — `fallback`. Битое — понятое, а исходник к этому
 * моменту уже отложен: раньше любой записи.
 */
export function readKey<T>(spec: KeySpec<T>): T {
  const raw = getRaw(spec.key);
  if (raw === null) return spec.fallback();
  const decoded = decodeRaw(spec, raw);
  if (!decoded.lossless) quarantine(spec.key, raw);
  return decoded.value;
}

/** Прочитать, ничего не откладывая: для ключей, которые игра уже не ведёт (`v1:*`). */
export function peekKey<T>(spec: KeySpec<T>): T {
  const raw = getRaw(spec.key);
  return raw === null ? spec.fallback() : decodeRaw(spec, raw).value;
}

/**
 * Записать понятое значение. Старая строка, из которой игра не поняла всего,
 * откладывается до записи, даже если её никто не читал («слепые» записи вроде
 * `saveCurrentLevel`). Не бросает; итог — в `lastWriteOk()`.
 */
export function writeKey<T>(spec: KeySpec<T>, value: T): void {
  if (!mayWrite()) {
    writeOk = false;
    noteStore('save', { key: shortKey(spec.key), ok: false });
    return;
  }
  // Миграция не легла при запуске (место, обрыв): пробуем ещё раз до записи, иначе
  // запись `v2:collection` отняла бы у миграции условие «ключа нет вовсе» навсегда.
  const museumMissing = pendingFrom !== null && getRaw(SPECS.collection.key) === null;
  settleMigration();
  const old = getRaw(spec.key);
  const lossy = old !== null && !decodeRaw(spec, old).lossless;
  if (lossy) quarantine(spec.key, old);
  const text = JSON.stringify(
    museumMissing && spec.key === SPECS.collection.key ? withFirstMuseum(value as string[]) : value,
  );
  let result = putResult(spec.key, text);
  // 001-53/54/56: место заняла копия, совпадающая с текущей строкой своего ключа
  // (этого или другого ключа прогресса) — решённый узел важнее копии. Копии
  // освобождаются по одной, запись повторяется после каждой, пока не ляжет:
  // убирается не больше, чем нужно записи. Освобождённое уходит в память сессии
  // (в отчёт); исходник записываемого ключа, лежащий только там, пробуют вернуть
  // в слот сразу после удачной записи (001-57), а не до неё.
  if (result === 'full') {
    for (const key of releaseOrder(spec.key)) {
      if (!releaseCopy(key)) continue;
      result = putResult(spec.key, text);
      if (result !== 'full') break;
    }
  }
  if (result === 'ok' && lossy && held.get(spec.key) === old) quarantine(spec.key, old, true);
  writeOk = result === 'ok';
  noteStore('save', { key: shortKey(spec.key), ok: writeOk });
}

/**
 * Повторить миграцию, которая не легла при запуске (режим `normal`). Возвращает формат, с
 * которого она ещё не сделана, или `null`, если всё привело к формату игры.
 */
export function settleMigration(): number | null {
  if (pendingFrom !== null && mode === 'normal' && migrateStore(pendingFrom)) pendingFrom = null;
  return pendingFrom;
}

/**
 * Музей, записываемый до того, как музей первой сборки перенесён: значение собрано
 * при пустом `v2:collection`, поэтому к нему добавляется всё, что лежит в `v1` и во
 * вдруг появившемся `v2`. Находки не убавляются, а повторов нет.
 */
function withFirstMuseum(value: readonly string[]): string[] {
  const all = new Set(value);
  for (const id of peekKey(SPECS.collectionV1)) all.add(id);
  for (const id of peekKey(SPECS.collection)) all.add(id);
  return [...all];
}

/** Порядок освобождения: сперва слот записываемого ключа, потом остальные по `PROGRESS_KEYS`. */
function releaseOrder(first: string): string[] {
  return [first, ...PROGRESS_KEYS.map((spec) => spec.key).filter((key) => key !== first)];
}

/**
 * Убрать слот `broken:<key>`, если в нём ровно текущая строка ключа `key` (копия,
 * совпадающая с ней, — и свежая, и ранняя из прошлой сессии: строка побайтно та же,
 * 001-40 не нарушается), и положить строку в `heldBack`. Истина, если убрано.
 */
function releaseCopy(key: string): boolean {
  const raw = getRaw(key);
  if (raw === null || getRaw(brokenKey(key)) !== raw) return false;
  removeKey(brokenKey(key));
  held.set(key, raw);
  return true;
}

/** Удалить ключ целиком (только то, что игра сама вправе убрать: `v1:*`). */
export function removeKey(key: string): void {
  if (readOnly()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* стирать нечего */
  }
}

// --- Номер формата, режимы и запуск (design 001, разделы 2 и 4) ---

/** Целое ≥ 1 или `null`: так выглядит исправный номер формата. */
function parseCount(raw: string): number | null {
  try {
    const n: unknown = JSON.parse(raw);
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

interface Formats {
  format: number;
  minWriter: number;
  rawFormat: string | null;
  rawMinWriter: string | null;
}

/**
 * Оба номера из хранилища. Нет ключа `format` или он битый — 1 (так пишут все сборки
 * до 1.1.1). Нет второго номера, он битый или больше `format` — равен `format`.
 */
function readFormats(): Formats {
  const rawFormat = getRaw(SERVICE_KEYS.format);
  const rawMinWriter = getRaw(SERVICE_KEYS.minWriter);
  const format = (rawFormat === null ? null : parseCount(rawFormat)) ?? 1;
  const writer = rawMinWriter === null ? null : parseCount(rawMinWriter);
  const minWriter = writer === null || writer > format ? format : writer;
  return { format, minWriter, rawFormat, rawMinWriter };
}

/** Режим игры с форматом `SAVE_FORMAT` на хранилище формата `format` и второго номера `minWriter`. */
function modeFor(format: number, minWriter: number): 'normal' | 'newer' | 'future' {
  if (format <= SAVE_FORMAT) return 'normal';
  if (minWriter <= SAVE_FORMAT) return 'newer';
  return 'future';
}

/**
 * Можно ли писать прямо сейчас. Номера перечитываются перед каждой записью (001-36):
 * другая вкладка с новой игрой могла поднять формат посреди сессии, и запись
 * по старым представлениям испортила бы чужое.
 */
export function mayWrite(): boolean {
  if (readOnly()) return false;
  const { format, minWriter } = readFormats();
  const now = modeFor(format, minWriter);
  const was = mode;
  mode = now;
  if (now !== was) noteStore('store', { mode: now, from: was });
  return now !== 'future';
}

/** Нужно ли перезагрузить вкладку по событию `storage` (ключ из события; `null` — `clear()`). */
export function shouldReloadOn(key: string | null): boolean {
  return (
    key === null ||
    key === SERVICE_KEYS.format ||
    key === SERVICE_KEYS.minWriter ||
    key === SERVICE_KEYS.restore
  );
}

/** То ли это хранилище, о котором событие `storage`: у `sessionStorage` те же имена ничего не значат. */
export function isStoreArea(area: Storage | null): boolean {
  try {
    return area !== null && area === localStorage;
  } catch {
    return false;
  }
}

/** Все ключи игры как есть, кроме одноразовых `journal` и `crash`. Не бросает. */
export function snapshotAll(): Record<string, string> {
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
}

/** Привести хранилище к формату игры. Истина, если всё легло: иначе повторим при следующем запуске. */
function migrateStore(from: number): boolean {
  const before = snapshotAll();
  const kv: KV = new Map(Object.entries(before));
  migrateKV(kv, from);
  const changed = [...kv.keys()].filter((key) => kv.get(key) !== before[key]);
  // Сперва ключи прогресса, потом второй номер, потом формат: обрыв между ними
  // оставляет формат старым, и следующий запуск доделает (миграции идемпотентны).
  const first = new Set(PROGRESS_KEYS.map((spec) => spec.key));
  const order = [
    ...changed.filter((key) => first.has(key)),
    ...changed.filter((key) => !first.has(key)),
  ];
  for (const key of order) {
    if (!put(key, kv.get(key) ?? '')) return false;
  }
  return (
    put(SERVICE_KEYS.minWriter, JSON.stringify(SAVE_MIN_WRITER)) &&
    put(SERVICE_KEYS.format, JSON.stringify(SAVE_FORMAT))
  );
}

/**
 * Запуск хранилища: из `main.ts` до первой сцены. Определяет режим, при формате
 * старее игры — переводит данные миграциями, потом читает все девять ключей, чтобы
 * битое откладывалось сразу, а не когда ребёнок дойдёт до экрана (в коде есть
 * «слепые» записи без чтения). Никогда не бросает.
 *
 * Порядок: сперва оба номера и режим (`future` — выйти, не тронув ничего, и метку
 * тоже), потом метка `restore`. Метка новее игры — `future`; не разобрать — копия
 * в `broken:restore` и метка снята; иначе, в режиме `normal`, докат (`saveReplace.ts`):
 * до докатки битые номера откладываются, потому что докатка перепишет оба.
 */
export function openStore(): StoreStatus {
  let status: StoreStatus;
  try {
    status = open();
  } catch {
    // Неожиданное в середине запуска: не пишем, чтобы не портить то, что не поняли.
    mode = 'unavailable';
    status = 'unavailable';
  }
  if (mode !== 'normal') noteStore('store', { status });
  // Меню взрослых скажет «прошлая замена не удалась», если запуск её откатил.
  rememberOpenStatus(status);
  return status;
}

function open(): StoreStatus {
  mode = 'normal';
  pendingFrom = null;
  try {
    localStorage.getItem(SERVICE_KEYS.format);
  } catch {
    mode = 'unavailable';
    return 'unavailable';
  }
  let formats = readFormats();
  mode = modeFor(formats.format, formats.minWriter);
  if (mode === 'future') return 'future';
  const raw = getRaw(SERVICE_KEYS.restore);
  const marker = raw === null ? null : parseMarker(raw);
  if (marker === 'future') {
    mode = 'future';
    return 'future';
  }
  // Битые номера откладываем, когда режим уже известен: в `future` не пишется ничего.
  if (formats.rawFormat !== null && parseCount(formats.rawFormat) === null)
    quarantine(SERVICE_KEYS.format, formats.rawFormat);
  if (formats.rawMinWriter !== null && parseCount(formats.rawMinWriter) === null) {
    quarantine(SERVICE_KEYS.minWriter, formats.rawMinWriter);
  }
  let rolled: 'rolled-forward' | 'rolled-back' | null = null;
  if (raw !== null && marker === null) {
    quarantine(SERVICE_KEYS.restore, raw);
    removeKey(SERVICE_KEYS.restore);
  } else if (marker !== null && mode === 'normal') {
    rolled = rollMarker(marker);
    formats = readFormats();
    mode = modeFor(formats.format, formats.minWriter);
  }
  let status: StoreStatus = mode === 'newer' ? 'newer' : 'ok';
  if (mode === 'normal' && formats.format < SAVE_FORMAT) {
    const fresh = Object.keys(snapshotAll()).length === 0;
    if (migrateStore(formats.format)) status = fresh ? 'fresh' : 'migrated';
    else pendingFrom = formats.format;
    // Свежая игра мигрировать нечего: след нужен, когда перенесли чужое или не вышло.
    if (status !== 'fresh') noteStore('migrate', { from: formats.format, ok: pendingFrom === null });
  }
  for (const spec of PROGRESS_KEYS) readKey(spec);
  return rolled ?? status;
}
