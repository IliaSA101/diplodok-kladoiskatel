import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX } from './keys';
import { SET_COLORS, SET_CROWN, TEXTURE_SETS, themeTexture } from './themes';
import type { TextureSetId, ThemeColors } from './themes';
import { makeRng } from '../systems/rng';
import type { Rng } from '../systems/rng';

/** Метаданные деревьев: нужны, чтобы диплодок тянул шею точно к кроне. */
export interface TreeMeta {
  width: number;
  height: number;
  /** Высота центра кроны над основанием ствола (в пикселях, вверх). */
  crownOffsetY: number;
  /** Радиус ствола у земли — для круглого коллайдера. */
  trunkRadius: number;
}

type Gfx = Phaser.GameObjects.Graphics;
type Pt = Phaser.Types.Math.Vector2Like;
/** Круг листвы: x, y, радиус. */
type Blob = readonly [number, number, number];
/** Ярус ёлки: Y основания яруса, половина ширины основания, высота яруса. */
type Tier = readonly [number, number, number];

/** Круглое лиственное дерево. */
interface RoundTreeSpec {
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
interface ConeTreeSpec {
  kind: 'cone';
  baseKey: string;
  w: number;
  h: number;
  trunkW: number;
  /** Ярусы сверху вниз; нижний — самый широкий. */
  tiers: readonly Tier[];
}

type TreeSpec = RoundTreeSpec | ConeTreeSpec;

/** Три круглых дерева: у каждого свой силуэт кроны. Низ картинки = основание ствола. */
const ROUND_SPECS: readonly TreeSpec[] = [
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
const CONE_SPECS: readonly TreeSpec[] = [
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

function specsFor(set: TextureSetId): readonly TreeSpec[] {
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

/** Свой seed у каждого набора; у лета он прежний, чтобы первый лес остался таким же. */
const SET_SEED: Record<TextureSetId, number> = {
  summer: 777,
  autumn: 4242,
  pine: 9091,
};

/** Центры цветков: у жёлтых лепестков центр темнее, иначе он слился бы с ними. */
const FLOWER_CENTERS: Record<TextureSetId, readonly [number, number, number]> = {
  summer: [PALETTE.flowerCenter, PALETTE.goldDark, PALETTE.flowerCenter],
  autumn: [PALETTE.goldDark, PALETTE.flowerCenter, PALETTE.flowerCenter],
  pine: [PALETTE.flowerCenter, PALETTE.flowerCenter, PALETTE.flowerCenter],
};

/** Поворот лепестков по цветкам. */
const FLOWER_ROT: readonly [number, number, number] = [0, 0.3, 0.6];

/** Запекает все текстуры декора для одного набора. Идемпотентно по набору. */
export function generateForestTextures(scene: Phaser.Scene, set: TextureSetId): void {
  bakeFallingLeaves(scene);
  if (scene.textures.exists(themeTexture(TEX.GROUND, set))) return;

  const c = SET_COLORS[set];
  const rng = makeRng(SET_SEED[set]);
  const key = (base: string): string => themeTexture(base, set);

  for (const spec of specsFor(set)) {
    bake(scene, key(spec.baseKey), spec.w, spec.h, (g) =>
      (spec.kind === 'cone' ? drawPine(g, spec, c) : drawTree(g, spec, c, rng)));
  }

  bake(scene, key(TEX.BUSH[0]), 150, 110, (g) =>
    drawBush(g, 150, 110, [[45, 64, 34], [106, 64, 36], [75, 50, 40], [76, 72, 30]], c));
  bake(scene, key(TEX.BUSH[1]), 190, 130, (g) =>
    drawBush(g, 190, 130, [[50, 78, 40], [138, 78, 42], [95, 62, 50], [95, 88, 34]], c));

  bake(scene, key(TEX.ROCK[0]), 130, 100, (g) => drawRock(g, 130, 100, 54, 38, c, rng));
  bake(scene, key(TEX.ROCK[1]), 170, 120, (g) => drawRock(g, 170, 120, 70, 46, c, rng));

  bake(scene, key(TEX.STUMP[0]), 120, 100, (g) => drawStump(g, 120, 100, c));

  const centers = FLOWER_CENTERS[set];
  for (let i = 0; i < TEX.FLOWER.length; i += 1) {
    const flowerKey = TEX.FLOWER[i];
    if (flowerKey === undefined) continue;
    const petal = c.flowers[i] ?? c.flowers[0] ?? PALETTE.flowerPink;
    const center = centers[i] ?? PALETTE.flowerCenter;
    const rot = FLOWER_ROT[i] ?? 0;
    bake(scene, key(flowerKey), 56, 70, (g) => drawFlower(g, c, petal, center, rot));
  }

  bake(scene, key(TEX.GRASS[0]), 64, 44, (g) =>
    drawGrassTuft(g, [
      [18, 8, 16, -6, c.groundShadow],
      [46, 56, 14, 6, c.groundShadow],
      [32, 27, 3, -4, c.groundDark],
      [32, 41, 9, 4, c.groundDark],
    ]));
  bake(scene, key(TEX.GRASS[1]), 64, 44, (g) =>
    drawGrassTuft(g, [
      [14, 6, 20, -4, c.groundShadow],
      [50, 58, 18, 4, c.groundShadow],
      [26, 19, 8, -5, c.groundDark],
      [38, 46, 6, 5, c.groundDark],
      [32, 32, 2, 3, c.groundShadow],
    ]));

  bake(scene, key(TEX.GROUND), 256, 256, (g) => drawGround(g, rng, c, set === 'autumn'));
}

/** Падающие листья — общие для всех наборов, запекаются один раз. */
function bakeFallingLeaves(scene: Phaser.Scene): void {
  const a = SET_COLORS.autumn;
  const [keyA, keyB] = TEX.FALLING_LEAF;

  // Рыжий лист 30x26: кончик вверх-вправо
  if (!scene.textures.exists(keyA)) {
    bake(scene, keyA, 30, 26, (g) => drawFallingLeaf(g, 15, 13, 24, 9, -0.6, a.leafMid, a.leafDark));
  }
  // Жёлтый лист 26x22: кончик вниз-вправо
  if (!scene.textures.exists(keyB)) {
    bake(scene, keyB, 26, 22, (g) => drawFallingLeaf(g, 13, 11, 20, 7.5, 0.55, a.leafLight, a.leafMid));
  }
}

/** Создаёт Graphics, рисует и запекает в текстуру. */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Gfx) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Мягкая тёмная тень на земле под объектом. */
function drawShadow(g: Gfx, c: ThemeColors, cx: number, cy: number, w: number, h: number, alpha = 0.4): void {
  g.fillStyle(c.groundShadow, alpha);
  g.fillEllipse(cx, cy, w, h);
}

/** Крона из кругов: сначала весь тёмный слой, потом средний, потом блики сверху-слева. */
function drawFoliage(g: Gfx, blobs: readonly Blob[], c: ThemeColors): void {
  g.fillStyle(c.leafDark, 1);
  for (const [x, y, r] of blobs) g.fillCircle(x, y, r);

  g.fillStyle(c.leafMid, 1);
  for (const [x, y, r] of blobs) g.fillCircle(x - r * 0.03, y - r * 0.1, r * 0.86);

  // Подсвечиваем только верхние круги, чтобы свет шёл сверху
  const avgY = blobs.reduce((sum, b) => sum + b[1], 0) / blobs.length;
  g.fillStyle(c.leafLight, 1);
  for (const [x, y, r] of blobs) {
    if (y <= avgY) g.fillCircle(x - r * 0.26, y - r * 0.3, r * 0.5);
  }
}

/** Ствол: слегка сужается кверху, у земли расширяется корнями; тень справа, блик слева. */
function drawTrunk(g: Gfx, c: ThemeColors, cx: number, base: number, top: number, tw: number, flareH: number): void {
  g.fillStyle(c.trunk, 1);
  g.fillPoints(
    [
      { x: cx - tw / 2, y: base },
      { x: cx + tw / 2, y: base },
      { x: cx + tw * 0.4, y: top },
      { x: cx - tw * 0.4, y: top },
    ],
    true,
  );
  g.fillEllipse(cx, base - 2, tw * 1.55, flareH);

  g.fillStyle(c.trunkDark, 0.6);
  g.fillPoints(
    [
      { x: cx + tw * 0.15, y: base },
      { x: cx + tw / 2, y: base },
      { x: cx + tw * 0.4, y: top },
      { x: cx + tw * 0.12, y: top },
    ],
    true,
  );
  g.fillStyle(c.trunkLight, 0.6);
  g.fillPoints(
    [
      { x: cx - tw * 0.38, y: base - 8 },
      { x: cx - tw * 0.18, y: base - 8 },
      { x: cx - tw * 0.16, y: top },
      { x: cx - tw * 0.32, y: top },
    ],
    true,
  );
}

function drawTree(g: Gfx, spec: RoundTreeSpec, c: ThemeColors, rng: Rng): void {
  const { w, h, trunkW: tw, crownCY, blobs } = spec;
  const cx = w / 2;
  const base = h - 12;
  const top = crownCY;

  drawShadow(g, c, cx, h - 14, tw * 3.6, 30);
  drawTrunk(g, c, cx, base, top, tw, 24);

  // Тёмные полоски коры: ширина 5px, чтобы не рябили
  g.fillStyle(c.trunkDark, 0.5);
  const stripeCount = 3;
  const span = base - top - 70;
  for (let i = 0; i < stripeCount; i += 1) {
    const sx = cx - tw * 0.22 + i * tw * 0.17 + rng.range(-2, 2);
    const sy = top + 60 + (span / stripeCount) * i + rng.range(0, 12);
    g.fillRoundedRect(sx, sy, 5, rng.range(34, 52), 2.5);
  }

  drawFoliage(g, blobs, c);
}

/**
 * Скруглённый треугольник: контур треугольника ABC со скруглёнными углами радиуса r.
 * Строится как сумма Минковского: уменьшенный треугольник + круги в углах + полосы вдоль сторон.
 */
function fillRoundedTri(g: Gfx, a: Pt, b: Pt, cc: Pt, r: number): void {
  const pts = [a, b, cc].map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
  const [pa, pb, pc] = pts;
  if (pa === undefined || pb === undefined || pc === undefined) return;

  const sa = Math.hypot(pb.x - pc.x, pb.y - pc.y);
  const sb = Math.hypot(pc.x - pa.x, pc.y - pa.y);
  const sc = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  const perim = sa + sb + sc;
  const ix = (sa * pa.x + sb * pb.x + sc * pc.x) / perim;
  const iy = (sa * pa.y + sb * pb.y + sc * pc.y) / perim;
  const area = Math.abs((pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y)) / 2;
  const inradius = area / (perim / 2);

  // Радиус скругления не должен превышать радиус вписанной окружности
  const rr = Math.min(r, inradius * 0.7);
  const k = (inradius - rr) / inradius;
  const v = pts.map((p) => ({ x: ix + (p.x - ix) * k, y: iy + (p.y - iy) * k }));

  g.fillPoints(v, true);
  for (let i = 0; i < 3; i += 1) {
    const p = v[i];
    const q = v[(i + 1) % 3];
    if (p === undefined || q === undefined) continue;
    g.fillCircle(p.x, p.y, rr);

    // Нормаль ребра, направленная наружу (от центра)
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey) || 1;
    let nx = ey / len;
    let ny = -ex / len;
    if (nx * ((p.x + q.x) / 2 - ix) + ny * ((p.y + q.y) / 2 - iy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    g.fillPoints(
      [
        { x: p.x, y: p.y },
        { x: q.x, y: q.y },
        { x: q.x + nx * rr, y: q.y + ny * rr },
        { x: p.x + nx * rr, y: p.y + ny * rr },
      ],
      true,
    );
  }
}

/** Ёлка: тонкий короткий ствол, ярусы рисуются снизу вверх, каждый — тёмный, средний и светлый слой. */
function drawPine(g: Gfx, spec: ConeTreeSpec, c: ThemeColors): void {
  const { w, h, trunkW: tw, tiers } = spec;
  const cx = w / 2;
  const base = h - 12;
  const bottom = tiers[tiers.length - 1];
  if (bottom === undefined) return;

  drawShadow(g, c, cx, h - 14, bottom[1] * 1.5, 30);
  // Ствол прячется внутри нижнего яруса
  drawTrunk(g, c, cx, base, bottom[0] - 24, tw, 18);

  for (let i = tiers.length - 1; i >= 0; i -= 1) {
    const tier = tiers[i];
    if (tier === undefined) continue;
    const [by, hw, th] = tier;
    const ay = by - th;

    g.fillStyle(c.leafDark, 1);
    fillRoundedTri(g, { x: cx, y: ay }, { x: cx - hw, y: by }, { x: cx + hw, y: by }, 10);

    // Средний слой приподнят: снизу остаётся тёмная кромка, ярус читается отдельно
    g.fillStyle(c.leafMid, 1);
    fillRoundedTri(
      g,
      { x: cx, y: ay + th * 0.1 },
      { x: cx - hw * 0.82, y: by - 9 },
      { x: cx + hw * 0.82, y: by - 9 },
      8,
    );

    // Блик на левой стороне — свет идёт сверху-слева
    g.fillStyle(c.leafLight, 1);
    fillRoundedTri(
      g,
      { x: cx - hw * 0.04, y: ay + th * 0.3 },
      { x: cx - hw * 0.66, y: by - 22 },
      { x: cx - hw * 0.08, y: by - 22 },
      6,
    );
  }
}

function drawBush(g: Gfx, w: number, h: number, blobs: readonly Blob[], c: ThemeColors): void {
  drawShadow(g, c, w / 2, h - 13, w * 0.92, 22);
  drawFoliage(g, blobs, c);
}

/** Валун: один и тот же скруглённый контур в трёх размерах/сдвигах даёт объём. */
function drawRock(g: Gfx, w: number, h: number, rx: number, ry: number, c: ThemeColors, rng: Rng): void {
  const cx = w / 2;
  const cy = h * 0.46;
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);

  const outline = (scale: number, dx: number, dy: number): Pt[] => {
    const pts: Pt[] = [];
    const n = 32;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const wobble = 1 + 0.07 * Math.sin(2 * a + p1) + 0.05 * Math.sin(3 * a + p2);
      const sinA = Math.sin(a);
      // Низ плоский: камень лежит на земле
      const flat = sinA > 0 ? 0.85 : 1;
      pts.push({
        x: cx + dx + Math.cos(a) * rx * wobble * scale,
        y: cy + dy + sinA * ry * wobble * flat * scale,
      });
    }
    return pts;
  };

  drawShadow(g, c, cx, h - 14, w * 0.9, 24);
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillPoints(outline(1, 0, 0), true);
  g.fillStyle(PALETTE.stone, 1);
  g.fillPoints(outline(0.9, -1, -ry * 0.1), true);
  g.fillStyle(PALETTE.stoneLight, 1);
  g.fillPoints(outline(0.5, -rx * 0.2, -ry * 0.38), true);
}

function drawStump(g: Gfx, w: number, h: number, c: ThemeColors): void {
  const cx = w / 2;
  drawShadow(g, c, cx, h - 12, 112, 20);

  // Боковина пенька
  g.fillStyle(c.trunk, 1);
  g.fillRect(cx - 40, 44, 80, 38);
  g.fillEllipse(cx, 82, 80, 26);
  g.fillStyle(c.trunkDark, 0.5);
  g.fillRoundedRect(cx + 14, 48, 6, 38, 3);
  g.fillRoundedRect(cx + 28, 48, 6, 30, 3);
  g.fillRoundedRect(cx - 18, 50, 5, 30, 2.5);
  g.fillStyle(c.trunkLight, 0.5);
  g.fillRoundedRect(cx - 34, 48, 6, 32, 3);

  // Спил сверху с двумя годовыми кольцами
  g.fillStyle(c.trunk, 1);
  g.fillEllipse(cx, 44, 84, 38);
  g.fillStyle(PALETTE.stumpTop, 1);
  g.fillEllipse(cx, 42, 74, 30);
  g.lineStyle(4, c.trunkLight, 1);
  g.strokeEllipse(cx, 42, 50, 19);
  g.strokeEllipse(cx, 42, 24, 9);
}

function drawFlower(g: Gfx, c: ThemeColors, petal: number, center: number, rot: number): void {
  const cx = 28;
  const cy = 24;

  // Стебель и листик
  g.fillStyle(c.leafMid, 1);
  g.fillRoundedRect(cx - 3, 30, 6, 38, 3);
  g.fillEllipse(cx + 11, 54, 18, 10);

  g.fillStyle(petal, 1);
  for (let i = 0; i < 5; i += 1) {
    const a = rot + (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillCircle(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 9.5);
  }
  g.fillStyle(center, 1);
  g.fillCircle(cx, cy, 7);
}

/** Лезвие травы — изогнутый сужающийся многоугольник (тонкой линией нельзя: будет рябить). */
function fillBlade(
  g: Gfx,
  bx: number, by: number,
  tx: number, ty: number,
  bend: number, baseW: number,
): void {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cxp = (bx + tx) / 2 + nx * bend;
  const cyp = (by + ty) / 2 + ny * bend;

  const steps = 10;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const px = u * u * bx + 2 * u * t * cxp + t * t * tx;
    const py = u * u * by + 2 * u * t * cyp + t * t * ty;
    const half = (baseW * (1 - t) + 1) / 2;
    left.push({ x: px + nx * half, y: py + ny * half });
    right.push({ x: px - nx * half, y: py - ny * half });
  }
  g.fillPoints([...left, ...right.reverse()], true);
}

/** Кустик травы: [x основания, x кончика, y кончика, изгиб, цвет]. */
function drawGrassTuft(
  g: Gfx,
  blades: ReadonlyArray<readonly [number, number, number, number, number]>,
): void {
  for (const [bx, tx, ty, bend, color] of blades) {
    g.fillStyle(color, 1);
    fillBlade(g, bx, 42, tx, ty, bend, 11);
  }
}

/**
 * Тело листа: заострённый с обоих концов, шире у основания.
 * Ось листа идёт от основания к кончику под углом angle, центр — (cx, cy).
 */
function fillLeafBody(g: Gfx, cx: number, cy: number, len: number, halfW: number, angle: number): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const bx = cx - dx * len / 2;
  const by = cy - dy * len / 2;

  const steps = 12;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const half = halfW * Math.sin(Math.PI * Math.pow(t, 0.75));
    const px = bx + dx * len * t;
    const py = by + dy * len * t;
    left.push({ x: px + nx * half, y: py + ny * half });
    right.push({ x: px - nx * half, y: py - ny * half });
  }
  g.fillPoints([...left, ...right.reverse()], true);
}

/** Падающий лист: тело, черешок и прожилка (линии по 4px). */
function drawFallingLeaf(
  g: Gfx,
  cx: number, cy: number,
  len: number, halfW: number,
  angle: number,
  color: number, veinColor: number,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const bx = cx - dx * len / 2;
  const by = cy - dy * len / 2;

  g.fillStyle(color, 1);
  fillLeafBody(g, cx, cy, len, halfW, angle);

  g.lineStyle(4, veinColor, 1);
  g.lineBetween(bx - dx * 3, by - dy * 3, bx + dx * len * 0.62, by + dy * len * 0.62);
}

/** Бесшовная плитка земли: всё, что касается края, рисуется ещё и со смещением ±размер. */
function drawGround(g: Gfx, rng: Rng, c: ThemeColors, fallenLeaves: boolean): void {
  const size = 256;
  g.fillStyle(c.groundBase, 1);
  g.fillRect(0, 0, size, size);

  const wrapped = (draw: (ox: number, oy: number) => void): void => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) draw(ox, oy);
    }
  };

  // Мягкие пятна: три вложенных полупрозрачных эллипса дают размытый край
  const rings: ReadonlyArray<readonly [number, number]> = [[1, 0.09], [0.78, 0.1], [0.55, 0.12]];
  for (let i = 0; i < 16; i += 1) {
    const color = i % 2 === 0 ? c.groundLight : c.groundDark;
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const rx = rng.range(34, 70);
    const ry = rng.range(22, 46);
    wrapped((ox, oy) => {
      for (const [k, alpha] of rings) {
        g.fillStyle(color, alpha);
        g.fillEllipse(x + ox, y + oy, rx * 2 * k, ry * 2 * k);
      }
    });
  }

  // Редкие короткие штрихи травы
  for (let i = 0; i < 28; i += 1) {
    const light = i % 3 === 0;
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const height = rng.range(18, 28);
    const lean = rng.range(-6, 6);
    const bend = rng.range(-5, 5);
    wrapped((ox, oy) => {
      g.fillStyle(light ? c.groundLight : c.groundDark, light ? 0.6 : 0.5);
      fillBlade(g, x + ox, y + oy, x + lean + ox, y - height + oy, bend, 6);
    });
  }

  // Осень: немного опавших листьев поверх травы
  if (fallenLeaves) {
    const colors = [c.leafLight, c.leafMid, c.leafDark];
    for (let i = 0; i < 12; i += 1) {
      const color = colors[i % colors.length] ?? c.leafMid;
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const angle = rng.range(0, Math.PI * 2);
      const len = rng.range(26, 34);
      const halfW = rng.range(7, 9);
      wrapped((ox, oy) => {
        g.fillStyle(color, 0.95);
        fillLeafBody(g, x + ox, y + oy, len, halfW, angle);
      });
    }
  }
}
