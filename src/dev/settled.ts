/**
 * «Экран улёгся» — признак для обхода `?shots`, без Phaser, чтобы проверять тестом.
 *
 * Пауза в `settle` — только надежда: в Chrome без окна кадр бывает медленным,
 * шаги теряются, и «Мои сокровища» снимались на трети появившихся предметов
 * (тайник с последними так и не успевал вырасти). Настоящий признак — у сцены
 * не осталось конечных твинов.
 */

/**
 * Всё, что нужно от твина. У `Tween` с `loop: -1` или `{ repeat: -1 }` Phaser сам
 * зажигает `isInfinite` (`BaseTweenData.reset`). У цепочки (`TweenChain`) этого
 * поля нет вовсе: бесконечна она через свой `loop` или через бесконечное звено,
 * а звенья лежат в её `data`.
 */
export interface TweenLike {
  isInfinite?: boolean;
  /** `-1` — цепочка крутится без конца. */
  loop?: number;
  /**
   * Куски твина (у цепочки — её звенья). `null` у разобранного: данных у него нет.
   */
  data: readonly object[] | null;
}

/** Кусок твина или звено цепочки, которое не кончится никогда. */
function endlessPart(part: object): boolean {
  const { repeat, isInfinite } = part as { repeat?: number; isInfinite?: boolean };
  // `repeat === -1` у куска — подстраховка: Phaser в этом случае уже зажёг
  // `isInfinite` у самого твина, но если однажды перестанет, кадр не упадёт.
  return repeat === -1 || isInfinite === true;
}

/** Твин, который не кончится никогда: покачивание, мерцание, вращение лучей. */
function endless(tween: TweenLike): boolean {
  return tween.isInfinite === true || tween.loop === -1 || (tween.data?.some(endlessPart) ?? false);
}

/**
 * Сколько твинов ещё идут к концу. Бесконечные не считаются: они не кончатся
 * никогда, и ждать их — значит не снять кадр совсем.
 */
export function unfinishedTweens(tweens: readonly TweenLike[]): number {
  return tweens.filter((tween) => tween.data !== null && !endless(tween)).length;
}
