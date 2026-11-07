/** Точка входа: собираем игру и запускаем. */
// Ловушка сбоев — первым импортом, и в её графе нет ни данных, ни хранилища, ни журнала:
// иначе ошибка на верхнем уровне такого модуля случилась бы раньше, чем встал слушатель.
import { attachGame, attachStore } from './crashTrap';
import Phaser from 'phaser';
import { PALETTE } from './art/palette';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { showNoWebglNotice } from './noWebgl';
import { AlbumScene } from './scenes/AlbumScene';
import { BootScene } from './scenes/BootScene';
import { CollectionScene } from './scenes/CollectionScene';
import { EnglishAnagramScene } from './scenes/EnglishAnagramScene';
import { EnglishCatchScene } from './scenes/EnglishCatchScene';
import { EnglishScene } from './scenes/EnglishScene';
import { EnglishSearchScene } from './scenes/EnglishSearchScene';
import { ForestScene } from './scenes/ForestScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { PuzzleCountScene } from './scenes/PuzzleCountScene';
import { PuzzleMahjongScene } from './scenes/PuzzleMahjongScene';
import { PuzzleMemoryScene } from './scenes/PuzzleMemoryScene';
import { PuzzlePatternScene } from './scenes/PuzzlePatternScene';
import { PuzzleQuizScene } from './scenes/PuzzleQuizScene';
import { PuzzleSequenceScene } from './scenes/PuzzleSequenceScene';
import { PuzzleSudokuScene } from './scenes/PuzzleSudokuScene';
import { PuzzleWordScene } from './scenes/PuzzleWordScene';
import { QuestMapScene } from './scenes/QuestMapScene';
import { StartScene } from './scenes/StartScene';
import { VictoryScene } from './scenes/VictoryScene';
import { journal } from './systems/journal';
import { trackScenes } from './systems/journalScenes';
import { SAVE_FORMAT } from './systems/saveKeys';
import {
  heldBack,
  isStoreArea,
  lastWriteOk,
  mayWrite,
  openStore,
  putKey,
  shouldReloadOn,
  snapshotAll,
  storeMode,
} from './systems/saveStore';
import { APP_VERSION } from './art/startLayout';

// Хранилище открывается до первой сцены: номер формата, миграции, битое — в копию.
// Не бросает; без доступа к localStorage игра идёт без сохранения.
if (openStore() !== 'unavailable') {
  // Другая вкладка сменила формат, сделала замену или стирание: эта вкладка
  // держит устаревшее представление, и честнее начать с чистого экрана (001-36).
  // Слушаем только `localStorage`: у `sessionStorage` те же имена ничего не значат.
  window.addEventListener('storage', (event) => {
    if (isStoreArea(event.storageArea) && shouldReloadOn(event.key)) location.reload();
  });
}

// Первая запись сессии — после `openStore()`, чтобы в ней был настоящий режим (001-80).
journal.boot(APP_VERSION, SAVE_FORMAT, new Date());

// Ловушка уже стоит с первой строки и до этого места обходилась `localStorage` напрямую:
// хранилище и журнал она получает только сейчас, потому что их модули могли сами не загрузиться.
attachStore({
  mayWrite,
  putKey,
  snapshotAll,
  storeMode,
  heldBack,
  lastWriteOk,
  journal: {
    note: (kind, detail) => journal.note(kind, detail),
    entries: () => journal.entries(),
    saved: () => journal.saved(),
  },
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.grassMid,
  // Экран всегда 1280x720 и целиком вписывается в окно — и на ноутбуке, и на планшете.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  // На планшете ребёнок легко кладёт на экран несколько пальцев.
  input: { activePointers: 3 },
  banner: false,
  scene: [
    BootScene,
    StartScene,
    // Версия «Лес с кладами»
    MenuScene,
    LevelSelectScene,
    ForestScene,
    CollectionScene,
    VictoryScene,
    // Версия «Футбольный квест»
    QuestMapScene,
    PuzzleSudokuScene,
    PuzzleMahjongScene,
    PuzzleWordScene,
    PuzzleQuizScene,
    PuzzleMemoryScene,
    PuzzleCountScene,
    PuzzlePatternScene,
    PuzzleSequenceScene,
    AlbumScene,
    // Версия «Английский»
    EnglishScene,
    EnglishAnagramScene,
    EnglishSearchScene,
    EnglishCatchScene,
  ],
});

// Ловушке нужна игра, чтобы остановить её на сбое; журналу — чтобы писать старты сцен.
attachGame(game);
trackScenes(game, (detail) => journal.note('scene', detail));

// Правый клик по игре не нужен.
game.canvas.oncontextmenu = (event: Event): void => event.preventDefault();

// Без WebGL Phaser.AUTO молча берёт Canvas, и игра рисуется сломанной: нет
// панелей, сетки диплодока и тинта. Ребёнку такое не показываем — взрослому
// объясняем, что поправить (noWebgl.ts). Рендерер к этой строке уже создан:
// модульный скрипт идёт после разбора страницы, и Phaser грузится сразу.
const hasWebgl = game.renderer.type === Phaser.WEBGL;
if (!hasWebgl) {
  game.destroy(true);
  showNoWebglNotice(document.getElementById('game'));
}

declare global {
  interface Window {
    /** Только в режиме разработки: доступ к игре из консоли браузера. */
    game?: Phaser.Game;
  }
}

if (import.meta.env.DEV) {
  window.game = game;
  // ?shots — обход всех экранов со съёмкой в art-work/shots/. Импорт внутри
  // условия: в собранную игру этот модуль не попадает.
  // Без WebGL снимать нечего: кадры Canvas врут (см. выше).
  if (hasWebgl && new URLSearchParams(location.search).has('shots')) {
    void import('./dev/shots').then(({ takeShots }) => takeShots(game));
  }
}
