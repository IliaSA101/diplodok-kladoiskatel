/**
 * Загрузка: внешних файлов нет, поэтому «загрузка» — это генерация
 * всех текстур кодом. Занимает доли секунды, после чего сразу меню.
 */
import Phaser from 'phaser';
import { generateForestTextures } from '../art/forest';
import { generateTreasureTextures } from '../art/treasureArt';
import { generateUiTextures } from '../art/ui';
import { SCENE } from '../types';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }

  create(): void {
    generateForestTextures(this);
    generateTreasureTextures(this);
    generateUiTextures(this);
    this.scene.start(SCENE.MENU);
  }
}
