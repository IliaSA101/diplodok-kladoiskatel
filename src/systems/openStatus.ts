/**
 * Чем кончился запуск хранилища (`openStore`): меню взрослых спрашивает, не откатилась ли
 * прошлая замена из файла. `openStore()` сам кладёт сюда свой ответ.
 */
import type { StoreStatus } from './saveStore';

let status: StoreStatus = 'ok';

export function rememberOpenStatus(next: StoreStatus): void {
  status = next;
}

/** Запуск откатил оборванную замену: прогресс прежний, взрослому об этом сказано в меню. */
export function rolledBackAtOpen(): boolean {
  return status === 'rolled-back';
}
