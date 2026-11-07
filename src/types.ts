/** Ключи сцен и данные, которые сцены передают друг другу. */
export const SCENE = {
  BOOT: 'Boot',
  /** Первый экран: выбор версии игры. */
  START: 'Start',
  // Версия «Лес с кладами»
  MENU: 'Menu',
  LEVELS: 'Levels',
  FOREST: 'Forest',
  COLLECTION: 'Collection',
  VICTORY: 'Victory',
  // Версия «Футбольный квест»
  QUEST_MAP: 'QuestMap',
  PUZZLE_SUDOKU: 'PuzzleSudoku',
  PUZZLE_MAHJONG: 'PuzzleMahjong',
  PUZZLE_WORD: 'PuzzleWord',
  PUZZLE_QUIZ: 'PuzzleQuiz',
  PUZZLE_MEMORY: 'PuzzleMemory',
  PUZZLE_COUNT: 'PuzzleCount',
  PUZZLE_PATTERN: 'PuzzlePattern',
  PUZZLE_SEQUENCE: 'PuzzleSequence',
  ALBUM: 'Album',
  // Версия «Английский»
  ENGLISH: 'English',
  ENGLISH_ANAGRAM: 'EnglishAnagram',
  ENGLISH_SEARCH: 'EnglishSearch',
  ENGLISH_CATCH: 'EnglishCatch',
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

/** Экран английской ветки: какой набор слов открыт. */
export interface EnglishSceneData {
  setIndex?: number;
}

/** Запуск английской игры: с каким набором слов играем. */
export interface EnglishGameData {
  setIndex: number;
  /**
   * Чем раскладывать поле и плитки. Без него — случайное число на каждый заход,
   * чтобы поле не повторялось; `?shots` и e2e передают своё, чтобы кадр и
   * сценарий были повторяемы.
   */
  seed?: number;
}
