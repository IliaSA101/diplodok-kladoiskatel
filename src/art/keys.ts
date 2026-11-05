/**
 * Имена всех текстур, которые генерируются кодом.
 * Единственный источник правды: и генераторы, и сцены берут ключи отсюда.
 *
 * Декор леса зависит от темы: базовый ключ отсюда превращается в настоящий
 * через themeTexture(base, set) из art/themes.ts — например 'tree-a@autumn'.
 */
export const TEX = {
  // Декор леса (несколько вариантов каждого вида), базовые ключи
  TREE: ['tree-a', 'tree-b', 'tree-c'] as const,
  BUSH: ['bush-a', 'bush-b'] as const,
  ROCK: ['rock-a', 'rock-b'] as const,
  STUMP: ['stump-a'] as const,
  FLOWER: ['flower-a', 'flower-b', 'flower-c'] as const,
  GRASS: ['grass-a', 'grass-b'] as const,

  // Земля
  GROUND: 'ground-tile',

  // Клады
  CHEST_CLOSED: 'chest-closed',
  CHEST_OPEN: 'chest-open',
  DIG_SPOT: 'dig-spot',
  DIRT_CHUNK: 'dirt-chunk',
  SPARKLE: 'sparkle',
  STAR: 'star',
  GLOW: 'glow',
  SPLASH: 'splash-drop',
  CONFETTI: ['confetti-a', 'confetti-b', 'confetti-c'] as const,

  // Живность и погода
  BUTTERFLY: ['butterfly-a', 'butterfly-b', 'butterfly-c'] as const,
  FIREFLY: 'firefly',
  SQUIRREL: 'squirrel',
  SQUIRREL_ARROW: 'squirrel-arrow',
  FALLING_LEAF: ['leaf-fall-a', 'leaf-fall-b'] as const,

  // Интерфейс
  BTN_WARM: 'btn-warm',
  BTN_CALM: 'btn-calm',
  PANEL: 'ui-panel',
  ICON_SHOVEL: 'icon-shovel',
  ICON_LEAF: 'icon-leaf',
  ICON_PUSH: 'icon-push',
  ICON_WATER: 'icon-water',
  ICON_CROWN: 'icon-crown',
  ICON_BACKPACK: 'icon-backpack',
  ICON_SOUND_ON: 'icon-sound-on',
  ICON_SOUND_OFF: 'icon-sound-off',
  ICON_PLAY: 'icon-play',
  ICON_AGAIN: 'icon-again',
  ICON_NEXT: 'icon-next',
  ICON_BACK: 'icon-back',
  ICON_MAP: 'icon-map',
  ICON_ERASE: 'icon-erase',
  SLOT: 'ui-slot',
  TAP_MARK: 'tap-mark',

  /**
   * Английская ветка: картинка-подсказка к слову.
   *
   * Ключ назван самим словом, а не номером: подсказки ставятся в
   * `data/english.ts` по имени, и перепутать `look` с `put` нельзя.
   * Цветам картинки не нужны — у них пятно цвета, оно честнее любого рисунка.
   */
  EN_CLUE: {
    love: 'en-love',
    her: 'en-her',
    are: 'en-are',
    put: 'en-put',
    look: 'en-look',
    cat: 'en-cat',
    dog: 'en-dog',
    cow: 'en-cow',
    pig: 'en-pig',
    hen: 'en-hen',
  } as const,

  // Футбольный квест: значки для судоку и маджонга
  FOOT: [
    'foot-ball',
    'foot-boot',
    'foot-whistle',
    'foot-trophy',
    'foot-glove',
    'foot-flag',
    'foot-net',
    'foot-cone',
    'foot-medal',
    'foot-stopwatch',
    'foot-scarf',
    'foot-bottle',
  ] as const,

  /**
   * Футбольная экипировка: второй лист готового арта.
   *
   * Отдельным списком, а не продолжением FOOT: по индексам в FOOT лазают
   * судоку (первые шесть), «что дальше в ряду» (первые восемь) и «повтори
   * порядок», и у каждого ключа там есть пара в FOOT_DRAW — игра умеет
   * нарисовать его кодом, если арт не загрузился. У этих тринадцати пары нет,
   * им место в своём списке.
   */
  GEAR: [
    'gear-card',
    'gear-red-card',
    'gear-shirt',
    'gear-shorts',
    'gear-socks',
    'gear-shin',
    'gear-pump',
    'gear-armband',
    'gear-bench',
    'gear-horn',
    'gear-aid',
    'gear-backpack',
    'gear-balls',
  ] as const,

  // Наклейки-награды за задачки
  STICKER: [
    // Двадцать четыре наклейки на сорок восемь узлов: круги 4-6 выдают те же,
    // но помечены в альбоме золотой оправой. Альбом — три ряда по восемь,
    // и он должен быть виден целиком.
    // Круг первый
    'sticker-header',
    'sticker-ball',
    'sticker-whistle',
    'sticker-boot',
    'sticker-flag',
    'sticker-cone',
    'sticker-footprint',
    'sticker-goal',
    // Круг второй
    'sticker-keeper',
    'sticker-glove',
    'sticker-stopwatch',
    'sticker-scarf',
    'sticker-bottle',
    'sticker-trophy',
    'sticker-medal',
    'sticker-runner',
    // Круг третий
    'sticker-cup',
    'sticker-star',
    'sticker-captain',
    'sticker-lap',
    'sticker-flag-boot',
    'sticker-trophy-medal',
    'sticker-whistle-cone',
    'sticker-three-stars',
  ] as const,

  /** Диплодок целиком, рисованный: карта квеста. */
  DINO_WHOLE: 'dino-whole',
  /** Один хвост, вырезанный по форме: выходит из-под угла панели задачки. */
  DINO_TAIL: 'dino-tail',

  // Фоны квеста
  QUEST_MAP_BG: 'quest-map-bg',
  PITCH_TILE: 'pitch-tile',
  NODE_DISC: 'node-disc',
  CARD_BACK: 'card-back',
  /** Рубашка карточки Memory: лежит лицом вниз. */
  CARD_DOWN: 'card-down',
  LETTER_TILE: 'letter-tile',
} as const;

/**
 * Значки для карточных задачек: маджонг и «запомни пары».
 *
 * Двенадцати значков на девять узлов маджонга и восемь узлов памяти мало:
 * расклад у каждого узла свой, а набор картинок один и тот же, и со стороны
 * это читается как «опять то же самое». Экипировка удваивает запас.
 *
 * Судоку, узоры и «повтори порядок» берут строго из начала TEX.FOOT — им
 * нужны значки, которые игра умеет нарисовать и кодом.
 */
export const CARD_ICONS: readonly string[] = [...TEX.FOOT, ...TEX.GEAR];

/** Части диплодока: сам риг собирается из них. */
export const DINO_TEX = {
  BODY: 'dino-body',
  LEG_NEAR: 'dino-leg-near',
  LEG_FAR: 'dino-leg-far',
  TAIL: 'dino-tail',
  HEAD: 'dino-head',
  EYE: 'dino-eye',
  EYE_HAPPY: 'dino-eye-happy',
  LEAF: 'dino-leaf',
  HINT_STAR: 'dino-hint-star',
} as const satisfies { readonly [k: string]: string };

/**
 * Текстура предмета-находки по его id.
 * Серый силуэт ненайденного предмета — это та же текстура, затонированная
 * в чёрный с низкой прозрачностью, отдельной текстуры для него нет.
 */
export function itemTexture(itemId: string): string {
  return 'item-' + itemId;
}
