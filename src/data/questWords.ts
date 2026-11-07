/**
 * Слова «Собери слово»: таблица по длине и выдача слов узлу.
 *
 * Вынесено из `quest.ts` вместе с викториной и столами (`questQuiz.ts`,
 * `questDeals.ts`): файл подошёл к порогу в шестьсот строк. Без Phaser.
 */
import { TEX } from '../art/keys';
import { dealFromDeck } from './questDeck';

/** Собери слово по картинке. Слова растут от круга к кругу. */
export interface WordPuzzle {
  /** Слово заглавными буквами. */
  word: string;
  /** Картинка-подсказка: ключ из TEX.FOOT, TEX.GEAR или TEX.WORD_PIC. */
  icon: string;
}

/**
 * Слова по длине: ступень поднимает строку, вариант крутит порядок внутри неё.
 *
 * Раньше тут лежали четыре готовых набора по три слова, и `tier` выбирал
 * набор целиком. Со ступени 3 окно упиралось в конец таблицы, и все узлы со
 * второго круга получали один и тот же набор — «СВИСТОК, БУТЫЛКА, ПЕРЧАТКА»
 * на всю игру. Теперь строка задаёт только длину слов, а три слова из неё
 * выбирает перемешивание по варианту: в верхней строке их восемь, и наборов
 * из неё набирается полсотни.
 *
 * Строки растут по длине слова, и это проверяет тест, а не глаз.
 */
export const WORD_TIERS: readonly (readonly WordPuzzle[])[] = [
  [
    { word: 'МЯЧ', icon: TEX.FOOT[0] },
    { word: 'ФЛАГ', icon: TEX.FOOT[5] },
    { word: 'ШАРФ', icon: TEX.FOOT[10] },
    { word: 'ЧАСЫ', icon: TEX.FOOT[9] },
    { word: 'ПОЛЕ', icon: TEX.WORD_PIC.pitch },
    { word: 'ДУШ', icon: TEX.WORD_PIC.shower },
  ],
  [
    { word: 'СЕТКА', icon: TEX.FOOT[6] },
    { word: 'КОНУС', icon: TEX.FOOT[7] },
    { word: 'БУТСА', icon: TEX.FOOT[1] },
    { word: 'КУБОК', icon: TEX.FOOT[3] },
    { word: 'НАСОС', icon: TEX.GEAR[6] },
    { word: 'ЩИТКИ', icon: TEX.GEAR[5] },
    { word: 'ГЕТРЫ', icon: TEX.GEAR[4] },
    { word: 'ШОРТЫ', icon: TEX.GEAR[3] },
    { word: 'ДУДКА', icon: TEX.GEAR[9] },
    { word: 'МЕДАЛЬ', icon: TEX.FOOT[8] },
    { word: 'РЮКЗАК', icon: TEX.GEAR[11] },
  ],
  [
    { word: 'СВИСТОК', icon: TEX.FOOT[2] },
    { word: 'БУТЫЛКА', icon: TEX.FOOT[11] },
    { word: 'ПОВЯЗКА', icon: TEX.GEAR[7] },
    { word: 'АПТЕЧКА', icon: TEX.GEAR[10] },
    { word: 'ПЕРЧАТКА', icon: TEX.FOOT[4] },
    { word: 'КАРТОЧКА', icon: TEX.GEAR[0] },
    { word: 'ФУТБОЛКА', icon: TEX.GEAR[2] },
    { word: 'СКАМЕЙКА', icon: TEX.GEAR[8] },
    { word: 'ТРИБУНА', icon: TEX.WORD_PIC.stands },
  ],
];

/** Сколько слов в одной задачке. */
export const WORDS_PER_PUZZLE = 3;

/** С какой ступени слова становятся пятибуквенными. */
const WORD_FROM_ROW_1 = 2;

/**
 * Какая строка таблицы в ходу на этой ступени.
 *
 * Ряд 0 — только ступени 0–1: пятибуквенные слова приходят с третьего круга,
 * а не с четвёртого, и это читается ростом (004-1). Дальше по три ступени.
 */
export function wordTierIndex(step: number): number {
  const last = WORD_TIERS.length - 1;
  const at = Math.max(0, step);
  if (at < WORD_FROM_ROW_1) return 0;
  return Math.min(last, Math.max(1, Math.floor(at / 3)));
}

/**
 * Слова для узла: длина — от ступени, какие именно — от варианта.
 *
 * Строку целиком брать нельзя (`tier` на верхней ступени перестаёт слышать
 * вариант, и все узлы получают один набор), поэтому строка — колода
 * (`questDeck.ts`): перемешана один раз, узел берёт свой срез из трёх слов.
 * Соседние узлы делят слова, только если в строке их меньше, чем нужно на все
 * срезы разом.
 */
export function wordSet(step: number, variant: number): readonly WordPuzzle[] {
  const index = wordTierIndex(step);
  return dealFromDeck(WORD_TIERS[index] ?? [], 5300 + index * 6421, variant, {
    count: WORDS_PER_PUZZLE,
    stride: WORDS_PER_PUZZLE,
  });
}
