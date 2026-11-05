/**
 * Загрузка.
 *
 * Игра умеет жить в двух состояниях: вся графика нарисована кодом (как было
 * с самого начала) либо часть ключей подменена готовыми спрайтами. Что именно
 * подменено, говорит `public/art/manifest.json`: ключ текстуры → имя файла.
 * Сначала грузим файлы из манифеста, потом дорисовываем кодом только то,
 * чего не загрузилось. Поэтому художник может добавлять спрайты по одному,
 * и ничего в сценах менять не нужно.
 */
import Phaser from 'phaser';
import { generateCritterTextures } from '../art/critters';
import { generateFootballTextures } from '../art/football';
import { generateForestTextures } from '../art/forest';
import { TEX } from '../art/keys';
import { themeTexture } from '../art/themes';
import { generateTreasureTextures } from '../art/treasureArt';
import { generateUiTextures } from '../art/ui';
import { SCENE } from '../types';

const MANIFEST_KEY = 'art-manifest';

/** Декор, который экраны-меню рисуют «просто так», без привязки к теме. */
const BASE_DECOR: readonly string[] = [
  ...TEX.TREE,
  ...TEX.BUSH,
  ...TEX.ROCK,
  ...TEX.STUMP,
  ...TEX.FLOWER,
  ...TEX.GRASS,
  TEX.GROUND,
];

interface ArtManifest {
  images?: Record<string, string>;
}

export class BootScene extends Phaser.Scene {
  /** Текстуры достраиваются один раз: и по концу загрузки, и по сторожу. */
  private built = false;

  constructor() {
    super(SCENE.BOOT);
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.json(MANIFEST_KEY, base + 'art/manifest.json');
  }

  create(): void {
    const files = this.manifestImages();
    if (files.length === 0) {
      this.buildTextures();
      return;
    }

    const base = import.meta.env.BASE_URL;
    // Предел одновременных загрузок по умолчанию — 32. Когда спрайтов стало
    // больше, последний так и остался в очереди, и загрузка не кончалась:
    // игра навсегда замирала на пустом экране.
    this.load.maxParallelDownloads = Math.max(32, files.length + 1);
    for (const [key, file] of files) this.load.image(key, base + 'art/' + file);
    // Пропавший файл не должен ронять игру: ключ просто останется процедурным.
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.buildTextures());
    // Сторож на случай, если загрузка всё-таки где-то застрянет: лучше показать
    // игру с нарисованными кодом заглушками, чем не показать ничего.
    this.time.delayedCall(8000, () => this.buildTextures());
    this.load.start();
  }

  private manifestImages(): [string, string][] {
    const data: unknown = this.cache.json.get(MANIFEST_KEY);
    if (data === null || typeof data !== 'object') return [];
    const images = (data as ArtManifest).images;
    if (images === undefined || images === null || typeof images !== 'object') return [];
    return Object.entries(images).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    );
  }

  /** Всё, что не пришло файлом, рисуем кодом: генераторы пропускают занятые ключи. */
  private buildTextures(): void {
    if (this.built) return;
    this.built = true;
    generateForestTextures(this, 'summer');
    this.aliasSummerTextures();
    generateTreasureTextures(this);
    generateUiTextures(this);
    generateCritterTextures(this);
    generateFootballTextures(this);
    this.scene.start(SCENE.START);
  }

  /**
   * Текстуры декора живут под именами с темой ('tree-a@summer').
   * Чтобы экраны вне леса могли просто брать TEX.TREE[0], заводим на летние
   * текстуры псевдонимы с базовыми именами — та же картинка, второе имя.
   */
  private aliasSummerTextures(): void {
    for (const key of BASE_DECOR) {
      if (this.textures.exists(key)) continue;
      const themed = themeTexture(key, 'summer');
      if (!this.textures.exists(themed)) continue;
      const source = this.textures.get(themed).getSourceImage();
      if (source instanceof HTMLCanvasElement) this.textures.addCanvas(key, source);
    }
  }
}
