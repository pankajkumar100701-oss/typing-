// Tiny synthesized sounds (Web Audio) — no audio files needed.

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();
const KEY = "typefast:muted";

export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function isMutedOnServer() {
  return false;
}

export function toggleMute() {
  muted = !isMuted();
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    // storage blocked — the setting lasts for this visit only
  }
  listeners.forEach((l) => l());
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const t = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function play(fn: () => void) {
  if (isMuted()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    fn();
  } catch {
    // audio unavailable — stay silent
  }
}

/** Soft click for a correct key (slightly varied so it doesn't sound robotic). */
export const playKey = () => play(() => tone(1700 + Math.random() * 300, 0, 0.035, "triangle", 0.05));

/** Quieter click for backspace. */
export const playBack = () => play(() => tone(900, 0, 0.03, "triangle", 0.035));

/** Low double buzz for a wrong key. */
export const playError = () =>
  play(() => {
    tone(190, 0, 0.09, "square", 0.045);
    tone(150, 0.07, 0.11, "square", 0.04);
  });

/** Short rising chime when a text is finished. */
export const playComplete = () =>
  play(() => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      tone(f, i * 0.11, 0.45, "sine", 0.12);
      tone(f * 2, i * 0.11, 0.25, "triangle", 0.02);
    });
    tone(1318.5, 0.5, 0.9, "sine", 0.08); // E6 sparkle at the end
  });
