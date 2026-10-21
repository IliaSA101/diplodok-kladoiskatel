import Phaser from 'phaser';
import { PALETTE } from '../art/palette';

/** Каталог находок: 12 обычных предметов и секретный приз; каждый рисуется кодом по центру квадрата. */
export interface TreasureItem {
  /** Короткий латинский id, он же часть имени текстуры и ключ сохранения. */
  id: string;
  /** Русское название — показывается крупно под предметом при находке. */
  name: string;
  /** Нарисовать предмет по центру квадрата size x size. */
  draw(g: Phaser.GameObjects.Graphics, size: number): void;
  /** Секретный предмет не попадает в обычный набор клада. */
  secret?: boolean;
}

type Gfx = Phaser.GameObjects.Graphics;

interface Pt {
  x: number;
  y: number;
}

/** Все предметы рисуются в «дизайн-квадрате» 256x256 и масштабируются под size. */
const DESIGN = 256;
/** Цвет и толщина общего контура: толстый, тёплый, не чёрный. */
const OUTLINE = PALETTE.uiText;
const LINE = 6;
const WHITE = 0xffffff;

// ---------------------------------------------------------------- helpers

const pt = (x: number, y: number): Pt => ({ x, y });

const mix = (a: Pt, b: Pt, t: number): Pt => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** Обернуть рисовалку «в координатах 256x256» в функцию draw(g, size). */
function scaled(fn: (g: Gfx) => void): (g: Gfx, size: number) => void {
  return (g, size) => {
    const k = size / DESIGN;
    g.save();
    g.scaleCanvas(k, k);
    fn(g);
    g.restore();
  };
}

/** Нарисовать fn, повернув и увеличив всё вокруг точки (cx, cy). */
function rotated(g: Gfx, cx: number, cy: number, deg: number, scale: number, fn: () => void): void {
  g.save();
  g.translateCanvas(cx, cy);
  g.rotateCanvas(Phaser.Math.DegToRad(deg));
  g.scaleCanvas(scale, scale);
  g.translateCanvas(-cx, -cy);
  fn();
  g.restore();
}

/** Мягкая тень под предметом: несколько вложенных полупрозрачных овалов. */
function softShadow(g: Gfx, cx: number, cy: number, w: number, h: number): void {
  for (let i = 0; i < 4; i += 1) {
    const f = 1 - i * 0.18;
    g.fillStyle(OUTLINE, 0.07);
    g.fillEllipse(cx, cy, w * f, h * f);
  }
}

/** Мягкий блик: большой бледный овал и яркая серединка. */
function shine(g: Gfx, x: number, y: number, w: number, h: number): void {
  g.fillStyle(WHITE, 0.35);
  g.fillEllipse(x, y, w, h);
  g.fillStyle(WHITE, 0.75);
  g.fillEllipse(x, y, w * 0.55, h * 0.55);
}

/** Точки звезды с заданным числом лучей. */
function starPoints(cx: number, cy: number, outer: number, inner: number, tips: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < tips * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / tips;
    pts.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

/** Многоугольник с заливкой и (при lw > 0) толстым контуром. */
function polygon(g: Gfx, pts: Pt[], fill: number, lw = LINE, fillAlpha = 1): void {
  g.fillStyle(fill, fillAlpha);
  g.fillPoints(pts, true);
  if (lw > 0) {
    g.lineStyle(lw, OUTLINE, 1);
    g.strokePoints(pts, true);
  }
}

/** Белая четырёхлучевая искорка без контура. */
function sparkle(g: Gfx, x: number, y: number, r: number): void {
  g.fillStyle(WHITE, 0.95);
  g.fillPoints(starPoints(x, y, r, r * 0.28, 4), true);
}

/**
 * Часть формы, которую можно «раздуть» на grow пикселей.
 * Так контур объединённой фигуры получается цельным: сначала все контуры, потом все заливки.
 */
type Part = (g: Gfx, grow: number) => void;

const circlePart =
  (x: number, y: number, r: number): Part =>
  (g, grow) => {
    g.fillCircle(x, y, r + grow);
  };

const ellipsePart =
  (x: number, y: number, w: number, h: number): Part =>
  (g, grow) => {
    g.fillEllipse(x, y, w + grow * 2, h + grow * 2);
  };

const roundRectPart =
  (x: number, y: number, w: number, h: number, r: number): Part =>
  (g, grow) => {
    g.fillRoundedRect(x - grow, y - grow, w + grow * 2, h + grow * 2, r + grow);
  };

function outlined(g: Gfx, fill: number, parts: Part[], lw = LINE): void {
  g.fillStyle(OUTLINE, 1);
  for (const part of parts) part(g, lw);
  g.fillStyle(fill, 1);
  for (const part of parts) part(g, 0);
}

/** Дуга-блик (толстая полупрозрачная белая линия по окружности). */
function arcShine(g: Gfx, cx: number, cy: number, r: number, fromRad: number, toRad: number): void {
  g.lineStyle(8, WHITE, 0.55);
  g.beginPath();
  g.arc(cx, cy, r, fromRad, toRad, false);
  g.strokePath();
}

type GemShape = readonly [Pt, Pt, Pt, Pt, Pt];

/**
 * Огранённый камень: shape = [левый верх, правый верх, правый край, низ, левый край].
 * dark — цвет теней на гранях, depth — насколько они сильные.
 */
function gem(g: Gfx, shape: GemShape, base: number, dark: number, depth: number): void {
  const [tl, tr, r, b, l] = shape;
  const gl = mix(l, r, 0.37);
  const gr = mix(l, r, 0.63);
  const tint = (pts: Pt[], color: number, alpha: number): void => {
    g.fillStyle(color, alpha);
    g.fillPoints(pts, true);
  };
  tint([tl, tr, r, b, l], base, 1);
  tint([l, tl, gl], dark, 0.35 * depth);
  tint([r, tr, gr], dark, 0.6 * depth);
  tint([l, gl, b], dark, 0.5 * depth);
  tint([r, gr, b], dark, 0.8 * depth);
  tint([tl, tr, gr, gl], WHITE, 0.5);
  // Внутренние рёбра граней
  g.lineStyle(4, OUTLINE, 0.4);
  g.lineBetween(l.x, l.y, r.x, r.y);
  g.lineBetween(tl.x, tl.y, gl.x, gl.y);
  g.lineBetween(tr.x, tr.y, gr.x, gr.y);
  g.lineBetween(gl.x, gl.y, b.x, b.y);
  g.lineBetween(gr.x, gr.y, b.x, b.y);
  // Внешний контур
  g.lineStyle(LINE + 1, OUTLINE, 1);
  g.strokePoints([tl, tr, r, b, l], true);
}

// ------------------------------------------------------------------ items

/** Кристалл: большой голубой огранённый камень. */
function drawCrystal(g: Gfx): void {
  softShadow(g, 128, 228, 150, 22);
  gem(g, [pt(86, 48), pt(170, 48), pt(216, 104), pt(128, 216), pt(40, 104)], PALETTE.crystal, PALETTE.crystalDark, 1);
  shine(g, 100, 78, 30, 14);
  sparkle(g, 196, 60, 18);
}

/** Монета: золотой диск с толщиной, ободком и звездой. */
function drawCoin(g: Gfx): void {
  softShadow(g, 128, 232, 150, 18);
  outlined(g, PALETTE.goldDark, [circlePart(128, 138, 90)]);
  outlined(g, PALETTE.gold, [circlePart(128, 126, 90)]);
  g.lineStyle(7, PALETTE.goldDark, 1);
  g.strokeCircle(128, 126, 66);
  polygon(g, starPoints(128, 128, 46, 21, 5), PALETTE.goldDark, 0);
  g.lineStyle(6, PALETTE.goldDark, 1);
  g.strokePoints(starPoints(128, 128, 46, 21, 5), true);
  arcShine(g, 128, 126, 77, Math.PI * 1.08, Math.PI * 1.45);
}

/** Окаменелость: спираль-аммонит на каменном диске с рёбрышками. */
function drawFossil(g: Gfx): void {
  softShadow(g, 128, 228, 160, 22);
  outlined(g, PALETTE.fossil, [circlePart(128, 124, 92)]);
  // Рёбрышки по внешнему краю
  g.lineStyle(7, PALETTE.fossilDark, 1);
  for (let k = 0; k < 18; k += 1) {
    const a = (k * Math.PI * 2) / 18;
    g.lineBetween(
      128 + Math.cos(a) * 74,
      124 + Math.sin(a) * 74,
      128 + Math.cos(a) * 87,
      124 + Math.sin(a) * 87,
    );
  }
  // Спираль от центра к краю
  const spiral: Pt[] = [];
  const steps = 90;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * Math.PI * 2 * 2.5 - Math.PI / 2;
    const r = 8 + t * 60;
    spiral.push(pt(128 + Math.cos(a) * r, 124 + Math.sin(a) * r));
  }
  g.lineStyle(13, PALETTE.fossilDark, 1);
  g.strokePoints(spiral, false);
  g.fillStyle(PALETTE.fossilDark, 1);
  g.fillCircle(128, 116, 11);
  shine(g, 82, 80, 40, 20);
}

/** Яйцо динозавра: кремовое, в зелёную крапинку. */
function drawEgg(g: Gfx): void {
  softShadow(g, 128, 228, 140, 22);
  outlined(g, PALETTE.egg, [ellipsePart(128, 148, 150, 140), ellipsePart(128, 108, 112, 150)]);
  // Тень внизу яйца
  g.fillStyle(PALETTE.fossil, 0.45);
  g.fillEllipse(128, 198, 96, 36);
  // Крапинки
  const spots: Array<[number, number, number]> = [
    [100, 148, 15],
    [152, 174, 13],
    [150, 120, 11],
    [100, 98, 12],
    [128, 202, 10],
    [150, 74, 9],
    [106, 188, 8],
  ];
  g.fillStyle(PALETTE.eggSpot, 1);
  for (const [x, y, r] of spots) g.fillCircle(x, y, r);
  shine(g, 98, 70, 24, 40);
}

/** Ракушка: веер с рёбрами и волнистым краем. */
function drawShell(g: Gfx): void {
  softShadow(g, 128, 230, 150, 20);
  const baseX = 128;
  const baseY = 220;
  const radius = 150;
  const from = Phaser.Math.DegToRad(220);
  const span = Phaser.Math.DegToRad(100);
  const lobes = 7;
  const perLobe = 8;
  const pts: Pt[] = [pt(baseX, baseY)];
  for (let i = 0; i <= lobes * perLobe; i += 1) {
    const t = i / (lobes * perLobe);
    const frac = t * lobes - Math.floor(t * lobes);
    const bump = i === lobes * perLobe ? 0 : Math.sin(Math.PI * frac) * 14;
    const a = from + span * t;
    pts.push(pt(baseX + Math.cos(a) * (radius - 14 + bump), baseY + Math.sin(a) * (radius - 14 + bump)));
  }
  polygon(g, pts, PALETTE.shell, LINE);
  // Рёбра веера
  g.lineStyle(7, PALETTE.flowerPink, 1);
  for (let k = 0; k < lobes; k += 1) {
    const a = from + span * ((k + 0.5) / lobes);
    g.lineBetween(
      baseX + Math.cos(a) * 34,
      baseY + Math.sin(a) * 34,
      baseX + Math.cos(a) * (radius - 18),
      baseY + Math.sin(a) * (radius - 18),
    );
  }
  // Замочек у основания
  outlined(g, PALETTE.shell, [roundRectPart(98, 206, 60, 30, 14)]);
  shine(g, 96, 100, 30, 16);
}

/** Корона: золотая, с шариками на зубцах и самоцветами на ободе. */
function drawCrown(g: Gfx): void {
  softShadow(g, 128, 228, 170, 20);
  const body = [
    pt(46, 200),
    pt(34, 84),
    pt(88, 130),
    pt(128, 58),
    pt(168, 130),
    pt(222, 84),
    pt(210, 200),
  ];
  polygon(g, body, PALETTE.gold, LINE);
  outlined(g, PALETTE.goldDark, [roundRectPart(46, 160, 164, 42, 12)]);
  g.fillStyle(WHITE, 0.35);
  g.fillRoundedRect(58, 168, 96, 8, 4);
  // Самоцветы на ободе
  const jewels: Array<[number, number]> = [
    [86, PALETTE.flowerPink],
    [128, PALETTE.crystal],
    [170, PALETTE.flowerPink],
  ];
  for (const [x, color] of jewels) outlined(g, color, [circlePart(x, 184, 11)], 4);
  // Шарики на зубцах
  outlined(g, PALETTE.flowerPink, [circlePart(34, 80, 17)], 5);
  outlined(g, PALETTE.crystal, [circlePart(128, 52, 18)], 5);
  outlined(g, PALETTE.flowerPink, [circlePart(222, 80, 17)], 5);
  shine(g, 124, 46, 12, 8);
}

/** Жемчужина в раскрытой створке. */
function drawPearl(g: Gfx): void {
  softShadow(g, 128, 232, 200, 20);
  // Задняя створка-крышка
  outlined(g, PALETTE.shell, [ellipsePart(128, 112, 196, 160)]);
  g.lineStyle(7, PALETTE.flowerPink, 1);
  const ribs: Array<[number, number]> = [
    [-56, 82],
    [-28, 108],
    [0, 118],
    [28, 108],
    [56, 82],
  ];
  for (const [deg, len] of ribs) {
    const a = Phaser.Math.DegToRad(deg - 90);
    g.lineBetween(128, 170, 128 + Math.cos(a) * len, 170 + Math.sin(a) * len);
  }
  // Передняя створка-чаша
  outlined(g, PALETTE.shell, [ellipsePart(128, 172, 224, 104)]);
  g.lineStyle(7, PALETTE.flowerPink, 1);
  const frontRibs: Array<[number, number]> = [
    [64, 206],
    [96, 214],
    [128, 216],
    [160, 214],
    [192, 206],
  ];
  for (const [x, endY] of frontRibs) g.lineBetween(x, 198, x, endY);
  // Розовая ложбинка
  outlined(g, PALETTE.flowerPink, [ellipsePart(128, 166, 176, 64)], 5);
  // Жемчужина
  outlined(g, PALETTE.pearl, [circlePart(128, 148, 40)]);
  g.lineStyle(9, PALETTE.crystalDark, 0.35);
  g.beginPath();
  g.arc(128, 148, 29, 0.1 * Math.PI, 0.6 * Math.PI, false);
  g.strokePath();
  shine(g, 112, 132, 18, 14);
}

/** Золотой ключик: кольцо, стержень и два зубчика; лежит по диагонали. */
function drawKey(g: Gfx): void {
  softShadow(g, 128, 230, 170, 18);
  rotated(g, 124, 128, -40, 1.12, () => {
    const shaft: Part[] = [
      roundRectPart(104, 116, 118, 24, 8),
      roundRectPart(178, 134, 22, 36, 6),
      roundRectPart(204, 134, 18, 26, 6),
    ];
    // Контуры
    g.lineStyle(26 + LINE * 2, OUTLINE, 1);
    g.strokeCircle(74, 128, 36);
    g.fillStyle(OUTLINE, 1);
    for (const part of shaft) part(g, LINE);
    // Заливки
    g.lineStyle(26, PALETTE.gold, 1);
    g.strokeCircle(74, 128, 36);
    g.fillStyle(PALETTE.gold, 1);
    for (const part of shaft) part(g, 0);
    // Тень и блик
    g.fillStyle(PALETTE.goldDark, 1);
    g.fillRect(106, 131, 114, 7);
    g.fillStyle(WHITE, 0.45);
    g.fillRoundedRect(112, 119, 92, 6, 3);
    arcShine(g, 74, 128, 36, Math.PI * 1.05, Math.PI * 1.5);
  });
}

/** Янтарь: оранжевый камень с мушкой внутри. */
function drawAmber(g: Gfx): void {
  softShadow(g, 128, 228, 170, 22);
  outlined(g, PALETTE.uiButton, [roundRectPart(30, 50, 196, 158, 66)]);
  g.fillStyle(PALETTE.gold, 0.5);
  g.fillRoundedRect(46, 64, 164, 120, 52);
  // Мушка: крылья, тельце, голова, ножки
  g.lineStyle(4, PALETTE.dinoEye, 0.6);
  g.beginPath();
  g.moveTo(116, 144);
  g.lineTo(92, 160);
  g.moveTo(116, 154);
  g.lineTo(96, 172);
  g.moveTo(148, 144);
  g.lineTo(172, 160);
  g.moveTo(148, 154);
  g.lineTo(168, 172);
  g.strokePath();
  g.fillStyle(WHITE, 0.8);
  g.fillEllipse(96, 128, 58, 30);
  g.fillEllipse(168, 128, 58, 30);
  g.lineStyle(4, PALETTE.dinoEye, 0.6);
  g.strokeEllipse(96, 128, 58, 30);
  g.strokeEllipse(168, 128, 58, 30);
  g.fillStyle(PALETTE.dinoEye, 1);
  g.fillEllipse(132, 142, 32, 58);
  g.fillCircle(132, 108, 15);
  g.fillStyle(PALETTE.flowerPink, 1);
  g.fillCircle(124, 104, 5);
  g.fillCircle(140, 104, 5);
  shine(g, 80, 84, 54, 24);
}

/** Косточка: классическая, с четырьмя шишечками, лежит по диагонали. */
function drawBone(g: Gfx): void {
  softShadow(g, 128, 228, 170, 18);
  rotated(g, 128, 128, -35, 1.1, () => {
    outlined(g, PALETTE.bone, [
      roundRectPart(60, 108, 136, 40, 14),
      circlePart(62, 106, 25),
      circlePart(62, 150, 25),
      circlePart(194, 106, 25),
      circlePart(194, 150, 25),
    ]);
    g.fillStyle(PALETTE.fossil, 0.6);
    g.fillRoundedRect(70, 134, 116, 10, 5);
    g.fillStyle(WHITE, 0.7);
    g.fillRoundedRect(76, 114, 70, 8, 4);
  });
}

/** Звёздный камень: сиреневая пятилучевая звезда с гранями. */
function drawStarstone(g: Gfx): void {
  softShadow(g, 128, 230, 160, 20);
  const cx = 128;
  const cy = 134;
  const pts = starPoints(cx, cy, 104, 50, 5);
  g.fillStyle(PALETTE.confetti[5], 1);
  g.fillPoints(pts, true);
  // Грани: треугольники от центра, светлые и тёмные вперемешку
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a === undefined || b === undefined) continue;
    g.fillStyle(i % 2 === 0 ? WHITE : OUTLINE, i % 2 === 0 ? 0.3 : 0.14);
    g.fillPoints([pt(cx, cy), a, b], true);
  }
  g.lineStyle(8, OUTLINE, 1);
  g.strokePoints(pts, true);
  sparkle(g, 104, 100, 20);
  shine(g, 128, 150, 22, 12);
}

/** Колечко: золотой ободок с розовым камнем. */
function drawRing(g: Gfx): void {
  softShadow(g, 128, 234, 150, 16);
  // Ободок: контур, золото, тень изнутри
  g.lineStyle(26 + LINE * 2, OUTLINE, 1);
  g.strokeCircle(128, 160, 54);
  g.lineStyle(26, PALETTE.gold, 1);
  g.strokeCircle(128, 160, 54);
  g.lineStyle(7, PALETTE.goldDark, 1);
  g.beginPath();
  g.arc(128, 160, 45, 0.1 * Math.PI, 0.9 * Math.PI, false);
  g.strokePath();
  arcShine(g, 128, 160, 58, Math.PI * 1.05, Math.PI * 1.4);
  // Камень сверху
  gem(g, [pt(106, 30), pt(150, 30), pt(172, 66), pt(128, 112), pt(84, 66)], PALETTE.flowerPink, OUTLINE, 0.4);
  sparkle(g, 168, 38, 15);
}

/**
 * Золотая корона — главный приз уровня, самый нарядный предмет каталога:
 * массивный золотой венец с пятью зубцами, бархатной вставкой и крупными самоцветами.
 */
function drawGoldCrown(g: Gfx): void {
  const velvet = PALETTE.confetti[5];
  softShadow(g, 128, 236, 196, 20);

  // Бархатный «колпак» позади зубцов: виден в просветах между ними
  outlined(g, velvet, [ellipsePart(128, 132, 176, 140)]);
  g.fillStyle(OUTLINE, 0.18);
  g.fillEllipse(128, 150, 150, 70);
  g.fillStyle(WHITE, 0.28);
  g.fillEllipse(100, 92, 50, 20);

  // Золотой венец: пять зубцов, средний выше всех
  const tips = [pt(40, 88), pt(84, 62), pt(128, 38), pt(172, 62), pt(216, 88)];
  const valleys = [pt(62, 140), pt(106, 140), pt(150, 140), pt(194, 140)];
  const body: Pt[] = [pt(44, 206)];
  tips.forEach((tip, i) => {
    body.push(tip);
    const valley = valleys[i];
    if (valley !== undefined) body.push(valley);
  });
  body.push(pt(212, 206));
  polygon(g, body, PALETTE.gold, LINE + 1);
  // Тень на правой половине каждого зубца
  g.fillStyle(PALETTE.goldDark, 0.4);
  tips.forEach((tip, i) => {
    const valley = valleys[i];
    if (valley !== undefined) g.fillPoints([tip, valley, pt(tip.x, 150)], true);
  });
  g.lineStyle(LINE + 1, OUTLINE, 1);
  g.strokePoints(body, true);
  // Блик на левой грани зубцов
  g.lineStyle(7, WHITE, 0.55);
  for (const tip of tips) g.lineBetween(tip.x - 4, tip.y + 22, tip.x - 11, tip.y + 46);
  // Желобки между зубцами
  g.lineStyle(5, PALETTE.goldDark, 1);
  for (const v of valleys) g.lineBetween(v.x, v.y + 8, v.x, 164);

  // Широкий обод с бархатной вставкой
  outlined(g, PALETTE.gold, [roundRectPart(34, 164, 188, 56, 16)], LINE + 1);
  g.fillStyle(PALETTE.goldDark, 1);
  g.fillRoundedRect(42, 213, 172, 6, 3);
  g.fillStyle(WHITE, 0.45);
  g.fillRoundedRect(44, 167, 72, 5, 2);
  outlined(g, velvet, [roundRectPart(46, 174, 164, 36, 12)], 4);
  g.fillStyle(WHITE, 0.25);
  g.fillRoundedRect(58, 178, 140, 6, 3);

  // Самоцветы на ободе: большой голубой в центре и две розовые «капли» по бокам
  gem(g, [pt(58, 178), pt(74, 178), pt(84, 190), pt(66, 208), pt(48, 190)], PALETTE.flowerPink, OUTLINE, 0.5);
  gem(g, [pt(182, 178), pt(198, 178), pt(208, 190), pt(190, 208), pt(172, 190)], PALETTE.flowerPink, OUTLINE, 0.5);
  gem(g, [pt(110, 170), pt(146, 170), pt(160, 188), pt(128, 216), pt(96, 188)], PALETTE.crystal, PALETTE.crystalDark, 1);

  // Шары-самоцветы на зубцах
  outlined(g, PALETTE.flowerPink, [circlePart(40, 82, 13)], 5);
  outlined(g, PALETTE.crystal, [circlePart(84, 56, 15)], 5);
  outlined(g, PALETTE.flowerPink, [circlePart(128, 30, 20)], 5);
  outlined(g, PALETTE.crystal, [circlePart(172, 56, 15)], 5);
  outlined(g, PALETTE.flowerPink, [circlePart(216, 82, 13)], 5);
  g.fillStyle(WHITE, 0.85);
  g.fillCircle(122, 23, 5);
  g.fillCircle(79, 50, 4);
  g.fillCircle(167, 50, 4);

  // Блеск
  sparkle(g, 66, 38, 15);
  sparkle(g, 196, 36, 19);
  sparkle(g, 232, 128, 12);
  sparkle(g, 24, 140, 12);
}

// ---------------------------------------------------------------- catalog

/** id секретного предмета — главного приза уровня. */
export const SECRET_ITEM_ID = 'goldcrown';

/** Все предметы, включая секретные: по ним запекаются текстуры. */
export const TREASURES: readonly TreasureItem[] = [
  { id: 'crystal', name: 'Кристалл', draw: scaled(drawCrystal) },
  { id: 'coin', name: 'Монета', draw: scaled(drawCoin) },
  { id: 'fossil', name: 'Окаменелость', draw: scaled(drawFossil) },
  { id: 'egg', name: 'Яйцо', draw: scaled(drawEgg) },
  { id: 'shell', name: 'Ракушка', draw: scaled(drawShell) },
  { id: 'crown', name: 'Корона', draw: scaled(drawCrown) },
  { id: 'pearl', name: 'Жемчужина', draw: scaled(drawPearl) },
  { id: 'key', name: 'Золотой ключик', draw: scaled(drawKey) },
  { id: 'amber', name: 'Янтарь', draw: scaled(drawAmber) },
  { id: 'bone', name: 'Косточка', draw: scaled(drawBone) },
  { id: 'starstone', name: 'Звёздный камень', draw: scaled(drawStarstone) },
  { id: 'ring', name: 'Колечко', draw: scaled(drawRing) },
  { id: SECRET_ITEM_ID, name: 'Золотая корона', draw: scaled(drawGoldCrown), secret: true },
];

/** Только обычные предметы: из них набираются клады уровня (секретный сюда не входит). */
export const REGULAR_TREASURES: readonly TreasureItem[] = TREASURES.filter((t) => t.secret !== true);

/** Предмет по id; бросает ошибку, если id неизвестен. */
export function getTreasureItem(id: string): TreasureItem {
  const item = TREASURES.find((t) => t.id === id);
  if (item === undefined) throw new Error('Неизвестный предмет: ' + id);
  return item;
}
