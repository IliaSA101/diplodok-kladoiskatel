/**
 * Два узла одного вида не дают ребёнку одну и ту же задачку.
 *
 * Отдельный файл потому, что подготовка тут своя: проверка дёргает генератор
 * **каждого** вида задачки разом — поле судоку, стол маджонга, расклад памяти,
 * слова, вопросы, примеры, узоры и цепочки. Ни один другой файл столько не
 * поднимает, и в `quest.test.ts` этот набор импортов был лишним весом.
 *
 * Повторы были настоящие: наборов слов четыре на семь узлов, seed'ов судоку
 * пять на восемь. А маджонг и «Запомни пары» честно меняли расклад, но брали
 * значки всегда с начала списка — и со стороны это читалось как «то же самое».
 */
import { describe, expect, it } from 'vitest';
import {
  QUEST_NODES,
  mahjongDeal,
  memoryDeal,
  quizTask,
  sudokuLevel,
  sudokuSeed,
  wordSet,
} from '../src/data/quest';
import type { PuzzleKind } from '../src/data/quest';
import { countTasks } from '../src/systems/countTask';
import { patternTasks } from '../src/systems/patternTask';
import { sequenceTask } from '../src/systems/sequenceTask';
import { MAX_SKILL } from '../src/systems/skill';
import { buildSudoku } from '../src/systems/sudokuBoard';

describe('квест: два узла не дают одну и ту же задачку', () => {
  /**
   * Чем задачка узла отличается от задачки другого узла.
   *
   * Берём ровно то, что ребёнок увидит на экране: поле, расклад, слова,
   * вопросы. Ступень и вариант сюда приходят оттуда же, откуда их берёт
   * карта квеста, а не из таблицы — иначе проверка согласится с кодом
   * и ничего не проверит.
   */
  function look(kind: PuzzleKind, step: number, variant: number): string {
    switch (kind) {
      case 'sudoku': {
        const level = sudokuLevel(step);
        return buildSudoku(level.size, sudokuSeed(variant), level.clues).start.join(',');
      }
      case 'mahjong':
        return mahjongDeal(step, variant)
          .cells.map((cell) => `${cell.col},${cell.row},${cell.layer}:${cell.symbol}`)
          .join('|');
      case 'memory': {
        const deal = memoryDeal(step, variant);
        return `${deal.icons.join(',')}|${deal.layout.join(',')}`;
      }
      case 'word':
        return wordSet(step, variant)
          .map((one) => one.word)
          .join(',');
      case 'quiz':
        return quizTask(step, variant)
          .questions.map((one) => one.question)
          .join('|');
      case 'count':
        return countTasks(step, variant)
          .map((one) => `${one.left}${one.op}${one.right}`)
          .join(',');
      case 'pattern':
        return JSON.stringify(patternTasks(step, variant));
      case 'sequence':
        return JSON.stringify(sequenceTask(step, variant));
    }
  }

  // Набор значков проверяется отдельно от расклада: мутант, убравший выбор
  // значков, выжил именно потому, что расклад всё равно оставался разным —
  // а ребёнок видел на всех узлах одни и те же картинки. Это и есть то,
  // на что он жаловался, и «разный расклад» этого не ловит.
  it('«Запомни пары» берёт на каждый узел свои картинки', () => {
    for (let skill = 0; skill <= MAX_SKILL; skill += 1) {
      const seen = new Map<string, string>();
      for (const node of QUEST_NODES.filter((one) => one.kind === 'memory')) {
        const icons = memoryDeal(node.round - 1 + skill, node.variant).icons.join(',');
        const twin = seen.get(icons);
        expect(twin, `навык +${skill}: ${node.id} повторяет набор ${String(twin)}`).toBe(
          undefined,
        );
        seen.set(icons, node.id);
      }
    }
  });

  // Ступень узла — это круг плюс то, что ребёнок набрал сам, поэтому один и
  // тот же узел приходит с разной ступенью. Проверяем каждую прибавку: именно
  // на верхних ступенях окно по таблице упиралось в её конец, и все узлы
  // получали одну строку.
  for (let skill = 0; skill <= MAX_SKILL; skill += 1) {
    it(`при навыке +${skill} каждый узел свой`, () => {
      const kinds = [...new Set(QUEST_NODES.map((node) => node.kind))];
      for (const kind of kinds) {
        const seen = new Map<string, string>();
        for (const node of QUEST_NODES.filter((one) => one.kind === kind)) {
          const key = look(kind, node.round - 1 + skill, node.variant);
          const twin = seen.get(key);
          expect(twin, `${kind}: ${node.id} повторяет ${String(twin)}`).toBe(undefined);
          seen.set(key, node.id);
        }
      }
    });
  }
});
