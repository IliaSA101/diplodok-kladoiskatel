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
import { DIG, DIP, JOY, PUSH, REACH } from '../art/dinoPoses';
import { DinoRig, TURN_MS } from './dinoRig';

export type { DiplodocusOptions } from './dinoRig';

/** Длительности анимаций, мс. */
const JOY_MS = JOY.ms;
const DIG_MS = DIG.ms;
const REACH_UP_MS = REACH.upMs;
const REACH_HOLD_MS = REACH.holdMs;
const REACH_BACK_MS = REACH.backMs;
/** Толчок камня: опускание головы, упор, рывок, возврат (итого 800 мс). */
const PUSH_DOWN_MS = PUSH.downMs;
const PUSH_BRACE_MS = PUSH.braceMs;
const PUSH_LUNGE_MS = PUSH.lungeMs;
const PUSH_BACK_MS = PUSH.backMs;
/** Достать клад из ручья: нырок, 3 покачивания, подъём (итого 1200 мс). */
const DIP_DOWN_MS = DIP.downMs;
const DIP_BOB_MS = DIP.bobMs;
const DIP_BOB_CYCLES = DIP.bobCycles;
const DIP_UP_MS = DIP.upMs;

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
    this.neckRootGain = 1;
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
        this.neckRootGain = 1;
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
    this.eyeOpen.setScale(this.eyeRestScale).setVisible(!happy);
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
      y: JOY.jump,
      duration: 280,
      hold: 70,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.frontLegs,
      angle: JOY.front,
      duration: JOY.legsMs,
      hold: JOY.legsHold,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.backLegs,
      angle: JOY.back,
      duration: JOY.legsMs,
      hold: JOY.legsHold,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.headWrap,
      x: this.restX + JOY.headDx,
      y: this.restY + JOY.headDy,
      angle: JOY.headAngle,
      duration: JOY.headMs,
      hold: JOY.headHold,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    tweens.add({
      targets: this.tailImg,
      angle: { from: -JOY.tailSwing, to: JOY.tailSwing },
      duration: JOY.tailMs,
      yoyo: true,
      repeat: JOY.tailRepeat,
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
    // Голова идёт в 18 px от плеча: основание шеи там не поворачивается (И13-3).
    // В начале и в конце взмаха она в покое, угол нулевой, и переключение бесшовно.
    this.neckRootGain = 0;
    const tweens = this.scene.tweens;
    // Туда и обратно двумя твинами: возврат «зеркалом» привёл бы голову в точку,
    // где застало нажатие, и при быстрых нажатиях она не доходила бы до покоя.
    tweens.add({
      targets: this.headWrap,
      x: this.restX + DIG.headDx,
      y: DIG.headY,
      angle: DIG.headAngle,
      duration: DIG.headMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.dead) {
          return;
        }
        tweens.add({
          targets: this.headWrap,
          x: this.restX,
          y: this.restY,
          angle: 0,
          duration: DIG.headMs,
          delay: DIG.headHold,
          ease: 'Sine.easeOut',
        });
      },
    });
    // Передняя ближняя лапа «гребёт». На ходу она уже идёт шагом (твин
    // frontLegs), второй твин на ту же лапу даёт щелчок до 32° за кадр:
    // на ходу копает одна голова.
    if (!this.walking) {
      tweens.add({
        targets: this.legs[3],
        angle: DIG.paw,
        duration: DIG.pawMs,
        delay: DIG.pawDelayMs,
        hold: DIG.pawHold,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
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
              x: target.x + REACH.bobDx,
              angle: target.angle + REACH.bobAngle,
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
      const lowX = DINO_GEOM.shoulderX + PUSH.lowDx;
      const lowY = PUSH.lowY;
      const lowAngle = PUSH.lowAngle;

      // Опускание: голова вперёд-вниз, передние лапы выставлены вперёд и упираются.
      tweens.add({
        targets: this.frontLegs,
        angle: PUSH.front,
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
            angle: PUSH.back,
            duration: PUSH_BRACE_MS,
            ease: 'Sine.easeOut',
          });
          tweens.add({
            targets: this.headWrap,
            x: lowX + PUSH.braceDx,
            angle: lowAngle + PUSH.braceAngle,
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
                x: lowX + PUSH.lungeDx,
                y: lowY + PUSH.lungeDy,
                angle: lowAngle + PUSH.lungeAngle,
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
        angle: DIP.front,
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
            x: target.x + DIP.bobDx,
            y: target.y + DIP.bobDy,
            angle: target.angle + DIP.bobAngle,
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
    const angle: number = DIP.angle;
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
