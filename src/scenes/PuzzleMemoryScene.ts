/**
 * Задачка «Запомни пары»: все карточки лежат рубашкой вверх.
 *
 * Ребёнок открывает две: совпали — остаются открытыми и золотятся, не совпали —
 * сами переворачиваются назад. Проиграть нельзя: ни таймера, ни счёта попыток.
 * Отличие от «Найди пару» в том, что там значки видны сразу, а здесь их надо
 * держать в голове — поэтому карточек меньше, а сами они крупнее.
 */
import Phaser from 'phaser';
import { CARD_ICONS, TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { PUZZLE_DOTS, centredGrid, puzzleDotsPerRow } from '../art/layout';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { memoryDeal, memoryLevel } from '../data/questDeals';
import type { MemoryLevel } from '../data/questDeals';
import {
  addBackToMap,
  addPuzzleBackdrop,
  finishPuzzle,
  notePuzzleMistake,
  type PuzzleSceneData,
} from '../systems/quest';
import { SCENE } from '../types';

/**
 * Колонки приходят из ступени, а не стоят числом.
 *
 * Четыре колонки были зашиты намертво, и на двадцати четырёх карточках это
 * шесть рядов: в панель они влезали только усохнув, а справа и слева от сетки
 * оставалось пусто на треть экрана. Теперь стол растёт вширь.
 */
/** Желаемый размер карточки; если ряды не помещаются в панель — уменьшим. */
const CARD_SIZE_MAX = 150;
/** Размер значка относительно карточки. */
const ICON_RATIO = 0.7;
/** Центр и высота панели из addPuzzleBackdrop. */
const PANEL_CENTER_Y = GAME_HEIGHT / 2 + 30;
/** Высота строки счётчика: та же, что у заголовка. */
const COUNTER_Y = 62;
const PANEL_HEIGHT = 580;
const PANEL_INSET = 18;
const CARD_GAP = 12;

/** Переворот: половина времени — до «ребра», половина — из него. */
const FLIP_MS = 160;
/** Сколько не совпавшая пара остаётся открытой, прежде чем лечь назад. */
const PEEK_MS = 900;

const DEPTH_SHADOW = 2;
const DEPTH_CARD = 3;
const DEPTH_CARD_ACTIVE = 4;
const DEPTH_HUD = 6;

type CardState = 'down' | 'up' | 'done';

interface Card {
  /** Какой из значков на лице карточки (номер группы). */
  symbol: number;
  state: CardState;
  container: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Container;
  /** Куда карточка возвращается после прыжка. */
  baseY: number;
}

export class PuzzleMemoryScene extends Phaser.Scene {
  /** Данные запуска (this.data у Scene занят менеджером данных Phaser). */
  private puzzle!: PuzzleSceneData;
  private cards: Card[] = [];
  /** Какие значки достались этому узлу: номера в CARD_ICONS. */
  private icons: number[] = [];
  /** Открытая карточка, которая ждёт вторую. */
  private opened: Card[] = [];
  /** Идёт анимация пары — новые тапы игнорируем. */
  private busy = false;
  private finished = false;
  /** Какой стол на этой ступени: сколько наборов, по скольку карточек, в сколько колонок. */
  private level: MemoryLevel = { groups: 6, group: 2, columns: 4 };
  private groupsTotal = 0;
  private groupsLeft = 0;
  private dots: ProgressDots | null = null;

  constructor() {
    super(SCENE.PUZZLE_MEMORY);
  }

  init(data: PuzzleSceneData): void {
    this.puzzle = data;
    this.cards = [];
    this.icons = [];
    this.opened = [];
    this.busy = false;
    this.finished = false;
    this.dots = null;
    this.level = memoryLevel(data.step);
    this.groupsTotal = this.level.groups;
    this.groupsLeft = this.level.groups;
  }

  create(): void {
    // Тройки — это уже не пары, и называть их парами значит сбить ребёнка
    // на первом же ходу: он откроет две одинаковые и не поймёт, почему мало.
    addPuzzleBackdrop(this, this.level.group >= 3 ? 'Запомни тройки' : 'Запомни пары');
    this.buildCounter();
    this.buildCards();
    addBackToMap(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.cards = [];
      this.dots = null;
      this.opened = [];
    });
  }

  // ---------------------------------------------------------------------------
  // Счётчик
  // ---------------------------------------------------------------------------

  /**
   * Сколько наборов найдено: ряд точек справа от заголовка.
   *
   * Цифры тут больше нет. Она считала ровно то же, что и точки, стояла только
   * на двух экранах из семи — а когда в правом верхнем углу поселился
   * диплодок, ряд пришлось подвинуть влево, и цифре осталась полоска в
   * полтора десятка пикселей между заголовком и первым кружком. Счётчик
   * в игре один, и это точки.
   */
  private buildCounter(): void {
    this.dots = createProgressDots(this, {
      count: this.groupsTotal,
      y: COUNTER_Y,
      rightX: PUZZLE_DOTS.right,
      step: PUZZLE_DOTS.step,
      radius: 10,
      rowStep: PUZZLE_DOTS.rowStep,
      maxPerRow: puzzleDotsPerRow(),
      depth: DEPTH_HUD,
    });
  }

  private updateCounter(): void {
    const found = this.groupsTotal - this.groupsLeft;
    this.dots?.fill(found - 1);
  }

  // ---------------------------------------------------------------------------
  // Карточки
  // ---------------------------------------------------------------------------

  /** Расклад берём готовым из `data/quest.ts`: что где лежит — не дело сцены. */
  private buildCards(): void {
    const deal = memoryDeal(this.puzzle.step, this.puzzle.variant);
    const columns = this.level.columns;
    this.icons = [...deal.icons];
    const layout = deal.layout;

    const rows = Math.ceil(layout.length / columns);
    const freeHeight = PANEL_HEIGHT - PANEL_INSET * 2 - (rows - 1) * CARD_GAP;
    const size = Math.min(CARD_SIZE_MAX, Math.floor(freeHeight / rows));
    const step = size + CARD_GAP;
    // Каждый ряд по центру своей длины: на тройках карточек двадцать семь,
    // последний ряд из трёх, и прижатый влево он оставлял справа пустое место.
    const grid = centredGrid(layout.length, columns, step);

    layout.forEach((symbol, index) => {
      const spot = grid.spots[index];
      if (spot === undefined) return;
      this.cards.push(
        this.makeCard(symbol, GAME_WIDTH / 2 + spot.dx, PANEL_CENTER_Y + spot.dy, size),
      );
    });
  }

  private makeCard(symbol: number, x: number, y: number, size: number): Card {
    const radius = Math.round(size * 0.14);
    const half = size / 2;

    // Мягкая тень под карточкой: со смещением вниз-вправо, как у маджонга.
    const shadow = this.add.graphics().setDepth(DEPTH_SHADOW);
    shadow.fillStyle(PALETTE.uiText, 0.22);
    shadow.fillRoundedRect(x - half + 4, y - half + 9, size, size, radius);

    const back = this.add.image(0, 0, TEX.CARD_DOWN).setDisplaySize(size, size);
    const base = this.add.image(0, 0, TEX.CARD_BACK).setDisplaySize(size, size);
    const iconKey = CARD_ICONS[this.icons[symbol] ?? 0] ?? TEX.FOOT[0];
    const icon = this.add.image(0, 0, iconKey);
    icon.setScale((size * ICON_RATIO) / Math.max(icon.width, icon.height));
    // Лицо целиком прячется и показывается одним флагом.
    const face = this.add.container(0, 0, [base, icon]).setVisible(false);

    const container = this.add.container(x, y, [back, face]).setSize(size, size).setDepth(DEPTH_CARD);
    // Зона нажатия из того же size, что и рисунок: свой Rectangle(-half, …)
    // Phaser сдвигает ещё раз на половину, и попадать надо было в угол карточки.
    container.setInteractive({ useHandCursor: true });

    const card: Card = { symbol, state: 'down', container, back, face, baseY: y };
    container.on(Phaser.Input.Events.POINTER_DOWN, () => this.onCardTap(card));
    return card;
  }

  // ---------------------------------------------------------------------------
  // Ходы
  // ---------------------------------------------------------------------------

  private onCardTap(card: Card): void {
    if (this.busy || this.finished || card.state !== 'down') return;
    audio.play('tap', { pitch: 1.2, volume: 0.6 });

    this.opened.push(card);
    if (this.opened.length < this.level.group) {
      this.flip(card, true);
      return;
    }

    // Последняя карточка набора: до конца её переворота новые тапы не принимаем.
    const chosen = this.opened;
    this.opened = [];
    this.busy = true;
    this.flip(card, true, () => {
      const first = chosen[0];
      if (first !== undefined && chosen.every((one) => one.symbol === first.symbol)) {
        this.matchGroup(chosen);
      } else {
        this.mismatchGroup(chosen);
      }
    });
  }

  /**
   * Переворот: карточка сжимается в «ребро», меняет сторону и раскрывается.
   * Обмен лицом и рубашкой — ровно в середине, когда карточки не видно.
   */
  private flip(card: Card, up: boolean, done?: () => void): void {
    card.state = up ? 'up' : 'down';
    card.container.setDepth(up ? DEPTH_CARD_ACTIVE : DEPTH_CARD);
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: FLIP_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        card.face.setVisible(up);
        card.back.setVisible(!up);
        this.tweens.add({
          targets: card.container,
          scaleX: 1,
          duration: FLIP_MS,
          ease: 'Sine.easeOut',
          onComplete: () => done?.(),
        });
      },
    });
  }

  /** Совпало: набор подпрыгивает с искрами и остаётся лежать лицом вверх. */
  private matchGroup(group: Card[]): void {
    for (const card of group) {
      card.state = 'done';
      card.container.disableInteractive();
    }
    audio.play('found');
    this.groupsLeft -= 1;
    this.updateCounter();

    let pending = group.length;
    for (const card of group) {
      this.sparkle(card);
      this.tweens.add({
        targets: card.container,
        y: card.baseY - 24,
        scale: 1.12,
        duration: 180,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          card.container.setDepth(DEPTH_CARD);
          card.container.y = card.baseY;
          pending -= 1;
          if (pending > 0) return;
          this.busy = false;
          if (this.groupsLeft <= 0 && !this.finished) {
            this.finished = true;
            // Короткая пауза, чтобы последняя пара успела доиграть.
            this.time.delayedCall(400, () => finishPuzzle(this, this.puzzle));
          }
        },
      });
    }
  }

  /** Не совпало: набор остаётся открытым на PEEK_MS и ложится назад сам. */
  private mismatchGroup(group: Card[]): void {
    notePuzzleMistake(this);
    audio.play('tap', { pitch: 0.6, volume: 0.5 });
    this.time.delayedCall(PEEK_MS, () => {
      let pending = group.length;
      for (const card of group) {
        this.flip(card, false, () => {
          pending -= 1;
          if (pending === 0) this.busy = false;
        });
      }
    });
  }

  /** Маленький фейерверк искр над угаданной карточкой. */
  private sparkle(card: Card): void {
    const sparks = this.add.particles(card.container.x, card.baseY, TEX.SPARKLE, {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      lifespan: 700,
      scale: { start: 0.8, end: 0 },
      quantity: 8,
      emitting: false,
    });
    sparks.setDepth(DEPTH_HUD);
    sparks.explode(8);
    this.time.delayedCall(900, () => sparks.destroy());
  }
}
