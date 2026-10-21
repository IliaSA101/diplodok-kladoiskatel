import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX } from './keys';

type Gfx = Phaser.GameObjects.Graphics;
type Pt = Phaser.Types.Math.Vector2Like;

/** Цвета белки: в общей палитре их нет. */
const SQUIRREL_FUR = 0xd9803f;
const SQUIRREL_FUR_DARK = 0xb35f2a;
const SQUIRREL_FUR_LIGHT = 0xeaa064;

/** Создаёт текстуры бабочек, светлячка, белки и стрелки-указателя. Идемпотентно. */
export function generateCritterTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.SQUIRREL)) return;

  bake(scene, TEX.BUTTERFLY[0], 44, 36, (g) => drawButterfly(g, PALETTE.flowerPink));
  bake(scene, TEX.BUTTERFLY[1], 44, 36, (g) => drawButterfly(g, PALETTE.flowerYellow));
  bake(scene, TEX.BUTTERFLY[2], 44, 36, (g) => drawButterfly(g, PALETTE.flowerBlue));
  bake(scene, TEX.FIREFLY, 28, 28, drawFirefly);
  bake(scene, TEX.SQUIRREL, 90, 96, drawSquirrel);
  bake(scene, TEX.SQUIRREL_ARROW, 96, 52, drawArrow);
}

/** Создаёт Graphics, рисует и запекает в текстуру. */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Gfx) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Многоугольник-эллипс с поворотом (у Graphics нет повёрнутых эллипсов). */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rot: number): Pt[] {
  const pts: Pt[] = [];
  const n = 24;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    pts.push({ x: cx + ex * cr - ey * sr, y: cy + ex * sr + ey * cr });
  }
  return pts;
}

/** Крыло с тёмной обводкой: сначала крупнее тёмным, потом цветом. */
function fillWing(g: Gfx, cx: number, cy: number, rx: number, ry: number, rot: number, color: number): void {
  g.fillStyle(PALETTE.uiText, 1);
  g.fillPoints(ellipsePoints(cx, cy, rx + 1.8, ry + 1.8, rot), true);
  g.fillStyle(color, 1);
  g.fillPoints(ellipsePoints(cx, cy, rx, ry, rot), true);
}

/** Бабочка с раскрытыми крыльями; взмах сцена делает сжатием по X. */
function drawButterfly(g: Gfx, color: number): void {
  const mid = 22;

  // Нижние крылья рисуем первыми — верхние их частично перекрывают
  for (const side of [-1, 1]) {
    fillWing(g, mid + side * 9, 26, 7.5, 6.5, side * 0.5, color);
  }
  for (const side of [-1, 1]) {
    fillWing(g, mid + side * 10.5, 13, 10, 8.5, side * -0.45, color);
  }

  // Светлые пятнышки на верхних крыльях
  g.fillStyle(PALETTE.flowerWhite, 0.8);
  for (const side of [-1, 1]) {
    g.fillCircle(mid + side * 12, 11, 3.4);
    g.fillCircle(mid + side * 8, 25, 2.2);
  }

  // Усики
  g.lineStyle(2, PALETTE.uiText, 1);
  g.lineBetween(mid - 1, 9, mid - 6, 2);
  g.lineBetween(mid + 1, 9, mid + 6, 2);
  g.fillStyle(PALETTE.uiText, 1);
  g.fillCircle(mid - 6, 2.5, 1.8);
  g.fillCircle(mid + 6, 2.5, 1.8);

  // Тельце и головка
  g.fillEllipse(mid, 20, 5.5, 20);
  g.fillCircle(mid, 10, 3.4);
}

/** Светлячок: яркое ядро в мягком ореоле. */
function drawFirefly(g: Gfx): void {
  const c = 14;
  const rings: ReadonlyArray<readonly [number, number]> = [
    [14, 0.07], [12, 0.1], [10, 0.14], [8, 0.2], [6.5, 0.3],
  ];
  g.fillStyle(0xfff2a0, 1);
  for (const [r, a] of rings) {
    g.fillStyle(0xfff2a0, a);
    g.fillCircle(c, c, r);
  }
  g.fillStyle(0xfffbc8, 1);
  g.fillCircle(c, c, 4.6);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(c, c, 2.6);
}

/** Белка сидит боком, мордой вправо; хвост дугой вверх за спиной. */
function drawSquirrel(g: Gfx): void {
  // Тень на земле
  g.fillStyle(PALETTE.grassShadow, 0.4);
  g.fillEllipse(46, 90, 74, 12);

  // Хвост: цепочка кругов вдоль кривой Безье, сначала тёмный слой, потом основной
  const tailCurve = new Phaser.Curves.CubicBezier(
    new Phaser.Math.Vector2(32, 84),
    new Phaser.Math.Vector2(12, 84),
    new Phaser.Math.Vector2(10, 34),
    new Phaser.Math.Vector2(32, 12),
  );
  const steps = 14;
  const p = new Phaser.Math.Vector2();
  const layers: ReadonlyArray<readonly [number, number, number]> = [
    [SQUIRREL_FUR_DARK, 3, 1],
    [SQUIRREL_FUR, 0, 1],
    [SQUIRREL_FUR_LIGHT, -7, 0.85],
  ];
  for (const [color, grow, scale] of layers) {
    g.fillStyle(color, 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      tailCurve.getPoint(t, p);
      const r = (9 + 8 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * scale + grow;
      if (r > 1) g.fillCircle(p.x - (grow < 0 ? 2 : 0), p.y, r);
    }
  }

  // Задняя лапа
  g.fillStyle(SQUIRREL_FUR_DARK, 1);
  g.fillEllipse(42, 88, 30, 11);

  // Тело (тёмное, затем светлее поверх)
  g.fillStyle(SQUIRREL_FUR_DARK, 1);
  g.fillEllipse(46, 64, 44, 56);
  g.fillStyle(SQUIRREL_FUR, 1);
  g.fillEllipse(45, 62, 40, 52);

  // Светлое брюшко
  g.fillStyle(PALETTE.flowerWhite, 1);
  g.fillEllipse(55, 66, 20, 36);

  // Передние лапки у груди
  g.fillStyle(SQUIRREL_FUR_DARK, 1);
  g.fillEllipse(62, 70, 16, 11);
  g.fillStyle(SQUIRREL_FUR, 1);
  g.fillEllipse(62, 69, 13, 8);

  // Уши с кисточками
  g.fillStyle(SQUIRREL_FUR_DARK, 1);
  g.fillTriangle(46, 30, 50, 8, 60, 28);
  g.fillTriangle(58, 28, 66, 8, 72, 30);
  g.fillStyle(SQUIRREL_FUR, 1);
  g.fillTriangle(49, 28, 51, 13, 58, 27);
  g.fillTriangle(61, 27, 66, 13, 70, 28);
  g.fillStyle(PALETTE.uiText, 1);
  g.fillEllipse(50, 6, 5, 9);
  g.fillEllipse(66, 6, 5, 9);

  // Голова и мордочка
  g.fillStyle(SQUIRREL_FUR_DARK, 1);
  g.fillCircle(60, 40, 19);
  g.fillEllipse(74, 45, 16, 13);
  g.fillStyle(SQUIRREL_FUR, 1);
  g.fillCircle(60, 40, 16.5);
  g.fillStyle(PALETTE.flowerWhite, 1);
  g.fillEllipse(73, 46, 14, 11);

  // Нос, глаз, румянец
  g.fillStyle(PALETTE.uiText, 1);
  g.fillCircle(79, 43, 3.2);
  g.fillCircle(65, 36, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(66.5, 34.2, 1.8);
  g.fillStyle(PALETTE.flowerPink, 0.7);
  g.fillCircle(66, 48, 4);
}

/** Толстая стрелка вправо: сцена поворачивает её нужным углом. */
function drawArrow(g: Gfx): void {
  const head: Pt[] = [
    { x: 52, y: 7 },
    { x: 90, y: 26 },
    { x: 52, y: 45 },
  ];

  // Тёмная обводка: хвост со скруглением и контур наконечника
  g.fillStyle(PALETTE.uiText, 1);
  g.fillRoundedRect(3, 11, 62, 30, 14);
  g.lineStyle(7, PALETTE.uiText, 1);
  g.strokePoints(head, true);
  for (const pt of head) g.fillCircle(pt.x as number, pt.y as number, 3.5);

  // Заливка цветом кнопки
  g.fillStyle(PALETTE.uiButton, 1);
  g.fillPoints(head, true);
  g.fillRoundedRect(6, 14, 56, 24, 11);

  // Блик по верхней кромке
  g.fillStyle(PALETTE.flowerWhite, 0.4);
  g.fillRoundedRect(14, 17, 38, 6, 3);
}
