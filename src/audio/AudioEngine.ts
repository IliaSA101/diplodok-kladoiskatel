/**
 * Звук игры: всё синтезируется Web Audio API, внешних файлов нет.
 * AudioContext создаётся лениво в unlock() (на первом тапе — требование iOS Safari).
 * Если Web Audio недоступен или что-то бросает исключение, игра молча идёт без звука.
 */
import { CONFIG } from '../config';
import { save } from '../systems/save';
import { SOUND_SYNTHS } from './sounds';

export type SoundName =
  | 'tap' | 'step' | 'dig' | 'dirt' | 'chest' | 'fanfare'
  | 'beep' | 'found' | 'whoosh' | 'win' | 'confetti';

export interface PlayOptions {
  /** Множитель громкости, 0..1 (по умолчанию 1). */
  volume?: number;
  /** Множитель высоты тона (по умолчанию 1). */
  pitch?: number;
}

/** В старом Safari конструктор называется webkitAudioContext. */
type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** null — ещё не читали из сохранения. */
let mutedState: boolean | null = null;
/** Контекст не удалось создать — больше не пытаемся. */
let failed = false;

function isMuted(): boolean {
  if (mutedState === null) {
    try {
      mutedState = save.loadSettings().muted;
    } catch {
      mutedState = false;
    }
  }
  return mutedState;
}

function applyMasterVolume(): void {
  if (master === null || ctx === null) return;
  try {
    // Короткая рампа вместо мгновенного скачка — без щелчка при переключении.
    const target = isMuted() ? 0 : CONFIG.audio.masterVolume;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  } catch {
    /* без звука — не беда */
  }
}

function resumeIfNeeded(): void {
  if (ctx === null || ctx.state === 'running') return;
  try {
    ctx.resume().catch(() => {
      /* пользователь ещё не взаимодействовал — подождём следующего тапа */
    });
  } catch {
    /* ничего */
  }
}

/** Единственный экземпляр на всю игру. */
export const audio = {
  /** Создать/разбудить AudioContext. Вызывать из обработчика первого тапа или нажатия клавиши. */
  unlock(): void {
    if (failed) return;
    try {
      if (ctx === null) {
        const Ctor = getAudioContextCtor();
        if (Ctor === null) {
          failed = true;
          return;
        }
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = isMuted() ? 0 : CONFIG.audio.masterVolume;
        master.connect(ctx.destination);
        // Беззвучный «тик» — iOS окончательно разблокирует звук после первого воспроизведения.
        const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(ctx.destination);
        src.start(0);
      }
      resumeIfNeeded();
    } catch {
      failed = true;
      ctx = null;
      master = null;
    }
  },

  play(name: SoundName, options?: PlayOptions): void {
    if (ctx === null || master === null || failed || isMuted()) return;
    try {
      resumeIfNeeded();
      const resolved: Required<PlayOptions> = {
        volume: clamp(options?.volume ?? 1, 0, 1),
        pitch: clamp(options?.pitch ?? 1, 0.25, 4),
      };
      SOUND_SYNTHS[name](ctx, master, resolved);
    } catch {
      /* звук не должен ронять игру */
    }
  },

  get muted(): boolean {
    return isMuted();
  },

  setMuted(muted: boolean): void {
    mutedState = muted;
    try {
      save.saveSettings({ muted });
    } catch {
      /* ничего */
    }
    applyMasterVolume();
  },

  /** Переключает и возвращает новое состояние. */
  toggleMuted(): boolean {
    const next = !isMuted();
    audio.setMuted(next);
    return next;
  },
};
