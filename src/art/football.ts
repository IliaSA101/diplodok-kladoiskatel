/**
 * Процедурные заглушки футбольного квеста: сборка всех текстур.
 *
 * Настоящий ИИ-арт подменяет их по тем же ключам (TEX.FOOT, TEX.STICKER, ...),
 * поэтому каждая текстура запекается только если такого ключа ещё нет.
 * Сами рисунки — в footIcons.ts и stickers.ts, примитивы — в gfx.ts.
 */
import Phaser from 'phaser';
import { PALETTE } from './palette';
import { TEX } from './keys';
import { makeRng } from '../systems/rng';
import { ICON_SIZE, OUTLINE, WHITE, bake, circ, paint, rr, shine, type Gfx } from './gfx';
import { FOOT_DRAW } from './footIcons';
import { generateStickerTextures } from './stickers';

const NODE_SIZE = 160;
const CARD_SIZE = 180;
const LETTER_SIZE = 140;

function drawNodeDisc(g: Gfx): void {
  const rim = circ(80, 84, 70);
  const face = circ(80, 76, 68);
  // Тёмный ободок снизу, основной круг, светлый блик сверху — как у круглых кнопок.
  paint(g, [rim, face], OUTLINE, 5);
  paint(g, [rim], PALETTE.stumpTop);
  paint(g, [face], PALETTE.uiPanel);
  shine(g, 80, 40, 88, 32, 0.55);
  shine(g, 80, 52, 112, 60, 0.18);
}

/**
 * Плитка со скруглёнными углами: тёмный контур, «толщина» снизу, кремовое поле,
 * тёплая рамка и блик сверху. Мелкая детерминированная «древесина» — по seed.
 */
function drawTile(g: Gfx, size: number, radius: number, depth: number, seed: number): void {
  const m = 4;
  const side = size - m * 2;
  const faceH = side - depth;
  const edge = rr(m, m + depth, side, faceH, radius);
  const face = rr(m, m, side, faceH, radius);
  paint(g, [edge, face], OUTLINE, 4);
  paint(g, [edge], PALETTE.soilLight);
  paint(g, [face], PALETTE.uiPanel);
  // Тёплая рамка по краю поля.
  g.lineStyle(5, PALETTE.stumpTop, 1);
  g.strokeRoundedRect(m + 9, m + 9, side - 18, faceH - 18, Math.max(6, radius - 9));
  // Тихая фактура: несколько светлых и тёплых штрихов по полю.
  const rng = makeRng(seed);
  for (let i = 0; i < 6; i += 1) {
    const y = rng.range(m + 20, m + faceH - 20);
    const x = rng.range(m + 20, m + side - 70);
    g.lineStyle(4, i % 2 === 0 ? PALETTE.uiPanelShadow : WHITE, 0.4);
    g.lineBetween(x, y, x + rng.range(20, 46), y);
  }
  shine(g, size / 2, m + 16, side * 0.6, 12, 0.6);
}

/** Узор рубашки: круг с пятиугольниками, похожий на мяч, но плоский и тихий. */
function drawCardDownMark(g: Gfx, size: number): void {
  const c = size / 2;
  const r = size * 0.26;
  paint(g, [circ(c, c, r)], OUTLINE, 5);
  paint(g, [circ(c, c, r)], PALETTE.uiButtonCalm);
  // Три кружка-«заплатки» по кругу: узнаваемо и не отвлекает от лица карточки.
  g.fillStyle(PALETTE.uiText, 0.5);
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    g.fillCircle(c + Math.cos(a) * r * 0.46, c + Math.sin(a) * r * 0.46, r * 0.3);
  }
  shine(g, c, c - r * 0.5, r * 1.1, r * 0.4, 0.45);
}

// ------------------------------------------------------------------- public

/** Процедурные заглушки футбольного квеста. Идемпотентно; уже существующие ключи не перерисовывает. */
export function generateFootballTextures(scene: Phaser.Scene): void {
  TEX.FOOT.forEach((key, i) => {
    const draw = FOOT_DRAW[i];
    if (draw) bake(scene, key, ICON_SIZE, ICON_SIZE, draw);
  });

  generateStickerTextures(scene);

  bake(scene, TEX.NODE_DISC, NODE_SIZE, NODE_SIZE, drawNodeDisc);
  // Подложка карточки маджонга: больше «толщины» и крупнее скругление.
  bake(scene, TEX.CARD_BACK, CARD_SIZE, CARD_SIZE, (g) => {
    drawTile(g, CARD_SIZE, 34, 14, 8801);
  });
  // Рубашка карточки Memory: та же плитка, но с «мячиком» по центру —
  // ребёнку сразу видно, что карточка лежит лицом вниз.
  bake(scene, TEX.CARD_DOWN, CARD_SIZE, CARD_SIZE, (g) => {
    drawTile(g, CARD_SIZE, 34, 14, 8803);
    drawCardDownMark(g, CARD_SIZE);
  });
  // Плашка буквы: пустая, букву кладёт сцена.
  bake(scene, TEX.LETTER_TILE, LETTER_SIZE, LETTER_SIZE, (g) => {
    drawTile(g, LETTER_SIZE, 28, 12, 8802);
  });
}
