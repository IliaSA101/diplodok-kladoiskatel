/**
 * Прогресс футбольного квеста и общий финал любой задачки.
 *
 * Все сцены-задачки устроены одинаково: получают PuzzleSceneData,
 * а когда ребёнок справился — зовут finishPuzzle и больше ни о чём не думают.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PUZZLE_PANEL } from '../art/layout';
import { PALETTE } from '../art/palette';
import { createBackButton, createPanel, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { DinoWatcher } from '../entities/DinoWatcher';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { questSave } from './questSave';
import { journal } from './journal';
import { skillSave } from './skill';
import type { PuzzleKind } from '../data/quest';
import { SCENE } from '../types';

/** Что сцена-задачка получает при запуске. */
export interface PuzzleSceneData {
  nodeId: string;
  variant: number;
  /** Ключ текстуры наклейки-награды. */
  sticker: string;
  /** Вид задачки: по нему растёт и падает ступень сложности. */
  kind: PuzzleKind;
  /** Ступень: круг плюс то, что ребёнок набрал сам. Чем выше, тем крупнее. */
  step: number;
}

/**
 * Сколько задачка заняла и сколько в ней было ошибок.
 *
 * Считается снаружи сцен: `addPuzzleBackdrop` запускает часы (его зовёт каждая
 * задачка первой строкой), сцена отмечает промахи там, где и так дрожит
 * плитка, а `finishPuzzle` сводит это в ступень. Сцены про ступень не знают
 * и знать не должны — их дело рисовать.
 */
const startedAt = new WeakMap<Phaser.Scene, number>();
const mistakes = new WeakMap<Phaser.Scene, number>();
/** Диплодок, который смотрит на задачку: его ставит addPuzzleBackdrop. */
const watchers = new WeakMap<Phaser.Scene, DinoWatcher>();

/** Ребёнок промахнулся: не та карточка, не та буква, не тот ответ. */
export function notePuzzleMistake(scene: Phaser.Scene): void {
  mistakes.set(scene, (mistakes.get(scene) ?? 0) + 1);
  // Диплодок наклоняет голову: это сочувствие, а не укор — проиграть нельзя.
  watchers.get(scene)?.tilt();
}

/**
 * Задачка решена: фанфары, наклейка крупно на две секунды, возврат на карту.
 * Вызывать ровно один раз; сцена после этого ничего делать не должна.
 */
export function finishPuzzle(scene: Phaser.Scene, data: PuzzleSceneData): void {
  // Запись в журнал раньше запоминания: сбой в самой записи тоже должен оставить след.
  journal.note('solved', { node: data.nodeId, kind: data.kind, step: data.step });
  questSave.markSolved(data.nodeId, data.sticker);
  skillSave.note(
    data.kind,
    scene.time.now - (startedAt.get(scene) ?? scene.time.now),
    mistakes.get(scene) ?? 0,
  );
  audio.play('fanfare');
  // Вуаль награды полупрозрачная, так что радость диплодока за ней видна.
  watchers.get(scene)?.cheer();

  const depth = 300000;
  const veil = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x14321f, 0.55)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth);

  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2 - 20;

  const glow = scene.add
    .image(centerX, centerY, TEX.GLOW)
    .setScrollFactor(0)
    .setDepth(depth + 1)
    .setTint(PALETTE.gold)
    .setAlpha(0)
    .setScale(1);
  const sticker = scene.add
    .image(centerX, centerY, data.sticker)
    .setScrollFactor(0)
    .setDepth(depth + 2)
    .setScale(0.2)
    .setAlpha(0);
  const label = createText(scene, centerX, centerY + 190, 'Наклейка!', 56);
  label.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(depth + 2).setAlpha(0);

  scene.tweens.add({ targets: glow, alpha: 0.65, scale: 3, duration: 500, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: sticker, scale: 1.1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: label, alpha: 1, duration: 360, delay: 200 });

  const sparks = scene.add.particles(centerX, centerY, TEX.SPARKLE, {
    speed: { min: 80, max: 240 },
    angle: { min: 0, max: 360 },
    lifespan: 1100,
    scale: { start: 1, end: 0 },
    quantity: 22,
    emitting: false,
  });
  sparks.setScrollFactor(0).setDepth(depth + 3);
  sparks.explode(22);

  scene.time.delayedCall(2200, () => {
    audio.play('found');
    sparks.destroy();
    veil.destroy();
    glow.destroy();
    sticker.destroy();
    label.destroy();
    scene.scene.start(SCENE.QUEST_MAP);
  });
}

/**
 * Кнопка «назад на карту» в левом нижнем углу — одинаковая во всех задачках.
 * Выйти можно всегда: ребёнок не должен застревать в задачке, которая не идёт.
 */
export function addBackToMap(scene: Phaser.Scene): void {
  const button = createBackButton(scene, () => scene.scene.start(SCENE.QUEST_MAP), { radius: 52 });
  button.container.setScrollFactor(0).setDepth(250000);

  onEscape(scene, () => scene.scene.start(SCENE.QUEST_MAP));
}

/**
 * Esc с защитой от «сквозного» нажатия.
 *
 * Одно физическое нажатие Esc успевает дойти и до закрывающейся сцены,
 * и до только что открытой: без этой защиты из задачки проваливаешься
 * мимо карты сразу на стартовый экран.
 */
export function onEscape(scene: Phaser.Scene, handler: () => void): void {
  const readyAt = scene.time.now + 350;
  scene.input.keyboard?.on('keydown-ESC', () => {
    if (scene.time.now < readyAt) return;
    handler();
  });
}

/** Подложка задачки: трава-поле и кремовая панель под содержимое. */
export function addPuzzleBackdrop(
  scene: Phaser.Scene,
  title: string,
): Phaser.GameObjects.GameObject {
  // Часы задачки: отсюда и до finishPuzzle. Сцена об этом не знает.
  startedAt.set(scene, scene.time.now);
  mistakes.set(scene, 0);
  if (scene.textures.exists(TEX.PITCH_TILE)) {
    scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.PITCH_TILE)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);
  } else {
    scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PALETTE.grassMid)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);
  }
  const panel = createPanel(
    scene,
    PUZZLE_PANEL.centerX,
    PUZZLE_PANEL.centerY,
    PUZZLE_PANEL.width,
    PUZZLE_PANEL.height,
  );
  panel.setDepth(0);
  // Диплодок за панелью: видно только голову над её верхним краем. Так он
  // есть на каждом экране задачки и при этом не закрывает ни одной клетки.
  const watcher = DinoWatcher.create(scene);
  if (watcher !== null) watchers.set(scene, watcher);
  const heading = createText(scene, GAME_WIDTH / 2, 70, title, 48, PALETTE.uiTextLight);
  heading.setOrigin(0.5, 0.5).setDepth(1);
  return panel;
}
