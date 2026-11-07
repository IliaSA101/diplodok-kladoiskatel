/**
 * Раскладка интерфейса: ряды точек прогресса и ряд плиток с буквами.
 *
 * Модуль намеренно без Phaser — это чистая арифметика, и только поэтому её
 * можно проверить тестом. Пока те же формулы жили прямо в сценах рядом с
 * рисованием, проверить их было нечем, и точки соседних лесов сливались в
 * одну сплошную линию через весь экран: ряд из десяти точек занимал 232 px
 * при шаге между кружками 230.
 */

export interface DotRows {
  /** Сколько точек в ряду. */
  perRow: number;
  /** Сколько получится рядов. */
  rows: number;
}

/**
 * Сколько точек влезает в один ряд, чтобы ряды соседей не слиплись.
 *
 * `span` — расстояние между центрами соседних кружков, `gap` — просвет,
 * который должен остаться между их рядами.
 */
export function dotsPerRowLimit(span: number, gap: number, dotRadius: number, step: number): number {
  const room = span - gap - dotRadius * 2;
  return Math.max(1, Math.floor(room / step) + 1);
}

/**
 * Разложить `total` точек: в один ряд, пока влезают, дальше в два и больше.
 * В ряду никогда не бывает больше `maxPerRow` — иначе панель выйдет за край.
 */
export function dotRows(total: number, maxPerRow: number): DotRows {
  const limit = Math.max(1, maxPerRow);
  if (total <= 0) return { perRow: limit, rows: 0 };
  const perRow = Math.min(total <= limit ? total : Math.ceil(total / 2), limit);
  return { perRow, rows: Math.ceil(total / perRow) };
}

export interface RowFit {
  /** Расстояние между центрами соседних плиток. */
  step: number;
  /** Сторона плитки: уменьшается, когда букв много. */
  size: number;
  /** Центры плиток слева направо. */
  spots: number[];
}

/**
 * Ряд плиток между `left` и `right`: шаг, размер и центры.
 *
 * Шаг зажат сверху `maxStep`, иначе три буквы разъезжаются по всему экрану.
 * Размер плитки считается из шага, а не берётся постоянным: при десяти буквах
 * шаг выходил 101 px при плитке 110 — буквы налезали друг на друга, а крайняя
 * вылезала за панель. Раз размер один и тот же и для рисунка, и для зоны
 * нажатия, они не могут разойтись.
 */
export function rowFit(
  count: number,
  left: number,
  right: number,
  maxStep: number,
  maxSize: number,
  minGap: number,
): RowFit {
  if (count <= 0) return { step: maxStep, size: maxSize, spots: [] };
  const step = Math.min(maxStep, (right - left) / count);
  const size = Math.min(maxSize, Math.max(1, step - minGap));
  const center = (left + right) / 2;
  const spots = Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * step);
  return { step, size, spots };
}

/**
 * Ряд точек прогресса в задачке: где он живёт и каким шагом идёт.
 *
 * Границы тут, а не в сцене, потому что их проверяет тест: при двадцати парах
 * точки выстраивались в линию через весь верх и наезжали на заголовок.
 */
export const PUZZLE_DOTS = {
  /**
   * Шаг между кружками.
   *
   * Было 28. Ряд пришлось подвинуть влево от морды диплодока, и двадцать
   * кружков маджонга достали до заголовка. Шаг поджат, и самый длинный ряд
   * снова умещается в полосу между заголовком и диплодоком.
   */
  step: 24,
  rowStep: 26,
  /** Левее начинается заголовок задачки. */
  left: 820,
  /**
   * Правее начинается голова диплодока-наблюдателя (x 1137..1245).
   *
   * Раньше тут стояло 1190 «край экрана минус 90»: диплодока на экранах
   * задачек ещё не было. Когда он появился, два последних кружка оказались
   * прямо у него под мордой — счётчик стало некуда читать.
   */
  right: 1120,
} as const;

/** Сколько точек влезает в один ряд счётчика. */
export function puzzleDotsPerRow(): number {
  return Math.max(1, Math.floor((PUZZLE_DOTS.right - PUZZLE_DOTS.left) / PUZZLE_DOTS.step) + 1);
}

/**
 * Стол маджонга: числа, по которым складывается горка.
 *
 * Лежат тут, а не рядом с рисованием, потому что их проверяет тест: горка не
 * должна вылезать за панель, а карточка — мельчать настолько, что в неё
 * не попасть пальцем. Панель рисует addPuzzleBackdrop, отсюда её размеры.
 */
export const MAHJONG_TABLE = {
  maxSize: 150,
  /** Меньше этого карточка не нужна: в неё перестаёт попадать палец. */
  minSize: 110,
  gap: 10,
  inset: 18,
  panelWidth: 1120,
  panelHeight: 580,
  liftX: -22,
  liftY: -30,
} as const;

export interface StackRequest {
  columns: number;
  rows: number;
  /** Сколько этажей в горке: один — плоский стол. */
  layers: number;
  /** Желаемая сторона карточки; уменьшится, если горка не влезает. */
  maxSize: number;
  gap: number;
  /** Отступ от края панели. */
  inset: number;
  panelWidth: number;
  panelHeight: number;
  centerX: number;
  centerY: number;
  /** Куда уходит каждый следующий этаж: обычно вверх-влево, то есть минус. */
  liftX: number;
  liftY: number;
}

export interface StackLayout {
  size: number;
  /** Расстояние между центрами соседних карточек. */
  step: number;
  /** Центр карточки нижнего этажа в колонке 0, ряду 0. */
  originX: number;
  originY: number;
  /** Габариты всей горки вместе с верхними этажами. */
  bounds: { left: number; right: number; top: number; bottom: number };
}

/**
 * Горка карточек в панели: сторона карточки и где лежит нижняя левая.
 *
 * Вынос этажей входит и в расчёт размера, и в центровку, иначе горка съезжает
 * вверх-влево и верхний этаж вылезает за панель: при трёх этажах это уже
 * 44 px по горизонтали и 60 по вертикали. Габариты считаются как если бы
 * верхний этаж занимал все колонки — с запасом, зато без сюрпризов.
 */
export function stackLayout(req: StackRequest): StackLayout {
  const lift = Math.max(0, req.layers - 1);
  const roomX = req.panelWidth - req.inset * 2 - (req.columns - 1) * req.gap - Math.abs(req.liftX) * lift;
  const roomY = req.panelHeight - req.inset * 2 - (req.rows - 1) * req.gap - Math.abs(req.liftY) * lift;
  const size = Math.max(
    1,
    Math.min(req.maxSize, Math.floor(roomX / req.columns), Math.floor(roomY / req.rows)),
  );
  const step = size + req.gap;
  const spanX = (req.columns - 1) * step;
  const spanY = (req.rows - 1) * step;
  const originX = req.centerX - spanX / 2 - (lift * req.liftX) / 2;
  const originY = req.centerY - spanY / 2 - (lift * req.liftY) / 2;
  const half = size / 2;
  return {
    size,
    step,
    originX,
    originY,
    bounds: {
      left: originX + Math.min(0, lift * req.liftX) - half,
      right: originX + Math.max(spanX, spanX + lift * req.liftX) + half,
      top: originY + Math.min(0, lift * req.liftY) - half,
      bottom: originY + Math.max(spanY, spanY + lift * req.liftY) + half,
    },
  };
}

/**
 * Узел карты квеста и диплодок рядом с ним.
 *
 * Диплодок стоит сбоку, а не на узле: значок задачки должен быть виден целиком,
 * по нему ребёнок и выбирает, куда идти. Раньше диплодок стоял на самом узле и
 * закрывал собой картинку, из-за которой узел и нажимают. Числа лежат тут,
 * потому что их проверяет тест: по всем местам дорожки он не должен закрывать
 * ни одного значка.
 */
/**
 * Панель задачки: один и тот же прямоугольник у квеста и у английского.
 *
 * Числа 1120×580 стояли в двух сценах и ещё раз в тестах — отдельной копией
 * `{ left: 80, right: 1200, top: 100, bottom: 680 }`. Проверка, повторяющая
 * число за кодом, соглашается с кодом: подвинули бы панель — тест бы не
 * заметил. Теперь прямоугольник один, и берут его все.
 */
const PANEL_CENTER_Y = 390;

export const PUZZLE_PANEL = {
  width: 1120,
  height: 580,
  centerX: 640,
  centerY: PANEL_CENTER_Y,
  left: 640 - 1120 / 2,
  right: 640 + 1120 / 2,
  top: PANEL_CENTER_Y - 580 / 2,
  bottom: PANEL_CENTER_Y + 580 / 2,
} as const;

export const MAP_NODE = {
  diameter: 110,
  /** Картинка внутри кружка. */
  icon: 62,
  /** Сторона наклейки решённого узла. */
  sticker: 58,
  /** Наклон наклейки, градусы. */
  stickerAngle: 10,
  /**
   * Сдвиг наклейки от центра узла — вправо и вверх.
   *
   * Висела слева-сверху и накрывала голову диплодока: он стоит у каждого узла
   * слева (`MAP_DINO.offsetX` отрицательный), так что наклейка решённого узла
   * ложилась ему на голову — на экране получалось двухголовое животное.
   * Справа свободно у всех восьми узлов, и чужой кружок наклейка не задевает.
   */
  stickerDx: 110 * 0.34,
  stickerDy: -110 * 0.34,
} as const;

/** Прямоугольник наклейки решённого узла с центром (x, y), с учётом наклона. */
export function mapStickerBox(
  x: number,
  y: number,
): { left: number; right: number; top: number; bottom: number } {
  const turn = (MAP_NODE.stickerAngle * Math.PI) / 180;
  const reach = (MAP_NODE.sticker * (Math.cos(turn) + Math.sin(turn))) / 2;
  return {
    left: x + MAP_NODE.stickerDx - reach,
    right: x + MAP_NODE.stickerDx + reach,
    top: y + MAP_NODE.stickerDy - reach,
    bottom: y + MAP_NODE.stickerDy + reach,
  };
}

export const MAP_DINO = {
  /** Рост рисунка на карте, px. */
  height: 90,
  /** Ширина к росту: рисунок 640×597. */
  aspect: 640 / 597,
  /** Сдвиг от центра узла: вбок и чуть вниз, чтобы лапы стояли на дорожке. */
  offsetX: -106,
  offsetY: 36,
} as const;

/** Прямоугольник диплодока, когда он стоит у узла с центром (x, y). */
export function mapDinoBox(x: number, y: number): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const width = MAP_DINO.height * MAP_DINO.aspect;
  const bottom = y + MAP_DINO.offsetY;
  const left = x + MAP_DINO.offsetX - width / 2;
  return { left, right: left + width, top: bottom - MAP_DINO.height, bottom };
}

/**
 * Кнопки кругов в правом верхнем углу: по три в ряд.
 *
 * Кругов стало шесть, и в одну строку они перестали влезать — шестая кнопка
 * наезжала на панель счётчика посередине (её правый край 850). Два ряда по три
 * и читаются честнее: сверху круги с новыми наклейками, снизу золотые, где
 * наклейки идут по второму разу.
 *
 * Числа тут, а не в сцене, потому что их проверяет тест: ни одна кнопка
 * не должна залезть ни на панель счётчика, ни за край экрана, ни на дорожку.
 */
export const ROUND_PICKER = {
  radius: 34,
  step: 84,
  perRow: 3,
  /** GAME_WIDTH - CONFIG.ui.padding. */
  right: 1280 - 28,
  /** Центр первого ряда: CONFIG.ui.padding + radius + 6. */
  top: 28 + 34 + 6,
  /** Правый край панели счётчика: левее кнопкам нельзя. */
  headerRight: 1280 / 2 + 210,
} as const;

/** Где стоит кнопка круга: круги идут слева направо, рядами сверху вниз. */
export function roundPickerSpot(round: number): { x: number; y: number } {
  const { radius, step, perRow, right, top } = ROUND_PICKER;
  const index = Math.max(0, Math.round(round) - 1);
  return {
    x: right - radius - (perRow - 1 - (index % perRow)) * step,
    y: top + Math.floor(index / perRow) * step,
  };
}

/** Куда встаёт кнопка «этот круг заново»: под всеми рядами кругов. */
export function roundResetSpot(rounds: number): { x: number; y: number } {
  const { radius, step, perRow, right, top } = ROUND_PICKER;
  const rows = Math.max(1, Math.ceil(Math.max(1, rounds) / perRow));
  return { x: right - radius, y: top + (rows - 1) * step + radius + 16 + radius };
}

/**
 * Табло «Счёт на табло»: пример крупными цифрами и клетки под ответ.
 *
 * Клеток ровно столько, сколько цифр в ответе, — это единственная подсказка
 * и единственный способ понять, когда ответ набран: кнопки «готово» на экране
 * нет, табло проверяет само, как только клетки заполнены. Поэтому раскладка
 * обязана считаться, а не подбираться на глаз: тест держит и то, что пример
 * не вылезает за табло, и то, что ряд предметов не залезает на соседнее число.
 */
export const COUNT_BOARD = {
  centerX: 1280 / 2,
  centerY: 258,
  /** Без мячей пример короче, и табло подбирается — иначе одна цифра тонет. */
  width: 840,
  widthWithPictures: 1000,
  height: 210,
  /** Шаг между знаками примера; с картинками шире — под числом ряд предметов. */
  gap: 96,
  gapWithPictures: 200,
  digitSize: 88,
  /** Клетка под цифру ответа. */
  slot: 88,
  slotGap: 12,
  /**
   * Предметы под числом: мячи, которые ребёнок пересчитывает.
   *
   * Мяч в двадцать пикселей на экране превращался в точку — пересчитать такое
   * нельзя. Отсюда и широкий `gapWithPictures`: ряд из пяти мячей должен
   * помещаться между числами, не налезая на соседнее.
   */
  pictureSize: 36,
  pictureStep: 38,
  pictureCols: 5,
  /** Первый ряд предметов — настолько ниже центра табло. */
  pictureTop: 44,
} as const;

export interface CountSpots {
  left: number;
  op: number;
  right: number;
  eq: number;
  /** По одной клетке на цифру ответа. */
  slots: number[];
}

/** Ширина табло: с мячами под числами строка заметно длиннее. */
export function countBoardWidth(pictures: boolean): number {
  return pictures ? COUNT_BOARD.widthWithPictures : COUNT_BOARD.width;
}

/** Где стоят знаки примера: вся строка целиком по центру табло. */
export function countSpots(digits: number, pictures: boolean): CountSpots {
  const { centerX, gap, gapWithPictures, slot, slotGap } = COUNT_BOARD;
  const span = pictures ? gapWithPictures : gap;
  const slotStep = slot + slotGap;
  const count = Math.max(1, Math.round(digits));
  const total = span * 4 + (count - 1) * slotStep;
  const first = centerX - total / 2;
  return {
    left: first,
    op: first + span,
    right: first + span * 2,
    eq: first + span * 3,
    slots: Array.from({ length: count }, (_, i) => first + span * 4 + i * slotStep),
  };
}

/** Сдвиги предметов под числом: до пяти в ряд, дальше вторым рядом. */
export function countPictureSpots(count: number): { dx: number; dy: number }[] {
  const { pictureStep, pictureCols, pictureTop } = COUNT_BOARD;
  const total = Math.max(0, Math.round(count));
  return Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / pictureCols);
    const inRow = Math.min(pictureCols, total - row * pictureCols);
    const col = i % pictureCols;
    return {
      dx: (col - (inRow - 1) / 2) * pictureStep,
      dy: pictureTop + row * pictureStep,
    };
  });
}

/**
 * Клавиши с цифрами: два ряда по пять и кнопка «стереть» справа.
 *
 * Клавиша 110 px — ровно тот размер, в который попадает палец ребёнка; этот
 * порог уже стоил нам переделки маджонга, и уменьшать его тут нельзя.
 */
export const COUNT_KEYS = {
  size: 110,
  gap: 14,
  cols: 5,
  /** Центр первой клавиши; клавиши и «стереть» стоят по центру панели. */
  left: 316,
  top: 452,
  eraseRadius: 56,
  eraseX: 963,
  eraseY: 514,
} as const;

/** Где стоит клавиша с цифрой: 1…5 в первом ряду, 6…9 и 0 во втором. */
export function countKeySpot(index: number): { x: number; y: number } {
  const { size, gap, cols, left, top } = COUNT_KEYS;
  const step = size + gap;
  const i = Math.max(0, Math.round(index));
  return { x: left + (i % cols) * step, y: top + Math.floor(i / cols) * step };
}

/**
 * «Что дальше в ряду»: ряд из восьми клеток и карточки ответа под ним.
 *
 * Восемь клеток — это два с лишним повтора мотива: меньше, и узор не виден,
 * больше, и клетка мельчает. Поэтому ширина клетки посчитана от панели, а не
 * выбрана на глаз: 8×112 с зазорами даёт 1008 при внутренних 1120.
 */
export const PATTERN_ROW = {
  cell: 112,
  gap: 16,
  icon: 84,
  centerX: 640,
  rowY: 282,
  /** Карточки ответа: их три или четыре. */
  option: 200,
  optionStep: 240,
  optionIcon: 140,
  optionsY: 512,
} as const;

/** Середина клетки номер index в ряду из count клеток. */
export function patternCellSpot(index: number, count: number): { x: number; y: number } {
  const step = PATTERN_ROW.cell + PATTERN_ROW.gap;
  return {
    x: PATTERN_ROW.centerX + (index - (count - 1) / 2) * step,
    y: PATTERN_ROW.rowY,
  };
}

/** Середина карточки ответа номер index из total. */
export function patternOptionSpot(index: number, total: number): { x: number; y: number } {
  return {
    x: PATTERN_ROW.centerX + (index - (total - 1) / 2) * PATTERN_ROW.optionStep,
    y: PATTERN_ROW.optionsY,
  };
}

/**
 * «Повтори порядок»: кнопки в один ряд.
 *
 * Ряд, а не сетка: задачка про «в каком порядке», и порядок слева направо
 * ребёнок уже знает по книжкам. В сетке 2×3 пришлось бы объяснять, куда
 * идти после правой верхней, — а объяснять тут нечем, читать он не умеет.
 */
export const SEQUENCE_PADS = {
  /** Крупнее не нужно: четыре кнопки и так занимают полэкрана. */
  maxSize: 170,
  gap: 22,
  /** Ширина панели минус поля. */
  room: 1060,
  centerX: 640,
  centerY: 400,
} as const;

/** Сторона кнопки при таком числе кнопок. */
export function sequencePadSize(pads: number): number {
  const fit = Math.floor((SEQUENCE_PADS.room - (pads - 1) * SEQUENCE_PADS.gap) / pads);
  return Math.min(SEQUENCE_PADS.maxSize, fit);
}

/** Середина кнопки номер index из pads. */
export function sequencePadSpot(index: number, pads: number): { x: number; y: number } {
  const step = sequencePadSize(pads) + SEQUENCE_PADS.gap;
  return {
    x: SEQUENCE_PADS.centerX + (index - (pads - 1) / 2) * step,
    y: SEQUENCE_PADS.centerY,
  };
}

/**
 * Где стоят карточки прямоугольной сетки, если последний ряд неполный.
 *
 * Отступ слева раньше считался один на всю сетку — по *полному* ряду. Пока
 * карточки делились на колонки без остатка, этого никто не замечал. На
 * двадцати семи карточках в шесть колонок последний ряд — три штуки — остался
 * прижат влево, и справа в панели зияла дыра размером с половину ряда.
 * Ребёнок спросил, почему там пусто.
 *
 * Поэтому каждый ряд центрируется по своей длине, а не по длине полного.
 * Возвращаются смещения от середины сетки: куда эту середину поставить,
 * решает сцена.
 */
export interface GridSpot {
  dx: number;
  dy: number;
}

export function centredGrid(
  count: number,
  columns: number,
  step: number,
): { rows: number; spots: GridSpot[] } {
  const cols = Math.max(1, Math.floor(columns));
  const total = Math.max(0, Math.floor(count));
  const rows = Math.ceil(total / cols);
  const spots: GridSpot[] = [];
  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / cols);
    // Сколько карточек в этом ряду: в последнем их может быть меньше.
    const inRow = Math.min(cols, total - row * cols);
    const col = index - row * cols;
    spots.push({
      dx: (col - (inRow - 1) / 2) * step,
      dy: (row - (rows - 1) / 2) * step,
    });
  }
  return { rows, spots };
}

/**
 * Хаб английского: ряд карточек игр и место для диплодока под ним.
 *
 * На экранах задачек диплодок выглядывает из-за панели справа вверху, а тут
 * этот угол занят кнопкой звука, и голова легла бы прямо на неё. Поэтому на
 * хабе он не выглядывает, а стоит на траве целиком — в полосе под карточками.
 * Полоса узкая, и ряд карточек ради неё поднят: числа тут вместе не случайно,
 * их и проверяет тест.
 */
export const ENGLISH_HUB = {
  cardWidth: 340,
  cardHeight: 272,
  cardCenterY: 478,
  cardStep: 400,
  /** Трава начинается тут же, где на всех экранах: GAME_HEIGHT - 70. */
  grassTop: 650,
  dino: { centerX: 148, bottom: 714, height: 92 },
} as const;
