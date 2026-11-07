/**
 * Раскладка меню «Для взрослых» (design 001, раздел 9): состав пунктов по режимам хранилища,
 * тексты и габариты панели.
 *
 * Без Phaser и без `package.json`: по этим числам тест проверяет, что пять кнопок не налезают
 * друг на друга, а самая длинная подпись и строка режима влезают, и по ним же e2e находит
 * кнопки (Playwright не умеет импортировать `package.json`, которым пользуется `startLayout.ts`).
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { Rect } from './startLayout';

// ---------- Меню «Для взрослых» (design 001, раздел 9) ----------

/** Пункты меню в том порядке, в каком они стоят на панели. */
export type ParentsItem = 'export' | 'import' | 'backup' | 'report' | 'erase';

/** Сколько позволяет хранилище (то же, что `StoreMode` в `systems/saveStore.ts`). */
export type ParentsMode = 'normal' | 'newer' | 'future' | 'unavailable';

/** Всё, что меню говорит словами. Здесь, чтобы тест мерил ровно то, что рисует сцена. */
export const PARENTS_TEXT = {
  title: 'Для взрослых',
  items: {
    export: 'Прогресс в файл',
    import: 'Прогресс из файла',
    backup: 'Резервная копия в файл',
    report: 'Отчёт о сбое',
    erase: 'Стереть всё',
  } satisfies Record<ParentsItem, string>,
  modeNewer: 'Сохранение из новой версии игры. Файлы и стирание — в ней.',
  modeFuture: 'Сохранение из новой версии игры: прогресс не записывается.',
  modeUnavailable: 'Браузер не даёт сохранять прогресс.',
  rolledBack: 'Прошлая замена из файла не удалась — прогресс прежний',
  /** После скачивания: за двоеточием имя файла. */
  fileSaved: 'Файл скачивается: ',
  /** Скачивать нечего или нельзя: строка внизу панели. */
  exportRefused: 'Сейчас файл сделать нельзя',
  exportTooBig: 'Прогресса так много, что он не поместится в файл',
  noSpace: 'Не хватило места в браузере — ничего не изменилось',
  replaceRefused: 'Сейчас заменить нельзя — сохранение открыто только для чтения',
  understood: 'Понятно',
  replaceQuestion: 'Заменить?',
  yes: 'Да',
  no: 'Нет',
} as const;

export interface ParentsMenuInput {
  mode: ParentsMode;
  /** Лежит ли резервная копия `backup`. */
  hasBackup: boolean;
  /** Есть ли отчёт о последнем сбое (`crash`). */
  hasCrash: boolean;
}

export interface ParentsMenuSpec {
  items: readonly ParentsItem[];
  /** Строка режима (пишется, когда чего-то нет не по воле взрослого); `null` — в `normal`. */
  modeLine: string | null;
}

/**
 * Состав меню по таблице раздела 9. Файл прогресса и замена нужны там, где игра вправе писать
 * (`normal`); резервная копия и отчёт ничего не пишут и видны, пока есть что отдать.
 */
export function parentsMenuItems(input: ParentsMenuInput): ParentsMenuSpec {
  const { mode, hasBackup, hasCrash } = input;
  const items: ParentsItem[] = [];
  if (mode === 'normal') items.push('export', 'import');
  if (hasBackup && mode !== 'unavailable') items.push('backup');
  if (hasCrash) items.push('report');
  if (mode === 'normal') items.push('erase');
  const modeLine =
    mode === 'newer'
      ? PARENTS_TEXT.modeNewer
      : mode === 'future'
        ? PARENTS_TEXT.modeFuture
        : mode === 'unavailable'
          ? PARENTS_TEXT.modeUnavailable
          : null;
  return { items, modeLine };
}

/** Числа панели. Сцена ставит всё по `parentsMainRects` / `parentsAnswerRects`, тест меряет те же. */
export const PARENTS_MENU = {
  /** Как у `askConfirm`: поверх всего, что есть в сценах. */
  depth: 300000,
  panelW: 780,
  pad: 28,
  /** Верх панели до центра заголовка и до первого ряда. */
  titleY: 52,
  titleSize: 46,
  contentTop: 108,
  buttonW: 600,
  buttonH: 66,
  buttonGap: 14,
  buttonSize: 30,
  noteSize: 24,
  noteLine: 32,
  noteWrap: 680,
  statusSize: 22,
  statusLine: 30,
  statusLines: 2,
  /** Ответ на файл: сводка и отказ. */
  answerSize: 26,
  answerLine: 34,
  answerWrap: 700,
  /** Запас на ширину букв: честнее переоценить строку, чем недооценить (шрифт на машине свой). */
  glyphWidth: 0.66,
  /** Панель не ближе этого к краю экрана. */
  screenMargin: 16,
} as const;

/** Сколько строк займёт текст при переносе по словам. Оценка с запасом (`glyphWidth`). */
export function estimateLines(text: string, size: number, width: number): number {
  const char = size * PARENTS_MENU.glyphWidth;
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(' ')) {
      const w = word.length * char;
      const space = used === 0 ? 0 : char;
      if (used > 0 && used + space + w > width) {
        lines += 1;
        used = w;
      } else {
        used += space + w;
      }
    }
  }
  return lines;
}

export interface ParentsMainRects {
  panel: Rect;
  /** Центр заголовка. */
  title: { x: number; y: number };
  buttons: Rect[];
  /** Строки режима и прошлой замены; `null`, когда писать нечего. */
  notes: Rect | null;
  /** Строка внизу: «Файл скачивается…» и ответы. Место занято всегда. */
  status: Rect;
}

function panelAt(height: number): Rect {
  const w = PARENTS_MENU.panelW;
  return { x: Math.round((GAME_WIDTH - w) / 2), y: Math.round((GAME_HEIGHT - height) / 2), w, h: height };
}

function headerOf(panel: Rect): Pick<ParentsMainRects, 'title'> {
  return { title: { x: panel.x + panel.w / 2, y: panel.y + PARENTS_MENU.titleY } };
}

/** Главная панель: `count` кнопок, `noteLines` строк режима, внизу строка состояния. */
export function parentsMainRects(count: number, noteLines: number): ParentsMainRects {
  const m = PARENTS_MENU;
  const rows = count * m.buttonH + Math.max(0, count - 1) * m.buttonGap;
  const notesH = noteLines * m.noteLine;
  const statusH = m.statusLines * m.statusLine;
  const height =
    m.contentTop + rows + (noteLines > 0 ? m.buttonGap + notesH : 0) + m.buttonGap + statusH + m.pad;
  const panel = panelAt(height);
  const x = panel.x + (panel.w - m.buttonW) / 2;
  const buttons = Array.from({ length: count }, (_, i) => ({
    x,
    y: panel.y + m.contentTop + i * (m.buttonH + m.buttonGap),
    w: m.buttonW,
    h: m.buttonH,
  }));
  let y = panel.y + m.contentTop + rows;
  const notes: Rect | null =
    noteLines > 0 ? { x: panel.x + (panel.w - m.noteWrap) / 2, y: y + m.buttonGap, w: m.noteWrap, h: notesH } : null;
  if (notes !== null) y += m.buttonGap + notesH;
  const status = { x: notes?.x ?? x, y: y + m.buttonGap, w: m.noteWrap, h: statusH };
  return { panel, ...headerOf(panel), buttons, notes, status };
}

/** Заголовок отказа крупнее текста: занимает две строки ответа. */
export const REFUSED_TITLE_LINES = 2;
/** Вопрос «Заменить?» под сводкой: строка и воздух над ней. */
export const SUMMARY_QUESTION_LINES = 2;

/** Строк блока для сводки: текст сводки и вопрос под ним. */
export function summaryBlockLines(text: string): number {
  return estimateLines(text, PARENTS_MENU.answerSize, PARENTS_MENU.answerWrap) + SUMMARY_QUESTION_LINES;
}

/** Строк блока для отказа: заголовок и причина. */
export function refusedBlockLines(reason: string): number {
  return REFUSED_TITLE_LINES + estimateLines(reason, PARENTS_MENU.answerSize, PARENTS_MENU.answerWrap);
}

export interface ParentsAnswerRects {
  panel: Rect;
  title: { x: number; y: number };
  /** Текст сводки или отказа. */
  block: Rect;
  buttons: Rect[];
}

/**
 * Панель ответа на файл: сводка («Да» / «Нет») или отказ («Понятно»). `lines` — сколько строк
 * по `answerLine` занимает текст вместе с вопросом или заголовком: панель по нему и растёт.
 */
export function parentsAnswerRects(buttonCount: 1 | 2, lines: number): ParentsAnswerRects {
  const m = PARENTS_MENU;
  const blockH = lines * m.answerLine;
  const panel = panelAt(m.contentTop + blockH + m.buttonGap + m.buttonH + m.pad);
  const block = { x: panel.x + (panel.w - m.answerWrap) / 2, y: panel.y + m.contentTop, w: m.answerWrap, h: blockH };
  const w = buttonCount === 2 ? (m.buttonW - m.buttonGap) / 2 : m.buttonW;
  const left = panel.x + (panel.w - m.buttonW) / 2;
  const y = block.y + blockH + m.buttonGap;
  const buttons = Array.from({ length: buttonCount }, (_, i) => ({
    x: left + i * (w + m.buttonGap),
    y,
    w,
    h: m.buttonH,
  }));
  return { panel, ...headerOf(panel), block, buttons };
}
