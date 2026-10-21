/**
 * «Выбери лес»: восемь больших кружков с цифрами в два ряда по четыре.
 * Читать ничего не нужно. Все леса открыты всегда: проиграть и застрять нельзя.
 * Под каждым кружком — точки по числу кладов (найденные золотые, остальные серые).
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX } from '../art/keys';
import { createRoundButton, createText } from '../art/ui';
import { createLevelBadge } from '../art/levelBadge';
import type { BadgeTone } from '../art/levelBadge';
import { audio } from '../audio/AudioEngine';
import { LEVEL_COUNT, getLevel, totalTreasures } from '../data/levels';
import { save } from '../systems/save';
import { SCENE } from '../types';

/** Линия горизонта: выше — небо, ниже — трава (как в меню). */
const HORIZON_Y = Math.round(GAME_HEIGHT * 0.72);

const COLUMNS = 4;
/** Радиус кружка: диаметр 150px, с запасом под палец. */
const BADGE_RADIUS = 75;
const STEP_X = 230;
const ROW_STEP_Y = 235;
const FIRST_ROW_Y = 205;

/** Точки кладов под кружком. */
const DOT_RADIUS = 8;
const DOT_STEP = 24;
const DOT_ROW_STEP = 22;
const DOT_GAP_BELOW_BADGE = 26;
/** Если кладов больше этого числа — точки идут в два ряда. */
const DOTS_ONE_ROW_MAX = 10;

const PULSE_SCALE = 1.07;

export class LevelSelectScene extends Phaser.Scene {
  private leaving = false;
  /** Нажатия кружков по номеру леса — нужны для клавиш 1–8. */
  private levelPresses = new Map<number, () => void>();
  private currentLevel = 1;
  private endlessPress: (() => void) | null = null;

  constructor() {
    super(SCENE.LEVELS);
  }

  init(): void {
    this.leaving = false;
    this.levelPresses = new Map();
    this.endlessPress = null;
  }

  create(): void {
    this.currentLevel = save.loadCurrentLevel();
    this.drawBackground();

    // Заголовок: карта и «Выбери лес».
    const title = createText(this, GAME_WIDTH / 2 + 36, 64, 'Выбери лес', CONFIG.ui.fontSizeBig);
    this.add.image(title.x - title.width / 2 - 44, 64, TEX.ICON_MAP).setScale(0.8);

    for (let n = 1; n <= LEVEL_COUNT; n += 1) {
      this.createLevelCell(n);
    }

    this.createBackButton();
    if (save.loadCompleted().length >= LEVEL_COUNT) this.createEndlessButton();

    this.setupKeyboard();

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.input.keyboard?.removeAllListeners();
      this.levelPresses.clear();
      this.endlessPress = null;
    });
  }

  /** Кружок леса n с цифрой, короной (если пройден) и точками кладов. */
  private createLevelCell(n: number): void {
    const col = (n - 1) % COLUMNS;
    const row = Math.floor((n - 1) / COLUMNS);
    const x = GAME_WIDTH / 2 + (col - (COLUMNS - 1) / 2) * STEP_X;
    const y = FIRST_ROW_Y + row * ROW_STEP_Y;

    const done = save.isLevelComplete(n);
    const current = n === this.currentLevel;
    const tone: BadgeTone = done ? 'gold' : current ? 'warm' : 'calm';

    const badge = createLevelBadge(this, x, y, n, BADGE_RADIUS, tone, CONFIG.ui.fontSizeCounter);
    if (done) {
      // Корона сидит на верхнем краю кружка.
      badge.body.add(this.add.image(0, -BADGE_RADIUS + 2, TEX.ICON_CROWN).setScale(0.5));
    }
    if (current) {
      this.tweens.add({
        targets: badge.body,
        scale: PULSE_SCALE,
        duration: 800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    const press = (): void => {
      if (this.leaving) return;
      this.leaving = true;
      audio.unlock();
      audio.play('tap');
      save.saveCurrentLevel(n);
      this.scene.start(SCENE.FOREST, { level: n });
    };
    badge.container.setInteractive({
      hitArea: new Phaser.Geom.Circle(0, 0, BADGE_RADIUS),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
    badge.container.on(Phaser.Input.Events.POINTER_DOWN, press);
    this.levelPresses.set(n, press);

    const total = totalTreasures(getLevel(n));
    const found = Math.min(save.loadLevelFound(n).length, total);
    this.drawDots(x, y + BADGE_RADIUS + DOT_GAP_BELOW_BADGE, total, found);
  }

  /** Точки кладов: найденные золотые, остальные серые; больше 10 — два ряда. */
  private drawDots(cx: number, topY: number, total: number, found: number): void {
    const perRow = total > DOTS_ONE_ROW_MAX ? Math.ceil(total / 2) : total;
    for (let i = 0; i < total; i += 1) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, total - row * perRow);
      const isFound = i < found;
      const dot = this.add.circle(
        cx + (col - (inRow - 1) / 2) * DOT_STEP,
        topY + row * DOT_ROW_STEP,
        DOT_RADIUS,
        isFound ? PALETTE.gold : PALETTE.uiButtonCalm,
      );
      dot.setStrokeStyle(3, isFound ? PALETTE.goldDark : PALETTE.uiButtonCalmDark);
    }
  }

  /** Назад в меню — левый нижний угол. */
  private createBackButton(): void {
    const radius = CONFIG.ui.buttonRadius;
    createRoundButton(
      this,
      CONFIG.ui.padding + radius,
      GAME_HEIGHT - CONFIG.ui.padding - radius,
      TEX.ICON_BACK,
      () => this.goMenu(),
      { radius, tone: 'calm' },
    );
  }

  /** «Ещё лес!» — после восьмого леса открывается бесконечный режим. */
  private createEndlessButton(): void {
    const radius = CONFIG.ui.buttonRadius;
    const x = GAME_WIDTH - CONFIG.ui.padding - radius;
    const y = GAME_HEIGHT - CONFIG.ui.padding - radius;
    const level = LEVEL_COUNT + 1;
    const button = createRoundButton(
      this,
      x,
      y,
      TEX.ICON_AGAIN,
      () => {
        if (this.leaving) return;
        this.leaving = true;
        save.saveCurrentLevel(level);
        this.scene.start(SCENE.FOREST, { level });
      },
      { radius },
    );
    this.endlessPress = () => button.press();
    createText(this, x - radius - 16, y, 'Ещё лес!', CONFIG.ui.fontSizeText).setOrigin(1, 0.5);
  }

  private goMenu(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE.MENU);
  }

  /** Esc — назад; цифры 1–8 — сразу в лес; Пробел/Enter — текущий лес. */
  private setupKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    keyboard.on('keydown-ESC', () => this.goMenu());
    keyboard.on('keydown', (event: KeyboardEvent) => {
      audio.unlock();
      const n = Number(event.key);
      if (Number.isInteger(n)) this.levelPresses.get(n)?.();
    });
    const startCurrent = (): void => {
      const press = this.levelPresses.get(this.currentLevel);
      if (press !== undefined) press();
      else this.endlessPress?.();
    };
    keyboard.on('keydown-SPACE', startCurrent);
    keyboard.on('keydown-ENTER', startCurrent);
  }

  /** Небо с градиентом, холм, земля и деревья по краям — как в меню. */
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
    g.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 20);

    g.fillStyle(0xffffff, 0.75);
    const clouds: ReadonlyArray<readonly [number, number, number]> = [
      [GAME_WIDTH * 0.12, 110, 0.9],
      [GAME_WIDTH * 0.9, 120, 1],
    ];
    for (const [cx, cy, k] of clouds) {
      g.fillEllipse(cx, cy, 190 * k, 54 * k);
      g.fillEllipse(cx - 40 * k, cy - 22 * k, 100 * k, 56 * k);
      g.fillEllipse(cx + 34 * k, cy - 18 * k, 120 * k, 60 * k);
    }

    g.fillStyle(PALETTE.grassLight, 1);
    g.fillEllipse(GAME_WIDTH * 0.7, HORIZON_Y + 24, GAME_WIDTH * 0.9, 120);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y);
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, 12);
    g.fillStyle(PALETTE.grassDark, 1);
    g.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);

    this.add.image(60, HORIZON_Y + 70, TEX.TREE[0]).setOrigin(0.5, 1).setScale(0.8);
    this.add.image(GAME_WIDTH - 50, HORIZON_Y + 80, TEX.TREE[1]).setOrigin(0.5, 1).setScale(0.8);
  }
}
