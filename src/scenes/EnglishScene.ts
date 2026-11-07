/**
 * Экран английской ветки: выбор набора слов и трёх игр.
 *
 * Сверху — наборы слов кружками (как круги квеста), под ними сами слова
 * с переводом, внизу три карточки-игры. Пройденная игра получает золотую
 * звезду, и по звёздам сразу видно, что в этом наборе ещё не трогали.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { SET_PICKER, setPickerSpots } from '../art/englishLayout';
import { ENGLISH_HUB } from '../art/layout';
import { createSetBadgeFigure } from '../art/setBadge';
import { createBackButton, createPanel, createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ENGLISH_GAMES, ENGLISH_SETS, englishSet, type EnglishGame } from '../data/english';
import { DinoWatcher } from '../entities/DinoWatcher';
import { askConfirm } from '../systems/confirm';
import { englishSave } from '../systems/englishSave';
import { onEscape } from '../systems/quest';
import { speech } from '../systems/speech';
import { SCENE, type EnglishGameData, type EnglishSceneData } from '../types';
import { createHintButton, createWordMark } from './englishUi';

const CARD_W = ENGLISH_HUB.cardWidth;
const CARD_H = ENGLISH_HUB.cardHeight;
const CARD_Y = ENGLISH_HUB.cardCenterY;
const CARD_STEP = ENGLISH_HUB.cardStep;
/** Звезда «игра пройдена» в правом верхнем углу карточки. */
const STAR_SIZE = 62;


/** Подпись и сцена каждой игры. */
const GAME_INFO: Record<EnglishGame, { label: string; scene: string }> = {
  anagram: { label: 'Make a word', scene: SCENE.ENGLISH_ANAGRAM },
  search: { label: 'Find a word', scene: SCENE.ENGLISH_SEARCH },
  catch: { label: 'Catch letters', scene: SCENE.ENGLISH_CATCH },
};

/**
 * Сторона значка слова в словаре.
 *
 * На тридцати четырёх читались только простые значки — сердце и глаза, —
 * а девочка с куклой и коробка превращались в цветное пятно. Сорок восемь
 * ещё помещаются в панель словаря: кружок «?» стоит рядом, а не под ними.
 */
const MARK_SIZE = 48;

export class EnglishScene extends Phaser.Scene {
  private setIndex = 0;
  private leaving = false;

  constructor() {
    super(SCENE.ENGLISH);
  }

  init(data: EnglishSceneData): void {
    const wanted = data.setIndex ?? this.firstUnfinishedSet();
    this.setIndex = Math.min(ENGLISH_SETS.length - 1, Math.max(0, Math.floor(wanted)));
    this.leaving = false;
  }

  create(): void {
    this.drawBackground();
    createText(this, GAME_WIDTH / 2, 56, 'English words', 46, PALETTE.uiTextLight).setDepth(2);

    this.createSetPicker();
    this.createWordList();
    ENGLISH_GAMES.forEach((game, i) => {
      this.createGameCard(game, GAME_WIDTH / 2 + (i - 1) * CARD_STEP, CARD_Y);
    });

    // Диплодок тут не выглядывает из-за панели, как на задачках: справа вверху
    // стоит кнопка звука, и голова легла бы прямо на неё. Поэтому он стоит
    // целиком на траве под карточками — там единственная свободная полоса.
    DinoWatcher.create(this, 3, { ...ENGLISH_HUB.dino, tail: false });

    const back = createBackButton(this, () => this.goTo(SCENE.START));
    back.container.setDepth(10);
    this.createSoundButton();
    this.createResetButton();

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      audio.unlock();
      speech.warmUp();
    });
    onEscape(this, () => this.goTo(SCENE.START));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      speech.stop();
    });
  }

  /** Первый набор, в котором пройдены не все три игры. */
  private firstUnfinishedSet(): number {
    const index = ENGLISH_SETS.findIndex(
      (set) => englishSave.doneCount(set.id) < ENGLISH_GAMES.length,
    );
    return index < 0 ? 0 : index;
  }

  private goTo(scene: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.play('tap');
    speech.stop();
    this.time.delayedCall(140, () => this.scene.start(scene, data));
  }

  // ---------- Наборы слов ----------

  private createSetPicker(): void {
    const spots = setPickerSpots(ENGLISH_SETS.length);
    const radius = SET_PICKER.radius;

    ENGLISH_SETS.forEach((set, index) => {
      const done = englishSave.doneCount(set.id) >= ENGLISH_GAMES.length;
      const here = index === this.setIndex;
      const main = done ? PALETTE.gold : here ? PALETTE.uiButton : PALETTE.uiButtonCalm;
      const dark = done ? PALETTE.goldDark : here ? PALETTE.uiButtonDark : PALETTE.uiButtonCalmDark;

      // Вместо цифры — картинка набора: мяч, яблоко, семья. Кружок под ней
      // по-прежнему говорит «выбран» и «пройден».
      const circle = this.add.circle(0, 0, radius, main).setStrokeStyle(5, dark);
      const figure = createSetBadgeFigure(this, set, radius);
      const button = this.add.container(spots[index] ?? 0, SET_PICKER.y, [circle, figure]).setDepth(5);
      button.setSize(radius * 2, radius * 2);
      if (here) {
        button.setScale(SET_PICKER.selectedScale);
        return;
      }
      button.setInteractive({ useHandCursor: true });
      button.on(Phaser.Input.Events.POINTER_DOWN, () => {
        const data: EnglishSceneData = { setIndex: index };
        this.goTo(SCENE.ENGLISH, data);
      });
    });
  }

  /** Слова набора с переводом: по ним же ребёнок узнаёт, что его ждёт. */
  private createWordList(): void {
    const set = englishSet(this.setIndex);
    const panelY = 252;
    createPanel(this, GAME_WIDTH / 2, panelY, 1120, 150).setDepth(1);
    createText(this, GAME_WIDTH / 2, panelY - 52, set.title, 34, PALETTE.uiText).setDepth(2);

    const step = 1040 / set.words.length;
    const left = GAME_WIDTH / 2 - ((set.words.length - 1) * step) / 2;
    set.words.forEach((word, i) => {
      const x = left + i * step;
      const en = createText(this, x, panelY + 2, word.en, 40, PALETTE.uiText).setDepth(2);
      en.setInteractive({ useHandCursor: true });
      en.on(Phaser.Input.Events.POINTER_DOWN, () => {
        audio.unlock();
        speech.warmUp();
        speech.say(word.en);
      });
      // Рядом с «?» — чем слово показать по-английски: цветное пятно или
      // картинка. Со значком пара сдвигается, чтобы стоять под словом ровно.
      const mark = createWordMark(this, x - 34, panelY + 48, word, MARK_SIZE);
      mark?.setDepth(2);
      // Перевод не подписан, а спрятан за «?»: словарь остаётся английским.
      createHintButton(this, mark === null ? x : x + 28, panelY + 48, word.ru, {
        depth: 2,
        size: 24,
        radius: 20,
        // Зона уже обычной: ниже стоят карточки игр, и широкая отбирала бы у
        // них верхний край.
        hit: 64,
        // Перевод по центру кнопки длиннее кружка («Мы — друзья») и ложился бы на
        // картинку слова: на время перевода она растворяется, как и сам кружок.
        onToggle: (shown) => {
          if (mark === null) return;
          this.tweens.add({ targets: mark, alpha: shown ? 0 : 1, duration: shown ? 180 : 150 });
        },
      });
    });
  }

  // ---------- Карточки игр ----------

  private createGameCard(game: EnglishGame, x: number, y: number): void {
    const info = GAME_INFO[game];
    const set = englishSet(this.setIndex);
    const done = englishSave.isDone(set.id, game);

    const panel = createPanel(this, 0, 0, CARD_W, CARD_H);
    const label = createText(this, 0, CARD_H / 2 - 50, info.label, 34, PALETTE.uiText);
    const body = this.add.container(0, 0, [panel, ...this.cardIcon(game), label]);
    const card = this.add.container(x, y, [body]).setDepth(5);

    const star = this.add.image(CARD_W / 2 - 34, -CARD_H / 2 + 34, TEX.STAR);
    star.setScale(STAR_SIZE / Math.max(star.width, star.height, 1));
    // Не пройдено — серый силуэт звезды: золотая тень от золотой звезды
    // отличается слишком слабо, ребёнок их не различал.
    if (!done) star.setTint(0x7a7f85).setAlpha(0.5);
    card.add(star);

    card.setSize(CARD_W, CARD_H);
    card.setInteractive({ useHandCursor: true });
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.tweens.add({ targets: body, scale: 0.95, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
      const data: EnglishGameData = { setIndex: this.setIndex };
      this.goTo(info.scene, data);
    });
  }

  /** Картинка игры: из тех же плашек с буквами, что и сама игра. */
  private cardIcon(game: EnglishGame): Phaser.GameObjects.GameObject[] {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const tile = (tx: number, ty: number, size: number, char: string, angle = 0) => {
      const image = this.add.image(tx, ty, TEX.LETTER_TILE).setDisplaySize(size, size);
      image.setAngle(angle);
      const text = createText(this, tx, ty - 2, char, Math.round(size * 0.52), PALETTE.uiText);
      text.setAngle(angle);
      parts.push(image, text);
    };

    if (game === 'anagram') {
      tile(-74, -30, 86, 'a', -9);
      tile(4, -42, 86, 'c', 4);
      tile(80, -26, 86, 't', 11);
    } else if (game === 'search') {
      const letters = ['c', 'a', 't', 'o', 'w', 'e', 'd', 'n', 'g'];
      letters.forEach((char, i) => {
        tile(-56 + (i % 3) * 56, -74 + Math.floor(i / 3) * 56, 50, char);
      });
    } else {
      // Шарик с буквой: ниточка нарисована линией, остальное — та же плашка.
      const string = this.add.graphics();
      string.lineStyle(4, PALETTE.uiText, 0.8);
      string.lineBetween(0, 6, 0, 56);
      parts.push(string);
      const balloon = this.add.circle(0, -46, 56, PALETTE.uiButton).setStrokeStyle(5, PALETTE.uiButtonDark);
      parts.push(balloon, createText(this, 0, -48, 'b', 52, PALETTE.uiText));
    }
    return parts;
  }

  // ---------- Кнопки угла ----------

  private createResetButton(): void {
    const set = englishSet(this.setIndex);
    if (englishSave.doneCount(set.id) === 0) return;
    const radius = CONFIG.ui.smallButtonRadius;
    const button = createRoundButton(
      this,
      GAME_WIDTH - CONFIG.ui.padding - radius,
      CONFIG.ui.padding + radius * 3 + 16,
      TEX.ICON_AGAIN,
      () => {
        askConfirm(this, {
          question: `${set.title} again?`,
          icon: TEX.ICON_AGAIN,
          onYes: () => {
            englishSave.resetSet(set.id);
            const data: EnglishSceneData = { setIndex: this.setIndex };
            this.scene.restart(data);
          },
        });
      },
      { radius, tone: 'calm' },
    );
    button.container.setDepth(10);
  }

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
        if (audio.muted) speech.stop();
        button.setIcon(iconFor());
      },
      { radius, tone: 'calm' },
    );
    button.container.setDepth(10);
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, GAME_HEIGHT - 70, GAME_WIDTH, 70);
    g.fillStyle(PALETTE.grassLight, 1);
    g.fillRect(0, GAME_HEIGHT - 70, GAME_WIDTH, 10);
  }
}
