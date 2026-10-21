/** Точка входа: собираем игру и запускаем. */
import Phaser from 'phaser';
import { PALETTE } from './art/palette';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { CollectionScene } from './scenes/CollectionScene';
import { ForestScene } from './scenes/ForestScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
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
  scene: [BootScene, MenuScene, LevelSelectScene, ForestScene, CollectionScene, VictoryScene],
});

// Правый клик по игре не нужен.
game.canvas.oncontextmenu = (event: Event): void => event.preventDefault();

declare global {
  interface Window {
    /** Только в режиме разработки: доступ к игре из консоли браузера. */
    game?: Phaser.Game;
  }
}

if (import.meta.env.DEV) {
  window.game = game;
}
