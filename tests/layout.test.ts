/**
 * Раскладка интерфейса: ряды точек, ряд букв и зоны нажатия.
 *
 * Зона нажатия проверяется чтением исходников — Phaser тут не поднять, а
 * ошибка была ровно в его тонкости: свой `Rectangle(-half, -half, …)` он
 * сдвигает ещё раз на половину, и попадать в букву надо было в её левый
 * верхний угол. Снаружи это выглядело как «то нажимается, то нет».
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/art/palette';
import { createProgressDots } from '../src/art/progressDots';
import { ALBUM_SCALE, FOSSIL, TREASURE_DESIGN } from '../src/art/treasureLayout';
import {
  centredGrid,
  COUNT_BOARD,
  COUNT_KEYS,
  MAHJONG_TABLE,
  PUZZLE_DOTS,
  countBoardWidth,
  countKeySpot,
  countPictureSpots,
  countSpots,
  dotRows,
  dotsPerRowLimit,
  puzzleDotsPerRow,
  rowFit,
  stackLayout,
} from '../src/art/layout';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';
import { WORD_TIERS } from '../src/data/questWords';
import { MAHJONG_PAIRS, MAHJONG_STACKED_FROM, MEMORY_LEVELS } from '../src/data/questDeals';
import { COUNT_MAX_ANSWER, countTasks } from '../src/systems/countTask';
import { buildMahjongBoard } from '../src/systems/mahjongBoard';

/** Исходники сцен: часть ловушек Phaser видна только чтением кода. */
const sceneSources = readdirSync(join(process.cwd(), 'src', 'scenes'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({
    name,
    text: readFileSync(join(process.cwd(), 'src', 'scenes', name), 'utf8'),
  }));

describe('ряды точек', () => {
  it('пока влезают — один ряд', () => {
    expect(dotRows(5, 8)).toEqual({ perRow: 5, rows: 1 });
    expect(dotRows(8, 8)).toEqual({ perRow: 8, rows: 1 });
  });

  it('не влезли — делятся поровну на два ряда', () => {
    expect(dotRows(9, 8)).toEqual({ perRow: 5, rows: 2 });
    expect(dotRows(11, 8)).toEqual({ perRow: 6, rows: 2 });
  });

  it('в ряду никогда не больше предела, и все точки размещены', () => {
    for (let total = 1; total <= 40; total += 1) {
      for (const limit of [4, 6, 8, 10]) {
        const { perRow, rows } = dotRows(total, limit);
        expect(perRow).toBeLessThanOrEqual(limit);
        expect(perRow).toBeGreaterThan(0);
        expect(perRow * rows).toBeGreaterThanOrEqual(total);
      }
    }
  });

  it('предел считается из шага между кружками, а не на глаз', () => {
    // Настоящие числа экрана «Выбери лес»: шаг 230, точка 8, шаг точек 24.
    const limit = dotsPerRowLimit(230, 22, 8, 24);
    // Ряд из limit точек обязан влезать в просвет между соседями.
    expect((limit - 1) * 24 + 8 * 2).toBeLessThanOrEqual(230 - 22);
    // А на одну больше — уже нет, иначе предел занижен и точки мельчат.
    expect(limit * 24 + 8 * 2).toBeGreaterThan(230 - 22);
  });
});

describe('ряд плиток с буквами', () => {
  // Настоящие числа «Собери слово».
  const LEFT = 170;
  const RIGHT = 1180;
  const MAX_STEP = 130;
  const MAX_TILE = 110;
  const MIN_GAP = 8;
  const fit = (count: number): ReturnType<typeof rowFit> =>
    rowFit(count, LEFT, RIGHT, MAX_STEP, MAX_TILE, MIN_GAP);

  it('плитки не налезают друг на друга', () => {
    for (let count = 3; count <= 14; count += 1) {
      const { step, size } = fit(count);
      expect(step - size).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });

  it('ряд не вылезает за панель', () => {
    for (let count = 3; count <= 14; count += 1) {
      const { size, spots } = fit(count);
      expect((spots[0] ?? 0) - size / 2).toBeGreaterThanOrEqual(LEFT);
      expect((spots[spots.length - 1] ?? 0) + size / 2).toBeLessThanOrEqual(RIGHT);
    }
  });

  it('плитка остаётся под детский палец даже на длинном слове', () => {
    // Слово до двенадцати букв с запасом: меньше 64 px ребёнку не попасть.
    for (let count = 3; count <= 14; count += 1) {
      expect(fit(count).size).toBeGreaterThanOrEqual(64);
    }
  });

  it('самое длинное слово игры раскладывается крупными плитками', () => {
    // Данные и раскладка проверяются вместе: слово подрастёт — тест скажет сразу.
    // Лишних букв в сцене две (EXTRA_LETTERS), их тоже надо куда-то положить.
    const longest = Math.max(...WORD_TIERS.flat().map((puzzle) => puzzle.word.length));
    const { size, spots } = fit(longest + 2);
    expect(size, `${longest} букв + 2 лишние`).toBeGreaterThanOrEqual(64);
    expect((spots[spots.length - 1] ?? 0) + size / 2).toBeLessThanOrEqual(RIGHT);
  });

  it('ряд стоит посередине', () => {
    const { spots } = fit(5);
    const middle = ((spots[0] ?? 0) + (spots[4] ?? 0)) / 2;
    expect(middle).toBeCloseTo((LEFT + RIGHT) / 2, 6);
  });
});

describe('зоны нажатия', () => {
  const sources = sceneSources;

  it('ни одна сцена не задаёт зону нажатия сдвинутым прямоугольником', () => {
    // setInteractive(new Phaser.Geom.Rectangle(-half, ...)) смещает зону на
    // половину размера: Phaser прибавляет свой сдвиг поверх нашего. Правильно
    // — setSize(w, h) и setInteractive({ useHandCursor: true }).
    const guilty = sources
      .filter(({ text }) => /setInteractive\(\s*new Phaser\.Geom\.Rectangle\(\s*-/.test(text))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });

  it('стрелка назад везде из общей фабрики — значит, всегда в одном углу', () => {
    // Своя стрелка мимо createBackButton — это свой угол на каждом экране.
    // Ребёнок искал выход заново, а из леса его не было вовсе.
    //
    // Исключение одно: «Мои сокровища» — не экран, а окно поверх леса, оно
    // закрывается ещё и тапом мимо панели, а левый верхний угол там занят
    // сеткой находок. Список исключений не должен расти.
    const dialogs = ['CollectionScene.ts'];
    const handmade = sources
      .filter(({ name }) => !dialogs.includes(name))
      .filter(({ text }) => text.includes('ICON_BACK') && !text.includes('createBackButton'))
      .map(({ name }) => name);
    expect(handmade).toEqual([]);
  });
});

describe('стол маджонга', () => {
  /** Центр панели задачки — он же в PuzzleMahjongScene. */
  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2 + 30;

  // Ровно те столы, что игра и строит: плоские в первом круге, горки дальше.
  // Проверять «плоский на десять пар» смысла нет — такого варианта нет, зато
  // он мельчит карточку до 100 px и завалил бы проверку впустую.
  const tables = MAHJONG_PAIRS.map((pairs, variant) => {
    const stacked = variant >= MAHJONG_STACKED_FROM;
    const board = buildMahjongBoard(pairs, 1, stacked);
    return {
      name: `${stacked ? 'горка' : 'плоский стол'} варианта ${variant} на ${pairs} пар`,
      fit: stackLayout({
        ...MAHJONG_TABLE,
        columns: board.columns,
        rows: board.rows,
        layers: board.layers,
        centerX,
        centerY,
      }),
    };
  });

  it('горка не вылезает за панель ни одним этажом', () => {
    // Этажи уходят вверх-влево, и при трёх этажах это уже 44 px и 60 px.
    // Пока вынос не входил в расчёт, верхние карточки лезли на заголовок.
    const left = centerX - MAHJONG_TABLE.panelWidth / 2 + MAHJONG_TABLE.inset;
    const right = centerX + MAHJONG_TABLE.panelWidth / 2 - MAHJONG_TABLE.inset;
    const top = centerY - MAHJONG_TABLE.panelHeight / 2 + MAHJONG_TABLE.inset;
    const bottom = centerY + MAHJONG_TABLE.panelHeight / 2 - MAHJONG_TABLE.inset;
    for (const table of tables) {
      expect(table.fit.bounds.left, table.name).toBeGreaterThanOrEqual(left);
      expect(table.fit.bounds.right, table.name).toBeLessThanOrEqual(right);
      expect(table.fit.bounds.top, table.name).toBeGreaterThanOrEqual(top);
      expect(table.fit.bounds.bottom, table.name).toBeLessThanOrEqual(bottom);
    }
  });

  it('карточка не мельчает настолько, что в неё не попасть', () => {
    for (const table of tables) {
      expect(table.fit.size, table.name).toBeGreaterThanOrEqual(MAHJONG_TABLE.minSize);
    }
  });

  it('карточки не налезают друг на друга в своём этаже', () => {
    for (const table of tables) {
      expect(table.fit.step - table.fit.size, table.name).toBeGreaterThanOrEqual(MAHJONG_TABLE.gap);
    }
  });

  it('горка стоит посреди панели, а не жмётся к краю', () => {
    for (const table of tables) {
      const leftGap = table.fit.bounds.left - (centerX - MAHJONG_TABLE.panelWidth / 2);
      const rightGap = centerX + MAHJONG_TABLE.panelWidth / 2 - table.fit.bounds.right;
      expect(Math.abs(leftGap - rightGap), table.name).toBeLessThanOrEqual(1);
    }
  });
});

describe('счётчик пар в задачке', () => {
  it('точки не наезжают на заголовок ни при каком числе пар', () => {
    // Двадцать пар третьего круга выстраивались в линию через весь верх,
    // и ряд проходил прямо по слову «Маджонг».
    for (const total of [...MAHJONG_PAIRS, ...MEMORY_LEVELS.map((level) => level.groups)]) {
      const { perRow } = dotRows(total, puzzleDotsPerRow());
      const width = (perRow - 1) * PUZZLE_DOTS.step;
      expect(width, `${total} пар`).toBeLessThanOrEqual(PUZZLE_DOTS.right - PUZZLE_DOTS.left);
    }
  });

  it('точек ровно столько, сколько пар, и рядов не больше двух', () => {
    for (const total of [...MAHJONG_PAIRS, ...MEMORY_LEVELS.map((level) => level.groups)]) {
      const { perRow, rows } = dotRows(total, puzzleDotsPerRow());
      expect(perRow * rows, `${total} пар`).toBeGreaterThanOrEqual(total);
      expect(rows, `${total} пар`).toBeLessThanOrEqual(2);
    }
  });
});

describe('ряд точек прогресса', () => {
  /**
   * Поддельная сцена: фабрике нужны только `add.circle` и `tweens.add`.
   *
   * Так проверяется само рисование ряда, а не арифметика рядом с ним: в пяти
   * задачках и трёх английских играх ряд рисовался своим кодом, и они
   * разошлись — где-то точки загорались, а цифра рядом убывала.
   */
  interface FakeDot {
    x: number;
    y: number;
    radius: number;
    fillColor: number;
    depth: number;
    strokeWidth: number;
    setStrokeStyle(width: number, color: number): FakeDot;
    setDepth(depth: number): FakeDot;
    setFillStyle(color: number): FakeDot;
  }

  function fakeScene(): { scene: Phaser.Scene; dots: FakeDot[] } {
    const dots: FakeDot[] = [];
    const scene = {
      add: {
        circle(x: number, y: number, radius: number, fillColor: number): FakeDot {
          const dot: FakeDot = {
            x,
            y,
            radius,
            fillColor,
            depth: 0,
            strokeWidth: 0,
            setStrokeStyle(width: number): FakeDot {
              dot.strokeWidth = width;
              return dot;
            },
            setDepth(depth: number): FakeDot {
              dot.depth = depth;
              return dot;
            },
            setFillStyle(color: number): FakeDot {
              dot.fillColor = color;
              return dot;
            },
          };
          dots.push(dot);
          return dot;
        },
      },
      tweens: { add: (): undefined => undefined },
    };
    return { scene: scene as unknown as Phaser.Scene, dots };
  }

  /** Настройки ряда в задачках с парами: прижат к правому краю заголовка. */
  const pairsRow = {
    rightX: PUZZLE_DOTS.right,
    step: PUZZLE_DOTS.step,
    radius: 10,
    rowStep: PUZZLE_DOTS.rowStep,
    maxPerRow: puzzleDotsPerRow(),
  };

  it('ряд без правого края стоит ровно по середине экрана', () => {
    const { scene, dots } = fakeScene();
    createProgressDots(scene, { count: 5, y: 126 });
    expect(dots).toHaveLength(5);
    const middle = (dots[0].x + dots[4].x) / 2;
    expect(middle).toBe(GAME_WIDTH / 2);
    expect(dots.every((dot) => dot.y === 126)).toBe(true);
  });

  it('ряд с правым краем кончается ровно на нём', () => {
    const { scene, dots } = fakeScene();
    createProgressDots(scene, { count: 7, y: 62, ...pairsRow });
    expect(dots[dots.length - 1].x).toBe(PUZZLE_DOTS.right);
    expect(dots[0].x).toBeGreaterThanOrEqual(PUZZLE_DOTS.left);
  });

  it('двадцать точек ложатся в два ряда и мельчают', () => {
    const { scene, dots } = fakeScene();
    createProgressDots(scene, { count: 20, y: 62, ...pairsRow });
    expect(dots).toHaveLength(20);

    const levels = [...new Set(dots.map((dot) => dot.y))].sort((a, b) => a - b);
    expect(levels).toHaveLength(2);
    // Два ряда стоят симметрично относительно той же строки, где была одна.
    expect((levels[0] + levels[1]) / 2).toBe(62);
    expect(dots[0].radius).toBeLessThan(10);

    // Каждый ряд прижат к правому краю: лесенки из них не выходит.
    for (const level of levels) {
      const row = dots.filter((dot) => dot.y === level);
      expect(row[row.length - 1].x, `ряд ${level}`).toBe(PUZZLE_DOTS.right);
    }
  });

  it('точки не слипаются ни в одной задачке', () => {
    for (const total of [...MAHJONG_PAIRS, ...MEMORY_LEVELS.map((level) => level.groups)]) {
      const { scene, dots } = fakeScene();
      createProgressDots(scene, { count: total, y: 62, ...pairsRow });
      const first = dots[0];
      const second = dots[1];
      expect(second.x - first.x, `${total} пар`).toBeGreaterThan(first.radius * 2);
      expect(dots.every((dot) => dot.x >= PUZZLE_DOTS.left), `${total} пар`).toBe(true);
    }
  });

  it('зажигается ровно та точка, которую просили', () => {
    const { scene, dots } = fakeScene();
    const row = createProgressDots(scene, { count: 6, y: 126 });
    row.fill(2);
    expect(dots.map((dot) => dot.fillColor === PALETTE.gold)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('промах по номеру ничего не ломает', () => {
    const { scene, dots } = fakeScene();
    const row = createProgressDots(scene, { count: 3, y: 126 });
    row.fill(-1);
    row.fill(3);
    expect(dots.some((dot) => dot.fillColor === PALETTE.gold)).toBe(false);
  });

  it('зажигать точку золотом умеет только общая фабрика', () => {
    // Своя копия ряда — это своя жизнь: так в двух задачках рядом с
    // загорающимися точками осталась цифра, которая считала наоборот.
    const guilty = sceneSources
      .filter(({ text }) => text.includes('setFillStyle(PALETTE.gold)'))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });
});

describe('табло счёта', () => {
  /** Самая широкая строка: двузначный ответ и картинки под числами. */
  const widest = countSpots(2, true);

  it('пример целиком лежит на табло', () => {
    for (const digits of [1, 2]) {
      for (const pictures of [false, true]) {
        const width = countBoardWidth(pictures);
        const left = COUNT_BOARD.centerX - width / 2;
        const right = COUNT_BOARD.centerX + width / 2;
        const spots = countSpots(digits, pictures);
        const where = `${digits} цифр, картинки ${String(pictures)}`;
        expect(spots.left - COUNT_BOARD.digitSize / 2, where).toBeGreaterThan(left);
        const last = spots.slots[spots.slots.length - 1];
        expect(last + COUNT_BOARD.slot / 2, where).toBeLessThan(right);
      }
    }
  });

  it('табло не вылезает за панель задачки', () => {
    for (const pictures of [false, true]) {
      const width = countBoardWidth(pictures);
      expect(width, `картинки ${String(pictures)}`).toBeLessThan(MAHJONG_TABLE.panelWidth);
    }
  });

  it('клетки ответа не слипаются', () => {
    const [first, second] = widest.slots;
    expect(second - first).toBeGreaterThan(COUNT_BOARD.slot);
  });

  it('ряд предметов не залезает на соседнее число', () => {
    // Больше десяти мячей под числом не бывает — это проверяет skill.test.ts.
    const spots = countPictureSpots(10);
    const width = Math.max(...spots.map((s) => s.dx)) - Math.min(...spots.map((s) => s.dx));
    expect(width + COUNT_BOARD.pictureSize).toBeLessThan(widest.op - widest.left);
    // И не вылезает за низ табло.
    const lowest = Math.max(...spots.map((s) => s.dy));
    expect(COUNT_BOARD.centerY + lowest + COUNT_BOARD.pictureSize / 2).toBeLessThan(
      COUNT_BOARD.centerY + COUNT_BOARD.height / 2,
    );
  });

  it('десять предметов ложатся двумя рядами по пять', () => {
    const rows = new Set(countPictureSpots(10).map((spot) => spot.dy));
    expect(rows.size).toBe(2);
    expect(countPictureSpots(4).every((spot) => spot.dy === COUNT_BOARD.pictureTop)).toBe(true);
  });

  it('клавиши остаются под детский палец и не вылезают из панели', () => {
    // 110 px — тот же порог, из-за которого переделывали стол маджонга.
    expect(COUNT_KEYS.size).toBeGreaterThanOrEqual(110);
    const half = COUNT_KEYS.size / 2;
    for (let i = 0; i < 10; i += 1) {
      const { x, y } = countKeySpot(i);
      const where = `клавиша ${i}`;
      expect(x - half, where).toBeGreaterThan((GAME_WIDTH - MAHJONG_TABLE.panelWidth) / 2);
      expect(x + half, where).toBeLessThan(COUNT_KEYS.eraseX - COUNT_KEYS.eraseRadius);
      expect(y + half, where).toBeLessThan(GAME_HEIGHT - 40);
    }
  });

  it('клавиши не наезжают на табло', () => {
    const top = Math.min(...Array.from({ length: 10 }, (_, i) => countKeySpot(i).y));
    expect(top - COUNT_KEYS.size / 2).toBeGreaterThan(COUNT_BOARD.centerY + COUNT_BOARD.height / 2);
  });

  it('клеток хватает на любой ответ', () => {
    const digits = String(COUNT_MAX_ANSWER).length;
    expect(countSpots(digits, false).slots).toHaveLength(digits);
    for (const task of countTasks(9, 0)) {
      expect(String(task.answer).length, `${task.left} ${task.op} ${task.right}`).toBeLessThanOrEqual(digits);
    }
  });
});

describe('все задачки одинаково честные', () => {
  const puzzles = sceneSources.filter(({ name }) => name.startsWith('Puzzle'));

  it('задачек больше одной, иначе проверка ничего не значит', () => {
    expect(puzzles.length).toBeGreaterThan(5);
  });

  it('каждая задачка заводит часы: без них ступень не растёт и не падает', () => {
    // Часы запускает addPuzzleBackdrop, а не сцена: забыть его — значит молча
    // отдать игре ноль миллисекунд и поднять ступень за любой прогон.
    const guilty = puzzles
      .filter(({ text }) => !text.includes('addPuzzleBackdrop'))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });

  it('каждая задачка считает промахи', () => {
    // Задачка без notePuzzleMistake выглядит лёгкой: ошибок ноль всегда,
    // и ступень лезет вверх, пока ребёнок буксует.
    const guilty = puzzles
      .filter(({ text }) => !text.includes('notePuzzleMistake(this)'))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });
});

describe('сетка карточек', () => {
  /** Ряды сетки: индексы разбиты по колонкам. */
  const rowsOf = (spots: { dx: number }[], columns: number): { dx: number }[][] => {
    const out: { dx: number }[][] = [];
    for (let i = 0; i < spots.length; i += columns) out.push(spots.slice(i, i + columns));
    return out;
  };

  it('полный ряд стоит там же, где стоял: центр ряда — центр сетки', () => {
    const { rows, spots } = centredGrid(24, 6, 100);
    expect(rows).toBe(4);
    expect(spots[0]?.dx).toBe(-250);
    expect(spots[5]?.dx).toBe(250);
    expect(spots[0]?.dy).toBe(-150);
    expect(spots[23]?.dy).toBe(150);
  });

  it('неполный ряд центрируется по своей длине, а не по полной', () => {
    // Двадцать семь карточек в шесть колонок: четыре полных ряда и три
    // карточки в последнем. Прижатые влево, они оставляли справа дыру
    // в половину ряда — ребёнок спросил, почему там пусто.
    const { rows, spots } = centredGrid(27, 6, 100);
    expect(rows).toBe(5);
    expect(spots.slice(24).map((spot) => spot.dx)).toEqual([-100, 0, 100]);
  });

  it('каждый ряд любой сетки симметричен относительно середины', () => {
    // Таблица ступеней меняется, и новая строка не должна вернуть дыру.
    for (const count of [12, 16, 20, 24, 27, 30]) {
      for (const columns of [4, 5, 6]) {
        rowsOf(centredGrid(count, columns, 100).spots, columns).forEach((row, i) => {
          const xs = row.map((spot) => spot.dx);
          const where = `${count} карточек в ${columns} колонок, ряд ${i}`;
          expect(Math.min(...xs) + Math.max(...xs), where).toBe(0);
        });
      }
    }
  });
});

describe('силуэты в альбоме', () => {
  // Ненайденный предмет залит тинтом целиком, поэтому рисунок внутри фигуры
  // в альбоме не виден вовсе. Монета и окаменелость — оба круглые диски, и
  // в «Моих сокровищах» они стояли рядом двумя одинаковыми серыми кружками.
  it('рёбрышки окаменелости выходят за диск, и в альбоме это заметно', () => {
    const stickOut = (FOSSIL.ribOut - FOSSIL.disc) * ALBUM_SCALE;
    // Порог — экранные пиксели в самой тесной ячейке, а не доля от диска:
    // сверка с самим диском согласилась бы и с рёбрышком в один пиксель.
    expect(stickOut).toBeGreaterThanOrEqual(5);
  });

  it('рёбрышко начинается внутри диска, а не висит в воздухе', () => {
    expect(FOSSIL.ribIn).toBeLessThan(FOSSIL.disc);
  });

  it('рёбрышки не вылезают за дизайн-квадрат', () => {
    expect(FOSSIL.cy - FOSSIL.ribOut).toBeGreaterThanOrEqual(0);
    expect(FOSSIL.cx - FOSSIL.ribOut).toBeGreaterThanOrEqual(0);
    expect(FOSSIL.cx + FOSSIL.ribOut).toBeLessThanOrEqual(TREASURE_DESIGN);
    expect(FOSSIL.cy + FOSSIL.ribOut).toBeLessThanOrEqual(TREASURE_DESIGN);
  });

  it('рёбрышки стоят не чаще, чем их толщина позволяет различить', () => {
    const gap = (2 * Math.PI * FOSSIL.ribOut) / FOSSIL.ribs;
    expect(gap).toBeGreaterThan(FOSSIL.ribWidth * 2);
  });
});
