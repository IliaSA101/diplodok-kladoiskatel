/**
 * Наклейки-награды: рамка, картинка внутри и диплодок в разных позах.
 *
 * Наклеек столько же, сколько узлов в квесте, — по одной за задачку.
 * Порядок совпадает с TEX.STICKER. Примитивы — в gfx.ts, значки — в footIcons.ts.
 */
import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX } from './keys';
import {
  ICON_SIZE,
  OUTLINE,
  WHITE,
  arcPoints,
  bake,
  capsule,
  circ,
  ell,
  ink,
  mesh,
  paint,
  place,
  poly,
  pt,
  quad,
  rr,
  shine,
  solid,
  stamp,
  starPoints,
  tube,
  type Gfx,
  type Pt,
} from './gfx';
import {
  drawBall,
  drawBoot,
  drawBottle,
  drawCone,
  drawFlag,
  drawGlove,
  drawGoal,
  drawMedal,
  drawScarf,
  drawStopwatch,
  drawTrophy,
  drawWhistle,
} from './footIcons';

/** Насколько значок меньше поля наклейки. */
const STICKER_ICON_SCALE = 0.78;

interface DinoPose {
  head: Pt;
  neckBend: Pt;
}

/** Диплодок в локальных координатах: центр тела в (0, 18), хвост слева, шея вправо-вверх. */
function drawDino(g: Gfx, pose: DinoPose): void {
  const { head, neckBend } = pose;
  const tail = tube(quad(pt(-50, 22), pt(-92, 56), pt(-106, 2), 22, 5));
  const legs = [rr(-46, 46, 30, 38, 12), rr(18, 46, 30, 38, 12)];
  const body = ell(0, 18, 132, 84);
  const neck = tube(quad(pt(34, 6), neckBend, pt(head.x - 6, head.y + 6), 19, 12));
  const skull = ell(head.x + 6, head.y, 56, 38);
  solid(g, [tail, ...legs, body, neck, skull], PALETTE.dinoBody);
  // Брюшко и пятна на спине.
  paint(g, [ell(0, 36, 92, 30)], PALETTE.dinoBelly);
  paint(g, [circ(-22, -6, 9), circ(14, -12, 7)], PALETTE.dinoSpot);
  // Глаз и улыбка.
  paint(g, [circ(head.x + 14, head.y - 5, 7)], PALETTE.dinoEye);
  paint(g, [circ(head.x + 16, head.y - 8, 2.5)], PALETTE.dinoEyeWhite);
  g.lineStyle(4, PALETTE.dinoSmile, 1);
  g.beginPath();
  g.arc(head.x + 18, head.y + 2, 9, 0.35, 1.9);
  g.strokePath();
}

/** Наклейка «диплодок бьёт головой по мячу». */
function drawHeader(g: Gfx): void {
  place(g, 117, 147, 0.72, (l) => {
    // Лучи удара у мяча.
    for (const [x1, y1, x2, y2] of [
      [52, -112, 36, -128],
      [72, -124, 66, -144],
      [18, -92, -4, -102],
    ] as const) {
      ink(l, x1, y1, x2, y2, 9, PALETTE.gold);
    }
    drawDino(l, { head: pt(56, -72), neckBend: pt(84, -18) });
    stamp(l, 98, -98, 0.36, drawBall);
  });
}

/** Наклейка «диплодок-вратарь»: ворота за спиной, перчатки подняты. */
function drawKeeper(g: Gfx): void {
  // Ворота позади диплодока.
  mesh(g, 58, 62, 140, 96, 24, 3, PALETTE.uiPanel);
  solid(g, [rr(48, 50, 160, 14, 7), rr(48, 50, 14, 150, 7), rr(194, 50, 14, 150, 7)], WHITE, 4);
  place(g, 112, 150, 0.66, (l) => {
    drawDino(l, { head: pt(46, -66), neckBend: pt(70, -20) });
    // Две руки в перчатках: одна высоко, другая в сторону.
    for (const [gx, gy] of [
      [92, -22],
      [96, 30],
    ] as const) {
      solid(l, [capsule(28, gy < 0 ? -2 : 20, gx, gy, 18)], PALETTE.dinoBody);
      solid(l, [circ(gx, gy, 19)], PALETTE.uiButton);
      shine(l, gx - 5, gy - 6, 12, 8, 0.6);
    }
  });
}

// -------------------------------------------------------------- sticker art

/** Кубок-чаша: широкая чаша на ножке с розовым поясом. */
function drawCup(g: Gfx): void {
  solid(g, [tube(arcPoints(54, 92, 24, Math.PI * 0.5, Math.PI * 1.5, 7, 10))], PALETTE.goldDark);
  solid(g, [tube(arcPoints(202, 92, 24, -Math.PI * 0.5, Math.PI * 0.5, 7, 10))], PALETTE.goldDark);
  solid(g, [ell(128, 204, 120, 34)], PALETTE.goldDark);
  solid(g, [rr(110, 138, 36, 50, 8)], PALETTE.gold);
  solid(g, [rr(48, 40, 160, 108, { tl: 8, tr: 8, bl: 80, br: 80 })], PALETTE.gold);
  paint(g, [rr(48, 78, 160, 20, 0)], PALETTE.flowerPink);
  paint(g, [rr(48, 40, 160, 16, { tl: 8, tr: 8, bl: 0, br: 0 })], PALETTE.goldDark);
  shine(g, 82, 112, 20, 42, 0.5);
}

/** След динозавра: пятка и три толстых пальца с коготками. */
function drawFootprint(g: Gfx): void {
  const toes: Array<[number, number, number, number]> = [
    [98, 162, 80, 108],
    [128, 150, 128, 84],
    [158, 162, 176, 108],
  ];
  const claws: Pt[][] = toes.map(([x1, y1, x2, y2]) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;
    return [pt(x2 + dx * 34, y2 + dy * 34), pt(x2 - dy * 12, y2 + dx * 12), pt(x2 + dy * 12, y2 - dx * 12)];
  });
  for (const claw of claws) solid(g, [poly(claw)], PALETTE.bone, 4);
  solid(g, [ell(128, 176, 76, 56), ...toes.map(([x1, y1, x2, y2]) => capsule(x1, y1, x2, y2, 32))], PALETTE.soil);
  paint(g, [ell(114, 168, 26, 14), ell(86, 128, 12, 20), ell(124, 106, 12, 20), ell(172, 128, 12, 20)], PALETTE.soilLight);
}

/** Капитанская повязка: широкая оранжевая лента с белыми кантами и золотой звездой, чуть наклонена. */
function drawCaptain(g: Gfx): void {
  stamp(g, 128, 128, 1, (l) => {
    l.translateCanvas(128, 128);
    l.rotateCanvas(-0.16);
    l.translateCanvas(-128, -128);
    // Резинка-подкладка снизу придаёт ленте объём.
    solid(l, [rr(52, 100, 152, 82, 24)], PALETTE.uiButtonDark);
    solid(l, [rr(52, 88, 152, 82, 24)], PALETTE.uiButton);
    paint(l, [rr(52, 98, 152, 11, 0), rr(52, 149, 152, 11, 0)], PALETTE.uiPanel);
    solid(l, [poly(starPoints(128, 130, 30, 14, 5))], PALETTE.gold, 5);
    shine(l, 90, 96, 40, 10, 0.4);
  });
}

/** Звезда с искорками. */
function drawStarBig(g: Gfx): void {
  const pts = starPoints(128, 132, 76, 36, 5);
  solid(g, [poly(pts)], PALETTE.gold);
  shine(g, 104, 96, 26, 12, 0.6);
  // Четырёхлучевые искорки по углам поля.
  for (const [x, y, r] of [
    [62, 66, 14],
    [196, 74, 11],
    [190, 190, 14],
  ] as const) {
    paint(g, [poly(starPoints(x, y, r, r * 0.3, 4))], WHITE);
  }
}

interface StickerSpec {
  /** Цвет поля внутри рамки. */
  field: number;
  draw: (g: Gfx) => void;
}

/** Нарисовать значок по центру поля наклейки. */
const icon =
  (draw: (g: Gfx) => void, dy = 0): ((g: Gfx) => void) =>
  (g) => {
    stamp(g, 128, 128 + dy, STICKER_ICON_SCALE, draw);
  };

/** Два значка рядом: для наклеек второго и третьего круга. */
const pair =
  (left: (g: Gfx) => void, right: (g: Gfx) => void): ((g: Gfx) => void) =>
  (g) => {
    stamp(g, 96, 112, 0.5, left);
    stamp(g, 164, 148, 0.5, right);
  };

/** Диплодок бежит с мячом у ног. */
function drawRunner(g: Gfx): void {
  place(g, 120, 150, 0.68, (l) => {
    drawDino(l, { head: pt(62, -58), neckBend: pt(86, -8) });
    stamp(l, -16, 78, 0.34, drawBall);
  });
}

/** Диплодок с флажком на хвосте: победный круг почёта. */
function drawLapRunner(g: Gfx): void {
  place(g, 124, 152, 0.66, (l) => {
    drawDino(l, { head: pt(58, -64), neckBend: pt(84, -14) });
    stamp(l, -118, -40, 0.42, drawFlag);
  });
}

/** Три звезды в ряд: награда за целый круг. */
function drawThreeStars(g: Gfx): void {
  for (const [x, y, r] of [
    [72, 150, 38],
    [128, 112, 50],
    [184, 150, 38],
  ] as const) {
    solid(g, [poly(starPoints(x, y, r, r * 0.44, 5))], PALETTE.gold);
  }
  shine(g, 112, 90, 26, 12, 0.6);
}

/**
 * Двадцать четыре наклейки в порядке TEX.STICKER — по одной за узел квеста.
 *
 * Первые восемь выдаёт первый круг, вторые восемь — второй, последние —
 * третий, поэтому в альбоме они и лежат тремя рядами.
 */
const STICKERS: readonly StickerSpec[] = [
  // Круг первый: мяч, свисток, бутса — с чего игра начинается.
  { field: PALETTE.sky, draw: drawHeader },
  { field: PALETTE.flowerBlue, draw: icon(drawBall) },
  { field: PALETTE.flowerYellow, draw: icon(drawWhistle, 4) },
  { field: PALETTE.grassMid, draw: icon((g) => drawBoot(g, PALETTE.gold, PALETTE.goldDark)) },
  { field: PALETTE.sky, draw: icon(drawFlag) },
  { field: PALETTE.grassLight, draw: icon(drawCone) },
  { field: PALETTE.stumpTop, draw: drawFootprint },
  { field: PALETTE.skyDeep, draw: icon(drawGoal) },
  // Круг второй: снаряжение посложнее и первые награды.
  { field: PALETTE.grassLight, draw: drawKeeper },
  { field: PALETTE.flowerPink, draw: icon(drawGlove) },
  { field: PALETTE.sky, draw: icon(drawStopwatch) },
  { field: PALETTE.grassMid, draw: icon(drawScarf) },
  { field: PALETTE.flowerYellow, draw: icon(drawBottle) },
  { field: PALETTE.skyDeep, draw: icon(drawTrophy) },
  { field: PALETTE.sky, draw: icon(drawMedal, 2) },
  { field: PALETTE.flowerBlue, draw: drawRunner },
  // Круг третий: всё награды и диплодок-чемпион.
  { field: PALETTE.flowerPink, draw: icon(drawCup) },
  { field: PALETTE.skyDeep, draw: drawStarBig },
  { field: PALETTE.grassLight, draw: drawCaptain },
  { field: PALETTE.grassMid, draw: drawLapRunner },
  { field: PALETTE.sky, draw: pair(drawBall, (g) => drawBoot(g, PALETTE.gold, PALETTE.goldDark)) },
  { field: PALETTE.flowerYellow, draw: pair(drawTrophy, drawMedal) },
  { field: PALETTE.flowerBlue, draw: pair(drawWhistle, drawCone) },
  { field: PALETTE.gold, draw: drawThreeStars },
];

/** Рамка наклейки: тень, тёмный контур, толстая белая рамка, тонкая золотая кайма, цветное поле. */
function drawStickerFrame(g: Gfx, field: number): void {
  g.fillStyle(OUTLINE, 0.2);
  g.fillRoundedRect(10, 14, 240, 238, 50);
  paint(g, [rr(8, 8, 240, 240, 46)], OUTLINE, 4);
  paint(g, [rr(8, 8, 240, 240, 46)], WHITE);
  paint(g, [rr(30, 30, 196, 196, 30)], PALETTE.gold);
  paint(g, [rr(35, 35, 186, 186, 26)], field);
  // Светлая полоса сверху для объёма.
  g.fillStyle(WHITE, 0.2);
  g.fillRoundedRect(40, 40, 176, 40, { tl: 22, tr: 22, bl: 20, br: 20 });
}

/** Процедурные наклейки: запекаются только те ключи, которых ещё нет. */
export function generateStickerTextures(scene: Phaser.Scene): void {
  TEX.STICKER.forEach((key, i) => {
    const spec = STICKERS[i];
    if (!spec) return;
    bake(scene, key, ICON_SIZE, ICON_SIZE, (g) => {
      drawStickerFrame(g, spec.field);
      spec.draw(g);
    });
  });
}
