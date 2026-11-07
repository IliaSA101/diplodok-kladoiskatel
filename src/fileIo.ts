/**
 * Файлы на диск и с диска (design 001, раздел 9): скачивание и выбор. Только DOM, без Phaser.
 *
 * Ничего не пишет в хранилище игры и не ходит в сеть: `Blob` живёт в памяти вкладки.
 */

/** Сколько держать ссылку на `Blob`: браузеру нужно время, чтобы начать скачивание. */
const REVOKE_AFTER_MS = 10_000;

/** Скачать текст файлом с этим именем. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** Скачать значение как JSON с отступами: файл читает человек. */
export function downloadJson(name: string, data: unknown): void {
  downloadText(name, JSON.stringify(data, null, 2));
}

/**
 * Окно выбора файла. `null` — взрослый передумал (событие `cancel`). Звать надо внутри
 * жеста пользователя (обработчик клика), иначе браузер окно не откроет.
 */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    const done = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}
