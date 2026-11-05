/**
 * Двенадцать футбольных значков: мяч, бутса, свисток, кубок, перчатка, флаг,
 * ворота, конус, медаль, секундомер, шарф, бутылка.
 *
 * Порядок FOOT_DRAW совпадает с TEX.FOOT — по индексу их и берут судоку,
 * маджонг и викторина. Примитивы рисования — в gfx.ts.
 */
import { PALETTE } from './palette';
import {
  OUTLINE,
  WHITE,
  arcPoints,
  capsule,
  circ,
  ell,
  ink,
  mesh,
  paint,
  pentagon,
  poly,
  pt,
  rr,
  shine,
  solid,
  starPoints,
  tube,
  type Gfx,
  type Pt,
} from './gfx';

/** Красный для шарфа: в палитре нет красного, это тёплый «болельщицкий» красный. */
const RED = 0xe8514a;

export function drawBall(g: Gfx): void {
  const c = 128;
  const R = 98;
  solid(g, [circ(c, c, R)], PALETTE.uiPanelShadow, 7);
  // Светлый круг со сдвигом вверх-влево оставляет внизу справа полумесяц тени.
  paint(g, [circ(c - 5, c - 5, R - 8)], WHITE);
  shine(g, 92, 78, 46, 22, 0.55);
  const centerR = 30;
  const patchDist = 68;
  const patchR = 22;
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = c + Math.cos(a) * patchDist;
    const py = c + Math.sin(a) * patchDist;
    // Шов от вершины центрального пятиугольника к заплатке.
    ink(g, c + Math.cos(a) * centerR, c + Math.sin(a) * centerR, c + Math.cos(a) * (patchDist - patchR), c + Math.sin(a) * (patchDist - patchR), 6);
    paint(g, [poly(pentagon(px, py, patchR, a + Math.PI / 2 + Math.PI))], OUTLINE, 3);
  }
  paint(g, [poly(pentagon(c, c, centerR, -Math.PI / 2))], OUTLINE, 3);
}

/** 1 (и золотая бутса наклейки). Бутса боком, носком вправо, с тремя шипами и шнуровкой. */
export function drawBoot(g: Gfx, upper: number, sole: number): void {
  // Шипы под подошвой.
  solid(g, [rr(52, 196, 28, 26, 9), rr(112, 196, 28, 26, 9), rr(176, 196, 28, 26, 9)], PALETTE.stoneDark, 5);
  const body = poly([
    pt(54, 40),
    pt(128, 40),
    pt(136, 98),
    pt(178, 116),
    pt(216, 140),
    pt(228, 166),
    pt(228, 178),
    pt(44, 178),
    pt(40, 96),
  ]);
  solid(g, [body], upper);
  // Манжета-голенище и блик на носке.
  paint(g, [rr(50, 34, 82, 24, 11)], PALETTE.uiPanel);
  ink(g, 56, 60, 126, 60, 4);
  shine(g, 196, 150, 44, 18, 0.4);
  // Подошва поверх нижнего края.
  solid(g, [rr(32, 162, 198, 40, { tl: 8, tr: 20, bl: 20, br: 20 })], sole);
  // Шнуровка: три перекладины поперёк подъёма.
  const bars: Pt[] = [pt(140, 104), pt(158, 112), pt(176, 120)];
  for (const p of bars) {
    const cx = p.x - 4;
    const cy = p.y + 6;
    solid(g, [capsule(cx - 9, cy - 16, cx + 9, cy + 16, 10)], PALETTE.uiPanel, 4);
  }
}

/** 2. Свисток: круглая камера, оранжевый мундштук, тёмное отверстие и кольцо со шнурком. */
export function drawWhistle(g: Gfx): void {
  // Кольцо для шнурка — сзади.
  solid(g, [tube(arcPoints(96, 56, 22, 0, Math.PI * 2, 7, 18))], PALETTE.flowerPink, 5);
  solid(g, [poly([pt(120, 94), pt(204, 102), pt(226, 118), pt(226, 154), pt(128, 172)])], PALETTE.uiButton);
  solid(g, [circ(92, 150, 64)], PALETTE.stoneLight);
  shine(g, 64, 116, 40, 20, 0.6);
  // Звуковое окошко и отверстие камеры.
  paint(g, [rr(152, 106, 44, 12, 5)], OUTLINE);
  paint(g, [circ(92, 152, 24)], OUTLINE);
  paint(g, [circ(100, 144, 6)], PALETTE.stoneDark);
}

/** 3. Кубок: чаша с ручками, ножка и двойное основание. */
export function drawTrophy(g: Gfx): void {
  // Ручки — кольца по бокам чаши.
  solid(g, [tube(arcPoints(60, 76, 30, Math.PI * 0.45, Math.PI * 1.55, 8, 12))], PALETTE.gold);
  solid(g, [tube(arcPoints(196, 76, 30, -Math.PI * 0.55, Math.PI * 0.55, 8, 12))], PALETTE.gold);
  // Основание и ножка.
  solid(g, [rr(70, 186, 116, 32, 12)], PALETTE.goldDark);
  solid(g, [rr(88, 160, 80, 34, 12)], PALETTE.gold);
  solid(g, [rr(110, 116, 36, 52, 8)], PALETTE.goldDark);
  // Чаша.
  solid(g, [rr(62, 24, 132, 104, { tl: 10, tr: 10, bl: 60, br: 60 })], PALETTE.gold);
  paint(g, [rr(62, 24, 132, 18, { tl: 10, tr: 10, bl: 0, br: 0 })], PALETTE.goldDark);
  shine(g, 92, 78, 22, 52, 0.5);
  paint(g, [poly(starPoints(138, 82, 24, 11, 5))], PALETTE.goldDark, 2);
}

/** 4. Перчатка вратаря: четыре пальца, большой палец, светлая ладонь и манжета. */
export function drawGlove(g: Gfx): void {
  const green = PALETTE.grassMid;
  const fingers = [
    capsule(90, 116, 90, 60, 28),
    capsule(121, 116, 121, 40, 28),
    capsule(152, 116, 152, 46, 28),
    capsule(182, 122, 182, 70, 26),
  ];
  const thumb = capsule(84, 160, 40, 118, 28);
  solid(g, [...fingers, thumb, rr(72, 104, 126, 92, 32)], green);
  // Светлая ладонь и линии между пальцами.
  paint(g, [rr(94, 130, 82, 52, 22)], PALETTE.grassLight);
  for (const x of [105, 136, 167]) ink(g, x, 74, x, 112, 4, PALETTE.grassShadow);
  shine(g, 88, 70, 10, 30, 0.45);
  // Манжета.
  solid(g, [rr(74, 186, 122, 42, 14)], PALETTE.uiPanel);
  paint(g, [rr(74, 200, 122, 14, 0)], PALETTE.uiAccent);
}

/** 5. Угловой флажок: оранжевый вымпел на белом древке, воткнутом в кочку. */
export function drawFlag(g: Gfx): void {
  solid(g, [ell(100, 214, 150, 40)], PALETTE.grassMid);
  paint(g, [ell(92, 208, 80, 16)], PALETTE.grassLight);
  solid(g, [capsule(96, 30, 100, 212, 14)], PALETTE.uiPanel);
  solid(g, [poly([pt(100, 36), pt(150, 28), pt(212, 58), pt(150, 90), pt(100, 108)])], PALETTE.uiButton);
  paint(g, [poly([pt(100, 36), pt(150, 28), pt(170, 36), pt(140, 52), pt(100, 56)])], PALETTE.gold);
  shine(g, 118, 40, 28, 10, 0.4);
  solid(g, [circ(97, 28, 12)], PALETTE.gold, 5);
}

/** 6. Ворота с сеткой: белые штанги и перекладина, сетка ромбиками. */
export function drawGoal(g: Gfx): void {
  solid(g, [ell(128, 220, 200, 26)], PALETTE.grassMid, 5);
  // Задняя стенка с сеткой.
  solid(g, [rr(48, 70, 160, 138, 6)], PALETTE.grassLight, 5);
  mesh(g, 52, 74, 152, 130, 30, 4, PALETTE.stone);
  // Рама.
  solid(g, [rr(30, 46, 196, 26, 12), rr(30, 46, 26, 168, 12), rr(200, 46, 26, 168, 12)], WHITE);
  shine(g, 90, 56, 70, 8, 0.7);
}

/** 7. Тренировочный конус: оранжевый, с двумя белыми полосами и квадратной подставкой. */
export function drawCone(g: Gfx): void {
  const halfWidth = (y: number): number => 30 + (y - 30) * 0.335;
  solid(g, [rr(48, 176, 160, 36, 12)], PALETTE.uiButtonDark);
  const body = poly([pt(128, 30), pt(128 + halfWidth(184), 184), pt(128 - halfWidth(184), 184)]);
  solid(g, [body], PALETTE.uiButton);
  // Белые полосы по ширине конуса на своей высоте.
  for (const [y0, y1] of [
    [80, 104],
    [128, 152],
  ] as const) {
    paint(g, [poly([pt(128 - halfWidth(y0), y0), pt(128 + halfWidth(y0), y0), pt(128 + halfWidth(y1), y1), pt(128 - halfWidth(y1), y1)])], WHITE);
  }
  shine(g, 112, 120, 12, 60, 0.35);
  paint(g, [rr(56, 180, 144, 12, 6)], PALETTE.uiButton);
}

/** 8. Золотая медаль: две ленты, большой диск с кольцом и звездой. */
export function drawMedal(g: Gfx): void {
  solid(g, [poly([pt(66, 20), pt(120, 20), pt(152, 128), pt(98, 128)])], PALETTE.uiAccent);
  solid(g, [poly([pt(190, 20), pt(136, 20), pt(104, 128), pt(158, 128)])], PALETTE.flowerPink);
  solid(g, [circ(128, 158, 70)], PALETTE.gold);
  g.lineStyle(7, PALETTE.goldDark, 1);
  g.strokeCircle(128, 158, 52);
  paint(g, [poly(starPoints(128, 160, 36, 17, 5))], PALETTE.goldDark, 3);
  shine(g, 98, 120, 34, 16, 0.55);
}

/** 9. Секундомер: корпус, кремовый циферблат с четырьмя засечками, стрелка и красный сектор. */
export function drawStopwatch(g: Gfx): void {
  solid(g, [capsule(180, 78, 202, 56, 24)], PALETTE.gold);
  solid(g, [rr(116, 46, 24, 30, 6), rr(100, 20, 56, 30, 12)], PALETTE.gold);
  solid(g, [circ(128, 144, 84)], PALETTE.uiAccent);
  solid(g, [circ(128, 144, 62)], PALETTE.uiPanel, 5);
  // Сектор «прошло время»: от 12 часов до 3.
  const sector: Pt[] = [pt(128, 144)];
  for (let i = 0; i <= 10; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 10);
    sector.push(pt(128 + Math.cos(a) * 54, 144 + Math.sin(a) * 54));
  }
  paint(g, [poly(sector)], PALETTE.flowerPink);
  // Засечки на 12, 3, 6, 9.
  ink(g, 128, 94, 128, 108, 6);
  ink(g, 128, 180, 128, 194, 6);
  ink(g, 78, 144, 92, 144, 6);
  ink(g, 164, 144, 178, 144, 6);
  // Стрелка и ось.
  ink(g, 128, 144, 128, 96, 8);
  paint(g, [circ(128, 144, 11)], OUTLINE);
  paint(g, [circ(128, 144, 4)], PALETTE.gold);
  shine(g, 80, 96, 34, 14, 0.5);
}

/** 10. Шарф болельщика: волнистая полосатая лента с бахромой на концах. */
export function drawScarf(g: Gfx): void {
  const x0 = 56;
  const x1 = 200;
  const half = 34;
  const centerY = (t: number): number => 126 + Math.sin(t * Math.PI * 2) * 22;
  const edge = (t: number, side: number): Pt => pt(x0 + (x1 - x0) * t, centerY(t) + side * half);
  const steps = 24;
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    top.push(edge(i / steps, -1));
    bottom.push(edge(i / steps, 1));
  }
  // Бахрома на обоих концах.
  for (const dy of [-22, 0, 22]) {
    solid(g, [capsule(x0 + 4, centerY(0) + dy, 26, centerY(0) + dy + 4, 12)], RED, 5);
    solid(g, [capsule(x1 - 4, centerY(1) + dy, 230, centerY(1) + dy - 4, 12)], RED, 5);
  }
  const strip = poly([...top, ...bottom.slice().reverse()]);
  solid(g, [strip], RED);
  // Белые полосы поперёк ленты.
  for (const [a, b] of [
    [0.12, 0.22],
    [0.42, 0.52],
    [0.72, 0.82],
  ] as const) {
    const quadPts: Pt[] = [];
    for (let i = 0; i <= 3; i += 1) quadPts.push(edge(a + ((b - a) * i) / 3, -1));
    for (let i = 3; i >= 0; i -= 1) quadPts.push(edge(a + ((b - a) * i) / 3, 1));
    paint(g, [poly(quadPts)], WHITE);
  }
  shine(g, 100, 98, 50, 10, 0.35);
}

/** 11. Бутылка воды: прозрачный корпус с голубой водой, оранжевая крышка. */
export function drawBottle(g: Gfx): void {
  const body = rr(72, 78, 112, 148, 30);
  solid(g, [rr(104, 52, 48, 36, 10), rr(94, 22, 68, 38, 14), body], PALETTE.uiPanel);
  // Вода: нижние углы совпадают с корпусом.
  paint(g, [rr(72, 132, 112, 94, { tl: 0, tr: 0, bl: 30, br: 30 })], PALETTE.uiAccent);
  paint(g, [rr(72, 124, 112, 14, 7)], PALETTE.waterLight);
  paint(g, [circ(112, 176, 7), circ(146, 196, 5), circ(138, 160, 4)], PALETTE.waterLight);
  // Крышка с кольцом.
  paint(g, [rr(94, 22, 68, 38, 14)], PALETTE.uiButton);
  paint(g, [rr(94, 46, 68, 12, 6)], PALETTE.uiButtonDark);
  shine(g, 90, 108, 10, 40, 0.7);
}

export const FOOT_DRAW: ReadonlyArray<(g: Gfx) => void> = [
  drawBall,
  (g) => drawBoot(g, PALETTE.uiAccent, PALETTE.uiPanel),
  drawWhistle,
  drawTrophy,
  drawGlove,
  drawFlag,
  drawGoal,
  drawCone,
  drawMedal,
  drawStopwatch,
  drawScarf,
  drawBottle,
];
