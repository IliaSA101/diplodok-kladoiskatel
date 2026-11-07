/**
 * Меню «Для взрослых» (design 001, раздел 9): открывается удержанием левого нижнего угла
 * первого экрана. Файл прогресса, возврат из файла, резервная копия, отчёт о сбое и
 * «Стереть всё» — единственное место, где игра говорит со взрослым.
 *
 * Панель на Phaser, DOM только для файла (001-21): `?shots` снимает лишь холст. Вуаль
 * сплошная, без альфы: сквозь неё первый экран читался бы как сломанный. Все числа —
 * `art/startLayout.ts`, состав пунктов — `parentsMenuItems`, а что делает файл — `systems/parentsFiles.ts`.
 *
 * Выбор файла начинается синхронно внутри нажатия (`pickFile` в обработчике кнопки):
 * иначе браузер не откроет окно, у него нет жеста пользователя.
 */
import Phaser from 'phaser';
import { TEX } from '../art/keys';
import { PALETTE } from '../art/palette';
import { APP_VERSION } from '../art/startLayout';
import {
  PARENTS_MENU,
  PARENTS_TEXT,
  REFUSED_TITLE_LINES,
  estimateLines,
  parentsAnswerRects,
  parentsMainRects,
  parentsMenuItems,
  refusedBlockLines,
  summaryBlockLines,
  type ParentsItem,
} from '../art/parentsLayout';
import type { Rect } from '../art/startLayout';
import { createBackButton, createPanel, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { downloadText, pickFile } from '../fileIo';
import { askConfirm } from '../systems/confirm';
import { eraseAllProgress, eraseAnswerText } from '../systems/eraseAll';
import { rolledBackAtOpen } from '../systems/openStatus';
import {
  backupDownload,
  downloadRefusal,
  hasBackupFile,
  hasCrashReport,
  progressDownload,
  readPickedFile,
  reportDownload,
  summaryParts,
  type DownloadResult,
  type PickedFile,
} from '../systems/parentsFiles';
import { REFUSED_REASON, REFUSED_TITLE, type FileVerdict } from '../systems/saveFile';
import { replaceProgress, type ReplaceResult } from '../systems/saveReplace';
import { storeMode } from '../systems/saveStore';

const DEPTH = PARENTS_MENU.depth;
/** Вуаль: сплошной цвет травы, как у экрана сбоя. */
const VEIL_COLOR = 0x2e7d4f;
/** Слово после неудачного стирания: выше окна «точно?» (300000), на несколько секунд. */
const NOTICE_DEPTH = 310000;
const NOTICE_MS = 5000;
/** Между названием и головой диплодока: ни то ни другое не закрыто. */
const NOTICE_Y = 175;

export interface ParentsMenuOptions {
  /** Меню закрыто (любым способом): сцена снова слушает клавиши. */
  onClose: () => void;
  /** Чем выбирать файл; нужен обходу `?shots`, у которого нет окна выбора. По умолчанию — окно браузера. */
  pick?: () => Promise<PickedFile | null>;
}

/** Нажать пункт без мыши — для обхода `?shots`. */
export interface ParentsMenuHandle {
  press(item: ParentsItem): void;
}

interface Part {
  destroy(): void;
}

/** Ответ на «Стереть всё»: начать экран заново, перезагрузить вкладку или сказать, почему не вышло. */
function afterErase(scene: Phaser.Scene, result: ReplaceResult): void {
  if (result === 'ok') {
    scene.scene.restart();
    return;
  }
  // Оборвалось: при запуске недописанное доведётся или откатится (001-38).
  if (result === 'interrupted') {
    location.reload();
    return;
  }
  const text = eraseAnswerText(result);
  if (text === null) return;
  const notice = createText(scene, GAME_WIDTH / 2, NOTICE_Y, text, 30, PALETTE.uiText)
    .setWordWrapWidth(GAME_WIDTH - 160)
    .setDepth(NOTICE_DEPTH);
  scene.time.delayedCall(NOTICE_MS, () => notice.destroy());
}

/** Открыть меню поверх сцены. Закрывается кнопкой «назад», Esc и тапом мимо панели. */
export function openParentsMenu(scene: Phaser.Scene, options: ParentsMenuOptions): ParentsMenuHandle {
  const veil = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, VEIL_COLOR, 1)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH)
    .setInteractive({ useHandCursor: false });
  let view: Part[] = [];
  let panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let closed = false;
  let pressed: Partial<Record<ParentsItem, () => void>> = {};

  const add = <T extends Part>(part: T): T => {
    view.push(part);
    return part;
  };
  const clearView = (): void => {
    for (const part of view) part.destroy();
    view = [];
  };

  // «Назад» — в левом верхнем углу экрана, как на всех экранах игры (`createBackButton`); панель в центре его не задевает.
  const back = createBackButton(scene, () => close());
  back.container.setScrollFactor(0).setDepth(DEPTH + 2);

  const onEsc = (): void => close();
  scene.input.keyboard?.on('keydown-ESC', onEsc);

  function close(): void {
    if (closed) return;
    closed = true;
    clearView();
    back.destroy();
    veil.destroy();
    scene.input.keyboard?.off('keydown-ESC', onEsc);
    options.onClose();
  }

  // Тап мимо панели — «закрыть», как у окна «точно?»: выйти можно всегда.
  veil.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
    const inside =
      pointer.x >= panel.x && pointer.x <= panel.x + panel.w && pointer.y >= panel.y && pointer.y <= panel.y + panel.h;
    if (!inside) close();
  });

  /** Кнопка-прямоугольник: подпись на тёплой («серой» — у осторожных пунктов) плашке. */
  function textButton(rect: Rect, label: string, calm: boolean, onPress: () => void): void {
    const g = scene.add.graphics();
    const base = calm ? PALETTE.uiButtonCalm : PALETTE.uiButton;
    const dark = calm ? PALETTE.uiButtonCalmDark : PALETTE.uiButtonDark;
    g.fillStyle(dark, 1).fillRoundedRect(0, 5, rect.w, rect.h - 2, 18);
    g.fillStyle(base, 1).fillRoundedRect(0, 0, rect.w, rect.h - 7, 18);
    const text = createText(scene, rect.w / 2, (rect.h - 7) / 2, label, PARENTS_MENU.buttonSize, PALETTE.uiText);
    const button = scene.add.container(rect.x, rect.y, [g, text]);
    button.setSize(rect.w, rect.h).setScrollFactor(0).setDepth(DEPTH + 2);
    button.setInteractive(new Phaser.Geom.Rectangle(rect.w / 2, rect.h / 2, rect.w, rect.h), Phaser.Geom.Rectangle.Contains);
    button.input!.cursor = 'pointer';
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      audio.play('tap');
      onPress();
    });
    add(button);
  }

  /** Панель, заголовок и «назад»: общее для всех видов. */
  function frame(rects: { panel: Rect; title: { x: number; y: number } }): void {
    clearView();
    panel = rects.panel;
    add(createPanel(scene, panel.x + panel.w / 2, panel.y + panel.h / 2, panel.w, panel.h).setScrollFactor(0).setDepth(DEPTH + 1));
    add(
      createText(scene, rects.title.x, rects.title.y, PARENTS_TEXT.title, PARENTS_MENU.titleSize, PALETTE.uiText)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );
  }

  function caption(rect: Rect, text: string, size: number): Phaser.GameObjects.Text {
    return add(
      createText(scene, rect.x + rect.w / 2, rect.y, text, size, PALETTE.uiText)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(rect.w)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );
  }

  function save(result: DownloadResult, status: Phaser.GameObjects.Text): void {
    if (!result.ok) {
      status.setText(downloadRefusal(result.why));
      return;
    }
    downloadText(result.file.name, result.file.text);
    status.setText(PARENTS_TEXT.fileSaved + result.file.name);
  }

  /** Главный вид. `status` — строка внизу (ответ на прошлое действие). */
  function main(status = ''): void {
    const spec = parentsMenuItems({ mode: storeMode(), hasBackup: hasBackupFile(), hasCrash: hasCrashReport() });
    const notes = [rolledBackAtOpen() ? PARENTS_TEXT.rolledBack : null, spec.modeLine].filter(
      (line): line is string => line !== null,
    );
    const noteLines = notes.reduce(
      (sum, line) => sum + estimateLines(line, PARENTS_MENU.noteSize, PARENTS_MENU.noteWrap),
      0,
    );
    const rects = parentsMainRects(spec.items.length, noteLines);
    frame(rects);
    const line = caption(rects.status, status, PARENTS_MENU.statusSize);
    if (rects.notes !== null) caption(rects.notes, notes.join('\n'), PARENTS_MENU.noteSize);
    const actions: Record<ParentsItem, () => void> = {
      export: () => save(progressDownload(APP_VERSION, new Date()), line),
      import: () => void chooseFile(),
      backup: () => save(backupDownload(new Date()), line),
      report: () => save(reportDownload(new Date()), line),
      erase: () => {
        close();
        askConfirm(scene, {
          question: 'Стереть весь прогресс?',
          icon: TEX.ICON_AGAIN,
          onYes: () => afterErase(scene, eraseAllProgress()),
        });
      },
    };
    pressed = actions;
    spec.items.forEach((item, i) => {
      const rect = rects.buttons[i];
      if (rect !== undefined) textButton(rect, PARENTS_TEXT.items[item], item === 'erase', actions[item]);
    });
  }

  /** Окно выбора файла открывается здесь же, в нажатии; дальше — ждём ответа. */
  async function chooseFile(): Promise<void> {
    const picked = (options.pick ?? pickFile)();
    const file = await picked;
    if (file === null || closed) return;
    const verdict = await readPickedFile(file);
    if (closed) return;
    if (verdict.ok) summary(verdict);
    else refused(verdict.reason);
  }

  function refused(reason: keyof typeof REFUSED_REASON): void {
    const why = REFUSED_REASON[reason];
    const rects = parentsAnswerRects(1, refusedBlockLines(why));
    frame(rects);
    caption(rects.block, REFUSED_TITLE, 40);
    caption({ ...rects.block, y: rects.block.y + REFUSED_TITLE_LINES * PARENTS_MENU.answerLine }, why, PARENTS_MENU.answerSize);
    const [ok] = rects.buttons;
    if (ok !== undefined) textButton(ok, PARENTS_TEXT.understood, false, () => main());
  }

  function summary(verdict: Extract<FileVerdict, { ok: true }>): void {
    const parts = summaryParts(verdict.file, verdict.current);
    const text = [parts.head, parts.file, parts.current].filter((line): line is string => line !== null).join('\n');
    const rects = parentsAnswerRects(2, summaryBlockLines(text));
    frame(rects);
    caption(rects.block, text, PARENTS_MENU.answerSize);
    const asking = caption(rects.block, parts.question, 34);
    asking.setOrigin(0.5, 1).setY(rects.block.y + rects.block.h);
    const [yes, no] = rects.buttons;
    if (yes !== undefined) textButton(yes, PARENTS_TEXT.yes, false, () => replace(verdict.keys));
    if (no !== undefined) textButton(no, PARENTS_TEXT.no, true, () => main());
  }

  /** Замена уже пошла: второй клик по «Да» до выгрузки страницы не должен повторить её. */
  let replacing = false;

  function replace(keys: Record<string, string>): void {
    // Повтор взял бы копией уже прогресс из файла, и свежий прогресс ребёнка пропал бы насовсем.
    if (replacing) return;
    replacing = true;
    const result = replaceProgress(keys, 'restore', { game: APP_VERSION, now: new Date() });
    // Удалось или оборвалось: вкладка читает хранилище заново, при запуске недописанное доводится (001-38).
    if (result === 'ok' || result === 'interrupted') {
      location.reload();
      return;
    }
    // Не вышло и страница остаётся: меню снова главное, и следующая попытка разрешена.
    replacing = false;
    main(result === 'no-space' ? PARENTS_TEXT.noSpace : PARENTS_TEXT.replaceRefused);
  }

  main();
  return { press: (item) => pressed[item]?.() };
}
