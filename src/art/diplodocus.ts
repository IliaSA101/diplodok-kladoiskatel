/**
 * Рисование диплодока: запекание текстур частей тела и живая отрисовка шеи.
 *
 * Части тела — обычные текстуры (запекаем один раз), а шея каждый кадр
 * перерисовывается кривой от плеча к текущей позиции головы. Поэтому
 * диплодок может вытянуть шею к кроне дерева и шея останется «цельной».
 *
 * Все размеры — в локальных координатах контейнера персонажа при scale = 1.
 * Начало координат (0, 0) — точка касания земли (лапы), ось Y вверх отрицательная.
 */

import Phaser from 'phaser';
import { PALETTE } from './palette';

/** Ключи текстур диплодока. Локальные: в keys.ts их нет и быть не должно. */
export const DINO_TEX = {
  BODY: 'dino-body',
  LEG_NEAR: 'dino-leg-near',
  LEG_FAR: 'dino-leg-far',
  TAIL: 'dino-tail',
  HEAD: 'dino-head',
  EYE: 'dino-eye',
  EYE_HAPPY: 'dino-eye-happy',
  LEAF: 'dino-leaf',
  HINT_STAR: 'dino-hint-star',
} as const satisfies { readonly [k: string]: string };

/**
 * Геометрия персонажа: размеры текстур, точки привязки и места крепления частей.
 * Сущность Diplodocus собирает себя строго по этим числам.
 */
export const DINO_GEOM = {
  /** Тело: центр изображения. */
  bodyW: 124,
  bodyH: 92,
  bodyX: -6,
  bodyY: -94,

  /** Лапа: привязка в бедре, чтобы вращение качало лапу от бедра. */
  legW: 40,
  legH: 72,
  legOriginX: 0.5,
  legOriginY: 9 / 72,
  /** Бёдра спрятаны внутри тела; дальняя пара выше, меньше и сдвинута назад. */
  hipNearY: -62,
  hipFarY: -68,
  legNearBackX: -32,
  legNearFrontX: 34,
  legFarBackX: -52,
  legFarFrontX: 14,
  legFarScale: 0.88,

  /** Хвост: привязка в основании (толстый конец). */
  tailW: 108,
  tailH: 64,
  tailOriginX: 94 / 108,
  tailOriginY: 18 / 64,
  tailX: -46,
  tailY: -98,

  /** Голова: привязка в месте стыка с шеей (внутри затылка). */
  headW: 48,
  headH: 36,
  headOriginX: 8 / 48,
  headOriginY: 24 / 36,
  /** Голова в покое. */
  headRestX: 60,
  headRestY: -206,

  /** Плечо — начало шеи. */
  shoulderX: 38,
  shoulderY: -124,

  /** Смещения внутри под-контейнера головы. */
  eyeX: 16,
  eyeY: -9,
  mouthX: 30,
  mouthY: 2,
  starX: 6,
  starY: -52,

  /** Радиусы шеи: у плеча толще, у головы тоньше. */
  neckRadiusShoulder: 17,
  neckRadiusHead: 10,
} as const;

// ---------------------------------------------------------------------------
// Запекание текстур
// ---------------------------------------------------------------------------

/** Нарисовать во временный Graphics и запечь в текстуру. Повторный вызов ничего не делает. */
function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** Тело: тёмная спина, светлое брюхо, пятнышки. */
function drawBody(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PALETTE.dinoBodyDark, 1);
  g.fillEllipse(62, 42, 122, 82);
  g.fillStyle(PALETTE.dinoBody, 1);
  g.fillEllipse(62, 50, 114, 74);
  g.fillStyle(PALETTE.dinoBelly, 1);
  g.fillEllipse(58, 66, 94, 42);
  g.fillStyle(PALETTE.dinoSpot, 1);
  g.fillCircle(36, 32, 9);
  g.fillCircle(60, 26, 7);
  g.fillCircle(84, 32, 8);
  g.fillCircle(100, 44, 6);
  g.fillCircle(48, 40, 5);
}

/** Лапа: толстая тумба со ступнёй. Ближняя — в цвете тела, дальняя — в тени. */
function drawLeg(g: Phaser.GameObjects.Graphics, far: boolean): void {
  const main = far ? PALETTE.dinoBodyDark : PALETTE.dinoBody;
  const edge = far ? PALETTE.dinoSmile : PALETTE.dinoBodyDark;
  g.fillStyle(edge, 1);
  g.fillRoundedRect(3, 2, 34, 58, 15);
  g.fillEllipse(20, 61, 38, 20);
  g.fillStyle(main, 1);
  g.fillRoundedRect(5, 3, 30, 54, 13);
  g.fillEllipse(20, 59, 33, 16);
  if (!far) {
    // светлый блик по внутренней стороне лапы
    g.fillStyle(PALETTE.dinoBelly, 0.45);
    g.fillEllipse(13, 30, 8, 34);
  }
  // пальцы
  g.lineStyle(2, edge, 1);
  g.lineBetween(12, 56, 10, 65);
  g.lineBetween(20, 57, 20, 66);
  g.lineBetween(28, 56, 30, 65);
}

/** Хвост: толстый у основания, сходит на нос, слегка загибается вниз. */
function drawTail(g: Phaser.GameObjects.Graphics): void {
  const curve = new Phaser.Curves.QuadraticBezier(
    new Phaser.Math.Vector2(94, 18),
    new Phaser.Math.Vector2(52, 6),
    new Phaser.Math.Vector2(6, 52),
  );
  const steps = 30;
  const out = new Phaser.Math.Vector2();
  // тёмная подложка снизу — объём
  g.fillStyle(PALETTE.dinoBodyDark, 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPoint(t, out);
    g.fillCircle(out.x, out.y + 1.5, radiusAt(15, 1.5, t) + 2);
  }
  g.fillStyle(PALETTE.dinoBody, 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPoint(t, out);
    g.fillCircle(out.x, out.y, radiusAt(15, 1.5, t));
  }
  g.fillStyle(PALETTE.dinoSpot, 1);
  curve.getPoint(0.26, out);
  g.fillCircle(out.x, out.y - 2, 5);
  curve.getPoint(0.52, out);
  g.fillCircle(out.x, out.y - 1, 3.5);
}

/** Голова: маленькая, с мордочкой и улыбкой. Привязка — стык с шеей в (8, 30). */
function drawHead(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PALETTE.dinoBodyDark, 1);
  g.fillEllipse(20, 16, 36, 30);
  g.fillRoundedRect(25, 10, 21, 19, 9);
  g.fillStyle(PALETTE.dinoBody, 1);
  g.fillEllipse(20, 18, 32, 26);
  g.fillRoundedRect(27, 12, 18, 15, 7);
  g.fillStyle(PALETTE.dinoBelly, 1);
  g.fillEllipse(29, 26, 24, 9);
  g.fillStyle(PALETTE.dinoSpot, 1);
  g.fillCircle(13, 9, 4.5);
  g.fillStyle(PALETTE.dinoBodyDark, 1);
  g.fillCircle(42, 16, 2);
  // улыбка
  g.lineStyle(2.5, PALETTE.dinoSmile, 1);
  g.beginPath();
  g.arc(33, 19, 7, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(115));
  g.strokePath();
}

/** Открытый глаз. */
function drawEye(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PALETTE.dinoEyeWhite, 1);
  g.fillEllipse(9, 9, 15, 16);
  g.fillStyle(PALETTE.dinoEye, 1);
  g.fillCircle(10, 8, 5);
  g.fillStyle(PALETTE.dinoEyeWhite, 1);
  g.fillCircle(12, 6, 1.8);
}

/** Счастливый глаз-дуга (для радости). */
function drawEyeHappy(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(3, PALETTE.dinoEye, 1);
  g.beginPath();
  g.arc(10, 12, 7, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340));
  g.strokePath();
}

/** Листик, который диплодок жуёт в простое. */
function drawLeafBite(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PALETTE.dinoLeaf, 1);
  g.fillEllipse(12, 8, 22, 13);
  g.lineStyle(1.5, PALETTE.leafDark, 1);
  g.lineBetween(3, 11, 21, 5);
}

/** Пятилучевая звезда подсказки. Запекаем почти белой — цвет задаётся tint. */
function drawHintStar(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PALETTE.flowerWhite, 0.16);
  g.fillCircle(22, 22, 21);
  g.fillStyle(PALETTE.flowerWhite, 0.3);
  g.fillCircle(22, 22, 14);
  g.fillStyle(PALETTE.dinoEyeWhite, 1);
  g.fillPoints(starPoints(22, 22, 18, 7.5), true);
}

/** Точки пятилучевой звезды, первый луч смотрит вверх. */
function starPoints(cx: number, cy: number, outer: number, inner: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(
      new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius),
    );
  }
  return points;
}

/** Плавное сужение: держит толщину у основания и быстро сходит к концу. */
function radiusAt(from: number, to: number, t: number): number {
  const eased = t * t * (3 - 2 * t);
  return from + (to - from) * eased;
}

/**
 * Запекает текстуры частей тела (тело, лапа, хвост, голова и т.п.).
 * Вызывать из конструктора Diplodocus (идемпотентно).
 */
export function generateDiplodocusTextures(scene: Phaser.Scene): void {
  const geom = DINO_GEOM;
  bake(scene, DINO_TEX.BODY, geom.bodyW, geom.bodyH, drawBody);
  bake(scene, DINO_TEX.LEG_NEAR, geom.legW, geom.legH, (g) => drawLeg(g, false));
  bake(scene, DINO_TEX.LEG_FAR, geom.legW, geom.legH, (g) => drawLeg(g, true));
  bake(scene, DINO_TEX.TAIL, geom.tailW, geom.tailH, drawTail);
  bake(scene, DINO_TEX.HEAD, geom.headW, geom.headH, drawHead);
  bake(scene, DINO_TEX.EYE, 18, 18, drawEye);
  bake(scene, DINO_TEX.EYE_HAPPY, 20, 16, drawEyeHappy);
  bake(scene, DINO_TEX.LEAF, 24, 16, drawLeafBite);
  bake(scene, DINO_TEX.HINT_STAR, 44, 44, drawHintStar);
}

// ---------------------------------------------------------------------------
// Живая шея
// ---------------------------------------------------------------------------

/** Сколько отрезков в шее. Больше — плавнее, но дороже: 24 держит 60 fps. */
const NECK_SEGMENTS = 24;

// Все буферы созданы один раз: drawNeck работает каждый кадр и не должен мусорить.
const neckPoints: Phaser.Math.Vector2[] = [];
const neckNormals: Phaser.Math.Vector2[] = [];
const neckRadii: number[] = [];
const neckOutline: Phaser.Math.Vector2[] = [];
const neckCurve = new Phaser.Curves.QuadraticBezier(
  new Phaser.Math.Vector2(),
  new Phaser.Math.Vector2(),
  new Phaser.Math.Vector2(),
);

for (let i = 0; i <= NECK_SEGMENTS; i++) {
  neckPoints.push(new Phaser.Math.Vector2());
  neckNormals.push(new Phaser.Math.Vector2());
  neckRadii.push(0);
}
for (let i = 0; i < (NECK_SEGMENTS + 1) * 2; i++) {
  neckOutline.push(new Phaser.Math.Vector2());
}

/**
 * Заливает «трубу» по уже посчитанным точкам шеи.
 * offset сдвигает полосу к передней стороне шеи, чтобы положить светлый блик.
 */
function fillNeckTube(
  g: Phaser.GameObjects.Graphics,
  color: number,
  alpha: number,
  offset: number,
  radiusScale: number,
  radiusPad: number,
): void {
  const last = NECK_SEGMENTS;
  for (let i = 0; i <= last; i++) {
    const point = neckPoints[i];
    const normal = neckNormals[i];
    const radius = neckRadii[i] * radiusScale + radiusPad;
    const cx = point.x + normal.x * offset;
    const cy = point.y + normal.y * offset;
    neckOutline[i].set(cx + normal.x * radius, cy + normal.y * radius);
    neckOutline[2 * last + 1 - i].set(cx - normal.x * radius, cy - normal.y * radius);
  }
  g.fillStyle(color, alpha);
  g.fillPoints(neckOutline, true);
  // закруглённые концы
  const start = neckPoints[0];
  const startNormal = neckNormals[0];
  const end = neckPoints[last];
  const endNormal = neckNormals[last];
  g.fillCircle(
    start.x + startNormal.x * offset,
    start.y + startNormal.y * offset,
    neckRadii[0] * radiusScale + radiusPad,
  );
  g.fillCircle(
    end.x + endNormal.x * offset,
    end.y + endNormal.y * offset,
    neckRadii[last] * radiusScale + radiusPad,
  );
}

/** Перерисовать шею от плеча к голове в локальных координатах контейнера. */
export function drawNeck(
  g: Phaser.GameObjects.Graphics,
  shoulderX: number,
  shoulderY: number,
  headX: number,
  headY: number,
): void {
  g.clear();

  const dx = headX - shoulderX;
  const dy = headY - shoulderY;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  // Контрольная точка уводит шею в сторону «живота» — получается мягкая дуга,
  // а при наклоне головы к земле шея сама выгибается горбом над плечом.
  const bow = length * 0.18 + 8;
  const bowX = -dy / length;
  const bowY = dx / length;
  neckCurve.p0.set(shoulderX, shoulderY);
  neckCurve.p1.set(shoulderX + dx * 0.5 + bowX * bow, shoulderY + dy * 0.5 + bowY * bow);
  neckCurve.p2.set(headX, headY);

  for (let i = 0; i <= NECK_SEGMENTS; i++) {
    const t = i / NECK_SEGMENTS;
    neckCurve.getPoint(t, neckPoints[i]);
    neckRadii[i] = radiusAt(DINO_GEOM.neckRadiusShoulder, DINO_GEOM.neckRadiusHead, t);
  }
  // нормали по соседним точкам: +normal смотрит вперёд (в сторону груди)
  for (let i = 0; i <= NECK_SEGMENTS; i++) {
    const prev = neckPoints[i === 0 ? 0 : i - 1];
    const next = neckPoints[i === NECK_SEGMENTS ? NECK_SEGMENTS : i + 1];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.max(0.0001, Math.sqrt(tx * tx + ty * ty));
    neckNormals[i].set(-ty / tl, tx / tl);
  }

  // тёмный контур, тело шеи, светлая передняя полоса
  fillNeckTube(g, PALETTE.dinoBodyDark, 1, 0, 1, 2.5);
  fillNeckTube(g, PALETTE.dinoBody, 1, 0, 1, 0);
  fillNeckTube(g, PALETTE.dinoBelly, 0.7, 0.5, 0.27, 0);

  // пара пятнышек на загривке
  g.fillStyle(PALETTE.dinoSpot, 1);
  for (let i = 7; i <= 15; i += 8) {
    const point = neckPoints[i];
    const normal = neckNormals[i];
    const radius = neckRadii[i];
    g.fillCircle(point.x - normal.x * radius * 0.4, point.y - normal.y * radius * 0.4, radius * 0.3);
  }
}
