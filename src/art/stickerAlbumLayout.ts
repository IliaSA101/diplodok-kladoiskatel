/**
 * Раскладка альбома наклеек: заголовок, счётчик и сетка 8×3.
 *
 * Над сеткой между заголовком и счётчиком остаётся полоса, и в ней стоит
 * диплодок — поэтому его тест должен знать, где кончаются обе надписи и где
 * начинается верхний ряд. Phaser тут нет.
 */
import { GAME_WIDTH } from '../config';

export const STICKER_ALBUM = {
  columns: 8,
  rows: 3,
  stepX: 150,
  stepY: 170,
  firstRowY: 230,
  /** Ячейка-подложка, длинная сторона в px. */
  slot: 126,
  /** Строка заголовка: «Мои наклейки» слева, «N из 24» справа. */
  headY: 66,
  titleX: 380,
  counterX: 1010,
} as const;

/** Центр ячейки i (с нуля) в порядке наклеек. */
export function stickerCellCentre(i: number): { x: number; y: number } {
  const { columns, stepX, stepY, firstRowY } = STICKER_ALBUM;
  return {
    x: GAME_WIDTH / 2 + ((i % columns) - (columns - 1) / 2) * stepX,
    y: firstRowY + Math.floor(i / columns) * stepY,
  };
}
