/**
 * Диплодок: как он стоит, ходит, дышит и моргает.
 *
 * Устройство: root (точка привязки — лапы на земле) → rig (прыжок) → части тела.
 * Голова живёт в отдельном под-контейнере и анимируется твинами, а шея каждый
 * кадр перекладывается от плеча к голове: у рисованного диплодока её гнёт
 * сетка, у диплодока из кода — рисует drawNeck. Поэтому шея «настоящая»:
 * её можно вытянуть к кроне дерева или уткнуть в землю при копании.
 *
 * Здесь всё, что диплодок делает сам собой. Занимающие действия (радость,
 * копание, шея к кроне, толчок камня, нырок) — в Diplodocus.ts, он наследник.
 * Сборка частей — в dinoParts.ts.
 *
 * Про физику сущность не знает: позицию задаёт сцена через setPosition.
 */

import Phaser from 'phaser';
import { DINO_GEOM, drawNeck } from '../art/diplodocus';
import { CHEW, WALK } from '../art/dinoPoses';
import { applyWarp } from '../art/dinoWarp';
import { dinoBlinkScaleY, dinoEyeTurn } from '../art/dinoLayout';
import { PALETTE } from '../art/palette';
import { buildDinoParts, type DinoParts, type DinoPlane } from './dinoParts';

/** Длительности анимаций, мс. */
const WALK_STEP_MS = WALK.stepMs;
/** Разворот нужен и действиям: они ждут его, прежде чем тянуть шею. */
export const TURN_MS = 140;
const RETURN_MS = 220;
const BLINK_MS = 120;
const CHEW_MS = 1760;
/** На сколько рисованный диплодок приподнимается на каждом шаге, px рига. */
const ART_BOB = 6;
/** На сколько кадров кончик хвоста отстаёт от крупа: столько длится волна. */
const TAIL_LAG_FRAMES = WALK.tailLagFrames;
/** Размах шага, градусы: на столько твины крутят лапы от нейтрали. */
const WALK_SWING = WALK.legSwing;
/** На сколько копыто отрывается от земли на махе, px рисунка. */
const LEG_LIFT = WALK.legLift;

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

/**
 * Стойка и походка. Отдельный класс, потому что файл с действиями и этим
 * вместе перевалил за порог размера: одно дело — как диплодок устроен и
 * держится, другое — что он умеет делать по просьбе сцены.
 */
export class DinoRig {
  /** Корневой контейнер. Его точка привязки — ЛАПЫ (касание земли). */
  readonly root: Phaser.GameObjects.Container;

  protected readonly scene: Phaser.Scene;
  protected readonly baseScale: number;

  protected readonly rig: Phaser.GameObjects.Container;
  protected readonly bodyWrap: Phaser.GameObjects.Container;
  protected readonly bodyImg: Phaser.GameObjects.Image;
  protected readonly tailImg: Phaser.GameObjects.Image;
  protected readonly neckG: Phaser.GameObjects.Graphics;
  protected readonly headWrap: Phaser.GameObjects.Container;
  /** Голова доворачивается по касательной шеи отдельно от своих твинов. */
  protected readonly headTurn: Phaser.GameObjects.Container;
  protected readonly eyeOpen: Phaser.GameObjects.Image;
  protected readonly eyeHappy: Phaser.GameObjects.Image;
  protected readonly eyeRestScale: number;
  protected readonly leafImg: Phaser.GameObjects.Image;
  protected readonly starWrap: Phaser.GameObjects.Container;
  protected readonly starImg: Phaser.GameObjects.Image;
  protected readonly starPulse: Phaser.Tweens.Tween;

  /** Все лапы и пары для противофазной ходьбы. */
  protected readonly legs: Phaser.GameObjects.Image[];
  protected readonly frontLegs: Phaser.GameObjects.Image[];
  protected readonly backLegs: Phaser.GameObjects.Image[];

  /** Всё, что анимируется твинами — чтобы честно погасить их в destroy. */
  protected readonly tweenTargets: Phaser.GameObjects.GameObject[];
  protected readonly timers: Phaser.Time.TimerEvent[] = [];
  protected readonly walkTweens: Phaser.Tweens.Tween[] = [];
  protected readonly pending: Array<() => void> = [];

  protected headSway: Phaser.Tweens.Tween | undefined;
  protected turnTween: Phaser.Tweens.Tween | undefined;
  /** Отложенный старт reachToCrown: новая анимация отменяет не начавшуюся старую. */
  protected reachStart: Phaser.Time.TimerEvent | undefined;

  /** Тело, шея и голова — нарисованные картинки, а не фигуры из кода. */
  protected readonly art: boolean;
  /** Сетка с целым диплодоком: у неё гнётся шея. Пусто у диплодока из кода. */
  protected readonly plane: DinoPlane | null;
  /** Высота сетки в покое: от неё считается покачивание на ходу. */
  protected readonly planeRestY: number;
  /** Разложение вершин сетки, посчитанное один раз. */
  protected readonly planeBounds: DinoParts['planeBounds'];
  /** Углы лап, которые уходят в изгиб сетки. Буфер, чтобы не мусорить. */
  protected readonly legAngles: number[] = [0, 0, 0, 0];
  /** Подъём каждой лапы на махе, px рисунка. */
  protected readonly legLifts: number[] = [0, 0, 0, 0];
  /** Вес поворота основания шеи: 0 на копании (`playDigStroke`), в остальное время 1. */
  protected neckRootGain = 1;
  /** Углы диагональных пар на прошлом кадре: по ним видно, куда идёт нога. */
  protected readonly prevPairAngle: number[] = [0, 0];
  /** Углы хвоста за последние кадры: по ним кончик отстаёт от крупа. */
  protected readonly tailHistory = new Float32Array(TAIL_LAG_FRAMES);
  protected tailHistoryAt = 0;
  /** Где голова сидит в покое: у рисунка своё место, не как у кода. */
  protected readonly restX: number;
  protected readonly restY: number;

  protected walking = false;
  protected facing: 1 | -1 = 1;
  protected busyCount = 0;
  protected breathPhase = 0;
  protected hintIntensity = -1;
  protected dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options?: DiplodocusOptions) {
    this.scene = scene;
    this.baseScale = options?.scale ?? 1;

    const parts = buildDinoParts(scene, x, y);
    this.root = parts.root;
    this.rig = parts.rig;
    this.bodyWrap = parts.bodyWrap;
    this.bodyImg = parts.bodyImg;
    this.tailImg = parts.tailImg;
    this.neckG = parts.neckG;
    this.headWrap = parts.headWrap;
    this.headTurn = parts.headTurn;
    this.eyeOpen = parts.eyeOpen;
    this.eyeHappy = parts.eyeHappy;
    this.eyeRestScale = parts.eyeRestScale;
    this.leafImg = parts.leafImg;
    this.starWrap = parts.starWrap;
    this.starImg = parts.starImg;
    this.legs = parts.legs;
    this.frontLegs = parts.frontLegs;
    this.backLegs = parts.backLegs;
    this.plane = parts.plane;
    this.planeBounds = parts.planeBounds;
    this.planeRestY = parts.plane?.y ?? 0;
    this.art = parts.art;
    this.restX = parts.restX;
    this.restY = parts.restY;

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
  protected setFacing(dir: 1 | -1): void {
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

  protected startWalkTweens(): void {
    const tweens = this.scene.tweens;
    this.walkTweens.push(
      tweens.add({
        targets: this.frontLegs,
        angle: { from: -WALK_SWING, to: WALK_SWING },
        duration: WALK_STEP_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      tweens.add({
        targets: this.backLegs,
        angle: { from: WALK_SWING, to: -WALK_SWING },
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
        angle: { from: -WALK.tailSwing, to: WALK.tailSwing },
        duration: WALK.tailMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
    // У рисованного диплодока тело и хвост нарисованы на сетке, а не в
    // bodyWrap: без своего покачивания он скользил бы по траве, переступая
    // одними лапами. Сетка поднимается дважды за шаг — как тело над лапами.
    if (this.plane !== null) {
      this.walkTweens.push(
        tweens.add({
          targets: this.plane,
          y: { from: this.planeRestY, to: this.planeRestY - ART_BOB },
          duration: WALK_STEP_MS / 2,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }
  }

  protected killWalkTweens(): void {
    for (const tween of this.walkTweens) {
      tween.remove();
    }
    this.walkTweens.length = 0;
  }

  /** Плавно вернуть лапы, тело и хвост в нейтраль. */
  protected relaxPose(): void {
    const tweens = this.scene.tweens;
    tweens.add({ targets: this.legs, angle: 0, duration: RETURN_MS, ease: 'Sine.easeOut' });
    tweens.add({ targets: this.bodyWrap, y: 0, duration: RETURN_MS, ease: 'Sine.easeOut' });
    if (this.plane !== null) {
      tweens.add({
        targets: this.plane,
        y: this.planeRestY,
        duration: RETURN_MS,
        ease: 'Sine.easeOut',
      });
    }
    tweens.add({ targets: this.tailImg, angle: 0, duration: RETURN_MS + 60, ease: 'Sine.easeOut' });
  }

  /**
   * Лёгкое покачивание головой: на ходу быстрее и размашистее, в покое — еле заметно.
   * Шея следует за головой сама, поэтому колышется вся шея.
   */
  protected startHeadSway(): void {
    this.headSway?.remove();
    if (this.dead || this.busy) {
      this.headSway = undefined;
      return;
    }
    const amplitudeY = this.walking ? WALK.swayY : 4;
    const amplitudeX = this.walking ? WALK.swayX : 2;
    this.headSway = this.scene.tweens.add({
      targets: this.headWrap,
      x: { from: this.restX, to: this.restX + amplitudeX },
      y: { from: this.restY, to: this.restY - amplitudeY },
      duration: this.walking ? WALK_STEP_MS * 2 : 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  // -------------------------------------------------------------------------
  // Простой: моргание и жевание листика
  // -------------------------------------------------------------------------

  protected scheduleBlink(): void {
    const timer = this.scene.time.delayedCall(Phaser.Math.Between(3000, 5000), () => {
      if (this.dead) {
        return;
      }
      if (this.eyeOpen.visible) {
        this.scene.tweens.add({
          targets: this.eyeOpen,
          scaleY: dinoBlinkScaleY(this.eyeRestScale),
          duration: BLINK_MS / 2,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      }
      this.scheduleBlink();
    });
    this.timers.push(timer);
  }

  protected scheduleChew(): void {
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

  /**
   * Листик появляется у рта, голова жуёт, листик исчезает.
   *
   * Жуёт только диплодок из кода: у него голова лежит в headWrap и кивает
   * вместе с ним. У рисованного голова — вершины сетки, а твин крутит один
   * headWrap, и глаз с листиком доворачиваются обратно (`dinoEyeTurn`): голова
   * не двигается, листик лишь появляется, растёт и исчезает у рта.
   */
  protected playChew(): void {
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
      angle: CHEW.headAngle,
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

  protected hideLeaf(): void {
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

  /**
   * На сколько поднята нога этой пары: на махе вперёд — горкой до LEG_LIFT,
   * на опоре — ноль. Куда идёт нога, видно по сравнению с прошлым кадром:
   * положительный угол уводит копыто назад.
   */
  protected swingLift(pair: number, angle: number): number {
    const previous = this.prevPairAngle[pair] ?? angle;
    this.prevPairAngle[pair] = angle;
    if (!this.walking || angle >= previous) return 0;
    const u = Phaser.Math.Clamp(angle / WALK_SWING, -1, 1);
    return (1 - u * u) * LEG_LIFT;
  }

  /** Запомнить угол хвоста и вернуть тот, что был TAIL_LAG_FRAMES кадров назад. */
  protected rememberTail(angle: number): number {
    const oldest = this.tailHistory[this.tailHistoryAt] ?? angle;
    this.tailHistory[this.tailHistoryAt] = angle;
    this.tailHistoryAt = (this.tailHistoryAt + 1) % this.tailHistory.length;
    return oldest;
  }

  protected redrawNeck(): void {
    const breath = Math.sin(this.breathPhase) * 1.5;
    const shoulderY = DINO_GEOM.shoulderY + this.bodyWrap.y - breath;
    const plane = this.plane;
    if (plane === null || this.planeBounds === null) {
      drawNeck(this.neckG, DINO_GEOM.shoulderX, shoulderY, this.headWrap.x, this.headWrap.y);
      return;
    }

    // Сетка: гнём шею и голову прямо на картинке, швов нет и прятать нечего.
    // Лапы крутятся вокруг бёдер на те же углы, что и у диплодока из кода,
    // но разложены по диагонали: на рисунке лапы идут слева направо
    // задняя ближняя, задняя дальняя, передняя ближняя, передняя дальняя,
    // и шагать вместе должны задняя ближняя с передней дальней. Пока обе
    // ближние шли разом, диплодок не ступал, а подпрыгивал лошадкой.
    const pair = [this.backLegs[0]?.angle ?? 0, this.frontLegs[0]?.angle ?? 0];
    const lift = [this.swingLift(0, pair[0] ?? 0), this.swingLift(1, pair[1] ?? 0)];
    const order = [0, 1, 1, 0];
    for (let i = 0; i < this.legAngles.length; i += 1) {
      const which = order[i] ?? 0;
      this.legAngles[i] = pair[which] ?? 0;
      this.legLifts[i] = lift[which] ?? 0;
    }
    // Ближняя передняя лапа (2) копает сама по себе: на шаге её угол тот же,
    // что у пары, а при взмахе копания твинится только она одна.
    this.legAngles[2] = this.frontLegs[1]?.angle ?? 0;
    // Сетка на шаге приподнимается, а голова держится ровно: глаз и листик
    // нарисованы отдельно от сетки и уехали бы с неё на высоту шага.
    // Поэтому цель шеи опускаем на тот же подъём — в своих координатах сетки.
    const bob = plane.y - this.planeRestY;
    const turn = applyWarp(
      plane,
      this.planeBounds,
      this.headWrap.x,
      this.headWrap.y - bob,
      this.legAngles,
      this.legLifts,
      // Хвост качают те же твины, что и у диплодока из кода: рисованный
      // хвост сидит на сетке, а его угол берём у невидимой картинки.
      // Кончику достаётся угол постарше — так хвост идёт волной.
      this.tailImg.angle,
      this.rememberTail(this.tailImg.angle),
      this.neckRootGain,
    );
    // Вершины сетки в экранные Phaser переводит раньше, чем мы их согнули:
    // пересчитываем сразу, иначе сетка отстаёт от глаза на шаг.
    plane.refresh();
    // Глаз и листик нарисованы отдельно: доворачиваем их вместе с головой, но
    // не повторно за твины headWrap (радость, копание, жевание): сетка с ними
    // не поворачивается.
    this.headTurn.setRotation(dinoEyeTurn(turn, this.headWrap.rotation));
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
