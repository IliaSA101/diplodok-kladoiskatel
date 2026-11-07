/**
 * «Find a word»: жест целиком — нажатие, протягивание, отпускание, тишина после
 * находки (002-26, 002-29) и потерянное отпускание (002-28).
 *
 * Вынесено из `tests/wordSearch.test.ts`: вместе с остальным файл упирался в
 * порог в шестьсот строк.
 */
import { describe, expect, it } from 'vitest';
import { SEARCH_DRAG_MIN } from '../src/art/englishLayout';
import type { Placement } from '../src/systems/wordGrid';
import { FOUND_QUIET_MS, createWordPick } from '../src/systems/wordPick';

/**
 * Часы сцены, которые идут сами: время в `press`/`drag`/`click` обязательно (002-30).
 * Шаг больше окна тишины после находки, поэтому «молчание» проверяют тесты с
 * явным временем, а не случайное совпадение часов.
 */
let clock = 0;
const tick = (): number => (clock += 1000);

/**
 * Нажал, повёл, отпустил: жест целиком.
 *
 * Нажатие на уже выбранную букву путь не трогает — снимает её только отпускание
 * на той же плитке без протягивания. Раньше снимало нажатие: ребёнок отпускал
 * кнопку раньше времени, жал на последнюю выбранную и тянул дальше, — и буква
 * гасла под рукой, а следующая дрожала как неверная (002-19).
 */
describe('жест: нажатие, протягивание, отпускание', () => {
  const love: Placement = { word: 'love', row: 0, col: 0, horizontal: true };
  const cat: Placement = { word: 'cat', row: 5, col: 2, horizontal: true };
  const at = (col: number, row = 0): { row: number; col: number } => ({ row, col });
  /** Рука ушла от точки нажатия дальше дрожи. */
  const FAR = SEARCH_DRAG_MIN + 10;

  /** `l` и `o` выбраны и кнопку отпустили: путь l→o. */
  function lo(): ReturnType<typeof createWordPick> {
    const pick = createWordPick([love, cat]);
    pick.click(at(0), tick());
    pick.click(at(1), tick());
    expect(pick.path).toEqual([at(0), at(1)]);
    return pick;
  }

  it('нажал на последнюю выбранную и повёл дальше — слово найдено, ничего не погасло', () => {
    const pick = lo();
    expect(pick.press(at(1), tick()).kind).toBe('ignore');
    // Нажатие путь не тронуло: `o` на месте.
    expect(pick.path).toEqual([at(0), at(1)]);
    expect(pick.drag(at(2), FAR, tick()).kind).toBe('extend');
    const last = pick.drag(at(3), FAR, tick());
    expect(last.kind).toBe('found');
    expect(pick.isFound('love')).toBe(true);
    expect(pick.path).toEqual([]);
    // Отпустили на `e` — слово уже найдено, это не «остановился на неверной».
    expect(pick.release(at(3)).kind).toBe('ignore');
  });

  it('нажал на выбранную и отпустил на ней же, не протянув, — снимает её и всё после', () => {
    const pick = lo();
    pick.press(at(0), tick());
    expect(pick.path, 'нажатие само ничего не снимает').toEqual([at(0), at(1)]);
    expect(pick.release(at(0))).toEqual({ kind: 'trim', removed: 2 });
    expect(pick.path).toEqual([]);
    // С последней — снимается одна.
    const again = lo();
    again.press(at(1), tick());
    expect(again.release(at(1))).toEqual({ kind: 'trim', removed: 1 });
    expect(again.path).toEqual([at(0)]);
  });

  it('протянул дальше и вернулся на ту же выбранную — путь не тронут', () => {
    const pick = lo();
    pick.press(at(1), tick());
    pick.drag(at(2, 3), FAR, tick());
    pick.drag(at(1), FAR, tick());
    expect(pick.release(at(1)).kind).toBe('ignore');
    expect(pick.path).toEqual([at(0), at(1)]);
  });

  it('жест, начатый на средней выбранной, ничего не растит и не дрожит', () => {
    const pick = lo();
    pick.press(at(0), tick());
    expect(pick.drag(at(1), FAR, tick()).kind).toBe('ignore');
    expect(pick.drag(at(4, 4), FAR, tick()).kind).toBe('ignore');
    expect(pick.release(at(4, 4)).kind).toBe('ignore');
    expect(pick.path).toEqual([at(0), at(1)]);
    // Да и `o` растёт только от последней: путь остался l→o.
    pick.press(at(0), tick());
    pick.drag(at(2), FAR, tick());
    expect(pick.path).toEqual([at(0), at(1)]);
  });

  it('нажал на неверную и протянул на другую неверную — отвечает одна, та, с которой начал', () => {
    const pick = createWordPick([love, cat]);
    expect(pick.press(at(4, 4), tick()).kind).toBe('wrong');
    expect(pick.drag(at(5, 4), FAR, tick()).kind).toBe('ignore');
    expect(pick.drag(at(0), FAR, tick()).kind, 'даже верная первая буква: жест мёртв').toBe('ignore');
    expect(pick.release(at(6, 4)).kind).toBe('ignore');
    expect(pick.path).toEqual([]);
    // Следующий жест работает как обычно.
    expect(pick.press(at(0), tick()).kind).toBe('start');
  });

  it('дрожь руки на стыке плиток — не протягивание: вторая буква не добавляется', () => {
    const pick = createWordPick([love, cat]);
    pick.press(at(0), tick());
    // Верная вторая буква рядом, но рука ушла на пару пикселей: это всё ещё клик.
    expect(pick.drag(at(1), SEARCH_DRAG_MIN - 1, tick()).kind).toBe('ignore');
    expect(pick.path).toEqual([at(0)]);
    expect(pick.release(at(1)).kind, 'и отпускание на соседней — не «неверная»').toBe('ignore');
    expect(pick.path).toEqual([at(0)]);
    // Ушла дальше дрожи — это уже протягивание.
    pick.press(at(0), tick());
    expect(pick.drag(at(1), SEARCH_DRAG_MIN, tick()).kind).toBe('extend');
  });

  it('небрежный клик по последней выбранной на стыке снимает её, а не оставляет', () => {
    const pick = lo();
    pick.press(at(1), tick());
    pick.drag(at(2), SEARCH_DRAG_MIN - 1, tick());
    expect(pick.release(at(2))).toEqual({ kind: 'trim', removed: 1 });
    expect(pick.path).toEqual([at(0)]);
  });

  it('протянул и остановился на неверной — дрожит она одна, путь остался', () => {
    const pick = lo();
    pick.press(at(1), tick());
    expect(pick.drag(at(4, 4), FAR, tick()).kind).toBe('ignore');
    expect(pick.release(at(4, 4)).kind).toBe('wrong');
    expect(pick.path).toEqual([at(0), at(1)]);
    // Остановился в просвете или за полем — не ошибка.
    pick.press(at(1), tick());
    pick.drag(null, FAR, tick());
    expect(pick.release(null).kind).toBe('ignore');
  });

  it('слово найдено нажатием на последнюю букву: дальше жест ничего не начинает', () => {
    const pick = createWordPick([love, cat]);
    for (const col of [0, 1, 2]) pick.click(at(col), tick());
    expect(pick.press(at(3), tick()).kind).toBe('found');
    // Рука идёт дальше с нажатой кнопкой — на первую букву другого слова.
    expect(pick.drag({ row: 5, col: 2 }, FAR, tick()).kind).toBe('ignore');
    expect(pick.path).toEqual([]);
    expect(pick.release({ row: 5, col: 2 }).kind).toBe('ignore');
  });

  it('двойной клик по последней букве найденного слова: второе нажатие молчит (002-26)', () => {
    // Время передаёт сцена, а не модуль: тест не зависит от часов.
    const pick = createWordPick([love, cat]);
    let now = 1000;
    for (const col of [0, 1, 2]) pick.click(at(col), now);
    expect(pick.press(at(3), now).kind).toBe('found');
    pick.release(at(3));
    now += FOUND_QUIET_MS - 1;
    expect(pick.press(at(3), now).kind, 'вторая половина двойного клика — не «неверно»').toBe('ignore');
    expect(pick.release(at(3)).kind).toBe('ignore');
    // Любая клетка найденного слова: клик по первой тоже ничего не начинает.
    expect(pick.press(at(0), now).kind).toBe('ignore');
    pick.release(at(0));
    expect(pick.path).toEqual([]);
    // Тишина только для клеток найденного слова: чужая неверная клетка отвечает «неверно».
    expect(pick.press(at(4, 4), now).kind, 'неверная клетка вне найденного слова').toBe('wrong');
    pick.release(at(4, 4));
    // Чужое слово в те же миллисекунды ищется как обычно.
    expect(pick.press({ row: 5, col: 2 }, now).kind).toBe('start');
    pick.release({ row: 5, col: 2 });
    // Нажатие, которое промолчало, — мёртвый жест: протягивание от него путь не растит.
    expect(pick.press(at(3), now).kind).toBe('ignore');
    expect(pick.drag({ row: 5, col: 3 }, FAR, now).kind).toBe('ignore');
    expect(pick.path).toEqual([{ row: 5, col: 2 }]);
  });

  it('после паузы нажатие на найденное слово снова отвечает «неверно»', () => {
    // Защита короткая: ребёнок, ткнувший в золотую букву через секунду, слышит ответ.
    const pick = createWordPick([love, cat]);
    for (const col of [0, 1, 2, 3]) pick.click(at(col), 1000);
    expect(pick.press(at(3), 1000 + FOUND_QUIET_MS).kind).toBe('wrong');
  });

  it('слово найдено протягиванием: нажатие на его клетку сразу после тоже молчит', () => {
    const pick = createWordPick([love, cat]);
    pick.press(at(0), 500);
    pick.drag(at(1), FAR, 520);
    pick.drag(at(2), FAR, 540);
    expect(pick.drag(at(3), FAR, 560).kind).toBe('found');
    pick.release(at(3));
    expect(pick.press(at(3), 560 + FOUND_QUIET_MS - 1).kind).toBe('ignore');
  });

  it('окно тишины глушит только «неверно»: начало нового слова с той же клетки проходит (002-29)', () => {
    // eat начинается на последней букве love: быстрая рука не натыкается на немую плитку.
    const eat: Placement = { word: 'eat', row: 0, col: 3, horizontal: false };
    const pick = createWordPick([love, eat]);
    for (const col of [0, 1, 2]) pick.click(at(col), 1000);
    expect(pick.press(at(3), 1000).kind).toBe('found');
    pick.release(at(3));
    expect(pick.press(at(3), 1000 + FOUND_QUIET_MS - 1).kind).toBe('start');
    expect(pick.drag(at(3, 1), FAR, 1200).kind, 'жест жив: путь растёт').toBe('extend');
    expect(pick.path).toEqual([at(3), at(3, 1)]);
    pick.clear();
    // Двойной клик по клетке, с которой ничего не начинается, по-прежнему тих.
    expect(pick.press(at(0), 1000 + FOUND_QUIET_MS - 1).kind).toBe('ignore');
    expect(pick.drag(at(1), FAR, 1250).kind, 'и жест мёртв').toBe('ignore');
  });

  it('окно тишины не мешает снять букву нового слова: «выбрана ли» раньше «найденная ли» (002-32)', () => {
    const eat: Placement = { word: 'eat', row: 0, col: 3, horizontal: false };
    const pick = createWordPick([love, eat]);
    for (const col of [0, 1, 2]) pick.click(at(col), 1000);
    expect(pick.press(at(3), 1000).kind).toBe('found');
    pick.release(at(3));
    const t = 1000 + FOUND_QUIET_MS - 200;
    expect(pick.click(at(3), t).kind).toBe('start');
    expect(pick.path).toEqual([at(3)]);
    // Вторая половина двойного клика по только что выбранной букве снимает её, а не молчит.
    expect(pick.click(at(3), t + 100)).toEqual({ kind: 'trim', removed: 1 });
    expect(pick.path).toEqual([]);
  });

  it('потерянное отпускание гасит жест без вердикта: путь прежний, отпускание молчит (002-28)', () => {
    const pick = lo();
    pick.press(at(1), tick());
    expect(pick.drag(at(2), FAR, tick()).kind).toBe('extend');
    pick.abort();
    expect(pick.path).toEqual([at(0), at(1), at(2)]);
    expect(pick.release(at(4, 4)).kind, 'после протягивания это было бы «неверно»').toBe('ignore');
    // Нажали на последнюю выбранную и потеряли отпускание: буква не снимается.
    const held = lo();
    held.press(at(1), tick());
    held.abort();
    expect(held.release(at(1)).kind).toBe('ignore');
    expect(held.path).toEqual([at(0), at(1)]);
  });

  it('очистка посреди жеста: отпускание после неё ничего не делает', () => {
    const pick = lo();
    pick.press(at(1), tick());
    pick.clear();
    expect(pick.release(at(1)).kind).toBe('ignore');
    expect(pick.path).toEqual([]);
  });
});
