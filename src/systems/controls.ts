/**
 * Управление: стрелки / WASD — движение, Пробел — действие.
 * Тап по карте обрабатывает сама сцена леса.
 */
import Phaser from 'phaser';

export interface Direction {
  x: number;
  y: number;
}

export class Controls {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private space: Phaser.Input.Keyboard.Key | null = null;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (keyboard === null) return;

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.keys['up'] = keyboard.addKey(codes.UP);
    this.keys['down'] = keyboard.addKey(codes.DOWN);
    this.keys['left'] = keyboard.addKey(codes.LEFT);
    this.keys['right'] = keyboard.addKey(codes.RIGHT);
    this.keys['w'] = keyboard.addKey(codes.W);
    this.keys['a'] = keyboard.addKey(codes.A);
    this.keys['s'] = keyboard.addKey(codes.S);
    this.keys['d'] = keyboard.addKey(codes.D);
    this.space = keyboard.addKey(codes.SPACE);
  }

  /** Направление движения с клавиатуры; (0, 0) — клавиши не нажаты. */
  get direction(): Direction {
    const down = (name: string): boolean => this.keys[name]?.isDown === true;
    const x = (down('right') || down('d') ? 1 : 0) - (down('left') || down('a') ? 1 : 0);
    const y = (down('down') || down('s') ? 1 : 0) - (down('up') || down('w') ? 1 : 0);
    return { x, y };
  }

  /** Пробел только что нажали. */
  get actionJustPressed(): boolean {
    return this.space !== null && Phaser.Input.Keyboard.JustDown(this.space);
  }

  destroy(): void {
    for (const key of Object.values(this.keys)) key.destroy();
    this.space?.destroy();
  }
}
