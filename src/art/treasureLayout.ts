/**
 * Числа, от которых зависит, различимы ли предметы в альбоме.
 *
 * В «Моих сокровищах» ненайденный предмет — чёрный силуэт: заливка тинтом
 * съедает всё, что нарисовано *внутри* фигуры. У монеты внутри звезда, у
 * окаменелости спираль, и обе они пропадают — на экране оставались два
 * одинаковых серых кружка, по которым ребёнок не скажет, чего ему не хватает.
 * Значит, отличать предметы должен **контур**, а не рисунок внутри.
 *
 * Без Phaser: сюда смотрит и рисовалка (`data/treasures.ts`), и тест.
 */
import { centredGrid } from './layout';

/** Дизайн-квадрат, в котором рисуются все предметы. */
export const TREASURE_DESIGN = 256;

/** Ячейка альбома в самом тесном случае и доля её ширины под предмет. */
export const ALBUM_SLOT_MIN = 120;
export const ALBUM_ITEM_FILL = 0.72;

/** Панель альбома и поля от её краёв: размеры живут здесь, а не в сцене и в тесте. */
export const ALBUM_PANEL = { width: 1200, height: 680, margin: 40 };

/**
 * Правая колонка альбома: «N из M», рюкзак и кнопка «назад» (y от центра панели).
 *
 * Ряда точек здесь нет: предметы на экране и так показывают, что найдено, а
 * точки только повторяли их. Колонка — три вещи сверху вниз, и тест держит,
 * чтобы они не наезжали друг на друга и кнопка не вылезала за панель.
 */
export const ALBUM_SIDE = {
  x: 354,
  counterY: -120,
  /** Высота строки цифры: кегль 72 с запасом на обводку. */
  counterHeight: 96,
  backpackY: 45,
  /** Иконка рюкзака 96 px в масштабе 1.2. */
  backpackSize: 115,
  backY: 220,
  backRadius: 70,
};

/** Что стоит в правой колонке: сцена только раскладывает этот список по экрану. */
export type AlbumSidePart =
  | { kind: 'counter'; x: number; y: number; text: string }
  | { kind: 'backpack'; x: number; y: number }
  | { kind: 'back'; x: number; y: number; radius: number };

/** Правая колонка сверху вниз; «N из M» собирается здесь же, чтобы текст и место были рядом. */
export function albumSide(found: number, total: number): AlbumSidePart[] {
  return [
    { kind: 'counter', x: ALBUM_SIDE.x, y: ALBUM_SIDE.counterY, text: `${found} из ${total}` },
    { kind: 'backpack', x: ALBUM_SIDE.x, y: ALBUM_SIDE.backpackY },
    { kind: 'back', x: ALBUM_SIDE.x, y: ALBUM_SIDE.backY, radius: ALBUM_SIDE.backRadius },
  ];
}

/** Сетка альбома: 4 колонки в области top..bottom (от центра панели), левый край — у поля панели. */
export const ALBUM_COLUMNS = 4;
export const ALBUM_GRID = {
  top: -245,
  bottom: 320,
  gap: 16,
  slotMax: 165,
  left: -ALBUM_PANEL.width / 2 + ALBUM_PANEL.margin,
};

/** Размер ячейки: как можно крупнее, но чтобы все строки влезли в область сетки. */
export function albumSlot(rows: number): number {
  const fit = Math.floor((ALBUM_GRID.bottom - ALBUM_GRID.top - ALBUM_GRID.gap * (rows - 1)) / rows);
  return Math.min(ALBUM_GRID.slotMax, Math.max(ALBUM_SLOT_MIN, fit));
}

export interface AlbumLayout {
  slot: number;
  /** Шаг между центрами соседних ячеек. */
  step: number;
  /** Центры ячеек от центра панели, в порядке предметов. */
  spots: { x: number; y: number }[];
  /** Середина блока сетки по горизонтали. */
  centerX: number;
}

/**
 * Где стоит каждая ячейка альбома.
 *
 * Блок прижат к левому краю панели, по вертикали — середина области. Внутри
 * блока каждый ряд стоит по центру своей длины: на тринадцати предметах
 * последний ряд — одна ячейка, и прижатая влево она оставляла справа дыру в
 * три ячейки. Это же считает «Запомни пары».
 */
export function albumLayout(count: number): AlbumLayout {
  const rows = Math.max(1, Math.ceil(count / ALBUM_COLUMNS));
  const slot = albumSlot(rows);
  const step = slot + ALBUM_GRID.gap;
  const centerX = ALBUM_GRID.left + ((ALBUM_COLUMNS - 1) * step) / 2 + slot / 2;
  const centerY = (ALBUM_GRID.top + ALBUM_GRID.bottom) / 2;
  const grid = centredGrid(count, ALBUM_COLUMNS, step);
  return {
    slot,
    step,
    centerX,
    spots: grid.spots.map((spot) => ({ x: centerX + spot.dx, y: centerY + spot.dy })),
  };
}

/** Правый край сетки при таком числе предметов (от центра панели). */
export function albumGridRight(count: number): number {
  const { centerX, step, slot } = albumLayout(count);
  return centerX + ((ALBUM_COLUMNS - 1) * step) / 2 + slot / 2;
}

/** Во сколько раз дизайн-пиксель мельче экранного в самом тесном альбоме. */
export const ALBUM_SCALE = (ALBUM_SLOT_MIN * ALBUM_ITEM_FILL) / TREASURE_DESIGN;

/**
 * Окаменелость: диск с рёбрышками по краю.
 *
 * Рёбрышки выходят **за** диск — именно этим силуэт аммонита и отличается от
 * гладкого кружка монеты. Пока они сидели внутри (74..87 при диске 92), контур
 * оставался ровной окружностью, и весь смысл рёбрышек пропадал в альбоме.
 */
export const FOSSIL = {
  cx: 128,
  cy: 124,
  disc: 92,
  ribs: 14,
  ribIn: 84,
  ribOut: 108,
  ribWidth: 14,
} as const;
