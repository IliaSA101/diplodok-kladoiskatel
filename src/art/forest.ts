import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX } from './keys';
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

interface TreeSpec {
  key: string;
  w: number;
  h: number;
  /** Ширина ствола у земли. */
  trunkW: number;
  /** Y центра кроны от верха картинки. */
  crownCY: number;
  blobs: readonly Blob[];
}

/** Три дерева: у каждого свой силуэт кроны. Низ картинки = основание ствола. */
const TREE_SPECS: readonly TreeSpec[] = [
  {
    key: TEX.TREE[0], w: 230, h: 330, trunkW: 38, crownCY: 125,
    blobs: [[115, 112, 80], [65, 142, 60], [165, 142, 60], [90, 76, 55], [145, 76, 55]],
  },
  {
    key: TEX.TREE[1], w: 265, h: 385, trunkW: 46, crownCY: 140,
    blobs: [[132, 135, 92], [75, 172, 68], [190, 172, 68], [100, 86, 62], [165, 86, 62], [132, 72, 50]],
  },
  {
    key: TEX.TREE[2], w: 205, h: 295, trunkW: 34, crownCY: 105,
    blobs: [[102, 100, 70], [58, 130, 52], [147, 130, 52], [102, 62, 46]],
  },
];

/** Заполняется по спецификациям: ключ текстуры -> метаданные. */
export const TREE_META: Record<string, TreeMeta> = {};
for (const spec of TREE_SPECS) {
  TREE_META[spec.key] = {
    width: spec.w,
    height: spec.h,
    crownOffsetY: spec.h - spec.crownCY,
    trunkRadius: Math.round(spec.trunkW * 0.55),
  };
}

/** Создаёт все текстуры декора леса. Вызывается один раз в BootScene. */
export function generateForestTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.GROUND)) return;
  const rng = makeRng(777);

  for (const spec of TREE_SPECS) {
    bake(scene, spec.key, spec.w, spec.h, (g) => drawTree(g, spec, rng));
  }

  bake(scene, TEX.BUSH[0], 150, 110, (g) =>
    drawBush(g, 150, 110, [[45, 64, 34], [106, 64, 36], [75, 50, 40], [76, 72, 30]]));
  bake(scene, TEX.BUSH[1], 190, 130, (g) =>
    drawBush(g, 190, 130, [[50, 78, 40], [138, 78, 42], [95, 62, 50], [95, 88, 34]]));

  bake(scene, TEX.ROCK[0], 130, 100, (g) => drawRock(g, 130, 100, 54, 38, rng));
  bake(scene, TEX.ROCK[1], 170, 120, (g) => drawRock(g, 170, 120, 70, 46, rng));

  bake(scene, TEX.STUMP[0], 120, 100, (g) => drawStump(g, 120, 100));

  bake(scene, TEX.FLOWER[0], 56, 70, (g) => drawFlower(g, PALETTE.flowerPink, PALETTE.flowerCenter, 0));
  // Жёлтый цветок: центр flowerCenter слился бы с лепестками, поэтому центр золотистый потемнее
  bake(scene, TEX.FLOWER[1], 56, 70, (g) => drawFlower(g, PALETTE.flowerYellow, PALETTE.goldDark, 0.3));
  bake(scene, TEX.FLOWER[2], 56, 70, (g) => drawFlower(g, PALETTE.flowerBlue, PALETTE.flowerCenter, 0.6));

  bake(scene, TEX.GRASS[0], 64, 44, (g) =>
    drawGrassTuft(g, [
      [18, 8, 16, -6, PALETTE.grassShadow],
      [46, 56, 14, 6, PALETTE.grassShadow],
      [32, 27, 3, -4, PALETTE.grassDark],
      [32, 41, 9, 4, PALETTE.grassDark],
    ]));
  bake(scene, TEX.GRASS[1], 64, 44, (g) =>
    drawGrassTuft(g, [
      [14, 6, 20, -4, PALETTE.grassShadow],
      [50, 58, 18, 4, PALETTE.grassShadow],
      [26, 19, 8, -5, PALETTE.grassDark],
      [38, 46, 6, 5, PALETTE.grassDark],
      [32, 32, 2, 3, PALETTE.grassShadow],
    ]));

  bake(scene, TEX.GROUND, 256, 256, (g) => drawGround(g, rng));
}

/** Создаёт Graphics, рисует и запекает в текстуру. */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Gfx) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Мягкая тёмная тень на земле под объектом. */
function drawShadow(g: Gfx, cx: number, cy: number, w: number, h: number, alpha = 0.4): void {
  g.fillStyle(PALETTE.grassShadow, alpha);
  g.fillEllipse(cx, cy, w, h);
}

/** Крона из кругов: сначала весь тёмный слой, потом средний, потом блики сверху-слева. */
function drawFoliage(g: Gfx, blobs: readonly Blob[]): void {
  g.fillStyle(PALETTE.leafDark, 1);
  for (const [x, y, r] of blobs) g.fillCircle(x, y, r);

  g.fillStyle(PALETTE.leafMid, 1);
  for (const [x, y, r] of blobs) g.fillCircle(x - r * 0.03, y - r * 0.1, r * 0.86);

  // Подсвечиваем только верхние круги, чтобы свет шёл сверху
  const avgY = blobs.reduce((sum, b) => sum + b[1], 0) / blobs.length;
  g.fillStyle(PALETTE.leafLight, 1);
  for (const [x, y, r] of blobs) {
    if (y <= avgY) g.fillCircle(x - r * 0.26, y - r * 0.3, r * 0.5);
  }
}

function drawTree(g: Gfx, spec: TreeSpec, rng: Rng): void {
  const { w, h, trunkW: tw, crownCY, blobs } = spec;
  const cx = w / 2;
  const base = h - 12;
  const top = crownCY;

  drawShadow(g, cx, h - 14, tw * 3.6, 30);

  // Ствол слегка сужается кверху, у земли расширяется корнями
  g.fillStyle(PALETTE.trunk, 1);
  g.fillPoints(
    [
      { x: cx - tw / 2, y: base },
      { x: cx + tw / 2, y: base },
      { x: cx + tw * 0.4, y: top },
      { x: cx - tw * 0.4, y: top },
    ],
    true,
  );
  g.fillEllipse(cx, base - 2, tw * 1.55, 24);

  // Тень справа и блик слева
  g.fillStyle(PALETTE.trunkDark, 0.6);
  g.fillPoints(
    [
      { x: cx + tw * 0.15, y: base },
      { x: cx + tw / 2, y: base },
      { x: cx + tw * 0.4, y: top },
      { x: cx + tw * 0.12, y: top },
    ],
    true,
  );
  g.fillStyle(PALETTE.trunkLight, 0.6);
  g.fillPoints(
    [
      { x: cx - tw * 0.38, y: base - 8 },
      { x: cx - tw * 0.18, y: base - 8 },
      { x: cx - tw * 0.16, y: top },
      { x: cx - tw * 0.32, y: top },
    ],
    true,
  );

  // Тёмные полоски коры: ширина 5px, чтобы не рябили
  g.fillStyle(PALETTE.trunkDark, 0.5);
  const stripeCount = 3;
  const span = base - top - 70;
  for (let i = 0; i < stripeCount; i += 1) {
    const sx = cx - tw * 0.22 + i * tw * 0.17 + rng.range(-2, 2);
    const sy = top + 60 + (span / stripeCount) * i + rng.range(0, 12);
    g.fillRoundedRect(sx, sy, 5, rng.range(34, 52), 2.5);
  }

  drawFoliage(g, blobs);
}

function drawBush(g: Gfx, w: number, h: number, blobs: readonly Blob[]): void {
  drawShadow(g, w / 2, h - 13, w * 0.92, 22);
  drawFoliage(g, blobs);
}

/** Валун: один и тот же скруглённый контур в трёх размерах/сдвигах даёт объём. */
function drawRock(g: Gfx, w: number, h: number, rx: number, ry: number, rng: Rng): void {
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

  drawShadow(g, cx, h - 14, w * 0.9, 24);
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillPoints(outline(1, 0, 0), true);
  g.fillStyle(PALETTE.stone, 1);
  g.fillPoints(outline(0.9, -1, -ry * 0.1), true);
  g.fillStyle(PALETTE.stoneLight, 1);
  g.fillPoints(outline(0.5, -rx * 0.2, -ry * 0.38), true);
}

function drawStump(g: Gfx, w: number, h: number): void {
  const cx = w / 2;
  drawShadow(g, cx, h - 12, 112, 20);

  // Боковина пенька
  g.fillStyle(PALETTE.trunk, 1);
  g.fillRect(cx - 40, 44, 80, 38);
  g.fillEllipse(cx, 82, 80, 26);
  g.fillStyle(PALETTE.trunkDark, 0.5);
  g.fillRoundedRect(cx + 14, 48, 6, 38, 3);
  g.fillRoundedRect(cx + 28, 48, 6, 30, 3);
  g.fillRoundedRect(cx - 18, 50, 5, 30, 2.5);
  g.fillStyle(PALETTE.trunkLight, 0.5);
  g.fillRoundedRect(cx - 34, 48, 6, 32, 3);

  // Спил сверху с двумя годовыми кольцами
  g.fillStyle(PALETTE.trunk, 1);
  g.fillEllipse(cx, 44, 84, 38);
  g.fillStyle(PALETTE.stumpTop, 1);
  g.fillEllipse(cx, 42, 74, 30);
  g.lineStyle(4, PALETTE.trunkLight, 1);
  g.strokeEllipse(cx, 42, 50, 19);
  g.strokeEllipse(cx, 42, 24, 9);
}

function drawFlower(g: Gfx, petal: number, center: number, rot: number): void {
  const cx = 28;
  const cy = 24;

  // Стебель и листик
  g.fillStyle(PALETTE.leafMid, 1);
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

/** Бесшовная плитка земли: всё, что касается края, рисуется ещё и со смещением ±размер. */
function drawGround(g: Gfx, rng: Rng): void {
  const size = 256;
  g.fillStyle(PALETTE.grassMid, 1);
  g.fillRect(0, 0, size, size);

  const wrapped = (draw: (ox: number, oy: number) => void): void => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) draw(ox, oy);
    }
  };

  // Мягкие пятна: три вложенных полупрозрачных эллипса дают размытый край
  const rings: ReadonlyArray<readonly [number, number]> = [[1, 0.09], [0.78, 0.1], [0.55, 0.12]];
  for (let i = 0; i < 16; i += 1) {
    const color = i % 2 === 0 ? PALETTE.grassLight : PALETTE.grassDark;
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
      g.fillStyle(light ? PALETTE.grassLight : PALETTE.grassDark, light ? 0.6 : 0.5);
      fillBlade(g, x + ox, y + oy, x + lean + ox, y - height + oy, bend, 6);
    });
  }
}
