export type Best = { wpm: number; acc: number };
export type Progress = { [lessonId: string]: Best };

const KEY = "typefast:best";
const EMPTY: Progress = {};

let progress: Progress | null = null;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProgress(): Progress {
  if (!progress) {
    try {
      progress = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Progress;
    } catch {
      progress = EMPTY;
    }
  }
  return progress;
}

export function getServerProgress(): Progress {
  return EMPTY;
}

export function saveResult(id: string, result: Best) {
  const current = getProgress();
  const prev = current[id];
  progress = {
    ...current,
    [id]: { wpm: Math.max(prev?.wpm ?? 0, result.wpm), acc: Math.max(prev?.acc ?? 0, result.acc) },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // storage blocked (private mode) — bests just won't persist
  }
  listeners.forEach((l) => l());
}

/** Speed colour band: under 30 wpm red, 30–49 yellow, 50+ green. */
export function speedBand(wpm: number): "slow" | "mid" | "fast" {
  if (wpm < 30) return "slow";
  if (wpm < 50) return "mid";
  return "fast";
}
