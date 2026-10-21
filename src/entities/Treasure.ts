/**
 * Клад: либо зарыт в земле (нужно копать), либо спрятан в кроне дерева
 * (диплодок тянет шею). Хранит своё состояние и свои картинки,
 * а порядок событий («что за чем») дирижирует сцена леса.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { CONFIG } from '../config';
import type { TreasureSpec } from '../systems/worldGen';

export class Treasure {
  readonly spec: TreasureSpec;
  found: boolean;

  private readonly scene: Phaser.Scene;
  private spot: Phaser.GameObjects.Image | null = null;
  private spotTween: Phaser.Tweens.Tween | null = null;
  private chest: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private digs = 0;

  constructor(scene: Phaser.Scene, spec: TreasureSpec, found: boolean) {
    this.scene = scene;
    this.spec = spec;
    this.found = found;
  }

  /** Сколько раз ещё копать. */
  get digsLeft(): number {
    return Math.max(0, CONFIG.treasures.digTaps - this.digs);
  }

  /**
   * Показать/спрятать пятно рыхлой земли — единственная подсказка,
   * что копать нужно именно здесь. Только для кладов в земле.
   */
  setSpotVisible(visible: boolean): void {
    if (this.found || this.spec.kind !== 'ground') return;

    if (!visible) {
      this.hideSpot();
      return;
    }
    if (this.spot !== null) return;

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

  /** Один взмах лопатой. true — пора открывать сундук. */
  dig(): boolean {
    if (this.found) return false;
    this.digs += 1;
    this.applyDigLook();
    this.throwDirt();
    return this.digs >= CONFIG.treasures.digTaps;
  }

  /** Сундук появляется: из земли или в кроне дерева. */
  popChest(): Promise<void> {
    const fromTree = this.spec.kind === 'tree';
    const x = fromTree ? this.spec.crownX : this.spec.x;
    const y = fromTree ? this.spec.crownY : this.spec.y;

    const chest = this.scene.add.image(x, y + 24, TEX.CHEST_CLOSED);
    chest.setOrigin(0.5, 1).setScale(0.35).setAlpha(0).setDepth(this.spec.y + 2);
    this.chest = chest;

    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: chest,
        y,
        scale: 1,
        alpha: 1,
        duration: 420,
        ease: 'Back.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  /** Перенести сундук с дерева к ногам диплодока. */
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
    this.scene.tweens.add({ targets: glow, alpha: 0.85, scale: 2.2, duration: 450, ease: 'Sine.easeOut' });
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

  /** Убрать пятно рыхлой земли. */
  private hideSpot(): void {
    this.spotTween?.remove();
    this.spotTween = null;
    this.spot?.destroy();
    this.spot = null;
  }

  /** Клад забран: убрать пятно и спрятать сундук. */
  collect(): void {
    this.found = true;
    this.hideSpot();

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
    this.spotTween?.remove();
    this.spot?.destroy();
    this.chest?.destroy();
    this.glow?.destroy();
    this.spot = null;
    this.chest = null;
    this.glow = null;
  }

  /** Чем больше копали, тем глубже и темнее ямка. */
  private applyDigLook(): void {
    const spot = this.spot;
    if (spot === null) return;
    const progress = this.digs / CONFIG.treasures.digTaps;
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
