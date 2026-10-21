/**
 * Уровни — это восемь постоянных лесов с нарастающей сложностью.
 * Лес с одним и тем же номером всегда одинаковый: ребёнок запоминает места.
 * После восьмого начинаются бесконечные случайные леса.
 *
 * Всё, что отличает один лес от другого, собрано здесь — это главное место,
 * куда лезть, если игра кажется слишком лёгкой или слишком трудной.
 */

export type ThemeId = 'summer' | 'autumn' | 'pine' | 'night';

/** Сколько кладов каждого вида спрятано в лесу (плюс всегда один секретный). */
export interface TreasureMix {
  /** В земле — копать. */
  ground: number;
  /** В кроне дерева — тянуть шею. */
  tree: number;
  /** Под камнем — толкнуть камень. */
  rock: number;
  /** В ручье — опустить голову в воду. */
  water: number;
}

export interface LevelSpec {
  /** Номер леса, он же то, что показано цифрой на экране выбора. */
  number: number;
  seed: number;
  theme: ThemeId;
  /** Размер мира в экранах. */
  screensX: number;
  screensY: number;
  /** Множитель плотности декора к базовым числам CONFIG.forest. */
  density: number;
  treasures: TreasureMix;
  /** Сколько раз копать клад в земле. */
  digTaps: number;
  /** С какого расстояния начинает светиться звёздочка-подсказка. */
  hintMaxDistance: number;
  /** Белки-подсказчицы: подойдёшь — покажут лапкой на ближайший клад. */
  squirrels: number;
}

export const LEVEL_COUNT = 8;

export const LEVELS: readonly LevelSpec[] = [
  {
    number: 1,
    seed: 20260101,
    theme: 'summer',
    screensX: 4,
    screensY: 3,
    density: 1,
    treasures: { ground: 5, tree: 3, rock: 0, water: 0 },
    digTaps: 3,
    hintMaxDistance: 1000,
    squirrels: 1,
  },
  {
    number: 2,
    seed: 777001,
    theme: 'summer',
    screensX: 4,
    screensY: 3,
    density: 1.05,
    treasures: { ground: 4, tree: 3, rock: 1, water: 0 },
    digTaps: 3,
    hintMaxDistance: 950,
    squirrels: 1,
  },
  {
    number: 3,
    seed: 424242,
    theme: 'autumn',
    screensX: 5,
    screensY: 3,
    density: 1.1,
    treasures: { ground: 4, tree: 3, rock: 1, water: 1 },
    digTaps: 3,
    hintMaxDistance: 900,
    squirrels: 2,
  },
  {
    number: 4,
    seed: 13579,
    theme: 'autumn',
    screensX: 5,
    screensY: 3,
    density: 1.15,
    treasures: { ground: 4, tree: 3, rock: 1, water: 1 },
    digTaps: 4,
    hintMaxDistance: 850,
    squirrels: 2,
  },
  {
    number: 5,
    seed: 98765,
    theme: 'pine',
    screensX: 5,
    screensY: 4,
    density: 1.2,
    treasures: { ground: 4, tree: 4, rock: 1, water: 1 },
    digTaps: 4,
    hintMaxDistance: 780,
    squirrels: 2,
  },
  {
    number: 6,
    seed: 31415926,
    theme: 'pine',
    screensX: 5,
    screensY: 4,
    density: 1.25,
    treasures: { ground: 4, tree: 4, rock: 1, water: 1 },
    digTaps: 4,
    hintMaxDistance: 720,
    squirrels: 3,
  },
  {
    number: 7,
    seed: 60606,
    theme: 'night',
    screensX: 6,
    screensY: 4,
    density: 1.3,
    treasures: { ground: 4, tree: 4, rock: 2, water: 1 },
    digTaps: 5,
    hintMaxDistance: 660,
    squirrels: 3,
  },
  {
    number: 8,
    seed: 20262026,
    theme: 'night',
    screensX: 6,
    screensY: 4,
    density: 1.35,
    treasures: { ground: 4, tree: 5, rock: 2, water: 1 },
    digTaps: 5,
    hintMaxDistance: 600,
    squirrels: 3,
  },
];

const ENDLESS_THEMES: readonly ThemeId[] = ['summer', 'autumn', 'pine', 'night'];

/**
 * Описание леса по номеру. Номера больше восьми — бесконечный режим:
 * сложность как у последнего леса, тема по кругу, seed от номера.
 */
export function getLevel(number: number): LevelSpec {
  const index = Math.max(1, Math.floor(number)) - 1;
  const known = LEVELS[index];
  if (known !== undefined) return known;

  const last = LEVELS[LEVEL_COUNT - 1] as LevelSpec;
  const theme = ENDLESS_THEMES[index % ENDLESS_THEMES.length] as ThemeId;
  return {
    ...last,
    number: index + 1,
    seed: 1000003 * (index + 1) + 7919,
    theme,
  };
}

/** Сколько всего кладов в лесу, включая секретный. */
export function totalTreasures(level: LevelSpec): number {
  const { ground, tree, rock, water } = level.treasures;
  return ground + tree + rock + water + 1;
}
