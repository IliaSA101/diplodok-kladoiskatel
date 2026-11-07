/**
 * Сохранение: прогресс леса, музей находок и настройки.
 *
 * Само хранилище — `saveStore.ts` (чтение с копией битого, запись с повтором на
 * переполнении), формы значений — `saveKeys.ts`. Здесь только то, что игра
 * хочет спросить и записать. Любая ошибка хранилища гасится: игра всегда
 * должна запускаться.
 */
import { SPECS, type Settings } from './saveKeys';
import { readKey, writeKey } from './saveStore';

export type { Settings };

export const save = {
  /** Лес, который открывается кнопкой «Играть». */
  loadCurrentLevel(): number {
    return readKey(SPECS.current);
  },

  saveCurrentLevel(level: number): void {
    writeKey(SPECS.current, Math.max(1, Math.floor(level)));
  },

  /** id кладов, найденных в этом лесу. */
  loadLevelFound(level: number): string[] {
    return readKey(SPECS.levels)[String(level)] ?? [];
  },

  saveLevelFound(level: number, found: readonly string[]): void {
    const levels = readKey(SPECS.levels);
    levels[String(level)] = [...found];
    writeKey(SPECS.levels, levels);
  },

  /** Леса, пройденные полностью (включая секретный клад). */
  loadCompleted(): number[] {
    return readKey(SPECS.completed);
  },

  isLevelComplete(level: number): boolean {
    return save.loadCompleted().includes(level);
  },

  markLevelComplete(level: number): void {
    const done = new Set(save.loadCompleted());
    done.add(level);
    writeKey(SPECS.completed, [...done].sort((a, b) => a - b));
  },

  /** Все предметы, найденные за всё время (музей). Музей первой сборки переносит `openStore`. */
  loadCollection(): string[] {
    return readKey(SPECS.collection);
  },

  addToCollection(itemIds: readonly string[]): void {
    const all = new Set(save.loadCollection());
    for (const id of itemIds) all.add(id);
    writeKey(SPECS.collection, [...all]);
  },

  /**
   * Пройти лес заново: забываем находки и снимаем корону.
   *
   * Музей не трогаем: найденное однажды из него не пропадает — иначе откат
   * одного леса наказывал бы за всю игру.
   */
  resetLevel(level: number): void {
    const levels = readKey(SPECS.levels);
    delete levels[String(level)];
    writeKey(SPECS.levels, levels);
    writeKey(SPECS.completed, save.loadCompleted().filter((n) => n !== level));
  },

  /**
   * Обнулить прогресс леса, корону, музей и текущий лес — для тестов. «Стереть всё» у
   * взрослых — `eraseAllProgress()`: оно сперва кладёт резервную копию.
   */
  resetAll(): void {
    writeKey(SPECS.levels, {});
    writeKey(SPECS.completed, []);
    writeKey(SPECS.collection, []);
    writeKey(SPECS.current, 1);
  },

  loadSettings(): Settings {
    return readKey(SPECS.settings);
  },

  saveSettings(settings: Settings): void {
    writeKey(SPECS.settings, settings);
  },
};
