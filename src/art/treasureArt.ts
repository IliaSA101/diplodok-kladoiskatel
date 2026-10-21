import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX, itemTexture } from './keys';
import { TREASURES } from '../data/treasures';
import { makeRng } from '../systems/rng';

type Gfx = Phaser.GameObjects.Graphics;

interface Pt {
  x: number;
  y: number;
}

const OUTLINE = PALETTE.uiText;
const WHITE = 0xffffff;
const ITEM_SIZE = 256;

/** Размер сундука: у обеих текстур он одинаковый, чтобы смена кадра не дёргала спрайт. */
const CHEST_W = 200;
const CHEST_H = 190;
/** Корпус сундука: верхняя кромка и высота (низ = земля у нижнего края картинки). */
const BODY_X = 20;
const BODY_Y = 98;
const BODY_W = 160;
const BODY_H = 82;
/** Полукруглая крышка: центр по X, радиусы дуги. */
const LID_CX = 100;
const LID_RX = 80;
const LID_RY = 66;

const pt = (x: number, y: number): Pt => ({ x, y });

/** Нарисовать что-то в Graphics и запечь в текстуру. */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Gfx) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function starPoints(cx: number, cy: number, outer: number, inner: number, tips: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < tips * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / tips;
    pts.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

/** Белая четырёхлучевая искорка. */
function sparkle(g: Gfx, x: number, y: number, r: number): void {
  g.fillStyle(WHITE, 0.95);
  g.fillPoints(starPoints(x, y, r, r * 0.28, 4), true);
}

// ----------------------------------------------------------------- chest

/** Высота верхней точки дуги крышки над координатой x. */
function lidTopY(x: number): number {
  const d = (x - LID_CX) / LID_RX;
  return BODY_Y - LID_RY * Math.sqrt(Math.max(0, 1 - d * d));
}

/** Контур крышки: дуга слева направо поверх корпуса. */
function lidPoints(): Pt[] {
  const pts: Pt[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const a = Math.PI + (Math.PI * i) / steps;
    pts.push(pt(LID_CX + Math.cos(a) * LID_RX, BODY_Y + Math.sin(a) * LID_RY));
  }
  return pts;
}

/** Золотая полоса на выпуклой крышке (верх повторяет дугу). */
function lidBand(g: Gfx, x1: number, x2: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const x = x1 + ((x2 - x1) * i) / 6;
    pts.push(pt(x, lidTopY(x)));
  }
  pts.push(pt(x2, BODY_Y), pt(x1, BODY_Y));
  g.fillStyle(PALETTE.chestMetal, 1);
  g.fillPoints(pts, true);
  g.lineStyle(4, OUTLINE, 1);
  g.strokePoints(pts, true);
}

/** Золотая вертикальная полоса на корпусе. */
function bodyBand(g: Gfx, x: number): void {
  g.fillStyle(PALETTE.chestMetal, 1);
  g.fillRoundedRect(x, BODY_Y, 24, BODY_H, 4);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeRoundedRect(x, BODY_Y, 24, BODY_H, 4);
}

/** Замочек с замочной скважиной. */
function lock(g: Gfx, y: number, h: number): void {
  g.fillStyle(PALETTE.chestMetal, 1);
  g.fillRoundedRect(84, y, 32, h, 8);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeRoundedRect(84, y, 32, h, 8);
  const cy = y + h * 0.42;
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(100, cy, 6);
  g.fillRect(97, cy, 6, 12);
}

/** Тень на земле и корпус — одинаковые у закрытого и открытого сундука. */
function drawChestBody(g: Gfx): void {
  g.fillStyle(OUTLINE, 0.16);
  g.fillEllipse(100, CHEST_H - 9, 178, 20);
  g.fillStyle(PALETTE.chestWood, 1);
  g.fillRoundedRect(BODY_X, BODY_Y, BODY_W, BODY_H, 10);
  g.lineStyle(6, OUTLINE, 1);
  g.strokeRoundedRect(BODY_X, BODY_Y, BODY_W, BODY_H, 10);
  // Стык досок
  g.lineStyle(5, PALETTE.chestWoodDark, 1);
  g.lineBetween(BODY_X + 6, 140, BODY_X + BODY_W - 6, 140);
  bodyBand(g, 38);
  bodyBand(g, 138);
}

function drawChestClosed(g: Gfx): void {
  drawChestBody(g);
  // Крышка
  const lid = lidPoints();
  g.fillStyle(PALETTE.chestWood, 1);
  g.fillPoints(lid, true);
  g.fillStyle(WHITE, 0.2);
  g.fillEllipse(66, 60, 52, 20);
  lidBand(g, 38, 62);
  lidBand(g, 138, 162);
  g.lineStyle(6, OUTLINE, 1);
  g.strokePoints(lid, true);
  // Золотой ободок по стыку крышки и корпуса
  g.fillStyle(PALETTE.chestMetal, 1);
  g.fillRoundedRect(16, 90, 168, 16, 6);
  g.lineStyle(5, OUTLINE, 1);
  g.strokeRoundedRect(16, 90, 168, 16, 6);
  lock(g, 88, 42);
}

function drawChestOpen(g: Gfx): void {
  // Крышка откинута назад: видна её внутренняя сторона
  g.fillStyle(OUTLINE, 0.16);
  g.fillEllipse(100, CHEST_H - 9, 178, 20);
  g.fillStyle(PALETTE.chestWoodDark, 1);
  g.fillRoundedRect(28, 8, 144, 96, 22);
  g.lineStyle(6, OUTLINE, 1);
  g.strokeRoundedRect(28, 8, 144, 96, 22);
  g.fillStyle(PALETTE.chestWood, 0.55);
  g.fillRoundedRect(44, 22, 112, 70, 14);
  for (const x of [38, 138]) {
    g.fillStyle(PALETTE.chestMetal, 1);
    g.fillRect(x, 10, 24, 90);
    g.lineStyle(4, OUTLINE, 1);
    g.strokeRect(x, 10, 24, 90);
  }
  drawChestBody(g);
  // Открытая горловина: тёмное нутро и золотое сияние
  g.fillStyle(PALETTE.chestWoodDark, 1);
  g.fillEllipse(100, 100, 150, 32);
  g.lineStyle(6, OUTLINE, 1);
  g.strokeEllipse(100, 100, 150, 32);
  g.fillStyle(PALETTE.gold, 1);
  g.fillEllipse(100, 102, 124, 18);
  // Горка монет
  const coins: Array<[number, number, number]> = [
    [68, 97, 15],
    [132, 97, 15],
    [100, 89, 18],
  ];
  for (const [x, y, r] of coins) {
    g.fillStyle(PALETTE.gold, 1);
    g.fillCircle(x, y, r);
    g.lineStyle(4, PALETTE.goldDark, 1);
    g.strokeCircle(x, y, r);
    g.strokeCircle(x, y, r * 0.5);
  }
  // Тёплое свечение над сундуком
  g.fillStyle(PALETTE.gold, 0.28);
  g.fillEllipse(100, 82, 150, 70);
  g.fillStyle(PALETTE.gold, 0.25);
  g.fillEllipse(100, 66, 96, 66);
  // Блики
  sparkle(g, 58, 64, 12);
  sparkle(g, 140, 44, 16);
  sparkle(g, 108, 68, 10);
  lock(g, 112, 30);
}

// --------------------------------------------------------------- effects

/** Пятно рыхлой земли: овал с комочками по кругу. */
function drawDigSpot(g: Gfx): void {
  const rng = makeRng(7101);
  const cx = 85;
  const cy = 50;
  g.fillStyle(PALETTE.soil, 1);
  g.fillEllipse(cx, cy, 160, 80);
  g.lineStyle(5, PALETTE.soilDark, 1);
  g.strokeEllipse(cx, cy, 160, 80);
  g.fillStyle(PALETTE.soilDark, 0.4);
  g.fillEllipse(cx, cy, 108, 48);
  // Комочки: часть по кругу, часть внутри
  const lumps = 16;
  for (let i = 0; i < lumps; i += 1) {
    const a = (i / lumps) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const inner = i % 4 === 3;
    const k = inner ? rng.range(0.35, 0.6) : rng.range(0.86, 0.96);
    const r = rng.range(5, 10);
    const x = cx + Math.cos(a) * 70 * k;
    const y = cy + Math.sin(a) * 31 * k;
    g.fillStyle(PALETTE.soilDark, 1);
    g.fillCircle(x, y + 1, r + 2);
    g.fillStyle(rng.chance(0.5) ? PALETTE.soilLight : PALETTE.soil, 1);
    g.fillCircle(x, y, r);
  }
}

/** Комочек земли — частица разлетающейся земли. */
function drawDirtChunk(g: Gfx): void {
  g.fillStyle(PALETTE.soilDark, 1);
  g.fillCircle(13, 14, 12);
  g.fillStyle(PALETTE.soil, 1);
  g.fillCircle(13, 13, 9.5);
  g.fillStyle(PALETTE.soilLight, 1);
  g.fillCircle(9.5, 9.5, 3.5);
}

/** Искорка: белая четырёхлучевая звёздочка с жёлтым ядром. */
function drawSparkle(g: Gfx): void {
  g.fillStyle(PALETTE.gold, 0.7);
  g.fillPoints(starPoints(18, 18, 17.5, 5.5, 4), true);
  g.fillStyle(WHITE, 1);
  g.fillPoints(starPoints(18, 18, 15, 4.5, 4), true);
  g.fillStyle(PALETTE.hintStar, 1);
  g.fillCircle(18, 18, 4.5);
}

/** Звезда «горячо-холодно»: жёлтая, с толстым золотистым контуром. */
function drawStar(g: Gfx): void {
  const pts = starPoints(36, 39, 27, 13, 5);
  g.fillStyle(PALETTE.hintStar, 1);
  g.fillPoints(pts, true);
  g.lineStyle(6, PALETTE.goldDark, 1);
  g.strokePoints(pts, true);
  g.fillStyle(WHITE, 0.6);
  g.fillCircle(28, 29, 4);
}

/** Мягкое круглое свечение: концентрические белые круги, к краю всё прозрачнее. */
function drawGlow(g: Gfx): void {
  const rings = 16;
  const maxR = 80;
  for (let i = 0; i < rings; i += 1) {
    const t = i / (rings - 1);
    g.fillStyle(WHITE, 0.22 * t);
    g.fillCircle(maxR, maxR, maxR * (1 - i / rings));
  }
}

/** Конфетти: квадратик, кружок и полосочка. */
function drawConfetti(index: number): (g: Gfx) => void {
  return (g) => {
    const color = PALETTE.confetti[index] ?? PALETTE.confetti[0];
    g.fillStyle(color, 1);
    if (index === 0) {
      g.fillRoundedRect(4, 4, 18, 18, 3);
    } else if (index === 1) {
      g.fillCircle(13, 13, 9);
    } else {
      g.fillRoundedRect(9, 1, 8, 24, 4);
    }
  };
}

// ---------------------------------------------------------------- public

/** Текстуры сундука, эффектов и всех предметов каталога. Один раз в BootScene. */
export function generateTreasureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.CHEST_CLOSED)) return;

  bake(scene, TEX.CHEST_CLOSED, CHEST_W, CHEST_H, drawChestClosed);
  bake(scene, TEX.CHEST_OPEN, CHEST_W, CHEST_H, drawChestOpen);
  bake(scene, TEX.DIG_SPOT, 170, 95, drawDigSpot);
  bake(scene, TEX.DIRT_CHUNK, 26, 26, drawDirtChunk);
  bake(scene, TEX.SPARKLE, 36, 36, drawSparkle);
  bake(scene, TEX.STAR, 72, 72, drawStar);
  bake(scene, TEX.GLOW, 160, 160, drawGlow);
  TEX.CONFETTI.forEach((key, index) => {
    bake(scene, key, 26, 26, drawConfetti(index));
  });

  for (const item of TREASURES) {
    bake(scene, itemTexture(item.id), ITEM_SIZE, ITEM_SIZE, (g) => {
      item.draw(g, ITEM_SIZE);
    });
  }
}
