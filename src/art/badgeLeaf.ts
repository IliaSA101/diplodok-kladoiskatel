/**
 * Листок на кружке текущего леса в меню.
 *
 * На кружке стояла общая иконка `TEX.ICON_LEAF` — веточка из пяти частей, —
 * ужатая до 0.55. На полусотне пикселей пять частей вместе с обводкой слиплись
 * в узел, а кремовый цвет иконки совпал с цветом цифры: на кружке оказались две
 * кремовые фигуры, и одна из них ничего не значила. Общую иконку трогать нельзя,
 * она же стоит на кнопке действия в лесу и там крупная, — поэтому у кружка свой
 * лист: одна фигура и зелёный цвет.
 *
 * Числа тут без Phaser: по ним же тест проверяет, что лист не лезет на цифру,
 * держится за кружок и не уходит с экрана. Раз уж проверять надо и «не уехал за
 * край», тут же лежит и то, где в меню стоят сам кружок и кнопка «Играть»,
 * от которой он отсчитывается.
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface LeafPoint {
  readonly x: number;
  readonly y: number;
}

/** Огромная кнопка «Играть» в меню: от неё отсчитывается всё вокруг. */
export const MENU_PLAY = {
  x: GAME_WIDTH * 0.73,
  y: GAME_HEIGHT * 0.54,
  radius: 110,
} as const;

/**
 * Кружок текущего леса в меню — он висит у кнопки «Играть».
 *
 * Положение живёт тут, а не в `MenuScene`, по двум причинам. Тест про «лист не
 * уехал за край экрана» иначе считал бы по своей копии чисел и согласился бы с
 * любой. И кружок отсчитывается от кнопки: разъедься они по разным файлам —
 * кнопку подвинут, а лист останется висеть сам по себе.
 */
export const MENU_BADGE = {
  x: MENU_PLAY.x + 150,
  y: MENU_PLAY.y - 104,
  radius: 52,
} as const;

/**
 * Лист растёт вверх-вправо из-под верхнего края кружка.
 *
 * Длины — в долях радиуса кружка, чтобы лист не развалился, если кружок станет
 * другого размера. Корень черешка внутри кружка (`stemAt` меньше единицы):
 * лист, который кружка не касается, читается отдельной картинкой, а не
 * украшением. Вверх-вправо, а не прямо вверх, потому что цифра занимает
 * середину, и черешку надо начинаться в стороне от неё.
 */
export const BADGE_LEAF = {
  /** Куда растёт: градусов вверх от горизонтали вправо. */
  angleDeg: 60,
  /** Корень черешка, в радиусах от центра кружка. */
  stemAt: 0.8,
  /** Где кончается черешок и начинается пластинка. */
  bladeAt: 1.08,
  /** Остриё. */
  tipAt: 1.94,
  /** Полуширина пластинки в самом широком месте. */
  halfWidth: 0.23,
  /** Толщина черешка. */
  stemWidth: 0.09,
  /** Толщина тёмной обводки. */
  outline: 0.075,
  /** На сколько отрезков разбивается каждая дуга пластинки. */
  arcSteps: 12,
} as const;

export interface BadgeLeafShape {
  /** Черешок: от корня внутри кружка до основания пластинки. */
  readonly stemFrom: LeafPoint;
  readonly stemTo: LeafPoint;
  /** Замкнутый контур пластинки: основание, правая дуга, остриё, левая дуга. */
  readonly blade: readonly LeafPoint[];
  /** Жилка посередине пластинки. */
  readonly veinFrom: LeafPoint;
  readonly veinTo: LeafPoint;
  /** Готовые толщины в пикселях — сцене больше считать нечего. */
  readonly stemWidth: number;
  readonly outline: number;
}

/** Точка на квадратичной кривой от `a` к `b` с опорой `c`. */
function curve(t: number, a: LeafPoint, c: LeafPoint, b: LeafPoint): LeafPoint {
  const m = 1 - t;
  return {
    x: m * m * a.x + 2 * m * t * c.x + t * t * b.x,
    y: m * m * a.y + 2 * m * t * c.y + t * t * b.y,
  };
}

/**
 * Точки листа в пикселях от центра кружка; экранный y растёт вниз.
 *
 * Пластинка — две дуги, а не четырёхугольник: у ромба остриё и основание
 * получаются одинаковыми, и фигура читается скорее бриллиантом, чем листом.
 */
export function badgeLeafShape(radius: number): BadgeLeafShape {
  const turn = (BADGE_LEAF.angleDeg * Math.PI) / 180;
  const ux = Math.cos(turn);
  const uy = -Math.sin(turn);
  // Перпендикуляр к направлению роста — вдоль него пластинка расходится вширь.
  const px = -uy;
  const py = ux;
  const at = (k: number): LeafPoint => ({ x: ux * k * radius, y: uy * k * radius });

  const base = at(BADGE_LEAF.bladeAt);
  const tip = at(BADGE_LEAF.tipAt);
  const middle = at((BADGE_LEAF.bladeAt + BADGE_LEAF.tipAt) / 2);
  // Квадратичная кривая отходит от хорды вдвое меньше, чем её опорная точка,
  // поэтому опору отводим на две полуширины — иначе лист выйдет вдвое уже.
  const reach = BADGE_LEAF.halfWidth * 2 * radius;
  const right = { x: middle.x + px * reach, y: middle.y + py * reach };
  const left = { x: middle.x - px * reach, y: middle.y - py * reach };

  const steps = BADGE_LEAF.arcSteps;
  const blade: LeafPoint[] = [];
  for (let i = 0; i <= steps; i += 1) blade.push(curve(i / steps, base, right, tip));
  // Концы второй дуги — это уже поставленные остриё и основание.
  for (let i = 1; i < steps; i += 1) blade.push(curve(i / steps, tip, left, base));

  return {
    stemFrom: at(BADGE_LEAF.stemAt),
    stemTo: base,
    blade,
    veinFrom: at(BADGE_LEAF.bladeAt + 0.1),
    veinTo: at(BADGE_LEAF.tipAt - 0.16),
    stemWidth: BADGE_LEAF.stemWidth * radius,
    outline: BADGE_LEAF.outline * radius,
  };
}
