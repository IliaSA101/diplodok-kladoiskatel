/**
 * Сохранение: прогресс леса, музей находок и настройки.
 *
 * Отдельный файл нужен из-за подготовки: localStorage в node нет, и его
 * приходится подменять. Ошибка здесь ничего не ломает на экране — ребёнок
 * просто приходит в лес, где его находки пропали.
 *
 * Эти проверки написаны по пробелам, которые нашли мутации
 * (`node tools/mutate.mjs save`): до них в сохранении не проверялось ничего.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { save } from '../src/systems/save';
import { questSave } from '../src/systems/questSave';
import { englishSave } from '../src/systems/englishSave';
import { QUEST_NODES, roundNodes } from '../src/data/quest';

/** Узел квеста по id: наклейки у узлов настоящие, выдумывать их тут нельзя. */
function node(id: string): { id: string; sticker: string } {
  const found = QUEST_NODES.find((item) => item.id === id);
  if (found === undefined) throw new Error(`нет узла ${id}`);
  return found;
}

/** Память вместо браузерного хранилища: ровно то, что использует save. */
class MemoryStorage {
  private items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});

describe('текущий лес', () => {
  it('без сохранения начинается с первого', () => {
    expect(save.loadCurrentLevel()).toBe(1);
  });

  it('запомненный лес открывается снова', () => {
    save.saveCurrentLevel(5);
    expect(save.loadCurrentLevel()).toBe(5);
  });

  it('мусор в хранилище не уводит в лес с номером меньше первого', () => {
    for (const junk of ['0', '-7', '"пять"', '2.7', 'не json', 'null']) {
      storage.setItem('diplodok-kladoiskatel:v2:current', junk);
      expect(save.loadCurrentLevel(), junk).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('найденные клады', () => {
  it('у каждого леса свои: иначе прогресс перепутается', () => {
    save.saveLevelFound(3, ['t0', 't5']);
    save.saveLevelFound(4, ['t1']);
    expect(save.loadLevelFound(3)).toEqual(['t0', 't5']);
    expect(save.loadLevelFound(4)).toEqual(['t1']);
    expect(save.loadLevelFound(5)).toEqual([]);
  });

  it('пройденные леса накапливаются, а не затирают друг друга', () => {
    save.markLevelComplete(2);
    save.markLevelComplete(1);
    save.markLevelComplete(2);
    expect(save.loadCompleted()).toEqual([1, 2]);
    expect(save.isLevelComplete(1)).toBe(true);
    expect(save.isLevelComplete(3)).toBe(false);
  });
});

describe('музей находок', () => {
  it('новые находки добавляются к старым', () => {
    save.addToCollection(['acorn', 'ball']);
    save.addToCollection(['ball', 'cup']);
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'ball', 'cup']));
  });

  it('музей первой версии игры переносится, а не теряется', () => {
    storage.setItem('diplodok-kladoiskatel:v1:collection', JSON.stringify(['acorn']));
    expect(save.loadCollection()).toEqual(['acorn']);
    save.addToCollection(['ball']);
    expect(new Set(save.loadCollection())).toEqual(new Set(['acorn', 'ball']));
  });

  it('битые данные не роняют игру', () => {
    storage.setItem('diplodok-kladoiskatel:v2:collection', '{ сломано');
    expect(save.loadCollection()).toEqual([]);
    storage.setItem('diplodok-kladoiskatel:v2:levels', '[1,2,3]');
    expect(save.loadLevelFound(1)).toEqual([]);
  });
});

describe('настройки', () => {
  it('выключённый звук остаётся выключённым после перезагрузки', () => {
    save.saveSettings({ muted: true });
    expect(save.loadSettings().muted).toBe(true);
    save.saveSettings({ muted: false });
    expect(save.loadSettings().muted).toBe(false);
  });

  it('без настроек звук включён', () => {
    expect(save.loadSettings().muted).toBe(false);
  });
});

describe('откат прогресса', () => {
  it('лес начинается заново: находок нет и корона снята', () => {
    save.saveLevelFound(3, ['t0', 't1']);
    save.markLevelComplete(3);
    save.saveLevelFound(4, ['t0']);
    save.markLevelComplete(4);

    save.resetLevel(3);

    expect(save.loadLevelFound(3)).toEqual([]);
    expect(save.isLevelComplete(3)).toBe(false);
    // Соседний лес откат не трогает — иначе это уже не «точечно».
    expect(save.loadLevelFound(4)).toEqual(['t0']);
    expect(save.isLevelComplete(4)).toBe(true);
  });

  it('музей переживает откат леса: найденное однажды не отнимают', () => {
    save.addToCollection(['acorn', 'shell']);
    save.saveLevelFound(2, ['t0']);
    save.resetLevel(2);
    expect(save.loadCollection().sort()).toEqual(['acorn', 'shell']);
  });

  it('полный сброс стирает и музей, и леса, и возвращает к первому', () => {
    save.addToCollection(['acorn']);
    save.saveLevelFound(5, ['t0']);
    save.markLevelComplete(5);
    save.saveCurrentLevel(5);

    save.resetAll();

    expect(save.loadCollection()).toEqual([]);
    expect(save.loadLevelFound(5)).toEqual([]);
    expect(save.loadCompleted()).toEqual([]);
    expect(save.loadCurrentLevel()).toBe(1);
  });

  it('английский набор откатывается, соседний остаётся пройденным', () => {
    englishSave.markDone('first', 'anagram');
    englishSave.markDone('first', 'search');
    englishSave.markDone('animals', 'catch');

    englishSave.resetSet('first');

    expect(englishSave.isDone('first', 'anagram')).toBe(false);
    expect(englishSave.doneCount('first')).toBe(0);
    expect(englishSave.isDone('animals', 'catch')).toBe(true);
  });

  it('пройденная игра засчитывается один раз, сколько ни проходи', () => {
    englishSave.markDone('colours', 'catch');
    englishSave.markDone('colours', 'catch');
    expect(englishSave.doneCount('colours')).toBe(1);
  });

  it('полный сброс английского стирает все наборы', () => {
    englishSave.markDone('first', 'anagram');
    englishSave.markDone('animals', 'search');
    englishSave.reset();
    expect(englishSave.doneCount('first')).toBe(0);
    expect(englishSave.doneCount('animals')).toBe(0);
  });

  it('круг квеста откатывается вместе со своими наклейками', () => {
    const [first, second, third] = [node('q1'), node('q2'), node('q9')];
    questSave.markSolved(first.id, first.sticker);
    questSave.markSolved(second.id, second.sticker);
    questSave.markSolved(third.id, third.sticker);

    questSave.resetNodes([first, second]);

    expect(questSave.solvedNodes()).toEqual([third.id]);
    expect(questSave.stickers()).toEqual([third.sticker]);
  });

  it('откат золотого круга не выносит из альбома наклейку первого', () => {
    // Наклейка у q1 и q25 одна и та же: кругов шесть, наклеек двадцать четыре.
    // Пока её даёт хоть один решённый узел, из альбома она уходить не должна.
    const plain = node('q1');
    const gold = node('q25');
    expect(gold.sticker).toBe(plain.sticker);

    questSave.markSolved(plain.id, plain.sticker);
    questSave.markSolved(gold.id, gold.sticker);
    questSave.resetNodes(roundNodes(4));

    expect(questSave.solvedNodes()).toEqual([plain.id]);
    expect(questSave.stickers()).toEqual([plain.sticker]);
  });

  it('золотая оправа достаётся только наклейкам кругов 4-6', () => {
    const plain = node('q2');
    const gold = node('q25');
    questSave.markSolved(plain.id, plain.sticker);
    expect(questSave.goldenStickers()).toEqual([]);

    questSave.markSolved(gold.id, gold.sticker);
    expect(questSave.goldenStickers()).toEqual([gold.sticker]);
  });
});
