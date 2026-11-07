/**
 * Слова английской ветки: наборы по пять слов.
 *
 * Файл без Phaser и без рисования — его импортируют и сцены, и тесты.
 * Пополнять ветку новыми словами нужно только здесь: экран сам покажет
 * столько наборов, сколько их тут лежит, а игры возьмут слова по порядку.
 *
 * Правила набора, за которые цепляются проверки в tests/english.test.ts:
 * слово только из латинских строчных букв, не длиннее поля поиска (семь),
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

/** Длиннее поле поиска не возьмёт: сетка 7×7 (самое длинное слово — brother). */
export const MAX_WORD_LENGTH = 7;

/** Сколько слов в наборе: столько же точек прогресса в каждой игре. */
export const WORDS_PER_SET = 5;

export const ENGLISH_SETS: readonly EnglishSet[] = [
  {
    id: 'first',
    title: 'First words',
    words: [
      { en: 'love', ru: 'люблю', clue: 'I __ you', icon: TEX.EN_CLUE.love },
      { en: 'her', ru: 'её', clue: 'Anna and __ dog', icon: TEX.EN_CLUE.her },
      { en: 'are', ru: 'Мы — друзья', clue: 'We __ friends', icon: TEX.EN_CLUE.are },
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
  {
    id: 'football',
    title: 'Football',
    words: [
      { en: 'ball', ru: 'мяч', clue: 'Kick the __!', icon: TEX.FOOT[0] },
      { en: 'boot', ru: 'бутса', clue: 'Put on a __', icon: TEX.FOOT[1] },
      { en: 'cup', ru: 'кубок', clue: 'We win the __!', icon: TEX.FOOT[3] },
      { en: 'flag', ru: 'флаг', clue: 'Wave the __!', icon: TEX.FOOT[5] },
      // Картинка — ворота с сеткой; в квесте тот же значок подписан СЕТКА, и
      // фраза говорит, что ждут именно гол.
      { en: 'goal', ru: 'ворота', clue: 'Score a __!', icon: TEX.FOOT[6] },
    ],
  },
  {
    id: 'food',
    title: 'Food',
    words: [
      { en: 'apple', ru: 'яблоко', clue: 'A red __', icon: TEX.EN_CLUE.apple },
      { en: 'milk', ru: 'молоко', clue: 'A glass of __', icon: TEX.EN_CLUE.milk },
      { en: 'bread', ru: 'хлеб', clue: 'Butter on my __', icon: TEX.EN_CLUE.bread },
      { en: 'egg', ru: 'яйцо', clue: 'An __ for breakfast', icon: TEX.EN_CLUE.egg },
      { en: 'cake', ru: 'торт', clue: 'A birthday __', icon: TEX.EN_CLUE.cake },
    ],
  },
  {
    // Фразы-подсказки различают пол и возраст там, где картинки легко спутать:
    // мама и сестра, папа и брат. Пары «mum и dad», «brother и sister» — парные
    // фразы, как в песенке; решает картинка.
    id: 'family',
    title: 'Family',
    words: [
      { en: 'mum', ru: 'мама', clue: '__ and dad', icon: TEX.EN_CLUE.mum },
      { en: 'dad', ru: 'папа', clue: 'Mum and __', icon: TEX.EN_CLUE.dad },
      { en: 'baby', ru: 'малыш', clue: 'Hush, little __!', icon: TEX.EN_CLUE.baby },
      { en: 'sister', ru: 'сестра', clue: 'Brother and __', icon: TEX.EN_CLUE.sister },
      { en: 'brother', ru: 'брат', clue: 'Sister and __', icon: TEX.EN_CLUE.brother },
    ],
  },
];

/**
 * Номер набора с самым длинным словом (при равенстве — первого).
 *
 * Крайний вариант для обхода `?shots`: на нём плитки «Make a word» и клетки
 * «Catch letters» теснее всего. «Последний набор» годился, пока длиннее всех
 * случайно стоял последним.
 */
export function longestWordSetIndex(): number {
  let best = 0;
  let bestLength = -1;
  ENGLISH_SETS.forEach((set, index) => {
    const length = Math.max(...set.words.map((word) => word.en.length));
    if (length > bestLength) {
      best = index;
      bestLength = length;
    }
  });
  return best;
}

/** Чем нарисован кружок набора: картинкой или, если картинки у слов нет, колесом пятен. */
export type SetBadge =
  | { kind: 'picture'; key: string }
  | { kind: 'wheel'; colours: readonly number[] };

/**
 * Что нарисовать на кружке набора вместо цифры (003-2).
 *
 * Одна фигура: ребёнок выбирает набор по картинке и не считает кружки. Football
 * и Food берут картинку первого слова (мяч, яблоко), Family — общую картинку
 * семьи, First words и Animals — сердце и кошку. У Colours слова — пятна цвета,
 * и кружок показывает их же колесом, а не рисунок, которого нет.
 */
export function setBadge(set: EnglishSet): SetBadge {
  if (set.id === 'family') return { kind: 'picture', key: TEX.EN_SET.family };
  const swatches = set.words.flatMap((word) => (word.swatch === undefined ? [] : [word.swatch]));
  if (swatches.length === set.words.length) return { kind: 'wheel', colours: swatches };
  const icon = set.words.find((word) => word.icon !== undefined)?.icon;
  if (icon === undefined) throw new Error('нет картинки для кружка набора ' + set.id);
  return { kind: 'picture', key: icon };
}

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
