/**
 * Произношение английских слов голосом браузера (Web Speech API).
 *
 * Ребёнок читать по-английски ещё не умеет, поэтому слово он сначала слышит.
 * Внешних файлов нет: озвучка берётся из системы, как и весь звук игры.
 *
 * Чего здесь нельзя упрощать:
 * - голоса приходят не сразу, список пуст до события voiceschanged, поэтому
 *   голос выбирается в момент речи, а не один раз на старте;
 * - iOS Safari включает речь только после жеста пользователя — для этого
 *   warmUp() на первом тапе произносит пустую строку;
 * - выключенный звук выключает и голос: тумблер в игре один.
 * Любая ошибка гасится молча: без озвучки игра работает, без игры — нет.
 */
import { audio } from '../audio/AudioEngine';

/** Медленнее обычного: слово должно быть слышно по звукам. */
const RATE = 0.8;
const PITCH = 1.05;

let warmed = false;

function engine(): SpeechSynthesis | null {
  try {
    const synth = window.speechSynthesis as SpeechSynthesis | undefined;
    return synth ?? null;
  } catch {
    return null;
  }
}

/** Английский голос: сначала настоящий en-*, потом любой, какой есть. */
function englishVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  try {
    const voices = synth.getVoices();
    const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
    // Женские голоса обычно мягче, но имени у них нет единого — берём первый
    // локальный, он не зависит от сети и звучит без задержки.
    const local = english.find((voice) => voice.localService);
    return local ?? english[0] ?? null;
  } catch {
    return null;
  }
}

export const speech = {
  /** Есть ли вообще речь в этом браузере. */
  available(): boolean {
    return engine() !== null;
  },

  /**
   * Разбудить речь первым жестом — рядом с audio.unlock().
   * Пустая строка ничего не произносит, но снимает запрет iOS.
   */
  warmUp(): void {
    if (warmed) return;
    const synth = engine();
    if (synth === null) return;
    warmed = true;
    try {
      synth.speak(new SpeechSynthesisUtterance(''));
    } catch {
      /* без озвучки — не беда */
    }
  },

  /** Произнести слово. Звук выключен — молчим. */
  say(text: string): void {
    const synth = engine();
    if (synth === null || audio.muted || text.length === 0) return;
    try {
      // Без этого слова копятся в очередь: ребёнок жмёт кнопку несколько раз.
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = RATE;
      utterance.pitch = PITCH;
      const voice = englishVoice(synth);
      if (voice !== null) utterance.voice = voice;
      synth.speak(utterance);
    } catch {
      /* без озвучки — не беда */
    }
  },

  /** Замолчать: при выходе со сцены слово не должно догонять ребёнка. */
  stop(): void {
    try {
      engine()?.cancel();
    } catch {
      /* ничего */
    }
  },
};
