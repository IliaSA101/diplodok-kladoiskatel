/** Точка входа: собираем игру и запускаем. */
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
