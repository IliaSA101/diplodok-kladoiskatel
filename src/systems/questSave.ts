/**
 * Прогресс футбольного квеста в localStorage.
 *
 * Модуль намеренно без Phaser: только поэтому сохранение можно проверить
 * тестом — в node движок не поднять. Всё, что рисует и празднует, — в quest.ts.
 * Любая ошибка хранилища гасится молча: игра должна запускаться всегда.
 */
import { QUEST_NODES, isGoldenRound } from '../data/quest';

const PREFIX = 'diplodok-kladoiskatel:v3:';
const KEY_SOLVED = PREFIX + 'quest-solved';
const KEY_STICKERS = PREFIX + 'quest-stickers';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const data: unknown = raw === null ? null : JSON.parse(raw);
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, value: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    /* сохранять некуда — не беда */
  }
}

export const questSave = {
  solvedNodes(): string[] {
    return read(KEY_SOLVED);
  },
  isSolved(nodeId: string): boolean {
    return read(KEY_SOLVED).includes(nodeId);
  },
  stickers(): string[] {
    return read(KEY_STICKERS);
  },
  /**
   * Наклейки, добытые в золотых кругах (с четвёртого).
   *
   * Наклейка там та же, что в первой половине квеста, и без этой пометки
   * второй проход ничего не менял бы в альбоме: ребёнок решает задачку,
   * а награда уже стоит на месте. Золотая оправа — и есть разница.
   */
  goldenStickers(): string[] {
    const solved = new Set(read(KEY_SOLVED));
    const golden = QUEST_NODES.filter(
      (node) => isGoldenRound(node.round) && solved.has(node.id),
    );
    return [...new Set(golden.map((node) => node.sticker))];
  },
  markSolved(nodeId: string, sticker: string): void {
    const solved = new Set(read(KEY_SOLVED));
    solved.add(nodeId);
    write(KEY_SOLVED, [...solved]);
    const stickers = new Set(read(KEY_STICKERS));
    stickers.add(sticker);
    write(KEY_STICKERS, [...stickers]);
  },
  /** Весь квест пройден. */
  isComplete(): boolean {
    const solved = new Set(read(KEY_SOLVED));
    return QUEST_NODES.every((node) => solved.has(node.id));
  },
  /**
   * Пройти круг заново: забываем решённые узлы и их наклейки.
   *
   * Наклейка привязана к узлу, поэтому вместе с узлом уходит и она —
   * иначе альбом показывал бы награду за задачку, которой больше нет.
   *
   * Но одна и та же наклейка висит на двух узлах: круги 4-6 повторяют
   * наклейки кругов 1-3. Поэтому стираем не «наклейки этого круга», а те,
   * которых больше не даёт ни один решённый узел — иначе откат четвёртого
   * круга молча выносил бы из альбома награду за первый.
   */
  resetNodes(nodes: readonly { id: string; sticker: string }[]): void {
    const ids = new Set(nodes.map((node) => node.id));
    const solved = read(KEY_SOLVED).filter((id) => !ids.has(id));
    write(KEY_SOLVED, solved);
    const left = new Set(solved);
    const kept = new Set(
      QUEST_NODES.filter((node) => left.has(node.id)).map((node) => node.sticker),
    );
    write(KEY_STICKERS, read(KEY_STICKERS).filter((key) => kept.has(key)));
  },

  reset(): void {
    write(KEY_SOLVED, []);
    write(KEY_STICKERS, []);
  },
};
