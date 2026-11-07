/**
 * Что хранилище сообщает журналу (design 001, раздел 7).
 *
 * Журнал пишет в хранилище, а хранилище и замена хотят попасть в журнал: прямой
 * импорт замкнул бы круг. Поэтому между ними — этот маленький модуль: хранилище
 * зовёт `noteStore`, журнал при загрузке ставит `setStoreObserver`. Без журнала
 * (тесты хранилища) вызов ничего не делает. Модуль без Phaser и без DOM.
 */
import { SAVE_PREFIX } from './saveKeys';

export const JOURNAL_KINDS = [
  'boot',
  'scene',
  'solved',
  'english',
  'save',
  'broken',
  'broken-again',
  'migrate',
  'restore',
  'erase',
  'error',
  'store',
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

type Observer = (kind: JournalKind, detail?: unknown) => void;

let observer: Observer | null = null;

/** Поставить (или снять, `null`) того, кто слушает хранилище. Он один. */
export function setStoreObserver(next: Observer | null): void {
  observer = next;
}

/** Сообщить журналу. Не бросает никогда: журнал не вправе ломать запись прогресса. */
export function noteStore(kind: JournalKind, detail?: unknown): void {
  try {
    observer?.(kind, detail);
  } catch {
    /* журнал — не прогресс */
  }
}

/** Ключ без общего префикса: `v2:levels` вместо `diplodok-kladoiskatel:v2:levels`. */
export function shortKey(key: string): string {
  return key.startsWith(SAVE_PREFIX) ? key.slice(SAVE_PREFIX.length) : key;
}
