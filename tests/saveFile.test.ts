/**
 * Хранилище сохранения, тесные места: свежая копия против записи, предел копий
 * и странные сбои. Основные кейсы хранилища — в `save.test.ts` (он у порога
 * в шестьсот строк, поэтому эти вынесены).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { questSave } from '../src/systems/questSave';
import { save } from '../src/systems/save';
import { CONFIG } from '../src/config';
import { QUEST_NODES } from '../src/data/quest';
import { PROGRESS_KEYS, SAVE_PREFIX as P, SPECS, brokenKey } from '../src/systems/saveKeys';
import {
  clearHeldBack,
  heldBack,
  lastWriteOk,
  openStore,
  peekKey,
  readKey,
  writeKey,
} from '../src/systems/saveStore';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installMemoryStorage();
  clearHeldBack();
});

function sticker(id: string): string {
  const found = QUEST_NODES.find((item) => item.id === id);
  if (found === undefined) throw new Error(`нет узла ${id}`);
  return found.sticker;
}

const SOLVED = P + 'v3:quest-solved';

describe('своя свежая копия и запись (001-53)', () => {
  it('копия влезла, новое нет: копия уходит в память, запись идёт, игра сохраняет дальше', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `"q${i + 1}"`).join(',');
    const raw = `[${ids},5]`;
    storage.setItem(SOLVED, raw);
    storage.setItem('другая-игра', 'x'.repeat(1000));
    storage.quota = storage.used() + brokenKey(SOLVED).length + raw.length + 2;

    questSave.markSolved('q31', sticker('q31'));

    expect(questSave.solvedNodes()).toContain('q31');
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(heldBack()).toEqual({ [SOLVED]: raw });
    // Дальше не упирается в ту же копию: следующий узел тоже ложится.
    questSave.markSolved('q32', sticker('q32'));
    expect(questSave.solvedNodes()).toContain('q32');
    expect(lastWriteOk()).toBe(true);
  });

  it('чужая, более ранняя копия в слоте не трогается, даже когда запись не легла', () => {
    storage.setItem(brokenKey(SOLVED), 'ранняя поломка');
    storage.setItem(SOLVED, '["q1",5]');
    readKey(SPECS.solved);
    storage.quota = storage.used();

    writeKey(SPECS.solved, ['q1', 'q2', 'q3', 'q4']);

    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(brokenKey(SOLVED))).toBe('ранняя поломка');
    expect(storage.getItem(SOLVED)).toBe('["q1",5]');
  });

  it('нет места и без копии: ничего лишнего не стирается, исходника в слоте нет', () => {
    storage.setItem(SOLVED, '["q1",5]');
    storage.setItem(P + 'backup', 'b'.repeat(200));
    storage.quota = storage.used();
    writeKey(SPECS.solved, ['q1', 'q2', 'q3', 'q4']);
    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(P + 'backup')).toBe('b'.repeat(200));
    // Копия не влезла бы и сама, а записи нечем было освободить место: всё как было.
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(storage.getItem(SOLVED)).toBe('["q1",5]');
    expect(heldBack()).toEqual({ [SOLVED]: '["q1",5]' });
  });

  it('копия влезла, повтор тоже не лёг: в ключе исходник, слот пуст, исходник в памяти', () => {
    const raw = '["q1",5]';
    storage.setItem(SOLVED, raw);
    readKey(SPECS.solved);
    expect(storage.getItem(brokenKey(SOLVED))).toBe(raw);
    storage.quota = storage.used();
    const many = Array.from({ length: 40 }, (_, i) => `q${i + 1}`);
    let attempts = 0;
    const real = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string): void => {
      attempts += 1;
      real(key, value);
    };

    writeKey(SPECS.solved, many);

    // Две попытки (до и после журнала) и ещё две после освобождения копии: не больше.
    expect(attempts).toBe(4);
    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(SOLVED)).toBe(raw);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(heldBack()).toEqual({ [SOLVED]: raw });
  });

  it('и дальше, пока не легло, чтение и запись не трогают хранилище впустую', () => {
    const raw = '["q1",5]';
    storage.setItem(SOLVED, raw);
    readKey(SPECS.solved);
    storage.quota = storage.used();
    const many = Array.from({ length: 40 }, (_, i) => `q${i + 1}`);
    writeKey(SPECS.solved, many);
    const { sets, removes } = storage;

    for (let i = 0; i < 3; i += 1) {
      expect(readKey(SPECS.solved)).toEqual(['q1']);
      writeKey(SPECS.solved, many);
    }

    // Без памяти о том, что исходник уже отложен, копия ложилась бы заново на каждом
    // чтении, а запись снова убирала бы её.
    expect(storage.sets).toBe(sets);
    expect(storage.removes).toBe(removes);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(heldBack()).toEqual({ [SOLVED]: raw });
  });
});

describe('копия другого ключа тоже не мешает записи (001-54)', () => {
  const LEVELS = P + 'v2:levels';
  const STICKERS = P + 'v3:quest-stickers';

  it('битый levels и его копия, места впритык: узел решается, исходник levels уходит в память', () => {
    const raw = '{"1":["t0",5]}';
    storage.setItem(LEVELS, raw);
    storage.setItem(SOLVED, '["q1","q2"]');
    storage.setItem(STICKERS, '["sticker-flag-boot"]');
    readKey(SPECS.levels);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(raw);
    storage.quota = storage.used();

    questSave.markSolved('q3', sticker('q3'));

    expect(questSave.solvedNodes()).toEqual(['q1', 'q2', 'q3']);
    expect(questSave.stickers()).toEqual(['sticker-flag-boot', sticker('q3')]);
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(LEVELS)).toBe(raw);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()).toEqual({ [LEVELS]: raw });
  });

  it('битые наклейки и их копия, места впритык: узел решён и наклейка на месте', () => {
    const raw = '["sticker-flag-boot",5]';
    storage.setItem(STICKERS, raw);
    storage.setItem(SOLVED, '["q1"]');
    readKey(SPECS.stickers);
    expect(storage.getItem(brokenKey(STICKERS))).toBe(raw);
    storage.quota = storage.used();

    questSave.markSolved('q2', sticker('q2'));

    expect(questSave.isSolved('q2')).toBe(true);
    expect(questSave.stickers()).toEqual(['sticker-flag-boot', sticker('q2')]);
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(STICKERS))).toBeNull();
    expect(heldBack()).toEqual({ [STICKERS]: raw });
  });

  it('чужая, более ранняя копия другого ключа остаётся, когда места не хватает', () => {
    storage.setItem(brokenKey(LEVELS), 'ранняя поломка');
    storage.setItem(LEVELS, '{"1":["t0",5]}');
    readKey(SPECS.levels);
    storage.setItem(SOLVED, '["q1"]');
    storage.quota = storage.used();

    writeKey(SPECS.solved, ['q1', 'q2', 'q3', 'q4']);

    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(brokenKey(LEVELS))).toBe('ранняя поломка');
    expect(heldBack()).toEqual({ [LEVELS]: '{"1":["t0",5]}' });
  });
});

describe('копии освобождаются по одной и возвращаются в слот (001-56)', () => {
  const LEVELS = P + 'v2:levels';

  it('хватает освободить одну копию: слот чужого ключа остаётся на месте', () => {
    const levelsRaw = '{"1":["t0",5]}';
    const ids = Array.from({ length: 30 }, (_, i) => `"q${i + 1}"`).join(',');
    const solvedRaw = `[${ids},5]`;
    storage.setItem(LEVELS, levelsRaw);
    storage.setItem(SOLVED, solvedRaw);
    readKey(SPECS.levels);
    readKey(SPECS.solved);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(levelsRaw);
    expect(storage.getItem(brokenKey(SOLVED))).toBe(solvedRaw);
    storage.quota = storage.used();

    questSave.markSolved('q31', sticker('q31'));

    expect(questSave.isSolved('q31')).toBe(true);
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(storage.getItem(brokenKey(LEVELS))).toBe(levelsRaw);
    expect(heldBack()).toEqual({ [SOLVED]: solvedRaw });
  });

  it('обрезанные леса вернулись в слот, когда место появилось, и не пропали при записи', () => {
    const forests = Array.from({ length: 20 }, (_, i) => `"${i + 1}":["t0","t1"]`).join(',');
    const levelsRaw = `{${forests}`.slice(0, -2);
    storage.setItem(LEVELS, levelsRaw);
    storage.setItem(SOLVED, '["q1",5]');
    readKey(SPECS.levels);
    readKey(SPECS.solved);
    storage.quota = storage.used();

    questSave.markSolved('q2', sticker('q2'));

    // На полном хранилище узел важнее копии: слот леса ушёл в память.
    expect(questSave.isSolved('q2')).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(levelsRaw);

    // Место появилось. Удачная запись леса возвращает исходник в слот.
    storage.quota = Infinity;
    save.saveLevelFound(1, ['t0']);

    expect(storage.getItem(brokenKey(LEVELS))).toBe(levelsRaw);
    expect(heldBack()[LEVELS]).toBeUndefined();
    expect(lastWriteOk()).toBe(true);
  });

  it('место появилось, потому что стёрли лишнее: исходник ложится в слот после удачной записи', () => {
    const raw = '["q1",5]';
    storage.setItem(SOLVED, raw);
    storage.setItem('другая-игра', 'x'.repeat(2000));
    readKey(SPECS.solved);
    storage.quota = storage.used();
    const many = Array.from({ length: 40 }, (_, i) => `q${i + 1}`);
    writeKey(SPECS.solved, many);
    expect(lastWriteOk()).toBe(false);
    expect(heldBack()).toEqual({ [SOLVED]: raw });
    const { sets, removes } = storage;
    // Хранилище не изменилось: возвращать нечем, записи ничего не крутят.
    writeKey(SPECS.solved, many);
    expect(storage.sets).toBe(sets);
    expect(storage.removes).toBe(removes);

    storage.removeItem('другая-игра');
    writeKey(SPECS.solved, many);

    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(SOLVED))).toBe(raw);
    expect(heldBack()).toEqual({});
  });

  it('сбой не по месту после первой освобождённой копии: остальные копии не трогаются', () => {
    const levelsRaw = '{"1":["t0",5]}';
    const solvedRaw = '["q1",5]';
    storage.setItem(LEVELS, levelsRaw);
    storage.setItem(SOLVED, solvedRaw);
    readKey(SPECS.levels);
    readKey(SPECS.solved);
    storage.quota = storage.used();
    // Записи: 1 — не легла, 2 — не легла и после уборки журнала, 3 — после своей копии: сбой.
    storage.failOnWrite(3);

    writeKey(SPECS.solved, Array.from({ length: 40 }, (_, i) => `q${i + 1}`));

    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    // Дело не в месте: чужую копию освобождать не за чем, она остаётся в слоте.
    expect(storage.getItem(brokenKey(LEVELS))).toBe(levelsRaw);
    expect(heldBack()).toEqual({ [SOLVED]: solvedRaw });
  });
});

describe('копия из памяти возвращается в слот после удачной записи (001-57)', () => {
  const LEVELS = P + 'v2:levels';
  const STICKERS = P + 'v3:quest-stickers';
  const forests = Array.from({ length: 20 }, (_, i) => `"${i + 1}":["t0","t1","t2","t3","t4","t5"]`);
  /** Двадцать лесов и обрезанный хвост: понятно только то, что до него. */
  const CUT = `{${forests.join(',')},"21":[`;
  const need = brokenKey(LEVELS).length + CUT.length;

  /** Где-то в хранилище лежат все двадцать лесов (в слоте, в ключе или в отчёте). */
  function twentyForestsSurvive(): boolean {
    const held = Object.values(heldBack());
    return [...storage.items.values(), ...held].some((value) => value.includes('"20":'));
  }

  it('запись квеста не легла даже без копии леса; находка клада кладёт копию обратно в слот', () => {
    storage.setItem(LEVELS, CUT);
    storage.setItem(SOLVED, '["q1"]');
    readKey(SPECS.levels);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(CUT);
    storage.quota = storage.used() + 20;

    // Двести узлов не влезут ни с копией, ни без неё: копия леса уходит в память зря.
    writeKey(SPECS.solved, Array.from({ length: 200 }, (_, i) => `q${i + 1}`));
    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);

    save.saveLevelFound(1, ['t0']);

    // Место освободила не удавшаяся запись, а копия, — она и возвращается, как только лес записан.
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(CUT);
    expect(heldBack()[LEVELS]).toBeUndefined();
    expect(twentyForestsSurvive()).toBe(true);
  });

  it('места под копию до записи нет, его даёт сама перезапись: после записи исходник в слоте', () => {
    storage.setItem(LEVELS, CUT);
    storage.setItem(SOLVED, '["q1"]');
    storage.setItem(STICKERS, JSON.stringify([sticker('q1')]));
    readKey(SPECS.levels);
    storage.quota = storage.used();

    questSave.markSolved('q2', sticker('q2'));
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
    // До перезаписи леса копия не поместилась бы: свободного места меньше самой копии.
    expect(storage.quota - storage.used()).toBeLessThan(need);

    save.saveLevelFound(1, ['t0']);

    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(CUT);
    expect(heldBack()[LEVELS]).toBeUndefined();
    expect(twentyForestsSurvive()).toBe(true);
  });

  it('копию освободила чужая запись, места для неё хватает: чтения и записи квеста не крутят хранилище', () => {
    storage.setItem(LEVELS, CUT);
    storage.setItem(SOLVED, '["q1"]');
    storage.setItem('другая-игра', 'x'.repeat(2 * need));
    readKey(SPECS.levels);
    storage.quota = storage.used();
    writeKey(SPECS.solved, ['q1', 'q2']);
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
    // Другая вкладка убрала своё: свободного места ровно на копию и один лишний знак.
    const other = storage.getItem('другая-игра') ?? '';
    const spare = storage.quota - storage.used();
    storage.setItem('другая-игра', other.slice(need + 1 - spare));
    expect(storage.quota - storage.used()).toBe(need + 1);
    const { sets, removes } = storage;

    const laps = 4;
    for (let i = 0; i < laps; i += 1) {
      readKey(SPECS.levels);
      writeKey(SPECS.solved, ['q1', 'q2', ...Array.from({ length: i + 1 }, (_, j) => `q${j + 3}`)]);
    }

    // Чтение ключа, чья копия в памяти, слот не трогает: иначе копия ложилась бы при
    // чтении, а следующая запись квеста снова убирала бы её. Растут только сами записи.
    expect(storage.sets - sets).toBe(laps);
    expect(storage.removes).toBe(removes);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
  });

  it('та же копия уже лежит в слоте (положила другая вкладка): из отчёта исходник уходит', () => {
    const raw = '["q1",5]';
    storage.setItem(SOLVED, raw);
    storage.quota = storage.used();
    readKey(SPECS.solved);
    expect(heldBack()).toEqual({ [SOLVED]: raw });
    storage.quota += 200;
    storage.setItem(brokenKey(SOLVED), raw);

    writeKey(SPECS.solved, ['q1', 'q2']);

    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(SOLVED))).toBe(raw);
    expect(heldBack()).toEqual({});
  });

  it('предел копий действует и на возврате: ключ в памяти из-за предела, его запись не кладёт копию', () => {
    const other = brokenKey(P + 'v2:completed');
    const room = CONFIG.save.brokenMaxBytes - other.length - need + 1;
    storage.setItem(other, 'x'.repeat(room));
    storage.setItem(LEVELS, CUT);
    readKey(SPECS.levels);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);

    save.saveLevelFound(1, ['t0']);

    // Запись прошла, места в хранилище вдоволь, но предел 256 КБ на копии не обойти.
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
  });

  it('запись леса легла, только освободив чужую копию: после неё лес всё равно возвращается в слот', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `"q${i + 1}"`).join(',');
    const solvedRaw = `[${ids},5]`;
    storage.setItem(LEVELS, CUT);
    storage.setItem(SOLVED, solvedRaw);
    readKey(SPECS.solved);
    storage.quota = storage.used();
    readKey(SPECS.levels);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()).toEqual({ [LEVELS]: CUT });
    const grown: Record<string, string[]> = {};
    for (let i = 1; i <= 21; i += 1) grown[String(i)] = ['t0', 't1', 't2', 't3', 't4', 't5'];

    writeKey(SPECS.levels, grown);

    // Первая попытка записи упёрлась в место, ляжет она лишь после копии квеста.
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBe(CUT);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(storage.getItem(SOLVED)).toBe(solvedRaw);
    expect(heldBack()).toEqual({ [SOLVED]: solvedRaw });
  });

  it('возврат не влез при первой записи: следующая запись леса не кладёт в слот понятную строку', () => {
    storage.setItem(LEVELS, CUT);
    storage.setItem(SOLVED, '["q1"]');
    storage.setItem('другая-игра', 'x'.repeat(2 * need));
    storage.quota = storage.used();
    readKey(SPECS.levels);
    expect(heldBack()[LEVELS]).toBe(CUT);

    save.saveLevelFound(1, ['t0']);

    // Запись короче исходника легла, но свободного места меньше копии: возврат не удался.
    expect(lastWriteOk()).toBe(true);
    expect(storage.quota - storage.used()).toBeLessThan(need);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
    storage.removeItem('другая-игра');

    save.saveLevelFound(2, ['t0']);

    // В ключе уже понятная строка: её в слот не кладут, а исходник дожидается в памяти.
    expect(lastWriteOk()).toBe(true);
    expect(storage.getItem(brokenKey(LEVELS))).toBeNull();
    expect(heldBack()[LEVELS]).toBe(CUT);
  });
});

describe('освобождение работает на каждом из девяти ключей (001-54)', () => {
  const BAD = '{"broken":1234567890';

  for (const spec of PROGRESS_KEYS) {
    it(`${spec.key.slice(P.length)}: копия совпавшего ключа уходит в память, запись другого ключа ложится`, () => {
      storage.setItem(spec.key, BAD);
      readKey(spec);
      expect(storage.getItem(brokenKey(spec.key))).toBe(BAD);
      storage.quota = storage.used();

      if (spec.key === SPECS.solved.key) writeKey(SPECS.completed, [1]);
      else writeKey(SPECS.solved, ['q1']);

      expect(lastWriteOk()).toBe(true);
      expect(storage.getItem(brokenKey(spec.key))).toBeNull();
      expect(storage.getItem(spec.key)).toBe(BAD);
      expect(heldBack()).toEqual({ [spec.key]: BAD });
    });
  }
});

describe('предел копий битого', () => {
  /** Заполнить слот соседа так, чтобы вместе с копией `raw` вышло ровно `extra` знаков сверх предела. */
  function fillTo(raw: string, extra: number): void {
    const other = brokenKey(P + 'v2:completed');
    const room =
      CONFIG.save.brokenMaxBytes - other.length - brokenKey(SOLVED).length - raw.length + extra;
    storage.setItem(other, 'x'.repeat(room));
    storage.setItem(SOLVED, raw);
  }

  it('ровно впритык к пределу копия ложится', () => {
    const raw = '["q1",5]';
    fillTo(raw, 0);
    readKey(SPECS.solved);
    expect(storage.getItem(brokenKey(SOLVED))).toBe(raw);
    expect(heldBack()).toEqual({});
  });

  it('на один знак больше предела копия остаётся в памяти', () => {
    const raw = '["q1",5]';
    fillTo(raw, 1);
    readKey(SPECS.solved);
    expect(storage.getItem(brokenKey(SOLVED))).toBeNull();
    expect(heldBack()).toEqual({ [SOLVED]: raw });
  });
});

describe('странные сбои', () => {
  it('хранилище, бросающее null или undefined, запись не роняет', () => {
    for (const thrown of [null, undefined]) {
      const odd = {
        length: 0,
        key: () => null,
        getItem: () => null,
        setItem: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw thrown;
        },
        removeItem: () => undefined,
      };
      (globalThis as { localStorage?: unknown }).localStorage = odd;
      expect(() => writeKey(SPECS.current, 3)).not.toThrow();
      expect(lastWriteOk()).toBe(false);
    }
  });
});

describe('чтение без копии (peekKey)', () => {
  const V1 = P + 'v1:collection';

  it('битый музей первой версии читается, но в broken: не уходит', () => {
    storage.setItem(V1, '["acorn",5]');

    expect(peekKey(SPECS.collectionV1)).toEqual(['acorn']);

    expect(storage.getItem(brokenKey(V1))).toBeNull();
    expect(heldBack()).toEqual({});
  });

  it('перенос музея первой версии тоже ничего не откладывает', () => {
    storage.setItem(V1, '["acorn",5]');

    openStore();
    expect(save.loadCollection()).toEqual(['acorn']);

    expect(storage.getItem(brokenKey(V1))).toBeNull();
    expect(heldBack()).toEqual({});
  });
});

describe('что считается переполнением', () => {
  /** Первая запись бросает ошибку с этими признаками, вторая ложится; число попыток. */
  function throwOnce(props: { name?: string; code?: number }): number {
    storage.setItem(P + 'journal', 'старый журнал');
    let calls = 0;
    const real = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string): void => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('нет места'), props);
      real(key, value);
    };
    writeKey(SPECS.current, 3);
    return calls;
  }

  const cases: [string, { name?: string; code?: number }][] = [
    ['QuotaExceededError', { name: 'QuotaExceededError' }],
    ['NS_ERROR_DOM_QUOTA_REACHED (Firefox)', { name: 'NS_ERROR_DOM_QUOTA_REACHED' }],
    ['код 22 при другом имени', { name: 'Error', code: 22 }],
    ['код 1014 при другом имени', { name: 'Error', code: 1014 }],
  ];
  for (const [title, props] of cases) {
    it(`${title}: журнал убирается, запись повторяется и ложится`, () => {
      expect(throwOnce(props)).toBe(2);
      expect(lastWriteOk()).toBe(true);
      expect(storage.getItem(SPECS.current.key)).toBe('3');
      expect(storage.getItem(P + 'journal')).toBeNull();
    });
  }

  it('любая другая ошибка повтора не просит и журнал не трогает', () => {
    expect(throwOnce({ name: 'SecurityError', code: 18 })).toBe(1);
    expect(lastWriteOk()).toBe(false);
    expect(storage.getItem(P + 'journal')).toBe('старый журнал');
  });
});

describe('ноль у текущего леса', () => {
  it('«0» — потеря: исходник откладывается, игра идёт с первым лесом', () => {
    storage.setItem(SPECS.current.key, '0');

    expect(readKey(SPECS.current)).toBe(1);

    expect(storage.getItem(brokenKey(SPECS.current.key))).toBe('0');
  });
});
