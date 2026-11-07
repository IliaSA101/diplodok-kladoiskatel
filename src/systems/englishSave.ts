/**
 * Что уже пройдено в английской ветке.
 *
 * Модуль намеренно без Phaser: только поэтому сохранение проверяется тестом —
 * в node движок не поднять. Хранится одна плоская строка на пару «набор + игра»
 * ('first:anagram'), чтобы добавление нового набора слов ничего не ломало.
 * Чтение и запись — через `saveStore.ts`: битую строку он откладывает в копию,
 * а любая ошибка хранилища гасится молча — игра должна запускаться всегда.
 */
import type { EnglishGame } from '../data/english';
import { SPECS } from './saveKeys';
import { readKey, writeKey } from './saveStore';

function mark(setId: string, game: EnglishGame): string {
  return setId + ':' + game;
}

function read(): string[] {
  return readKey(SPECS.englishDone);
}

function write(value: readonly string[]): void {
  writeKey(SPECS.englishDone, [...value]);
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
