/** Ключи сцен и данные, которые сцены передают друг другу. */
export const SCENE = {
  BOOT: 'Boot',
  MENU: 'Menu',
  FOREST: 'Forest',
  COLLECTION: 'Collection',
  VICTORY: 'Victory',
} as const;

/** Запуск леса: без seed — продолжаем сохранённый лес или создаём первый. */
export interface ForestSceneData {
  seed?: number;
}

/** Экран «Мои сокровища» запускается поверх паузы леса. */
export interface CollectionSceneData {
  /** Все 8 предметов текущего леса, по порядку сетки. */
  itemIds: string[];
  /** Какие из них уже найдены. */
  foundItemIds: string[];
}

/** Праздничный экран. */
export interface VictorySceneData {
  itemIds: string[];
}
