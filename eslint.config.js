// @ts-check
/**
 * Линтер как правила проекта.
 *
 * Здесь не стиль, а грабли, на которые мы уже наступали: Phaser не ES-модуль
 * сам по себе, его значения без import падают только в браузере; у сцены
 * заняты имена data и events; override на create и init — ошибка TypeScript.
 * Каждое правило ниже стоит разбирательства, которое оно заменяет.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // tools/*.mjs — служебные скрипты вне tsconfig (их гоняют руками, не собирают):
  // типовым правилам их не на чем проверять, и projectService на них падает.
  {
    // Скрипты инструментов и хуков живут вне tsconfig: линтеру с типами их
    // не разобрать, а проверять там нечего — это короткие node-скрипты.
    ignores: [
      'dist/**',
      'art-work/**',
      'art-src/**',
      'node_modules/**',
      'tools/**/*.mjs',
      // Публикация и сторожа (scripts/) — такие же node-скрипты; набор случаев у них свой.
      'scripts/**/*.mjs',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // В игре для ребёнка каждое число должно быть в config.ts или рядом
      // с объяснением, но готовый код этого ещё не весь соблюдает.
      '@typescript-eslint/no-magic-numbers': 'off',
      // Phaser возвращает any из нетипизированных мест — там, где мы это
      // сразу приводим к своему типу, шуметь не надо.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // Пустая функция — законный способ сказать «здесь ничего не делаем».
      '@typescript-eslint/no-empty-function': 'off',
      // Правило падает внутри себя на этой паре версий eslint и плагина
      // (TypeError в unified-signatures.js) — не наш код, выключено до обновления.
      '@typescript-eslint/unified-signatures': 'off',
      // Срабатывает только на Phaser.Geom.Circle.Contains и Rectangle.Contains —
      // это и есть документированный способ задать область нажатия, this им не нужен.
      '@typescript-eslint/unbound-method': 'off',
      // Подчёркивание в начале имени — наш способ сказать «аргумент не нужен».
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Сам конфиг на JS: проверки по типам ему негде взять проект.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
