/**
 * Клад. Четыре обычных вида — в земле (копать), в кроне (тянуть шею),
 * под камнем (толкнуть) и в ручье (опустить голову в воду), плюс секретный,
 * который зажигается, когда найдено всё остальное.
 *
 * Класс хранит состояние и свои картинки, а порядок событий («что за чем»)
 * дирижирует сцена леса.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import type { TreasureSpec } from '../systems/worldGen';

export class Treasure {
  readonly spec: TreasureSpec;
  found: boolean;

  private readonly scene: Phaser.Scene;
  private readonly digTaps: number;
  private spot: Phaser.GameObjects.Image | null = null;
  private spotTween: Phaser.Tweens.Tween | null = null;
  private chest: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private beacon: Phaser.GameObjects.Image | null = null;
  private digs = 0;

  constructor(scene: Phaser.Scene, spec: TreasureSpec, found: boolean, digTaps: number) {
    this.scene = scene;
    this.spec = spec;
    this.found = found;
    this.digTaps = digTaps;
  }

  /** Сколько раз ещё копать. */
  get digsLeft(): number {
    return Math.max(0, this.digTaps - this.digs);
  }

  /**
   * Показать/спрятать пятно рыхлой земли — единственная подсказка,
   * что копать нужно именно здесь. Только для кладов в земле.
   */
  setSpotVisible(visible: boolean): void {
    if (!visible) {
      this.hideSpot();
      return;
    }
    if (this.found || this.spec.kind !== 'ground' || this.spot !== null) return;

    const spot = this.scene.add.image(this.spec.x, this.spec.y, TEX.DIG_SPOT);
    spot.setDepth(this.spec.y - 2).setAlpha(0.9);
    this.spot = spot;
    this.spotTween = this.scene.tweens.add({
      targets: spot,
      scaleX: 1.06,
      scaleY: 1.06,
      alpha: 1,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.applyDigLook();
  }

  /**
   * Секретный клад зажигается золотым столбом света, когда найдено всё
   * остальное: ребёнок видит его издалека и понимает, что лес ещё не кончился.
   */
  lightBeacon(): void {
    if (this.found || this.beacon !== null) return;
    const beacon = this.scene.add.image(this.spec.x, this.spec.y - 70, TEX.GLOW);
    beacon.setDepth(this.spec.y - 3).setTint(PALETTE.gold).setAlpha(0).setScale(0.8);
    this.beacon = beacon;
    this.scene.tweens.add({ targets: beacon, alpha: 0.75, scale: 2.4, duration: 600, ease: 'Sine.easeOut' });
    this.scene.tweens.add({
      targets: beacon,
      scaleX: 2.8,
      scaleY: 2.8,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 600,
    });

    const sparks = this.scene.add.particles(this.spec.x, this.spec.y, TEX.SPARKLE, {
      speed: { min: 20, max: 70 },
      angle: { min: 250, max: 290 },
      lifespan: 1600,
      scale: { start: 0.9, end: 0 },
      frequency: 260,
      quantity: 1,
    });
    sparks.setDepth(this.spec.y - 1);
    this.sparksEmitter = sparks;
  }

  private sparksEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  /** Один взмах лопатой. true — пора открывать сундук. */
  dig(): boolean {
    if (this.found) return false;
    this.digs += 1;
    this.applyDigLook();
    this.throwDirt();
    return this.digs >= this.digTaps;
  }

  /** Брызги, когда диплодок опускает голову в ручей. */
  splash(): void {
    const drops = this.scene.add.particles(this.spec.crownX, this.spec.crownY, TEX.SPLASH, {
      speed: { min: 110, max: 240 },
      angle: { min: 225, max: 315 },
      gravityY: 800,
      lifespan: 800,
      scale: { start: 1.1, end: 0.5 },
      rotate: { min: -40, max: 40 },
      quantity: 12,
      emitting: false,
    });
    drops.setDepth(this.spec.crownY + 2);
    drops.explode(12);
    this.scene.time.delayedCall(1100, () => drops.destroy());
  }

  /** Где именно появится сундучок. */
  private chestAnchor(): { x: number; y: number } {
    switch (this.spec.kind) {
      case 'tree':
      case 'water':
        return { x: this.spec.crownX, y: this.spec.crownY };
      case 'rock':
        return { x: this.spec.crownX, y: this.spec.crownY + 30 };
      default:
        return { x: this.spec.x, y: this.spec.y };
    }
  }

  /** Сундук появляется. */
  popChest(): Promise<void> {
    const anchor = this.chestAnchor();
    const chest = this.scene.add.image(anchor.x, anchor.y + 24, TEX.CHEST_CLOSED);
    chest.setOrigin(0.5, 1).setScale(0.35).setAlpha(0).setDepth(this.spec.y + 2);
    if (this.spec.kind === 'secret') chest.setTint(PALETTE.gold);
    this.chest = chest;

    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: chest,
        y: anchor.y,
        scale: 1,
        alpha: 1,
        duration: 420,
        ease: 'Back.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  /** Перенести сундук к ногам диплодока (с дерева или из воды). */
  moveChestTo(x: number, y: number): Promise<void> {
    const chest = this.chest;
    if (chest === null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: chest,
        x,
        y,
        duration: 520,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          chest.setDepth(y + 2);
          resolve();
        },
      });
    });
  }

  /** Крышка откидывается, из сундука бьёт свет. */
  openChest(): void {
    const chest = this.chest;
    if (chest === null) return;
    chest.setTexture(TEX.CHEST_OPEN);

    const glow = this.scene.add.image(chest.x, chest.y - 60, TEX.GLOW);
    glow.setDepth(chest.depth - 1).setTint(PALETTE.gold).setAlpha(0).setScale(0.6);
    this.glow = glow;
    this.scene.tweens.add({ targets: glow, alpha: 0.6, scale: 2.2, duration: 450, ease: 'Sine.easeOut' });
    this.scene.tweens.add({
      targets: chest,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 160,
      yoyo: true,
      ease: 'Sine.easeOut',
    });

    const sparkles = this.scene.add.particles(chest.x, chest.y - 70, TEX.SPARKLE, {
      speed: { min: 60, max: 180 },
      angle: { min: 200, max: 340 },
      gravityY: 140,
      lifespan: 900,
      scale: { start: 1, end: 0 },
      quantity: 14,
      emitting: false,
    });
    sparkles.setDepth(chest.depth + 1);
    sparkles.explode(14);
    this.scene.time.delayedCall(1200, () => sparkles.destroy());
  }

  /** Клад забран: убрать пятно, маяк и сундук. */
  collect(): void {
    this.found = true;
    this.hideSpot();
    this.stopBeacon();

    const chest = this.chest;
    const glow = this.glow;
    if (glow !== null) {
      this.scene.tweens.add({ targets: glow, alpha: 0, duration: 400, onComplete: () => glow.destroy() });
      this.glow = null;
    }
    if (chest !== null) {
      this.scene.tweens.add({
        targets: chest,
        alpha: 0,
        scale: 0.8,
        duration: 400,
        delay: 200,
        onComplete: () => chest.destroy(),
      });
      this.chest = null;
    }
  }

  destroy(): void {
    this.hideSpot();
    this.stopBeacon();
    this.chest?.destroy();
    this.glow?.destroy();
    this.chest = null;
    this.glow = null;
  }

  private stopBeacon(): void {
    const beacon = this.beacon;
    if (beacon !== null) {
      this.scene.tweens.killTweensOf(beacon);
      beacon.destroy();
      this.beacon = null;
    }
    this.sparksEmitter?.destroy();
    this.sparksEmitter = null;
  }

  private hideSpot(): void {
    this.spotTween?.remove();
    this.spotTween = null;
    this.spot?.destroy();
    this.spot = null;
  }

  /** Чем больше копали, тем глубже и темнее ямка. */
  private applyDigLook(): void {
    const spot = this.spot;
    if (spot === null) return;
    const progress = this.digs / this.digTaps;
    spot.setTint(progress > 0 ? PALETTE.soilDark : PALETTE.soil);
    spot.setDisplaySize(spot.width * (1 + progress * 0.25), spot.height * (1 + progress * 0.25));
  }

  private throwDirt(): void {
    const dirt = this.scene.add.particles(this.spec.x, this.spec.y - 10, TEX.DIRT_CHUNK, {
      speed: { min: 120, max: 260 },
      angle: { min: 215, max: 325 },
      gravityY: 900,
      lifespan: 700,
      scale: { start: 1.1, end: 0.5 },
      rotate: { min: -180, max: 180 },
      quantity: 10,
      emitting: false,
    });
    dirt.setDepth(this.spec.y + 1);
    dirt.explode(10);
    this.scene.time.delayedCall(900, () => dirt.destroy());
  }
}
