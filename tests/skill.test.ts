/**
 * Сложность: ступень по видам задачек, выбор набора по ступени и счёт на табло.
 *
 * Отдельный файл нужен из-за подготовки: `skillSave` живёт в localStorage,
 * которого в node нет, и его приходится подменять — как в `save.test.ts`.
 *
 * Ошибка здесь не видна на экране, но бьёт больнее всего: ступень, которая
 * растёт по две за раз или не падает совсем, превращает игру в наказание —
 * ребёнок попадает на задачку не по силам и выйти из неё не может.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { QUEST_NODES, tier } from '../src/data/quest';
import { WORD_TIERS, wordSet } from '../src/data/questWords';
import { QUIZ_LEVELS, QUIZ_TIERS, quizTask, quizTierIndex } from '../src/data/questQuiz';
import { MAHJONG_PAIRS, MEMORY_LEVELS, mahjongPairs, mahjongStacked, memoryLevel } from '../src/data/questDeals';
import type { PuzzleKind } from '../src/data/quest';
import { COUNT_MAX_ANSWER, COUNT_TASKS, countTasks } from '../src/systems/countTask';
import { MAX_SKILL, PACE_MS, nextSkill, skillSave } from '../src/systems/skill';
import { MemoryStorage, installMemoryStorage } from './memoryStorage';
import { clearHeldBack } from '../src/systems/saveStore';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installMemoryStorage();
  clearHeldBack();
});

const FAST = 10_000;
const SLOW = 600_000;

describe('ступень сложности', () => {
  it('быстро и без ошибок — ступень вверх', () => {
    expect(nextSkill(0, 'quiz', FAST, 0)).toBe(1);
  });

  it('много ошибок — ступень вниз', () => {
    expect(nextSkill(3, 'quiz', FAST, 5)).toBe(2);
  });

  it('долго, даже без ошибок, — ступень вниз', () => {
    expect(nextSkill(3, 'quiz', SLOW, 0)).toBe(2);
  });

  it('обычный прогон ступень не двигает', () => {
    // Иначе сложность скачет от настроения: большинство задачек ребёнок решает
    // не мгновенно и не с мучением, и это как раз «ступень верная».
    const pace = PACE_MS.quiz;
    expect(nextSkill(2, 'quiz', pace * 1.5, 1)).toBe(2);
  });

  it('за одну задачку ступень меняется не больше чем на одну', () => {
    // Один везучий прогон не должен уносить ребёнка на два уровня вверх.
    for (let skill = 0; skill <= MAX_SKILL; skill += 1) {
      for (const ms of [0, FAST, PACE_MS.word, PACE_MS.word * 3, SLOW]) {
        for (const mistakes of [0, 1, 2, 3, 10]) {
          const next = nextSkill(skill, 'word', ms, mistakes);
          expect(Math.abs(next - skill), `ступень ${skill}, ${ms} мс, ${mistakes} ошибок`)
            .toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('ступень не выходит за границы ни вверх, ни вниз', () => {
    expect(nextSkill(MAX_SKILL, 'quiz', FAST, 0)).toBe(MAX_SKILL);
    expect(nextSkill(0, 'quiz', SLOW, 9)).toBe(0);
    for (const junk of [NaN, Infinity, -5, 99]) {
      const next = nextSkill(junk, 'quiz', FAST, 0);
      expect(next, String(junk)).toBeGreaterThanOrEqual(0);
      expect(next, String(junk)).toBeLessThanOrEqual(MAX_SKILL);
    }
  });

  it('у каждого вида задачек есть свой темп', () => {
    // Без темпа вид молча не растёт и не падает — это тихая поломка.
    for (const node of QUEST_NODES) {
      expect(PACE_MS[node.kind], node.kind).toBeGreaterThan(0);
    }
  });
});

describe('ступень между заходами', () => {
  it('без сохранения начинается с нуля', () => {
    expect(skillSave.of('mahjong')).toBe(0);
  });

  it('набранная ступень возвращается', () => {
    skillSave.note('mahjong', FAST, 0);
    expect(skillSave.of('mahjong')).toBe(1);
  });

  it('ступени разных видов не путаются', () => {
    skillSave.note('mahjong', FAST, 0);
    skillSave.note('mahjong', FAST, 0);
    expect(skillSave.of('mahjong')).toBe(2);
    expect(skillSave.of('quiz')).toBe(0);
  });

  it('мусор в хранилище не ломает игру', () => {
    for (const junk of ['не json', 'null', '[]', '{"quiz":"много"}', '{"quiz":99}']) {
      storage.setItem('diplodok-kladoiskatel:v3:quest-skill', junk);
      const skill = skillSave.of('quiz');
      expect(skill, junk).toBeGreaterThanOrEqual(0);
      expect(skill, junk).toBeLessThanOrEqual(MAX_SKILL);
    }
  });

  it('ступень, записанная строкой, не пропадает бесследно: исходник откладывается', () => {
    // Понятое — ступень mahjong; "2" строкой игра не берёт, но выбросить её молча нельзя.
    const raw = '{"sudoku":"2","mahjong":3}';
    storage.setItem('diplodok-kladoiskatel:v3:quest-skill', raw);
    expect(skillSave.of('mahjong')).toBe(3);
    expect(skillSave.of('sudoku')).toBe(0);
    skillSave.note('word', FAST, 0);
    expect(storage.getItem('diplodok-kladoiskatel:broken:v3:quest-skill')).toBe(raw);
    expect(skillSave.of('mahjong')).toBe(3);
  });

  it('сброс обнуляет все виды', () => {
    skillSave.note('word', FAST, 0);
    skillSave.reset();
    expect(skillSave.of('word')).toBe(0);
  });
});

describe('набор по ступени', () => {
  const table = ['a', 'b', 'c', 'd', 'e'];

  it('на нулевой ступени доступна вся таблица', () => {
    const seen = new Set(table.map((_, variant) => tier(table, 0, variant)));
    expect([...seen].sort()).toEqual(table);
  });

  it('ступень поднимает нижнюю границу', () => {
    for (let variant = 0; variant < 12; variant += 1) {
      expect(['c', 'd', 'e'], `вариант ${variant}`).toContain(tier(table, 2, variant));
    }
  });

  it('ступень выше таблицы даёт самое сложное, а не падает', () => {
    for (const step of [4, 5, 9, 99]) {
      expect(tier(table, step, 7), `ступень ${step}`).toBe('e');
    }
  });

  it('вариант крутит всё, что выше ступени', () => {
    // Без этого ребёнок на третьем круге получал бы один и тот же набор трижды.
    const seen = new Set([0, 1, 2, 3].map((variant) => tier(table, 2, variant)));
    expect(seen.size).toBe(3);
  });

  it('маджонг растёт столом и горкой, Memory — столом', () => {
    expect(mahjongPairs(0)).toBe(MAHJONG_PAIRS[0]);
    expect(mahjongStacked(0)).toBe(false);
    expect(mahjongStacked(MAX_SKILL)).toBe(true);
    expect(mahjongPairs(99)).toBe(MAHJONG_PAIRS[MAHJONG_PAIRS.length - 1]);
    expect(memoryLevel(99).groups * memoryLevel(99).group).toBeGreaterThan(
      memoryLevel(0).groups * memoryLevel(0).group,
    );
  });

  it('со ступенью слова удлиняются, а не остаются теми же', () => {
    // Ступень выбирает строку по длине слов, вариант крутит порядок внутри.
    // Самый короткий набор верхней ступени длиннее самого длинного нижней —
    // иначе «от уровней нет усложнения», как было с викториной.
    const shortest = (step: number): number =>
      Math.min(
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) =>
          Math.min(...wordSet(step, v).map((p) => p.word.length)),
        ),
      );
    let previous = 0;
    for (let row = 0; row < WORD_TIERS.length; row += 1) {
      const here = shortest(row * 3);
      expect(here, `строка ${row}`).toBeGreaterThan(previous);
      previous = here;
    }
  });

  it('узлы со словами не получают один и тот же набор', () => {
    // Со ступени 3 все узлы со второго круга получали «СВИСТОК, БУТЫЛКА,
    // ПЕРЧАТКА»: окно по таблице упиралось в её конец и вариант не слышало.
    for (const step of [0, 4, 8]) {
      const seen = new Set(
        [0, 1, 2, 3, 4, 5, 6].map((v) =>
          wordSet(step, v)
            .map((p) => p.word)
            .join('|'),
        ),
      );
      expect(seen.size, `ступень ${step}`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('счёт на табло', () => {
  const steps = [0, 1, 2, 3, 4, 5, 9];

  it('пример сходится с ответом и в минус не уходит', () => {
    for (const step of steps) {
      for (let variant = 0; variant < 8; variant += 1) {
        for (const task of countTasks(step, variant)) {
          const where = `ступень ${step}: ${task.left} ${task.op} ${task.right}`;
          const sum = task.op === '+' ? task.left + task.right : task.left - task.right;
          expect(task.answer, where).toBe(sum);
          expect(task.answer, where).toBeGreaterThan(0);
          expect(task.answer, where).toBeLessThanOrEqual(COUNT_MAX_ANSWER);
        }
      }
    }
  });

  it('пять примеров без повторов на любой ступени', () => {
    for (const step of steps) {
      for (let variant = 0; variant < 8; variant += 1) {
        const tasks = countTasks(step, variant);
        expect(tasks, `ступень ${step}, вариант ${variant}`).toHaveLength(COUNT_TASKS);
        const keys = tasks.map((t) => `${t.left}${t.op}${t.right}`);
        expect(new Set(keys).size, `ступень ${step}, вариант ${variant}`).toBe(COUNT_TASKS);
      }
    }
  });

  it('внутри задачки примеры идут от простого к сложному', () => {
    for (const step of steps) {
      const answers = countTasks(step, 3).map((task) => task.answer);
      expect(answers, `ступень ${step}`).toEqual([...answers].sort((a, b) => a - b));
    }
  });

  it('один и тот же узел даёт один и тот же набор', () => {
    // Ребёнок возвращается на круг и видит знакомую задачку, а не новую.
    expect(countTasks(2, 1)).toEqual(countTasks(2, 1));
  });

  it('ступени идут понятной лестницей, а не как попало', () => {
    const all = (step: number): ReturnType<typeof countTasks> =>
      [0, 1, 2, 3, 4, 5].flatMap((variant) => countTasks(step, variant));

    // Нулевая и первая — только сложение, в пределах пяти и десяти.
    for (const task of all(0)) expect(task.op).toBe('+');
    expect(Math.max(...all(0).map((t) => t.answer))).toBeLessThanOrEqual(5);
    for (const task of all(1)) expect(task.op).toBe('+');
    expect(Math.max(...all(1).map((t) => t.answer))).toBeLessThanOrEqual(10);

    // Вторая — только вычитание в пределах десяти.
    for (const task of all(2)) {
      expect(task.op).toBe('-');
      expect(task.left).toBeLessThanOrEqual(10);
    }

    // Третья — сложение через десяток: ответ всегда больше десяти.
    for (const task of all(3)) {
      expect(task.op).toBe('+');
      expect(task.answer).toBeGreaterThan(10);
    }

    // Четвёртая и выше — и сложение, и вычитание за десятком.
    expect(new Set(all(4).map((task) => task.op))).toEqual(new Set(['+', '-']));
  });

  it('мячи только у сложения и только там, где влезают', () => {
    // Два ряда мячей по бокам от минуса ребёнок читает как сложение — такую
    // картинку мы уже нарисовали, посмотрели и убрали.
    for (const step of steps) {
      for (let variant = 0; variant < 6; variant += 1) {
        for (const task of countTasks(step, variant)) {
          if (!task.pictures) continue;
          const where = `ступень ${step}: ${task.left} ${task.op} ${task.right}`;
          expect(task.op, where).toBe('+');
          expect(task.left, where).toBeLessThanOrEqual(10);
          expect(task.right, where).toBeLessThanOrEqual(10);
        }
      }
    }
    for (const step of [2, 3, 4, 9]) {
      for (const task of countTasks(step, 2)) expect(task.pictures, `ступень ${step}`).toBe(false);
    }
  });

  it('счёт есть во всех кругах, где он заявлен', () => {
    const kinds: PuzzleKind[] = QUEST_NODES.map((node) => node.kind);
    expect(kinds).toContain('count');
  });
});

/**
 * Ступень должна быть видна на экране, а не только в таблице.
 *
 * Эти проверки приехали из `tests/quest.test.ts`: там они про данные, а тут
 * про то же, про что и весь файл, — что со ступенью правда становится труднее.
 * Ребёнок сказал про обе задачки сам: «от уровней нет усложнения» и «на 3-4
 * уровне одинаково».
 */
describe('ступень видна в задачках', () => {
  /**
   * Ровно то, что увидел ребёнок: «на 3-4 уровне одинаково». Таблица шла
   * 6, 6, 8, 8 — два круга подряд выглядели одним и тем же столом.
   */
  it('каждая ступень больше предыдущей, повторов нет', () => {
    const cards = MEMORY_LEVELS.map((level) => level.groups * level.group);
    for (let i = 1; i < cards.length; i += 1) {
      expect(cards[i] ?? 0, `ступень ${i}`).toBeGreaterThan(cards[i - 1] ?? 0);
    }
  });

  it('тройки заводятся только после всех двоек', () => {
    const firstTriple = MEMORY_LEVELS.findIndex((level) => level.group >= 3);
    expect(firstTriple).toBeGreaterThan(0);
    for (let i = firstTriple; i < MEMORY_LEVELS.length; i += 1) {
      expect(MEMORY_LEVELS[i]?.group, `ступень ${i}`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * Ровно то, что увидел ребёнок: «от уровней нет усложнения». Ступень
   * меняла только набор вопросов, а вопросов и картинок было всегда по три.
   */
  it('ступень удлиняет викторину и расширяет выбор', () => {
    const first = quizTask(0, 0);
    const last = quizTask(99, 0);
    expect(last.questions.length).toBeGreaterThan(first.questions.length);
    expect(last.options).toBeGreaterThan(first.options);
    for (let i = 1; i < QUIZ_LEVELS.length; i += 1) {
      const now = QUIZ_LEVELS[i];
      const before = QUIZ_LEVELS[i - 1];
      if (now === undefined || before === undefined) continue;
      expect(now.questions, `ступень ${i}`).toBeGreaterThanOrEqual(before.questions);
      expect(now.options, `ступень ${i}`).toBeGreaterThanOrEqual(before.options);
    }
  });

  /**
   * Длина и ширина выбора — это ещё не трудность: три вопроса из той же
   * десятки «что пинают ногой» остаются тремя лёгкими вопросами. Поэтому
   * ступень поднимает и саму строку вопросов, а не только их число.
   */
  it('ступень поднимает и сами вопросы, а не только их число', () => {
    expect(quizTierIndex(0)).toBe(0);
    expect(quizTierIndex(99)).toBe(QUIZ_TIERS.length - 1);
    for (let step = 1; step <= 9; step += 1) {
      expect(quizTierIndex(step), `ступень ${step}`).toBeGreaterThanOrEqual(
        quizTierIndex(step - 1),
      );
    }
    // Верхняя ступень берёт вопросы только из верхней строки, нижняя — из нижней.
    const hard = new Set(QUIZ_TIERS[QUIZ_TIERS.length - 1]?.map((q) => q.question) ?? []);
    for (const question of quizTask(99, 0).questions) {
      expect(hard.has(question.question), question.question).toBe(true);
    }
    const easy = new Set(QUIZ_TIERS[0]?.map((q) => q.question) ?? []);
    for (const question of quizTask(0, 0).questions) {
      expect(easy.has(question.question), question.question).toBe(true);
    }
  });

  it('вопросов в задачке столько, сколько просит ступень, и все разные', () => {
    for (let step = 0; step < 9; step += 1) {
      for (let variant = 0; variant < 8; variant += 1) {
        const task = quizTask(step, variant);
        const where = `ступень ${step}, вариант ${variant}`;
        expect(task.questions.length, where).toBe(
          QUIZ_LEVELS[Math.min(QUIZ_LEVELS.length - 1, step)]?.questions,
        );
        expect(new Set(task.questions.map((q) => q.question)).size, where).toBe(
          task.questions.length,
        );
      }
    }
  });
});
