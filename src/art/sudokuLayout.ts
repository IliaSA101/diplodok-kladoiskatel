/**
 * Раскладка судоку: поле, палитра значков и ластик.
 *
 * Вынесено из `art/layout.ts`, когда тот упёрся в порог в шестьсот строк, —
 * ровно так же, как до этого вынесли `art/dinoLayout.ts`. Phaser сюда не
 * импортируется: всё это считается числами и проверяется тестом.
 */
/**
 * Поле судоку: клетки, квадраты и палитра значков справа.
 *
 * Считается, а не подбирается, потому что поле бывает двух размеров. На 4×4
 * клетка 118 px — палец попадает без разговоров. На 6×6 в ту же панель
 * помещается только 80: это уже про мышь на ноутбуке, а не про палец
 * на планшете, и меньше делать нельзя — отсюда порог ниже и тест на него.
 *
 * Левый край поля и палитра стоят там же, где стояли при 4×4: экран судоку
 * ребёнок знает, и переезжать ему незачем.
 */
const MARGIN = 30;
const PAD = 12;

export const SUDOKU_BOARD = {
  /** Клетка крупнее не нужна: 4×4 и так занимает полпанели. */
  maxPitch: 126,
  /** Меньше этого в клетку перестаёт попадать даже курсор. */
  minPitch: 80,
  blockGap: 8,
  /** Рамка тёмной подложки вокруг поля. */
  pad: PAD,
  /** Левый край поля: правее кнопки «назад» в углу. */
  left: 174,
  /** Центр поля по вертикали — он же центр панели задачки. */
  centerY: 390,
  /**
   * Просвет между тёмной подложкой поля и краем панели.
   *
   * Был не задан, и высоту поле забирало всю, какая есть: шестёрка встала в
   * шесть пикселей от верхнего края, рамка закрыла скруглённый угол панели, и
   * поле читалось обрезанным. Отступ один на все размеры — и 4×4, и 6×6
   * занимают одну и ту же высоту, просто разной клеткой.
   */
  margin: MARGIN,
  /** Сколько высоты панели отдано самим клеткам: панель минус отступ и рамка. */
  room: 580 - (MARGIN + PAD) * 2,
  paletteButton: 110,
  paletteRowStep: 140,
  /** Правый край панели минус отступ. */
  paletteRight: 1184,
  /** Просвет между полем и палитрой. */
  paletteGap: 24,
} as const;

export interface SudokuLayout {
  /** Шаг клеток и сторона клетки. */
  pitch: number;
  cell: number;
  icon: number;
  boardW: number;
  boardH: number;
  boardX: number;
  boardY: number;
  /** Палитра значков: сетка по cols столбцов правее поля. */
  paletteX: number;
  paletteCols: number;
  paletteStep: number;
  paletteTop: number;
  eraserY: number;
}

/** Раскладка поля стороной `size` с квадратами `boxW`×`boxH`. */
export function sudokuLayout(size: number, boxW: number, boxH: number): SudokuLayout {
  const B = SUDOKU_BOARD;
  const rowGaps = size / boxH - 1;
  const colGaps = size / boxW - 1;
  const pitch = Math.max(
    B.minPitch,
    Math.min(B.maxPitch, Math.floor((B.room - rowGaps * B.blockGap) / size)),
  );
  const boardW = size * pitch + colGaps * B.blockGap;
  const boardH = size * pitch + rowGaps * B.blockGap;
  const cols = size <= 4 ? 2 : 3;
  const paletteLeft = B.left + boardW + B.paletteGap;
  const rows = Math.ceil(size / cols);
  return {
    pitch,
    cell: pitch - 8,
    icon: Math.round((pitch - 8) * 0.76),
    boardW,
    boardH,
    boardX: B.left + boardW / 2,
    boardY: B.centerY,
    paletteX: (paletteLeft + B.paletteRight) / 2,
    paletteCols: cols,
    paletteStep: cols === 2 ? 150 : 140,
    paletteTop: B.centerY - ((rows - 1) * B.paletteRowStep) / 2 - 70,
    eraserY: B.centerY + 140,
  };
}

/** Где стоит кнопка значка v в палитре судоку. */
export function sudokuToolSpot(layout: SudokuLayout, v: number): { x: number; y: number } {
  const col = v % layout.paletteCols;
  const row = Math.floor(v / layout.paletteCols);
  return {
    x: layout.paletteX + (col - (layout.paletteCols - 1) / 2) * layout.paletteStep,
    y: layout.paletteTop + row * SUDOKU_BOARD.paletteRowStep,
  };
}
