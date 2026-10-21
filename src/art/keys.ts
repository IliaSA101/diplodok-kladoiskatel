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
  SLOT: 'ui-slot',
  TAP_MARK: 'tap-mark',
} as const;

/**
 * Текстура предмета-находки по его id.
 * Серый силуэт ненайденного предмета — это та же текстура, затонированная
 * в чёрный с низкой прозрачностью, отдельной текстуры для него нет.
 */
export function itemTexture(itemId: string): string {
  return 'item-' + itemId;
}
