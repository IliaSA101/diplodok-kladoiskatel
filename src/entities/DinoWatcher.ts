/**
 * Диплодок, который просто смотрит, как ребёнок решает.
 *
 * Игра про диплодока, а на экранах задачек его не было вообще: футбольный
 * квест выглядел так, будто это другая игра. Ходить и тянуться к кронам тут
 * незачем, поэтому здесь нет ни рига, ни шеи — один рисунок целиком, как на
 * карте, только он не шагает, а дышит и моргает.
 *
 * Стоит он *за* панелью задачки: рисунок высокий, а видно только голову над
 * верхним краем да кончик хвоста из-под левого нижнего угла. Куда именно —
 * считает `art/dinoLayout.ts`, и тест стережёт, что голова не залезает ни на
 * панель, ни на заголовок, ни на кнопку «назад», а хвост из-под неё виден.
 *
 * Хвост — не второй рисунок, а кадр той же картинки: левее основания хвоста
 * на ней нет ничего постороннего, поэтому вырез берётся прямо из текстуры.
 * Так голова и хвост всегда одного зверя и одного масштаба.
 *
 * Готового арта может не быть (игра умеет рисовать себя кодом) — тогда
 * наблюдателя просто нет: `create` вернёт null, и ни одна сцена не упадёт.
 */
import Phaser from 'phaser';
import { DINO_MESH } from '../art/dinoArtMeta';
import { TEX } from '../art/keys';
import { DINO_CHEER, DINO_TAIL, DINO_WATCH_SPOT, type DinoSpot } from '../art/dinoLayout';

/** Глубина по умолчанию: над травой (-10), но под панелью задачки (0). */
const DEPTH = -5;

/** Дыхание: медленное и мелкое, иначе оно отвлекает от задачки. */
const BREATH_MS = 2400;
const BREATH = 0.018;

/** Имя кадра-выреза: добавляется в ту же текстуру один раз на всю игру. */

/** Хвост едва качается: это фон, а не анимация, на которую надо смотреть. */
const SWISH_MS = 3100;
const SWISH = 2.6;

/** Моргание: раз в несколько секунд, с разбросом — иначе похоже на часы. */
const BLINK_EVERY_MS = 3200;
const BLINK_SPREAD_MS = 2600;
const BLINK_MS = 90;

export class DinoWatcher {
  private readonly root: Phaser.GameObjects.Container;
  /** Рисунок и глаз вместе: качается и подпрыгивает всё разом. */
  private readonly body: Phaser.GameObjects.Container;
  private readonly eye: Phaser.GameObjects.Image | null;
  private readonly tail: Phaser.GameObjects.Image | null;
  /** Во сколько раз рисунок ужат до нужного роста. */
  private readonly fit: number;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  /** Идущий наклон: второй поверх первого не начинаем. */
  private tilting: Phaser.Tweens.Tween | null = null;

  private constructor(
    scene: Phaser.Scene,
    image: Phaser.GameObjects.Image,
    depth: number,
    spot: DinoSpot,
    parent: Phaser.GameObjects.Container | null,
  ) {
    this.fit = spot.height / image.height;
    // Внутри контейнера живём в пикселях рисунка, ужимает всех контейнер.
    this.eye = scene.textures.exists(DINO_MESH.eyeKey)
      ? scene.add
          .image(
            DINO_MESH.eyeX - image.width / 2,
            DINO_MESH.eyeY - image.height,
            DINO_MESH.eyeKey,
          )
      : null;
    const parts: Phaser.GameObjects.GameObject[] = this.eye === null ? [image] : [image, this.eye];
    this.body = scene.add.container(0, 0, parts).setScale(this.fit);
    this.root = scene.add
      .container(spot.centerX, spot.bottom, [this.body])
      .setDepth(depth)
      .setScrollFactor(0);
    // Экран «выпрыгивает» целиком (панель сокровищ, лист альбома): диплодок,
    // стоящий на нём, едет с ним, а не торчит на месте. Позиция тогда — в
    // координатах контейнера (`dinoSpotIn`).
    parent?.add(this.root);

    // Хвост-завиток привязан к углу панели задачки, и на хабе, где диплодок
    // стоит целиком и панели под ним нет, он бы просто лежал на траве сам по
    // себе. Там хвост на своём месте — на рисунке.
    this.tail = spot.tail ? DinoWatcher.makeTail(scene, image, depth, this.fit) : null;

    this.breathe(scene);
    this.planBlink(scene);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /**
    * Поставить наблюдателя на сцену; без готового арта его просто нет.
    *
    * `depth` — на сколько глубже панели он стоит. У задачек квеста панель на
    * нуле, у английских — на -5, поэтому число приходит снаружи: иначе на
    * английских экранах диплодок оказался бы поверх панели, во весь рост.
    * `parent` — контейнер, в который он встаёт: позиция тогда в координатах
    * контейнера (`dinoSpotIn`), а глубина решается порядком в нём.
    */
  static create(
    scene: Phaser.Scene,
    depth: number = DEPTH,
    spot: DinoSpot = DINO_WATCH_SPOT,
    parent: Phaser.GameObjects.Container | null = null,
  ): DinoWatcher | null {
    if (!scene.textures.exists(TEX.DINO_WHOLE)) return null;
    // Кадр назван явно: вырез хвоста живёт в этой же текстуре, и полагаться
    // на то, какой кадр у неё сейчас «первый», нельзя.
    const image = scene.add.image(0, 0, TEX.DINO_WHOLE, '__BASE').setOrigin(0.5, 1);
    return new DinoWatcher(scene, image, depth, spot, parent);
  }

  /**
   * Кончик хвоста из-под левого нижнего угла панели.
   *
   * Хвост — отдельная картинка, вырезанная по форме (`tools/dino_tail.py`):
   * прямоугольным кадром его не взять, он делает петлю и уходит вправо под
   * лапами. Раньше кадр добавлялся в текстуру целого диплодока прямо тут —
   * вместе с ловушкой `firstFrame`, из-за которой вся игра рисовала вместо
   * диплодока вырез хвоста. Отдельной текстуре эта ловушка не нужна.
   */
  private static makeTail(
    scene: Phaser.Scene,
    image: Phaser.GameObjects.Image,
    depth: number,
    fit: number,
  ): Phaser.GameObjects.Image | null {
    if (!scene.textures.exists(TEX.DINO_TAIL)) return null;
    // Точка отсчёта — центр завитка, а не угол картинки: завиток и качается
    // вокруг своего центра, и ставится по нему, поэтому подвинуть хвост
    // можно одной парой чисел, не пересчитывая вырез.
    const originX = (DINO_TAIL.curlX - DINO_TAIL.cutX) / DINO_TAIL.cutWidth;
    const originY = (DINO_TAIL.curlY - DINO_TAIL.cutY) / DINO_TAIL.cutHeight;
    // Масштаб общий с рисунком: иначе хвост и голова — звери разного размера.
    const tail = scene.add
      .image(DINO_TAIL.centerX, DINO_TAIL.centerY, TEX.DINO_TAIL)
      .setOrigin(originX, originY)
      .setScale(fit)
      .setAngle(DINO_TAIL.angle)
      .setDepth(depth)
      .setScrollFactor(0);
    scene.tweens.add({
      targets: tail,
      angle: DINO_TAIL.angle + SWISH,
      duration: SWISH_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    void image;
    return tail;
  }

  private breathe(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.body,
      scaleY: this.fit * (1 + BREATH),
      scaleX: this.fit * (1 - BREATH / 2),
      duration: BREATH_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private planBlink(scene: Phaser.Scene): void {
    const eye = this.eye;
    if (eye === null) return;
    const open = eye.scaleY;
    this.blinkTimer = scene.time.addEvent({
      delay: BLINK_EVERY_MS + Math.random() * BLINK_SPREAD_MS,
      loop: true,
      callback: () => {
        scene.tweens.add({
          targets: eye,
          scaleY: open * 0.1,
          duration: BLINK_MS,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  /** Решено: подпрыгнуть и качнуться — видно даже сквозь вуаль награды. */
  cheer(): void {
    const scene = this.body.scene;
    scene.tweens.add({
      targets: this.root,
      y: this.root.y - DINO_CHEER.jump,
      duration: 240,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeOut',
    });
    scene.tweens.add({
      targets: this.body,
      angle: { from: -DINO_CHEER.swayDeg, to: DINO_CHEER.swayDeg },
      duration: 170,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => this.body.setAngle(0),
    });
  }

  /**
   * Не вышло: наклонить голову и вернуть обратно.
   *
   * Это сочувствие, а не укор: проиграть в игре нельзя, и диплодок не должен
   * выглядеть недовольным. Поэтому наклон, а не отворачивание и не гримаса.
   */
  tilt(): void {
    // killTweensOf(body) убил бы заодно дыхание — оно висит на том же объекте
    // и больше не завелось бы. Поэтому не убиваем, а просто не начинаем второй.
    if (this.tilting?.isPlaying() === true) return;
    this.tilting = this.body.scene.tweens.add({
      targets: this.body,
      angle: 7,
      duration: 220,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.body.setAngle(0);
        this.tilting = null;
      },
    });
  }

  destroy(): void {
    this.blinkTimer?.remove(false);
    this.blinkTimer = null;
    this.tail?.destroy();
    this.root.destroy();
  }
}
