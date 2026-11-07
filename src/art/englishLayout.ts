/**
 * Раскладка «Find a word»: поле, список слов и всё, что в нём стоит.
 *
 * Вынесено из `art/layout.ts`, когда тот упёрся в порог в шестьсот строк, —
 * и до того, как в список добавилась колонка картинок. Модуль без Phaser:
 * числа проверяются тестом (`tests/layout.test.ts`), а не глазом.
 *
 * Кнопка звука лежала на кнопке «?» первого слова — десять пикселей сверху, —
 * и это пробовали лечить уменьшенной зоной нажатия у подсказки. Лечили
 * симптом: на экране по-прежнему один круг лежал на другом. Теперь верх
 * списка **выводится** из кнопки звука и просвета, а не стоит числом.
 */
import { GAME_WIDTH } from '../config';
import { ENGLISH_SETS } from '../data/english';
import { PALETTE } from './palette';

const ENGLISH_SPEAK_Y = 162;
const ENGLISH_SPEAK_RADIUS = 54;
const ENGLISH_HINT_RADIUS = 24;
const ENGLISH_GAP = 12;
/** Сторона картинки слова. Строки идут через 72, так что между ними остаётся просвет. */
const ENGLISH_ICON = 60;
/** Кегль слова в списке и запас его ширины на символ (по замеру: «green» занимает 110 из 140). */
const ENGLISH_WORD_SIZE = 40;
const ENGLISH_WORD_CHAR_WIDTH = 0.7;
/** Самое длинное английское слово наборов: от него считается, где кончается колонка слов. */
const LONGEST_WORD = Math.max(...ENGLISH_SETS.flatMap((set) => set.words.map((word) => word.en.length)));

/** Середина ряда точек в «Find a word»: между заголовком и полем. */
export const SEARCH_DOTS_Y = 126;

export const ENGLISH_LIST = {
  /** Середина колонки слов: от неё считаются кнопки справа. */
  x: 920,
  /** Шаг строк. */
  step: 72,
  /**
   * Сдвиг кнопки «?» от середины колонки. Перевод раскрывается по центру кнопки:
   * «Мы — друзья» шире кружка вчетверо, и правее он вылез бы за край панели.
   */
  hintDx: 160,
  /** Кегль перевода и запас его ширины на символ (по замеру «Мы — друзья» на экране). */
  hintTextSize: 26,
  hintCharWidth: 0.62,
  hintRadius: ENGLISH_HINT_RADIUS,
  /** Кнопка «озвучить»: сдвиг от середины колонки и своя высота. */
  speakDx: 180,
  speakY: ENGLISH_SPEAK_Y,
  speakRadius: ENGLISH_SPEAK_RADIUS,
  /** Первая строка — ниже кнопки звука на её радиус, просвет и радиус «?». */
  top: ENGLISH_SPEAK_Y + ENGLISH_SPEAK_RADIUS + ENGLISH_GAP + ENGLISH_HINT_RADIUS,
  gap: ENGLISH_GAP,
  /** Картинка слова слева: центр по x и сторона. */
  iconX: 730,
  icon: ENGLISH_ICON,
  /** Левый край слова: слова выровнены по нему, а не по середине колонки. */
  wordLeft: 780,
  wordSize: ENGLISH_WORD_SIZE,
  /** Ширина самого длинного слова наборов с запасом: считается по данным, не числом. */
  wordMaxWidth: LONGEST_WORD * ENGLISH_WORD_SIZE * ENGLISH_WORD_CHAR_WIDTH,
} as const;

/** Поле букв: плитка, просвет и положение центра. */
export const SEARCH_GRID = {
  size: 7,
  cell: 68,
  gap: 6,
  centerX: 400,
  centerY: 410,
} as const;

/** Выбранная плитка чуть крупнее — настолько, чтобы не лечь на соседей (просвет 6). */
export const SEARCH_LIT_SCALE = 1.08;

/**
 * Сколько пикселей руки от точки нажатия — уже протягивание, а не клик.
 * Небрежный клик на стыке плиток уезжает на соседнюю на пару пикселей: просвет
 * между плитками (6) с запасом на дрожь. Но меньше половины плитки, иначе
 * протянуть от центра одной на соседнюю было бы нельзя.
 */
export const SEARCH_DRAG_MIN = 16;

/** Центр плитки поля. */
export function searchCellCenter(row: number, col: number): { x: number; y: number } {
  const { size, cell, gap, centerX, centerY } = SEARCH_GRID;
  const step = cell + gap;
  return {
    x: centerX - ((size - 1) * step) / 2 + col * step,
    y: centerY - ((size - 1) * step) / 2 + row * step,
  };
}

/** Какая плитка под точкой; просвет между плитками и всё вне поля — `null`. */
export function searchCellAt(x: number, y: number): { row: number; col: number } | null {
  const { size, cell } = SEARCH_GRID;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const centre = searchCellCenter(row, col);
      if (Math.abs(x - centre.x) <= cell / 2 && Math.abs(y - centre.y) <= cell / 2) {
        return { row, col };
      }
    }
  }
  return null;
}

/**
 * Обводка цветного пятна у слова. Пятно `white` залито цветом панели, и с серой
 * обводкой оно читалось пустым кружком: обводка тёмная, как у пятна в самой игре.
 */
export const SWATCH_OUTLINE = { width: 4, color: PALETTE.uiText } as const;

/**
 * Ряды плиток в играх: числа вынесены из сцен, чтобы тест считал по ним же.
 * Самое длинное слово — `brother` (семь букв), и «Make a word» кладёт к нему
 * ещё одну лишнюю плитку: восемь в ряд.
 */
export const ANAGRAM_ROW = {
  left: 200,
  right: GAME_WIDTH - 200,
  maxStep: 124,
  tile: 104,
  gap: 10,
  /** Ячейки слова расставлены чуть реже плиток внизу. */
  cellGap: 4,
} as const;

export const CATCH_ROW = {
  left: 260,
  right: GAME_WIDTH - 260,
  maxStep: 116,
  tile: 92,
  gap: 12,
} as const;

/**
 * Вертикаль «Catch letters»: ряд точек, задание-картинка и клетки слова.
 *
 * Картинки людей — портреты без полей, они заполняют квадрат до краёв (у
 * прежних значков по краям была прозрачность). Между точками и клетками 128 px,
 * а картинка была 134: подбородок уходил под клетки, макушка касалась точек.
 */
export const CATCH_COLUMN = {
  dotsY: 126,
  /** Середина картинки-задания и её размер (`createWordPrompt`: сторона = size × 2.4). */
  promptY: 212,
  promptSize: 50,
  slotsY: 330,
} as const;

/**
 * Кружки наборов на экране ветки (003-2): в каждом картинка набора, не цифра.
 *
 * Шесть кружков по шагу 88 занимают ~510 px посередине: слева остаётся кнопка
 * «назад» (до x 168), справа — кнопка звука (от x 1160). Выбранный кружок крупнее
 * на `selectedScale`, и его верх ещё ниже заголовка, а низ — выше панели слов.
 */
export const SET_PICKER = {
  radius: 36,
  step: 88,
  y: 128,
  selectedScale: 1.14,
  /** Какую долю диаметра занимает картинка: в кружок вписана, но крупная. */
  pictureShare: 0.78,
} as const;

/** Центры кружков по x: посередине экрана, шаг один. */
export function setPickerSpots(count: number): number[] {
  const left = GAME_WIDTH / 2 - ((count - 1) * SET_PICKER.step) / 2;
  return Array.from({ length: count }, (_, i) => left + i * SET_PICKER.step);
}
