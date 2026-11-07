/**
 * Диплодок на выборе леса, в «Моих сокровищах» и в альбоме наклеек.
 *
 * Панели, из-за которой можно выглянуть (как на задачке), там нет, и он стоит
 * целиком в свободной полосе. «Свободная» — это не взгляд, а числа: тест
 * сверяет весь его рисунок с тем, что на этом месте уже нарисовано, на самом
 * большом варианте (восемь лесов, до шестнадцати предметов, двадцать четыре
 * наклейки). Новый жилец угла выселяет старого — так он не выселяет никого.
 * Лежит отдельно от `dinoLayout.test.ts`: тот упёрся в шестьсот строк.
 */
import { describe, expect, it } from 'vitest';
import {
  DINO_ALBUM_SPOT,
  DINO_CHEER,
  DINO_COLLECTION_SPOT,
  dinoCheerReach,
  DINO_LEVELS_SPOT,
  dinoSpotBox,
  dinoSpotIn,
  type Box,
} from '../src/art/dinoLayout';
import {
  LEVEL_HORIZON_Y,
  levelBadgeCentre,
  levelDotsBottom,
  LEVEL_GRID,
} from '../src/art/levelSelectLayout';
import { STICKER_ALBUM, stickerCellCentre } from '../src/art/stickerAlbumLayout';
import { ALBUM_PANEL, ALBUM_SIDE, albumLayout, albumSide } from '../src/art/treasureLayout';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../src/config';
import { LEVEL_COUNT, getLevel, totalTreasures } from '../src/data/levels';

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Круг (кнопка) задевает прямоугольник рисунка. */
function circleHits(cx: number, cy: number, r: number, box: Box): boolean {
  const nx = Math.min(Math.max(cx, box.left), box.right);
  const ny = Math.min(Math.max(cy, box.top), box.bottom);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/**
 * Рамка листа и панели: обводка в 4 px (`drawPanel`) и просвет, чтобы макушка
 * в прыжке не касалась её.
 */
const FRAME = 4;
const FRAME_GAP = 4;

describe('прыжок радости', () => {
  it('запас сверху — подъём плюс то, на сколько качание поднимает верхний угол рисунка', () => {
    const { box, reach } = (() => {
      const spot = DINO_LEVELS_SPOT;
      return { box: dinoSpotBox(spot), reach: dinoCheerReach(spot) };
    })();
    // Тело качается вокруг середины низа: поворачиваем верхний угол руками.
    const a = (DINO_CHEER.swayDeg * Math.PI) / 180;
    const half = (box.right - box.left) / 2;
    const height = box.bottom - box.top;
    const cornerY = half * Math.sin(a) + height * Math.cos(a);
    const sway = cornerY - height;
    expect(sway).toBeGreaterThan(3);
    expect(reach).toBeCloseTo(DINO_CHEER.jump + sway, 6);
  });
});

describe('диплодок на выборе леса', () => {
  const dino = dinoSpotBox(DINO_LEVELS_SPOT);

  it('стоит на траве целиком, а не висит в небе и не уходит за край', () => {
    expect(dino.bottom).toBeLessThan(GAME_HEIGHT);
    expect(dino.bottom).toBeGreaterThan(LEVEL_HORIZON_Y);
    expect(dino.left).toBeGreaterThan(0);
    expect(dino.right).toBeLessThan(GAME_WIDTH);
    expect(dino.top - dinoCheerReach(DINO_LEVELS_SPOT)).toBeGreaterThan(0);
  });

  it('ниже каждого ряда точек самого большого леса и в стороне от кружков', () => {
    for (let n = 1; n <= LEVEL_COUNT; n += 1) {
      const total = totalTreasures(getLevel(n));
      const { x, y } = levelBadgeCentre(n);
      // Кружок целиком и точки под ним: по ширине — вся ячейка сетки.
      const cell: Box = {
        left: x - LEVEL_GRID.stepX / 2,
        right: x + LEVEL_GRID.stepX / 2,
        top: y - LEVEL_GRID.badgeRadius,
        bottom: levelDotsBottom(n, total),
      };
      expect(overlaps(dino, cell), `лес ${n}`).toBe(false);
      // Даже подпрыгнув от радости (все леса пройдены), он не задевает точки:
      // рамка, поднятая на прыжок и качание, тоже ниже них.
      const jumped: Box = { ...dino, top: dino.top - dinoCheerReach(DINO_LEVELS_SPOT) };
      expect(overlaps(jumped, cell), `лес ${n}, в прыжке`).toBe(false);
    }
  });

  it('не задевает кнопки «назад» и «Ещё лес!» с подписью', () => {
    const r = CONFIG.ui.buttonRadius;
    const back = CONFIG.ui.padding + r;
    expect(circleHits(back, back, r, dino)).toBe(false);
    const endlessX = GAME_WIDTH - CONFIG.ui.padding - r;
    const endlessY = GAME_HEIGHT - CONFIG.ui.padding - r;
    expect(circleHits(endlessX, endlessY, r, dino)).toBe(false);
    // Подпись «Ещё лес!» кеглем fontSizeText слева от кнопки: не шире 300 px.
    const label: Box = { left: endlessX - r - 16 - 300, right: endlessX - r - 16, top: endlessY - 30, bottom: endlessY + 30 };
    expect(overlaps(dino, label)).toBe(false);
  });
});

describe('диплодок в «Моих сокровищах»', () => {
  /** Панель стоит по центру экрана, и все её числа — от этого центра. */
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const dino = dinoSpotBox(DINO_COLLECTION_SPOT);
  const shift = (box: Box): Box => ({
    left: box.left + cx,
    right: box.right + cx,
    top: box.top + cy,
    bottom: box.bottom + cy,
  });

  it('стоит внутри панели, не у самого её края', () => {
    const panel = shift({
      left: -ALBUM_PANEL.width / 2,
      right: ALBUM_PANEL.width / 2,
      top: -ALBUM_PANEL.height / 2,
      bottom: ALBUM_PANEL.height / 2,
    });
    // Панель рисуется со скруглением и тенью: от края оставлено 12 px.
    expect(dino.left).toBeGreaterThan(panel.left + 12);
    expect(dino.right).toBeLessThan(panel.right - 12);
    expect(dino.top).toBeGreaterThan(panel.top + 12);
    expect(dino.bottom).toBeLessThan(panel.bottom - 12);
  });

  it('не задевает ячейки сетки при любом числе предметов', () => {
    // От одного предмета до шестнадцати: ячейки крупнее, когда строк меньше,
    // и сетка тогда подходит ближе всего (3 строки по 165 px).
    for (let count = 1; count <= 16; count += 1) {
      const { slot, spots } = albumLayout(count);
      // Секретная ячейка — последняя — крупнее на десятую.
      spots.forEach((spot, i) => {
        const half = (slot * (i === count - 1 ? 1.1 : 1)) / 2;
        const cell = shift({ left: spot.x - half, right: spot.x + half, top: spot.y - half, bottom: spot.y + half });
        expect(overlaps(dino, cell), `предметов ${count}, ячейка ${i}`).toBe(false);
      });
    }
  });

  it('не задевает «N из M», рюкзак и кнопку «назад»', () => {
    for (const part of albumSide(13, 13)) {
      if (part.kind === 'back') {
        expect(circleHits(part.x + cx, part.y + cy, part.radius, dino)).toBe(false);
      } else {
        // Цифра кеглем 72 на «13 из 13» не шире 300 px; рюкзак — квадрат 115 px.
        const halfW = part.kind === 'counter' ? 150 : ALBUM_SIDE.backpackSize / 2;
        const halfH = part.kind === 'counter' ? ALBUM_SIDE.counterHeight / 2 : ALBUM_SIDE.backpackSize / 2;
        const box = shift({ left: part.x - halfW, right: part.x + halfW, top: part.y - halfH, bottom: part.y + halfH });
        expect(overlaps(dino, box), part.kind).toBe(false);
      }
    }
  });

  it('в контейнере панели встаёт в ту же точку экрана', () => {
    const inside = dinoSpotIn(DINO_COLLECTION_SPOT, cx, cy);
    expect(inside.centerX + cx).toBe(DINO_COLLECTION_SPOT.centerX);
    expect(inside.bottom + cy).toBe(DINO_COLLECTION_SPOT.bottom);
  });
});

describe('диплодок в альбоме наклеек', () => {
  const dino = dinoSpotBox(DINO_ALBUM_SPOT);
  /** Надписи мерены по кадру 16-album: «Мои наклейки» 186..572, «0 из 24» 917..1104; поля с запасом. */
  const titleRight = STICKER_ALBUM.titleX + 230;
  const counterLeft = STICKER_ALBUM.counterX - 130;

  it('помещается между заголовком и счётчиком', () => {
    expect(dino.left).toBeGreaterThan(titleRight);
    expect(dino.right).toBeLessThan(counterLeft);
  });

  it('стоит на верхнем ряду ячеек, а не на них', () => {
    for (let i = 0; i < STICKER_ALBUM.columns * STICKER_ALBUM.rows; i += 1) {
      const { x, y } = stickerCellCentre(i);
      const half = STICKER_ALBUM.slot / 2;
      const cell: Box = { left: x - half, right: x + half, top: y - half, bottom: y + half };
      expect(overlaps(dino, cell), `ячейка ${i}`).toBe(false);
    }
  });

  it('целиком на листе, и подпрыгнуть ему есть куда', () => {
    // Лист начинается в padding/2 от края экрана, и у него ещё рамка: макушка
    // в прыжке (все наклейки собраны) не должна лечь на неё.
    const sheetTop = CONFIG.ui.padding / 2;
    expect(dino.top - dinoCheerReach(DINO_ALBUM_SPOT)).toBeGreaterThanOrEqual(sheetTop + FRAME + FRAME_GAP);
  });
});
