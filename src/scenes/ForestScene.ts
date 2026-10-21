/**
 * Главная сцена: лес, диплодок, клады.
 *
 * Правила сцены:
 * - проиграть нельзя, таймеров нет, подсказка всегда доступна;
 * - одна большая кнопка действия сама понимает, копать или тянуться к дереву;
 * - пока идёт находка (busy), управление отключено, чтобы ребёнок не сбил анимацию.
 */
import Phaser from 'phaser';
import { itemTexture, TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { createPanel, createRoundButton, createText, type RoundButton } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../config';
import { getTreasureItem } from '../data/treasures';
import { Diplodocus } from '../entities/Diplodocus';
import { createForestObject, pushOutOfObstacles, type Obstacle } from '../entities/ForestObject';
import { Treasure } from '../entities/Treasure';
import { Controls } from '../systems/controls';
import { computeHotCold } from '../systems/hotCold';
import { save } from '../systems/save';
import { generateWorld, type WorldData } from '../systems/worldGen';
import { SCENE, type ForestSceneData } from '../types';

/** Клавиатурное движение по вертикали чуть медленнее — псевдо-перспектива вида сверху-сбоку. */
const VERTICAL_SPEED_FACTOR = 0.78;
const STEP_SOUND_INTERVAL = 330;

/**
 * Глубина у объектов леса равна их координате y (до 2160), поэтому интерфейс
 * и экран находки живут заведомо выше — иначе их закрывают деревья.
 */
const HUD_DEPTH = 100000;
const REVEAL_DEPTH = 200000;

interface HudZone {
  x: number;
  y: number;
  radius: number;
}

export class ForestScene extends Phaser.Scene {
  private world!: WorldData;
  private dino!: Diplodocus;
  private controls!: Controls;

  private readonly obstacles: Obstacle[] = [];
  private readonly treasures: Treasure[] = [];
  private foundIds = new Set<string>();

  private dinoX = 0;
  private dinoY = 0;
  private moveTarget: { x: number; y: number } | null = null;
  private busy = false;

  private nextBeepAt = 0;
  private nextStepAt = 0;

  private activeTreasure: Treasure | null = null;
  private actionIcon = '';
  private actionEnabled = false;

  private actionButton!: RoundButton;
  private backpackButton!: RoundButton;
  private soundButton!: RoundButton;
  private counterText!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private tapMark!: Phaser.GameObjects.Image;
  private readonly hudZones: HudZone[] = [];
  private backpackPoint = { x: 0, y: 0 };
  private hudPanel = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    super(SCENE.FOREST);
  }

  create(data: ForestSceneData): void {
    const saved = save.loadProgress();
    const seed = data?.seed ?? saved?.seed ?? CONFIG.defaultSeed;

    this.world = generateWorld(seed);
    this.foundIds = new Set(saved !== null && saved.seed === seed ? saved.found : []);
    save.saveProgress({ seed, found: [...this.foundIds] });

    this.buildGround();
    this.buildDecor();
    this.buildTreasures();

    this.dinoX = this.world.startX;
    this.dinoY = this.world.startY;
    this.dino = new Diplodocus(this, this.dinoX, this.dinoY);
    this.dino.root.setDepth(this.dinoY);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor(PALETTE.grassMid);
    this.cameras.main.startFollow(this.dino.root, true, CONFIG.camera.lerp, CONFIG.camera.lerp);

    this.tapMark = this.add.image(0, 0, TEX.TAP_MARK).setVisible(false);

    this.controls = new Controls(this);
    this.buildHud();
    this.bindInput();
    this.updateCounter();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  override update(time: number, delta: number): void {
    this.updateMovement(time, delta);
    this.updateHint(time);
    this.updateActionButton();
    this.dino.update(time, delta);
  }

  // --- построение мира ---------------------------------------------------

  private buildGround(): void {
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, TEX.GROUND)
      .setOrigin(0, 0)
      .setDepth(-20);

    const stream = this.add.graphics().setDepth(-15);
    const points = this.world.stream;
    stream.lineStyle(104, PALETTE.waterDark, 1);
    stream.strokePoints(points, false);
    stream.lineStyle(84, PALETTE.water, 1);
    stream.strokePoints(points, false);
    stream.lineStyle(22, PALETTE.waterLight, 0.65);
    stream.strokePoints(
      points.map((point) => ({ x: point.x - 14, y: point.y })),
      false,
    );
  }

  private buildDecor(): void {
    for (const spec of this.world.decor) {
      const object = createForestObject(this, spec);
      if (object.obstacle !== null) this.obstacles.push(object.obstacle);
    }
  }

  private buildTreasures(): void {
    for (const spec of this.world.treasures) {
      this.treasures.push(new Treasure(this, spec, this.foundIds.has(spec.id)));
    }
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

    // Звук — слева сверху.
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

    // Справа сверху — счётчик «сколько из восьми» и рюкзак.
    const panelWidth = 410;
    const panelHeight = 136;
    const panelX = GAME_WIDTH - panelWidth / 2 - pad * 0.6;
    const panelY = panelHeight / 2 + pad * 0.6;
    const panel = createPanel(this, panelX, panelY, panelWidth, panelHeight);
    this.pinToScreen(panel);

    this.counterText = createText(
      this,
      panelX - 70,
      panelY - 16,
      '',
      CONFIG.ui.fontSizeBig,
      PALETTE.uiText,
    );
    this.counterText.setOrigin(0.5, 0.5);
    this.pinToScreen(this.counterText);

    const dotsCenterX = panelX - 70;
    const dotsY = panelY + 44;
    const spacing = 30;
    const total = this.world.treasures.length;
    this.dots = [];
    for (let i = 0; i < total; i += 1) {
      const dot = this.add.circle(
        dotsCenterX + (i - (total - 1) / 2) * spacing,
        dotsY,
        11,
        PALETTE.uiButtonCalm,
      );
      this.pinToScreen(dot);
      this.dots.push(dot);
    }

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
      dot.setFillStyle(this.foundIds.has(spec.id) ? PALETTE.gold : PALETTE.uiButtonCalm);
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
      const nextX = clamp(this.dinoX + (vx / length) * step, inset, WORLD_WIDTH - inset);
      const nextY = clamp(
        this.dinoY + (vy / length) * step * VERTICAL_SPEED_FACTOR,
        inset + 40,
        WORLD_HEIGHT - inset,
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

  private updateHint(time: number): void {
    const state = computeHotCold(this.dinoX, this.dinoY, this.world.treasures, (id) =>
      this.foundIds.has(id),
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

  /** Кнопка действия сама подстраивается: лопата, веточка или «пока нечего». */
  private updateActionButton(): void {
    const near = this.busy ? this.activeTreasure : this.findActionable();
    if (near !== this.activeTreasure) {
      this.activeTreasure?.setSpotVisible(false);
      this.activeTreasure = near;
      near?.setSpotVisible(true);
    }

    const enabled = near !== null && !this.busy;
    const icon = near?.spec.kind === 'tree' ? TEX.ICON_LEAF : TEX.ICON_SHOVEL;

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
      if (treasure.found) continue;
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

    if (treasure.spec.kind === 'ground') {
      this.dino.playDigStroke();
      audio.play('dig');
      audio.play('dirt', { volume: 0.6 });
      if (treasure.dig()) void this.revealTreasure(treasure, false);
      return;
    }
    void this.pickFromTree(treasure);
  }

  /** Фирменная механика: диплодок тянет шею в крону и достаёт сундучок. */
  private async pickFromTree(treasure: Treasure): Promise<void> {
    this.busy = true;
    this.moveTarget = null;
    this.dino.setWalking(false);
    audio.play('whoosh');

    const reach = this.dino.reachToCrown(treasure.spec.crownX, treasure.spec.crownY);
    await this.wait(760);
    await treasure.popChest();
    audio.play('chest', { volume: 0.7 });
    await reach;
    await treasure.moveChestTo(this.dinoX + 40, this.dinoY + 6);
    await this.revealTreasure(treasure, true);
  }

  private async revealTreasure(treasure: Treasure, chestReady: boolean): Promise<void> {
    this.busy = true;
    this.dino.setWalking(false);

    if (!chestReady) {
      await treasure.popChest();
      audio.play('chest', { volume: 0.8 });
    }
    treasure.openChest();
    this.dino.playJoy();
    audio.play('fanfare');
    await this.wait(320);

    // Предмет крупно в центре экрана: главное событие игры.
    const item = getTreasureItem(treasure.spec.itemId);
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2 - 40;

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

    this.tweens.add({ targets: glow, alpha: 0.5, scale: 2.6, duration: 500, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: picture, scale: 1.05, alpha: 1, duration: 420, ease: 'Back.easeOut' });
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
    save.saveProgress({ seed: this.world.seed, found: [...this.foundIds] });
    save.addToCollection([treasure.spec.itemId]);
    this.updateCounter();
    this.activeTreasure = null;
    this.busy = false;

    if (this.foundIds.size >= this.world.treasures.length) {
      await this.wait(800);
      this.scene.start(SCENE.VICTORY, { itemIds: this.world.itemIds });
    }
  }

  private openCollection(): void {
    if (this.busy) return;
    const foundItemIds = this.world.treasures
      .filter((spec) => this.foundIds.has(spec.id))
      .map((spec) => spec.itemId);
    this.scene.pause();
    this.scene.launch(SCENE.COLLECTION, { itemIds: this.world.itemIds, foundItemIds });
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private cleanup(): void {
    this.controls.destroy();
    for (const treasure of this.treasures) treasure.destroy();
    this.treasures.length = 0;
    this.obstacles.length = 0;
    this.dino.destroy();
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
