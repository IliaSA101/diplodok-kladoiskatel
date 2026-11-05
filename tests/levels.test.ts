/**
 * Уровни: данные, на которых стоит весь лес.
 *
 * Ошибка здесь не падает и не видна в типах — ребёнок просто приходит
 * в лес, где клад лежит за краем мира или не лежит вовсе.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_COUNT, getLevel, totalTreasures } from '../src/data/levels';

describe('леса', () => {
  it('их столько, сколько обещает LEVEL_COUNT', () => {
    expect(LEVELS).toHaveLength(LEVEL_COUNT);
  });

  it('пронумерованы подряд с первого', () => {
    expect(LEVELS.map((level) => level.number)).toEqual(
      Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1),
    );
  });

  it('в каждом есть что искать', () => {
    for (const level of LEVELS) {
      expect(totalTreasures(level), `лес ${level.number}`).toBeGreaterThan(0);
    }
  });

  it('мир не меньше экрана и не бесконечный', () => {
    for (const level of LEVELS) {
      expect(level.screensX, `лес ${level.number}`).toBeGreaterThanOrEqual(1);
      expect(level.screensY, `лес ${level.number}`).toBeGreaterThanOrEqual(1);
      expect(level.screensX * level.screensY, `лес ${level.number}`).toBeLessThanOrEqual(30);
    }
  });

  it('копать нужно хотя бы раз, но не до бесконечности', () => {
    for (const level of LEVELS) {
      expect(level.digTaps, `лес ${level.number}`).toBeGreaterThanOrEqual(1);
      expect(level.digTaps, `лес ${level.number}`).toBeLessThanOrEqual(6);
    }
  });

  it('у каждого леса свой seed: иначе два леса окажутся одинаковыми', () => {
    const seeds = new Set(LEVELS.map((level) => level.seed));
    expect(seeds.size).toBe(LEVELS.length);
  });

  it('после последнего леса игра продолжается, а не ломается', () => {
    const beyond = getLevel(LEVEL_COUNT + 5);
    expect(beyond.number).toBe(LEVEL_COUNT + 5);
    expect(totalTreasures(beyond)).toBeGreaterThan(0);
  });

  it('номер меньше первого не роняет игру', () => {
    expect(getLevel(0).number).toBeGreaterThanOrEqual(1);
    expect(getLevel(-3).number).toBeGreaterThanOrEqual(1);
  });
});
