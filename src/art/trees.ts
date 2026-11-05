/**
 * Деревья: размеры, силуэты крон и метаданные.
 *
 * Модуль намеренно без Phaser: по этим числам генератор леса решает, куда
 * диплодок тянет шею и где стоит ствол, а рисование живёт в forest.ts.
 * Пока данные лежали рядом с рисованием, их нельзя было проверить тестом.
 */
import { TEX } from './keys';
import { SET_CROWN, TEXTURE_SETS, themeTexture } from './themes';
import type { TextureSetId } from './themes';

/** Круг листвы: x, y, радиус. */
export type Blob = readonly [number, number, number];
/** Ярус ёлки: Y основания яруса, половина ширины основания, высота яруса. */
export type Tier = readonly [number, number, number];

/** Метаданные деревьев: нужны, чтобы диплодок тянул шею точно к кроне. */
export interface TreeMeta {
  width: number;
  height: number;
  /** Высота центра кроны над основанием ствола (в пикселях, вверх). */
  crownOffsetY: number;
  /** Радиус ствола у земли — для круглого коллайдера. */
  trunkRadius: number;
}

/** Круглое лиственное дерево. */
export interface RoundTreeSpec {
  kind: 'round';
  /** Базовый ключ текстуры (без суффикса набора). */
  baseKey: string;
  w: number;
  h: number;
  /** Ширина ствола у земли. */
  trunkW: number;
  /** Y центра кроны от верха картинки. */
  crownCY: number;
  blobs: readonly Blob[];
}

/** Ёлка: тонкий короткий ствол и несколько треугольных ярусов. */
export interface ConeTreeSpec {
  kind: 'cone';
  baseKey: string;
  w: number;
  h: number;
  trunkW: number;
  /** Ярусы сверху вниз; нижний — самый широкий. */
  tiers: readonly Tier[];
}

export type TreeSpec = RoundTreeSpec | ConeTreeSpec;

/** Три круглых дерева: у каждого свой силуэт кроны. Низ картинки = основание ствола. */
export const ROUND_SPECS: readonly TreeSpec[] = [
  {
    kind: 'round', baseKey: TEX.TREE[0], w: 230, h: 330, trunkW: 38, crownCY: 125,
    blobs: [[115, 112, 80], [65, 142, 60], [165, 142, 60], [90, 76, 55], [145, 76, 55]],
  },
  {
    kind: 'round', baseKey: TEX.TREE[1], w: 265, h: 385, trunkW: 46, crownCY: 140,
    blobs: [[132, 135, 92], [75, 172, 68], [190, 172, 68], [100, 86, 62], [165, 86, 62], [132, 72, 50]],
  },
  {
    kind: 'round', baseKey: TEX.TREE[2], w: 205, h: 295, trunkW: 34, crownCY: 105,
    blobs: [[102, 100, 70], [58, 130, 52], [147, 130, 52], [102, 62, 46]],
  },
];

/** Три ёлки: 4, 4 и 3 яруса. Ярусы идут сверху вниз: [Y основания, полуширина, высота]. */
export const CONE_SPECS: readonly TreeSpec[] = [
  {
    kind: 'cone', baseKey: TEX.TREE[0], w: 200, h: 340, trunkW: 22,
    tiers: [[120, 38, 80], [174, 56, 84], [232, 74, 90], [292, 92, 96]],
  },
  {
    kind: 'cone', baseKey: TEX.TREE[1], w: 225, h: 385, trunkW: 26,
    tiers: [[152, 42, 90], [212, 64, 94], [276, 84, 100], [342, 104, 108]],
  },
  {
    kind: 'cone', baseKey: TEX.TREE[2], w: 175, h: 295, trunkW: 20,
    tiers: [[124, 38, 84], [184, 58, 92], [252, 78, 100]],
  },
];

export function specsFor(set: TextureSetId): readonly TreeSpec[] {
  return SET_CROWN[set] === 'cone' ? CONE_SPECS : ROUND_SPECS;
}

/** Центр хвойной массы: центры тяжести треугольников, взвешенные по площади. */
function coneCrownCY(tiers: readonly Tier[]): number {
  let sum = 0;
  let area = 0;
  for (const [baseY, hw, th] of tiers) {
    const a = hw * th;
    sum += a * (baseY - th / 3);
    area += a;
  }
  return Math.round(sum / area);
}

function metaOf(spec: TreeSpec): TreeMeta {
  if (spec.kind === 'cone') {
    return {
      width: spec.w,
      height: spec.h,
      crownOffsetY: spec.h - coneCrownCY(spec.tiers),
      trunkRadius: Math.round(spec.trunkW * 0.5),
    };
  }
  return {
    width: spec.w,
    height: spec.h,
    crownOffsetY: spec.h - spec.crownCY,
    trunkRadius: Math.round(spec.trunkW * 0.55),
  };
}

/** Заполняется по спецификациям: ПОЛНОЕ имя текстуры ('tree-a@pine') -> метаданные. */
export const TREE_META: Record<string, TreeMeta> = {};
for (const set of TEXTURE_SETS) {
  for (const spec of specsFor(set)) {
    TREE_META[themeTexture(spec.baseKey, set)] = metaOf(spec);
  }
}

