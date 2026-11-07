/**
 * Экран сбоя: «Позови взрослого» (design 001, раздел 8.2). Только DOM, рядом с `noWebgl.ts`.
 *
 * Ребёнок видит крупную просьбу и диплодока, взрослый — две кнопки и одну строку мелким:
 * что случилось и сохранён ли прогресс. Красного и слова «Ошибка» нет — страшно не должно быть.
 * Фон сплошной травяной (без прозрачности: сквозь неё игра читалась бы как сломанная).
 * Клавиши в игру не уходят, пока экран открыт; указатель до холста не доходит —
 * экран его закрывает.
 */

/** Что увидит ребёнок и взрослый. Ставится через `textContent`. */
export const CRASH_SCREEN = {
  title: 'Позови взрослого',
  saved: 'Что-то сломалось. Прогресс сохранён.',
  notSaved: 'Что-то сломалось. Последнее действие могло не сохраниться.',
  save: 'Сохранить отчёт',
  carryOn: 'Продолжить',
  /** После скачивания: за двоеточием имя файла. */
  fileSaved: 'Отчёт скачивается: ',
} as const;

export interface CrashScreenOptions {
  /** Лёг ли прогресс: от этого зависит вторая фраза. */
  saved: boolean;
  /** Скачать отчёт; возвращает имя файла для строки под кнопками. */
  onSave: () => string;
  /** «Продолжить» и Esc: начать игру заново. */
  onContinue: () => void;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function button(label: string, background: string, color: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.style.cssText = [
    'min-height: 64px',
    'padding: 12px 32px',
    'border: 0',
    'border-radius: 18px',
    `background: ${background}`,
    `color: ${color}`,
    `font: bold 28px ${FONT}`,
    'cursor: pointer',
    'box-shadow: 0 5px 0 rgba(0, 0, 0, 0.18)',
  ].join(';');
  // Обводка фокуса видна всегда: Enter — кнопка в фокусе, и это должно быть видно.
  el.addEventListener('focus', () => (el.style.outline = '5px solid #f2b705'));
  el.addEventListener('blur', () => (el.style.outline = 'none'));
  return el;
}

let shown: HTMLElement | null = null;

/** Показать экран. Второй раз не показывается: возвращает уже открытый. */
export function showCrashScreen(options: CrashScreenOptions): HTMLElement {
  if (shown !== null) return shown;

  const root = document.createElement('div');
  root.setAttribute('role', 'alert');
  root.dataset.crashScreen = '1';
  root.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 100000',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'padding: 16px',
    'box-sizing: border-box',
    'background: #2e7d4f',
    'user-select: none',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'gap: 14px',
    'max-width: 760px',
    'max-height: 100%',
    'padding: 24px 40px 28px',
    'box-sizing: border-box',
    'border-radius: 24px',
    'background: #fff7e8',
    'color: #4a3426',
    `font-family: ${FONT}`,
    'text-align: center',
    'box-shadow: 0 8px 0 rgba(0, 0, 0, 0.15)',
  ].join(';');

  const title = document.createElement('h1');
  title.textContent = CRASH_SCREEN.title;
  title.style.cssText = 'margin: 0; font-size: 60px; line-height: 1.1';

  // Без зеркала: диплодока нельзя отражать (CLAUDE.md), рисунок идёт как есть.
  const dino = document.createElement('img');
  dino.src = `${import.meta.env.BASE_URL}art/dino-whole.png`;
  dino.alt = '';
  dino.style.cssText = 'height: min(240px, 28vh); width: auto';

  const note = document.createElement('p');
  note.textContent = options.saved ? CRASH_SCREEN.saved : CRASH_SCREEN.notSaved;
  note.style.cssText = 'margin: 0; font-size: 22px; line-height: 1.4';

  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 20px; flex-wrap: wrap; justify-content: center';
  const save = button(CRASH_SCREEN.save, '#2e7d4f', '#ffffff');
  const carryOn = button(CRASH_SCREEN.carryOn, '#ead9b5', '#4a3426');
  row.append(save, carryOn);

  const status = document.createElement('p');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'margin: 0; min-height: 1.4em; font-size: 18px';

  save.addEventListener('click', () => {
    try {
      status.textContent = CRASH_SCREEN.fileSaved + options.onSave();
    } catch {
      /* отчёт не вышел — экран остаётся, взрослый может попробовать снова */
    }
  });
  carryOn.addEventListener('click', () => options.onContinue());

  // В фазе захвата на `window`: раньше клавиатуры Phaser. Enter не трогаем — это нажатие
  // кнопки в фокусе; стоп распространения действие по умолчанию не отменяет.
  const onKey = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      options.onContinue();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  card.append(title, dino, note, row, status);
  root.append(card);
  document.body.append(root);
  save.focus();
  shown = root;
  return root;
}
