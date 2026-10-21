/**
 * Чистые функции синтеза звуков. Каждая берёт AudioContext и «розетку» (destination),
 * сама собирает осцилляторы и шум и сама их останавливает.
 * Правила для детской игры: плавная атака (>= 10 мс), плавное затухание (без щелчков),
 * мягкие частоты (до ~2.5 кГц), ничего длиннее ~2 секунд.
 */
import type { PlayOptions, SoundName } from './AudioEngine';

export type SynthFn = (
  ctx: AudioContext,
  destination: GainNode,
  options: Required<PlayOptions>,
) => void;

/** Практически ноль: до настоящего нуля экспоненциальная рампа не доходит. */
const SILENCE = 0.0001;
/** Минимальная атака, чтобы звук не «щёлкал» на старте. */
const MIN_ATTACK = 0.012;

// ---------- Вспомогательные штуки ----------

/** Белый шум: короткий буфер создаётся один раз на контекст и переиспользуется. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    const length = Math.floor(ctx.sampleRate * 1);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Огибающая: тихо -> пик (линейно за attack) -> плавное затухание до тишины к концу dur. */
function envelope(
  ctx: AudioContext,
  destination: AudioNode,
  start: number,
  dur: number,
  peak: number,
  attack: number = MIN_ATTACK,
): GainNode {
  const gain = ctx.createGain();
  const a = Math.max(attack, MIN_ATTACK);
  const top = Math.max(peak, SILENCE * 2);
  gain.gain.setValueAtTime(SILENCE, start);
  gain.gain.linearRampToValueAtTime(top, start + a);
  gain.gain.exponentialRampToValueAtTime(SILENCE, start + Math.max(dur, a + 0.02));
  gain.connect(destination);
  return gain;
}

interface ToneSpec {
  type?: OscillatorType;
  freq: number;
  /** Конечная частота (плавный глайд); если не задана, тон ровный. */
  freqEnd?: number;
  /** Старт относительно «сейчас», секунды. */
  at?: number;
  dur: number;
  peak: number;
  attack?: number;
}

/** Один тон: осциллятор -> огибающая -> destination. */
function tone(ctx: AudioContext, destination: AudioNode, spec: ToneSpec): void {
  const start = ctx.currentTime + (spec.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = spec.type ?? 'sine';
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 20), start + spec.dur);
  }
  const env = envelope(ctx, destination, start, spec.dur, spec.peak, spec.attack);
  osc.connect(env);
  osc.start(start);
  osc.stop(start + spec.dur + 0.05);
}

interface NoiseSpec {
  filter: BiquadFilterType;
  freq: number;
  /** Конечная частота фильтра для «свипа». */
  freqEnd?: number;
  q?: number;
  at?: number;
  dur: number;
  peak: number;
  attack?: number;
}

/** Шумовой всплеск через фильтр. */
function noise(ctx: AudioContext, destination: AudioNode, spec: NoiseSpec): void {
  const start = ctx.currentTime + (spec.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter;
  filter.Q.value = spec.q ?? 0.7;
  filter.frequency.setValueAtTime(spec.freq, start);
  if (spec.freqEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 40), start + spec.dur);
  }
  const env = envelope(ctx, destination, start, spec.dur, spec.peak, spec.attack);
  src.connect(filter);
  filter.connect(env);
  // Начинаем с разных мест буфера, чтобы повторы не звучали одинаково.
  src.start(start, Math.random() * 0.5);
  src.stop(start + spec.dur + 0.05);
}

/** Мягкий фильтр высоких частот для ярких звуков: срезает «визг». */
function softBus(ctx: AudioContext, destination: AudioNode, cutoff: number): BiquadFilterNode {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.5;
  lp.connect(destination);
  return lp;
}

// ---------- Сами звуки ----------

/** Короткий мягкий блип нажатия (~0.09 с). */
const tap: SynthFn = (ctx, dest, { volume, pitch }) => {
  tone(ctx, dest, { type: 'triangle', freq: 660 * pitch, dur: 0.09, peak: 0.5 * volume });
};

/** Очень тихий низкий «туп» шага (~0.1 с). */
const step: SynthFn = (ctx, dest, { volume, pitch }) => {
  tone(ctx, dest, {
    freq: 130 * pitch,
    freqEnd: 70 * pitch,
    dur: 0.1,
    peak: 0.12 * volume,
    attack: 0.015,
  });
};

/** Глухой удар лопаты: низкий шум + синус ~110 Гц (~0.25 с). */
const dig: SynthFn = (ctx, dest, { volume, pitch }) => {
  noise(ctx, dest, { filter: 'lowpass', freq: 500 * pitch, dur: 0.2, peak: 0.6 * volume });
  tone(ctx, dest, {
    freq: 110 * pitch,
    freqEnd: 60 * pitch,
    dur: 0.25,
    peak: 0.7 * volume,
    attack: 0.012,
  });
};

/** Шорох земли: два коротких шумовых всплеска (~0.28 с). */
const dirt: SynthFn = (ctx, dest, { volume, pitch }) => {
  noise(ctx, dest, {
    filter: 'bandpass',
    freq: 1100 * pitch,
    q: 0.8,
    dur: 0.12,
    peak: 0.28 * volume,
  });
  noise(ctx, dest, {
    filter: 'bandpass',
    freq: 800 * pitch,
    q: 0.8,
    at: 0.1,
    dur: 0.14,
    peak: 0.22 * volume,
  });
};

/** «Дзынь» колокольчиком: основной тон и две гармоники (~1.2 с). */
const chest: SynthFn = (ctx, dest, { volume, pitch }) => {
  const bus = softBus(ctx, dest, 3000);
  const ding = (at: number, base: number, level: number): void => {
    tone(ctx, bus, { freq: base * pitch, at, dur: 1.0, peak: 0.4 * level * volume });
    tone(ctx, bus, { freq: base * 2 * pitch, at, dur: 0.7, peak: 0.16 * level * volume });
    tone(ctx, bus, { freq: base * 2.76 * pitch, at, dur: 0.4, peak: 0.06 * level * volume });
  };
  ding(0, 784, 1);
  ding(0.14, 1047, 0.8);
};

/** Арпеджио до-мажора из 4 нот и мягкий аккорд в конце (~1.2 с). */
const fanfare: SynthFn = (ctx, dest, { volume, pitch }) => {
  const bus = softBus(ctx, dest, 2800);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone(ctx, bus, {
      type: 'triangle',
      freq: f * pitch,
      at: i * 0.15,
      dur: last ? 0.75 : 0.22,
      peak: 0.45 * volume,
    });
    tone(ctx, bus, {
      freq: f * 2 * pitch,
      at: i * 0.15,
      dur: last ? 0.6 : 0.16,
      peak: 0.08 * volume,
    });
  });
  // Финальный аккорд подпирает последнюю ноту.
  [523.25, 659.25, 783.99].forEach((f) => {
    tone(ctx, bus, { type: 'triangle', freq: f * pitch, at: 0.45, dur: 0.75, peak: 0.16 * volume });
  });
};

/** Мягкий «бип» подсказки; высоту задаёт pitch (~0.14 с). */
const beep: SynthFn = (ctx, dest, { volume, pitch }) => {
  tone(ctx, dest, { freq: 440 * pitch, dur: 0.14, peak: 0.4 * volume });
};

/** Восходящая искорка из четырёх коротких нот (~0.5 с). */
const found: SynthFn = (ctx, dest, { volume, pitch }) => {
  const bus = softBus(ctx, dest, 2800);
  [660, 880, 1174.7, 1568].forEach((f, i) => {
    tone(ctx, bus, { freq: f * pitch, at: i * 0.075, dur: 0.2, peak: 0.32 * volume });
  });
};

/** Шумовой свип: диплодок тянет шею (~0.7 с). */
const whoosh: SynthFn = (ctx, dest, { volume, pitch }) => {
  noise(ctx, dest, {
    filter: 'bandpass',
    freq: 300 * pitch,
    freqEnd: 1300 * pitch,
    q: 1.2,
    dur: 0.38,
    peak: 0.5 * volume,
    attack: 0.1,
  });
  noise(ctx, dest, {
    filter: 'bandpass',
    freq: 1300 * pitch,
    freqEnd: 450 * pitch,
    q: 1.2,
    at: 0.3,
    dur: 0.4,
    peak: 0.4 * volume,
    attack: 0.05,
  });
};

/** Большая победная фанфара: подъём по нотам и широкий аккорд (~1.95 с). */
const win: SynthFn = (ctx, dest, { volume, pitch }) => {
  const bus = softBus(ctx, dest, 2800);
  const run = [392, 523.25, 659.25, 783.99, 1046.5];
  run.forEach((f, i) => {
    tone(ctx, bus, { type: 'triangle', freq: f * pitch, at: i * 0.16, dur: 0.3, peak: 0.4 * volume });
  });
  // Финальный широкий аккорд.
  const chord = [261.63, 523.25, 659.25, 783.99, 1046.5];
  chord.forEach((f, i) => {
    tone(ctx, bus, {
      type: 'triangle',
      freq: f * pitch,
      at: 0.85,
      dur: 1.1,
      peak: (i === 0 ? 0.3 : 0.2) * volume,
      attack: 0.02,
    });
  });
  tone(ctx, bus, { freq: 2093 * pitch, at: 0.85, dur: 0.6, peak: 0.05 * volume });
};

/** Несколько тихих «пок» вразнобой (~0.65 с). */
const confetti: SynthFn = (ctx, dest, { volume, pitch }) => {
  for (let i = 0; i < 5; i++) {
    const f = (420 + Math.random() * 420) * pitch;
    tone(ctx, dest, {
      freq: f,
      freqEnd: f * 0.6,
      at: Math.random() * 0.5,
      dur: 0.1,
      peak: (0.1 + Math.random() * 0.06) * volume,
    });
  }
};

export const SOUND_SYNTHS: Record<SoundName, SynthFn> = {
  tap,
  step,
  dig,
  dirt,
  chest,
  fanfare,
  beep,
  found,
  whoosh,
  win,
  confetti,
};
