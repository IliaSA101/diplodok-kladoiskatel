/** Ключи сцен и данные, которые сцены передают друг другу. */
export const SCENE = {
  BOOT: 'Boot',
  MENU: 'Menu',
  LEVELS: 'Levels',
  FOREST: 'Forest',
  COLLECTION: 'Collection',
  VICTORY: 'Victory',
} as const;

/** Запуск леса: без номера — продолжаем сохранённый. */
export interface ForestSceneData {
  level?: number;
}

/** Экран «Мои сокровища» запускается поверх паузы леса. */
export interface CollectionSceneData {
  /** Номер леса — показывается цифрой в заголовке. */
  level: number;
  /** Все предметы этого леса по порядку сетки; последний — секретный. */
  itemIds: string[];
  /** Какие из них уже найдены. */
  foundItemIds: string[];
}

/** Праздничный экран. */
export interface VictorySceneData {
  level: number;
  itemIds: string[];
  /** Предмет из секретного сундука — показывается крупнее остальных. */
  crownItemId: string;
}
