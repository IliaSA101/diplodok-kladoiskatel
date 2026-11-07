/**
 * Первый экран игры: выбор версии. Три карточки в ряд понизу:
 * «Лес с кладами» (сундук), «Футбол» (мяч) и «Английский» (буквы).
 * Вся карточка — кнопка, подпись продублирована крупной картинкой.
 *
 * Диплодок виден целиком и стоит над карточками: он главный герой экрана,
 * прятать его за карточку нельзя. Ради этого линия горизонта поднята,
 * а карточки ниже и площе, чем были при двух версиях.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PALETTE } from '../art/palette';
import { TEX } from '../art/keys';
import {
  APP_VERSION,
  PARENTS_CORNER,
  START_CARD,
  VERSION_LABEL,
  versionLabelAnchor,
  versionText,
} from '../art/startLayout';
import { createPanel, createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { Diplodocus } from '../entities/Diplodocus';
import { SCENE } from '../types';
import { openParentsMenu } from './parentsMenu';

/** Линия горизонта: выше — небо, ниже — трава. Поднята ради диплодока. */
const HORIZON_Y = Math.round(GAME_HEIGHT * 0.58);

const CARD_W = START_CARD.w;
const CARD_H = START_CARD.h;
const CARD_STEP = START_CARD.step;
const CARD_Y = START_CARD.y;
/** Крупная картинка на карточке: длинная сторона, px. */
const CARD_ICON_SIZE = 104;
const CARD_LABEL_SIZE = 38;

/** Через сколько после нажатия уходим со сцены — чтобы «проваливание» было видно. */
const LEAVE_DELAY_MS = 200;

const CORNER_SIZE = PARENTS_CORNER.size;
const CORNER_HOLD_MS = PARENTS_CORNER.holdMs;

interface Card {
  readonly container: Phaser.GameObjects.Container;
  /** Масштабируется при нажатии. */
  readonly pressBody: Phaser.GameObjects.Container;
  /** Мягкая пульсация. */
  readonly pulseBody: Phaser.GameObjects.Container;
}

/** Вписать картинку в квадрат size×size, сохранив пропорции. */
function fitImage(image: Phaser.GameObjects.Image, size: number): void {
  image.setScale(size / Math.max(image.width, image.height, 1));
}

export class StartScene extends Phaser.Scene {
  private dino: Diplodocus | null = null;
  private leaving = false;
  /** Меню взрослых открыто: клавиши молчат. */
  private parentsOpen = false;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private keyUnlock: (() => void) | null = null;
  private pickForest: () => void = () => undefined;
  private pickFootball: () => void = () => undefined;
  private pickEnglish: () => void = () => undefined;

  constructor() {
    super(SCENE.START);
  }

  init(): void {
    this.leaving = false;
    this.parentsOpen = false;
    this.dino = null;
    this.keyHandler = null;
    this.keyUnlock = null;
    this.pickForest = () => undefined;
    this.pickFootball = () => undefined;
    this.pickEnglish = () => undefined;
  }

  create(): void {
    this.drawBackground();

    // Название вверху, чуть покачивается.
    const title = createText(this, GAME_WIDTH / 2, 76, 'Диплодок Кладоискатель', CONFIG.ui.fontSizeBig);
    title.setAngle(-1.2);
    this.tweens.add({
      targets: title,
      angle: 1.2,
      duration: 2300,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Диплодок по центру: просто стоит, дышит и моргает.
    // Его корпус смещён влево от точки привязки, поэтому чуть сдвигаем вправо.
    const dino = new Diplodocus(this, GAME_WIDTH / 2 + 26, HORIZON_Y + 30, { scale: 1.05 });
    dino.showHint(false);
    this.dino = dino;

    // Карточки в ряд: лес, футбол, английский.
    const forest = this.createCard(
      GAME_WIDTH / 2 - CARD_STEP,
      CARD_Y,
      TEX.CHEST_CLOSED,
      'Лес с кладами',
      () => this.choose(SCENE.MENU, forest),
    );
    const football = this.createCard(
      GAME_WIDTH / 2,
      CARD_Y,
      TEX.FOOT[0],
      'Футбол',
      () => this.choose(SCENE.QUEST_MAP, football),
    );
    const english = this.createCard(
      GAME_WIDTH / 2 + CARD_STEP,
      CARD_Y,
      null,
      'Английский',
      () => this.choose(SCENE.ENGLISH, english),
    );
    this.pulseCard(forest, 0);
    this.pulseCard(football, 450);
    this.pulseCard(english, 900);
    this.pickForest = () => this.choose(SCENE.MENU, forest);
    this.pickFootball = () => this.choose(SCENE.QUEST_MAP, football);
    this.pickEnglish = () => this.choose(SCENE.ENGLISH, english);

    this.createSoundButton();
    this.createParentsCorner();
    this.createVersionLabel();
    this.setupInput();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      const keyboard = this.input.keyboard;
      if (keyboard !== null) {
        if (this.keyHandler !== null) keyboard.off('keydown', this.keyHandler);
        if (this.keyUnlock !== null) keyboard.off('keydown', this.keyUnlock);
      }
      this.keyHandler = null;
      this.keyUnlock = null;
      this.dino?.destroy();
      this.dino = null;
    });
  }

  override update(time: number, delta: number): void {
    this.dino?.update(time, delta);
  }

  /** Карточка-кнопка: кремовая панель, крупная картинка и подпись. */
  private createCard(
    x: number,
    y: number,
    iconKey: string | null,
    label: string,
    onPress: () => void,
  ): Card {
    const panel = createPanel(this, 0, 0, CARD_W, CARD_H);
    const icon = this.cardIcon(iconKey);
    const text = createText(this, 0, CARD_H / 2 - 42, label, CARD_LABEL_SIZE, PALETTE.uiText);
    // Длинная подпись не должна вылезать за край карточки.
    const maxWidth = CARD_W - 40;
    if (text.width > maxWidth) text.setScale(maxWidth / text.width);

    const pulseBody = this.add.container(0, 0, [panel, ...icon, text]);
    const pressBody = this.add.container(0, 0, [pulseBody]);
    const container = this.add.container(x, y, [pressBody]);

    // Нажимается вся карточка целиком.
    container.setSize(CARD_W, CARD_H);
    container.setInteractive({ useHandCursor: true });
    container.on(Phaser.Input.Events.POINTER_DOWN, onPress);

    return { container, pressBody, pulseBody };
  }

  /**
   * Картинка карточки: готовый спрайт или буквы.
   *
   * У английской ветки своего спрайта нет и не надо: её узнают по буквам,
   * и это те же плашки, из которых собраны сами игры.
   */
  private cardIcon(iconKey: string | null): Phaser.GameObjects.GameObject[] {
    if (iconKey !== null) {
      const image = this.add.image(0, -26, iconKey);
      fitImage(image, CARD_ICON_SIZE);
      return [image];
    }
    const parts: Phaser.GameObjects.GameObject[] = [];
    const size = 64;
    ['a', 'b', 'c'].forEach((char, i) => {
      const x = (i - 1) * 68;
      const angle = (i - 1) * 7;
      const tile = this.add.image(x, -26, TEX.LETTER_TILE).setDisplaySize(size, size).setAngle(angle);
      const text = createText(this, x, -28, char, Math.round(size * 0.56), PALETTE.uiText);
      text.setAngle(angle);
      parts.push(tile, text);
    });
    return parts;
  }

  private pulseCard(card: Card, delay: number): void {
    this.tweens.add({
      targets: card.pulseBody,
      scale: START_CARD.pulse,
      duration: 1000,
      delay,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Выбор версии: звук, «проваливание» карточки и переход. */
  private choose(target: string, card: Card): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.play('tap');
    this.tweens.killTweensOf(card.pulseBody);
    card.pulseBody.setScale(1);
    this.tweens.add({
      targets: card.pressBody,
      scale: 0.95,
      duration: 90,
      ease: 'Sine.easeOut',
      yoyo: true,
    });
    this.time.delayedCall(LEAVE_DELAY_MS, () => this.scene.start(target));
  }

  /** Разблокировка звука первым жестом и клавиши: 1 / ← — лес, 2 — футбол, 3 / → — английский. */
  private setupInput(): void {
    // iOS Safari: звук разблокируется только жестом пользователя.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());

    const keyboard = this.input.keyboard;
    if (keyboard === null) return;

    this.keyUnlock = () => audio.unlock();
    keyboard.once('keydown', this.keyUnlock);

    this.keyHandler = (event: KeyboardEvent) => {
      if (this.parentsOpen) return;
      if (event.key === '1' || event.key === 'ArrowLeft') this.pickForest();
      else if (event.key === '2') this.pickFootball();
      else if (event.key === '3' || event.key === 'ArrowRight') this.pickEnglish();
    };
    keyboard.on('keydown', this.keyHandler);
  }

  /**
   * Спрятанная кнопка для взрослых: держать нижний левый угол две секунды.
   *
   * Угол нарочно меньше карточки и левее её края: иначе одно и то же
   * нажатие спорило бы — уйти в лес или открыть меню взрослых.
   *
   * Меню (`parentsMenu.ts`): файл прогресса, возврат из файла, резервная копия, отчёт
   * о сбое и «Стереть всё». Стирать всю игру целиком ребёнку незачем — для него есть
   * «заново» у каждого леса и круга квеста, — и эта кнопка не должна попадаться под палец.
   */
  private createParentsCorner(): void {
    const zone = this.add
      .zone(0, GAME_HEIGHT - CORNER_SIZE, CORNER_SIZE, CORNER_SIZE)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });

    let timer: Phaser.Time.TimerEvent | null = null;
    const stop = (): void => {
      timer?.remove(false);
      timer = null;
    };
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
      stop();
      timer = this.time.delayedCall(CORNER_HOLD_MS, () => {
        timer = null;
        if (this.parentsOpen) return;
        // Пока меню открыто, «1/2/3» и стрелки не уводят со сцены.
        this.parentsOpen = true;
        openParentsMenu(this, { onClose: () => (this.parentsOpen = false) });
      });
    });
    zone.on(Phaser.Input.Events.POINTER_UP, stop);
    zone.on(Phaser.Input.Events.POINTER_OUT, stop);
  }

  /**
   * Номер версии для взрослого: мелко в правом нижнем углу, под карточкой
   * «Английский». Не кнопка и нажатий не ждёт; цвет приглушён, альфа не тронута.
   */
  private createVersionLabel(): void {
    const anchor = versionLabelAnchor();
    this.add
      .text(anchor.x, anchor.y, versionText(APP_VERSION), {
        fontFamily: CONFIG.ui.fontFamily,
        fontSize: `${VERSION_LABEL.size}px`,
        fontStyle: 'bold',
        color: `#${VERSION_LABEL.color.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(anchor.originX, anchor.originY);
  }

  /** Кнопка звука в правом верхнем углу (как в меню). */
  private createSoundButton(): void {
    const iconFor = (): string => (audio.muted ? TEX.ICON_SOUND_OFF : TEX.ICON_SOUND_ON);
    const radius = CONFIG.ui.smallButtonRadius;
    const button = createRoundButton(
      this,
      GAME_WIDTH - CONFIG.ui.padding - radius,
      CONFIG.ui.padding + radius,
      iconFor(),
      () => {
        audio.unlock();
        audio.toggleMuted();
        button.setIcon(iconFor());
      },
      { radius, tone: 'calm' },
    );
  }

  /** Небо с градиентом, облака, холм, земля и деревья по краям — как в меню. */
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
    g.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 20);

    g.fillStyle(0xffffff, 0.75);
    const clouds: ReadonlyArray<readonly [number, number, number]> = [
      [GAME_WIDTH * 0.2, 170, 1],
      [GAME_WIDTH * 0.55, 150, 0.8],
      [GAME_WIDTH * 0.86, 190, 1.1],
    ];
    for (const [cx, cy, k] of clouds) {
      g.fillEllipse(cx, cy, 190 * k, 54 * k);
      g.fillEllipse(cx - 40 * k, cy - 22 * k, 100 * k, 56 * k);
      g.fillEllipse(cx + 34 * k, cy - 18 * k, 120 * k, 60 * k);
    }

    g.fillStyle(PALETTE.grassLight, 1);
    g.fillEllipse(GAME_WIDTH * 0.5, HORIZON_Y + 24, GAME_WIDTH * 0.9, 120);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y);
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillRect(0, HORIZON_Y, GAME_WIDTH, 12);
    g.fillStyle(PALETTE.grassDark, 1);
    g.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);

    // Деревья по краям (карточки лягут поверх, часть крон выглянет сверху).
    this.add.image(40, HORIZON_Y + 86, TEX.TREE[0]).setOrigin(0.5, 1).setScale(0.86);
    this.add.image(GAME_WIDTH - 34, HORIZON_Y + 96, TEX.TREE[1]).setOrigin(0.5, 1).setScale(0.86);
  }
}
