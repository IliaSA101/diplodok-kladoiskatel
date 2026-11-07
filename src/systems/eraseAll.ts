/**
 * «Стереть весь прогресс» из уголка для взрослых.
 *
 * Что именно стирается, решает `saveReplace.ts`: цель стирания — один звук, поэтому уходят
 * все ключи прогресса (в том числе ступени сложности), музей первой сборки и копии битого —
 * после того как всё это легло в резервную копию (`backup`). Звук взрослого остаётся (001-29).
 * Раньше здесь был свой список сбросов, и в нём однажды забыли ступени сложности; теперь
 * списка нет вовсе: что не звук, то стирается. `erasable` у ключей в `saveKeys.ts` нужен
 * только для вопроса «есть ли что беречь» (пустое состояние копии не требует).
 *
 * Ответ нужен сцене: `ok` — перезапуск, `interrupted` — перезагрузка вкладки (докат при
 * запуске допишет или откатит, 001-38), остальное — слово взрослому (`eraseAnswerText`).
 */
import { APP_VERSION } from '../art/startLayout';
import { eraseProgress, type ReplaceResult } from './saveReplace';

export function eraseAllProgress(): ReplaceResult {
  return eraseProgress({ game: APP_VERSION, now: new Date() });
}

/** Что сказать взрослому, если стереть не вышло; `null` — говорить нечего. */
export function eraseAnswerText(result: ReplaceResult): string | null {
  if (result === 'no-space') return 'Не хватило места в браузере — ничего не стёрто';
  if (result === 'refused') return 'Сейчас стереть нельзя — сохранение открыто только для чтения';
  return null;
}
