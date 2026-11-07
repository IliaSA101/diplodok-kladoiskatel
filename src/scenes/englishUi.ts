/**
 * Общее для всех трёх английских игр: подложка, кнопка «послушать»,
 * точки прогресса и финал.
 *
 * Устроено как systems/quest.ts для задачек квеста: игра получает слова,
 * а когда набор пройден — зовёт finishEnglishGame и больше ни о чём не думает.
 */
import Phaser from 'phaser';
import { SWATCH_OUTLINE } from '../art/englishLayout';
import { TEX } from '../art/keys';
import { PUZZLE_PANEL } from '../art/layout';
import { hex, PALETTE } from '../art/palette';
import { createBackButton, createPanel, createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { DinoWatcher } from '../entities/DinoWatcher';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CONFIG } from '../config';
import { englishSet, wordHint } from '../data/english';
import type { EnglishGame, EnglishWord } from '../data/english';
import { englishSave } from '../systems/englishSave';
import { journal } from '../systems/journal';
import { onEscape } from '../systems/quest';
import { speech } from '../systems/speech';
import { SCENE } from '../types';

/** Выше всего, что рисуют сами игры. */
const FINISH_DEPTH = 300000;

/** Небо вместо травы: английская ветка должна быть узнаваема с первого взгляда. */
export function addEnglishBackdrop(scene: Phaser.Scene, title: string): void {
  const g = scene.add.graphics().setDepth(-10);
  g.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.skyDeep, PALETTE.skyDeep, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const panel = createPanel(
    scene,
    PUZZLE_PANEL.centerX,
    PUZZLE_PANEL.centerY,
    PUZZLE_PANEL.width,
    PUZZLE_PANEL.height,
  );
  panel.setDepth(-5);
  // Тот же диплодок, что смотрит на задачки квеста: панель здесь лежит на -5,
  // поэтому он на -6 — иначе встал бы поверх неё во весь рост.
  DinoWatcher.create(scene, -6);

  const heading = createText(scene, GAME_WIDTH / 2, 62, title, 46, PALETTE.uiTextLight);
  heading.setDepth(1);
}

/**
 * Выход на экран ветки: кнопка в углу и Esc — как во всех задачках.
 *
 * `beforeEscape` — у игры есть что отменить прежде, чем выходить (выбранный
 * путь в поиске слова): вернула true — Esc потрачен на это, и сцена остаётся.
 * Кнопка в углу уходит всегда.
 */
export function addBackToEnglish(
  scene: Phaser.Scene,
  setIndex: number,
  beforeEscape?: () => boolean,
): void {
  const leave = (): void => {
    speech.stop();
    scene.scene.start(SCENE.ENGLISH, { setIndex });
  };
  const button = createBackButton(scene, leave, { radius: 52 });
  button.container.setDepth(250000);
  onEscape(scene, () => {
    if (beforeEscape?.() === true) return;
    leave();
  });
}

/**
 * Кнопка «послушать ещё раз».
 *
 * Ребёнок ещё не читает по-английски: слово он узнаёт на слух, и повторить
 * его он должен уметь в любой момент, не дожидаясь следующего хода.
 */
export function createSpeakButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  word: () => string,
): void {
  createRoundButton(
    scene,
    x,
    y,
    TEX.ICON_SOUND_ON,
    () => {
      audio.unlock();
      speech.warmUp();
      speech.say(word());
    },
    { radius: 54 },
  );
}

/**
 * Набор пройден — записать. Сцена зовёт это в тот самый миг, когда последнее
 * слово найдено, а не дожидается праздника: Esc в паузе перед звездой уходил
 * раньше `finishEnglishGame`, и набор не засчитывался (002-22). Повторная
 * запись ничего не меняет.
 */
export function markEnglishDone(setIndex: number, game: EnglishGame): void {
  recordEnglishDone(englishSet(setIndex).id, game);
}

/** Запись набора и след в журнале: единственное место, где английская игра засчитывается. */
function recordEnglishDone(setId: string, game: EnglishGame): void {
  journal.note('english', { set: setId, game });
  englishSave.markDone(setId, game);
}

/**
 * Набор пройден: звезда во весь экран и возврат на экран ветки.
 * Вызывать ровно один раз; сцена после этого ничего делать не должна.
 */
export function finishEnglishGame(
  scene: Phaser.Scene,
  setId: string,
  setIndex: number,
  game: EnglishGame,
): void {
  recordEnglishDone(setId, game);
  speech.stop();
  audio.play('fanfare');

  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2 - 20;
  const veil = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x14321f, 0.55)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(FINISH_DEPTH);
  const glow = scene.add
    .image(centerX, centerY, TEX.GLOW)
    .setDepth(FINISH_DEPTH + 1)
    .setTint(PALETTE.gold)
    .setAlpha(0);
  const star = scene.add
    .image(centerX, centerY, TEX.STAR)
    .setDepth(FINISH_DEPTH + 2)
    .setScale(0.2)
    .setAlpha(0);
  const label = createText(scene, centerX, centerY + 180, 'Well done!', 56);
  label.setDepth(FINISH_DEPTH + 2).setAlpha(0);

  scene.tweens.add({ targets: glow, alpha: 0.65, scale: 3, duration: 500, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: star, scale: 1.6, alpha: 1, duration: 450, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: label, alpha: 1, duration: 360, delay: 200 });

  const sparks = scene.add.particles(centerX, centerY, TEX.SPARKLE, {
    speed: { min: 80, max: 240 },
    angle: { min: 0, max: 360 },
    lifespan: 1100,
    scale: { start: 1, end: 0 },
    quantity: 22,
    emitting: false,
  });
  sparks.setDepth(FINISH_DEPTH + 3);
  sparks.explode(22);

  scene.time.delayedCall(2000, () => {
    audio.play('found');
    sparks.destroy();
    veil.destroy();
    glow.destroy();
    star.destroy();
    label.destroy();
    scene.scene.start(SCENE.ENGLISH, { setIndex });
  });
}

/**
 * Подсказка к слову: по-английски сразу, по-русски — только если попросят.
 *
 * Русский был подписью под каждым словом и в каждой игре, и ветка «Английский»
 * читалась по-русски. Теперь он живёт за кнопкой «?»: нажал (или навёл на
 * ноутбуке) — появился, и больше не прячется. Что показано вместо него, решает
 * `wordHint`: картинка, цветное пятно или английская фраза с пропуском.
 */
/** Кружок «?»: рисуется небольшим, а нажимается широкой зоной вокруг. */
const HINT_RADIUS = 24;
const HINT_HIT = 92;

export interface Hint {
  /** Всё нарисованное: сцене остаётся только убрать это вместе со словом. */
  readonly parts: Phaser.GameObjects.GameObject[];
  /** Слово уже отгадано — подсказку приглушаем, но не убираем. */
  dim(): void;
}

/** Кнопка «?» и спрятанный за ней перевод; оба стоят в одной точке. */
export function createHintButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  ru: string,
  options: {
    depth?: number;
    size?: number;
    radius?: number;
    hit?: number;
    fromLeft?: boolean;
    /**
     * Перевод показан или спрятан. Нужен там, где рядом с кнопкой стоит картинка
     * слова, а перевод длиннее кружка: сцена прячет картинку на время перевода,
     * иначе «Мы — друзья» ложится прямо на неё.
     */
    onToggle?: (shown: boolean) => void;
  } = {},
): Hint {
  const depth = options.depth ?? 3;
  const radius = options.radius ?? HINT_RADIUS;

  const translation = createText(scene, x, y, ru, options.size ?? 26, PALETTE.uiText);
  translation.setDepth(depth).setAlpha(0);
  // Слева от кнопки стоит само задание. Перевод по центру кнопки наезжал на
  // него левым краем — «красный» шире, чем кружок «?». Поэтому не по центру,
  // а от левого края кнопки вправо: расти он может только в пустоту.
  if (options.fromLeft === true) translation.setOrigin(0, 0.5).setPosition(x - radius, y);

  // Светлый кружок с тёмным знаком, как у кнопки «назад»: на тёмной заливке
  // тёмный «?» не читался — казалось, что кнопка выключена.
  const circle = scene.add.circle(x, y, radius, PALETTE.uiPanel).setDepth(depth + 1);
  circle.setStrokeStyle(4, PALETTE.uiButtonCalmDark);
  const mark = createText(scene, x, y - 2, '?', Math.round(radius * 1.4), PALETTE.uiText);
  mark.setDepth(depth + 2);

  /**
   * Подсказку держат открытой две разные причины, и путать их нельзя.
   *
   * `over` — мышь сейчас над кнопкой. Это взгляд мимоходом, и когда мышь
   * ушла, перевод обязан погаснуть: иначе ребёнок один раз провёл курсором
   * по словарю и дальше видит русский перевод у всех слов разом — ровно то,
   * от чего мы эту кнопку и заводили.
   *
   * `latched` — по кнопке нажали. На планшете наведения нет вовсе, и без
   * защёлки перевод жил бы ровно столько, сколько палец лежит на экране,
   * причём под самим пальцем. Нажатие переключает: нажал — держится,
   * нажал ещё раз — спряталось.
   */
  let over = false;
  let latched = false;
  let shown = false;

  const apply = (): void => {
    const next = over || latched;
    if (next === shown) return;
    shown = next;
    options.onToggle?.(next);
    scene.tweens.add({
      targets: translation,
      alpha: next ? 1 : 0,
      duration: next ? 200 : 160,
    });
    // Кружок не прячется насовсем, а растворяется: ему ещё возвращаться.
    scene.tweens.add({
      targets: [circle, mark],
      alpha: next ? 0 : 1,
      scale: next ? 0.4 : 1,
      duration: next ? 180 : 150,
    });
  };

  // Зона нажатия шире кружка: сам он мелкий нарочно (их пять в ряд словаря),
  // а палец ребёнка в него не попадает. Zone центрирована, в отличие от
  // своего Geom.Circle, который Phaser сдвинул бы ещё раз на радиус.
  const hit = options.hit ?? HINT_HIT;
  const zone = scene.add.zone(x, y, hit, hit).setDepth(depth + 3);
  zone.setInteractive({ useHandCursor: true });
  zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
    latched = !latched;
    apply();
  });
  // На ноутбуке хватает навести мышь: руки у ребёнка на клавиатуре.
  zone.on(Phaser.Input.Events.POINTER_OVER, () => {
    over = true;
    apply();
  });
  zone.on(Phaser.Input.Events.POINTER_OUT, () => {
    over = false;
    apply();
  });

  return {
    parts: [translation, circle, mark, zone],
    // Слово отгадано — «?» приглушается цветом, а не прозрачностью: сквозь альфу
    // просвечивает панель, и кнопка читается сломанной, а не отработавшей.
    dim(): void {
      circle.setFillStyle(PALETTE.uiButtonCalm);
      translation.setColor(hex(PALETTE.uiButtonCalmDark));
    },
  };
}

/**
 * Задание к слову: чем его показать, решает `wordHint`.
 *
 * Рядом всё равно стоит «?» — с переводом на крайний случай. Без него ребёнок,
 * который не разгадал ребус, застрял бы: выйти можно только кнопкой «назад».
 */
export function createWordPrompt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  word: EnglishWord,
  options: { depth?: number; size?: number; clueBelow?: boolean } = {},
): Hint {
  const depth = options.depth ?? 3;
  const size = options.size ?? CONFIG.ui.fontSizeBig;
  const parts: Phaser.GameObjects.GameObject[] = [];
  let width = size * 2;

  // Арта может не быть — игра умеет рисовать себя кодом, и манифест у неё
  // не обязательный. Без этой проверки Phaser вывел бы на месте подсказки
  // зелёный квадрат «текстуры нет», и задание стало бы нечитаемым.
  const kind =
    word.icon !== undefined && !scene.textures.exists(word.icon) ? 'clue' : wordHint(word);
  if (kind === 'picture' && word.icon !== undefined) {
    const image = scene.add.image(x, y, word.icon).setDepth(depth);
    image.setDisplaySize(size * 2.4, size * 2.4);
    width = image.displayWidth;
    parts.push(image);
  } else if (kind === 'swatch' && word.swatch !== undefined) {
    const blob = scene.add.circle(x, y, size * 0.85, word.swatch).setDepth(depth);
    blob.setStrokeStyle(6, PALETTE.uiText);
    width = blob.radius * 2;
    parts.push(blob);
  } else {
    // Фраза с пропуском — или, если и её нет, перевод: иначе задания не видно.
    const text = createText(scene, x, y, word.clue ?? word.ru, size, PALETTE.uiText);
    text.setDepth(depth);
    width = text.width;
    parts.push(text);
  }

  // Картинка говорит, что это значит, фраза — как это пишется. Показывать
  // их вместе можно только там, где под заданием есть место: в «Catch letters»
  // клетки стоят на сто пикселей ниже, и строка легла бы прямо на них.
  if (options.clueBelow === true && kind === 'picture' && word.clue !== undefined) {
    const line = createText(scene, x, y + size * 1.2 + 26, word.clue, Math.round(size * 0.62));
    line.setDepth(depth).setAlpha(0.75);
    parts.push(line);
  }

  const hint = createHintButton(scene, x + width / 2 + 54, y, word.ru, {
    depth,
    size: 30,
    fromLeft: true,
  });
  parts.push(...hint.parts);
  return {
    parts,
    dim(): void {
      hint.dim();
    },
  };
}

/**
 * Значок слова для словаря на первом экране: цветное пятно или картинка.
 *
 * В словаре у слова стоял только «?», то есть единственной подсказкой был
 * русский перевод — и это на экране, который и заведён показать, что слова
 * английские. Особенно глупо выходило с набором «Colours»: цвета в данных
 * лежат (`swatch`), а ребёнок видел пять слов и пять одинаковых серых кружков.
 *
 * Фразу-пропуск сюда не берём: в словаре на слово отведено двести пикселей,
 * и «I __ you» рядом с «?» туда не встанет. Её показывают сами игры.
 */
export function createWordMark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  word: EnglishWord,
  size: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Arc | null {
  if (word.icon !== undefined && scene.textures.exists(word.icon)) {
    return scene.add.image(x, y, word.icon).setDisplaySize(size, size);
  }
  if (word.swatch !== undefined) {
    return scene.add
      .circle(x, y, size / 2, word.swatch)
      .setStrokeStyle(SWATCH_OUTLINE.width, SWATCH_OUTLINE.color);
  }
  return null;
}
