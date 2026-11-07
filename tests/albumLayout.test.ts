/**
 * Экран «Мои сокровища»: правая колонка и сетка рядом с ней.
 *
 * Заведён рядом с `layout.test.ts`, потому что тот у порога в шестьсот строк;
 * здесь всё про один экран. Числа берутся из `art/treasureLayout.ts`, а не
 * из сцены, поэтому Phaser не нужен.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALBUM_COLUMNS,
  ALBUM_GRID,
  ALBUM_PANEL,
  ALBUM_SIDE,
  albumGridRight,
  albumLayout,
  albumSide,
} from '../src/art/treasureLayout';
import { LEVELS, totalTreasures } from '../src/data/levels';

const album = readFileSync(join(process.cwd(), 'src', 'scenes', 'CollectionScene.ts'), 'utf8');

describe('правая колонка альбома', () => {
  it('ряда точек в альбоме нет: предметы на экране и так показывают найденное', () => {
    // Точки повторяли сетку и ставили рядом три способа сказать одно и то же.
    expect(album).not.toContain('add.circle(');
    expect(album).not.toContain('DOTS_PER_ROW');
  });

  it('цифра, рюкзак и «назад» стоят друг под другом и не наезжают', () => {
    const side = ALBUM_SIDE;
    const counterBottom = side.counterY + side.counterHeight / 2;
    const backpackTop = side.backpackY - side.backpackSize / 2;
    const backpackBottom = side.backpackY + side.backpackSize / 2;
    expect(counterBottom).toBeLessThan(backpackTop);
    expect(backpackBottom).toBeLessThan(side.backY - side.backRadius);
    // Панель 680 высотой: кнопка не должна задевать нижний край.
    expect(side.backY + side.backRadius).toBeLessThan(ALBUM_PANEL.height / 2 - 20);
  });

  it('на самом большом альбоме сетка не доходит до «N из M»', () => {
    // Цифра: кегль 72, до восьми знаков («13 из 13») по 0.62 кегля на знак.
    const counterLeft = ALBUM_SIDE.x - (8 * 0.62 * 72) / 2;
    const biggest = Math.max(...LEVELS.map((level) => totalTreasures(level)));
    for (let count = 1; count <= biggest; count += 1) {
      expect(albumGridRight(count) + 16, `${count} предметов`).toBeLessThan(counterLeft);
    }
  });
});

describe('сетка альбома', () => {
  const biggest = Math.max(...LEVELS.map((level) => totalTreasures(level)));

  it('левый край первого ряда — у поля панели, а не где вышло', () => {
    for (let count = ALBUM_COLUMNS; count <= biggest; count += 1) {
      const { spots, slot } = albumLayout(count);
      const left = Math.min(...spots.map((spot) => spot.x)) - slot / 2;
      expect(left, `${count} предметов`).toBe(-ALBUM_PANEL.width / 2 + ALBUM_PANEL.margin);
      expect(left).toBe(ALBUM_GRID.left);
    }
  });

  it('правый край сетки — тот же, что проверяет тест выше про «N из M»', () => {
    for (let count = ALBUM_COLUMNS; count <= biggest; count += 1) {
      const { spots, slot } = albumLayout(count);
      const right = Math.max(...spots.map((spot) => spot.x)) + slot / 2;
      expect(right, `${count} предметов`).toBe(albumGridRight(count));
    }
  });

  it('сетка стоит по вертикали в своей области и целиком внутри панели', () => {
    for (let count = 1; count <= biggest; count += 1) {
      const { spots, slot } = albumLayout(count);
      const top = Math.min(...spots.map((spot) => spot.y)) - slot / 2;
      const bottom = Math.max(...spots.map((spot) => spot.y)) + slot / 2;
      // Середина занятого места — середина области, а не её верх или низ.
      expect((top + bottom) / 2, `${count} предметов`).toBeCloseTo((ALBUM_GRID.top + ALBUM_GRID.bottom) / 2, 5);
      expect(top).toBeGreaterThanOrEqual(ALBUM_GRID.top);
      expect(bottom).toBeLessThanOrEqual(ALBUM_GRID.bottom);
      expect(bottom).toBeLessThan(ALBUM_PANEL.height / 2);
    }
  });

  it('неполный последний ряд стоит по своей середине, а не прижат влево', () => {
    const { spots, centerX } = albumLayout(13);
    expect(spots).toHaveLength(13);
    expect(spots[12]?.x).toBe(centerX);
  });
});

describe('правая колонка по частям', () => {
  it('цифра говорит «найдено из всего» и стоит на своём месте, а не на месте рюкзака', () => {
    const parts = albumSide(5, 8);
    const counter = parts.find((part) => part.kind === 'counter');
    const backpack = parts.find((part) => part.kind === 'backpack');
    const back = parts.find((part) => part.kind === 'back');
    expect(counter).toMatchObject({ text: '5 из 8', x: ALBUM_SIDE.x, y: ALBUM_SIDE.counterY });
    expect(backpack).toMatchObject({ x: ALBUM_SIDE.x, y: ALBUM_SIDE.backpackY });
    expect(back).toMatchObject({ x: ALBUM_SIDE.x, y: ALBUM_SIDE.backY, radius: ALBUM_SIDE.backRadius });
    expect(parts).toHaveLength(3);
  });
});

describe('сцена берёт числа у treasureLayout', () => {
  // Сцену без Phaser не запустить; пока в ней оставалась своя формула блока и
  // свои поля колонки, тест проверял одну раскладку, а на экране была другая.
  it('не считает положение сама', () => {
    expect(album).toContain('albumLayout(count)');
    expect(album).toContain('albumSide(found, total)');
    expect(album).not.toContain('ALBUM_GRID');
    expect(album).not.toContain('centredGrid');
    expect(album).not.toMatch(/\bSIDE\./);
    expect(album).not.toMatch(/PANEL_[WH] = \d/);
  });
});
