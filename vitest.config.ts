/**
 * Тесты — только на чистой логике: данные уровней и квеста, генерация леса,
 * манифест арта. Сцены Phaser здесь не поднимаются: им нужен браузер,
 * и проверять их дешевле глазами в живой игре.
 *
 * Окружение — обычный node, без браузера: проверяемые модули не тянут Phaser.
 * Ради этого метаданные деревьев уехали в art/trees.ts, а состав находок —
 * в data/treasureIds.ts, отдельно от кода, который их рисует.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'dot',
  },
});
