/**
 * Диплодок, который ходит по карте квеста, — одной картинкой.
 *
 * В лесу диплодок собран из частей: шея там живая, тянется к кронам.
 * На карте шея не нужна, зато нужен цельный рисованный диплодок, поэтому
 * здесь спрайт целиком, а оживляют его покачивание и шаг-подпрыгивание.
 *
 * Набор методов совпадает с Diplodocus: сцена карты работает с обоими
 * через WalkingDino и не знает, кто внутри.
 */
import Phaser from 'phaser';
import { DINO_MESH } from '../art/dinoArtMeta';
import { TEX } from '../art/keys';
import { MAP_DINO } from '../art/layout';

/** Что сцене карты нужно от диплодока — и от рисованного, и от собранного. */
export interface WalkingDino {
  readonly root: Phaser.GameObjects.Container;
  setPosition(x: number, y: number): void;
  setWalking(walking: boolean, dirX?: number): void;
  playJoy(): void;
  showHint(visible: boolean): void;
  update(time: number, delta: number): void;
  destroy(): void;
}

/** Шаг: подпрыгивание и покачивание. */
const STEP_MS = 320;
const STEP_RISE = 7;
const STEP_TILT = 3;
/** Покой: дыхание. */
const BREATH_MS = 2200;
const BREATH = 0.02;

/**
 * Глаз отдельной картинкой — иначе диплодок на карте слепой.
 *
 * На `dino-whole.png` глаза нет совсем: его вырезал `tools/dino_art.py`,
 * чтобы риг в лесу мог моргать, и на рисунке осталась пустая глазница. В лесу
 * глаз кладёт риг, а на карте класть было некому, и ребёнок видел слепую
 * морду. Место глаза измерено тем же инструментом и лежит в `DINO_MESH`,
 * в пикселях рисунка; рисунок стоит origin (0.5, 1), поэтому считаем
 * от середины и от низа.
 *
 * Сама картинка глаза сохранена в пикселях *рига* — вчетверо мельче рисунка,
 * риг в лесу кладёт её уже ужатым. Здесь мы внутри пикселей рисунка, поэтому
 * глаз растягиваем обратно: 9×11 превращаются в 28×34 и точно садятся
 * в пустую глазницу. Без этого на морде оставалась точка в полпикселя.
 */
function eyeOf(scene: Phaser.Scene, image: Phaser.GameObjects.Image): Phaser.GameObjects.Image[] {
  if (!scene.textures.exists(DINO_MESH.eyeKey)) return [];
  return [
    scene.add.image(
      DINO_MESH.eyeX - image.width / 2,
      DINO_MESH.eyeY - image.height,
      DINO_MESH.eyeKey,
    ),
  ];
}

export class MapWalker implements WalkingDino {
  readonly root: Phaser.GameObjects.Container;

  /** Рисунок и глаз вместе: качается, шагает и разворачивается всё разом. */
  private readonly body: Phaser.GameObjects.Container;
  /** Во сколько раз рисунок ужат до роста на карте. */
  private readonly fit: number;
  /** Куда смотрит картинка по умолчанию: вправо. */
  private facing = 1;
  private walking = false;
  private phase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Куда он встаёт относительно узла, решает сцена: она берёт сдвиг из
    // MAP_DINO, и тот же сдвиг проверяет тест раскладки.
    const image = scene.add.image(0, 0, TEX.DINO_WHOLE).setOrigin(0.5, 1);
    this.fit = MAP_DINO.height / image.height;
    // Внутри контейнера живём в пикселях рисунка, ужимает всех контейнер.
    this.body = scene.add.container(0, 0, [image, ...eyeOf(scene, image)]).setScale(this.fit);
    this.root = scene.add.container(x, y, [this.body]);
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  setWalking(walking: boolean, dirX?: number): void {
    this.walking = walking;
    if (dirX !== undefined && dirX !== 0) {
      this.facing = dirX > 0 ? 1 : -1;
    }
    if (!walking) {
      this.body.setAngle(0);
      this.body.setY(0);
    }
  }

  /** Радость: подпрыгнуть и качнуться. */
  playJoy(): void {
    const scene = this.body.scene;
    scene.tweens.add({
      targets: this.body,
      y: -22,
      duration: 220,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeOut',
    });
    scene.tweens.add({
      targets: this.body,
      angle: { from: -7, to: 7 },
      duration: 160,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => this.body.setAngle(0),
    });
  }

  /** Подсказки на карте нет — метод есть ради общего набора. */
  showHint(): void {
    /* на карте не нужна */
  }

  update(_time: number, delta: number): void {
    const scaleX = this.fit * this.facing;
    if (this.walking) {
      this.phase += delta / STEP_MS;
      const step = Math.sin(this.phase * Math.PI * 2);
      this.body.setY(-Math.abs(step) * STEP_RISE);
      this.body.setAngle(step * STEP_TILT * this.facing);
      this.body.setScale(scaleX, this.fit);
      return;
    }
    this.phase += delta / BREATH_MS;
    const breath = Math.sin(this.phase * Math.PI * 2) * BREATH;
    this.body.setScale(scaleX * (1 - breath * 0.5), this.fit * (1 + breath));
  }

  destroy(): void {
    this.root.destroy();
  }
}
