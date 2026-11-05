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
import { TEX } from '../art/keys';
import { themeTexture, THEMES } from '../art/themes';
import { ForestHud } from './ForestHud';
import { addFallingLeaves, addNightVeil } from './forestWeather';
import { showFound } from './forestReveal';
import { audio } from '../audio/AudioEngine';
import { CONFIG } from '../config';
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
/** Какая иконка на кнопке действия для каждого вида клада. */
const ACTION_ICON: Record<TreasureKind, string> = {
  ground: TEX.ICON_SHOVEL,
  tree: TEX.ICON_LEAF,
  rock: TEX.ICON_PUSH,
  water: TEX.ICON_WATER,
  secret: TEX.ICON_CROWN,
};

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
  private hud!: ForestHud;
  private tapMark!: Phaser.GameObjects.Image;

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
    addNightVeil(this, this.level.theme);

    this.controls = new Controls(this);
    this.hud = new ForestHud(this, {
      levelNumber: this.level.number,
      treasureCount: this.world.treasures.length,
      onAction: () => this.performAction(),
      onBackpack: () => this.openCollection(),
      onBack: () => this.leaveToLevels(),
    });
    this.bindInput();
    this.showProgress();
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
    if (theme.fallingLeaves) addFallingLeaves(this);
  }

  /** Осенний листопад: частицы в экранных координатах, чтобы листья всегда были в кадре. */
  // --- интерфейс ---------------------------------------------------------

  /** Какие клады уже найдены — в том же порядке, что точки в панели. */
  private showProgress(): void {
    this.hud.showProgress(this.world.treasures.map((spec) => this.foundIds.has(spec.id)));
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      if (this.busy) return;
      if (this.hud.isOver(pointer.x, pointer.y)) return;
      this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
      this.showTapMark(pointer.worldX, pointer.worldY);
    });

    this.input.keyboard?.on('keydown', () => audio.unlock());
    // Esc — тот же выход, что и стрелка: на клавиатуре играют так же часто.
    this.input.keyboard?.on('keydown-ESC', () => this.leaveToLevels());
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

    if (this.controls.actionJustPressed) this.hud.pressAction();

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

    this.hud.setAction(icon, enabled);
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
    await showFound(this, {
      itemId: treasure.spec.itemId,
      name: getTreasureItem(treasure.spec.itemId).name,
      secret: treasure.spec.kind === 'secret',
      target: this.hud.backpackPoint,
    });
    this.hud.bumpBackpack();

    treasure.collect();
    this.foundIds.add(treasure.spec.id);
    save.saveLevelFound(this.level.number, [...this.foundIds]);
    save.addToCollection([treasure.spec.itemId]);
    this.showProgress();
    this.activeTreasure = null;
    this.busy = false;

    if (treasure.spec.kind === 'secret') {
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

  /**
   * Выход из леса в «Выбери лес». Найденные клады уже сохранены — после каждой
   * находки, — так что уходить можно в любой момент и ничего не теряется.
   * Во время находки или копания выход закрыт: анимация должна доиграть.
   */
  private leaveToLevels(): void {
    if (this.busy) return;
    this.busy = true;
    audio.unlock();
    this.dino.setWalking(false);
    this.scene.start(SCENE.LEVELS);
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
