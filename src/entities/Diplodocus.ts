/**
 * Что диплодок умеет делать по просьбе сцены: радоваться, копать, тянуть
 * шею к кроне, толкать камень и доставать клад из ручья.
 *
 * Все эти анимации «занимают» персонажа: пока идёт любая из них, busy
 * истинно, покачивание головой выключено, а ходьба и жевание не мешают.
 * Каждое действие с обещанием решает его ровно один раз — и при обычном
 * окончании, и при destroy: сцена ждёт эти обещания и без них зависнет.
 *
 * Как диплодок устроен и держится — в dinoRig.ts, сборка частей — в dinoParts.ts.
 */

import Phaser from 'phaser';
import { DINO_GEOM } from '../art/diplodocus';
import { DinoRig, TURN_MS } from './dinoRig';

export type { DiplodocusOptions } from './dinoRig';

/** Длительности анимаций, мс. */
const JOY_MS = 900;
const DIG_MS = 420;
const REACH_UP_MS = 700;
const REACH_HOLD_MS = 400;
const REACH_BACK_MS = 600;
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

export class Diplodocus extends DinoRig {
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
      x: this.restX - 8,
      y: this.restY - 30,
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
      x: this.restX + 16,
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
                  x: this.restX,
                  y: this.restY,
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
                    x: this.restX,
                    y: this.restY,
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
                x: this.restX,
                angle: 0,
                duration: DIP_UP_MS,
                ease: 'Sine.easeIn',
              });
              tweens.add({
                targets: this.headWrap,
                y: this.restY,
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
}
