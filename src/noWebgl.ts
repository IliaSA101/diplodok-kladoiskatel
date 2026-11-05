/**
 * Экран «нужен WebGL» — для взрослого, а не для ребёнка.
 *
 * Без WebGL Phaser молча переходит на Canvas, и игра не падает, а рисуется
 * сломанной: на Canvas нет NineSlice (панели задачек и плашка счётчика), нет
 * сетки, которая гнёт диплодока, и нет тинта (силуэты в альбоме заливаются
 * не тем). Так её впервые увидели 05.11.2026 во встроенном браузере на
 * виртуалке: хвост с ровным срезом посреди травы, задачка без панели, бледный
 * альбом. Ребёнок такую игру видеть не должен — лучше честно сказать
 * взрослому, что поправить.
 *
 * Модуль без Phaser: только DOM. Текст ставится через textContent.
 */

/** Что увидит взрослый: заголовок и абзацы. */
export const NO_WEBGL_NOTICE = {
  title: 'Игре нужен WebGL',
  lines: [
    'Этот браузер не даёт игре графическое ускорение (WebGL). Без него игра ' +
      'рисуется с ошибками: пропадают панели и картинки.',
    'Обычно помогает одно из двух: включить в настройках браузера ' +
      '«аппаратное ускорение» и перезапустить его — или открыть игру в другом ' +
      'браузере: Chrome, Edge, Safari или Firefox.',
  ],
} as const;

/** Убрать игру со страницы и показать вместо неё объяснение. */
export function showNoWebglNotice(gameRoot: HTMLElement | null): void {
  if (gameRoot !== null) gameRoot.style.display = 'none';

  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = [
    'position: fixed',
    'inset: 0',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'padding: 24px',
    'box-sizing: border-box',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'max-width: 640px',
    'padding: 32px 36px',
    'border-radius: 20px',
    'background: #fff7e8',
    'color: #4a3426',
    'font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'font-size: 20px',
    'line-height: 1.5',
    'box-shadow: 0 8px 0 rgba(0, 0, 0, 0.15)',
  ].join(';');

  const title = document.createElement('h1');
  title.textContent = NO_WEBGL_NOTICE.title;
  title.style.cssText = 'margin: 0 0 16px; font-size: 32px; line-height: 1.2';
  card.append(title);

  for (const line of NO_WEBGL_NOTICE.lines) {
    const p = document.createElement('p');
    p.textContent = line;
    p.style.margin = '0 0 12px';
    card.append(p);
  }

  box.append(card);
  document.body.append(box);
}
