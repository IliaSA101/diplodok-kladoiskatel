/**
 * Дорожка карты квеста: точки между узлами и путь от узла к узлу.
 *
 * Модуль без Phaser — это чистая арифметика, и только поэтому её можно
 * проверить тестом. Сцена рисует по готовым точкам и сама ничего не считает.
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * Для каждой пары соседних узлов — слегка изогнутая цепочка точек
 * (оба конца включительно). Изгиб чередует знак, поэтому дорожка «змеится».
 *
 * `step` — желаемое расстояние между точками; на коротком отрезке их всё
 * равно будет не меньше четырёх, иначе дорожка распадается на пунктир.
 */
export function trackSegments(nodes: readonly Pt[], step: number): Pt[][] {
  const segments: Pt[][] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      segments.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
      continue;
    }
    // Контрольная точка уводит дорожку вбок; знак чередуется — получается змейка.
    const bend = (i % 2 === 0 ? 1 : -1) * length * 0.16;
    const cx = (a.x + b.x) / 2 + (-dy / length) * bend;
    const cy = (a.y + b.y) / 2 + (dx / length) * bend;
    const steps = Math.max(3, Math.ceil(length / step));
    const points: Pt[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const u = 1 - t;
      points.push({
        x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
        y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
      });
    }
    segments.push(points);
  }
  return segments;
}

/**
 * Путь от узла `from` до узла `to` по точкам дорожки, в любую сторону.
 * Первая точка пути — сам узел `from`, последняя — узел `to`.
 */
export function pathBetween(segments: readonly Pt[][], from: number, to: number): Pt[] {
  const result: Pt[] = [];
  if (from === to) return result;
  if (from < to) {
    for (let i = from; i < to; i += 1) {
      const seg = segments[i];
      if (seg === undefined) continue;
      result.push(...(i === from ? seg : seg.slice(1)));
    }
  } else {
    for (let i = from - 1; i >= to; i -= 1) {
      const source = segments[i];
      if (source === undefined) continue;
      const seg = [...source].reverse();
      result.push(...(i === from - 1 ? seg : seg.slice(1)));
    }
  }
  return result;
}

/** Длина ломаной: по ней считают время ходьбы. */
export function pathLength(path: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
