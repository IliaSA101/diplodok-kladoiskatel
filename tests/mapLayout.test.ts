/**
 * Раскладка карты квеста: где стоит диплодок, наклейки и кнопки кругов.
 *
 * Вынесено из `tests/layout.test.ts`, когда тот упёрся в порог в шестьсот
 * строк. Зона своя: всё здесь — про один экран, и считают это `mapDinoBox`,
 * `mapStickerBox` и `roundPickerSpot`.
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_NODE,
  ROUND_PICKER,
  mapDinoBox,
  mapStickerBox,
  roundPickerSpot,
  roundResetSpot,
} from '../src/art/layout';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';
import { QUEST_NODES, ROUND_COUNT } from '../src/data/quest';

describe('диплодок на карте квеста', () => {
  /** Места дорожки: круги проходят по одним и тем же точкам. */
  const places = [...new Map(QUEST_NODES.map((node) => [`${node.x},${node.y}`, node])).values()];

  /** Насколько близко прямоугольник подходит к точке. */
  function distance(x: number, y: number, box: ReturnType<typeof mapDinoBox>): number {
    const nearX = Math.min(Math.max(x, box.left), box.right);
    const nearY = Math.min(Math.max(y, box.top), box.bottom);
    return Math.hypot(x - nearX, y - nearY);
  }

  it('не закрывает значок ни своего узла, ни соседнего', () => {
    // Раньше диплодок стоял прямо на узле и закрывал собой картинку задачки —
    // ту самую, по которой ребёнок и выбирает, куда идти.
    const iconRadius = MAP_NODE.icon / 2;
    for (const stands of places) {
      const box = mapDinoBox(stands.x, stands.y);
      for (const node of places) {
        expect(
          distance(node.x, node.y, box),
          `стоит у ${stands.x},${stands.y}, закрывает ${node.x},${node.y}`,
        ).toBeGreaterThan(iconRadius);
      }
    }
  });

  it('наклейка решённого узла не ложится ему на голову', () => {
    // Наклейка висела слева-сверху от узла, а диплодок стоит у каждого узла
    // слева — и на экране выходило двухголовое животное. Справа свободно.
    for (const stands of places) {
      const dino = mapDinoBox(stands.x, stands.y);
      const sticker = mapStickerBox(stands.x, stands.y);
      const across = Math.min(sticker.right, dino.right) - Math.max(sticker.left, dino.left);
      const along = Math.min(sticker.bottom, dino.bottom) - Math.max(sticker.top, dino.top);
      expect(
        across > 0 && along > 0,
        `узел ${stands.x},${stands.y}: наезд ${across.toFixed(1)}×${along.toFixed(1)}`,
      ).toBe(false);
    }
  });

  it('наклейка не заходит на соседний кружок', () => {
    // Перенесли её вправо — значит, надо проверить, что справа и правда
    // свободно: новый жилец угла выселяет старого.
    const ring = MAP_NODE.diameter / 2 + 7;
    for (const stands of places) {
      const sticker = mapStickerBox(stands.x, stands.y);
      const midX = (sticker.left + sticker.right) / 2;
      const midY = (sticker.top + sticker.bottom) / 2;
      const reach = (sticker.right - sticker.left) / 2;
      for (const node of places) {
        if (node.x === stands.x && node.y === stands.y) continue;
        expect(
          Math.hypot(node.x - midX, node.y - midY),
          `наклейка узла ${stands.x},${stands.y} лезет на ${node.x},${node.y}`,
        ).toBeGreaterThan(ring + reach);
      }
    }
  });

  it('сам не уходит за край экрана', () => {
    for (const stands of places) {
      const box = mapDinoBox(stands.x, stands.y);
      expect(box.left, `узел ${stands.x},${stands.y}`).toBeGreaterThanOrEqual(0);
      expect(box.right, `узел ${stands.x},${stands.y}`).toBeLessThanOrEqual(GAME_WIDTH);
      expect(box.top, `узел ${stands.x},${stands.y}`).toBeGreaterThanOrEqual(0);
      expect(box.bottom, `узел ${stands.x},${stands.y}`).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });
});

describe('кнопки кругов', () => {
  it('ни одна кнопка не наезжает на панель счётчика и не уходит за край', () => {
    // Шестая кнопка в один ряд уже не влезала: её левый край оказывался
    // на панели «N из 48», которая стоит по центру.
    for (let round = 1; round <= ROUND_COUNT; round += 1) {
      const { x, y } = roundPickerSpot(round);
      const where = `круг ${round}`;
      expect(x - ROUND_PICKER.radius, where).toBeGreaterThan(ROUND_PICKER.headerRight);
      expect(x + ROUND_PICKER.radius, where).toBeLessThanOrEqual(GAME_WIDTH);
      expect(y - ROUND_PICKER.radius, where).toBeGreaterThan(0);
    }
  });

  it('кнопки не наезжают друг на друга', () => {
    const spots = Array.from({ length: ROUND_COUNT }, (_, i) => roundPickerSpot(i + 1));
    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i];
        const b = spots[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        expect(gap, `круги ${i + 1} и ${j + 1}`).toBeGreaterThan(ROUND_PICKER.radius * 2);
      }
    }
  });

  it('«круг заново» стоит ниже всех кругов и выше дорожки', () => {
    const reset = roundResetSpot(ROUND_COUNT);
    const last = roundPickerSpot(ROUND_COUNT);
    expect(reset.y - ROUND_PICKER.radius).toBeGreaterThan(last.y + ROUND_PICKER.radius);
    // Самый верхний узел дорожки: ниже кнопки начинается карта.
    const topNode = Math.min(...QUEST_NODES.map((node) => node.y));
    expect(reset.y + ROUND_PICKER.radius).toBeLessThan(topNode - MAP_NODE.diameter / 2);
  });
});
