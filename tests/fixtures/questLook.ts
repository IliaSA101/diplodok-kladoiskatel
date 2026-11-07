/**
 * Что именно получает узел квеста на ступени: слова, вопросы, значки, поле.
 *
 * Общий для снимка разрезания и для проверок повторов: оба смотрят на то,
 * что увидит ребёнок, а не на таблицы.
 */
import { wordSet } from '../../src/data/questWords';
import { quizTask } from '../../src/data/questQuiz';
import { mahjongDeal, mahjongPairs, mahjongStacked, memoryDeal, memoryLevel, sudokuLevel, sudokuSeed } from '../../src/data/questDeals';
import type { QuestNode } from '../../src/data/quest';
import { buildSudoku } from '../../src/systems/sudokuBoard';

export function questLook(node: QuestNode, step: number): unknown {
  const { kind, variant } = node;
  switch (kind) {
    case 'word':
      return wordSet(step, variant);
    case 'quiz':
      return quizTask(step, variant);
    case 'memory':
      return { level: memoryLevel(step), deal: memoryDeal(step, variant) };
    case 'mahjong':
      return {
        pairs: mahjongPairs(step),
        stacked: mahjongStacked(step),
        cells: mahjongDeal(step, variant).cells.map(
          (cell) => `${cell.col},${cell.row},${cell.layer}:${cell.symbol}`,
        ),
      };
    case 'sudoku': {
      const level = sudokuLevel(step);
      const seed = sudokuSeed(variant);
      return { level, seed, start: buildSudoku(level.size, seed, level.clues).start };
    }
    default:
      return null;
  }
}
