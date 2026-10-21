/**
 * Загрузка: внешних файлов нет, поэтому «загрузка» — это генерация
 * всех текстур кодом. Занимает доли секунды, после чего сразу меню.
 */
import Phaser from 'phaser';
import { generateCritterTextures } from '../art/critters';
import { generateForestTextures } from '../art/forest';
import { TEX } from '../art/keys';
import { themeTexture } from '../art/themes';
import { generateTreasureTextures } from '../art/treasureArt';
import { generateUiTextures } from '../art/ui';
import { SCENE } from '../types';

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

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }

  create(): void {
    // Летний набор нужен сразу: он же стоит на экранах меню, выбора леса и победы.
    generateForestTextures(this, 'summer');
    this.aliasSummerTextures();
    generateTreasureTextures(this);
    generateUiTextures(this);
    generateCritterTextures(this);
    this.scene.start(SCENE.MENU);
  }

  /**
   * Текстуры декора теперь живут под именами с темой ('tree-a@summer').
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
