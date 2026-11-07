/**
 * Футбольная викторина: трудность вопросов и отбор их в узел.
 *
 * Отдельным файлом не по прихоти: `tests/quest.test.ts` упёрся в шестьсот
 * строк, и викторина уехала целиком — вместе со своей зоной, а не половиной.
 *
 * Ловит то, чего не видно ни типам, ни глазам: второй правильный ответ среди
 * «неправильных», вопрос с картинкой не из списка и — главное — набор, который
 * не меняется от узла к узлу. Последнее ребёнок заметил сам: «от уровней нет
 * усложнения, вопросы одни и те же».
 */
import { describe, expect, it } from 'vitest';
import { TEX } from '../src/art/keys';
import { QUIZ_LEVELS, QUIZ_TIERS, quizTask } from '../src/data/questQuiz';

/** Картинки, которыми вообще можно отвечать: и поле, и инвентарь. */
const ICONS = new Set<string>([...TEX.FOOT, ...TEX.GEAR]);

describe('викторина', () => {
  it('неправильных хватает на самый широкий выбор', () => {
    const widest = Math.max(...QUIZ_LEVELS.map((level) => level.options));
    for (const row of QUIZ_TIERS) {
      for (const question of row) {
        expect(question.wrong.length + 1, question.question).toBeGreaterThanOrEqual(widest);
      }
    }
  });

  it('варианты ответа — настоящие картинки и все разные', () => {
    for (const row of QUIZ_TIERS) {
      for (const question of row) {
        const all = [question.answer, ...question.wrong];
        expect(new Set(all).size, question.question).toBe(all.length);
        for (const option of all) {
          expect(ICONS.has(option), `${question.question}: ${option}`).toBe(true);
        }
      }
    }
  });

  it('вопрос задан вопросом', () => {
    for (const row of QUIZ_TIERS) {
      for (const question of row) {
        expect(question.question.endsWith('?'), question.question).toBe(true);
      }
    }
  });

  it('в каждой ступени хватает разных ответов на самый длинный набор', () => {
    // Два вопроса с одним ответом в узел не попадают, поэтому длину набора
    // ограничивает не число вопросов в строке, а число разных картинок в ней.
    const longest = Math.max(...QUIZ_LEVELS.map((level) => level.questions));
    QUIZ_TIERS.forEach((row, i) => {
      const answers = new Set(row.map((question) => question.answer));
      expect(answers.size, `ступень вопросов ${i}`).toBeGreaterThanOrEqual(longest);
    });
  });

  it('у соседних узлов вопросы разные', () => {
    // Ровно та поломка, которую ребёнок увидел первым: на верхних ступенях
    // окно упиралось в последний набор, и все узлы получали одни и те же три
    // вопроса. Вариант у каждого узла свой — значит и набор должен быть свой.
    for (const step of [0, 2, 4, 9]) {
      const seen = new Set<string>();
      for (let variant = 0; variant < 8; variant += 1) {
        seen.add(
          quizTask(step, variant)
            .questions.map((question) => question.question)
            .join('|'),
        );
      }
      expect(seen.size, `ступень ${step}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('в одном узле ни один ответ не повторяется', () => {
    for (let step = 0; step <= 9; step += 1) {
      for (let variant = 0; variant < 8; variant += 1) {
        const answers = quizTask(step, variant).questions.map((question) => question.answer);
        expect(new Set(answers).size, `ступень ${step}, вариант ${variant}`).toBe(answers.length);
      }
    }
  });
});
