/**
 * Полупроцедурная генерация леса по seed.
 * Один и тот же seed — один и тот же лес (ребёнок узнаёт места, где уже копал).
 */
import { TREE_META } from '../art/forest';
import { TEX } from '../art/keys';
import { CONFIG, WORLD_HEIGHT, WORLD_WIDTH } from '../config';
import { TREASURES } from '../data/treasures';
import { makeRng, type Rng } from './rng';

export type DecorKind = 'tree' | 'bush' | 'rock' | 'stump' | 'flower' | 'grass';

export interface DecorSpec {
  kind: DecorKind;
  texture: string;
  x: number;
  /** y — точка касания земли (объекты ставятся с origin 0.5, 1). */
  y: number;
  scale: number;
  /** Твёрдые объекты диплодок обходит. */
  solid: boolean;
  colliderRadius: number;
}

export interface TreasureSpec {
  /** Стабильный id внутри леса: по нему хранится прогресс. */
  id: string;
  /** Какой предмет лежит внутри. */
  itemId: string;
  kind: 'ground' | 'tree';
  /** Где стоять диплодоку (и где появится сундучок для клада в земле). */
  x: number;
  y: number;
  /** Куда тянуть шею (для клада на дереве; для клада в земле просто над сундуком). */
  crownX: number;
  crownY: number;
}

export interface StreamPoint {
  x: number;
  y: number;
}

export interface WorldData {
  seed: number;
  decor: DecorSpec[];
  treasures: TreasureSpec[];
  /** Ломаная русла ручья — рисуется как украшение, пройти через него можно. */
  stream: StreamPoint[];
  startX: number;
  startY: number;
  /** Предметы этого леса в порядке сетки коллекции. */
  itemIds: string[];
}

interface Placed {
  x: number;
  y: number;
  radius: number;
}

const DECOR_PLAN: ReadonlyArray<{
  kind: DecorKind;
  textures: readonly string[];
  count: number;
  scale: [number, number];
  solid: boolean;
  /** Доля ширины текстуры, которая становится радиусом коллайдера. */
  collider: number;
}> = [
  { kind: 'tree', textures: TEX.TREE, count: CONFIG.forest.trees, scale: [0.85, 1.15], solid: true, collider: 0 },
  { kind: 'bush', textures: TEX.BUSH, count: CONFIG.forest.bushes, scale: [0.8, 1.1], solid: true, collider: 0.3 },
  { kind: 'rock', textures: TEX.ROCK, count: CONFIG.forest.rocks, scale: [0.8, 1.2], solid: true, collider: 0.32 },
  { kind: 'stump', textures: TEX.STUMP, count: CONFIG.forest.stumps, scale: [0.9, 1.15], solid: true, collider: 0.33 },
  { kind: 'flower', textures: TEX.FLOWER, count: CONFIG.forest.flowers, scale: [0.9, 1.3], solid: false, collider: 0 },
  { kind: 'grass', textures: TEX.GRASS, count: CONFIG.forest.grass, scale: [0.9, 1.4], solid: false, collider: 0 },
];

/** Примерная ширина текстур по виду — чтобы не зависеть от загрузки текстур на этапе генерации. */
const APPROX_WIDTH: Record<DecorKind, number> = {
  tree: 240,
  bush: 170,
  rock: 150,
  stump: 120,
  flower: 56,
  grass: 64,
};

function makeStream(rng: Rng): StreamPoint[] {
  const baseX = rng.range(0.3, 0.7) * WORLD_WIDTH;
  const amplitude = rng.range(180, 320);
  const waves = rng.range(1.5, 2.5);
  const points: StreamPoint[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      x: baseX + Math.sin(t * Math.PI * waves) * amplitude,
      y: -80 + t * (WORLD_HEIGHT + 160),
    });
  }
  return points;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distanceToStream(stream: readonly StreamPoint[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const point of stream) {
    const d = dist(x, y, point.x, point.y);
    if (d < best) best = d;
  }
  return best;
}

function farEnough(items: readonly Placed[], x: number, y: number, gap: number): boolean {
  for (const item of items) {
    const dx = x - item.x;
    const dy = (y - item.y) * 1.35; // по вертикали лес гуще — так он читается лучше
    if (Math.hypot(dx, dy) < gap + item.radius) return false;
  }
  return true;
}

export function generateWorld(seed: number): WorldData {
  const rng = makeRng(seed);
  const margin = CONFIG.world.margin;
  const startX = WORLD_WIDTH / 2;
  const startY = WORLD_HEIGHT / 2;

  const stream = makeStream(rng);
  const decor: DecorSpec[] = [];
  const solids: Placed[] = [];

  for (const plan of DECOR_PLAN) {
    for (let i = 0; i < plan.count; i += 1) {
      // Несколько попыток найти свободное место; не нашли — просто пропускаем объект.
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = rng.range(margin, WORLD_WIDTH - margin);
        const y = rng.range(margin, WORLD_HEIGHT - margin);
        if (distanceToStream(stream, x, y) < (plan.solid ? 130 : 60)) continue;
        if (plan.solid && dist(x, y, startX, startY) < 300) continue;
        if (plan.solid && !farEnough(solids, x, y, CONFIG.forest.minSolidGap)) continue;

        const texture = rng.pick(plan.textures);
        const scale = rng.range(plan.scale[0], plan.scale[1]);
        const meta = TREE_META[texture];
        const colliderRadius = plan.solid
          ? (plan.kind === 'tree' && meta !== undefined
              ? meta.trunkRadius * scale
              : APPROX_WIDTH[plan.kind] * plan.collider * scale)
          : 0;

        decor.push({ kind: plan.kind, texture, x, y, scale, solid: plan.solid, colliderRadius });
        if (plan.solid) solids.push({ x, y, radius: colliderRadius });
        break;
      }
    }
  }

  const treasures = placeTreasures(rng, decor, solids, stream, startX, startY);

  return {
    seed,
    decor,
    treasures,
    stream,
    startX,
    startY,
    itemIds: treasures.map((treasure) => treasure.itemId),
  };
}

function placeTreasures(
  rng: Rng,
  decor: readonly DecorSpec[],
  solids: readonly Placed[],
  stream: readonly StreamPoint[],
  startX: number,
  startY: number,
): TreasureSpec[] {
  const items = rng.shuffle(TREASURES.map((item) => item.id)).slice(0, CONFIG.treasures.total);
  const placed: Placed[] = [];
  const raw: Omit<TreasureSpec, 'id' | 'itemId'>[] = [];
  const margin = CONFIG.world.margin + 80;
  const gap = CONFIG.treasures.minGap;

  // Клады на деревьях: выбираем крупные деревья подальше друг от друга.
  const trees = rng.shuffle(decor.filter((item) => item.kind === 'tree' && item.scale > 0.9));
  for (const tree of trees) {
    if (raw.length >= CONFIG.treasures.onTrees) break;
    if (!farEnough(placed, tree.x, tree.y, gap)) continue;
    if (dist(tree.x, tree.y, startX, startY) < 420) continue;
    const meta = TREE_META[tree.texture];
    const crownOffsetY = (meta?.crownOffsetY ?? 220) * tree.scale;
    // Крона должна остаться в пределах мира: иначе диплодок потянется за край экрана.
    if (tree.y - crownOffsetY < 200) continue;
    // Стоять диплодок будет чуть в стороне от ствола, чтобы его не загораживало.
    const standX = tree.x + (tree.x > WORLD_WIDTH / 2 ? -110 : 110);
    raw.push({ kind: 'tree', x: standX, y: tree.y + 18, crownX: tree.x, crownY: tree.y - crownOffsetY });
    placed.push({ x: tree.x, y: tree.y, radius: 0 });
  }

  // Остальные клады — в земле, на свободных местах.
  const groundNeeded = CONFIG.treasures.total - raw.length;
  for (let i = 0; i < groundNeeded; i += 1) {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const x = rng.range(margin, WORLD_WIDTH - margin);
      const y = rng.range(margin, WORLD_HEIGHT - margin);
      if (dist(x, y, startX, startY) < 360) continue;
      if (distanceToStream(stream, x, y) < 150) continue;
      if (!farEnough(placed, x, y, gap)) continue;
      if (!farEnough(solids, x, y, 150)) continue;
      raw.push({ kind: 'ground', x, y, crownX: x, crownY: y - 200 });
      placed.push({ x, y, radius: 0 });
      break;
    }
  }

  // Порядок кладов перемешиваем, чтобы в коллекции земля и деревья шли вразнобой.
  return rng.shuffle(raw).map((spec, index) => ({
    ...spec,
    id: 't' + index,
    itemId: items[index] ?? TREASURES[index % TREASURES.length]!.id,
  }));
}
