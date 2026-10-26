// The car a player drives: one of the photo cars in /public/cars and a paint colour (any colour,
// or the photo's own), saved in the browser. Each car has a cut-out photo and a mask of its
// painted panels; a new colour is painted onto those panels only, keeping the photo's light and shade.
//
// Cars unlock with speed: each tier opens at its wpm (10, 20 … 50, then 55), measured by the player's best
// clean speed in races, timed tests and paragraph lessons. The first car is always free.

import { getProgress } from "./progress";

export type CarLook = { id: string; p: string | null };
/** `span`: the share of the frame the car fills when it's narrower than the frame (its nose is on the right edge). */
export type CarModel = { id: string; name: string; tier: number; span?: number };

export const TIERS = [10, 20, 30, 40, 50, 55];

export const CAR_MODELS: CarModel[] = [
  { id: "fiat", name: "Cinquecento", tier: 10, span: 0.63 },
  { id: "hatch", name: "Family Hatch", tier: 10, span: 0.67 },
  { id: "bubble", name: "Bubble", tier: 10, span: 0.42 },
  { id: "city", name: "City Hatch", tier: 10, span: 0.68 },
  { id: "sunny", name: "Sunny Hatch", tier: 10, span: 0.72 },
  { id: "wagon", name: "Old Wagon", tier: 20, span: 0.87 },
  { id: "rusty", name: "Rust Bucket", tier: 20, span: 0.82 },
  { id: "etype", name: "E-Type", tier: 20 },
  { id: "hotrod", name: "Hot Rod", tier: 20, span: 0.76 },
  { id: "muscle", name: "Muscle Car", tier: 20 },
  { id: "racer", name: "Vintage Racer", tier: 30 },
  { id: "cruiser-red", name: "Red Cruiser", tier: 30, span: 0.86 },
  { id: "cruiser-blue", name: "Blue Cruiser", tier: 30, span: 0.84 },
  { id: "roadster", name: "Roadster", tier: 30 },
  { id: "royal", name: "Royal Classic", tier: 30, span: 0.76 },
  { id: "aston", name: "Aston", tier: 40 },
  { id: "amg", name: "AMG GT", tier: 40 },
  { id: "f40", name: "F40", tier: 40 },
  { id: "gt40", name: "GT40", tier: 40 },
  { id: "mclaren", name: "McLaren F1", tier: 40 },
  { id: "camaro", name: "Camaro", tier: 50 },
  { id: "mater", name: "Tow Truck", tier: 50, span: 0.42 },
  { id: "porsche", name: "Porsche 911", tier: 50 },
  { id: "storm", name: "Storm", tier: 50 },
  { id: "mcqueen", name: "Lightning", tier: 50, span: 0.87 },
  { id: "supra", name: "Supra F&F", tier: 55 },
  { id: "grsupra", name: "GR Supra", tier: 55 },
  { id: "supra-gt", name: "Supra GT", tier: 55 },
  { id: "ferrari", name: "Ferrari", tier: 55 },
  { id: "lambo", name: "Lambo", tier: 55 },
  { id: "lambo-green", name: "Lambo SVJ", tier: 55 },
  { id: "bugatti", name: "Bugatti", tier: 55 },
];

/** Ready-made paints; the colour ring offers any other. */
export const PAINTS = [
  { name: "Blue", hex: "#1f6feb" },
  { name: "Red", hex: "#e5303a" },
  { name: "Green", hex: "#2f9e5b" },
  { name: "Lime", hex: "#7cc62f" },
  { name: "Yellow", hex: "#f5c400" },
  { name: "Orange", hex: "#f76b15" },
  { name: "Pink", hex: "#ec5fa5" },
  { name: "Purple", hex: "#8e4ec6" },
  { name: "Teal", hex: "#12a5b5" },
  { name: "Black", hex: "#23272e" },
  { name: "Silver", hex: "#a7b0bb" },
  { name: "White", hex: "#f2f4f7" },
];

const KEY = "typefast:car";
export const DEFAULT_CAR: CarLook = { id: CAR_MODELS[0].id, p: null };

export const modelOf = (id: string) => CAR_MODELS.find((m) => m.id === id) ?? CAR_MODELS[0];
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Anything from storage or from another player becomes a valid car (old saves used indexes). */
export function cleanCar(car: unknown): CarLook {
  const c = (car ?? {}) as { id?: unknown; p?: unknown; m?: unknown; c?: unknown };
  const id = typeof c.id === "string" && CAR_MODELS.some((m) => m.id === c.id) ? c.id : DEFAULT_CAR.id;
  return { id, p: isHex(c.p) ? c.p.toLowerCase() : null };
}

// ---------- unlocking ----------

/** Runs that count for unlocking: paragraph lessons, timed tests and races, typed at least 80% right. */
const COUNTS = /^(e\d+|a\d+|test-\d+|race)$/;
const MIN_ACC = 80;

export function bestSpeed() {
  let best = 0;
  for (const [id, b] of Object.entries(getProgress())) if (COUNTS.test(id) && b.acc >= MIN_ACC) best = Math.max(best, b.wpm);
  return best;
}

export const isUnlocked = (model: CarModel, best: number) => model === CAR_MODELS[0] || best >= model.tier;

/** The highest tier reached, 0 if none. */
export const tierReached = (best: number) => TIERS.filter((t) => best >= t).at(-1) ?? 0;

// ---------- the saved car ----------

let saved: CarLook | null = null;
const listeners = new Set<() => void>();

export function subscribeCar(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCar(): CarLook {
  if (saved === null) {
    try {
      const raw = localStorage.getItem(KEY);
      saved = raw ? cleanCar(JSON.parse(raw)) : DEFAULT_CAR;
    } catch {
      saved = DEFAULT_CAR;
    }
    // A car that's no longer unlocked (or no longer exists) falls back to the free one.
    if (!isUnlocked(modelOf(saved.id), bestSpeed())) saved = { ...saved, id: DEFAULT_CAR.id };
  }
  return saved;
}

export const getCarOnServer = () => DEFAULT_CAR;

/** Someone who has picked a car before goes straight to the start screen. */
export function hasSavedCar() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveCar(car: CarLook) {
  saved = cleanCar(car);
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // storage blocked — the car lasts for this visit only
  }
  listeners.forEach((l) => l());
}

export const carSrc = (id: string) => `/cars/${modelOf(id).id}.webp`;

// ---------- painting ----------

const painted = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
const paintListeners = new Set<() => void>();
type Source = { w: number; h: number; base: Uint8ClampedArray; mask: Uint8ClampedArray; mid: number };
const sources = new Map<string, Promise<Source>>();

export function subscribePaint(listener: () => void) {
  paintListeners.add(listener);
  return () => paintListeners.delete(listener);
}

/** The picture for this car once it's ready: the photo itself for the original colour, else the painted one (or null while painting). */
export function readySrc(look: CarLook) {
  if (!look.p) return carSrc(look.id);
  return painted.get(`${modelOf(look.id).id}-${look.p}`) ?? null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Each car's photo and mask, read once. */
function source(id: string) {
  let s = sources.get(id);
  if (!s) {
    s = (async () => {
      const [car, mask] = await Promise.all([loadImage(`/cars/${id}.webp`), loadImage(`/cars/${id}-paint.png`)]);
      const { width: w, height: h } = car;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(mask, 0, 0);
      const m = g.getImageData(0, 0, w, h).data;
      g.clearRect(0, 0, w, h);
      g.drawImage(car, 0, 0);
      const base = g.getImageData(0, 0, w, h).data;
      // The panels' middle brightness: lighter pixels become highlights, darker ones shade.
      const all: number[] = [];
      for (let i = 0; i < base.length; i += 4) if (m[i] > 128) all.push(light(base, i));
      all.sort((a, b) => a - b);
      const mid = Math.min(0.92, Math.max(0.08, all[all.length >> 1] ?? 0.5));
      return { w, h, base, mask: m, mid };
    })();
    s.catch(() => sources.delete(id));
    sources.set(id, s);
  }
  return s;
}

const light = (p: Uint8ClampedArray, i: number) => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;

/** Paint the car in the background; subscribers hear when it's ready. */
export function paintCar(look: CarLook) {
  const id = modelOf(look.id).id;
  const hex = look.p;
  const key = `${id}-${hex}`;
  if (!hex || painted.has(key)) return Promise.resolve();
  let job = pending.get(key);
  if (job) return job;
  job = (async () => {
    try {
      const { w, h, base, mask, mid } = await source(id);
      const out = new Uint8ClampedArray(base);
      const t = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
      for (let i = 0; i < out.length; i += 4) {
        const a = mask[i] / 255;
        if (a === 0) continue;
        const l = light(base, i);
        for (let k = 0; k < 3; k++) {
          const c = l <= mid ? (t[k] * l) / mid : t[k] + ((1 - t[k]) * (l - mid)) / (1 - mid);
          out[i + k] = Math.round(base[i + k] * (1 - a) + c * 255 * a);
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.putImageData(new ImageData(out, w, h), 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (blob) painted.set(key, URL.createObjectURL(blob));
    } catch {
      // couldn't paint — the car keeps the photo's colour
    } finally {
      pending.delete(key);
      paintListeners.forEach((l) => l());
    }
  })();
  pending.set(key, job);
  return job;
}

// ---------- colour helpers for the colour ring ----------

export function hsvToHex(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
