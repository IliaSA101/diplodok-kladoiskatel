/**
 * Интерфейс, нарисованный кодом: круглые кнопки, иконки, панель, ячейка коллекции,
 * метка тапа — и маленькие фабрики для кнопки, панели и текста в стиле игры.
 */
import Phaser from 'phaser';
import { CONFIG } from '../config';
import { audio } from '../audio/AudioEngine';
import { PALETTE, hex } from './palette';
import { TEX } from './keys';

// ---------- Рисование текстур ----------

const BTN_SIZE = 140;
const ICON_SIZE = 96;
/** Толщина тёмной обводки иконок (с каждой стороны), px. */
const ICON_OUTLINE = 4;

function newGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

/** Круглая кнопка: тёмный ободок снизу, основной круг, светлый блик сверху. */
function drawButton(scene: Phaser.Scene, key: string, main: number, dark: number): void {
  const g = newGraphics(scene);
  g.fillStyle(dark, 1);
  g.fillCircle(70, 74, 66);
  g.fillStyle(main, 1);
  g.fillCircle(70, 66, 64);
  g.fillStyle(0xffffff, 0.3);
  g.fillEllipse(70, 32, 78, 32);
  g.fillStyle(0xffffff, 0.12);
  g.fillEllipse(70, 44, 104, 58);
  g.generateTexture(key, BTN_SIZE, BTN_SIZE);
  g.destroy();
}

/** Плитка панели 64x64 под nineslice: углы по 20px, снизу полоска тени. */
function drawPanel(scene: Phaser.Scene): void {
  const g = newGraphics(scene);
  g.fillStyle(PALETTE.uiPanelShadow, 1);
  g.fillRoundedRect(0, 4, 64, 60, 20);
  g.fillStyle(PALETTE.uiPanel, 1);
  g.fillRoundedRect(0, 0, 64, 58, 20);
  g.lineStyle(4, PALETTE.uiPanelShadow, 1);
  g.strokeRoundedRect(2, 2, 60, 54, 18);
  g.generateTexture(TEX.PANEL, 64, 64);
  g.destroy();
}

/** Ячейка коллекции 180x180: кремовый квадрат с «вдавленной» тенью сверху. */
function drawSlot(scene: Phaser.Scene): void {
  const g = newGraphics(scene);
  g.fillStyle(PALETTE.uiPanelShadow, 1);
  g.fillRoundedRect(0, 0, 180, 180, 34);
  g.fillStyle(PALETTE.uiPanel, 1);
  g.fillRoundedRect(6, 14, 168, 160, 28);
  g.lineStyle(4, PALETTE.uiPanelShadow, 1);
  g.strokeRoundedRect(2, 2, 176, 176, 32);
  g.generateTexture(TEX.SLOT, 180, 180);
  g.destroy();
}

/** Метка тапа: кольцо из uiAccent. */
function drawTapMark(scene: Phaser.Scene): void {
  const g = newGraphics(scene);
  g.fillStyle(PALETTE.uiAccent, 0.18);
  g.fillCircle(48, 48, 40);
  g.lineStyle(9, PALETTE.uiAccent, 1);
  g.strokeCircle(48, 48, 38);
  g.generateTexture(TEX.TAP_MARK, ICON_SIZE, ICON_SIZE);
  g.destroy();
}

// --- Фигуры для иконок: каждая умеет «раздуться» на grow px (для обводки) ---

type Shape = (g: Phaser.GameObjects.Graphics, grow: number) => void;

interface Pt {
  x: number;
  y: number;
}

function circle(cx: number, cy: number, r: number): Shape {
  return (g, grow) => {
    g.fillCircle(cx, cy, r + grow);
  };
}

function rrect(x: number, y: number, w: number, h: number, r: number): Shape {
  return (g, grow) => {
    g.fillRoundedRect(x - grow, y - grow, w + grow * 2, h + grow * 2, r + grow);
  };
}

/** Толстый отрезок с круглыми концами. */
function capsule(x1: number, y1: number, x2: number, y2: number, w: number): Shape {
  return (g, grow) => {
    const r = w / 2 + grow;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = (-dy / len) * r;
      const ny = (dx / len) * r;
      g.fillPoints(
        [
          { x: x1 + nx, y: y1 + ny },
          { x: x2 + nx, y: y2 + ny },
          { x: x2 - nx, y: y2 - ny },
          { x: x1 - nx, y: y1 - ny },
        ],
        true,
      );
    }
    g.fillCircle(x1, y1, r);
    g.fillCircle(x2, y2, r);
  };
}

/** Дуга окружности толщиной w (углы в градусах, 0 — вправо, по часовой). */
function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, w: number): Shape {
  const steps = 12;
  const segments: Shape[] = [];
  for (let i = 0; i < steps; i++) {
    const a0 = Phaser.Math.DegToRad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    const a1 = Phaser.Math.DegToRad(fromDeg + ((toDeg - fromDeg) * (i + 1)) / steps);
    segments.push(
      capsule(
        cx + Math.cos(a0) * r,
        cy + Math.sin(a0) * r,
        cx + Math.cos(a1) * r,
        cy + Math.sin(a1) * r,
        w,
      ),
    );
  }
  return (g, grow) => {
    for (const seg of segments) seg(g, grow);
  };
}

/** Волнистая линия толщиной w: синусоида из коротких отрезков (periods — число волн). */
function wave(x1: number, x2: number, y: number, amp: number, periods: number, w: number): Shape {
  const steps = 16;
  const segments: Shape[] = [];
  const at = (i: number): Pt => ({
    x: x1 + ((x2 - x1) * i) / steps,
    y: y + Math.sin((i / steps) * periods * Math.PI * 2) * amp,
  });
  for (let i = 0; i < steps; i++) {
    const a = at(i);
    const b = at(i + 1);
    segments.push(capsule(a.x, a.y, b.x, b.y, w));
  }
  return (g, grow) => {
    for (const seg of segments) seg(g, grow);
  };
}

/** Многоугольник со скруглёнными углами (радиус r вокруг опорных точек). */
function roundedPoly(points: Pt[], r: number): Shape {
  const edges: Shape[] = points.map((p, i) => {
    const q = points[(i + 1) % points.length] as Pt;
    return capsule(p.x, p.y, q.x, q.y, r * 2);
  });
  return (g, grow) => {
    g.fillPoints(points, true);
    for (const edge of edges) edge(g, grow);
  };
}

/** Иконка: тёмная обводка, кремовая заливка, поверх — тёмные детали. */
function drawIcon(scene: Phaser.Scene, key: string, shapes: Shape[], details: Shape[] = []): void {
  // Иконка уже запечена при предыдущем вызове — не трогаем.
  if (scene.textures.exists(key)) return;
  const g = newGraphics(scene);
  g.fillStyle(PALETTE.uiText, 1);
  for (const s of shapes) s(g, ICON_OUTLINE);
  g.fillStyle(PALETTE.uiPanel, 1);
  for (const s of shapes) s(g, 0);
  g.fillStyle(PALETTE.uiText, 1);
  for (const s of details) s(g, 0);
  g.generateTexture(key, ICON_SIZE, ICON_SIZE);
  g.destroy();
}

/** Динамик (корпус и раструб) — общая часть иконок звука. */
function speakerShapes(): Shape[] {
  return [
    rrect(14, 38, 16, 20, 4),
    roundedPoly(
      [
        { x: 30, y: 39 },
        { x: 46, y: 26 },
        { x: 46, y: 70 },
        { x: 30, y: 57 },
      ],
      4,
    ),
  ];
}

function drawIcons(scene: Phaser.Scene): void {
  // Лопата: ручка с перекладиной и круглый совок.
  drawIcon(scene, TEX.ICON_SHOVEL, [
    capsule(66, 22, 40, 54, 10),
    capsule(57, 14, 76, 30, 9),
    circle(30, 66, 17),
  ]);

  // Веточка с листиками: стебель, три листа и верхушка.
  drawIcon(
    scene,
    TEX.ICON_LEAF,
    [
      capsule(28, 84, 62, 24, 8),
      capsule(40, 62, 16, 56, 16),
      capsule(47, 52, 76, 56, 16),
      capsule(55, 36, 30, 26, 16),
      circle(64, 22, 11),
    ],
    [capsule(37, 61, 24, 57, 4), capsule(51, 52, 68, 55, 4), capsule(52, 35, 38, 29, 4)],
  );

  // Рюкзак: ручка-петля, корпус, боковые кармашки, клапан и застёжка.
  drawIcon(
    scene,
    TEX.ICON_BACKPACK,
    [rrect(36, 12, 24, 30, 12), rrect(16, 56, 12, 22, 6), rrect(68, 56, 12, 22, 6), rrect(24, 34, 48, 52, 18)],
    [circle(48, 24, 5), capsule(31, 54, 65, 54, 4), rrect(43, 61, 10, 12, 4)],
  );

  // Динамик с волнами.
  drawIcon(scene, TEX.ICON_SOUND_ON, [
    ...speakerShapes(),
    arc(50, 48, 16, -48, 48, 7),
    arc(50, 48, 30, -48, 48, 7),
  ]);

  // Динамик, перечёркнутый крестиком.
  drawIcon(scene, TEX.ICON_SOUND_OFF, [
    ...speakerShapes(),
    capsule(62, 36, 86, 60, 8),
    capsule(62, 60, 86, 36, 8),
  ]);

  // Треугольник «играть».
  drawIcon(scene, TEX.ICON_PLAY, [
    roundedPoly(
      [
        { x: 36, y: 28 },
        { x: 36, y: 68 },
        { x: 68, y: 48 },
      ],
      10,
    ),
  ]);

  // Круглая стрелка «ещё раз»: дуга по часовой и наконечник на её конце.
  const cx = 48;
  const cy = 50;
  const r = 26;
  const endDeg = 240;
  const endRad = Phaser.Math.DegToRad(endDeg);
  const ex = cx + Math.cos(endRad) * r;
  const ey = cy + Math.sin(endRad) * r;
  // Касательная по часовой стрелке и нормаль к окружности в конце дуги.
  const tx = -Math.sin(endRad);
  const ty = Math.cos(endRad);
  const nx = Math.cos(endRad);
  const ny = Math.sin(endRad);
  drawIcon(scene, TEX.ICON_AGAIN, [
    arc(cx, cy, r, -30, endDeg, 12),
    roundedPoly(
      [
        { x: ex + tx * 16, y: ey + ty * 16 },
        { x: ex - tx * 2 + nx * 13, y: ey - ty * 2 + ny * 13 },
        { x: ex - tx * 2 - nx * 13, y: ey - ty * 2 - ny * 13 },
      ],
      3,
    ),
  ]);

  // Стрелка влево.
  drawIcon(scene, TEX.ICON_BACK, [
    capsule(30, 48, 72, 48, 12),
    capsule(30, 48, 52, 25, 12),
    capsule(30, 48, 52, 71, 12),
  ]);

  // «Толкнуть камень»: округлый камень с трещинками и короткая толстая стрелка, упирающаяся в него.
  drawIcon(
    scene,
    TEX.ICON_PUSH,
    [
      roundedPoly(
        [
          { x: 64, y: 32 },
          { x: 78, y: 30 },
          { x: 86, y: 48 },
          { x: 82, y: 68 },
          { x: 66, y: 70 },
          { x: 54, y: 58 },
          { x: 54, y: 42 },
        ],
        6,
      ),
      capsule(12, 50, 22, 50, 14),
      roundedPoly(
        [
          { x: 16, y: 32 },
          { x: 16, y: 68 },
          { x: 36, y: 50 },
        ],
        5,
      ),
    ],
    [capsule(66, 41, 74, 51, 4), capsule(74, 51, 69, 62, 4)],
  );

  // «Достать из воды»: крупная капля с бликом и две волнистые линии под ней.
  drawIcon(
    scene,
    TEX.ICON_WATER,
    [
      circle(48, 38, 16),
      roundedPoly(
        [
          { x: 48, y: 12 },
          { x: 33, y: 34 },
          { x: 63, y: 34 },
        ],
        4,
      ),
      wave(12, 78, 70, 3.5, 2, 6),
      wave(20, 86, 85, 3.5, 2, 6),
    ],
    [arc(48, 39, 9, 195, 255, 4)],
  );

  // Корона: три зубца с камнями-кружками на концах, ободок с самоцветами.
  drawIcon(
    scene,
    TEX.ICON_CROWN,
    [
      roundedPoly(
        [
          { x: 18, y: 77 },
          { x: 14, y: 39 },
          { x: 34, y: 57 },
          { x: 48, y: 33 },
          { x: 62, y: 57 },
          { x: 82, y: 39 },
          { x: 78, y: 77 },
        ],
        4,
      ),
      rrect(14, 69, 68, 16, 6),
      circle(14, 34, 7),
      circle(48, 25, 8),
      circle(82, 34, 7),
    ],
    [
      circle(14, 34, 3),
      circle(48, 25, 3.5),
      circle(82, 34, 3),
      capsule(20, 69, 76, 69, 4),
      circle(31, 77, 3.5),
      circle(48, 77, 3.5),
      circle(65, 77, 3.5),
    ],
  );

  // «Дальше»: толстая блочная стрелка вправо с хвостом-древком.
  drawIcon(scene, TEX.ICON_NEXT, [
    roundedPoly(
      [
        { x: 12, y: 38 },
        { x: 50, y: 38 },
        { x: 50, y: 22 },
        { x: 84, y: 48 },
        { x: 50, y: 74 },
        { x: 50, y: 58 },
        { x: 12, y: 58 },
      ],
      4,
    ),
  ]);

  // «Выбрать лес»: свёрнутая гармошкой карта со сгибами, точкой-меткой и крестиком клада.
  drawIcon(
    scene,
    TEX.ICON_MAP,
    [
      roundedPoly(
        [
          { x: 10, y: 24 },
          { x: 34, y: 32 },
          { x: 60, y: 22 },
          { x: 86, y: 30 },
          { x: 86, y: 72 },
          { x: 60, y: 64 },
          { x: 34, y: 74 },
          { x: 10, y: 66 },
        ],
        3,
      ),
    ],
    [
      capsule(34, 32, 34, 74, 4),
      capsule(60, 22, 60, 64, 4),
      circle(47, 46, 6),
      capsule(67, 45, 79, 57, 4),
      capsule(67, 57, 79, 45, 4),
    ],
  );
}

/**
 * Текстуры интерфейса: кнопки, иконки, панель, метка тапа. Один раз в BootScene.
 * Безопасно вызывать повторно: каждая группа проверяет свои ключи отдельно,
 * а каждая иконка — свой (см. drawIcon), так что дозапекаются только недостающие.
 */
export function generateUiTextures(scene: Phaser.Scene): void {
  const has = (key: string): boolean => scene.textures.exists(key);
  if (!has(TEX.BTN_WARM)) drawButton(scene, TEX.BTN_WARM, PALETTE.uiButton, PALETTE.uiButtonDark);
  if (!has(TEX.BTN_CALM)) drawButton(scene, TEX.BTN_CALM, PALETTE.uiButtonCalm, PALETTE.uiButtonCalmDark);
  if (!has(TEX.PANEL)) drawPanel(scene);
  if (!has(TEX.SLOT)) drawSlot(scene);
  if (!has(TEX.TAP_MARK)) drawTapMark(scene);
  drawIcons(scene);
}

// ---------- Фабрики объектов ----------

export interface RoundButtonOptions {
  /** Радиус, по умолчанию CONFIG.ui.buttonRadius. */
  radius?: number;
  /** 'warm' — активная оранжевая, 'calm' — приглушённая серая. По умолчанию 'warm'. */
  tone?: 'warm' | 'calm';
  /** Масштаб иконки внутри кнопки, по умолчанию 1. */
  iconScale?: number;
}

export interface RoundButton {
  readonly container: Phaser.GameObjects.Container;
  /** Выключенная кнопка не реагирует и выглядит приглушённой, но НЕ исчезает. */
  setEnabled(enabled: boolean): void;
  setIcon(iconKey: string): void;
  setTone(tone: 'warm' | 'calm'): void;
  /** Проиграть нажатие программно — нужно для управления с клавиатуры (Пробел). */
  press(): void;
  destroy(): void;
}

function buttonTexture(tone: 'warm' | 'calm'): string {
  return tone === 'warm' ? TEX.BTN_WARM : TEX.BTN_CALM;
}

export function createRoundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  iconKey: string,
  onPress: () => void,
  options: RoundButtonOptions = {},
): RoundButton {
  const radius = options.radius ?? CONFIG.ui.buttonRadius;
  const iconScale = options.iconScale ?? 1;
  // Текстура рассчитана на радиус 70; остальные размеры получаем масштабом.
  const k = radius / (BTN_SIZE / 2);

  const bg = scene.add.image(0, 0, buttonTexture(options.tone ?? 'warm')).setScale(k);
  // Круг кнопки в текстуре чуть выше центра (тёмный ободок снизу) — иконку поднимаем так же.
  const icon = scene.add.image(0, -4 * k, iconKey).setScale(k * 0.8 * iconScale);
  // «Тело» кнопки анимируется отдельно, чтобы зона нажатия не дрожала.
  const body = scene.add.container(0, 0, [bg, icon]);
  const container = scene.add.container(x, y, [body]);

  container.setInteractive({
    hitArea: new Phaser.Geom.Circle(0, 0, radius),
    hitAreaCallback: Phaser.Geom.Circle.Contains,
    useHandCursor: true,
  });

  let enabled = true;

  const press = (): void => {
    if (!enabled) return;
    audio.play('tap');
    scene.tweens.killTweensOf(body);
    body.setScale(0.9);
    scene.tweens.add({ targets: body, scale: 1, duration: 240, ease: 'Back.easeOut' });
    onPress();
  };

  // Именно pointerdown: ребёнку нужен мгновенный отклик.
  container.on(Phaser.Input.Events.POINTER_DOWN, press);

  return {
    container,
    setEnabled(value: boolean): void {
      enabled = value;
      body.setAlpha(value ? 1 : 0.5);
      if (value) container.setInteractive();
      else container.disableInteractive();
    },
    setIcon(key: string): void {
      icon.setTexture(key);
    },
    setTone(tone: 'warm' | 'calm'): void {
      bg.setTexture(buttonTexture(tone));
    },
    press,
    destroy(): void {
      scene.tweens.killTweensOf(body);
      container.destroy();
    },
  };
}

/** Мягкая кремовая панель со скруглёнными углами и тенью (через nineslice на TEX.PANEL). */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, TEX.PANEL, undefined, width, height, 20, 20, 20, 20);
}

/** Текст в стиле игры: крупный, с обводкой, шрифт из CONFIG.ui. */
export function createText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number = CONFIG.ui.fontSizeText,
  color: number = PALETTE.uiTextLight,
): Phaser.GameObjects.Text {
  // Обводка контрастна цвету: тёмная для светлого текста и наоборот.
  const stroke = color === PALETTE.uiText ? PALETTE.uiTextLight : PALETTE.uiText;
  return scene.add
    .text(x, y, text, {
      fontFamily: CONFIG.ui.fontFamily,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color: hex(color),
      stroke: hex(stroke),
      strokeThickness: Math.max(4, Math.round(size * 0.14)),
      align: 'center',
    })
    .setOrigin(0.5);
}
