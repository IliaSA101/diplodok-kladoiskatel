/**
 * Подсказка «горячо-холодно» без слов: чем ближе ближайший ненайденный клад,
 * тем ярче звёздочка над головой и тем чаще тихий «бип».
 */
import { CONFIG } from '../config';
import type { TreasureSpec } from './worldGen';

export interface HotColdState {
  /** 0 — далеко, 1 — стоим почти на кладе. */
  intensity: number;
  /** Пауза между «бипами» в миллисекундах; Infinity — молчим. */
  beepIntervalMs: number;
  /** Расстояние до ближайшего ненайденного клада (Infinity, если всё найдено). */
  distance: number;
}

const SILENT: HotColdState = {
  intensity: 0,
  beepIntervalMs: Number.POSITIVE_INFINITY,
  distance: Number.POSITIVE_INFINITY,
};

export function computeHotCold(
  x: number,
  y: number,
  treasures: readonly TreasureSpec[],
  isFound: (id: string) => boolean,
): HotColdState {
  let distance = Number.POSITIVE_INFINITY;
  for (const treasure of treasures) {
    if (isFound(treasure.id)) continue;
    const d = Math.hypot(treasure.x - x, treasure.y - y);
    if (d < distance) distance = d;
  }
  if (!Number.isFinite(distance)) return SILENT;

  const { minDistance, maxDistance, beepFastMs, beepSlowMs } = CONFIG.hotCold;
  const raw = (maxDistance - distance) / (maxDistance - minDistance);
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  // Кривая погорячее к концу: вдалеке подсказка почти не мешает.
  const intensity = t * t;

  return {
    intensity,
    beepIntervalMs:
      intensity <= 0.02
        ? Number.POSITIVE_INFINITY
        : beepSlowMs + (beepFastMs - beepSlowMs) * intensity,
    distance,
  };
}
