/**
 * Память вместо браузерного `localStorage` — общая для всех тестов сохранения.
 *
 * Умеет то, чем ломается настоящее хранилище: тесное место (квота в знаках,
 * как у браузера), вкладка, закрытая на середине записей, и один сбойный
 * `setItem` посреди действия. Счётчики записей и удалений нужны, чтобы
 * проверять «не писал лишнего», а не только «значение то же».
 */

export class MemoryStorage {
  readonly items = new Map<string, string>();
  /** Потолок суммы длин всех ключей и значений. Выше — `QuotaExceededError`. */
  quota = Infinity;
  /** Удавшихся `setItem`. */
  sets = 0;
  /** `removeItem`, которые что-то удалили. */
  removes = 0;
  private okLeft = Infinity;
  private failAt = Infinity;

  /** После n удавшихся записей все следующие бросают (вкладку закрыли). */
  failAfter(n: number): void {
    this.okLeft = n;
  }

  /** Ровно n-я из ближайших записей бросает один раз — не квота, повтора не будет. */
  failOnWrite(n: number): void {
    this.failAt = n;
  }

  /** Сумма длин ключей и значений — так считают «знаки» в квоте. */
  used(): number {
    let total = 0;
    for (const [key, value] of this.items) total += key.length + value.length;
    return total;
  }

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.okLeft <= 0) throw new Error('вкладку закрыли');
    this.failAt -= 1;
    if (this.failAt === 0) throw new Error('сбой одной записи');
    const before = this.items.get(key);
    const next =
      this.used() - (before === undefined ? 0 : key.length + before.length) + key.length + value.length;
    if (next > this.quota) throw new DOMException('нет места', 'QuotaExceededError');
    this.items.set(key, value);
    this.okLeft -= 1;
    this.sets += 1;
  }

  removeItem(key: string): void {
    if (this.items.delete(key)) this.removes += 1;
  }

  clear(): void {
    this.items.clear();
  }

  /** Всё содержимое одной строкой: «хранилище побайтно то же» сравнивается ею. */
  dump(): string {
    return JSON.stringify([...this.items].sort());
  }
}

/** Подставить свежую память на место `localStorage` и вернуть её. */
export function installMemoryStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return storage;
}
