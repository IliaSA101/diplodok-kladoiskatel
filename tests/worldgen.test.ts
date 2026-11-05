/**
 * Генерация леса.
 *
 * Лес детерминирован: один seed — один и тот же лес, иначе после
 * перезагрузки страницы найденные клады окажутся не на своих местах.
 * Отдельно стережём клад на дереве с кроной выше неба — на такой
 * диплодок не дотянется, и лес становится непроходимым.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, getLevel, totalTreasures } from '../src/data/levels';
import { generateWorld } from '../src/systems/worldGen';
import { makeRng } from '../src/systems/rng';

describe('случайные числа', () => {
  it('один seed — одна и та же последовательность', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const left = Array.from({ length: 20 }, () => a.next());
    const right = Array.from({ length: 20 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('разные seed дают разные последовательности', () => {
    const first = makeRng(1);
    const second = makeRng(2);
    const a = Array.from({ length: 20 }, () => first.next());
    const b = Array.from({ length: 20 }, () => second.next());
    expect(a).not.toEqual(b);
  });

  it('range не выходит за заданные границы', () => {
    const rng = makeRng(2024);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.range(100, 140);
      expect(value).toBeGreaterThanOrEqual(100);
      expect(value).toBeLessThan(140);
    }
  });

  it('int попадает в границы включительно и добирается до краёв', () => {
    const rng = makeRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      const value = rng.int(3, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6]));
  });

  it('shuffle действительно перемешивает и ничего не теряет', () => {
    const source = Array.from({ length: 12 }, (_, i) => i);
    const mixed = makeRng(5).shuffle(source);
    expect([...mixed].sort((a, b) => a - b)).toEqual(source);
    expect(mixed).not.toEqual(source);
    expect(source[0]).toBe(0); // исходный массив не тронут
  });

  it('числа лежат в [0, 1)', () => {
    const rng = makeRng(777);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('лес по seed', () => {
  it('генерируется одинаково при каждом заходе', () => {
    const level = getLevel(1);
    expect(JSON.stringify(generateWorld(level))).toBe(JSON.stringify(generateWorld(level)));
  });

  it('кладов ровно столько, сколько обещано в уровне', () => {
    for (const level of LEVELS) {
      const world = generateWorld(level);
      expect(world.treasures, `лес ${level.number}`).toHaveLength(totalTreasures(level));
    }
  });

  it('у кладов разные id: по ним хранится прогресс', () => {
    for (const level of LEVELS) {
      const world = generateWorld(level);
      const ids = new Set(world.treasures.map((treasure) => treasure.id));
      expect(ids.size, `лес ${level.number}`).toBe(world.treasures.length);
    }
  });

  it('все клады внутри мира, а не за его краем', () => {
    for (const level of LEVELS) {
      const world = generateWorld(level);
      for (const treasure of world.treasures) {
        expect(treasure.x, `лес ${level.number}, клад ${treasure.id}`).toBeGreaterThan(0);
        expect(treasure.x, `лес ${level.number}, клад ${treasure.id}`).toBeLessThan(world.width);
        expect(treasure.y, `лес ${level.number}, клад ${treasure.id}`).toBeGreaterThan(0);
        expect(treasure.y, `лес ${level.number}, клад ${treasure.id}`).toBeLessThan(world.height);
      }
    }
  });

  it('до каждой кроны можно дотянуться: она не над верхним краем мира', () => {
    for (const level of LEVELS) {
      const world = generateWorld(level);
      for (const treasure of world.treasures) {
        expect(treasure.crownY, `лес ${level.number}, клад ${treasure.id}`).toBeGreaterThan(0);
        expect(treasure.crownY, `лес ${level.number}, клад ${treasure.id}`).toBeLessThan(
          world.height,
        );
      }
    }
  });

  it('клад под камнем ссылается на существующий камень', () => {
    for (const level of LEVELS) {
      const world = generateWorld(level);
      for (const treasure of world.treasures) {
        if (treasure.decorIndex < 0) continue;
        expect(world.decor[treasure.decorIndex], `лес ${level.number}`).toBeDefined();
      }
    }
  });

  it('в тесном лесу клады добираются землёй, а не пропадают', () => {
    // Крупных деревьев и ручья на один экран не хватит: часть кладов
    // разместить негде. Обещанное число всё равно должно сойтись —
    // иначе лес нельзя пройти до конца, и секретный клад не появится.
    const cramped = {
      ...getLevel(8),
      screensX: 1,
      screensY: 1,
      treasures: { ground: 1, tree: 5, rock: 3, water: 2 },
    };
    const world = generateWorld(cramped);
    expect(world.treasures).toHaveLength(totalTreasures(cramped));
    expect(new Set(world.treasures.map((t) => t.id)).size).toBe(world.treasures.length);
  });

  it('в лесу есть из чего он состоит', () => {
    for (const level of LEVELS) {
      expect(generateWorld(level).decor.length, `лес ${level.number}`).toBeGreaterThan(10);
    }
  });
});
