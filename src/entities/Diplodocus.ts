/**
 * Диплодок — главный герой. Большой, добрый, с длинной живой шеей.
 *
 * Устройство: root (точка привязки — лапы на земле) → rig (прыжок) → части тела.
 * Голова живёт в отдельном под-контейнере и анимируется твинами, а шея каждый
 * кадр перерисовывается от плеча к голове. Поэтому шея «настоящая»: её можно
 * вытянуть к кроне дерева или уткнуть в землю при копании.
 *
 * Про физику сущность не знает: позицию задаёт сцена через setPosition.
 */

import Phaser from 'phaser';
import { DINO_GEOM, DINO_TEX, drawNeck, generateDiplodocusTextures } from '../art/diplodocus';
import { PALETTE } from '../art/palette';

/** Длительности анимаций, мс. */
const WALK_STEP_MS = 280;
const TURN_MS = 140;
const RETURN_MS = 220;
const BLINK_MS = 120;
const JOY_MS = 900;
const DIG_MS = 420;
const REACH_UP_MS = 700;
const REACH_HOLD_MS = 400;
const REACH_BACK_MS = 600;
const CHEW_MS = 1760;
/** Толчок камня: опускание головы, упор, рывок, возврат (итого 800 мс). */
const PUSH_DOWN_MS = 280;
const PUSH_BRACE_MS = 100;
const PUSH_LUNGE_MS = 100;
const PUSH_BACK_MS = 320;
/** Достать клад из ручья: нырок, 3 покачивания, подъём (итого 1200 мс). */
const DIP_DOWN_MS = 400;
const DIP_BOB_MS = 70;
const DIP_BOB_CYCLES = 3;
const DIP_UP_MS = 380;

/** Как далеко от плеча голова может уехать при вытягивании шеи. */
const MAX_NECK_REACH = 250;

/** Угол «шея в покое» — от него считаем наклон головы при вытягивании. */
const REST_NECK_DEG = Phaser.Math.RadToDeg(
  Math.atan2(DINO_GEOM.headRestY - DINO_GEOM.shoulderY, DINO_GEOM.headRestX - DINO_GEOM.shoulderX),
);

export interface DiplodocusOptions {
  /** Масштаб персонажа, по умолчанию 1. */
  scale?: number;
}

/** Смешать два цвета 0xrrggbb. */
function mixColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

export class Diplodocus {
  /** Корневой контейнер. Его точка привязки — ЛАПЫ (касание земли). */
  readonly root: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly baseScale: number;

  private readonly rig: Phaser.GameObjects.Container;
  private readonly bodyWrap: Phaser.GameObjects.Container;
  private readonly bodyImg: Phaser.GameObjects.Image;
  private readonly tailImg: Phaser.GameObjects.Image;
  private readonly neckG: Phaser.GameObjects.Graphics;
  private readonly headWrap: Phaser.GameObjects.Container;
  private readonly eyeOpen: Phaser.GameObjects.Image;
  private readonly eyeHappy: Phaser.GameObjects.Image;
  private readonly leafImg: Phaser.GameObjects.Image;
  private readonly starWrap: Phaser.GameObjects.Container;
  private readonly starImg: Phaser.GameObjects.Image;
  private readonly starPulse: Phaser.Tweens.Tween;

  /** Все лапы и пары для противофазной ходьбы. */
  private readonly legs: Phaser.GameObjects.Image[];
  private readonly frontLegs: Phaser.GameObjects.Image[];
  private readonly backLegs: Phaser.GameObjects.Image[];

  /** Всё, что анимируется твинами — чтобы честно погасить их в destroy. */
  private readonly tweenTargets: Phaser.GameObjects.GameObject[];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly walkTweens: Phaser.Tweens.Tween[] = [];
  private readonly pending: Array<() => void> = [];

  private headSway: Phaser.Tweens.Tween | undefined;
  private turnTween: Phaser.Tweens.Tween | undefined;
  /** Отложенный старт reachToCrown: новая анимация отменяет не начавшуюся старую. */
  private reachStart: Phaser.Time.TimerEvent | undefined;

  private walking = false;
  private facing: 1 | -1 = 1;
  private busyCount = 0;
  private breathPhase = 0;
  private hintIntensity = -1;
  private dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options?: DiplodocusOptions) {
    this.scene = scene;
    this.baseScale = options?.scale ?? 1;
    generateDiplodocusTextures(scene);

    const geom = DINO_GEOM;

    this.root = scene.add.container(x, y);
    this.rig = scene.add.container(0, 0);
    this.root.add(this.rig);

    // Дальние лапы — за телом, в тени.
    const farBack = this.makeLeg(DINO_TEX.LEG_FAR, geom.legFarBackX, geom.hipFarY, geom.legFarScale);
    const farFront = this.makeLeg(
      DINO_TEX.LEG_FAR,
      geom.legFarFrontX,
      geom.hipFarY,
      geom.legFarScale,
    );

    // Тело с хвостом: покачивается на ходу как одно целое.
    this.bodyWrap = scene.add.container(0, 0);
    this.tailImg = scene.add
      .image(geom.tailX, geom.tailY, DINO_TEX.TAIL)
      .setOrigin(geom.tailOriginX, geom.tailOriginY);
    this.bodyImg = scene.add.image(geom.bodyX, geom.bodyY, DINO_TEX.BODY).setOrigin(0.5, 0.5);
    this.bodyWrap.add([this.tailImg, this.bodyImg]);

    // Шея: пустой Graphics, его наполняет drawNeck каждый кадр.
    this.neckG = scene.add.graphics();

    // Ближние лапы — перед телом.
    const nearBack = this.makeLeg(DINO_TEX.LEG_NEAR, geom.legNearBackX, geom.hipNearY, 1);
    const nearFront = this.makeLeg(DINO_TEX.LEG_NEAR, geom.legNearFrontX, geom.hipNearY, 1);

    // Голова со всем, что к ней прикреплено.
    this.headWrap = scene.add.container(geom.headRestX, geom.headRestY);
    const headImg = scene.add
      .image(0, 0, DINO_TEX.HEAD)
      .setOrigin(geom.headOriginX, geom.headOriginY);
    this.eyeOpen = scene.add.image(geom.eyeX, geom.eyeY, DINO_TEX.EYE);
    this.eyeHappy = scene.add.image(geom.eyeX, geom.eyeY, DINO_TEX.EYE_HAPPY).setVisible(false);
    this.leafImg = scene.add
      .image(geom.mouthX, geom.mouthY, DINO_TEX.LEAF)
      .setOrigin(0.1, 0.5)
      .setVisible(false);
    this.starWrap = scene.add.container(geom.starX, geom.starY);
    this.starImg = scene.add.image(0, 0, DINO_TEX.HINT_STAR);
    this.starWrap.add(this.starImg);
    this.headWrap.add([headImg, this.eyeOpen, this.eyeHappy, this.leafImg, this.starWrap]);

    this.legs = [farBack, farFront, nearBack, nearFront];
    this.frontLegs = [farFront, nearFront];
    this.backLegs = [farBack, nearBack];

    this.rig.add([
      farBack,
      farFront,
      this.bodyWrap,
      this.neckG,
      nearBack,
      nearFront,
      this.headWrap,
    ]);

    this.tweenTargets = [
      this.rig,
      this.bodyWrap,
      this.bodyImg,
      this.tailImg,
      this.headWrap,
      this.eyeOpen,
      this.eyeHappy,
      this.leafImg,
      this.starWrap,
      this.starImg,
      ...this.legs,
    ];

    this.root.setScale(this.baseScale, this.baseScale);

    // Пульсация звёздочки живёт всегда, скорость меняем через timeScale.
    this.starPulse = scene.tweens.add({
      targets: this.starImg,
      scale: 1.2,
      angle: 14,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.setHintIntensity(0);

    this.startHeadSway();
    this.scheduleBlink();
    this.scheduleChew();
    this.redrawNeck();
  }

  private makeLeg(
    texture: string,
    x: number,
    y: number,
    scale: number,
  ): Phaser.GameObjects.Image {
    return this.scene.add
      .image(x, y, texture)
      .setOrigin(DINO_GEOM.legOriginX, DINO_GEOM.legOriginY)
      .setScale(scale);
  }

  get x(): number {
    return this.root.x;
  }

  get y(): number {
    return this.root.y;
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  /** Идёт ли сейчас «занимающая» анимация (радость / копание / шея к кроне). */
  get busy(): boolean {
    return this.busyCount > 0;
  }

  // -------------------------------------------------------------------------
  // Ходьба и разворот
  // -------------------------------------------------------------------------

  /** Включить/выключить анимацию ходьбы. dirX > 0 — вправо, < 0 — влево, 0 — не менять. */
  setWalking(walking: boolean, dirX?: number): void {
    if (this.dead) {
      return;
    }
    if (dirX !== undefined && dirX !== 0) {
      this.setFacing(dirX > 0 ? 1 : -1);
    }
    if (walking === this.walking) {
      return;
    }
    this.walking = walking;
    this.killWalkTweens();
    if (walking) {
      this.startWalkTweens();
    } else {
      this.relaxPose();
    }
    this.startHeadSway();
  }

  /** Разворот — быстрый твин scaleX, чтобы не было щелчка. */
  private setFacing(dir: 1 | -1): void {
    if (dir === this.facing) {
      return;
    }
    this.facing = dir;
    this.turnTween?.remove();
    this.turnTween = this.scene.tweens.add({
      targets: this.root,
      scaleX: this.baseScale * dir,
      duration: TURN_MS,
      ease: 'Sine.easeInOut',
    });
  }

  private startWalkTweens(): void {
    const tweens = this.scene.tweens;
    this.walkTweens.push(
      tweens.add({
        targets: this.frontLegs,
        angle: { from: -16, to: 16 },
        duration: WALK_STEP_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      tweens.add({
        targets: this.backLegs,
        angle: { from: 16, to: -16 },
        duration: WALK_STEP_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      tweens.add({
        targets: this.bodyWrap,
        y: { from: 0, to: -4 },
        duration: WALK_STEP_MS / 2,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      tweens.add({
        targets: this.tailImg,
        angle: { from: -7, to: 7 },
        duration: WALK_STEP_MS * 1.5,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  private killWalkTweens(): void {
    for (const tween of this.walkTweens) {
      tween.remove();
    }
    this.walkTweens.length = 0;
  }

  /** Плавно вернуть лапы, тело и хвост в нейтраль. */
  private relaxPose(): void {
    const tweens = this.scene.tweens;
    tweens.add({ targets: this.legs, angle: 0, duration: RETURN_MS, ease: 'Sine.easeOut' });
    tweens.add({ targets: this.bodyWrap, y: 0, duration: RETURN_MS, ease: 'Sine.easeOut' });
    tweens.add({ targets: this.tailImg, angle: 0, duration: RETURN_MS + 60, ease: 'Sine.easeOut' });
  }

  /**
   * Лёгкое покачивание головой: на ходу быстрее и размашистее, в покое — еле заметно.
   * Шея следует за головой сама, поэтому колышется вся шея.
   */
  private startHeadSway(): void {
    this.headSway?.remove();
    if (this.dead || this.busy) {
      this.headSway = undefined;
      return;
    }
    const amplitudeY = this.walking ? 6 : 4;
    const amplitudeX = this.walking ? 3 : 2;
    this.headSway = this.scene.tweens.add({
      targets: this.headWrap,
      x: { from: DINO_GEOM.headRestX, to: DINO_GEOM.headRestX + amplitudeX },
      y: { from: DINO_GEOM.headRestY, to: DINO_GEOM.headRestY - amplitudeY },
      duration: this.walking ? WALK_STEP_MS * 2 : 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // -------------------------------------------------------------------------
  // Простой: моргание и жевание листика
  // -------------------------------------------------------------------------

  private scheduleBlink(): void {
    const timer = this.scene.time.delayedCall(Phaser.Math.Between(3000, 5000), () => {
      if (this.dead) {
        return;
      }
      if (this.eyeOpen.visible) {
        this.scene.tweens.add({
          targets: this.eyeOpen,
          scaleY: 0.08,
          duration: BLINK_MS / 2,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      }
      this.scheduleBlink();
    });
    this.timers.push(timer);
  }

  private scheduleChew(): void {
    const timer = this.scene.time.delayedCall(Phaser.Math.Between(8000, 15000), () => {
      if (this.dead) {
        return;
      }
      if (!this.busy && !this.walking) {
        this.playChew();
      }
      this.scheduleChew();
    });
    this.timers.push(timer);
  }

  /** Листик появляется у рта, голова жуёт, листик исчезает. */
  private playChew(): void {
    const tweens = this.scene.tweens;
    this.leafImg.setVisible(true).setScale(0.1).setAlpha(1).setAngle(-20);
    tweens.add({
      targets: this.leafImg,
      scale: 1,
      angle: 8,
      duration: 220,
      ease: 'Back.easeOut',
    });
    tweens.add({
      targets: this.headWrap,
      angle: 7,
      duration: 150,
      delay: 240,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.easeInOut',
    });
    tweens.add({
      targets: this.leafImg,
      scale: 0,
      alpha: 0,
      duration: 260,
      delay: CHEW_MS - 260,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.leafImg.setVisible(false);
      },
    });
  }

  private hideLeaf(): void {
    this.scene.tweens.killTweensOf(this.leafImg);
    this.leafImg.setVisible(false);
  }

  // -------------------------------------------------------------------------
  // Подсказка «горячо-холодно»
  // -------------------------------------------------------------------------

  /** Яркость подсказки (звёздочка над головой), 0..1. */
  setHintIntensity(value: number): void {
    const next = Phaser.Math.Clamp(value, 0, 1);
    if (Math.abs(next - this.hintIntensity) < 0.004) {
      return;
    }
    this.hintIntensity = next;
    this.starWrap.setAlpha(0.07 + 0.93 * next);
    this.starWrap.setScale(0.5 + 0.55 * next);
    this.starImg.setTint(mixColor(PALETTE.hintStarCold, PALETTE.hintStar, next));
    // Чем горячее — тем быстрее пульс. Новый твин каждый кадр не создаём.
    this.starPulse.timeScale = 0.55 + 1.9 * next;
  }

  /** Полностью показать/скрыть звёздочку. */
  showHint(visible: boolean): void {
    this.starWrap.setVisible(visible);
  }

  // -------------------------------------------------------------------------
  // Занимающие анимации
  // -------------------------------------------------------------------------

  private beginAction(): void {
    this.busyCount += 1;
    this.headSway?.remove();
    this.headSway = undefined;
    this.reachStart?.remove(false);
    this.reachStart = undefined;
    this.hideLeaf();
    this.scene.tweens.killTweensOf(this.headWrap);
    this.headWrap.setAngle(0);
  }

  /** Завершить занимающую анимацию через ms и вернуть позу к норме. */
  private endActionAfter(ms: number, onDone?: () => void): void {
    const timer = this.scene.time.delayedCall(ms, () => {
      this.busyCount = Math.max(0, this.busyCount - 1);
      onDone?.();
      if (this.dead) {
        return;
      }
      if (!this.busy) {
        this.rig.setPosition(0, 0);
        this.bodyWrap.setScale(1);
        this.headWrap.setAngle(0);
        if (!this.walking) {
          this.relaxPose();
        }
        this.startHeadSway();
      }
    });
    this.timers.push(timer);
  }

  private showHappyEyes(happy: boolean): void {
    this.scene.tweens.killTweensOf(this.eyeOpen);
    this.eyeOpen.setScale(1).setVisible(!happy);
    this.eyeHappy.setVisible(happy);
  }

  /** Радость: подпрыгнуть, шею вверх, хвостом вильнуть (~900 мс). */
  playJoy(): void {
    if (this.dead) {
      return;
    }
    this.beginAction();
    this.showHappyEyes(true);
    const tweens = this.scene.tweens;
    tweens.add({
      targets: this.rig,
      y: -36,
      duration: 280,
      hold: 70,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.frontLegs,
      angle: -28,
      duration: 240,
      hold: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.backLegs,
      angle: 28,
      duration: 240,
      hold: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.headWrap,
      x: DINO_GEOM.headRestX - 8,
      y: DINO_GEOM.headRestY - 30,
      angle: -12,
      duration: 300,
      hold: 120,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.tailImg,
      angle: { from: -16, to: 16 },
      duration: 110,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
    // пружинка при посадке
    tweens.add({
      targets: this.bodyWrap,
      scaleX: 1.07,
      scaleY: 0.9,
      duration: 120,
      delay: 620,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.endActionAfter(JOY_MS, () => {
      if (!this.dead) {
        this.showHappyEyes(false);
      }
    });
  }

  /** Один взмах копания: голова ныряет к земле и обратно (~420 мс). */
  playDigStroke(): void {
    if (this.dead) {
      return;
    }
    this.beginAction();
    const tweens = this.scene.tweens;
    tweens.add({
      targets: this.headWrap,
      x: DINO_GEOM.headRestX + 16,
      y: -40,
      angle: 34,
      duration: 190,
      hold: 30,
      yoyo: true,
      ease: 'Sine.easeIn',
    });
    // передняя ближняя лапа «гребёт»
    tweens.add({
      targets: this.legs[3],
      angle: -34,
      duration: 130,
      delay: 110,
      hold: 40,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.bodyWrap,
      y: 4,
      duration: 190,
      hold: 30,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.endActionAfter(DIG_MS);
  }

  /**
   * Тянет шею к кроне дерева в мировых координатах и возвращает голову назад.
   * Promise решается, когда голова вернулась (~1800 мс). Никогда не отклоняется.
   */
  reachToCrown(worldX: number, worldY: number): Promise<void> {
    if (this.dead) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.pending.push(resolve);
      const settle = (): void => {
        const index = this.pending.indexOf(resolve);
        if (index >= 0) {
          this.pending.splice(index, 1);
          resolve();
        }
      };

      // Если крона слева — сначала разворачиваемся.
      const dir: 1 | -1 = worldX >= this.root.x ? 1 : -1;
      const needTurn = dir !== this.facing;
      this.setFacing(dir);
      this.beginAction();

      const start = this.scene.time.delayedCall(needTurn ? TURN_MS : 0, () => {
        this.reachStart = undefined;
        if (this.dead) {
          return;
        }
        const target = this.reachTarget(worldX, worldY, dir);
        const tweens = this.scene.tweens;
        tweens.add({
          targets: this.headWrap,
          x: target.x,
          y: target.y,
          angle: target.angle,
          duration: REACH_UP_MS,
          ease: 'Sine.easeOut',
          onComplete: () => {
            if (this.dead) {
              return;
            }
            // короткая пауза у кроны с лёгким покачиванием
            tweens.add({
              targets: this.headWrap,
              x: target.x - 5,
              angle: target.angle - 7,
              duration: REACH_HOLD_MS / 2,
              yoyo: true,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                if (this.dead) {
                  return;
                }
                tweens.add({
                  targets: this.headWrap,
                  x: DINO_GEOM.headRestX,
                  y: DINO_GEOM.headRestY,
                  angle: 0,
                  duration: REACH_BACK_MS,
                  ease: 'Sine.easeInOut',
                });
              },
            });
          },
        });
      });
      this.timers.push(start);
      this.reachStart = start;

      const total = (needTurn ? TURN_MS : 0) + REACH_UP_MS + REACH_HOLD_MS + REACH_BACK_MS;
      this.endActionAfter(total, settle);
    });
  }

  /**
   * Мировая точка → локальная цель для головы с учётом разворота.
   * Шея не растягивается сильнее MAX_NECK_REACH и не уходит за плечо назад.
   */
  private reachTarget(
    worldX: number,
    worldY: number,
    dir: 1 | -1,
  ): { x: number; y: number; angle: number } {
    const localX = (worldX - this.root.x) / (this.baseScale * dir);
    const localY = (worldY - this.root.y) / this.baseScale;
    let dx = localX - DINO_GEOM.shoulderX;
    let dy = localY - DINO_GEOM.shoulderY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MAX_NECK_REACH) {
      dx = (dx / distance) * MAX_NECK_REACH;
      dy = (dy / distance) * MAX_NECK_REACH;
    }
    const x = Math.max(DINO_GEOM.shoulderX + 8, DINO_GEOM.shoulderX + dx);
    const y = Math.min(DINO_GEOM.shoulderY - 30, DINO_GEOM.shoulderY + dy);
    const necDeg = Phaser.Math.RadToDeg(Math.atan2(y - DINO_GEOM.shoulderY, x - DINO_GEOM.shoulderX));
    const angle = Phaser.Math.Clamp((necDeg - REST_NECK_DEG) * 0.8, -40, 30);
    return { x, y, angle };
  }

  /**
   * Каркас целевой анимации: разворот в сторону worldX, занять персонажа,
   * запустить play(dir) после разворота и освободить через bodyMs.
   * Устроен так же, как reachToCrown: незапущенный старт отменяется следующим действием,
   * а Promise решается по окончании или при destroy и никогда не отклоняется.
   */
  private runAimedAction(
    worldX: number,
    bodyMs: number,
    play: (dir: 1 | -1) => void,
  ): Promise<void> {
    if (this.dead) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.pending.push(resolve);
      const settle = (): void => {
        const index = this.pending.indexOf(resolve);
        if (index >= 0) {
          this.pending.splice(index, 1);
          resolve();
        }
      };

      const dir: 1 | -1 = worldX >= this.root.x ? 1 : -1;
      const needTurn = dir !== this.facing;
      this.setFacing(dir);
      this.beginAction();

      const start = this.scene.time.delayedCall(needTurn ? TURN_MS : 0, () => {
        this.reachStart = undefined;
        if (this.dead) {
          return;
        }
        play(dir);
      });
      this.timers.push(start);
      this.reachStart = start;

      this.endActionAfter((needTurn ? TURN_MS : 0) + bodyMs, settle);
    });
  }

  /**
   * Толкнуть головой камень в точке worldX: голова и шея опускаются вперёд-вниз
   * до уровня груди, короткий упор, рывок всем телом вперёд, возврат (~800 мс).
   * Promise решается после возврата (плюс разворот, если камень позади) и не отклоняется.
   */
  playPush(worldX: number): Promise<void> {
    const total = PUSH_DOWN_MS + PUSH_BRACE_MS + PUSH_LUNGE_MS + PUSH_BACK_MS;
    return this.runAimedAction(worldX, total, () => {
      const tweens = this.scene.tweens;
      // Поза «упёрся»: голова на уровне груди, шея выгнута горбом (рисует drawNeck).
      const lowX = DINO_GEOM.shoulderX + 54;
      const lowY = -78;
      const lowAngle = 26;

      // Опускание: голова вперёд-вниз, передние лапы выставлены вперёд и упираются.
      tweens.add({
        targets: this.frontLegs,
        angle: -12,
        duration: PUSH_DOWN_MS,
        ease: 'Sine.easeOut',
      });
      tweens.add({
        targets: this.headWrap,
        x: lowX,
        y: lowY,
        angle: lowAngle,
        duration: PUSH_DOWN_MS,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (this.dead) {
            return;
          }
          // Упор: чуть присели и набрали силу, задние лапы готовятся толкать.
          tweens.add({
            targets: this.backLegs,
            angle: 10,
            duration: PUSH_BRACE_MS,
            ease: 'Sine.easeOut',
          });
          tweens.add({
            targets: this.headWrap,
            x: lowX - 4,
            angle: lowAngle + 4,
            duration: PUSH_BRACE_MS,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              if (this.dead) {
                return;
              }
              // Рывок: всё тело вперёд, голова бьёт вперёд, на теле «пружинка».
              tweens.add({
                targets: this.rig,
                x: 14,
                duration: PUSH_LUNGE_MS,
                ease: 'Quad.easeOut',
              });
              tweens.add({
                targets: this.bodyWrap,
                scaleX: 1.07,
                scaleY: 0.93,
                duration: PUSH_LUNGE_MS / 2,
                yoyo: true,
                ease: 'Sine.easeInOut',
              });
              tweens.add({
                targets: this.headWrap,
                x: lowX + 18,
                y: lowY + 4,
                angle: lowAngle + 8,
                duration: PUSH_LUNGE_MS,
                ease: 'Quad.easeOut',
                onComplete: () => {
                  if (this.dead) {
                    return;
                  }
                  // Возврат: тело на место, лапы в нейтраль, голова в покой.
                  tweens.add({
                    targets: this.rig,
                    x: 0,
                    duration: PUSH_BACK_MS,
                    ease: 'Sine.easeInOut',
                  });
                  tweens.add({
                    targets: this.legs,
                    angle: 0,
                    duration: PUSH_BACK_MS,
                    ease: 'Sine.easeInOut',
                  });
                  tweens.add({
                    targets: this.headWrap,
                    x: DINO_GEOM.headRestX,
                    y: DINO_GEOM.headRestY,
                    angle: 0,
                    duration: PUSH_BACK_MS,
                    ease: 'Sine.easeInOut',
                  });
                },
              });
            },
          });
        },
      });
    });
  }

  /**
   * Опустить голову в воду в точке (worldX, worldY): голова ныряет по дуге,
   * 3 коротких покачивания «шарит на дне», плавный подъём (~1200 мс).
   * Promise решается после подъёма (плюс разворот, если точка позади) и не отклоняется.
   */
  playDip(worldX: number, worldY: number): Promise<void> {
    const total = DIP_DOWN_MS + DIP_BOB_MS * 2 * DIP_BOB_CYCLES + DIP_UP_MS;
    return this.runAimedAction(worldX, total, (dir) => {
      const tweens = this.scene.tweens;
      const target = this.dipTarget(worldX, worldY, dir);

      // Корпус подаётся вперёд, передние лапы выставлены — стоит устойчиво у кромки.
      tweens.add({
        targets: this.rig,
        x: 6,
        duration: DIP_DOWN_MS,
        ease: 'Sine.easeInOut',
      });
      tweens.add({
        targets: this.frontLegs,
        angle: -9,
        duration: DIP_DOWN_MS,
        ease: 'Sine.easeOut',
      });
      tweens.add({
        targets: this.headWrap,
        angle: target.angle,
        duration: DIP_DOWN_MS,
        ease: 'Sine.easeInOut',
      });
      // Дуга: по X голова вылетает вперёд быстро, по Y — ныряет к концу.
      tweens.add({
        targets: this.headWrap,
        x: target.x,
        duration: DIP_DOWN_MS,
        ease: 'Sine.easeOut',
      });
      tweens.add({
        targets: this.headWrap,
        y: target.y,
        duration: DIP_DOWN_MS,
        ease: 'Sine.easeIn',
        onComplete: () => {
          if (this.dead) {
            return;
          }
          // Шарит на дне: короткие покачивания вниз-вперёд и обратно.
          tweens.add({
            targets: this.headWrap,
            x: target.x + 5,
            y: target.y + 7,
            angle: target.angle + 9,
            duration: DIP_BOB_MS,
            yoyo: true,
            repeat: DIP_BOB_CYCLES - 1,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              if (this.dead) {
                return;
              }
              // Подъём: сначала голова идёт вверх, по X подтягивается позже.
              tweens.add({
                targets: this.rig,
                x: 0,
                duration: DIP_UP_MS,
                ease: 'Sine.easeInOut',
              });
              tweens.add({
                targets: this.legs,
                angle: 0,
                duration: DIP_UP_MS,
                ease: 'Sine.easeInOut',
              });
              tweens.add({
                targets: this.headWrap,
                x: DINO_GEOM.headRestX,
                angle: 0,
                duration: DIP_UP_MS,
                ease: 'Sine.easeIn',
              });
              tweens.add({
                targets: this.headWrap,
                y: DINO_GEOM.headRestY,
                duration: DIP_UP_MS,
                ease: 'Sine.easeOut',
              });
            },
          });
        },
      });
    });
  }

  /**
   * Мировая точка воды → локальная цель для головы (шея смотрит вниз-вперёд).
   * Цель — не затылок, а морда: вычитаем повёрнутое смещение рта, чтобы
   * именно морда оказалась в воде. Длина шеи ограничена MAX_NECK_REACH.
   */
  private dipTarget(
    worldX: number,
    worldY: number,
    dir: 1 | -1,
  ): { x: number; y: number; angle: number } {
    const angle = 52;
    const rad = Phaser.Math.DegToRad(angle);
    const mouthX = DINO_GEOM.mouthX * Math.cos(rad) - DINO_GEOM.mouthY * Math.sin(rad);
    const mouthY = DINO_GEOM.mouthX * Math.sin(rad) + DINO_GEOM.mouthY * Math.cos(rad);
    const localX = (worldX - this.root.x) / (this.baseScale * dir) - mouthX;
    const localY = (worldY - this.root.y) / this.baseScale - mouthY;
    let dx = localX - DINO_GEOM.shoulderX;
    let dy = localY - DINO_GEOM.shoulderY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MAX_NECK_REACH) {
      dx = (dx / distance) * MAX_NECK_REACH;
      dy = (dy / distance) * MAX_NECK_REACH;
    }
    // Не за плечом назад и не глубже, чем голова разумно уходит под землю.
    const x = Math.max(DINO_GEOM.shoulderX + 10, DINO_GEOM.shoulderX + dx);
    const y = Math.min(40, DINO_GEOM.shoulderY + dy);
    return { x, y, angle };
  }

  // -------------------------------------------------------------------------
  // Кадр
  // -------------------------------------------------------------------------

  /** Вызывать каждый кадр из update сцены. */
  update(_time: number, delta: number): void {
    if (this.dead) {
      return;
    }
    // Дыхание: тело чуть-чуть раздувается. Твин тут не нужен — это бесконечная синусоида.
    this.breathPhase += delta * 0.0028;
    const breath = Math.sin(this.breathPhase);
    this.bodyImg.setScale(1 + breath * 0.016, 1 + breath * 0.022);
    this.redrawNeck();
  }

  private redrawNeck(): void {
    const breath = Math.sin(this.breathPhase) * 1.5;
    drawNeck(
      this.neckG,
      DINO_GEOM.shoulderX,
      DINO_GEOM.shoulderY + this.bodyWrap.y - breath,
      this.headWrap.x,
      this.headWrap.y,
    );
  }

  destroy(): void {
    if (this.dead) {
      return;
    }
    this.dead = true;
    // Все обещания обязаны решиться, даже если персонажа уже нет.
    const waiting = this.pending.splice(0, this.pending.length);
    for (const resolve of waiting) {
      resolve();
    }
    this.killWalkTweens();
    this.headSway?.remove();
    this.turnTween?.remove();
    this.starPulse.remove();
    for (const timer of this.timers) {
      timer.remove(false);
    }
    this.timers.length = 0;
    this.scene.tweens.killTweensOf(this.tweenTargets);
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }
}
