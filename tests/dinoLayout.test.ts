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
import {
  DINO_TAIL,
  DINO_WATCH,
  EYE_BLINK,
  dinoBlinkScaleY,
  dinoEyeScale,
  dinoEyeTurn,
  dinoTailTip,
  dinoWatchBox,
  dinoWatchHead,
} from '../src/art/dinoLayout';
import { DINO_MESH } from '../src/art/dinoArtMeta';
import { CHEW, DIG, JOY, WALK } from '../src/art/dinoPoses';
import { HEAD_EYE, MESH_COLS, MESH_ROWS, applyWarp, prepareWarp } from '../src/art/dinoWarp';
import { ENGLISH_HUB, PUZZLE_DOTS } from '../src/art/layout';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';
import { phaserGrid } from './dinoWarpKit';

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

describe('глаз диплодока после радости', () => {
  // Глаз вырезан с рисунка в его разрешении и ужат до пикселей рига. Когда
  // радость кончалась, глаз возвращали в «масштаб 1» — и на экране победы он
  // вырастал втрое и висел над головой.
  it('у рисованного диплодока глаз ужат вместе с рисунком, у кодового — нет', () => {
    expect(dinoEyeScale(true, DINO_MESH.scale)).toBe(DINO_MESH.scale);
    expect(DINO_MESH.scale).toBeLessThan(1);
    expect(dinoEyeScale(false, DINO_MESH.scale)).toBe(1);
  });

  it('конец радости возвращает глазу его размер, а не единицу', () => {
    const rig = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    expect(rig).not.toContain('eyeOpen.setScale(1)');
    expect(rig).toContain('eyeOpen.setScale(this.eyeRestScale)');
  });

  it('глаз при сборке получает масштаб из dinoEyeScale и кладёт его в покой', () => {
    // Сборку не запустить без Phaser, поэтому проводку читаем в коде: пока
    // `eyeRestScale` не равен тому, чем глаз поставлен, радость сбросит его не туда.
    const parts = readFileSync('src/entities/dinoParts.ts', 'utf8');
    expect(parts).toContain('const eyeFit = dinoEyeScale(art, DINO_MESH.scale);');
    expect(parts.match(/\.setScale\(eyeFit\)/g)).toHaveLength(2);
    expect(parts).toContain('eyeRestScale: eyeFit,');
  });
});

describe('моргание диплодока', () => {
  // У рисованного глаза покой 0.327. Абсолютные 0.08 для него — другая толщина
  // щёлки, чем для кодового глаза, у которого покой 1.
  it('прищуривает от покоя, а не задаёт свой масштаб', () => {
    expect(dinoBlinkScaleY(1)).toBeCloseTo(EYE_BLINK, 10);
    const rest = dinoEyeScale(true, DINO_MESH.scale);
    expect(dinoBlinkScaleY(rest)).toBeCloseTo(rest * EYE_BLINK, 10);
    expect(dinoBlinkScaleY(rest)).toBeLessThan(rest);
    expect(dinoBlinkScaleY(rest)).toBeLessThan(dinoBlinkScaleY(1));
  });

  it('риг моргает от масштаба покоя глаза', () => {
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    expect(rig).toContain('scaleY: dinoBlinkScaleY(this.eyeRestScale),');
    expect(rig).not.toMatch(/scaleY: 0\.\d+,/);
  });
});

describe('глаз сидит в глазнице при любой позе головы', () => {
  // Глаз — отдельная картинка в headWrap, голова — вершины сетки. Твины
  // headWrap (радость, копание, жевание) поворачивали глаз, а сетку нет, и глаз
  // съезжал с головы: при копании на полтора своих размера, рядом проступала
  // заплатка глазницы. Берём пробную вершину ровно в точке глаза рисунка,
  // гнём её тем же applyWarp, что и сетку, и сравниваем с тем, где окажется
  // картинка глаза: headWrap + R(поворот headWrap) · R(headTurn) · HEAD_EYE.
  const { imageWidth: W, imageHeight: H, scale } = DINO_MESH;
  const NO_LEGS = [0, 0, 0, 0];

  /** Поза headWrap из твинов: место, где стоит голова, и её угол в градусах. */
  const POSES = {
    покой: { x: DINO_MESH.headRestX, y: DINO_MESH.headRestY, angle: 0 },
    'пик радости': { x: DINO_MESH.headRestX + JOY.headDx, y: DINO_MESH.headRestY + JOY.headDy, angle: JOY.headAngle },
    копание: { x: DINO_MESH.headRestX + DIG.headDx, y: DIG.headY, angle: DIG.headAngle },
    жевание: { x: DINO_MESH.headRestX, y: DINO_MESH.headRestY, angle: CHEW.headAngle },
  };

  /** Где пробная вершина после изгиба, в пикселях рига. */
  function vertexInRig(x: number, y: number): { x: number; y: number; turn: number } {
    // Вершина лежит там, где глаз на рисунке. Сетка — единичный квадрат, и
    // Phaser растягивает его на рисунок: по ширине на W, по высоте на H.
    const vertex = { x: (DINO_MESH.eyeX - W / 2) / W, y: (H / 2 - DINO_MESH.eyeY) / H };
    const mesh = { vertices: [vertex] };
    const bounds = prepareWarp(mesh);
    expect(bounds[0]?.kind, 'глаз попал в шею или голову, а не в тело').toBe('neck');
    const turn = applyWarp(mesh, bounds, x, y, NO_LEGS, NO_LEGS, 0, 0);
    const px = vertex.x * W + W / 2;
    const py = H / 2 - vertex.y * H;
    return {
      x: (px - DINO_MESH.shoulderImageX) * scale + DINO_MESH.shoulderX,
      y: (py - H) * scale,
      turn,
    };
  }

  /** Куда встаёт картинка глаза: headWrap, его поворот, затем поворот headTurn. */
  function eyeOverlay(pose: { x: number; y: number; angle: number }, turn: number) {
    const wrap = (pose.angle * Math.PI) / 180;
    const total = wrap + dinoEyeTurn(turn, wrap);
    return {
      x: pose.x + Math.cos(total) * HEAD_EYE.x - Math.sin(total) * HEAD_EYE.y,
      y: pose.y + Math.sin(total) * HEAD_EYE.x + Math.cos(total) * HEAD_EYE.y,
    };
  }

  for (const [name, pose] of Object.entries(POSES)) {
    it(`${name}: накладка глаза лежит на вершине сетки, а не рядом`, () => {
      const vertex = vertexInRig(pose.x, pose.y);
      const eye = eyeOverlay(pose, vertex.turn);
      const gap = Math.hypot(eye.x - vertex.x, eye.y - vertex.y);
      // Размер самого глаза в риге — около 15 px: полпикселя незаметны, а
      // прежний сдвиг на копании был около шестнадцати.
      expect(gap, `${name}: глаз оторвался на ${gap.toFixed(1)} px рига`).toBeLessThan(0.5);
    });
  }

  it('в покое глаз стоит там, где он нарисован на рисунке', () => {
    const rest = POSES['покой'];
    const vertex = vertexInRig(rest.x, rest.y);
    const eyeX = (DINO_MESH.eyeX - DINO_MESH.shoulderImageX) * scale + DINO_MESH.shoulderX;
    expect(vertex.x).toBeCloseTo(eyeX, 2);
    expect(vertex.y).toBeCloseTo((DINO_MESH.eyeY - H) * scale, 2);
  });

  it('dinoEyeTurn вычитает поворот headWrap, а при нулевом ничего не меняет', () => {
    expect(dinoEyeTurn(0.3, 0)).toBe(0.3);
    expect(dinoEyeTurn(0.3, 0.1)).toBeCloseTo(0.2, 10);
    expect(dinoEyeTurn(0, -0.2)).toBeCloseTo(0.2, 10);
  });

  it('позы в тесте взяты из твинов, а не придуманы', () => {
    // Числа поз живут в `art/dinoPoses.ts`: тест берёт их оттуда, и твины
    // обязаны брать оттуда же, а не держать свою копию, которая разойдётся.
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    expect(dip).toContain('x: this.restX + JOY.headDx,\n      y: this.restY + JOY.headDy,\n      angle: JOY.headAngle,');
    expect(dip).toContain('x: this.restX + DIG.headDx,\n      y: DIG.headY,\n      angle: DIG.headAngle,');
    expect(readFileSync('src/entities/dinoRig.ts', 'utf8')).toContain('angle: CHEW.headAngle,');
  });

  it('риг гасит поворот headWrap и пересчитывает сетку сразу после изгиба', () => {
    // Сцену без Phaser не запустить, проводку читаем в коде. Пересчёт сетки
    // в самом браузере держит e2e/dinoEye.spec.ts.
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    expect(rig).toContain('this.headTurn.setRotation(dinoEyeTurn(turn, this.headWrap.rotation));');
    const warp = rig.indexOf('const turn = applyWarp(');
    expect(warp).toBeGreaterThan(0);
    expect(rig.indexOf('plane.refresh();')).toBeGreaterThan(warp);
  });
});

describe('сетка диплодока не рвёт рисунок на ходу, в радости и при копании', () => {
  // Сетка 24×44 натянута на рисунок: грань — кусок картинки между тремя
  // вершинами, и если вершины одной грани улетели в разные стороны, кусок
  // растягивается, а обводка лапы пропадает. Вершины делит на «лапа / хвост /
  // шея / тело» prepareWarp, и граница класса — по x рисунка. Когда x вершин
  // стали делить на ширину (640), а не на высоту (597), вершины разъехались на
  // 7 %, пороги остались прежними, и край задней ближней лапы ушёл в хвост,
  // а край дальней передней — в тело: левая обводка лапы растягивалась в 4 раза.
  const { imageWidth: W, imageHeight: H } = DINO_MESH;
  const COLS = MESH_COLS;
  const ROWS = MESH_ROWS;

  // Сетка — та, что строит сам Phaser (`phaserGrid`): шесть вершин на клетку,
  // у каждой грани свои, x и y от −0.5 до 0.5, y вверх. Общая сетка 25×45,
  // на которой тест стоял раньше, граней не знала, а хозяина лапы теперь
  // назначают граням (`tests/dinoWarp.test.ts`).

  interface Bend {
    head: { x: number; y: number };
    legs: number[];
    lifts?: number[];
    tail: number;
    lag: number;
    /** Вес поворота основания шеи; на копании игра ставит 0. */
    rootGain?: number;
  }

  /**
   * Во сколько раз самое растянутое ребро клетки длиннее, чем в покое. Клетка —
   * шесть вершин двух граней; смотрим все пары разных точек покоя, в том числе
   * между гранями: разошедшиеся копии одного угла тоже растягивают клетку.
   */
  function faceStretch(bend: Bend, ix: number, iy: number): number {
    const rest = phaserGrid();
    const mesh = { vertices: phaserGrid() };
    applyWarp(
      mesh,
      prepareWarp(mesh),
      bend.head.x,
      bend.head.y,
      bend.legs,
      bend.lifts ?? [0, 0, 0, 0],
      bend.tail,
      bend.lag,
      bend.rootGain,
    );
    const first = (iy * COLS + ix) * 6;
    const length = (list: readonly { x: number; y: number }[], a: number, b: number): number => {
      const from = list[first + a];
      const to = list[first + b];
      return Math.hypot(((to?.x ?? 0) - (from?.x ?? 0)) * W, ((to?.y ?? 0) - (from?.y ?? 0)) * H);
    };
    let worst = 0;
    for (let a = 0; a < 6; a += 1) {
      for (let b = a + 1; b < 6; b += 1) {
        const before = length(rest, a, b);
        // Две копии одного угла (b и d стоят в обеих гранях) в покое совпадают.
        if (before < 1e-9) continue;
        worst = Math.max(worst, length(mesh.vertices, a, b) / before);
      }
    }
    return worst;
  }

  const HOME = { x: DINO_MESH.headRestX, y: DINO_MESH.headRestY };
  /** Позы из твинов: шаг — лапы ±16°, хвост ±7°; пик радости — ±28° и ±16°. */
  const LEG_POSES: Record<string, Bend> = {
    'шаг, задняя ближняя вперёд': { head: HOME, legs: [WALK.legSwing, -WALK.legSwing, -WALK.legSwing, WALK.legSwing], lifts: [0, WALK.legLift, WALK.legLift, 0], tail: WALK.tailSwing, lag: -WALK.tailSwing },
    'шаг, задняя ближняя назад': { head: HOME, legs: [-WALK.legSwing, WALK.legSwing, WALK.legSwing, -WALK.legSwing], lifts: [WALK.legLift, 0, 0, WALK.legLift], tail: -WALK.tailSwing, lag: WALK.tailSwing },
    'пик радости': { head: { x: HOME.x + JOY.headDx, y: HOME.y + JOY.headDy }, legs: [JOY.back, JOY.front, JOY.front, JOY.back], tail: JOY.tailSwing, lag: -JOY.tailSwing },
    'пик радости, зеркально': { head: { x: HOME.x + JOY.headDx, y: HOME.y + JOY.headDy }, legs: [-JOY.back, -JOY.front, -JOY.front, -JOY.back], tail: -JOY.tailSwing, lag: JOY.tailSwing },
  };

  /** Полоса лапы: грани, что лежат на ней целиком (хотя бы на 60 %). */
  function legFaces(): { ix: number; iy: number; leg: number }[] {
    const faces: { ix: number; iy: number; leg: number }[] = [];
    // Поворот лапы набирает силу за 34 px ниже живота (LEG_FADE): выше, у шва
    // с брюхом, грань растянута по самому устройству поворота и до правки.
    const SEAM = DINO_MESH.bellyY + 34;
    const gaps = DINO_MESH.legs.slice(1).map((leg, i) => {
      const left = DINO_MESH.legs[i];
      return [(left?.x ?? 0) + (left?.width ?? 0) / 2, leg.x - leg.width / 2] as const;
    });
    for (let iy = 0; iy < ROWS; iy += 1) {
      for (let ix = 0; ix < COLS; ix += 1) {
        const x0 = (ix * W) / COLS;
        const x1 = ((ix + 1) * W) / COLS;
        const y0 = (iy * H) / ROWS;
        // Грань, что лежит над просветом между лапами, рвётся всегда: соседние
        // лапы идут в разные стороны, и этот кусок — пустота между ними.
        if (gaps.some(([a, b]) => Math.min(x1, b) > Math.max(x0, a))) continue;
        DINO_MESH.legs.forEach((leg, i) => {
          const share = Math.max(0, Math.min(x1, leg.x + leg.width / 2) - Math.max(x0, leg.x - leg.width / 2));
          if (share / (x1 - x0) >= 0.6 && y0 >= SEAM && y0 < leg.bottom) faces.push({ ix, iy, leg: i });
        });
      }
    }
    return faces;
  }

  it('полоса лапы набрана: четыре лапы, край первой и край последней в счёте', () => {
    const faces = legFaces();
    expect(new Set(faces.map((f) => f.leg)).size).toBe(4);
    const xs = faces.map((f) => (f.ix * W) / COLS);
    // Левая обводка задней ближней лапы и правая — дальней передней: именно их рвало.
    expect(Math.min(...xs)).toBeLessThan(DINO_MESH.legs[0]?.x ?? 0);
    expect(Math.max(...xs)).toBeGreaterThan(DINO_MESH.legs[3]?.x ?? 0);
    // И копыто задней дальней: под ним сетка принадлежала хвосту.
    expect(faces.some((f) => (f.iy * H) / ROWS + H / ROWS > (DINO_MESH.legs[2]?.bottom ?? 0))).toBe(true);
  });

  // Вершины в просвете у брюха набирают поворот за 60 px, а не за 34 (LEG_GAP_FADE,
  // чтобы ребро у брюха между лапами 1 и 2 раскрывалось на 7 px, а не на 12). Клетка
  // с такой вершиной, пока та не набрала полный поворот (`gap`, `weight < 1` из
  // `prepareWarp`, не список клеток), растянута намеренно: на шаге до 1.21, в радости
  // до 1.38 (замер 06.11). На остальной лапе предел прежний, 1.3.
  const GAP_STRETCH = (name: string): number => (name.startsWith('пик радости') ? 1.4 : 1.25);
  const GAP_BOUNDS = prepareWarp({ vertices: phaserGrid() });
  const pulledAtGap = (ix: number, iy: number): boolean => {
    const first = (iy * COLS + ix) * 6;
    return [0, 1, 2, 3, 4, 5].some((k) => {
      const bound = GAP_BOUNDS[first + k];
      return bound?.kind === 'leg' && bound.gap && bound.weight < 1;
    });
  };

  for (const [name, bend] of Object.entries(LEG_POSES)) {
    it(`${name}: грань на лапе не растягивается больше чем в 1.3 раза, у просвета — по замеру`, () => {
      let strict = 0;
      let pulled = 0;
      for (const { ix, iy, leg } of legFaces()) {
        const stretch = faceStretch(bend, ix, iy);
        const gap = pulledAtGap(ix, iy);
        if (gap) pulled += 1;
        else strict += 1;
        expect(
          stretch,
          `лапа ${leg}, грань x ${Math.round((ix * W) / COLS)} y ${Math.round((iy * H) / ROWS)}${gap ? ' (у просвета)' : ''}: ×${stretch.toFixed(2)}`,
        ).toBeLessThan(gap ? GAP_STRETCH(name) : 1.3);
      }
      expect(pulled, 'клетки у просвета выделены').toBeGreaterThan(0);
      expect(strict, 'строгая часть лапы не пуста').toBeGreaterThan(pulled);
    });
  }

  it('вершина между двумя лапами идёт к той, к чьей оси ближе в долях ширины', () => {
    // Первая подошедшая лапа забирала и вершину, что стоит ближе ко второй:
    // между ногами она оказывалась не у той, и грань рвалась не там.
    const [a, b] = DINO_MESH.legs;
    if (a === undefined || b === undefined) throw new Error('в метаданных нет двух лап');
    // Точка, где доли ширины до осей равны: слева от неё ближе первая лапа.
    const even = (a.x * b.width + b.x * a.width) / (a.width + b.width);
    const legAt = (px: number): number | undefined => {
      const mesh = { vertices: [{ x: (px - W / 2) / W, y: (H / 2 - (DINO_MESH.bellyY + 60)) / H }] };
      const bound = prepareWarp(mesh)[0];
      return bound?.kind === 'leg' ? bound.leg : undefined;
    };
    expect(legAt(even - 1)).toBe(0);
    expect(legAt(even + 1)).toBe(1);
  });

  it('копание: грани под основанием головы не растягиваются больше, чем растягивались раньше', () => {
    // Строка граней, в которой лежит низ головы. Нижние вершины граней, что
    // правее шеи, попадали в тело и стояли, пока голова уезжала вниз: грань
    // растягивалась в 33 раза, от плеча вверх вставала тёмная игла обводки
    // челюсти. До правки x (в 1.1 и раньше) лучшие грани этой строки
    // растягивались в 1.4..1.75 раза: выше 1.75 нельзя.
    const headBaseY = DINO_MESH.headRestY / DINO_MESH.scale + H;
    const iy = Math.floor(headBaseY / (H / ROWS));
    const dig: Bend = { head: { x: HOME.x + DIG.headDx, y: DIG.headY }, legs: [0, 0, 0, 0], tail: 0, lag: 0, rootGain: 0 };
    // Левее шеи в этой строке пустота: рвать там нечего.
    const neckLeft = DINO_MESH.shoulderImageX - DINO_MESH.neckThickness / DINO_MESH.scale / 2;
    for (let ix = 0; ix < COLS; ix += 1) {
      if (((ix + 1) * W) / COLS <= neckLeft) continue;
      const stretch = faceStretch(dig, ix, iy);
      expect(stretch, `грань x ${Math.round((ix * W) / COLS)}: ×${stretch.toFixed(2)}`).toBeLessThan(1.75);
    }
  });

  it('копание: грани у плеча слева от шеи не рвутся между телом и шеей', () => {
    // Строка вершин лежит в 0.9 px над плечом. Ось шеи наклонена на 1.5°, и без
    // допуска у линии плеча одна вершина строки оказывалась шеей, а соседняя
    // телом: грань между ними растягивалась в 3.65 раза. До правки x это были
    // 1.0 и 1.98: выше двух нельзя.
    const shoulderY = DINO_MESH.shoulderY / DINO_MESH.scale + H;
    const iy = Math.floor(shoulderY / (H / ROWS));
    const dig: Bend = { head: { x: HOME.x + DIG.headDx, y: DIG.headY }, legs: [0, 0, 0, 0], tail: 0, lag: 0, rootGain: 0 };
    for (let ix = 0; ix < COLS; ix += 1) {
      if (((ix + 1) * W) / COLS > DINO_MESH.shoulderImageX) continue;
      const stretch = faceStretch(dig, ix, iy);
      expect(stretch, `грань x ${Math.round((ix * W) / COLS)}: ×${stretch.toFixed(2)}`).toBeLessThan(2);
    }
  });

  it('позы лап и хвоста в тесте взяты из твинов, а не придуманы', () => {
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    // Числа лежат в `art/dinoPoses.ts`; твины обязаны брать их оттуда.
    expect(rig).toContain('angle: { from: -WALK_SWING, to: WALK_SWING },');
    expect(rig).toContain('angle: { from: WALK_SWING, to: -WALK_SWING },');
    expect(rig).toContain('const WALK_SWING = WALK.legSwing;');
    expect(rig).toContain('angle: { from: -WALK.tailSwing, to: WALK.tailSwing },');
    expect(rig).toContain('const LEG_LIFT = WALK.legLift;');
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    expect(dip).toContain('angle: JOY.front,');
    expect(dip).toContain('angle: JOY.back,');
    expect(dip).toContain('angle: { from: -JOY.tailSwing, to: JOY.tailSwing },');
  });

  it('взмах лапы при копании доходит до сетки: redrawNeck читает ту самую лапу, что твинит playDigStroke', () => {
    // Твин копания держит `legs[3]` — это nearFront. В сетку (индекс 2: передняя
    // ближняя) должен уходить угол `frontLegs[1]`, а не `frontLegs[0]`, иначе лапа
    // на рисованном диплодоке при копании стоит как вкопанная. Три звена цепи читаем по
    // тексту: Phaser в тесте не поднять.
    const parts = readFileSync('src/entities/dinoParts.ts', 'utf8');
    expect(parts).toContain('legs: [farBack, farFront, nearBack, nearFront],');
    expect(parts).toContain('frontLegs: [farFront, nearFront],');
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    const stroke = dip.slice(dip.indexOf('playDigStroke(): void'));
    expect(stroke).toMatch(/targets: this\.legs\[3\],\s+angle: DIG\.paw,\s+duration: DIG\.pawMs,\s+delay: DIG\.pawDelayMs,\s+hold: DIG\.pawHold,/);
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    const neck = rig.slice(rig.indexOf('protected redrawNeck(): void'));
    expect(neck).toContain('this.legAngles[2] = this.frontLegs[1]?.angle ?? 0;');
    // Пара для шага остаётся прежней: на шаге обе передние лапы твинятся вместе.
    expect(neck).toContain('const pair = [this.backLegs[0]?.angle ?? 0, this.frontLegs[0]?.angle ?? 0];');
  });

  it('копание на ходу: взмах лапы не включается, лапа уже идёт шагом (два твина на одну лапу дают щелчок)', () => {
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    const stroke = dip.slice(dip.indexOf('playDigStroke(): void'), dip.indexOf('reachToCrown'));
    expect(stroke).toMatch(/if \(!this\.walking\) \{\s+tweens\.add\(\{\s+targets: this\.legs\[3\],/);
  });
});
