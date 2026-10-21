/**
 * Полупроцедурная генерация леса по уровню.
 * Один и тот же номер леса — один и тот же лес: ребёнок узнаёт места,
 * где уже копал, и помнит, где видел белку.
 */
import { TREE_META } from '../art/forest';
import { TEX } from '../art/keys';
import { themeTexture, THEMES, type TextureSetId } from '../art/themes';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { LevelSpec } from '../data/levels';
import { REGULAR_TREASURES, SECRET_ITEM_ID } from '../data/treasures';
import { makeRng, type Rng } from './rng';

export type DecorKind = 'tree' | 'bush' | 'rock' | 'stump' | 'flower' | 'grass';

/** Как достают клад. */
export type TreasureKind = 'ground' | 'tree' | 'rock' | 'water' | 'secret';

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
  kind: TreasureKind;
  /** Где стоять диплодоку. */
  x: number;
  y: number;
  /** Куда тянуться: крона дерева, камень, место в ручье или над сундуком. */
  crownX: number;
  crownY: number;
  /** Индекс камня в decor для клада под камнем; -1 — не нужен. */
  decorIndex: number;
}

export interface StreamPoint {
  x: number;
  y: number;
}

export interface WorldData {
  level: LevelSpec;
  seed: number;
  width: number;
  height: number;
  textureSet: TextureSetId;
  decor: DecorSpec[];
  treasures: TreasureSpec[];
  /** Ломаная русла ручья — через него можно пройти. */
  stream: StreamPoint[];
  /** Где сидят белки-подсказчицы. */
  squirrels: StreamPoint[];
  startX: number;
  startY: number;
  /** Предметы этого леса в порядке сетки коллекции; последний — секретный. */
  itemIds: string[];
}

interface Placed {
  x: number;
  y: number;
  radius: number;
}

interface DecorPlan {
  kind: DecorKind;
  textures: readonly string[];
  count: number;
  scale: [number, number];
  solid: boolean;
  /** Доля ширины текстуры, которая становится радиусом коллайдера. */
  collider: number;
}

/** Примерная ширина текстур по виду — чтобы не зависеть от уже загруженных текстур. */
const APPROX_WIDTH: Record<DecorKind, number> = {
  tree: 240,
  bush: 170,
  rock: 150,
  stump: 120,
  flower: 56,
  grass: 64,
};

function decorPlan(level: LevelSpec): DecorPlan[] {
  const d = level.density;
  const n = (base: number): number => Math.round(base * d);
  return [
    { kind: 'tree', textures: TEX.TREE, count: n(CONFIG.forest.trees), scale: [0.85, 1.15], solid: true, collider: 0 },
    { kind: 'bush', textures: TEX.BUSH, count: n(CONFIG.forest.bushes), scale: [0.8, 1.1], solid: true, collider: 0.3 },
    { kind: 'rock', textures: TEX.ROCK, count: n(CONFIG.forest.rocks), scale: [0.8, 1.2], solid: true, collider: 0.32 },
    { kind: 'stump', textures: TEX.STUMP, count: n(CONFIG.forest.stumps), scale: [0.9, 1.15], solid: true, collider: 0.33 },
    { kind: 'flower', textures: TEX.FLOWER, count: n(CONFIG.forest.flowers), scale: [0.9, 1.3], solid: false, collider: 0 },
    { kind: 'grass', textures: TEX.GRASS, count: n(CONFIG.forest.grass), scale: [0.9, 1.4], solid: false, collider: 0 },
  ];
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

function makeStream(rng: Rng, width: number, height: number): StreamPoint[] {
  const baseX = rng.range(0.3, 0.7) * width;
  const amplitude = rng.range(180, 320);
  const waves = rng.range(1.5, 2.5);
  const points: StreamPoint[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      x: baseX + Math.sin(t * Math.PI * waves) * amplitude,
      y: -80 + t * (height + 160),
    });
  }
  return points;
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

export function generateWorld(level: LevelSpec): WorldData {
  const rng = makeRng(level.seed);
  const width = GAME_WIDTH * level.screensX;
  const height = GAME_HEIGHT * level.screensY;
  const textureSet = THEMES[level.theme].textureSet;
  const margin = CONFIG.world.margin;
  const startX = width / 2;
  const startY = height / 2;

  const stream = makeStream(rng, width, height);
  const decor: DecorSpec[] = [];
  const solids: Placed[] = [];

  for (const plan of decorPlan(level)) {
    for (let i = 0; i < plan.count; i += 1) {
      // Несколько попыток найти свободное место; не нашли — просто пропускаем объект.
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = rng.range(margin, width - margin);
        const y = rng.range(margin, height - margin);
        if (distanceToStream(stream, x, y) < (plan.solid ? 130 : 60)) continue;
        if (plan.solid && dist(x, y, startX, startY) < 300) continue;
        if (plan.solid && !farEnough(solids, x, y, CONFIG.forest.minSolidGap)) continue;

        const texture = themeTexture(rng.pick(plan.textures), textureSet);
        const scale = rng.range(plan.scale[0], plan.scale[1]);
        const meta = TREE_META[texture];
        const colliderRadius = plan.solid
          ? plan.kind === 'tree' && meta !== undefined
            ? meta.trunkRadius * scale
            : APPROX_WIDTH[plan.kind] * plan.collider * scale
          : 0;

        decor.push({ kind: plan.kind, texture, x, y, scale, solid: plan.solid, colliderRadius });
        if (plan.solid) solids.push({ x, y, radius: colliderRadius });
        break;
      }
    }
  }

  const treasures = placeTreasures(rng, level, decor, solids, stream, width, height, startX, startY);
  const squirrels = placeSquirrels(rng, level, decor, treasures, startX, startY);

  return {
    level,
    seed: level.seed,
    width,
    height,
    textureSet,
    decor,
    treasures,
    stream,
    squirrels,
    startX,
    startY,
    itemIds: treasures.map((treasure) => treasure.itemId),
  };
}

type RawTreasure = Omit<TreasureSpec, 'id' | 'itemId'>;

function placeTreasures(
  rng: Rng,
  level: LevelSpec,
  decor: readonly DecorSpec[],
  solids: readonly Placed[],
  stream: readonly StreamPoint[],
  width: number,
  height: number,
  startX: number,
  startY: number,
): TreasureSpec[] {
  const placed: Placed[] = [];
  const raw: RawTreasure[] = [];
  const margin = CONFIG.world.margin + 80;
  const gap = CONFIG.treasures.minGap;
  const mix = level.treasures;

  const free = (x: number, y: number): boolean => farEnough(placed, x, y, gap);

  // 1. Клады в кронах: крупные деревья подальше друг от друга и от старта.
  const trees = decor
    .map((spec, index) => ({ spec, index }))
    .filter((item) => item.spec.kind === 'tree' && item.spec.scale > 0.9);
  for (const tree of rng.shuffle(trees)) {
    if (raw.filter((t) => t.kind === 'tree').length >= mix.tree) break;
    const { spec } = tree;
    if (!free(spec.x, spec.y)) continue;
    if (dist(spec.x, spec.y, startX, startY) < 420) continue;
    const meta = TREE_META[spec.texture];
    const crownOffsetY = (meta?.crownOffsetY ?? 220) * spec.scale;
    // Крона должна остаться в пределах мира: иначе диплодок потянется за край экрана.
    if (spec.y - crownOffsetY < 200) continue;
    const standX = spec.x + (spec.x > width / 2 ? -110 : 110);
    raw.push({
      kind: 'tree',
      x: standX,
      y: spec.y + 18,
      crownX: spec.x,
      crownY: spec.y - crownOffsetY,
      decorIndex: tree.index,
    });
    placed.push({ x: spec.x, y: spec.y, radius: 0 });
  }

  // 2. Клады под камнями: камень откатится, под ним сундучок.
  const rocks = decor
    .map((spec, index) => ({ spec, index }))
    .filter((item) => item.spec.kind === 'rock');
  for (const rock of rng.shuffle(rocks)) {
    if (raw.filter((t) => t.kind === 'rock').length >= mix.rock) break;
    const { spec } = rock;
    if (!free(spec.x, spec.y)) continue;
    if (dist(spec.x, spec.y, startX, startY) < 400) continue;
    const standX = spec.x + (spec.x > width / 2 ? -120 : 120);
    raw.push({
      kind: 'rock',
      x: standX,
      y: spec.y + 10,
      crownX: spec.x,
      crownY: spec.y - 30,
      decorIndex: rock.index,
    });
    placed.push({ x: spec.x, y: spec.y, radius: 0 });
  }

  // 3. Клады в ручье: стоим на берегу, голову — в воду.
  for (let i = 0; i < mix.water; i += 1) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const index = rng.int(6, stream.length - 7);
      const point = stream[index] as StreamPoint;
      if (point.y < margin || point.y > height - margin) continue;
      if (!free(point.x, point.y)) continue;
      if (dist(point.x, point.y, startX, startY) < 380) continue;

      // Берег выбираем тот, где свободнее.
      const left = { x: point.x - 150, y: point.y + 10 };
      const right = { x: point.x + 150, y: point.y + 10 };
      const leftOk = farEnough(solids, left.x, left.y, 120) && left.x > margin;
      const rightOk = farEnough(solids, right.x, right.y, 120) && right.x < width - margin;
      if (!leftOk && !rightOk) continue;
      const bank = leftOk && (!rightOk || rng.chance(0.5)) ? left : right;

      raw.push({
        kind: 'water',
        x: bank.x,
        y: bank.y,
        crownX: point.x,
        crownY: point.y,
        decorIndex: -1,
      });
      placed.push({ x: point.x, y: point.y, radius: 0 });
      break;
    }
  }

  // 4. Остальные клады — в земле.
  const groundNeeded = mix.ground + (mix.tree + mix.rock + mix.water - raw.length);
  for (let i = 0; i < groundNeeded; i += 1) {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const x = rng.range(margin, width - margin);
      const y = rng.range(margin, height - margin);
      if (dist(x, y, startX, startY) < 360) continue;
      if (distanceToStream(stream, x, y) < 150) continue;
      if (!free(x, y)) continue;
      if (!farEnough(solids, x, y, 150)) continue;
      raw.push({ kind: 'ground', x, y, crownX: x, crownY: y - 200, decorIndex: -1 });
      placed.push({ x, y, radius: 0 });
      break;
    }
  }

  // Порядок перемешиваем, чтобы в коллекции виды кладов шли вразнобой.
  const items = rng.shuffle(REGULAR_TREASURES.map((item) => item.id));
  const regular: TreasureSpec[] = rng.shuffle(raw).map((spec, index) => ({
    ...spec,
    id: 't' + index,
    itemId: items[index % items.length] as string,
  }));

  // 5. Секретный клад: появляется, только когда найдено всё остальное.
  const secret = placeSecret(rng, placed, solids, stream, width, height, startX, startY);
  regular.push(secret);
  return regular;
}

function placeSecret(
  rng: Rng,
  placed: readonly Placed[],
  solids: readonly Placed[],
  stream: readonly StreamPoint[],
  width: number,
  height: number,
  startX: number,
  startY: number,
): TreasureSpec {
  const margin = CONFIG.world.margin + 120;
  let best = { x: startX, y: startY + 300 };
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const x = rng.range(margin, width - margin);
    const y = rng.range(margin, height - margin);
    if (dist(x, y, startX, startY) < 500) continue;
    if (distanceToStream(stream, x, y) < 160) continue;
    if (!farEnough(placed, x, y, 300)) continue;
    if (!farEnough(solids, x, y, 170)) continue;
    best = { x, y };
    break;
  }
  return {
    id: 'secret',
    itemId: SECRET_ITEM_ID,
    kind: 'secret',
    x: best.x,
    y: best.y,
    crownX: best.x,
    crownY: best.y - 200,
    decorIndex: -1,
  };
}

/** Белки сидят под деревьями, подальше от старта и друг от друга. */
function placeSquirrels(
  rng: Rng,
  level: LevelSpec,
  decor: readonly DecorSpec[],
  treasures: readonly TreasureSpec[],
  startX: number,
  startY: number,
): StreamPoint[] {
  const spots: StreamPoint[] = [];
  const taken: Placed[] = treasures.map((t) => ({ x: t.x, y: t.y, radius: 0 }));
  const trees = rng.shuffle(decor.filter((spec) => spec.kind === 'tree'));
  for (const tree of trees) {
    if (spots.length >= level.squirrels) break;
    const x = tree.x + 70;
    const y = tree.y - 6;
    if (dist(x, y, startX, startY) < 500) continue;
    if (!farEnough(taken, x, y, 260)) continue;
    spots.push({ x, y });
    taken.push({ x, y, radius: 0 });
  }
  return spots;
}
