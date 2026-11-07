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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { save } from '../src/systems/save';
import { questSave } from '../src/systems/questSave';
import { englishSave } from '../src/systems/englishSave';
import { QUEST_NODES, roundNodes } from '../src/data/quest';
import { eraseAllProgress } from '../src/systems/eraseAll';
import { MAX_SKILL, skillSave } from '../src/systems/skill';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';
import {
  clearHeldBack,
  heldBack,
  lastWriteOk,
  openStore,
  readKey,
  writeKey,
} from '../src/systems/saveStore';
import {
  DISPOSABLE_KEYS,
  PROGRESS_KEYS,
  SAVE_PREFIX,
  SERVICE_KEYS,
  SPECS,
  brokenKey,
  type KeySpec,
} from '../src/systems/saveKeys';
import { CONFIG } from '../src/config';

/** Узел квеста по id: наклейки у узлов настоящие, выдумывать их тут нельзя. */
function node(id: string): { id: string; sticker: string } {
  const found = QUEST_NODES.find((item) => item.id === id);
  if (found === undefined) throw new Error(`нет узла ${id}`);
  return found;
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = installMemoryStorage();
  clearHeldBack();
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

  // «Музей первой версии игры переносится, а не теряется» переехал в
  // `saveFormat.test.ts` на `openStore`: ленивой ветки в `loadCollection` больше нет.

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

  it('«стереть весь прогресс» стирает всё: леса, квест, английский и ступени', () => {
    const solved = node('q1');
    save.addToCollection(['acorn']);
    save.saveLevelFound(5, ['t0']);
    save.saveCurrentLevel(5);
    questSave.markSolved(solved.id, solved.sticker);
    englishSave.markDone('first', 'anagram');
    for (let i = 0; i < MAX_SKILL; i++) skillSave.note('memory', 1, 0);
    expect(skillSave.of('memory')).toBeGreaterThan(0);

    eraseAllProgress();

    expect(save.loadCollection()).toEqual([]);
    expect(save.loadLevelFound(5)).toEqual([]);
    expect(save.loadCurrentLevel()).toBe(1);
    expect(questSave.solvedNodes()).toEqual([]);
    expect(questSave.stickers()).toEqual([]);
    expect(englishSave.doneCount('first')).toBe(0);
    // Ступень — это «насколько трудно»; после стирания задачки начинаются с лёгких.
    expect(skillSave.of('memory')).toBe(0);
  });

  it('«стереть всё» убирает и музей первой версии, иначе он остаётся в хранилище', () => {
    // Раньше v1 возвращался в пустой v2 при чтении; теперь его переносит запуск,
    // но «стереть всё» всё равно стирает, а не прячет (этап 5 кладёт v1 в копию).
    storage.setItem('diplodok-kladoiskatel:v1:collection', JSON.stringify(['acorn', 'pine']));
    openStore();
    expect(save.loadCollection()).toEqual(['acorn', 'pine']);

    eraseAllProgress();

    expect(save.loadCollection()).toEqual([]);
    expect(storage.getItem('diplodok-kladoiskatel:v1:collection')).toBeNull();
  });

  it('уголок взрослых зовёт общий сброс, а не свой список', () => {
    // Свой список в сцене уже терял ступени: тест сцены не запустить, читаем код.
    // Стирание живёт в меню взрослых (этап 8), стартовая сцена его только открывает.
    const scene = readFileSync('src/scenes/parentsMenu.ts', 'utf8');
    expect(scene).toContain('eraseAllProgress()');
    expect(scene).not.toContain('save.resetAll()');
  });
});

const BAD_STRINGS = ['{ сломано', '"строка"', 'null', '[1,"x"]'];
const P = SAVE_PREFIX;

describe('копия битого', () => {
  it('девять ключей, порядок и имена зафиксированы', () => {
    expect(PROGRESS_KEYS).toHaveLength(9);
    expect(new Set(PROGRESS_KEYS.map((spec) => spec.key)).size).toBe(9);
    // Литералы набраны руками и сверены с 1.1: переименованный ключ — потерянный прогресс.
    expect(PROGRESS_KEYS.map((spec) => spec.key)).toEqual([
      'diplodok-kladoiskatel:v2:current',
      'diplodok-kladoiskatel:v2:levels',
      'diplodok-kladoiskatel:v2:completed',
      'diplodok-kladoiskatel:v2:collection',
      'diplodok-kladoiskatel:v2:settings',
      'diplodok-kladoiskatel:v3:quest-solved',
      'diplodok-kladoiskatel:v3:quest-stickers',
      'diplodok-kladoiskatel:v3:english-done',
      'diplodok-kladoiskatel:v3:quest-skill',
    ]);
    expect(SPECS.collectionV1.key).toBe('diplodok-kladoiskatel:v1:collection');
    for (const spec of PROGRESS_KEYS) expect(spec.key.startsWith(P + 'v')).toBe(true);
    // Звук взрослого «Стереть всё» не трогает (001-29), остальное стирает.
    expect(PROGRESS_KEYS.filter((spec) => !spec.erasable).map((spec) => spec.key)).toEqual([
      P + 'v2:settings',
    ]);
    expect(brokenKey(P + 'v2:levels')).toBe(P + 'broken:v2:levels');
    expect([...DISPOSABLE_KEYS].sort()).toEqual([SERVICE_KEYS.crash, SERVICE_KEYS.journal]);
  });

  for (const spec of PROGRESS_KEYS) {
    it(`${spec.key.slice(P.length)}: битая строка после записи не пропадает бесследно`, () => {
      for (const raw of BAD_STRINGS) {
        storage.clear();
        clearHeldBack();
        storage.setItem(spec.key, raw);
        readKey(spec);
        writeKey(spec, spec.fallback());
        expect(storage.getItem(brokenKey(spec.key)), raw).toBe(raw);
      }
    });
  }

  it('копия ложится при чтении, до любой записи', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1","q2","q3"');
    expect(questSave.solvedNodes()).toEqual([]);
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBe('["q1","q2","q3"');
  });

  it('запись вслепую (без чтения) тоже сперва откладывает старую строку', () => {
    // saveCurrentLevel и saveSettings пишут, ничего не читая.
    storage.setItem(P + 'v2:settings', '{"muted":"yes"}');
    save.saveSettings({ muted: true });
    expect(storage.getItem(P + 'broken:v2:settings')).toBe('{"muted":"yes"}');
    expect(save.loadSettings().muted).toBe(true);
  });

  it('слепая запись: копия ложится раньше, чем пишется новое (вкладку закрыли между ними)', () => {
    storage.setItem(P + 'v2:settings', '{"muted":"yes"}');
    storage.failAfter(1);
    save.saveSettings({ muted: true });
    // Легла одна запись — копия; новое не легло, а ключ ещё старый.
    expect(storage.getItem(P + 'broken:v2:settings')).toBe('{"muted":"yes"}');
    expect(storage.getItem(P + 'v2:settings')).toBe('{"muted":"yes"}');
    expect(lastWriteOk()).toBe(false);
  });

  it('обрезанный список решённых: следующий узел не стирает прежние бесследно', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1","q2","q3"');
    questSave.markSolved('q4', node('q4').sticker);
    expect(questSave.solvedNodes()).toEqual(['q4']);
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBe('["q1","q2","q3"');
  });

  it('понятое не теряется: игра получает его, а исходник уходит в копию', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1",5]');
    expect(questSave.solvedNodes()).toEqual(['q1']);
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBe('["q1",5]');
  });

  it('целые данные копии не порождают и ничего не пишут сами', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1"]');
    storage.setItem(P + 'v2:current', '4.7');
    const before = storage.sets;
    expect(questSave.solvedNodes()).toEqual(['q1']);
    expect(save.loadCurrentLevel()).toBe(4);
    expect(storage.sets).toBe(before);
    expect([...storage.items.keys()].some((key) => key.includes('broken:'))).toBe(false);
  });

  it('повторное чтение того же битого копию заново не пишет', () => {
    storage.setItem(P + 'v3:quest-solved', '["q1",5]');
    questSave.solvedNodes();
    const sets = storage.sets;
    for (let i = 0; i < 5; i += 1) questSave.solvedNodes();
    expect(storage.sets).toBe(sets);
    expect(heldBack()).toEqual({});
  });

  it('вторая поломка того же ключа: в слоте первая, вторая только в памяти (I4)', () => {
    const levels = P + 'v2:levels';
    storage.setItem(levels, '{"1":["t0",');
    readKey(SPECS.levels);
    writeKey(SPECS.levels, { 1: ['t0'] });
    storage.setItem(levels, '[]');
    readKey(SPECS.levels);
    expect(storage.getItem(P + 'broken:v2:levels')).toBe('{"1":["t0",');
    expect(heldBack()).toEqual({ [levels]: '[]' });
    // Слот первой поломки при новой записи тоже не тронут.
    save.saveLevelFound(2, ['t1']);
    expect(storage.getItem(P + 'broken:v2:levels')).toBe('{"1":["t0",');
  });

  it('предел: копия, не влезающая вместе с прочими, остаётся в памяти, прочие целы', () => {
    const limit = CONFIG.save.brokenMaxBytes;
    const first = 'x'.repeat(limit - 400);
    storage.setItem(P + 'broken:v2:completed', first);
    storage.setItem(P + 'v3:quest-solved', '[' + '"q1",'.repeat(200) + '5]');
    const raw = storage.getItem(P + 'v3:quest-solved');
    questSave.solvedNodes();
    expect(storage.getItem(P + 'broken:v2:completed')).toBe(first);
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBeNull();
    expect(heldBack()).toEqual({ [P + 'v3:quest-solved']: raw });
    // Короткая поломка в тот же остаток ещё помещается.
    storage.setItem(P + 'v2:current', '"пять"');
    save.loadCurrentLevel();
    expect(storage.getItem(P + 'broken:v2:current')).toBe('"пять"');
  });

  it('нет места под копию: одноразовое убрано, backup на месте, копия легла', () => {
    // Журнал мал: убрать только его места под копию не хватит, уходит и crash (001-79).
    storage.setItem(SERVICE_KEYS.journal, 'j'.repeat(5));
    storage.setItem(SERVICE_KEYS.crash, 'c'.repeat(2000));
    storage.setItem(SERVICE_KEYS.backup, 'b'.repeat(3000));
    const raw = '["q1",' + '5,'.repeat(40) + '5]';
    storage.setItem(P + 'v3:quest-solved', raw);
    storage.quota = storage.used() + 20;

    questSave.solvedNodes();

    expect(storage.getItem(SERVICE_KEYS.journal)).toBeNull();
    expect(storage.getItem(SERVICE_KEYS.crash)).toBeNull();
    expect(storage.getItem(SERVICE_KEYS.backup)).toBe('b'.repeat(3000));
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBe(raw);
    expect(heldBack()).toEqual({});
  });

  it('места нет и после этого: исходник в памяти, запись нового идёт, ничего не бросает', () => {
    storage.setItem(SERVICE_KEYS.journal, 'j');
    storage.setItem(SERVICE_KEYS.backup, 'b'.repeat(500));
    const raw = '["q1",' + '5,'.repeat(300) + '5]';
    storage.setItem(P + 'v3:quest-solved', raw);
    storage.quota = storage.used();

    expect(() => questSave.markSolved('q2', node('q2').sticker)).not.toThrow();

    expect(storage.getItem(SERVICE_KEYS.backup)).toBe('b'.repeat(500));
    expect(storage.getItem(P + 'broken:v3:quest-solved')).toBeNull();
    expect(heldBack()).toEqual({ [P + 'v3:quest-solved']: raw });
    // Новое короче исходника и помещается: узел отмечен (001-13).
    expect(questSave.solvedNodes()).toEqual(['q1', 'q2']);
  });

  it('переполнение между двумя записями одного действия: узел и наклейка оба на месте (G)', () => {
    const q1 = node('q1');
    questSave.markSolved(q1.id, q1.sticker);
    storage.setItem(SERVICE_KEYS.journal, 'j'.repeat(3000));
    storage.setItem('другая-игра:большой', 'x'.repeat(5000));
    // Хватает на рост списка узлов, но не на рост списка наклеек.
    storage.quota = storage.used() + 8;
    const q2 = node('q2');

    questSave.markSolved(q2.id, q2.sticker);

    expect(questSave.solvedNodes()).toEqual([q1.id, q2.id]);
    expect(questSave.stickers()).toContain(q2.sticker);
    expect(storage.getItem(SERVICE_KEYS.journal)).toBeNull();
    expect(lastWriteOk()).toBe(true);
  });

  it('сбой, не связанный с местом, одноразовое не трогает и честно ставит lastWriteOk', () => {
    storage.setItem(SERVICE_KEYS.journal, 'j');
    writeKey(SPECS.current, 3);
    expect(lastWriteOk()).toBe(true);
    storage.failOnWrite(1);
    writeKey(SPECS.current, 4);
    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(SERVICE_KEYS.journal)).toBe('j');
    expect(save.loadCurrentLevel()).toBe(3);
  });

  it('хранилище, которое бросает на каждом шаге, игру не роняет', () => {
    const angry = {
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
      removeItem: () => {
        throw new Error('нет доступа');
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = angry;
    expect(save.loadCurrentLevel()).toBe(1);
    expect(() => {
      save.saveCurrentLevel(3);
      questSave.markSolved('q1', node('q1').sticker);
      save.resetAll();
    }).not.toThrow();
    expect(lastWriteOk()).toBe(false);
    // Самого `localStorage` может не быть вовсе (запрет cookie).
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    try {
      expect(questSave.solvedNodes()).toEqual([]);
      expect(() => save.saveCurrentLevel(2)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe('декодеры', () => {
  const SAMPLES = [
    '"x"',
    '[1,"x",2.5]',
    '{"a":[1,"b"],"c":7}',
    '{"muted":1}',
    '{"muted":true,"extra":1}',
    '-3',
    '4.7',
    '1e999',
    '[1e999,2]',
    '{"sudoku":9,"q":"x"}',
    '{"sudoku":-0.4,"memory":1e999,"word":2.6}',
    '{"__proto__":["a",1],"3":["t0"]}',
    'null',
    '[]',
    '{}',
  ];

  it('идемпотентны на своём выходе: понятое, записанное в файл, файл принимает (F)', () => {
    for (const spec of PROGRESS_KEYS) {
      for (const text of SAMPLES) {
        const first = spec.decode(JSON.parse(text));
        const again = spec.decode(JSON.parse(JSON.stringify(first.value)));
        expect(again.lossless, `${spec.key} ${text}`).toBe(true);
        expect(again.value, `${spec.key} ${text}`).toEqual(first.value);
      }
    }
  });

  it('приведение — не потеря: 4.7 это лес 4, ступень 2.6 это 3', () => {
    expect(SPECS.current.decode(4.7)).toEqual({ value: 4, lossless: true });
    expect(SPECS.skill.decode({ word: 2.6 })).toEqual({ value: { word: 3 }, lossless: true });
  });

  it('потеря — это выброшенное или заменённое умолчанием, и только оно', () => {
    const table: [KeySpec<unknown>, unknown, boolean][] = [
      [SPECS.current, 4, true],
      [SPECS.current, 0.5, false],
      // Ноль — не лес: «Играть» повела бы в лес с номером 0, поэтому это потеря.
      [SPECS.current, 0, false],
      [SPECS.current, '4', false],
      [SPECS.levels, { '1': ['t0'] }, true],
      [SPECS.levels, { '1': ['t0', 5] }, false],
      [SPECS.levels, { '1': 't0' }, false],
      [SPECS.levels, ['t0'], false],
      [SPECS.completed, [1, 2], true],
      [SPECS.completed, [1, '2'], false],
      [SPECS.collection, ['coin', 'неизвестный-предмет'], true],
      [SPECS.collection, ['coin', 1], false],
      [SPECS.settings, { muted: true }, true],
      [SPECS.settings, { muted: 'yes' }, false],
      [SPECS.solved, ['q1', 'узел-которого-нет'], true],
      [SPECS.solved, ['q1', 5], false],
      [SPECS.stickers, ['sticker-flag-boot', 5], false],
      [SPECS.englishDone, ['first:anagram'], true],
      [SPECS.englishDone, { first: 1 }, false],
      [SPECS.skill, { sudoku: 2 }, true],
      [SPECS.skill, { sudoku: '2' }, false],
      [SPECS.skill, [2], false],
      // Не конечное число у ступени — потеря (001-51): в файл оно не ляжет.
      [SPECS.skill, { memory: Infinity }, false],
    ];
    for (const [spec, data, lossless] of table) {
      expect(spec.decode(data).lossless, `${spec.key} ${JSON.stringify(data)}`).toBe(lossless);
    }
  });

  it('ступень зажата в 0…4, и это приведение, а не потеря', () => {
    expect(SPECS.skill.decode({ quiz: 99, word: -2 })).toEqual({
      value: { quiz: 4, word: 0 },
      lossless: true,
    });
  });

  it('отсутствие ключа даёт новое пустое значение каждый раз', () => {
    const one = readKey(SPECS.levels);
    one['5'] = ['t0'];
    expect(readKey(SPECS.levels)).toEqual({});
  });
});

describe('хранилище читает только saveStore', () => {
  it('ни один модуль игры, кроме saveStore.ts (и ловушки сбоев), не трогает localStorage', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = dir + '/' + name;
        if (statSync(path).isDirectory()) walk(path);
        // Ловушка сбоев — единственное исключение: до `attachStore` её нельзя связывать с saveStore
        // (граф зависимостей держит `crashTrap.test.ts`), и сбой при загрузке она читает напрямую.
        else if (path.endsWith('.ts') && !path.endsWith('systems/saveStore.ts') && path !== 'src/crashTrap.ts') {
          // Слово в комментарии — не обращение: комментарии вырезаем.
          const code = readFileSync(path, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
          if (code.includes('localStorage')) offenders.push(path);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
