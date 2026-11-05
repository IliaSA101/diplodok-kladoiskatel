/**
 * Что уже пройдено в английской ветке.
 *
 * Модуль намеренно без Phaser: только поэтому сохранение проверяется тестом —
 * в node движок не поднять. Хранится одна плоская строка на пару «набор + игра»
 * ('first:anagram'), чтобы добавление нового набора слов ничего не ломало.
 * Любая ошибка хранилища гасится молча: игра должна запускаться всегда.
 */
import type { EnglishGame } from '../data/english';

const KEY_DONE = 'diplodok-kladoiskatel:v3:english-done';

function mark(setId: string, game: EnglishGame): string {
  return setId + ':' + game;
}

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY_DONE);
    const data: unknown = raw === null ? null : JSON.parse(raw);
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(value: readonly string[]): void {
  try {
    localStorage.setItem(KEY_DONE, JSON.stringify([...value]));
  } catch {
    /* сохранять некуда — не беда */
  }
}

export const englishSave = {
  isDone(setId: string, game: EnglishGame): boolean {
    return read().includes(mark(setId, game));
  },

  markDone(setId: string, game: EnglishGame): void {
    const done = new Set(read());
    done.add(mark(setId, game));
    write([...done]);
  },

  /** Сколько игр набора пройдено — по этому числу экран рисует звёздочки. */
  doneCount(setId: string): number {
    const prefix = setId + ':';
    return read().filter((item) => item.startsWith(prefix)).length;
  },

  /** Пройти набор заново: три игры снова чистые, остальные наборы целы. */
  resetSet(setId: string): void {
    const prefix = setId + ':';
    write(read().filter((item) => !item.startsWith(prefix)));
  },

  /** Стереть всю ветку — для угла взрослых на стартовом экране. */
  reset(): void {
    write([]);
  },
};
