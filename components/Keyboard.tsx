"use client";

import { memo, type Ref } from "react";

export type KeyAction = { type: "char"; char: string } | { type: "shift" } | { type: "tab" } | { type: "backspace" };

type KeyDef = {
  id: string;
  label: string;
  shifted?: string;
  finger: number; // 0-3 left pinky..index, 4-7 right index..pinky, 8 thumbs
  w?: number;
  kind?: "shift" | "tab" | "enter" | "space" | "blank" | "backspace";
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

function Keyboard({ nextChar, shift, boxRef, onAction }: Props) {
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
    onAction({ type: "char", char });
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
