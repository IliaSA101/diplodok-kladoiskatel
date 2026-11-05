/**
 * Раскладка главного меню: кружок текущего леса и лист на нём.
 *
 * Вынесено из `tests/layout.test.ts`, когда тот упёрся в порог в шестьсот
 * строк. Зона своя: всё здесь — про один экран, и считает это `badgeLeafShape`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGE_LEAF, MENU_BADGE, MENU_PLAY, badgeLeafShape } from '../src/art/badgeLeaf';
import type { LeafPoint } from '../src/art/badgeLeaf';
import {
  APP_VERSION,
  parentsCornerRect,
  startCardRects,
  versionLabelAnchor,
  versionLabelRect,
  versionText,
} from '../src/art/startLayout';
import type { Rect } from '../src/art/startLayout';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';

describe('листок на кружке текущего леса', () => {
  const leaf = badgeLeafShape(MENU_BADGE.radius);
  const all: LeafPoint[] = [leaf.stemFrom, leaf.stemTo, ...leaf.blade];

  // Коробка цифры «8» вокруг центра кружка, померена по art-work/shots/02-menu.png
  // при шрифте CONFIG.ui.fontSizeBig = 56. Числа тут свои, а не из констант
  // листа: сверка листа с самим собой согласилась бы с любым его положением.
  const DIGIT_HALF_W = 20;
  const DIGIT_HALF_H = 24;
  /** На сколько пикселей точка выходит за коробку цифры; меньше нуля — внутри. */
  const clearsDigit = (p: LeafPoint): number =>
    Math.max(Math.abs(p.x) - DIGIT_HALF_W, Math.abs(p.y) - DIGIT_HALF_H);

  it('ни одна часть листа не наезжает на цифру', () => {
    for (const point of all) {
      const where = `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
      expect(clearsDigit(point), where).toBeGreaterThanOrEqual(8);
    }
  });

  it('черешок начинается внутри кружка, иначе лист висит сам по себе', () => {
    const reach = Math.hypot(leaf.stemFrom.x, leaf.stemFrom.y);
    expect(reach).toBeLessThan(MENU_BADGE.radius);
  });

  it('пластинка вытянутая, а не клякса', () => {
    // Длину и ширину меряем по самим точкам: так проверка не зависит от того,
    // какими числами они посчитаны, и переживёт смену формы пластинки.
    let a = leaf.blade[0];
    let b = leaf.blade[0];
    let length = 0;
    for (const p of leaf.blade) {
      for (const q of leaf.blade) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > length) {
          length = d;
          a = p;
          b = q;
        }
      }
    }
    const side = Math.hypot(b.x - a.x, b.y - a.y);
    let width = 0;
    for (const p of leaf.blade) {
      const off = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / side;
      width = Math.max(width, off * 2);
    }
    expect(length).toBeGreaterThan(width * 1.6);
    // И при этом лист заметен: на кружке радиусом 52 пластинка короче
    // тридцати пикселей снова превратится в закорючку.
    expect(length).toBeGreaterThanOrEqual(30);
  });

  it('лист целиком помещается на экране меню', () => {
    const margin = leaf.outline;
    for (const point of all) {
      const x = MENU_BADGE.x + point.x;
      const y = MENU_BADGE.y + point.y;
      const where = `(${x.toFixed(1)}, ${y.toFixed(1)})`;
      expect(x - margin, where).toBeGreaterThanOrEqual(0);
      expect(x + margin, where).toBeLessThanOrEqual(GAME_WIDTH);
      expect(y - margin, where).toBeGreaterThanOrEqual(0);
      expect(y + margin, where).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });

  it('лист растёт в сторону от кнопки «Играть», а не на неё', () => {
    // Поверни лист вниз-влево — и он ляжет на огромную кнопку рядом.
    for (const point of all) {
      const dx = MENU_BADGE.x + point.x - MENU_PLAY.x;
      const dy = MENU_BADGE.y + point.y - MENU_PLAY.y;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(MENU_PLAY.radius);
    }
  });

  it('пластинка нарисована дугами, а не четырьмя точками', () => {
    // Ромб из четырёх углов читается бриллиантом; лист — это кривая.
    expect(leaf.blade.length).toBe(BADGE_LEAF.arcSteps * 2);
    expect(BADGE_LEAF.arcSteps).toBeGreaterThanOrEqual(8);
  });
});

describe('номер версии на первом экране', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  const apart = (a: Rect, b: Rect): boolean =>
    a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

  it('в игре стоит ровно версия из package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(versionText(APP_VERSION)).toBe(`v${pkg.version}`);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('надпись не наезжает ни на одну карточку, даже раздутую пульсацией', () => {
    const label = versionLabelRect(APP_VERSION);
    for (const card of startCardRects()) expect(apart(label, card)).toBe(true);
  });

  it('надпись не перекрывает зону удержания сброса в левом нижнем углу', () => {
    expect(apart(versionLabelRect(APP_VERSION), parentsCornerRect())).toBe(true);
  });

  it('надпись целиком на экране и в правой его половине', () => {
    const label = versionLabelRect(APP_VERSION);
    expect(label.x).toBeGreaterThan(GAME_WIDTH / 2);
    expect(label.x + label.w).toBeLessThanOrEqual(GAME_WIDTH);
    expect(label.y).toBeGreaterThanOrEqual(0);
    expect(label.y + label.h).toBeLessThanOrEqual(GAME_HEIGHT);
  });

  // Числа выше стерегут раскладку, только если сцена рисует ровно по ним (ревью 05.11:
  // пульсация стояла в сцене числом, и тест проверял то, чем сцена не пользуется).
  it('сцена пульсирует и ставит надпись ровно по числам раскладки', () => {
    const scene = readFileSync(new URL('../src/scenes/StartScene.ts', import.meta.url), 'utf8');
    const pulse = scene.slice(scene.indexOf('private pulseCard'));
    expect(pulse.slice(0, pulse.indexOf('\n  }\n'))).toContain('scale: START_CARD.pulse');
    const label = scene.slice(scene.indexOf('private createVersionLabel'));
    const body = label.slice(0, label.indexOf('\n  }\n'));
    // Положение и начало — только из versionLabelAnchor, своих чисел в сцене нет.
    expect(body).toContain('versionLabelAnchor()');
    expect(body).toContain('.text(anchor.x, anchor.y,');
    expect(body).toContain('.setOrigin(anchor.originX, anchor.originY)');
    expect(body).not.toMatch(/GAME_(WIDTH|HEIGHT)/);
  });

  it('надпись стоит правым нижним углом в углу экрана, а не плавает', () => {
    const a = versionLabelAnchor();
    expect([a.originX, a.originY]).toEqual([1, 1]);
    expect(GAME_WIDTH - a.x).toBeLessThan(40);
    expect(GAME_HEIGHT - a.y).toBeLessThan(10);
    // Прямоугольник считается от точки привязки: правый нижний угол совпадает с ней.
    const label = versionLabelRect(APP_VERSION);
    expect(label.x + label.w).toBe(a.x);
    expect(label.y + label.h).toBe(a.y);
  });

  it('даже длинный номер вроде 10.12.100 не доезжает до карточки', () => {
    const label = versionLabelRect('10.12.100');
    for (const card of startCardRects()) expect(apart(label, card)).toBe(true);
  });
});
