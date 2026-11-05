/**
 * Примитивы рисования процедурного арта: фигуры, контуры, блики, запекание.
 *
 * Здесь нет ни одного конкретного предмета — только то, из чего они собраны.
 * Значки лежат в footIcons.ts, наклейки в stickers.ts, сборка в football.ts.
 * Стиль общий с остальной игрой: яркие плоские цвета, толстый тёмный контур.
 */
import Phaser from 'phaser';
import { PALETTE } from './palette';

export type Gfx = Phaser.GameObjects.Graphics;

export interface Pt {
  x: number;
  y: number;
}

/** Точка ломаной с радиусом «трубки» вокруг неё. */
export interface TubePt extends Pt {
  r: number;
}

/** Радиус скругления: одно число или по углам. */
export type Radius = number | { tl: number; tr: number; bl: number; br: number };

/** Фигура, умеющая «раздуться» на grow px: из таких собирается контур. */
export type Shape = (g: Gfx, grow: number, color: number) => void;

/** Контур везде тёмно-коричневый, как у остальных картинок игры. */
export const OUTLINE = PALETTE.uiText;
/** Чисто белый — тот же, что у белка глаза диплодока. */
export const WHITE = PALETTE.dinoEyeWhite;
/** Толщина контура значков (px в системе 256x256). */
export const LW = 6;
/** Сторона листа значка и наклейки. */
export const ICON_SIZE = 256;

export const pt = (x: number, y: number): Pt => ({ x, y });

// ------------------------------------------------------------------- shapes

export const circ =
  (cx: number, cy: number, r: number): Shape =>
  (g, grow, color) => {
    g.fillStyle(color, 1);
    g.fillCircle(cx, cy, r + grow);
  };

export const ell =
  (cx: number, cy: number, w: number, h: number): Shape =>
  (g, grow, color) => {
    g.fillStyle(color, 1);
    g.fillEllipse(cx, cy, w + grow * 2, h + grow * 2);
  };

function grownRadius(r: Radius, k: number): Radius {
  if (typeof r === 'number') return r + k;
  return { tl: r.tl + k, tr: r.tr + k, bl: r.bl + k, br: r.br + k };
}

export const rr =
  (x: number, y: number, w: number, h: number, r: Radius): Shape =>
  (g, grow, color) => {
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - grow, y - grow, w + grow * 2, h + grow * 2, grownRadius(r, grow));
  };

/** Многоугольник; при росте края толстеют, а углы закругляются (круги в вершинах). */
export const poly =
  (pts: readonly Pt[]): Shape =>
  (g, grow, color) => {
    const list = pts.slice();
    g.fillStyle(color, 1);
    g.fillPoints(list, true);
    if (grow <= 0) return;
    g.lineStyle(grow * 2, color, 1);
    g.strokePoints(list, true);
    for (const p of list) g.fillCircle(p.x, p.y, grow);
  };

/** Толстая ломаная с круглыми концами; радиус может меняться вдоль пути. */
export const tube =
  (pts: readonly TubePt[]): Shape =>
  (g, grow, color) => {
    g.fillStyle(color, 1);
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1] ?? a;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.r + (b.r - a.r) * t + grow);
      }
    }
  };

/** Отрезок толщиной w с круглыми концами. */
export function capsule(x1: number, y1: number, x2: number, y2: number, w: number): Shape {
  return tube([
    { x: x1, y: y1, r: w / 2 },
    { x: x2, y: y2, r: w / 2 },
  ]);
}

/** Дуга Безье второго порядка в виде точек трубки; радиус плавно меняется от r0 к r1. */
export function quad(a: Pt, c: Pt, b: Pt, r0: number, r1: number, n = 12): TubePt[] {
  const out: TubePt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      r: r0 + (r1 - r0) * t,
    });
  }
  return out;
}

/** Точки окружности (или её дуги) для трубки. Углы в радианах. */
export function arcPoints(cx: number, cy: number, rad: number, from: number, to: number, r: number, n = 14): TubePt[] {
  const out: TubePt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = from + ((to - from) * i) / n;
    out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, r });
  }
  return out;
}

/** Правильная звезда (или многоугольник, если inner == outer) с вершиной вверх + поворот rot. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, tips: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < tips * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / tips;
    pts.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

export function pentagon(cx: number, cy: number, r: number, rot: number): Pt[] {
  return starPoints(cx, cy, r, r, 5, rot).filter((_, i) => i % 2 === 0);
}

// ------------------------------------------------------------------ helpers

/** Запечь текстуру, если такого ключа ещё нет (позже поверх могут лечь настоящие PNG). */
export function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Gfx) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Фигуры с тёмным контуром: сначала все раздутые контуры, затем заливка — детали сливаются в один силуэт. */
export function solid(g: Gfx, shapes: readonly Shape[], fill: number, ow: number = LW): void {
  for (const s of shapes) s(g, ow, OUTLINE);
  for (const s of shapes) s(g, 0, fill);
}

/** Закрасить фигуры без контура (детали поверх уже нарисованного). */
export function paint(g: Gfx, shapes: readonly Shape[], color: number, grow = 0): void {
  for (const s of shapes) s(g, grow, color);
}

/** Мягкий белый блик. */
export function shine(g: Gfx, x: number, y: number, w: number, h: number, alpha = 0.5): void {
  g.fillStyle(WHITE, alpha);
  g.fillEllipse(x, y, w, h);
}

/** Тёмная линия с круглыми концами (для швов и делений). */
export function ink(g: Gfx, x1: number, y1: number, x2: number, y2: number, w: number, color: number = OUTLINE): void {
  paint(g, [capsule(x1, y1, x2, y2, w)], color);
}

/** Нарисовать draw в локальных координатах: сдвиг (ox, oy) и масштаб s. */
export function place(g: Gfx, ox: number, oy: number, s: number, draw: (g: Gfx) => void): void {
  g.save();
  g.translateCanvas(ox, oy);
  g.scaleCanvas(s, s);
  draw(g);
  g.restore();
}

/** Поставить значок 256x256 центром в (cx, cy) с масштабом s. */
export function stamp(g: Gfx, cx: number, cy: number, s: number, draw: (g: Gfx) => void): void {
  place(g, cx - (ICON_SIZE / 2) * s, cy - (ICON_SIZE / 2) * s, s, draw);
}

/** Диагональная сетка внутри прямоугольника (обе диагонали), концы линий обрезаны по краям. */
export function mesh(g: Gfx, x: number, y: number, w: number, h: number, step: number, lw: number, color: number): void {
  g.lineStyle(lw, color, 1);
  for (let d = -h; d <= w + h; d += step) {
    // «\»: из (x+d, y) вниз-вправо; «/»: из (x+d+h, y) вниз-влево.
    const slants: Array<[number, number]> = [
      [d, 1],
      [d + h, -1],
    ];
    for (const [off, dir] of slants) {
      const lo = Math.max(0, dir > 0 ? -off / h : (off - w) / h);
      const hi = Math.min(1, dir > 0 ? (w - off) / h : off / h);
      if (lo >= hi) continue;
      g.lineBetween(x + off + dir * h * lo, y + h * lo, x + off + dir * h * hi, y + h * hi);
    }
  }
}
