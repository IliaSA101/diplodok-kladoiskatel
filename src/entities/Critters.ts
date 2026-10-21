import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { makeRng } from '../systems/rng';
import type { Rng } from '../systems/rng';

/** Дистанция до диплодока, ближе которой бабочка пугается. */
const FLEE_DISTANCE = 130;
/** Сколько мс бабочка помнит испуг и разгоняется прочь. */
const FLEE_MS = 1000;
const FLEE_SPEED = 260;
/** Насколько далеко за краем камеры существо считается потерянным и переставляется. */
const LOST_MARGIN = 220;
/** Глубина светлячков: поверх ночного затемнения (90000). */
const FIREFLY_DEPTH = 95000;
/** Глубина стрелки белки: выше деревьев, но под затемнением. */
const ARROW_DEPTH = 95000; // выше ночной вуали (90000): подсказку белки видно и ночью

const TWO_PI = Math.PI * 2;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Бабочки днём или светлячки ночью. Живут в видимой части мира и разлетаются от диплодока.
 * Всё состояние лежит в типизированных массивах, в update() нет аллокаций.
 */
export class Critters {
  private readonly scene: Phaser.Scene;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly butterflies: boolean;
  private readonly rng: Rng;
  private readonly count: number;
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  // Состояние каждого существа
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  /** Курс полёта (радианы). */
  private readonly heading: Float32Array;
  /** Обычная скорость, px/с. */
  private readonly speed: Float32Array;
  private readonly phaseA: Float32Array;
  private readonly phaseB: Float32Array;
  /** Остаток испуга, мс (только бабочки). */
  private readonly fear: Float32Array;
  /** Плавное появление после перестановки, 0..1. */
  private readonly fade: Float32Array;

  constructor(scene: Phaser.Scene, kind: 'butterflies' | 'fireflies', count?: number) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.butterflies = kind === 'butterflies';
    this.count = count ?? (this.butterflies ? 14 : 22);
    this.rng = makeRng((Math.random() * 2147483646 + 1) | 0);

    const n = this.count;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.phaseA = new Float32Array(n);
    this.phaseB = new Float32Array(n);
    this.fear = new Float32Array(n);
    this.fade = new Float32Array(n);

    const view = this.cam.worldView;
    for (let i = 0; i < n; i += 1) {
      const rng = this.rng;
      this.phaseA[i] = rng.range(0, TWO_PI);
      this.phaseB[i] = rng.range(0, TWO_PI);
      this.heading[i] = rng.range(0, TWO_PI);
      this.fade[i] = 1;
      this.speed[i] = this.butterflies ? rng.range(60, 110) : rng.range(14, 30);
      this.placeInView(i, view);

      const sprite = this.butterflies ? this.makeButterfly(i) : this.makeFirefly(i);
      this.sprites.push(sprite);
    }
  }

  /** Вызывать каждый кадр из update сцены. */
  update(time: number, delta: number, dinoX: number, dinoY: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const view = this.cam.worldView;
    const cx = view.centerX;
    const cy = view.centerY;

    for (let i = 0; i < this.count; i += 1) {
      let x = this.px[i] as number;
      let y = this.py[i] as number;
      let vx = this.vx[i] as number;
      let vy = this.vy[i] as number;
      let ang = this.heading[i] as number;
      const pa = this.phaseA[i] as number;
      const pb = this.phaseB[i] as number;

      // Улетевших далеко за камеру тихо переставляем внутрь видимой области
      if (
        x < view.x - LOST_MARGIN || x > view.right + LOST_MARGIN ||
        y < view.y - LOST_MARGIN || y > view.bottom + LOST_MARGIN
      ) {
        this.placeInView(i, view);
        x = this.px[i] as number;
        y = this.py[i] as number;
        vx = 0;
        vy = 0;
        if (this.butterflies) this.fade[i] = 0;
      }

      // Мягкая неровная траектория: две синусоиды с разными частотами крутят курс
      const turn = this.butterflies
        ? Math.sin(time * 0.0013 + pa) * 1.9 + Math.sin(time * 0.0031 + pb) * 1.2
        : Math.sin(time * 0.0006 + pa) * 0.9 + Math.sin(time * 0.0017 + pb) * 0.7;
      ang += turn * dt;

      // Вышли за видимую область — плавно разворачиваемся к её центру
      if (x < view.x || x > view.right || y < view.y || y > view.bottom) {
        const back = Phaser.Math.Angle.Wrap(Math.atan2(cy - y, cx - x) - ang);
        ang += back * dt * 2.5;
      }

      let sp = this.speed[i] as number;
      if (this.butterflies) sp *= 0.75 + 0.25 * Math.sin(time * 0.002 + pb);
      let wantX = Math.cos(ang) * sp;
      let wantY = Math.sin(ang) * sp;
      let rate = 3;

      const dx = x - dinoX;
      const dy = y - dinoY;
      const d2 = dx * dx + dy * dy;

      if (this.butterflies) {
        // Испуг: пока диплодок близко, держим бабочку в режиме бегства ещё ~1 с
        let fear = this.fear[i] as number;
        if (d2 < FLEE_DISTANCE * FLEE_DISTANCE && d2 > 1) fear = FLEE_MS;
        else if (fear > 0) fear = Math.max(0, fear - delta);
        this.fear[i] = fear;

        if (fear > 0) {
          const d = Math.sqrt(d2) || 1;
          // Скорость нарастает за счёт плавного приближения к целевой (~1 с разгона)
          wantX = (dx / d) * FLEE_SPEED;
          wantY = (dy / d) * FLEE_SPEED;
          rate = 2.2;
          ang = Math.atan2(vy, vx);
        }
      } else if (d2 > 120 * 120 && d2 < 900 * 900) {
        // Светлячки чуть тянутся к диплодоку, но у самого носа не толпятся
        const d = Math.sqrt(d2);
        wantX -= (dx / d) * 18;
        wantY -= (dy / d) * 18;
      }

      const k = Math.min(1, dt * rate);
      vx += (wantX - vx) * k;
      vy += (wantY - vy) * k;
      x += vx * dt;
      y += vy * dt;

      // Держим курс в пределах -PI..PI, чтобы он не разрастался
      if (ang > Math.PI) ang -= TWO_PI;
      else if (ang < -Math.PI) ang += TWO_PI;

      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.heading[i] = ang;

      const sprite = this.sprites[i] as Phaser.GameObjects.Image;
      if (this.butterflies) {
        // Лёгкое покачивание по высоте и наклон по направлению полёта
        sprite.setPosition(x, y + Math.sin(time * 0.004 + pa) * 6);
        sprite.setDepth(y);
        sprite.setRotation(clamp(vx / FLEE_SPEED, -1, 1) * 0.35);
        let fade = this.fade[i] as number;
        if (fade < 1) {
          fade = Math.min(1, fade + dt * 1.5);
          this.fade[i] = fade;
          sprite.setAlpha(fade);
        }
      } else {
        sprite.setPosition(x, y + Math.sin(time * 0.0016 + pa) * 5);
      }
    }
  }

  destroy(): void {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
    for (const s of this.sprites) s.destroy();
    this.sprites.length = 0;
  }

  /** Ставит существо в случайную точку видимой области, не у самого края. */
  private placeInView(i: number, view: Phaser.Geom.Rectangle): void {
    const insetX = view.width * 0.12;
    const insetY = view.height * 0.12;
    this.px[i] = this.rng.range(view.x + insetX, view.right - insetX);
    this.py[i] = this.rng.range(view.y + insetY, view.bottom - insetY);
  }

  private makeButterfly(i: number): Phaser.GameObjects.Image {
    const rng = this.rng;
    const key = TEX.BUTTERFLY[i % TEX.BUTTERFLY.length] as string;
    const sprite = this.scene.add.image(this.px[i] as number, this.py[i] as number, key);
    const s = rng.range(1.0, 1.35);
    sprite.setScale(s);
    sprite.setDepth(this.py[i] as number);
    // Взмах: сжатие крыльев по горизонтали
    this.tweens.push(this.scene.tweens.add({
      targets: sprite,
      scaleX: { from: s * 0.35, to: s },
      duration: rng.range(125, 160),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: rng.range(0, 140),
    }));
    return sprite;
  }

  private makeFirefly(i: number): Phaser.GameObjects.Image {
    const rng = this.rng;
    const sprite = this.scene.add.image(this.px[i] as number, this.py[i] as number, TEX.FIREFLY);
    sprite.setScale(rng.range(0.8, 1.3));
    sprite.setDepth(FIREFLY_DEPTH);
    sprite.setBlendMode(Phaser.BlendModes.ADD);
    sprite.setAlpha(rng.range(0.25, 1));
    // Мерцание: у каждого свой период 1.2-2.6 с и своя фаза
    const period = rng.range(1200, 2600);
    this.tweens.push(this.scene.tweens.add({
      targets: sprite,
      alpha: { from: 0.25, to: 1 },
      duration: period / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: rng.range(0, period),
    }));
    return sprite;
  }
}

/** Белка-подсказчица: сидит на месте, по просьбе показывает лапкой направление. */
export class Squirrel {
  /** Сколько длится показ направления, мс. */
  private static readonly POINT_MS = 2200;

  private readonly scene: Phaser.Scene;
  private readonly body: Phaser.GameObjects.Image;
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly baseY: number;
  private readonly posX: number;
  private readonly posY: number;
  private readonly rng: Rng;
  private breathTween: Phaser.Tweens.Tween | null = null;
  private jumpTween: Phaser.Tweens.Tween | null = null;
  private twitchTween: Phaser.Tweens.Tween | null = null;
  private twitchTimer: Phaser.Time.TimerEvent | null = null;
  private isPointing = false;
  private pointStart = 0;
  private pointEnd = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.posX = x;
    this.posY = y;
    this.baseY = y;
    this.rng = makeRng((Math.random() * 2147483646 + 1) | 0);

    // Низ текстуры стоит на земле, поэтому origin внизу: дыхание не отрывает лапы
    this.body = scene.add.image(x, y, TEX.SQUIRREL).setOrigin(0.5, 1).setDepth(y);
    this.arrow = scene.add.image(x, y - 160, TEX.SQUIRREL_ARROW)
      .setDepth(ARROW_DEPTH)
      .setVisible(false)
      .setAlpha(0);

    // Тихое дыхание
    this.breathTween = scene.tweens.add({
      targets: this.body,
      scaleY: { from: 1, to: 1.035 },
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.scheduleTwitch();
  }

  get x(): number {
    return this.posX;
  }

  get y(): number {
    return this.posY;
  }

  /** Показывает ли прямо сейчас (сцена не дёргает повторно). */
  get pointing(): boolean {
    return this.isPointing;
  }

  /** Показать направление (угол в радианах, как у Math.atan2): подпрыгнуть и выставить стрелку на ~2.2 с. */
  point(angle: number): void {
    // Смотрим в ту сторону, куда показываем
    this.body.setFlipX(Math.cos(angle) < 0);
    this.arrow.setRotation(angle);

    if (this.isPointing) return;
    this.isPointing = true;
    this.pointStart = this.scene.time.now;
    this.pointEnd = this.pointStart + Squirrel.POINT_MS;
    this.arrow.setVisible(true).setAlpha(0).setScale(1);

    // Подпрыгивание
    if (this.jumpTween) this.jumpTween.stop();
    this.body.y = this.baseY;
    this.jumpTween = this.scene.tweens.add({
      targets: this.body,
      y: this.baseY - 36,
      duration: 160,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.body.y = this.baseY;
      },
    });
  }

  update(time: number, _delta: number): void {
    if (!this.isPointing) return;
    if (time >= this.pointEnd) {
      this.isPointing = false;
      this.arrow.setVisible(false).setAlpha(0);
      return;
    }
    const elapsed = time - this.pointStart;
    // Плавно появляется за 0.2 с, гаснет за последние 0.35 с и мягко пульсирует
    const alpha = Math.min(1, elapsed / 200) * Math.min(1, (this.pointEnd - time) / 350);
    this.arrow.setAlpha(clamp(alpha, 0, 1));
    this.arrow.setScale(1 + 0.08 * Math.sin(elapsed * 0.009));
  }

  destroy(): void {
    if (this.twitchTimer) this.twitchTimer.remove(false);
    this.twitchTimer = null;
    if (this.twitchTween) this.twitchTween.stop();
    if (this.jumpTween) this.jumpTween.stop();
    if (this.breathTween) this.breathTween.stop();
    this.twitchTween = null;
    this.jumpTween = null;
    this.breathTween = null;
    this.body.destroy();
    this.arrow.destroy();
  }

  /** Раз в несколько секунд белка вздрагивает: быстрое покачивание, будто дёрнула хвостом. */
  private scheduleTwitch(): void {
    this.twitchTimer = this.scene.time.delayedCall(this.rng.range(2500, 6000), () => {
      this.twitchTween = this.scene.tweens.add({
        targets: this.body,
        rotation: { from: -0.04, to: 0.05 },
        duration: 70,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          this.body.setRotation(0);
          this.scheduleTwitch();
        },
      });
    });
  }
}
