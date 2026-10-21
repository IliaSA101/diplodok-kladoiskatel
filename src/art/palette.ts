/**
 * Палитра игры: яркая, мультяшная, без кислотных сочетаний.
 * Цвета числами (0x...), как любит Phaser.
 */
export const PALETTE = {
  // Земля и трава
  grassLight: 0x7cc96a,
  grassMid: 0x5fb556,
  grassDark: 0x47a04a,
  grassShadow: 0x3b8c42,
  soil: 0x9b6b43,
  soilDark: 0x7a5234,
  soilLight: 0xb98457,

  // Деревья
  trunk: 0x8d5a3b,
  trunkDark: 0x6f452c,
  trunkLight: 0xa8714c,
  leafLight: 0x6fd36a,
  leafMid: 0x4cb75c,
  leafDark: 0x359a4c,

  // Камни, пеньки
  stone: 0xa8b0b8,
  stoneDark: 0x82898f,
  stoneLight: 0xc6cdd3,
  stumpTop: 0xc49a6c,

  // Цветы
  flowerPink: 0xff8fc0,
  flowerYellow: 0xffd84d,
  flowerBlue: 0x8fc6ff,
  flowerWhite: 0xfff6e8,
  flowerCenter: 0xffd84d,

  // Вода
  water: 0x5fc8e8,
  waterDark: 0x3fa8ce,
  waterLight: 0xa8e8f6,

  // Диплодок
  dinoBody: 0x7fb7e8,
  dinoBodyDark: 0x5f98cc,
  dinoBelly: 0xcfe9ff,
  dinoSpot: 0xa9d4f5,
  dinoEye: 0x2b2b3d,
  dinoEyeWhite: 0xffffff,
  dinoSmile: 0x3a5a7a,
  dinoLeaf: 0x6fd36a,

  // Сундук и находки
  chestWood: 0xb9793f,
  chestWoodDark: 0x8e5a2c,
  chestMetal: 0xffd84d,
  chestMetalDark: 0xd9a92c,
  gold: 0xffd84d,
  goldDark: 0xe0ab20,
  crystal: 0x9fe8ff,
  crystalDark: 0x5fb6e0,
  pearl: 0xfff3f8,
  shell: 0xffc6a8,
  egg: 0xfff2d8,
  eggSpot: 0x9fd7a8,
  fossil: 0xd9c9a8,
  fossilDark: 0xa89673,
  bone: 0xf2ead8,

  // Интерфейс
  uiPanel: 0xfff6e8,
  uiPanelShadow: 0xe2cfb4,
  uiButton: 0xffb13d,
  uiButtonDark: 0xdb8d22,
  uiButtonCalm: 0xbfc8cc,
  uiButtonCalmDark: 0x98a1a5,
  uiAccent: 0x5fc8e8,
  uiText: 0x4a3524,
  uiTextLight: 0xfff6e8,
  uiGood: 0x6fd36a,
  hintStar: 0xffd84d,
  hintStarCold: 0xbfc8cc,

  // Фон/небо на экранах
  sky: 0x9fe0ff,
  skyDeep: 0x6fc4ef,

  // Конфетти
  confetti: [0xff8fc0, 0xffd84d, 0x8fc6ff, 0x6fd36a, 0xffb13d, 0xd09fff] as const,
} as const;

/** Перевод цвета в строку вида #rrggbb — нужно для текстовых стилей Phaser. */
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
