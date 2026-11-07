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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUEST_NODES } from '../src/data/quest';
import { WORD_TIERS, wordSet, wordTierIndex } from '../src/data/questWords';
import { quizTask } from '../src/data/questQuiz';
import { mahjongDeal, memoryDeal, sudokuLevel, sudokuSeed } from '../src/data/questDeals';
import { CARD_ICONS } from '../src/art/keys';
import type { PuzzleKind, QuestNode } from '../src/data/quest';
import { dealFromDeck } from '../src/data/questDeck';
import { countTasks } from '../src/systems/countTask';
import { patternTasks } from '../src/systems/patternTask';
import { sequenceTask } from '../src/systems/sequenceTask';
import { MAX_SKILL } from '../src/systems/skill';
import { buildSudoku } from '../src/systems/sudokuBoard';
import { questLook } from './fixtures/questLook';

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

describe('квест: разрезание данных ничего не меняет', () => {
  // Снимок снят до разрезания `quest.ts` и обновляется только осознанно — когда
  // раздача меняется нарочно (И1): тогда расхождение идёт в отчёт, а не молча.
  it('каждый узел на каждой ступени навыка получает то же, что в снимке', () => {
    const snap = JSON.parse(
      readFileSync(join(__dirname, 'fixtures/quest-snapshot.json'), 'utf8'),
    ) as Record<string, unknown>;
    let count = 0;
    for (const node of QUEST_NODES) {
      for (let skill = 0; skill <= MAX_SKILL; skill += 1) {
        const look = questLook(node, node.round - 1 + skill);
        if (look === null) continue;
        count += 1;
        expect(JSON.parse(JSON.stringify(look)), `${node.id}+${skill}`).toEqual(
          snap[`${node.id}+${skill}`],
        );
      }
    }
    expect(count).toBe(Object.keys(snap).length);
  });
});

describe('квест: слова и вопросы у соседних узлов не повторяются', () => {
  /**
   * Пары узлов одного вида в том же или соседнем круге (004-2): это одна
   * посиделка, и повтор между ними ребёнок видит. Навык у каждого вида свой и
   * меняется по ходу, поэтому проверяем все пары навыков 0…MAX_SKILL разом.
   */
  function neighbours(kind: PuzzleKind): [QuestNode, QuestNode][] {
    const nodes = QUEST_NODES.filter((node) => node.kind === kind);
    const pairs: [QuestNode, QuestNode][] = [];
    nodes.forEach((a, i) => {
      for (const b of nodes.slice(i + 1)) {
        if (Math.abs(a.round - b.round) <= 1) pairs.push([a, b]);
      }
    });
    return pairs;
  }

  /** Что у пары общего на каждой паре навыков: `узел+навык ~ узел+навык: общее`. */
  function shared(kind: PuzzleKind, texts: (node: QuestNode, step: number) => string[]): string[] {
    const found: string[] = [];
    for (const [a, b] of neighbours(kind)) {
      for (let sa = 0; sa <= MAX_SKILL; sa += 1) {
        for (let sb = 0; sb <= MAX_SKILL; sb += 1) {
          const left = new Set(texts(a, a.round - 1 + sa));
          const common = texts(b, b.round - 1 + sb).filter((text) => left.has(text));
          if (common.length > 0) found.push(`${a.id}+${sa} ~ ${b.id}+${sb}: ${common.join(', ')}`);
        }
      }
    }
    return found;
  }

  // Слов в строке нужно столько, чтобы три узла подряд (два круга, три узла
  // «Собери слово») взяли по три разных: 6 / 9 / 9. Пока трёх картинок из
  // 004-1 нет, в ряду 0 четыре слова, а в ряду 2 — восемь, и там повтор
  // допускается: ровно в этих рядах и только пока слов меньше нужного.
  const WORDS_NEEDED = [6, 9, 9];

  it('«Собери слово»: соседние узлы не делят слов, пока в строке их хватает', () => {
    const rowOf = (word: string): number =>
      WORD_TIERS.findIndex((row) => row.some((one) => one.word === word));
    const unexcused = shared('word', (node, step) =>
      wordSet(step, node.variant).map((one) => one.word),
    ).filter((line) =>
      line
        .split(': ')[1]
        ?.split(', ')
        .some((word) => (WORD_TIERS[rowOf(word)]?.length ?? 0) >= (WORDS_NEEDED[rowOf(word)] ?? 0)),
    );
    expect(unexcused).toEqual([]);
  });

  it('«Собери слово»: повтор допускается только в ряду, где слов меньше нужного', () => {
    // Сторож самого допуска: он не должен разрастаться молча.
    const lacking = WORD_TIERS.map((row, i) => Math.max(0, (WORDS_NEEDED[i] ?? 0) - row.length));
    expect(lacking.reduce((sum, one) => sum + one, 0), 'недостающих слов').toBeLessThanOrEqual(3);
  });

  it('викторина: соседние узлы не делят ни одного вопроса', () => {
    expect(
      shared('quiz', (node, step) => quizTask(step, node.variant).questions.map((one) => one.question)),
    ).toEqual([]);
  });

  it('ряд коротких слов только на ступенях 0–1, пятибуквенные — с третьего круга', () => {
    expect(wordTierIndex(1)).toBe(0);
    expect(wordTierIndex(2)).toBe(1);
    for (let variant = 0; variant < 7; variant += 1) {
      const shortest = Math.min(...wordSet(2, variant).map((one) => one.word.length));
      expect(shortest, `вариант ${variant}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('колода не кладёт в один срез два элемента с одним ключом', () => {
    // В таблицах ответы не повторяются, но правило «один ответ — один вопрос
    // в узле» держит именно раздача, а не данные: проверяем на строке с повтором.
    // Три из четырёх с одним ключом: пара подряд с одним ключом неизбежна.
    const row = ['a1', 'a2', 'a3', 'b1'];
    for (let variant = 0; variant < 4; variant += 1) {
      const slice = dealFromDeck(row, 77, variant, { count: 2, stride: 2, key: (x) => x[0] ?? '' });
      expect(new Set(slice.map((x) => x[0])).size, `вариант ${variant}`).toBe(2);
    }
  });

  it('«Запомни пары»: в круге общих не больше, чем вынуждает запас, в соседних — не больше половины', () => {
    // Половина — меньшего стола, у нечётного вверх (004-7): с округлением вниз
    // правило не выполняет ни одна раздача, доказательство — в decisions.md.
    const icons = (node: QuestNode, skill: number): number[] =>
      memoryDeal(node.round - 1 + skill, node.variant).icons.slice();
    const broken: string[] = [];
    for (const [a, b] of neighbours('memory')) {
      for (let sa = 0; sa <= MAX_SKILL; sa += 1) {
        for (let sb = 0; sb <= MAX_SKILL; sb += 1) {
          const left = icons(a, sa);
          const right = icons(b, sb);
          const common = right.filter((icon) => left.includes(icon)).length;
          const limit =
            a.round === b.round
              ? Math.max(0, left.length + right.length - CARD_ICONS.length)
              : Math.ceil(Math.min(left.length, right.length) / 2);
          if (common > limit) broken.push(`${a.id}+${sa} ~ ${b.id}+${sb}: ${common} > ${limit}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
