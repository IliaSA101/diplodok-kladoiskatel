/**
 * Темы лесов: лето, осень, хвойный, ночь.
 *
 * Ночь — это хвойные текстуры плюс синее затемнение поверх мира и светлячки,
 * поэтому наборов текстур всего три, а не четыре.
 */
import type { ThemeId } from '../data/levels';
import { PALETTE } from './palette';

/** Набор запечённых текстур леса. */
export type TextureSetId = 'summer' | 'autumn' | 'pine';

export interface ThemeColors {
  groundBase: number;
  groundLight: number;
  groundDark: number;
  groundShadow: number;
  trunk: number;
  trunkDark: number;
  trunkLight: number;
  leafLight: number;
  leafMid: number;
  leafDark: number;
  flowers: readonly number[];
  water: number;
  waterDark: number;
  waterLight: number;
}

export interface Theme {
  id: ThemeId;
  /** Какие текстуры рисовать (ночь берёт хвойные). */
  textureSet: TextureSetId;
  colors: ThemeColors;
  /** Форма кроны: круглая лиственная или треугольная ёлка. */
  crown: 'round' | 'cone';
  /** Затемнение поверх мира; null — день. */
  ambient: { color: number; alpha: number } | null;
  /** Кто летает над лесом. */
  critters: 'butterflies' | 'fireflies';
  /** Падают ли листья (осень). */
  fallingLeaves: boolean;
}

const SUMMER_COLORS: ThemeColors = {
  groundBase: PALETTE.grassMid,
  groundLight: PALETTE.grassLight,
  groundDark: PALETTE.grassDark,
  groundShadow: PALETTE.grassShadow,
  trunk: PALETTE.trunk,
  trunkDark: PALETTE.trunkDark,
  trunkLight: PALETTE.trunkLight,
  leafLight: PALETTE.leafLight,
  leafMid: PALETTE.leafMid,
  leafDark: PALETTE.leafDark,
  flowers: [PALETTE.flowerPink, PALETTE.flowerYellow, PALETTE.flowerBlue],
  water: PALETTE.water,
  waterDark: PALETTE.waterDark,
  waterLight: PALETTE.waterLight,
};

const AUTUMN_COLORS: ThemeColors = {
  groundBase: 0x9ec46a,
  groundLight: 0xc3d97a,
  groundDark: 0x7fa855,
  groundShadow: 0x6b8f48,
  trunk: 0x8a5a3a,
  trunkDark: 0x6a4228,
  trunkLight: 0xa87a52,
  leafLight: 0xffc24d,
  leafMid: 0xf2913a,
  leafDark: 0xd2662c,
  flowers: [0xffd84d, 0xff9a5c, 0xffc6a8],
  water: PALETTE.water,
  waterDark: PALETTE.waterDark,
  waterLight: PALETTE.waterLight,
};

const PINE_COLORS: ThemeColors = {
  groundBase: 0x5aa86a,
  groundLight: 0x76c080,
  groundDark: 0x468c58,
  groundShadow: 0x3a7a4c,
  trunk: 0x7a4e35,
  trunkDark: 0x5d3a26,
  trunkLight: 0x946349,
  leafLight: 0x4fae74,
  leafMid: 0x2f8f5c,
  leafDark: 0x1f6e47,
  flowers: [0xfff6e8, 0xd09fff, 0x8fc6ff],
  water: 0x6fd0e8,
  waterDark: 0x3fa8ce,
  waterLight: 0xbfeef8,
};

export const THEMES: Record<ThemeId, Theme> = {
  summer: {
    id: 'summer',
    textureSet: 'summer',
    colors: SUMMER_COLORS,
    crown: 'round',
    ambient: null,
    critters: 'butterflies',
    fallingLeaves: false,
  },
  autumn: {
    id: 'autumn',
    textureSet: 'autumn',
    colors: AUTUMN_COLORS,
    crown: 'round',
    ambient: null,
    critters: 'butterflies',
    fallingLeaves: true,
  },
  pine: {
    id: 'pine',
    textureSet: 'pine',
    colors: PINE_COLORS,
    crown: 'cone',
    ambient: null,
    critters: 'butterflies',
    fallingLeaves: false,
  },
  night: {
    id: 'night',
    textureSet: 'pine',
    colors: PINE_COLORS,
    crown: 'cone',
    // Мягкая синяя ночь: лес читается, но настроение совсем другое.
    ambient: { color: 0x2a3c7a, alpha: 0.42 },
    critters: 'fireflies',
    fallingLeaves: false,
  },
};

export const TEXTURE_SETS: readonly TextureSetId[] = ['summer', 'autumn', 'pine'];

/** Цвета набора текстур — то, чем рисуется декор леса. */
export const SET_COLORS: Record<TextureSetId, ThemeColors> = {
  summer: SUMMER_COLORS,
  autumn: AUTUMN_COLORS,
  pine: PINE_COLORS,
};

/** Форма кроны в наборе: хвойный лес — ёлки. */
export const SET_CROWN: Record<TextureSetId, 'round' | 'cone'> = {
  summer: 'round',
  autumn: 'round',
  pine: 'cone',
};

/** Имя текстуры декора в конкретном наборе: 'tree-a' + 'autumn' → 'tree-a@autumn'. */
export function themeTexture(baseKey: string, set: TextureSetId): string {
  return baseKey + '@' + set;
}
