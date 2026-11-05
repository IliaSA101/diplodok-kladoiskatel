/**
 * Слова английской ветки: наборы по пять слов.
 *
 * Файл без Phaser и без рисования — его импортируют и сцены, и тесты.
 * Пополнять ветку новыми словами нужно только здесь: экран сам покажет
 * столько наборов, сколько их тут лежит, а игры возьмут слова по порядку.
 *
 * Правила набора, за которые цепляются проверки в tests/english.test.ts:
 * слово только из латинских строчных букв, не длиннее поля поиска (пять),
 * перевод — одним коротким русским словом, какое ребёнок прочитает сам.
 */

import { TEX } from '../art/keys';

export interface EnglishWord {
  /** Как пишется: строчными, как в тетради. */
  en: string;
  /** Перевод: не подпись, а подсказка — её ещё надо попросить. */
  ru: string;
  /**
   * Английская подсказка: фраза с пропуском (`We __ friends`) или звук (`moo!`).
   *
   * Подсказке не обязательно быть рисунком — и это важнее, чем кажется.
   * Сначала казалось, что love, her, are, put и look не показать без перевода,
   * раз это не предметы. Но пропуск во фразе показывает их точнее любой
   * картинки, пишется словами и не ждёт художника.
   */
  clue?: string;
  /**
   * Цветное пятно: цвет показывают цветом, а не словом и не картинкой.
   *
   * `red` под подписью «красный» — это проверка чтения по-русски, а не цвета.
   */
  swatch?: number;
  /** Картинка-ребус: ключ текстуры. Появится, когда её нарисуют. */
  icon?: string;
}

/** Чем подсказываем слово: порядок — от самого наглядного к последнему. */
export type HintKind = 'picture' | 'swatch' | 'clue' | 'translation';

/**
 * Чем подсказать слово.
 *
 * Перевод — последний в очереди, и он же единственный русский в ветке:
 * ребёнок получает его, только если сам попросит кнопкой подсказки.
 * Тест стережёт, что до перевода дело не доходит: у каждого слова есть
 * английская подсказка.
 */
export function wordHint(word: EnglishWord): HintKind {
  if (word.icon !== undefined) return 'picture';
  if (word.swatch !== undefined) return 'swatch';
  if (word.clue !== undefined) return 'clue';
  return 'translation';
}

export interface EnglishSet {
  /** Стабильный ключ: по нему помнится пройденное. Переименовывать нельзя. */
  id: string;
  /** Подпись набора на экране. */
  title: string;
  words: readonly EnglishWord[];
}

/** Длиннее поле поиска не возьмёт: сетка 7×7. */
export const MAX_WORD_LENGTH = 5;

/** Сколько слов в наборе: столько же точек прогресса в каждой игре. */
export const WORDS_PER_SET = 5;

export const ENGLISH_SETS: readonly EnglishSet[] = [
  {
    id: 'first',
    title: 'First words',
    words: [
      { en: 'love', ru: 'люблю', clue: 'I __ you', icon: TEX.EN_CLUE.love },
      { en: 'her', ru: 'её', clue: 'Anna and __ dog', icon: TEX.EN_CLUE.her },
      { en: 'are', ru: 'мы есть', clue: 'We __ friends', icon: TEX.EN_CLUE.are },
      { en: 'put', ru: 'положи', clue: '__ it in the box', icon: TEX.EN_CLUE.put },
      { en: 'look', ru: 'смотри', clue: '__ at me', icon: TEX.EN_CLUE.look },
    ],
  },
  {
    id: 'animals',
    title: 'Animals',
    words: [
      { en: 'cat', ru: 'кот', clue: 'meow!', icon: TEX.EN_CLUE.cat },
      { en: 'dog', ru: 'собака', clue: 'woof!', icon: TEX.EN_CLUE.dog },
      { en: 'cow', ru: 'корова', clue: 'moo!', icon: TEX.EN_CLUE.cow },
      { en: 'pig', ru: 'свинка', clue: 'oink!', icon: TEX.EN_CLUE.pig },
      { en: 'hen', ru: 'курица', clue: 'cluck!', icon: TEX.EN_CLUE.hen },
    ],
  },
  {
    id: 'colours',
    title: 'Colours',
    words: [
      { en: 'red', ru: 'красный', swatch: 0xe0503c },
      { en: 'blue', ru: 'синий', swatch: 0x3c7de0 },
      { en: 'green', ru: 'зелёный', swatch: 0x4caf50 },
      { en: 'black', ru: 'чёрный', swatch: 0x2b2b3d },
      { en: 'white', ru: 'белый', swatch: 0xfff6e8 },
    ],
  },
];

/** Три игры ветки. Ключи попадают в сохранение — переименовывать нельзя. */
export const ENGLISH_GAMES = ['anagram', 'search', 'catch'] as const;

export type EnglishGame = (typeof ENGLISH_GAMES)[number];

/** Набор по номеру; номер вне списка приводится к ближайшему. */
export function englishSet(index: number): EnglishSet {
  const safe = Math.min(ENGLISH_SETS.length - 1, Math.max(0, Math.floor(index)));
  const set = ENGLISH_SETS[safe];
  if (set === undefined) throw new Error('пустой список наборов');
  return set;
}
