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
import {
  PARENTS_MENU,
  PARENTS_TEXT,
  estimateLines,
  parentsAnswerRects,
  parentsMainRects,
  parentsMenuItems,
  type ParentsItem,
  type ParentsMode,
} from '../src/art/parentsLayout';
import type { Rect } from '../src/art/startLayout';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../src/config';

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

describe('меню «Для взрослых»: состав по таблице раздела 9', () => {
  const MODES: readonly ParentsMode[] = ['normal', 'newer', 'future', 'unavailable'];
  const FLAGS = [false, true] as const;
  const items = (mode: ParentsMode, hasBackup: boolean, hasCrash: boolean): readonly ParentsItem[] =>
    parentsMenuItems({ mode, hasBackup, hasCrash }).items;

  it('normal: файл, из файла и стереть — всегда; копия и отчёт — когда есть', () => {
    expect(items('normal', false, false)).toEqual(['export', 'import', 'erase']);
    expect(items('normal', true, false)).toEqual(['export', 'import', 'backup', 'erase']);
    expect(items('normal', false, true)).toEqual(['export', 'import', 'report', 'erase']);
    expect(items('normal', true, true)).toEqual(['export', 'import', 'backup', 'report', 'erase']);
  });

  it('newer и future: ни выгрузки, ни замены, ни стирания — только копия и отчёт', () => {
    for (const mode of ['newer', 'future'] as const) {
      expect(items(mode, false, false)).toEqual([]);
      expect(items(mode, true, false)).toEqual(['backup']);
      expect(items(mode, false, true)).toEqual(['report']);
      expect(items(mode, true, true)).toEqual(['backup', 'report']);
    }
  });

  it('unavailable: копии нет (читать нечем), отчёт — если он есть', () => {
    expect(items('unavailable', true, false)).toEqual([]);
    expect(items('unavailable', true, true)).toEqual(['report']);
    expect(items('unavailable', false, true)).toEqual(['report']);
  });

  it('строка режима: свои слова на каждый режим и ничего в normal', () => {
    const line = (mode: ParentsMode): string | null =>
      parentsMenuItems({ mode, hasBackup: true, hasCrash: true }).modeLine;
    expect(line('normal')).toBeNull();
    expect(line('newer')).toBe('Сохранение из новой версии игры. Файлы и стирание — в ней.');
    expect(line('future')).toBe('Сохранение из новой версии игры: прогресс не записывается.');
    expect(line('unavailable')).toBe('Браузер не даёт сохранять прогресс.');
  });

  it('пункты не повторяются и идут в порядке панели; в любом режиме не больше пяти', () => {
    const order: readonly ParentsItem[] = ['export', 'import', 'backup', 'report', 'erase'];
    for (const mode of MODES) {
      for (const b of FLAGS) {
        for (const c of FLAGS) {
          const got = items(mode, b, c);
          expect(new Set(got).size).toBe(got.length);
          expect(got.length).toBeLessThanOrEqual(5);
          expect([...got].sort((x, y) => order.indexOf(x) - order.indexOf(y))).toEqual(got);
        }
      }
    }
  });
});

describe('меню «Для взрослых»: раскладка панели', () => {
  const m = PARENTS_MENU;
  const inside = (inner: Rect, outer: Rect): boolean =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;
  const apart = (a: Rect, b: Rect): boolean =>
    a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
  const noteLinesOf = (...texts: (string | null)[]): number =>
    texts.reduce<number>((sum, text) => sum + (text === null ? 0 : estimateLines(text, m.noteSize, m.noteWrap)), 0);
  const MODES: readonly ParentsMode[] = ['normal', 'newer', 'future', 'unavailable'];

  it('пять кнопок: внутри панели, не налезают друг на друга и на строки под ними', () => {
    const r = parentsMainRects(5, 0);
    expect(r.buttons).toHaveLength(5);
    for (const [i, button] of r.buttons.entries()) {
      expect(inside(button, r.panel), `кнопка ${i}`).toBe(true);
      for (const other of r.buttons.slice(i + 1)) expect(apart(button, other)).toBe(true);
      expect(apart(button, r.status)).toBe(true);
    }
    expect(inside(r.status, r.panel)).toBe(true);
  });

  it('кнопки ниже заголовка, а «назад» из общей фабрики стоит в углу экрана вне панели', () => {
    const r = parentsMainRects(5, 2);
    const top = r.buttons[0];
    expect(r.title.y + m.titleSize / 2).toBeLessThan(top.y);
    // Центр и радиус — те, что у createBackButton по умолчанию.
    const offset = CONFIG.ui.padding + CONFIG.ui.buttonRadius;
    const back: Rect = { x: offset - CONFIG.ui.buttonRadius, y: offset - CONFIG.ui.buttonRadius, w: 2 * CONFIG.ui.buttonRadius, h: 2 * CONFIG.ui.buttonRadius };
    for (const panel of [r.panel, parentsMainRects(5, 4).panel, parentsAnswerRects(2, 7).panel]) {
      expect(apart(back, panel)).toBe(true);
    }
    const menu = readFileSync(new URL('../src/scenes/parentsMenu.ts', import.meta.url), 'utf8');
    expect(menu).toContain('createBackButton(scene');
  });

  it('замена из файла идёт один раз: второй клик по «Да» её не повторяет', () => {
    // Сцену без браузера не запустить, читаем код; живой двойной клик держит e2e/parents.spec.ts.
    const menu = readFileSync(new URL('../src/scenes/parentsMenu.ts', import.meta.url), 'utf8');
    const body = menu.slice(menu.indexOf('function replace('));
    expect(body.indexOf('if (replacing) return;')).toBeGreaterThan(0);
    expect(body.indexOf('if (replacing) return;')).toBeLessThan(body.indexOf('replaceProgress('));
  });

  it('самая длинная подпись помещается в кнопку с полями по бокам', () => {
    for (const label of Object.values(PARENTS_TEXT.items)) {
      expect(label.length * m.buttonSize * m.glyphWidth, label).toBeLessThanOrEqual(m.buttonW - 2 * m.pad);
    }
    for (const label of [PARENTS_TEXT.understood, PARENTS_TEXT.yes, PARENTS_TEXT.no]) {
      expect(label.length * m.buttonSize * m.glyphWidth).toBeLessThanOrEqual(parentsAnswerRects(2, 5).buttons[0].w - 2 * m.pad);
    }
  });

  it('оценка строк не занижает: режим «future» на кадре 24-parents-readonly лёг в две строки', () => {
    expect(estimateLines(PARENTS_TEXT.modeFuture, m.noteSize, m.noteWrap)).toBe(2);
    expect(estimateLines(PARENTS_TEXT.modeUnavailable, m.noteSize, m.noteWrap)).toBe(1);
  });

  it('самая длинная строка режима влезает в отведённые ей строки и не выходит за панель', () => {
    for (const text of [PARENTS_TEXT.modeNewer, PARENTS_TEXT.modeFuture, PARENTS_TEXT.modeUnavailable, PARENTS_TEXT.rolledBack]) {
      expect(estimateLines(text, m.noteSize, m.noteWrap), text).toBeLessThanOrEqual(2);
    }
    const r = parentsMainRects(2, noteLinesOf(PARENTS_TEXT.modeNewer));
    const notes = r.notes as Rect;
    expect(inside(notes, r.panel)).toBe(true);
    expect(apart(notes, r.buttons[1])).toBe(true);
    expect(apart(notes, r.status)).toBe(true);
  });

  it('любое сочетание режима, копии, сбоя и «прошлая замена не удалась» умещается на экране', () => {
    // Крайний вариант: пять кнопок и две строки сверху — а не первый попавшийся.
    for (const mode of MODES) {
      for (const hasBackup of [false, true]) {
        for (const hasCrash of [false, true]) {
          for (const rolledBack of [false, true]) {
            const spec = parentsMenuItems({ mode, hasBackup, hasCrash });
            const lines = noteLinesOf(rolledBack ? PARENTS_TEXT.rolledBack : null, spec.modeLine);
            const r = parentsMainRects(spec.items.length, lines);
            const where = `${mode} копия ${hasBackup} сбой ${hasCrash} замена ${rolledBack}`;
            expect(r.panel.y, where).toBeGreaterThanOrEqual(m.screenMargin);
            expect(r.panel.y + r.panel.h, where).toBeLessThanOrEqual(GAME_HEIGHT - m.screenMargin);
            expect(r.panel.x + r.panel.w, where).toBeLessThanOrEqual(GAME_WIDTH - m.screenMargin);
          }
        }
      }
    }
  });

  it('панель стоит по центру экрана', () => {
    for (const r of [parentsMainRects(5, 0).panel, parentsMainRects(1, 2).panel, parentsAnswerRects(2, 5).panel]) {
      expect(r.x * 2 + r.w).toBe(GAME_WIDTH);
      expect(Math.abs(r.y * 2 + r.h - GAME_HEIGHT)).toBeLessThanOrEqual(1);
    }
  });

  it('ответ на файл: две кнопки рядом, одна по центру, текст сводки в панели', () => {
    const two = parentsAnswerRects(2, 5);
    expect(apart(two.buttons[0], two.buttons[1])).toBe(true);
    for (const b of two.buttons) expect(inside(b, two.panel)).toBe(true);
    expect(inside(two.block, two.panel)).toBe(true);
    expect(apart(two.block, two.buttons[0])).toBe(true);
    const one = parentsAnswerRects(1, 4);
    const b = one.buttons[0];
    expect(b.x * 2 + b.w).toBe(GAME_WIDTH);
  });

  it('угол взрослых и панель меню разные: панель закрывает угол, а не он её', () => {
    // Панель стоит по центру и угол 64×64 внизу слева не задевает.
    expect(apart(parentsMainRects(5, 4).panel, parentsCornerRect())).toBe(true);
  });
});

describe('стартовая сцена и меню взрослых', () => {
  const start = readFileSync(new URL('../src/scenes/StartScene.ts', import.meta.url), 'utf8');

  it('стартовая сцена стирает только через меню, а пока меню открыто — клавиши молчат', () => {
    expect(start).not.toContain('eraseAllProgress');
    expect(start).toContain('openParentsMenu(');
    const keys = start.slice(start.indexOf('this.keyHandler = (event'));
    expect(keys.slice(0, keys.indexOf('};'))).toContain('this.parentsOpen');
  });
});
