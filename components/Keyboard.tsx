"use client";

import { memo, useState, useSyncExternalStore, type Ref } from "react";

/** `id` is the on-screen key that was pressed, so it is the one that flashes. */
export type KeyAction = { type: "char"; char: string; id?: string } | { type: "shift" } | { type: "tab" } | { type: "backspace" };

type KeyDef = {
  id: string;
  label: string;
  shifted?: string;
  finger: number; // 0-3 left pinky..index, 4-7 right index..pinky, 8 thumbs
  w?: number;
  kind?: "shift" | "tab" | "enter" | "space" | "blank" | "backspace" | "page";
  /** Page keys (phone layout): which page they open. */
  to?: Page;
};

const k = (label: string, finger: number, shifted?: string): KeyDef => ({ id: label, label, shifted, finger });

const ROWS: KeyDef[][] = [
  [
    k("`", 0, "~"), k("1", 0, "!"), k("2", 1, "@"), k("3", 2, "#"), k("4", 3, "$"), k("5", 3, "%"),
    k("6", 4, "^"), k("7", 4, "&"), k("8", 5, "*"), k("9", 6, "("), k("0", 7, ")"), k("-", 7, "_"), k("=", 7, "+"),
    { id: "backspace", label: "⌫", finger: 7, w: 1.6, kind: "backspace" },
  ],
  [
    { id: "tab", label: "Tab", finger: 0, w: 1.4, kind: "tab" },
    k("q", 0), k("w", 1), k("e", 2), k("r", 3), k("t", 3), k("y", 4), k("u", 4), k("i", 5), k("o", 6), k("p", 7),
    k("[", 7, "{"), k("]", 7, "}"), { ...k("\\", 7, "|"), w: 1.2 },
  ],
  [
    { id: "blank-l", label: "", finger: 0, w: 1.7, kind: "blank" },
    k("a", 0), k("s", 1), k("d", 2), k("f", 3), k("g", 3), k("h", 4), k("j", 4), k("k", 5), k("l", 6),
    k(";", 7, ":"), k("'", 7, '"'),
    { id: "enter", label: "Enter ↵", finger: 7, w: 1.9, kind: "enter" },
  ],
  [
    { id: "lshift", label: "⇧ Shift", finger: 0, w: 2.2, kind: "shift" },
    k("z", 0), k("x", 1), k("c", 2), k("v", 3), k("b", 3), k("n", 4), k("m", 4),
    k(",", 5, "<"), k(".", 6, ">"), k("/", 7, "?"),
    { id: "rshift", label: "⇧ Shift", finger: 7, w: 2.4, kind: "shift" },
  ],
  [{ id: "space", label: "space", finger: 8, w: 1, kind: "space" }],
];

// Phone held upright: a phone-style keyboard — letters on one page, numbers and symbols on two more.
type Page = "abc" | "123" | "sym";
const sym = (label: string): KeyDef => ({ id: `p${label}`, label, finger: 8 });
const page = (label: string, to: Page, w = 1.5): KeyDef => ({ id: `page-${to}`, label, finger: 8, w, kind: "page", to });
const P_BACK: KeyDef = { id: "backspace", label: "⌫", finger: 7, w: 1.5, kind: "backspace" };
const pBottom = (to: Page, label: string): KeyDef[] => [
  page(label, to),
  { ...sym(","), id: "," },
  { id: "space", label: "space", finger: 8, w: 4.5, kind: "space" },
  { ...sym("."), id: "." },
  { id: "enter", label: "↵", finger: 7, w: 1.5, kind: "enter" },
];
const PHONE: Record<Page, KeyDef[][]> = {
  abc: [
    [..."qwertyuiop"].map((c) => k(c, 8)),
    [..."asdfghjkl"].map((c) => k(c, 8)),
    [{ id: "lshift", label: "⇧", finger: 0, w: 1.5, kind: "shift" }, ...[..."zxcvbnm"].map((c) => k(c, 8)), P_BACK],
    pBottom("123", "?123"),
  ],
  "123": [
    [..."1234567890"].map(sym),
    [..."@#$_&-+()/"].map(sym),
    [page("=\\<", "sym"), ...[..."*\"':;!?"].map(sym), P_BACK],
    pBottom("abc", "ABC"),
  ],
  sym: [
    [..."~`|^={}[]\\"].map(sym),
    [..."<>%#@&$+-_"].map(sym),
    [page("?123", "123"), ...[..."*\"':;!?"].map(sym), P_BACK],
    pBottom("abc", "ABC"),
  ],
};

/** Which phone key (and page) types a character. */
function phoneKeyFor(char: string | undefined): { id: string; page: Page; shift: boolean } | undefined {
  if (char === undefined) return undefined;
  if (char === " ") return { id: "space", page: "abc", shift: false };
  if (char === "\n") return { id: "enter", page: "abc", shift: false };
  if (char === "," || char === ".") return { id: char, page: "abc", shift: false };
  if (/[a-z]/.test(char)) return { id: char, page: "abc", shift: false };
  if (/[A-Z]/.test(char)) return { id: char.toLowerCase(), page: "abc", shift: true };
  for (const p of ["123", "sym"] as const) if (PHONE[p].some((row) => row.some((key) => key.label === char && !key.kind))) return { id: `p${char}`, page: p, shift: false };
}

const PORTRAIT = "(orientation: portrait) and (max-width: 820px)";
const subscribePortrait = (cb: () => void) => {
  const mq = window.matchMedia(PORTRAIT);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

const CHAR_MAP = new Map<string, { id: string; shift: boolean; finger: number }>();
for (const row of ROWS) {
  for (const key of row) {
    if (key.kind) continue;
    CHAR_MAP.set(key.label, { id: key.id, shift: false, finger: key.finger });
    if (/[a-z]/.test(key.label)) CHAR_MAP.set(key.label.toUpperCase(), { id: key.id, shift: true, finger: key.finger });
    if (key.shifted) CHAR_MAP.set(key.shifted, { id: key.id, shift: true, finger: key.finger });
  }
}
CHAR_MAP.set(" ", { id: "space", shift: false, finger: 8 });
CHAR_MAP.set("\n", { id: "enter", shift: false, finger: 7 });

export const FINGER_NAMES = [
  "Left little", "Left ring", "Left middle", "Left index",
  "Right index", "Right middle", "Right ring", "Right little", "Thumb",
];

/** Which key (and shift) a character needs — used for hints. */
export function keyFor(char: string | undefined) {
  if (char === undefined) return undefined;
  const hit = CHAR_MAP.get(char);
  if (!hit) return undefined;
  // Shift is pressed with the opposite hand.
  const shiftId = hit.shift ? (hit.finger <= 3 ? "rshift" : "lshift") : undefined;
  return { ...hit, shiftId };
}

/** Map a physical key id (from KeyboardEvent.key) to our on-screen key id. */
export function keyIdForEventKey(key: string): string | undefined {
  if (key === "Enter") return "enter";
  if (key === "Backspace") return "backspace";
  if (key === "Tab") return "tab";
  if (key === "Shift") return "lshift";
  return CHAR_MAP.get(key)?.id;
}

type Props = {
  nextChar?: string;
  shift: boolean;
  /** Pressed/wrong flashes are added straight to the keys (`data-key`) by the session. */
  boxRef?: Ref<HTMLDivElement>;
  onAction: (action: KeyAction) => void;
};

function Keyboard(props: Props) {
  const portrait = useSyncExternalStore(subscribePortrait, () => window.matchMedia(PORTRAIT).matches, () => false);
  return portrait ? <PhoneKeyboard {...props} /> : <FullKeyboard {...props} />;
}

function PhoneKeyboard({ nextChar, shift, boxRef, onAction }: Props) {
  const [current, setPage] = useState<Page>("abc");
  const want = phoneKeyFor(nextChar);
  // The next key glows; if it's on another page, the key that opens that page glows instead.
  const here = want && PHONE[current].some((row) => row.some((key) => key.id === want.id));
  const hintId = !want || here ? want?.id : want.page === "abc" ? "page-abc" : current === "abc" ? "page-123" : `page-${want.page}`;

  const press = (key: KeyDef) => {
    switch (key.kind) {
      case "page":
        return setPage(key.to!);
      case "shift":
        return onAction({ type: "shift" });
      case "enter":
        return onAction({ type: "char", char: "\n", id: "enter" });
      case "space":
        // Like a phone: after a space you're back on the letters.
        setPage("abc");
        return onAction({ type: "char", char: " ", id: "space" });
      case "backspace":
        return onAction({ type: "backspace" });
    }
    const isLetter = /[a-z]/.test(key.label);
    onAction({ type: "char", char: isLetter && shift ? key.label.toUpperCase() : key.label, id: key.id });
  };

  return (
    <div ref={boxRef} className="kbd phone" role="group" aria-label="On-screen keyboard">
      {PHONE[current].map((row, r) => (
        <div className="kbd-row" key={`${current}${r}`}>
          {row.map((key) => {
            const isLetter = !key.kind && /[a-z]/.test(key.label);
            const isNext = hintId === key.id || (key.kind === "shift" && here && want?.shift && !shift);
            // Same finger colours as the full keyboard.
            const finger = key.kind ? key.finger : (CHAR_MAP.get(key.label)?.finger ?? key.finger);
            return (
              <button
                key={key.id}
                data-key={key.id}
                type="button"
                tabIndex={-1}
                className={["key", `f${finger}`, key.kind ? `key-${key.kind}` : "", isNext ? "is-next" : "", key.kind === "shift" && shift ? "is-active" : ""].join(" ")}
                style={{ flexGrow: key.w ?? 1 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(key);
                }}
              >
                <span className="key-main">{isLetter && shift ? key.label.toUpperCase() : key.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FullKeyboard({ nextChar, shift, boxRef, onAction }: Props) {
  const hint = keyFor(nextChar);

  const press = (key: KeyDef) => {
    switch (key.kind) {
      case "shift":
        return onAction({ type: "shift" });
      case "tab":
        return onAction({ type: "tab" });
      case "enter":
        return onAction({ type: "char", char: "\n" });
      case "space":
        return onAction({ type: "char", char: " " });
      case "backspace":
        return onAction({ type: "backspace" });
      case "blank":
        return;
    }
    const isLetter = /[a-z]/.test(key.label);
    const upper = shift;
    const char = upper ? (isLetter ? key.label.toUpperCase() : (key.shifted ?? key.label)) : key.label;
    onAction({ type: "char", char, id: key.id });
  };

  return (
    <div ref={boxRef} className="kbd" role="group" aria-label="On-screen keyboard">
      {ROWS.map((row, r) => (
        <div className="kbd-row" key={r}>
          {row.map((key) => {
            const isNext = hint?.id === key.id || hint?.shiftId === key.id;
            const active = key.kind === "shift" && shift;
            const isLetter = !key.kind && /[a-z]/.test(key.label);
            const showUpper = isLetter && shift;
            return (
              <button
                key={key.id}
                data-key={key.id}
                type="button"
                tabIndex={-1}
                className={[
                  "key",
                  `f${key.finger}`,
                  key.kind ? `key-${key.kind}` : "",
                  isNext ? "is-next" : "",
                  active ? "is-active" : "",
                ].join(" ")}
                style={{ flexGrow: key.w ?? 1 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(key);
                }}
              >
                {key.shifted && <span className="key-alt">{key.shifted}</span>}
                <span className="key-main">{showUpper ? key.label.toUpperCase() : key.label}</span>
                {(key.id === "f" || key.id === "j") && <span className="key-bump" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default memo(Keyboard);
