// The car a player drives: one of the photo cars in /public/cars and a paint colour,
// saved in the browser. Each car has a cut-out photo and a mask of its painted panels;
// a new colour is painted onto those panels only, keeping the photo's light and shade.

export type CarLook = { m: number; c: number };

export const CAR_MODELS = [
  { id: "supra", name: "Supra F&F" },
  { id: "ferrari", name: "Ferrari" },
  { id: "grsupra", name: "GR Supra" },
  { id: "supra-gt", name: "Supra GT" },
  { id: "lambo", name: "Lambo" },
  { id: "lambo-green", name: "Lambo SVJ" },
  { id: "bugatti", name: "Bugatti" },
];

/** null = the car's own colour from the photo. */
export const PAINTS: { name: string; hex: string | null }[] = [
  { name: "Original", hex: null },
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
export const DEFAULT_CAR: CarLook = { m: 0, c: 0 };

const inRange = (n: unknown, len: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < len ? (n as number) : 0);

/** Anything from storage or from another player becomes a valid car. */
export function cleanCar(car: unknown): CarLook {
  const c = (car ?? {}) as Partial<CarLook>;
  return { m: inRange(c.m, CAR_MODELS.length), c: inRange(c.c, PAINTS.length) };
}

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
  }
  return saved;
}

export const getCarOnServer = () => DEFAULT_CAR;

export function saveCar(car: CarLook) {
  saved = cleanCar(car);
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // storage blocked — the car lasts for this visit only
  }
  listeners.forEach((l) => l());
}

export const carSrc = (m: number) => `/cars/${CAR_MODELS[m]?.id ?? CAR_MODELS[0].id}.webp`;

// ---------- painting ----------

const painted = new Map<string, string>();
const pending = new Set<string>();
const paintListeners = new Set<() => void>();
/** Each car's middle panel brightness: lighter pixels become highlights, darker ones shade. */
const midLight = new Map<number, number>();

export function subscribePaint(listener: () => void) {
  paintListeners.add(listener);
  return () => paintListeners.delete(listener);
}

/** The picture to show for this car: the painted one once it's ready, the photo until then. */
export function paintedSrc(look: CarLook) {
  if (!PAINTS[look.c]?.hex) return carSrc(look.m);
  return painted.get(`${look.m}-${look.c}`) ?? carSrc(look.m);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Paint the car in the background; subscribers hear when it's ready. */
export async function paintCar(look: CarLook) {
  const hex = PAINTS[look.c]?.hex;
  const key = `${look.m}-${look.c}`;
  if (!hex || painted.has(key) || pending.has(key)) return;
  pending.add(key);
  try {
    const id = CAR_MODELS[look.m].id;
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
    const img = g.getImageData(0, 0, w, h);
    const p = img.data;
    const light = (i: number) => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;

    let mid = midLight.get(look.m);
    if (mid === undefined) {
      const all: number[] = [];
      for (let i = 0; i < p.length; i += 4) if (m[i] > 128) all.push(light(i));
      all.sort((a, b) => a - b);
      mid = Math.min(0.92, Math.max(0.08, all[all.length >> 1] ?? 0.5));
      midLight.set(look.m, mid);
    }

    const t = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
    for (let i = 0; i < p.length; i += 4) {
      const a = m[i] / 255;
      if (a === 0) continue;
      const l = light(i);
      for (let k = 0; k < 3; k++) {
        const c = l <= mid ? (t[k] * l) / mid : t[k] + ((1 - t[k]) * (l - mid)) / (1 - mid);
        p[i + k] = Math.round(p[i + k] * (1 - a) + c * 255 * a);
      }
    }
    g.putImageData(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (blob) painted.set(key, URL.createObjectURL(blob));
  } catch {
    // couldn't paint — the car keeps the photo's colour
  } finally {
    pending.delete(key);
    paintListeners.forEach((l) => l());
  }
}
