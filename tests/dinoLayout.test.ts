/**
 * Геометрия диплодока-наблюдателя: голова над панелью и хвост под ней.
 *
 * Отдельным файлом не по прихоти: `art/layout.ts` упёрся в шестьсот строк, и
 * диплодок уехал оттуда в `art/dinoLayout.ts` — тест поехал следом, за своим
 * модулем.
 *
 * Панель задачки: x 80..1200, y 100..680 (createPanel в systems/quest.ts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DINO_TAIL, DINO_WATCH, dinoTailTip, dinoWatchBox, dinoWatchHead } from '../src/art/dinoLayout';
import { ENGLISH_HUB, PUZZLE_DOTS } from '../src/art/layout';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';

describe('диплодок-наблюдатель', () => {
  /** Панель задачки: createPanel(640, 390, 1120, 580). */
  const PANEL_TOP = 100;
  const PANEL_RIGHT = 1200;

  it('над панелью видно только голову', () => {
    const head = dinoWatchHead();
    const box = dinoWatchBox();
    // Вся голова выше верхнего края панели — значит ни одной клетки задачки
    // диплодок не закрывает, что бы в этой задачке ни лежало.
    expect(head.bottom).toBeLessThanOrEqual(PANEL_TOP);
    // А туловище и правда уходит за панель, иначе он не выглядывает, а висит.
    expect(box.bottom).toBeGreaterThan(PANEL_TOP);
    expect(box.top).toBe(head.top);
  });

  it('голова целиком на экране и в небе над травой', () => {
    const head = dinoWatchHead();
    expect(head.top).toBeGreaterThan(0);
    expect(head.right).toBeLessThanOrEqual(GAME_WIDTH);
    // Выглядывает именно из-за панели, а не из-за края экрана.
    expect(head.left).toBeLessThan(PANEL_RIGHT);
  });

  it('голова не наезжает ни на заголовок, ни на кнопку «назад»', () => {
    const head = dinoWatchHead();
    // Заголовок — одна строка по центру экрана; самый длинный («Футбольная
    // викторина») кеглем 48 не шире 560 px, то есть правее 920 не уходит.
    expect(head.left).toBeGreaterThan(920);
    // Кнопка «назад» — круг радиусом 52 в левом верхнем углу.
    expect(head.left).toBeGreaterThan(24 + 52 * 2);
  });
});

describe('хвост диплодока', () => {
  // Панель задачки: x 80..1200, y 100..680 (createPanel в systems/quest.ts).
  const PANEL = { left: 80, right: 1200, top: 100, bottom: 680 };

  it('кончик виден из-под панели, а не прячется под ней целиком', () => {
    const tip = dinoTailTip();
    const hidden = tip.x > PANEL.left && tip.x < PANEL.right && tip.y < PANEL.bottom;
    expect(hidden, `кончик (${tip.x}, ${tip.y}) под панелью`).toBe(false);
  });

  it('кончик остаётся на экране', () => {
    const tip = dinoTailTip();
    expect(tip.x).toBeGreaterThan(0);
    expect(tip.y).toBeLessThan(720);
  });

  it('числа выреза сходятся с самой картинкой хвоста', () => {
    // Хвост дважды выходил обрубленным, потому что вырез жил шестью числами
    // в коде и никто его не видел. Теперь его режет tools/dino_tail.py в
    // отдельный PNG, а числа тут обязаны совпасть с его размером: перережут
    // хвост заново — тест заметит это раньше ребёнка.
    const png = readFileSync('public/art/dino-tail.png');
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(DINO_TAIL.cutWidth);
    expect(png.readUInt32BE(20)).toBe(DINO_TAIL.cutHeight);
  });

  it('центр завитка лежит внутри выреза', () => {
    // По этой точке хвост ставится и качается: уедет за край выреза —
    // и хвост улетит с экрана целиком, а не подвинется.
    expect(DINO_TAIL.curlX).toBeGreaterThanOrEqual(DINO_TAIL.cutX);
    expect(DINO_TAIL.curlX).toBeLessThan(DINO_TAIL.cutX + DINO_TAIL.cutWidth);
    expect(DINO_TAIL.curlY).toBeGreaterThanOrEqual(DINO_TAIL.cutY);
    expect(DINO_TAIL.curlY).toBeLessThan(DINO_TAIL.cutY + DINO_TAIL.cutHeight);
  });

  it('завиток целиком помещается на экране по высоте', () => {
    // Центр завитка и его радиус: ниже центра краска уходит ещё на радиус.
    const fit = 420 / 597;
    const bottom = DINO_TAIL.centerY + DINO_TAIL.curlRadius * fit;
    expect(bottom).toBeLessThan(720);
  });
});

describe('диплодок на хабе английского', () => {
  const dino = ENGLISH_HUB.dino;
  const top = dino.bottom - dino.height;
  const width = dino.height * DINO_WATCH.aspect;
  const cardsBottom = ENGLISH_HUB.cardCenterY + ENGLISH_HUB.cardHeight / 2;

  it('не наезжает на карточки игр', () => {
    // Карточки — то, по чему надо попасть; персонаж поверх них не живёт.
    expect(top).toBeGreaterThanOrEqual(cardsBottom);
  });

  it('стоит на траве и целиком на экране', () => {
    expect(dino.bottom).toBeLessThan(GAME_HEIGHT);
    expect(dino.bottom).toBeGreaterThan(ENGLISH_HUB.grassTop);
    expect(dino.centerX - width / 2).toBeGreaterThan(0);
    expect(dino.centerX + width / 2).toBeLessThan(GAME_WIDTH);
  });

  it('карточки подняты ровно настолько, чтобы полоса под ними была', () => {
    // Полоса под карточками — единственное свободное место на этом экране,
    // и если ряд опустить обратно, диплодок окажется поверх карточек.
    expect(GAME_HEIGHT - cardsBottom).toBeGreaterThanOrEqual(dino.height + 8);
  });
});

describe('голова и счётчик делят верхнюю полосу', () => {
  /** Счётчик задачек: COUNTER_Y = 62, радиус кружка 10. */
  const DOT_Y = 62;
  const DOT_RADIUS = 10;

  it('ряд точек не заезжает диплодоку под морду', () => {
    const head = dinoWatchHead();
    // По высоте они и правда на одной полосе — значит разводить их можно
    // только по горизонтали, и проверять надо именно её.
    expect(DOT_Y + DOT_RADIUS).toBeGreaterThan(head.top);
    expect(DOT_Y - DOT_RADIUS).toBeLessThan(head.bottom);
    // Самый правый кружок — на PUZZLE_DOTS.right, и он целиком левее головы.
    expect(PUZZLE_DOTS.right + DOT_RADIUS).toBeLessThan(head.left);
  });

  it('места под точки всё ещё хватает на самый длинный счёт', () => {
    // Двадцать пар маджонга — потолок; они встают в два ряда, и второй ряд
    // не должен уехать на панель задачки (её верх на 100).
    const perRow = Math.floor((PUZZLE_DOTS.right - PUZZLE_DOTS.left) / PUZZLE_DOTS.step) + 1;
    expect(perRow * 2).toBeGreaterThanOrEqual(20);
    expect(DOT_Y + PUZZLE_DOTS.rowStep + DOT_RADIUS).toBeLessThan(100);
  });
});
