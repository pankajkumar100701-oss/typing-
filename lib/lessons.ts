// Every lesson builds a fresh random text each time it starts.

import { C_PROGRAMS } from "./cPrograms";

/** `hint` says where the keys are / which finger to use. `code` lessons keep line breaks. */
/** `make(words)` builds the text; paragraph lessons use `words` as their length. */
export type Lesson = { id: string; title: string; hint: string; make: (words: number) => string; code?: boolean; para?: boolean };
export type Section = { id: string; title: string; note: string; lessons: Lesson[] };

const WORDS = `
a about after again air all also always am an and animal answer any are around as ask at away
back ball be because been before began best better big bird black blue book both boy bring
but by call came can car care carry change child city class close cold come could country
cut dad day did different do does dog done door down draw dream drink drive during each early
earth easy eat end enough even every eye face fall family far fast father feel few field find
fire first fish five fly food for found four friend from full fun game gave get girl give glad
go good got great green grow had half hand happy hard has have he head hear help her here high
hill him his hold home hope horse hot hour house how idea if important in into is it its job
jump just keep kind king know land large last late laugh learn leave left less let letter life
light like line list little live long look love made make man many map may me mean might mile
milk mind money moon more morning most mother move much music must my name near need never new
next nice night no north not now number of off often old on once one only open or order other
our out over own page paper park part people pick place plan plant play please point poor push
put quick quiet rain ran read ready real red rest right river road rock room round run said
same saw say school sea second see seem sell send set she ship short should show side simple
sing sit six sleep slow small snow so some song soon sound south speak spell stand star start
stay step still stop story street strong study such sun sure table take talk teach tell ten
than thank that the their them then there these they thing think this those three through time
to today together told too took top tree true try turn two under until up us use very voice
walk wall want warm was watch water way we week well went were west what when where which while
white who why wind window with word work world would write year yes yet you young your
`
  .trim()
  .split(/\s+/);

const SENTENCES = [
  "The sun came up over the quiet hills.",
  "My little brother loves to read comic books at night.",
  "We walked to the market and bought fresh mangoes.",
  "Practice every day and your hands will learn the keys.",
  "The train was late, so we sat and talked for an hour.",
  "A good friend always tells you the truth.",
  "Rain fell softly on the tin roof all evening.",
  "She opened the window and let the cool air in.",
  "Typing fast is easy when you stop looking at the keys.",
  "The old man planted a tree for his grandchildren.",
  "Our class went on a trip to the science museum.",
  "He forgot his keys, so he waited outside the door.",
  "The cat jumped on the table and knocked over the milk.",
  "Every big goal is made of many small steps.",
  "We cooked rice and dal for dinner on Sunday.",
  "The river was wide, deep, and very cold.",
  "Please turn off the lights when you leave the room.",
  "My phone battery died in the middle of the movie.",
  "The children played cricket until the sky turned orange.",
  "Learning something new feels hard at first, then it feels fun.",
  "The bus stopped near the park and three people got off.",
  "She wrote a short story about a brave little bird.",
  "A cup of hot tea makes a cold morning better.",
  "The library is quiet, clean, and full of good books.",
  "Do not rush; slow and correct is better than fast and wrong.",
  "The farmer checked the sky and hoped for rain.",
  "We laughed so much that our stomachs hurt.",
  "The new road made the trip to the city much shorter.",
  "Keep your back straight and your wrists relaxed.",
  "The stars looked bright because the village had no street lights.",
];

const SYMBOLS = ["(a)", "{x}", "[0]", "a+b", "x=1;", "#top", "@home", "50%", "$10", "a&b", "x*y", "a-b", "\"hi\"", "it's", "a/b", "x<y", "y>x", "a_b", "~ok", "5^2", "a|b", "!no", "why?"];

// Seeded random numbers: the first screen is identical on server and browser,
// later starts pass a fresh seed so the text changes every time.
let seed = 1;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(rnd() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function words(count: number, pool = WORDS): string[] {
  return Array.from({ length: count }, () => pick(pool));
}

/** Random key groups using `keys`, mixed with real words made only of `known` letters. */
function drill(keys: string, known: string): string {
  const fitting = WORDS.filter((w) => [...w].every((c) => known.includes(c)));
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    if (fitting.length >= 4 && i % 2 === 1) {
      out.push(pick(fitting));
    } else {
      const len = 2 + Math.floor(rnd() * 3);
      out.push(Array.from({ length: len }, () => pick([...keys])).join(""));
    }
  }
  return out.join(" ");
}

/** Random sentences joined until the paragraph has at least `target` words. */
function paragraph(target: number): string {
  const out: string[] = [];
  let count = 0;
  while (count < target) {
    for (const sentence of shuffle(SENTENCES)) {
      out.push(sentence);
      count += sentence.split(" ").length;
      if (count >= target) break;
    }
  }
  return out.join(" ");
}

const HOME = "asdfghjkl;";
const TOP = "qwertyuiop";
const BOTTOM = "zxcvbnm,./";

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

const L = (id: string, title: string, hint: string, make: (words: number) => string): Lesson => ({ id, title, hint, make });
/** Paragraph lesson: shown wrapped over a few lines instead of one sliding line. */
const P = (id: string, title: string, hint: string, make: (words: number) => string): Lesson => ({ id, title, hint, make, para: true });

export const SECTIONS: Section[] = [
  {
    id: "basic",
    title: "Basic",
    note: "Where each key is and which finger presses it",
    lessons: [
      L("b1", "F and J", "Index fingers rest on F and J — feel the small bumps", () => drill("fj", "fj")),
      L("b2", "D and K", "Middle fingers: left on D, right on K", () => drill("dk", "fjdk")),
      L("b3", "S and L", "Ring fingers: left on S, right on L", () => drill("sl", "fjdksl")),
      L("b4", "A and ;", "Little fingers: left on A, right on ;", () => drill("a;", "fjdksla")),
      L("b5", "G and H", "Index fingers reach sideways: left to G, right to H", () => drill("gh", HOME)),
      L("b6", "Full Home Row", "A S D F  G H  J K L ; — the home row", () => drill(HOME, HOME)),
      L("b7", "E and I", "Middle fingers reach up: left to E, right to I", () => drill("ei", HOME + "ei")),
      L("b8", "R and U", "Index fingers reach up: left to R, right to U", () => drill("ru", HOME + "eiru")),
      L("b9", "T and Y", "Index fingers reach up and in: left to T, right to Y", () => drill("ty", HOME + "eiruty")),
      L("b10", "W and O", "Ring fingers reach up: left to W, right to O", () => drill("wo", HOME + "eirutywo")),
      L("b11", "Q and P", "Little fingers reach up: left to Q, right to P", () => drill("qp", HOME + TOP)),
      L("b12", "Full Top Row", "Q W E R T  Y U I O P — the top row", () => drill(TOP, HOME + TOP)),
      L("b13", "V and M", "Index fingers reach down: left to V, right to M", () => drill("vm", HOME + TOP + "vm")),
      L("b14", "B and N", "Index fingers reach down and in: left to B, right to N", () => drill("bn", HOME + TOP + "vmbn")),
      L("b15", "C X Z", "Left hand reaches down: middle C, ring X, little Z", () => drill("cxz", HOME + TOP + "vmbncxz")),
      L("b16", ", . /", "Right hand reaches down: middle ,  ring .  little /", () => drill(",./", HOME + TOP + BOTTOM)),
      L("b17", "Full Bottom Row", "Z X C V B  N M , . / — the bottom row", () => drill(BOTTOM, HOME + TOP + BOTTOM)),
      L("b18", "Space and Shift", "Thumbs press space; the other hand's little finger holds Shift", () =>
        words(35).map((w) => (rnd() < 0.4 ? cap(w) : w)).join(" "),
      ),
    ],
  },
  {
    id: "experienced",
    title: "Experienced",
    note: "Real words, capitals, numbers and punctuation",
    lessons: [
      P("e1", "Short Words", "Keep your eyes on the screen, not your fingers", (n) => words(n, WORDS.filter((w) => w.length <= 4)).join(" ")),
      P("e2", "Common Words", "Type each word in one smooth go", (n) => words(n).join(" ")),
      P("e3", "Longer Words", "Slow down a little on long words", (n) => words(n, WORDS.filter((w) => w.length >= 5)).join(" ")),
      P("e4", "Capital Letters", "Shift with the opposite hand's little finger", (n) => words(n).map((w) => (rnd() < 0.5 ? cap(w) : w)).join(" ")),
      P("e5", "Numbers", "Numbers sit above the top row — same fingers reach up", (n) =>
        words(n).map((w) => (rnd() < 0.4 ? String(Math.floor(rnd() * 2000)) : w)).join(" "),
      ),
      P("e6", "Punctuation", "Right little finger handles ; ' / and ?", (n) =>
        words(n).map((w) => (rnd() < 0.3 ? w + pick([",", ".", "?", "!", ";"]) : w)).join(" "),
      ),
    ],
  },
  {
    id: "advance",
    title: "Advance",
    note: "Sentences, paragraphs and symbols",
    lessons: [
      P("a1", "Sentences", "Keep a steady rhythm", (n) => paragraph(n)),
      P("a2", "Paragraph", "Accuracy first, speed follows", (n) => paragraph(n)),
      P("a3", "Long Paragraph", "Stay relaxed for the whole paragraph", (n) => paragraph(Math.round(n * 1.5))),
      P("a4", "Symbols", "Symbols use Shift + the number row", (n) =>
        Array.from({ length: n }, (_, i) => (i % 2 ? pick(SYMBOLS) : pick(WORDS))).join(" "),
      ),
    ],
  },
  {
    id: "c",
    title: "C Programs",
    note: "Type real C code — Enter for a new line",
    lessons: C_PROGRAMS.map((p, i) => ({
      id: `c${i + 1}`,
      title: p.title,
      hint: "Press Enter at the end of a line — indentation is added for you",
      make: () => p.code,
      code: true,
    })),
  },
];

export const ALL_LESSONS = SECTIONS.flatMap((s) => s.lessons);

export function sectionOf(lesson: Lesson): Section {
  return SECTIONS.find((s) => s.lessons.includes(lesson))!;
}

/** A long run of common words for the timed test. */
export function testText(newSeed: number): string {
  seed = newSeed;
  return words(500).join(" ");
}

export function makeText(lesson: Lesson, newSeed: number, words = 100): string {
  seed = newSeed;
  return lesson.make(words);
}
