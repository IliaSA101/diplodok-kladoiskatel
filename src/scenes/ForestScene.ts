/**
 * Главная сцена: лес одного уровня, диплодок, клады.
 *
 * Правила сцены:
 * - проиграть нельзя, таймеров нет, подсказка всегда доступна;
 * - одна большая кнопка действия сама понимает, что делать: копать, тянуться
 *   к кроне, толкать камень, нырять в ручей или открывать секретный сундук;
 * - пока идёт находка (busy), управление отключено, чтобы ребёнок не сбил анимацию.
 */
import Phaser from 'phaser';
import { generateForestTextures } from '../art/forest';
import { itemTexture, TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { themeTexture, THEMES } from '../art/themes';
import { createPanel, createRoundButton, createText, type RoundButton } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { getLevel, type LevelSpec } from '../data/levels';
import { getTreasureItem, SECRET_ITEM_ID } from '../data/treasures';
import { Critters, Squirrel } from '../entities/Critters';
import { Diplodocus } from '../entities/Diplodocus';
import { createForestObject, pushOutOfObstacles, type ForestObject, type Obstacle } from '../entities/ForestObject';
import { Treasure } from '../entities/Treasure';
import { Controls } from '../systems/controls';
import { computeHotCold } from '../systems/hotCold';
import { save } from '../systems/save';
import { generateWorld, type TreasureKind, type WorldData } from '../systems/worldGen';
import { SCENE, type ForestSceneData } from '../types';

/** Клавиатурное движение по вертикали чуть медленнее — псевдо-перспектива вида сверху-сбоку. */
const VERTICAL_SPEED_FACTOR = 0.78;
const STEP_SOUND_INTERVAL = 330;
/** На каком расстоянии белка замечает диплодока. */
const SQUIRREL_RADIUS = 190;

/**
 * Глубина у объектов леса равна их координате y (до 2880), поэтому ночь,
 * интерфейс и экран находки живут заведомо выше.
 */
const NIGHT_DEPTH = 90000;
const WEATHER_DEPTH = 80000;
const HUD_DEPTH = 100000;
const REVEAL_DEPTH = 200000;

/** Какая иконка на кнопке действия для каждого вида клада. */
const ACTION_ICON: Record<TreasureKind, string> = {
  ground: TEX.ICON_SHOVEL,
  tree: TEX.ICON_LEAF,
  rock: TEX.ICON_PUSH,
  water: TEX.ICON_WATER,
  secret: TEX.ICON_CROWN,
};

interface HudZone {
  x: number;
  y: number;
  radius: number;
}

export class ForestScene extends Phaser.Scene {
  private level!: LevelSpec;
  private world!: WorldData;
  private dino!: Diplodocus;
  private controls!: Controls;

  private readonly obstacles: Obstacle[] = [];
  private decorObjects: ForestObject[] = [];
  private readonly treasures: Treasure[] = [];
  private readonly squirrels: Squirrel[] = [];
  private critters: Critters | null = null;
  private foundIds = new Set<string>();

  private dinoX = 0;
  private dinoY = 0;
  private moveTarget: { x: number; y: number } | null = null;
  private busy = false;
  private secretLit = false;

  private nextBeepAt = 0;
  private nextStepAt = 0;
  private nextSquirrelAt = 0;

  private activeTreasure: Treasure | null = null;
  private actionIcon = '';
  private actionEnabled = false;

  private actionButton!: RoundButton;
  private backpackButton!: RoundButton;
  private soundButton!: RoundButton;
  private counterText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private tapMark!: Phaser.GameObjects.Image;
  private readonly hudZones: HudZone[] = [];
  private backpackPoint = { x: 0, y: 0 };
  private hudPanel = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    super(SCENE.FOREST);
  }

  create(data: ForestSceneData): void {
    const number = data?.level ?? save.loadCurrentLevel();
    this.level = getLevel(number);
    save.saveCurrentLevel(this.level.number);

    // Текстуры темы печём лениво: наборов три, а лес открывается по одному.
    generateForestTextures(this, THEMES[this.level.theme].textureSet);

    this.world = generateWorld(this.level);
    this.foundIds = new Set(save.loadLevelFound(this.level.number));
    save.saveLevelFound(this.level.number, [...this.foundIds]);

    this.buildGround();
    this.buildDecor();
    this.buildTreasures();
    this.buildCritters();

    this.dinoX = this.world.startX;
    this.dinoY = this.world.startY;
    this.dino = new Diplodocus(this, this.dinoX, this.dinoY);
    this.dino.root.setDepth(this.dinoY);

    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBackgroundColor(THEMES[this.level.theme].colors.groundBase);
    this.cameras.main.startFollow(this.dino.root, true, CONFIG.camera.lerp, CONFIG.camera.lerp);

    this.tapMark = this.add.image(0, 0, TEX.TAP_MARK).setVisible(false);
    this.buildNight();

    this.controls = new Controls(this);
    this.buildHud();
    this.bindInput();
    this.updateCounter();
    this.refreshSecret();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  override update(time: number, delta: number): void {
    this.updateMovement(time, delta);
    this.updateHint(time);
    this.updateActionButton();
    this.updateSquirrels(time, delta);
    this.critters?.update(time, delta, this.dinoX, this.dinoY);
    this.dino.update(time, delta);
  }

  // --- построение мира ---------------------------------------------------

  private buildGround(): void {
    const theme = THEMES[this.level.theme];
    this.add
      .tileSprite(0, 0, this.world.width, this.world.height, this.groundTexture())
      .setOrigin(0, 0)
      .setDepth(-20);

    const stream = this.add.graphics().setDepth(-15);
    const points = this.world.stream;
    stream.lineStyle(104, theme.colors.waterDark, 1);
    stream.strokePoints(points, false);
    stream.lineStyle(84, theme.colors.water, 1);
    stream.strokePoints(points, false);
    stream.lineStyle(22, theme.colors.waterLight, 0.65);
    stream.strokePoints(
      points.map((point) => ({ x: point.x - 14, y: point.y })),
      false,
    );
  }

  private groundTexture(): string {
    // Плитка земли лежит в том же наборе, что и весь декор уровня.
    return themeTexture(TEX.GROUND, this.world.textureSet);
  }

  private buildDecor(): void {
    this.decorObjects = this.world.decor.map((spec) => {
      const object = createForestObject(this, spec);
      if (object.obstacle !== null) this.obstacles.push(object.obstacle);
      return object;
    });
  }

  private buildTreasures(): void {
    for (const spec of this.world.treasures) {
      this.treasures.push(
        new Treasure(this, spec, this.foundIds.has(spec.id), this.level.digTaps),
      );
    }
  }

  private buildCritters(): void {
    const theme = THEMES[this.level.theme];
    this.critters = new Critters(this, theme.critters);
    for (const spot of this.world.squirrels) {
      this.squirrels.push(new Squirrel(this, spot.x, spot.y));
    }
    if (theme.fallingLeaves) this.buildFallingLeaves();
  }

  /** Осенний листопад: частицы в экранных координатах, чтобы листья всегда были в кадре. */
  private buildFallingLeaves(): void {
    for (const texture of TEX.FALLING_LEAF) {
      const leaves = this.add.particles(0, -40, texture, {
        x: { min: 0, max: GAME_WIDTH },
        speedY: { min: 26, max: 58 },
        speedX: { min: -24, max: 24 },
        rotate: { min: -180, max: 180 },
        lifespan: 14000,
        scale: { min: 0.7, max: 1.1 },
        alpha: { min: 0.75, max: 1 },
        frequency: 900,
        quantity: 1,
      });
      leaves.setScrollFactor(0).setDepth(WEATHER_DEPTH);
    }
  }

  /** Ночь — мягкая синяя вуаль поверх мира; интерфейс остаётся ярким. */
  private buildNight(): void {
    const ambient = THEMES[this.level.theme].ambient;
    if (ambient === null) return;
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, ambient.color, ambient.alpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(NIGHT_DEPTH);
  }

  // --- интерфейс ---------------------------------------------------------

  private buildHud(): void {
    const pad = CONFIG.ui.padding;
    const small = CONFIG.ui.smallButtonRadius;

    // Кнопка действия — большая, в правом нижнем углу, под большой палец.
    const actionX = GAME_WIDTH - CONFIG.ui.buttonRadius - pad * 1.4;
    const actionY = GAME_HEIGHT - CONFIG.ui.buttonRadius - pad * 1.4;
    this.actionButton = createRoundButton(this, actionX, actionY, TEX.ICON_SHOVEL, () => this.performAction());
    this.pinToScreen(this.actionButton.container);
    this.actionButton.setEnabled(false);
    this.actionButton.setTone('calm');
    this.actionIcon = TEX.ICON_SHOVEL;
    this.hudZones.push({ x: actionX, y: actionY, radius: CONFIG.ui.buttonRadius + 24 });

    // Звук — слева сверху, рядом цифра текущего леса.
    const soundX = small + pad;
    const soundY = small + pad;
    this.soundButton = createRoundButton(
      this,
      soundX,
      soundY,
      audio.muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON,
      () => {
        const muted = audio.toggleMuted();
        this.soundButton.setIcon(muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON);
      },
      { radius: small },
    );
    this.pinToScreen(this.soundButton.container);
    this.hudZones.push({ x: soundX, y: soundY, radius: small + 20 });

    this.levelText = createText(
      this,
      soundX + small + 56,
      soundY,
      String(this.level.number),
      CONFIG.ui.fontSizeBig,
    );
    this.levelText.setOrigin(0.5, 0.5);
    this.pinToScreen(this.levelText);

    // Справа сверху — счётчик «сколько из скольких» и рюкзак.
    const panelWidth = 410;
    const panelHeight = 136;
    const panelX = GAME_WIDTH - panelWidth / 2 - pad * 0.6;
    const panelY = panelHeight / 2 + pad * 0.6;
    const panel = createPanel(this, panelX, panelY, panelWidth, panelHeight);
    this.pinToScreen(panel);

    this.counterText = createText(this, panelX - 70, panelY - 18, '', CONFIG.ui.fontSizeBig, PALETTE.uiText);
    this.counterText.setOrigin(0.5, 0.5);
    this.pinToScreen(this.counterText);

    this.buildDots(panelX - 70, panelY + 42);

    const backpackX = panelX + panelWidth / 2 - small - 10;
    this.backpackButton = createRoundButton(
      this,
      backpackX,
      panelY,
      TEX.ICON_BACKPACK,
      () => this.openCollection(),
      { radius: small },
    );
    this.pinToScreen(this.backpackButton.container);
    this.backpackPoint = { x: backpackX, y: panelY };
    // Панель прямоугольная — у неё отдельная проверка в isOverHud.
    this.hudPanel = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };
  }

  /** Точки по числу кладов: при большом количестве — в два ряда. */
  private buildDots(centerX: number, y: number): void {
    const total = this.world.treasures.length;
    const perRow = total > 8 ? Math.ceil(total / 2) : total;
    const spacing = 28;
    this.dots = [];
    for (let i = 0; i < total; i += 1) {
      const row = Math.floor(i / perRow);
      const column = i % perRow;
      const inRow = Math.min(perRow, total - row * perRow);
      const dot = this.add.circle(
        centerX + (column - (inRow - 1) / 2) * spacing,
        y + row * 24 - (total > perRow ? 10 : 0),
        9,
        PALETTE.uiButtonCalm,
      );
      this.pinToScreen(dot);
      this.dots.push(dot);
    }
  }

  /** HUD не ездит с камерой и всегда поверх леса. */
  private pinToScreen(object: Phaser.GameObjects.GameObject): void {
    const pinned = object as Phaser.GameObjects.GameObject & {
      setScrollFactor?: (value: number) => unknown;
      setDepth?: (value: number) => unknown;
    };
    pinned.setScrollFactor?.(0);
    pinned.setDepth?.(HUD_DEPTH);
  }

  private updateCounter(): void {
    const total = this.world.treasures.length;
    this.counterText.setText(`${this.foundIds.size} из ${total}`);
    this.world.treasures.forEach((spec, index) => {
      const dot = this.dots[index];
      if (dot === undefined) return;
      const found = this.foundIds.has(spec.id);
      dot.setFillStyle(found ? PALETTE.gold : PALETTE.uiButtonCalm);
    });
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      if (this.busy) return;
      if (this.isOverHud(pointer.x, pointer.y)) return;
      this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
      this.showTapMark(pointer.worldX, pointer.worldY);
    });

    this.input.keyboard?.on('keydown', () => audio.unlock());
  }

  private isOverHud(x: number, y: number): boolean {
    for (const zone of this.hudZones) {
      if (zone.radius > 0 && Math.hypot(x - zone.x, y - zone.y) <= zone.radius) return true;
    }
    const panel = this.hudPanel;
    return (
      Math.abs(x - panel.x) <= panel.width / 2 + 10 && Math.abs(y - panel.y) <= panel.height / 2 + 10
    );
  }

  private showTapMark(x: number, y: number): void {
    this.tweens.killTweensOf(this.tapMark);
    // Метку ставим чуть «выше» травы в той же точке, чтобы её не съел декор.
    this.tapMark.setPosition(x, y).setDepth(y + 1).setVisible(true).setAlpha(0.9).setScale(0.6);
    this.tweens.add({
      targets: this.tapMark,
      scale: 1.1,
      alpha: 0,
      duration: 650,
      ease: 'Sine.easeOut',
      onComplete: () => this.tapMark.setVisible(false),
    });
  }

  // --- каждый кадр -------------------------------------------------------

  private updateMovement(time: number, delta: number): void {
    if (this.busy) {
      this.dino.setWalking(false);
      return;
    }

    if (this.controls.actionJustPressed) this.actionButton.press();

    const direction = this.controls.direction;
    let vx = 0;
    let vy = 0;

    if (direction.x !== 0 || direction.y !== 0) {
      this.moveTarget = null;
      vx = direction.x;
      vy = direction.y;
    } else if (this.moveTarget !== null) {
      const dx = this.moveTarget.x - this.dinoX;
      const dy = this.moveTarget.y - this.dinoY;
      const distance = Math.hypot(dx, dy);
      if (distance <= CONFIG.dino.arriveDistance) {
        this.moveTarget = null;
      } else {
        vx = dx / distance;
        vy = dy / distance;
      }
    }

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const length = Math.hypot(vx, vy);
      // Шаг ограничен размером тела: на слабом планшете при просадке кадров
      // диплодок иначе мог бы «перепрыгнуть» ствол целиком.
      const step = Math.min((CONFIG.dino.speed * delta) / 1000, CONFIG.dino.bodyRadius * 0.8);
      const inset = CONFIG.world.margin * 0.5;
      const nextX = clamp(this.dinoX + (vx / length) * step, inset, this.world.width - inset);
      const nextY = clamp(
        this.dinoY + (vy / length) * step * VERTICAL_SPEED_FACTOR,
        inset + 40,
        this.world.height - inset,
      );
      const resolved = pushOutOfObstacles(nextX, nextY, CONFIG.dino.bodyRadius, this.obstacles);
      this.dinoX = resolved.x;
      this.dinoY = resolved.y;

      if (time > this.nextStepAt) {
        audio.play('step', { volume: 0.45 });
        this.nextStepAt = time + STEP_SOUND_INTERVAL;
      }
    }

    this.dino.setPosition(this.dinoX, this.dinoY);
    this.dino.root.setDepth(this.dinoY);
    this.dino.setWalking(moving, vx);
  }

  /** Клад считается «активным», пока не найден; секретный — только когда найдено всё. */
  private isActive = (spec: { id: string; kind: TreasureKind }): boolean => {
    if (this.foundIds.has(spec.id)) return false;
    return spec.kind !== 'secret' || this.secretLit;
  };

  private updateHint(time: number): void {
    const state = computeHotCold(
      this.dinoX,
      this.dinoY,
      this.world.treasures,
      this.isActive,
      this.level.hintMaxDistance,
    );
    this.dino.setHintIntensity(state.intensity);

    if (this.busy || !Number.isFinite(state.beepIntervalMs)) return;
    if (time <= this.nextBeepAt) return;
    audio.play('beep', {
      pitch: 0.85 + state.intensity * 1.5,
      volume: 0.2 + state.intensity * 0.45,
    });
    this.nextBeepAt = time + state.beepIntervalMs;
  }

  /** Подошёл к белке — она подпрыгивает и показывает лапкой на ближайший клад. */
  private updateSquirrels(time: number, delta: number): void {
    for (const squirrel of this.squirrels) {
      squirrel.update(time, delta);
      if (this.busy || time < this.nextSquirrelAt || squirrel.pointing) continue;
      if (Math.hypot(squirrel.x - this.dinoX, squirrel.y - this.dinoY) > SQUIRREL_RADIUS) continue;

      const target = this.nearestActive();
      if (target === null) continue;
      squirrel.point(Math.atan2(target.spec.y - squirrel.y, target.spec.x - squirrel.x));
      audio.play('tap', { pitch: 2.4, volume: 0.5 });
      this.nextSquirrelAt = time + 4000;
    }
  }

  private nearestActive(): Treasure | null {
    let best: Treasure | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const treasure of this.treasures) {
      if (!this.isActive(treasure.spec)) continue;
      const d = Math.hypot(treasure.spec.x - this.dinoX, treasure.spec.y - this.dinoY);
      if (d < bestDistance) {
        best = treasure;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Кнопка действия сама подстраивается под вид ближайшего клада. */
  private updateActionButton(): void {
    const near = this.busy ? this.activeTreasure : this.findActionable();
    if (near !== this.activeTreasure) {
      this.activeTreasure?.setSpotVisible(false);
      this.activeTreasure = near;
      near?.setSpotVisible(true);
    }

    const enabled = near !== null && !this.busy;
    const icon = near === null ? TEX.ICON_SHOVEL : ACTION_ICON[near.spec.kind];

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

  private findActionable(): Treasure | null {
    let best: Treasure | null = null;
    let bestDistance: number = CONFIG.treasures.actionRadius;
    for (const treasure of this.treasures) {
      if (!this.isActive(treasure.spec)) continue;
      const distance = Math.hypot(treasure.spec.x - this.dinoX, treasure.spec.y - this.dinoY);
      if (distance <= bestDistance) {
        best = treasure;
        bestDistance = distance;
      }
    }
    return best;
  }

  // --- действия ----------------------------------------------------------

  private performAction(): void {
    if (this.busy) return;
    const treasure = this.activeTreasure;
    if (treasure === null || treasure.found) return;

    switch (treasure.spec.kind) {
      case 'ground':
        this.dino.playDigStroke();
        audio.play('dig');
        audio.play('dirt', { volume: 0.6 });
        if (treasure.dig()) void this.revealTreasure(treasure, false);
        return;
      case 'tree':
        void this.pickFromTree(treasure);
        return;
      case 'rock':
        void this.pushRock(treasure);
        return;
      case 'water':
        void this.diveForTreasure(treasure);
        return;
      case 'secret':
        void this.revealTreasure(treasure, false);
        return;
    }
  }

  /** Фирменная механика: диплодок тянет шею в крону и достаёт сундучок. */
  private async pickFromTree(treasure: Treasure): Promise<void> {
    this.startAction();
    audio.play('whoosh');

    const reach = this.dino.reachToCrown(treasure.spec.crownX, treasure.spec.crownY);
    await this.wait(760);
    await treasure.popChest();
    audio.play('chest', { volume: 0.7 });
    await reach;
    await treasure.moveChestTo(this.dinoX + 40, this.dinoY + 6);
    await this.revealTreasure(treasure, true);
  }

  /** Толкнуть камень головой: камень откатывается, под ним сундучок. */
  private async pushRock(treasure: Treasure): Promise<void> {
    this.startAction();
    const push = this.dino.playPush(treasure.spec.crownX);
    await this.wait(400);
    audio.play('dig', { pitch: 0.7 });

    const rock = this.decorObjects[treasure.spec.decorIndex];
    if (rock !== undefined) {
      const away = treasure.spec.crownX >= this.dinoX ? 1 : -1;
      // Камень больше не мешает ходить.
      if (rock.obstacle !== null) rock.obstacle.radius = 0;
      this.tweens.add({
        targets: rock.image,
        x: rock.image.x + 110 * away,
        angle: 55 * away,
        duration: 620,
        ease: 'Cubic.easeOut',
      });
      const dust = this.add.particles(rock.image.x, rock.image.y, TEX.DIRT_CHUNK, {
        speed: { min: 60, max: 170 },
        angle: { min: 200, max: 340 },
        gravityY: 700,
        lifespan: 600,
        scale: { start: 0.9, end: 0.4 },
        quantity: 8,
        emitting: false,
      });
      dust.setDepth(rock.image.y + 1);
      dust.explode(8);
      this.time.delayedCall(800, () => dust.destroy());
    }

    await push;
    await treasure.popChest();
    audio.play('chest', { volume: 0.8 });
    await this.revealTreasure(treasure, true);
  }

  /** Опустить голову в ручей и достать клад со дна. */
  private async diveForTreasure(treasure: Treasure): Promise<void> {
    this.startAction();
    audio.play('whoosh', { volume: 0.8 });

    const dip = this.dino.playDip(treasure.spec.crownX, treasure.spec.crownY);
    await this.wait(420);
    treasure.splash();
    audio.play('dirt', { volume: 0.5, pitch: 1.6 });
    await this.wait(300);
    await treasure.popChest();
    audio.play('chest', { volume: 0.7 });
    await dip;
    await treasure.moveChestTo(this.dinoX + 40, this.dinoY + 6);
    await this.revealTreasure(treasure, true);
  }

  private startAction(): void {
    this.busy = true;
    this.moveTarget = null;
    this.dino.setWalking(false);
  }

  private async revealTreasure(treasure: Treasure, chestReady: boolean): Promise<void> {
    this.startAction();

    if (!chestReady) {
      await treasure.popChest();
      audio.play('chest', { volume: 0.8 });
    }
    treasure.openChest();
    this.dino.playJoy();
    audio.play(treasure.spec.kind === 'secret' ? 'win' : 'fanfare');
    await this.wait(320);

    // Предмет крупно в центре экрана: главное событие игры.
    const item = getTreasureItem(treasure.spec.itemId);
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2 - 40;
    const secret = treasure.spec.kind === 'secret';

    const glow = this.add
      .image(centerX, centerY, TEX.GLOW)
      .setScrollFactor(0)
      .setDepth(REVEAL_DEPTH - 1)
      .setTint(PALETTE.gold)
      .setAlpha(0);
    const picture = this.add
      .image(centerX, centerY, itemTexture(treasure.spec.itemId))
      .setScrollFactor(0)
      .setDepth(REVEAL_DEPTH)
      .setScale(0.2)
      .setAlpha(0);
    const label = createText(this, centerX, centerY + 180, item.name, CONFIG.ui.fontSizeBig);
    label.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(REVEAL_DEPTH).setAlpha(0);

    this.tweens.add({
      targets: glow,
      alpha: secret ? 0.7 : 0.5,
      scale: secret ? 3.4 : 2.6,
      duration: 500,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: picture,
      scale: secret ? 1.3 : 1.05,
      alpha: 1,
      duration: 420,
      ease: 'Back.easeOut',
    });
    this.tweens.add({ targets: label, alpha: 1, duration: 360, delay: 160 });
    const wobble = this.tweens.add({
      targets: picture,
      angle: { from: -4, to: 4 },
      duration: 900,
      delay: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    await this.wait(CONFIG.treasures.revealMs);

    // ...и улетает в рюкзак.
    wobble.remove();
    this.tweens.add({ targets: glow, alpha: 0, duration: 300, onComplete: () => glow.destroy() });
    this.tweens.add({ targets: label, alpha: 0, duration: 260, onComplete: () => label.destroy() });
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: picture,
        x: this.backpackPoint.x,
        y: this.backpackPoint.y,
        angle: 0,
        scale: 0.16,
        alpha: 0.85,
        duration: 620,
        ease: 'Cubic.easeIn',
        onComplete: () => resolve(),
      });
    });
    picture.destroy();
    audio.play('found');
    this.tweens.add({
      targets: this.backpackButton.container,
      scale: 1.22,
      duration: 150,
      yoyo: true,
      ease: 'Sine.easeOut',
    });

    treasure.collect();
    this.foundIds.add(treasure.spec.id);
    save.saveLevelFound(this.level.number, [...this.foundIds]);
    save.addToCollection([treasure.spec.itemId]);
    this.updateCounter();
    this.activeTreasure = null;
    this.busy = false;

    if (secret) {
      save.markLevelComplete(this.level.number);
      await this.wait(700);
      this.scene.start(SCENE.VICTORY, {
        level: this.level.number,
        itemIds: this.world.itemIds.filter((id) => id !== SECRET_ITEM_ID),
        crownItemId: SECRET_ITEM_ID,
      });
      return;
    }
    this.refreshSecret();
  }

  /** Когда найдено всё обычное — в лесу зажигается секретный сундук. */
  private refreshSecret(): void {
    if (this.secretLit) return;
    const regularLeft = this.world.treasures.some(
      (spec) => spec.kind !== 'secret' && !this.foundIds.has(spec.id),
    );
    if (regularLeft) return;

    this.secretLit = true;
    const secret = this.treasures.find((treasure) => treasure.spec.kind === 'secret');
    if (secret === undefined || secret.found) return;
    secret.lightBeacon();
    audio.play('found', { pitch: 0.7 });
  }

  private openCollection(): void {
    if (this.busy) return;
    const foundItemIds = this.world.treasures
      .filter((spec) => this.foundIds.has(spec.id))
      .map((spec) => spec.itemId);
    this.scene.pause();
    this.scene.launch(SCENE.COLLECTION, {
      level: this.level.number,
      itemIds: this.world.itemIds,
      foundItemIds,
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private cleanup(): void {
    this.controls.destroy();
    for (const treasure of this.treasures) treasure.destroy();
    for (const squirrel of this.squirrels) squirrel.destroy();
    this.critters?.destroy();
    this.critters = null;
    this.treasures.length = 0;
    this.squirrels.length = 0;
    this.obstacles.length = 0;
    this.decorObjects = [];
    this.dino.destroy();
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
