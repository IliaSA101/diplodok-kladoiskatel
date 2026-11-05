/**
 * Ввод букв с клавиатуры там, где буквы раскладывают мышью.
 *
 * «Собери слово» и английская анаграмма собирались только перетаскиванием
 * плашек. На ноутбуке это медленнее, чем набрать слово: рука уже на
 * клавиатуре, а ребёнок ведёт мышь к восьмой букве. Поэтому клавиша делает
 * ровно то же, что тап по плашке, — не вторую механику, а второй способ.
 *
 * Раскладка — отдельная беда: клавиша с буквой К в английской раскладке
 * присылает `r`, и ребёнок, который не умеет переключать язык, молотит по
 * клавиатуре без ответа. Поэтому на каждое нажатие мы возвращаем не одну
 * букву, а список кандидатов: что написано на клавише в обеих раскладках.
 * Сцена берёт первого, для кого нашлась плашка.
 *
 * Phaser тут только в типах: иначе `letterCandidates` нельзя было бы проверить
 * тестом — Phaser при импорте лезет в `window`, а в node его нет.
 */
import type Phaser from 'phaser';

/**
 * Что написано на клавише в русской раскладке, если пришла латиница.
 *
 * Ряды ЙЦУКЕН: верхний, средний, нижний. Знаки препинания (`[`, `]`, `;`…)
 * тут нарочно есть — на них сидят Х, Ъ, Ж, Э, Б, Ю, и без них слова с этими
 * буквами набрать было бы нельзя.
 */
const RU_BY_LATIN: Readonly<Record<string, string>> = {
  q: 'Й', w: 'Ц', e: 'У', r: 'К', t: 'Е', y: 'Н', u: 'Г', i: 'Ш', o: 'Щ', p: 'З',
  '[': 'Х', ']': 'Ъ',
  a: 'Ф', s: 'Ы', d: 'В', f: 'А', g: 'П', h: 'Р', j: 'О', k: 'Л', l: 'Д',
  ';': 'Ж', "'": 'Э',
  z: 'Я', x: 'Ч', c: 'С', v: 'М', b: 'И', n: 'Т', m: 'Ь',
  ',': 'Б', '.': 'Ю',
};

/** Нажатия, которые означают «убери последнюю букву». */
const ERASE_KEYS: ReadonlySet<string> = new Set(['Backspace', 'Delete']);

/**
 * Какие буквы может означать нажатие: сама клавиша и её русский двойник.
 *
 * Пустой список — значит клавиша не буквенная (Shift, стрелка, пробел), и
 * сцене делать нечего.
 */
const LATIN_BY_RU: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RU_BY_LATIN)
    .filter(([latin]) => /[a-z]/.test(latin))
    .map(([latin, ru]) => [ru, latin.toUpperCase()]),
);

export function letterCandidates(key: string): string[] {
  if (key.length !== 1) return [];
  const out: string[] = [];
  const upper = key.toUpperCase();
  // Буква как есть: в своей раскладке этого и хватает.
  if (/[A-Za-zА-Яа-яЁё]/.test(key)) out.push(upper);
  // Русская игра под английской раскладкой: клавиша К присылает `r`.
  const ru = RU_BY_LATIN[key.toLowerCase()];
  if (ru !== undefined && !out.includes(ru)) out.push(ru);
  // Английская игра под русской: та же клавиша присылает `к`.
  const latin = LATIN_BY_RU[upper];
  if (latin !== undefined && !out.includes(latin)) out.push(latin);
  return out;
}

/**
 * Плашка, которую берёт клавиша: первая свободная (`slot < 0`) с такой буквой.
 *
 * Кандидаты приходят заглавными (`letterCandidates`), а плашки английской
 * анаграммы строчные, как слова в `data/english.ts`. Сравнение «как есть»
 * не совпадало ни разу, и «Make a word» не отзывалась на клавиатуру вовсе —
 * поэтому регистр тут не различается. Кандидатов перебираем по порядку:
 * первый, для кого плашка нашлась, и есть ответ.
 */
export function pickByKey<T extends { char: string; slot: number }>(
  candidates: readonly string[],
  tiles: readonly T[],
): T | undefined {
  for (const candidate of candidates) {
    const tile = tiles.find(
      (one) => one.slot < 0 && one.char.toUpperCase() === candidate.toUpperCase(),
    );
    if (tile !== undefined) return tile;
  }
  return undefined;
}

export interface LetterInput {
  /** Нажата буква: кандидаты от более вероятного к менее. */
  type: (candidates: string[]) => void;
  /** Backspace: вернуть последнюю поставленную букву. */
  erase: () => void;
}

/**
 * Подписать сцену на клавиатуру; отписка — сама, на SHUTDOWN.
 *
 * Без отписки обработчик пережил бы сцену: клавиатура у Phaser общая, и
 * вторая задачка получала бы нажатия ещё и за первую.
 */
export function addLetterInput(scene: Phaser.Scene, input: LetterInput): void {
  const keyboard = scene.input.keyboard;
  if (keyboard === null) return;
  const onKey = (event: KeyboardEvent): void => {
    if (ERASE_KEYS.has(event.key)) {
      input.erase();
      return;
    }
    const candidates = letterCandidates(event.key);
    if (candidates.length > 0) input.type(candidates);
  };
  keyboard.on('keydown', onKey);
  // Строкой, а не Phaser.Scenes.Events.SHUTDOWN: эта константа — значение, и
  // ради неё пришлось бы тащить сюда весь Phaser, с ним и `window`.
  scene.events.once('shutdown', () => keyboard.off('keydown', onKey));
}
