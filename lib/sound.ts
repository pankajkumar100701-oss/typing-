// Tiny synthesized sounds (Web Audio) — no audio files needed.

let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

function getCtx() {
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  if (ctx.state !== "running") void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Phones only allow sound after a real tap or key press (a touch "pointerdown" doesn't count),
 * so wake the audio on the first one of those instead of on the first on-screen key.
 */
export function primeAudio() {
  const wake = () => {
    try {
      getCtx();
    } catch {
      // audio unavailable
    }
  };
  const events = ["pointerup", "touchend", "keydown", "click"] as const;
  events.forEach((e) => window.addEventListener(e, wake, { capture: true, passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, wake, { capture: true }));
}

function play(fn: () => void) {
  try {
    // While audio is still waking up, skip the sound — otherwise all the queued clicks
    // would play at once in a crackly burst.
    if (getCtx().state === "running") fn();
  } catch {
    // audio unavailable — stay silent
  }
}

/** Soft "tock" for a correct key (slightly varied so it doesn't sound robotic). */
export const playKey = () =>
  play(() => {
    tone(1100 + Math.random() * 200, 0, 0.04, "triangle", 0.09);
    tone(320, 0, 0.03, "sine", 0.06); // a little body so phone speakers don't sound tinny
  });

/** Quieter click for backspace. */
export const playBack = () => play(() => tone(700, 0, 0.035, "triangle", 0.06));

/** Low double buzz for a wrong key. */
export const playError = () =>
  play(() => {
    tone(190, 0, 0.09, "square", 0.045);
    tone(150, 0.07, 0.11, "square", 0.04);
  });

/** Race countdown: a short beep for 3, 2, 1 and a higher one for GO. */
export const playCount = (go: boolean) => play(() => tone(go ? 1046.5 : 523.25, 0, go ? 0.35 : 0.15, "sine", 0.12));

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

// On-screen keyboard preference: "auto" shows it until a real keyboard (OTG/Bluetooth or a
// laptop's) is typed on, then hides it for this visit; "show"/"hide" are the user's explicit choice.
export type KbdPref = "auto" | "show" | "hide";
const KBD_KEY = "typefast:kbd";
let kbd: KbdPref | null = null;

export function getKbdPref(): KbdPref {
  if (kbd === null) {
    try {
      const v = localStorage.getItem(KBD_KEY);
      kbd = v === "show" || v === "hide" ? v : "auto";
    } catch {
      kbd = "auto";
    }
  }
  return kbd;
}

export function getKbdPrefOnServer(): KbdPref {
  return "auto";
}

/** A real key was pressed on a touch screen: an OTG/Bluetooth keyboard is in use. */
export function noteHardwareKey() {
  if (getKbdPref() !== "auto" || !window.matchMedia("(pointer: coarse)").matches) return;
  kbd = "hide"; // not saved — next visit starts with the on-screen keyboard again
  listeners.forEach((l) => l());
}

/** Flip whatever is currently visible. */
export function toggleKbd() {
  kbd = getKbdPref() === "hide" ? "show" : "hide";
  try {
    localStorage.setItem(KBD_KEY, kbd);
  } catch {
    // storage blocked — the setting lasts for this visit only
  }
  listeners.forEach((l) => l());
}

// Paragraph length (words) for Experienced and Advance lessons.
const WORDS_KEY = "typefast:words";
export const WORD_CHOICES = [20, 30, 50, 70, 100];
let wordCount: number | null = null;

export function getWordCount(): number {
  if (wordCount === null) {
    try {
      const v = Number(localStorage.getItem(WORDS_KEY));
      wordCount = v >= 5 && v <= 500 ? v : 100;
    } catch {
      wordCount = 100;
    }
  }
  return wordCount;
}

export function getWordCountOnServer(): number {
  return 100;
}

export function setWordCount(n: number) {
  wordCount = Math.min(500, Math.max(5, Math.round(n) || 100));
  try {
    localStorage.setItem(WORDS_KEY, String(wordCount));
  } catch {
    // storage blocked — the setting lasts for this visit only
  }
  listeners.forEach((l) => l());
}
