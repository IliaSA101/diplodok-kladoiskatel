/**
 * Задачка «Найди пару», она же маджонг.
 *
 * Первый круг — все значки лежат в один слой лицом вверх: тапнуть по двум
 * одинаковым, пара подпрыгивает и исчезает. Со второго круга часть карточек
 * ложится сверху, и начинает работать настоящее правило маджонга: взять
 * можно только ту, что ничем не накрыта и свободна с одного бока. Закрытые
 * карточки приглушены — ребёнку видно, с чего начинать, и правило он
 * разбирает глазами, а не читает.
 *
 * Где что лежит и какую можно брать, считает systems/mahjongBoard.ts — там же
 * гарантия, что стол разбирается до конца. Здесь только рисование и анимации.
 * Проиграть нельзя: ни таймера, ни счёта ошибок, ни лимита ходов.
 */
import Phaser from 'phaser';
import { CARD_ICONS, TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { MAHJONG_TABLE, PUZZLE_DOTS, puzzleDotsPerRow, stackLayout } from '../art/layout';
import { createProgressDots, type ProgressDots } from '../art/progressDots';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { mahjongDeal, mahjongPairs } from '../data/quest';
import {
  hasMove,
  isFree,
  reshuffle,
  type MahjongCell,
} from '../systems/mahjongBoard';
import {
  addBackToMap,
  addPuzzleBackdrop,
  finishPuzzle,
  notePuzzleMistake,
  type PuzzleSceneData,
} from '../systems/quest';
import { SCENE } from '../types';

/**
 * Лёгкая тень на накрытой карточке.
 *
 * Полупрозрачности тут нет сознательно: сквозь неё просвечивала панель, и
 * карточка выглядела сломанной, а не лежащей под другой. Накрытую и так видно
 * по тому, что на ней лежит соседка, — хватает намёка на тень.
 */
const COVERED_TINT = 0xd2d8db;
/** Размер значка относительно карточки (при 150 px получается ~105 px). */
const ICON_RATIO = 0.7;
/** Центр панели из addPuzzleBackdrop; её размеры лежат в MAHJONG_TABLE. */
const PANEL_CENTER_Y = GAME_HEIGHT / 2 + 30;
/** Высота строки счётчика: та же, что у заголовка. */
const COUNTER_Y = 62;
/** Насколько карточка приподнимается при выборе. */
const LIFT = 14;

/**
 * Глубины слоёв: панель (0) и заголовок (1) рисует addPuzzleBackdrop.
 * Верхний слой стопки прибавляет к своей глубине 2, поэтому между карточками
 * и HUD оставлен зазор: выбранная верхняя карточка не должна перекрыть счётчик.
 */
const DEPTH_CELL = 2;
const DEPTH_CARD = 3;
const DEPTH_CARD_ACTIVE = 4;
const DEPTH_HUD = 10;

type CardState = 'idle' | 'selected' | 'gone';

interface Card {
  /** Какой из значков лежит на карточке (индекс в CARD_ICONS). */
  symbol: number;
  /** Место на столе: колонка, ряд и слой. */
  spot: MahjongCell;
  state: CardState;
  baseX: number;
  baseY: number;
  size: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Graphics;
  /** Травяная клетка, проступающая на месте убранной карточки. */
  cell: Phaser.GameObjects.Graphics;
  /** Значок: при перемешивании он меняется. */
  icon: Phaser.GameObjects.Image;
  /** Жёлтая рамка выделения. */
  frame: Phaser.GameObjects.Graphics;
  /** Подложка: приглушается, когда карточка закрыта. */
  base: Phaser.GameObjects.Image;
}

export class PuzzleMahjongScene extends Phaser.Scene {
  /** Данные запуска (this.data у Scene занят менеджером данных Phaser). */
  private puzzle!: PuzzleSceneData;
  private cards: Card[] = [];
  private selected: Card | null = null;
  /** Пока играют анимации пары — новые тапы игнорируем. */
  private busy = false;
  private finished = false;
  private pairsTotal = 0;
  private pairsLeft = 0;
  /** Сколько раз пришлось перемешать: входит в seed, чтобы не повторяться. */
  private shuffles = 0;
  private dots: ProgressDots | null = null;

  constructor() {
    super(SCENE.PUZZLE_MAHJONG);
  }

  init(data: PuzzleSceneData): void {
    this.puzzle = data;
    this.cards = [];
    this.selected = null;
    this.busy = false;
    this.finished = false;
    this.dots = null;
    const pairs = mahjongPairs(data.step);
    this.pairsTotal = pairs;
    this.pairsLeft = pairs;
  }

  create(): void {
    // Заголовок один и тот же на всех кругах: слово «Маджонг» первоклассник
    // складывает по слогам и смысла из него не достаёт, а «Найди пару» — это
    // ещё и инструкция, которая нужнее всего как раз на большой горке.
    addPuzzleBackdrop(this, 'Найди пару');
    this.buildCounter();
    this.buildCards();
    addBackToMap(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.cards = [];
      this.dots = null;
      this.selected = null;
    });
  }

  /**
   * Счётчик найденных пар: цифра и точки справа от заголовка.
   *
   * Цифра считает найденное, как и точки. Раньше она считала оставшееся:
   * рядом с загорающимися точками стояло убывающее число, и в сантиметре друг
   * от друга получались «найдено» и «осталось» одинакового вида. Весь экран
   * теперь говорит одно: сколько уже сделано.
   *
   * Ряд точек рисует общая фабрика: она же сворачивает его в два ряда, когда в
   * один не влезает — двадцать пар третьего круга выстраивались в линию через
   * весь верх и наезжали на заголовок.
   */
  private buildCounter(): void {
    this.dots = createProgressDots(this, {
      count: this.pairsTotal,
      y: COUNTER_Y,
      rightX: PUZZLE_DOTS.right,
      step: PUZZLE_DOTS.step,
      radius: 10,
      rowStep: PUZZLE_DOTS.rowStep,
      maxPerRow: puzzleDotsPerRow(),
      depth: DEPTH_HUD,
    });
  }

  /** Обновить счётчик после убранной пары: цифра и очередная золотая точка. */
  private updateCounter(): void {
    const found = this.pairsTotal - this.pairsLeft;
    this.dots?.fill(found - 1);
  }

  /** Расклад берём готовым: где лежит карточка и какую можно взять — не наше дело. */
  private buildCards(): void {
    const board = mahjongDeal(this.puzzle.step, this.puzzle.variant);

    // Где лежит карточка, считает art/layout.ts: там же это проверяется тестом.
    const fit = stackLayout({
      ...MAHJONG_TABLE,
      columns: board.columns,
      rows: board.rows,
      layers: board.layers,
      centerX: GAME_WIDTH / 2,
      centerY: PANEL_CENTER_Y,
    });

    for (const cell of board.cells) {
      const x = fit.originX + cell.col * fit.step + cell.layer * MAHJONG_TABLE.liftX;
      const y = fit.originY + cell.row * fit.step + cell.layer * MAHJONG_TABLE.liftY;
      this.cards.push(this.makeCard(cell, x, y, fit.size));
    }
    this.refreshCovered();
  }

  /** Клетки карточек, которые ещё на столе. */
  private remaining(): MahjongCell[] {
    return this.cards.filter((card) => card.state !== 'gone').map((card) => card.spot);
  }

  /**
   * Тень на накрытых карточках и чистый цвет на открывшихся.
   *
   * Пересчитывается после каждой снятой пары: снял верхнюю — та, что лежала
   * под ней, посветлела, и ребёнок видит новый ход сразу, без объяснений.
   */
  private refreshCovered(): void {
    const remaining = this.remaining();
    for (const card of this.cards) {
      if (card.state === 'gone') continue;
      if (isFree(remaining, card.spot)) {
        card.base.clearTint();
        card.container.setInteractive({ useHandCursor: true });
      } else {
        card.base.setTint(COVERED_TINT);
        // Из-под верхней карточки торчит краешек нижней, и раньше он ловил
        // тап: ребёнок целился в то, что видит, и получал отказ. Накрытая
        // карточка просто не нажимается — что видно, то и работает.
        card.container.disableInteractive();
      }
    }
  }

  /** Свободна ли карточка прямо сейчас. */
  private isPlayable(card: Card): boolean {
    return isFree(this.remaining(), card.spot);
  }

  /**
   * Ход кончился — карточки перемешиваются сами.
   *
   * Проиграть нельзя, поэтому тупика тут не бывает: значки на оставшихся
   * карточках раскладываются заново, и пара снова оказывается на виду.
   * Ребёнок видит, как значки перещёлкиваются, и просто играет дальше.
   */
  private ensureMove(): void {
    const alive = this.cards.filter((card) => card.state !== 'gone');
    const remaining = alive.map((card) => card.spot);
    if (remaining.length < 2 || hasMove(remaining)) return;

    this.shuffles += 1;
    reshuffle(remaining, 7000 + this.puzzle.variant * 101 + this.shuffles);
    audio.play('tap', { pitch: 0.8, volume: 0.5 });
    alive.forEach((card, index) => this.swapIcon(card, index * 26));
  }

  /** Перевернуть значок на карточке: сжать, подменить картинку, разжать. */
  private swapIcon(card: Card, delay: number): void {
    card.symbol = card.spot.symbol;
    this.tweens.add({
      targets: card.icon,
      scaleX: 0,
      duration: 130,
      delay,
      ease: 'Sine.easeIn',
      onComplete: () => {
        const key = CARD_ICONS[card.symbol] ?? CARD_ICONS[0] ?? TEX.FOOT[0];
        const fit = this.fitIcon(card.icon, key, card.size);
        card.icon.setScale(0, fit);
        this.tweens.add({ targets: card.icon, scaleX: fit, duration: 130, ease: 'Sine.easeOut' });
      },
    });
  }

  /** Подставить картинку и вернуть масштаб, при котором она влезает в карточку. */
  private fitIcon(icon: Phaser.GameObjects.Image, key: string, size: number): number {
    icon.setTexture(key);
    return (size * ICON_RATIO) / Math.max(icon.width, icon.height);
  }

  private makeCard(spot: MahjongCell, x: number, y: number, size: number): Card {
    const radius = Math.round(size * 0.14);
    const half = size / 2;

    // Травяная клетка: появится, когда карточку уберут. Только под нижним
    // слоем — на месте снятой верхней видна та, что лежала под ней.
    const cell = this.add.graphics().setDepth(DEPTH_CELL).setAlpha(0);
    if (spot.layer === 0) {
      cell.fillStyle(PALETTE.grassLight, 1);
      cell.fillRoundedRect(x - half, y - half, size, size, radius);
      cell.lineStyle(4, PALETTE.grassDark, 1);
      cell.strokeRoundedRect(x - half, y - half, size, size, radius);
    }

    // Мягкая тень под карточкой: со смещением вниз-вправо, как у плитки маджонга.
    const shadow = this.add.graphics().setDepth(DEPTH_CELL + spot.layer * 2);
    shadow.fillStyle(PALETTE.uiText, 0.22 + spot.layer * 0.1);
    const drop = 4 + spot.layer * 3;
    shadow.fillRoundedRect(x - half + drop, y - half + drop * 2, size, size, radius);

    // Подложка-основание, значок поверх, рамка выделения.
    const base = this.add.image(0, 0, TEX.CARD_BACK).setDisplaySize(size, size);
    const iconKey = CARD_ICONS[spot.symbol] ?? CARD_ICONS[0] ?? TEX.FOOT[0];
    const icon = this.add.image(0, 0, iconKey);
    icon.setScale(this.fitIcon(icon, iconKey, size));

    const frame = this.add.graphics().setVisible(false);
    frame.lineStyle(7, PALETTE.gold, 1);
    frame.strokeRoundedRect(-half - 2, -half - 2, size + 4, size + 4, radius + 2);

    const container = this.add
      .container(x, y, [base, icon, frame])
      .setSize(size, size)
      .setDepth(DEPTH_CARD + spot.layer * 2);

    const card: Card = {
      symbol: spot.symbol,
      spot,
      state: 'idle',
      baseX: x,
      baseY: y,
      size,
      container,
      shadow,
      cell,
      frame,
      base,
      icon,
    };
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', () => this.onCardTap(card));
    return card;
  }

  private onCardTap(card: Card): void {
    if (this.busy || this.finished || card.state === 'gone') return;

    // Накрытая карточка не нажимается вовсе (refreshCovered снимает с неё
    // интерактив), но на всякий случай не даём снять её и отсюда.
    if (card.state !== 'selected' && !this.isPlayable(card)) return;

    // Повторный тап по выделенной карточке снимает выделение.
    if (card.state === 'selected') {
      this.deselect(card);
      this.selected = null;
      return;
    }

    this.select(card);
    audio.play('tap', { pitch: 1.2, volume: 0.6 });

    const first = this.selected;
    if (!first) {
      this.selected = card;
      return;
    }

    this.selected = null;
    if (first.symbol === card.symbol) this.matchPair(first, card);
    else this.mismatchPair(first, card);
  }

  private select(card: Card): void {
    card.state = 'selected';
    card.frame.setVisible(true);
    card.container.setDepth(DEPTH_CARD_ACTIVE + card.spot.layer * 2);
    this.tweens.add({
      targets: card.container,
      y: card.baseY - LIFT,
      scale: 1.06,
      duration: 140,
      ease: 'Back.easeOut',
    });
    this.tweens.add({ targets: card.shadow, alpha: 0.6, duration: 140 });
  }

  private deselect(card: Card): void {
    card.state = 'idle';
    card.frame.setVisible(false);
    card.container.setDepth(DEPTH_CARD + card.spot.layer * 2);
    this.tweens.add({
      targets: card.container,
      y: card.baseY,
      x: card.baseX,
      scale: 1,
      duration: 130,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({ targets: card.shadow, alpha: 1, duration: 130 });
  }

  /** Совпало: оба подпрыгивают (340 мс), затем сжимаются и тают (260 мс). */
  private matchPair(a: Card, b: Card): void {
    this.busy = true;
    a.state = 'gone';
    b.state = 'gone';
    a.container.disableInteractive();
    b.container.disableInteractive();
    audio.play('found');

    let pending = 2;
    const onGone = (): void => {
      pending -= 1;
      if (pending > 0) return;
      this.pairsLeft -= 1;
      this.updateCounter();
      this.refreshCovered();
      this.ensureMove();
      this.busy = false;
      if (this.pairsLeft <= 0 && !this.finished) {
        this.finished = true;
        // Короткая пауза, чтобы последняя пара успела красиво исчезнуть.
        this.time.delayedCall(350, () => finishPuzzle(this, this.puzzle));
      }
    };

    for (const card of [a, b]) {
      this.sparkle(card);
      this.tweens.add({
        targets: card.container,
        y: card.baseY - LIFT - 26,
        scale: 1.2,
        duration: 170,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: card.container,
            scale: 0,
            alpha: 0,
            duration: 260,
            ease: 'Back.easeIn',
            onComplete: () => {
              card.container.setVisible(false);
              onGone();
            },
          });
          this.tweens.add({ targets: card.shadow, alpha: 0, duration: 260 });
          this.tweens.add({ targets: card.cell, alpha: 1, duration: 320 });
        },
      });
    }
  }

  /** Не совпало: короткая дрожь (~440 мс), затем обе карточки опускаются (130 мс). */
  private mismatchPair(a: Card, b: Card): void {
    this.busy = true;
    notePuzzleMistake(this);
    audio.play('tap', { pitch: 0.6, volume: 0.5 });

    let pending = 2;
    for (const card of [a, b]) {
      this.tweens.add({
        targets: card.container,
        x: card.baseX + 9,
        duration: 55,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          card.container.x = card.baseX;
          this.deselect(card);
          pending -= 1;
          if (pending === 0) this.time.delayedCall(130, () => (this.busy = false));
        },
      });
    }
  }

  /** Маленький фейерверк искр над убранной карточкой. */
  private sparkle(card: Card): void {
    const sparks = this.add.particles(card.baseX, card.baseY, TEX.SPARKLE, {
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
