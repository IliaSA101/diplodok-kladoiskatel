/**
 * Раскладка первого экрана: карточки, угол для взрослых и номер версии.
 *
 * Без Phaser: по этим числам тест проверяет, что номер версии не наезжает
 * на карточки и на зону удержания угла взрослых. Меню, которое угол открывает, — `parentsLayout.ts`.
 */
import { version } from '../../package.json';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const START_CARD = {
  w: 348,
  h: 206,
  /** Шаг между центрами карточек: три штуки в ряд на 1280. */
  step: 400,
  y: 584,
  /** Мягкая пульсация карточки растит её на столько. */
  pulse: 1.035,
} as const;

/** Угол для взрослых: держать столько, чтобы ребёнок не наткнулся случайно. */
export const PARENTS_CORNER = {
  size: 64,
  holdMs: 2000,
} as const;

/** Зона удержания в левом нижнем углу. */
export function parentsCornerRect(): Rect {
  return { x: 0, y: GAME_HEIGHT - PARENTS_CORNER.size, w: PARENTS_CORNER.size, h: PARENTS_CORNER.size };
}

/** Три карточки первого экрана вместе с пульсацией (самый большой их вид). */
export function startCardRects(): Rect[] {
  const w = START_CARD.w * START_CARD.pulse;
  const h = START_CARD.h * START_CARD.pulse;
  return [-1, 0, 1].map((k) => ({
    x: GAME_WIDTH / 2 + k * START_CARD.step - w / 2,
    y: START_CARD.y - h / 2,
    w,
    h,
  }));
}

/** Номер версии в углу: мелко, приглушённым цветом (не альфой), без нажатий. */
export const VERSION_LABEL = {
  size: 18,
  /** Отступ от правого и нижнего краёв экрана. */
  marginRight: 16,
  marginBottom: 2,
  /** Приглушённый светло-зелёный: читается на тёмной траве и не спорит с карточками. */
  color: 0xb9e3a8,
} as const;

/** Номер версии игры: единственный источник — `package.json`. */
export const APP_VERSION: string = version;

/** Текст надписи: `v1.1.0`. */
export function versionText(number: string): string {
  return `v${number}`;
}

/** Точка привязки надписи и то, какой её угол в ней стоит (начало текста Phaser). */
export interface LabelAnchor {
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
}

/**
 * Куда сцена ставит надпись: правый нижний угол текста — в точку на отступе от краёв экрана.
 * Сцена берёт x, y и начало только отсюда, а тест считает по ним же прямоугольник надписи.
 */
export function versionLabelAnchor(): LabelAnchor {
  return {
    x: GAME_WIDTH - VERSION_LABEL.marginRight,
    y: GAME_HEIGHT - VERSION_LABEL.marginBottom,
    originX: 1,
    originY: 1,
  };
}

/**
 * Прямоугольник надписи с запасом: ширину берём с запасом на букву (0.7 кегля),
 * потому что без браузера точно не измерить. Положение — от `versionLabelAnchor`,
 * той же точки, по которой её ставит сцена.
 */
export function versionLabelRect(number: string): Rect {
  const w = Math.ceil(versionText(number).length * VERSION_LABEL.size * 0.7);
  // Высота строки — по метрике шрифта: у Comic Sans подъём и спуск вместе около 1.39 кегля.
  const h = Math.ceil(VERSION_LABEL.size * 1.4);
  const a = versionLabelAnchor();
  return { x: a.x - a.originX * w, y: a.y - a.originY * h, w, h };
}
