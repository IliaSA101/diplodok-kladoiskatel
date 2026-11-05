/**
 * Интерфейс поверх леса: кнопка действия, выход, звук, номер леса,
 * счётчик кладов с точками и рюкзак.
 *
 * Всё это не ездит с камерой и живёт на своей глубине — лес её не перекроет
 * (декор получает depth по мировому y, до 2160). Сцена знает про HUD ровно
 * четыре вещи: показать прогресс, сменить кнопку действия, спросить, не попал
 * ли тап в интерфейс, и куда лететь найденному предмету.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createBackButton, createPanel, createRoundButton, createText, type RoundButton } from '../art/ui';
import { dotRows, type DotRows } from '../art/layout';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Отступы ряда точек внутри панели и шаг между рядами. */
const DOTS_TOP = 84;
const DOTS_BOTTOM = 18;
const DOT_ROW_STEP = 26;
const DOT_SPACING = 28;
/** Больше восьми точек в ряд не ставим: панель узкая. */
const DOTS_ONE_ROW_MAX = 8;

/** HUD выше всего леса: декор получает depth по мировому y (до 2160). */
const HUD_DEPTH = 100000;

/** Круглая зона, по которой тап считается нажатием интерфейса, а не земли. */
interface HudZone {
  x: number;
  y: number;
  radius: number;
}

export interface ForestHudOptions {
  /** Номер леса — показывается цифрой слева сверху. */
  levelNumber: number;
  /** Сколько кладов в лесу: по этому числу строится ряд точек. */
  treasureCount: number;
  onAction: () => void;
  onBackpack: () => void;
  onBack: () => void;
}

export class ForestHud {
  /** Куда улетает найденный предмет. */
  readonly backpackPoint: { x: number; y: number };

  private readonly scene: Phaser.Scene;
  private readonly actionButton: RoundButton;
  private readonly backpackButton: RoundButton;
  private readonly soundButton: RoundButton;
  private readonly counterText: Phaser.GameObjects.Text;
  private readonly dots: Phaser.GameObjects.Arc[] = [];
  private readonly zones: HudZone[] = [];
  private readonly panel: { x: number; y: number; width: number; height: number };
  private actionIcon: string;
  private actionEnabled = false;

  constructor(scene: Phaser.Scene, options: ForestHudOptions) {
    this.scene = scene;
    const pad = CONFIG.ui.padding;
    const small = CONFIG.ui.smallButtonRadius;

    // Кнопка действия — большая, в правом нижнем углу, под большой палец.
    const actionX = GAME_WIDTH - CONFIG.ui.buttonRadius - pad * 1.4;
    const actionY = GAME_HEIGHT - CONFIG.ui.buttonRadius - pad * 1.4;
    this.actionButton = createRoundButton(scene, actionX, actionY, TEX.ICON_SHOVEL, options.onAction);
    this.pin(this.actionButton.container);
    this.actionButton.setEnabled(false);
    this.actionButton.setTone('calm');
    this.actionIcon = TEX.ICON_SHOVEL;
    this.zones.push({ x: actionX, y: actionY, radius: CONFIG.ui.buttonRadius + 24 });

    // Слева сверху в ряд: выход, звук, цифра леса. Выход первый — на всех
    // экранах он в этом углу, и раньше из леса выйти было нельзя вовсе.
    const backRadius = CONFIG.ui.buttonRadius;
    const backX = pad + backRadius;
    const backY = pad + backRadius;
    const back = createBackButton(scene, options.onBack);
    this.pin(back.container);
    this.zones.push({ x: backX, y: backY, radius: backRadius + 20 });

    const soundX = backX + backRadius + 16 + small;
    const soundY = backY;
    this.soundButton = createRoundButton(
      scene,
      soundX,
      soundY,
      audio.muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON,
      () => {
        const muted = audio.toggleMuted();
        this.soundButton.setIcon(muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON);
      },
      { radius: small },
    );
    this.pin(this.soundButton.container);
    this.zones.push({ x: soundX, y: soundY, radius: small + 20 });

    const levelText = createText(
      scene,
      soundX + small + 56,
      soundY,
      String(options.levelNumber),
      CONFIG.ui.fontSizeBig,
    );
    levelText.setOrigin(0.5, 0.5);
    this.pin(levelText);

    // Справа сверху — счётчик «сколько из скольких», под ним точки кладов.
    // Высота панели считается по числу рядов точек: при одиннадцати кладах
    // второй ряд упирался в дно панели. Рюкзак вынесен отдельной кнопкой под
    // неё — раньше он сидел внутри и наезжал на её правый край.
    const rows = this.dotLayout(options.treasureCount).rows;
    const panelWidth = 330;
    const panelHeight = DOTS_TOP + rows * DOT_ROW_STEP + DOTS_BOTTOM;
    const panelX = GAME_WIDTH - panelWidth / 2 - pad;
    const panelY = panelHeight / 2 + pad;
    this.pin(createPanel(scene, panelX, panelY, panelWidth, panelHeight));

    this.counterText = createText(scene, panelX, pad + 52, '', CONFIG.ui.fontSizeBig, PALETTE.uiText);
    this.counterText.setOrigin(0.5, 0.5);
    this.pin(this.counterText);

    this.buildDots(options.treasureCount, panelX, pad + DOTS_TOP + DOT_ROW_STEP / 2);

    const backpackX = GAME_WIDTH - pad - small;
    const backpackY = panelY + panelHeight / 2 + 18 + small;
    this.backpackButton = createRoundButton(
      scene,
      backpackX,
      backpackY,
      TEX.ICON_BACKPACK,
      options.onBackpack,
      { radius: small },
    );
    this.pin(this.backpackButton.container);
    this.backpackPoint = { x: backpackX, y: backpackY };
    this.zones.push({ x: backpackX, y: backpackY, radius: small + 20 });
    // Панель прямоугольная — у неё отдельная проверка в isOver.
    this.panel = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };
  }

  /** Кнопка действия под вид ближайшего клада; лишний раз не трогаем. */
  setAction(icon: string, enabled: boolean): void {
    if (icon !== this.actionIcon) {
      this.actionButton.setIcon(icon);
      this.actionIcon = icon;
    }
    if (enabled !== this.actionEnabled) {
      this.actionButton.setEnabled(enabled);
      this.actionButton.setTone(enabled ? 'warm' : 'calm');
      this.actionEnabled = enabled;
    }
  }

  /** Пробел на клавиатуре: кнопка должна нажаться так же, как от пальца. */
  pressAction(): void {
    this.actionButton.press();
  }

  /** Счётчик и точки: найденные золотые. */
  showProgress(found: readonly boolean[]): void {
    const count = found.filter(Boolean).length;
    this.counterText.setText(`${count} из ${found.length}`);
    found.forEach((isFound, index) => {
      this.dots[index]?.setFillStyle(isFound ? PALETTE.gold : PALETTE.uiButtonCalm);
    });
  }

  /** Тап пришёлся в интерфейс, а не в землю: идти туда не надо. */
  isOver(x: number, y: number): boolean {
    for (const zone of this.zones) {
      if (zone.radius > 0 && Math.hypot(x - zone.x, y - zone.y) <= zone.radius) return true;
    }
    return (
      Math.abs(x - this.panel.x) <= this.panel.width / 2 + 10 &&
      Math.abs(y - this.panel.y) <= this.panel.height / 2 + 10
    );
  }

  /** Находка долетела: рюкзак подпрыгивает. */
  bumpBackpack(): void {
    this.scene.tweens.add({
      targets: this.backpackButton.container,
      scale: 1.22,
      duration: 150,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  /** Точки по числу кладов: при большом количестве — в два ряда. */
  private buildDots(total: number, centerX: number, y: number): void {
    const { perRow } = this.dotLayout(total);
    for (let i = 0; i < total; i += 1) {
      const row = Math.floor(i / perRow);
      const column = i % perRow;
      const inRow = Math.min(perRow, total - row * perRow);
      const dot = this.scene.add.circle(
        centerX + (column - (inRow - 1) / 2) * DOT_SPACING,
        y + row * DOT_ROW_STEP,
        9,
        PALETTE.uiButtonCalm,
      );
      this.pin(dot);
      this.dots.push(dot);
    }
  }

  /**
   * Как разложить точки кладов: сколько в ряду и сколько рядов.
   * Панель строится по этим же числам, поэтому высота всегда сходится
   * с содержимым, сколько бы кладов в лесу ни было.
   */
  private dotLayout(total: number): DotRows {
    return dotRows(total, DOTS_ONE_ROW_MAX);
  }

  /** HUD не ездит с камерой и всегда поверх леса. */
  private pin(object: Phaser.GameObjects.GameObject): void {
    const pinned = object as Phaser.GameObjects.GameObject & {
      setScrollFactor?: (value: number) => unknown;
      setDepth?: (value: number) => unknown;
    };
    pinned.setScrollFactor?.(0);
    pinned.setDepth?.(HUD_DEPTH);
  }
}
