/**
 * Миграции формата сохранения. Чистые функции над снимком ключей, без
 * `localStorage` и Phaser: одна и та же цепочка гоняет и хранилище при запуске,
 * и файл прогресса (design 001, раздел 4).
 *
 * Правила для этой и всех следующих миграций:
 * - идемпотентна: второй прогон ничего не меняет, поэтому потерянный номер формата
 *   не опасен — считаем 1 и прогоняем цепочку заново;
 * - не удаляет ключи прогресса и не сужает значения: переносит и дописывает;
 * - не может разобрать то, что переносит, — оставляет как есть (битое потом
 *   отложит карантин) и не бросает;
 * - миграция, которая меняет или удаляет существующее, сперва кладёт `backup`.
 */
import { SAVE_FORMAT, SAVE_PREFIX } from './saveKeys';

/** Ключ (полный, с префиксом) → строка, как она лежит в хранилище. */
export type KV = Map<string, string>;

const V1_COLLECTION = SAVE_PREFIX + 'v1:collection';
const V2_COLLECTION = SAVE_PREFIX + 'v2:collection';

/**
 * 1 → 2. Музей самой первой сборки переезжает в `v2:collection`, только если того
 * нет вовсе. Пустой `[]` — это «Стереть всё» в 1.1, и его не трогаем; битый — дело
 * карантина. Непустой `v2` в 1.1 всегда содержит весь `v1`, поэтому не объединяем.
 */
function collectionV1ToV2(kv: KV): void {
  if (kv.has(V2_COLLECTION)) return;
  const old = kv.get(V1_COLLECTION);
  if (old === undefined) return;
  try {
    const data: unknown = JSON.parse(old);
    if (!Array.isArray(data)) return;
    const items = data.filter((item): item is string => typeof item === 'string');
    if (items.length > 0) kv.set(V2_COLLECTION, JSON.stringify(items));
  } catch {
    /* не разобрали — оставляем как есть */
  }
}

/** `MIGRATIONS[i]` переводит формат `i + 1` в `i + 2`. */
export const MIGRATIONS: readonly ((kv: KV) => void)[] = [collectionV1ToV2];

/** Довести снимок от формата `from` до `SAVE_FORMAT`. Номер меньше 1 считается единицей. */
export function migrateKV(kv: KV, from: number): void {
  for (let i = Math.max(1, from) - 1; i < SAVE_FORMAT - 1; i += 1) {
    MIGRATIONS[i]?.(kv);
  }
}
