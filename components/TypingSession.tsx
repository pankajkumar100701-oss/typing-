"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import Keyboard, { KeyAction, keyFor, keyIdForEventKey } from "./Keyboard";
import { speedBand } from "@/lib/progress";
import { noteHardwareKey, playBack, playError, playKey, primeAudio } from "@/lib/sound";

export type SessionResult = {
  wpm: number;
  raw: number;
  acc: number;
  correct: number;
  wrong: number;
  mistakes: number;
  seconds: number;
  total: number;
  words: number;
};

type State = {
  typed: string;
  /** Positions filled in automatically (code indentation) — not counted as typed. */
  auto: number[];
  keystrokes: number;
  mistakes: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type Action =
  | { type: "type"; char: string; at: number; text: string; code: boolean; strict: boolean }
  | { type: "tab"; text: string }
  | { type: "back"; word: boolean }
  | { type: "timeup"; at: number };

const INITIAL: State = { typed: "", auto: [], keystrokes: 0, mistakes: 0, startedAt: null, finishedAt: null };

function reducer(state: State, action: Action): State {
  if (state.finishedAt !== null) return state;
  if (action.type === "timeup") return { ...state, finishedAt: action.at };
  if (action.type === "tab") {
    // Tab fills in the indentation spaces of a code line.
    let typed = state.typed;
    const auto = [...state.auto];
    while (action.text[typed.length] === " " && typed.length < action.text.length) {
      auto.push(typed.length);
      typed += " ";
    }
    return { ...state, typed, auto };
  }
  if (action.type === "back") {
    if (!state.typed) return state;
    // Ctrl/Alt+Backspace removes the whole word.
    const cut = action.word ? state.typed.replace(/\S*\s?$/, "") : state.typed.slice(0, -1);
    return { ...state, typed: cut, auto: state.auto.filter((i) => i < cut.length) };
  }
  const { char, at, text, code, strict } = action;
  if (state.typed.length >= text.length) return state;
  // Strict (car race): a wrong key is counted as a mistake but doesn't move you on.
  if (strict && char !== text[state.typed.length]) {
    return { ...state, keystrokes: state.keystrokes + 1, mistakes: state.mistakes + 1, startedAt: state.startedAt ?? at };
  }
  let typed = state.typed + char;
  const auto = [...state.auto];
  // In code, the next line's indentation is typed for you after a correct Enter.
  if (code && char === "\n" && text[state.typed.length] === "\n") {
    while (text[typed.length] === " ") {
      auto.push(typed.length);
      typed += " ";
    }
  }
  return {
    typed,
    auto,
    keystrokes: state.keystrokes + 1,
    mistakes: state.mistakes + (char === text[state.typed.length] ? 0 : 1),
    startedAt: state.startedAt ?? at,
    finishedAt: typed.length >= text.length ? at : null,
  };
}

export function measure(state: State, now: number, text: string): SessionResult {
  const end = state.finishedAt ?? now;
  const ms = state.startedAt === null ? 0 : Math.max(end - state.startedAt, 1);
  const minutes = Math.max(ms, 1000) / 60000; // avoid a huge spike on the first key
  // Auto-filled indentation isn't the user's typing, so it doesn't count towards speed.
  const auto = new Set(state.auto);
  let correct = 0;
  for (let i = 0; i < state.typed.length; i++) if (!auto.has(i) && state.typed[i] === text[i]) correct++;
  const typedByUser = state.typed.length - auto.size;
  const wrong = typedByUser - correct;
  return {
    wpm: state.startedAt === null ? 0 : Math.round(correct / 5 / minutes),
    raw: state.startedAt === null ? 0 : Math.round(typedByUser / 5 / minutes),
    acc: state.keystrokes ? Math.round(((state.keystrokes - state.mistakes) / state.keystrokes) * 100) : 100,
    correct,
    wrong,
    mistakes: state.mistakes,
    seconds: Math.round(ms / 1000),
    total: text.length,
    words: state.typed.trim() ? state.typed.trim().split(/\s+/).length : 0,
  };
}

export function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  text: string;
  hint?: string;
  /** Multi-line code: Enter makes a new line and indentation is automatic. */
  code?: boolean;
  /** Paragraph: wrapped over a few lines that scroll up as you type. */
  para?: boolean;
  /** Seconds; the session ends when time runs out (timed test). */
  timeLimit?: number;
  onFinish: (result: SessionResult) => void;
  /** Called with the number of correct letters whenever the typed text changes (car race). */
  onProgress?: (correct: number) => void;
  /** Only the right key moves you on (car race): the car never moves on a mistake. */
  strict?: boolean;
};

export default function TypingSession({ text, hint, code = false, para = false, timeLimit, onFinish, onProgress, strict = false }: Props) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [shift, setShift] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const kbdRef = useRef<HTMLDivElement>(null);
  const finished = state.finishedAt !== null;
  const pos = state.typed.length;

  useEffect(primeAudio, []);

  // Key flashes go straight to the DOM (a data attribute React doesn't touch), so the
  // keyboard isn't re-rendered twice more for every letter.
  const flash = useCallback((el: HTMLElement | null | undefined, kind: "active" | "wrong" | "miss", ms: number) => {
    if (!el) return;
    el.dataset.flash = kind;
    window.setTimeout(() => el.dataset.flash === kind && delete el.dataset.flash, ms);
  }, []);
  const flashKey = useCallback(
    (id: string | undefined, kind: "active" | "wrong", ms: number) =>
      flash(id ? kbdRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]`) : null, kind, ms),
    [flash],
  );

  const typeChar = useCallback(
    (char: string, keyId?: string) => {
      if (pos >= text.length) return;
      if (char !== text[pos]) {
        flashKey(keyFor(char)?.id ?? keyId, "wrong", 220);
        if (strict) flash(caretRef.current, "miss", 260);
        navigator.vibrate?.(30);
        playError();
      } else {
        flashKey(keyId, "active", 110);
        playKey();
      }
      dispatch({ type: "type", char, at: performance.now(), text, code, strict });
    },
    [flash, flashKey, pos, text, code, strict],
  );

  const backspace = useCallback(
    (word: boolean) => {
      flashKey("backspace", "active", 110);
      if (pos > 0) playBack();
      dispatch({ type: "back", word });
    },
    [flashKey, pos],
  );

  // The time limit for tests (the live clock itself ticks inside StatusBar).
  const startedAt = state.startedAt;
  useEffect(() => {
    if (startedAt === null || finished || !timeLimit) return;
    const t = window.setTimeout(
      () => dispatch({ type: "timeup", at: startedAt + timeLimit * 1000 }),
      startedAt + timeLimit * 1000 - performance.now(),
    );
    return () => window.clearTimeout(t);
  }, [startedAt, finished, timeLimit]);

  // Glide the caret to the next letter and slide the line so the caret stays in view.
  useLayoutEffect(() => {
    const place = () => {
      const box = boxRef.current;
      const line = lineRef.current;
      const caret = caretRef.current;
      if (!box || !line || !caret) return;
      const atEnd = pos >= text.length;
      const span = line.children[Math.min(pos, text.length - 1)] as HTMLElement | undefined;
      if (!span) return;
      // Read every size first, then write: mixing reads and writes makes the browser
      // lay out the whole text again for each read, which is what made typing lag.
      const left = atEnd ? span.offsetLeft + span.offsetWidth : span.offsetLeft;
      const top = span.offsetTop;
      const height = span.offsetHeight;
      const boxW = box.clientWidth;
      const boxH = box.clientHeight;
      caret.style.transform = `translate(${left}px, ${top}px)`;
      if (caret.style.height !== `${height}px`) caret.style.height = `${height}px`;
      // Lessons slide sideways; code scrolls up line by line.
      // Paragraphs keep the current line second from the top.
      line.style.transform = para
        ? `translateY(${-Math.max(0, top - height)}px)`
        : code
          ? `translate(${-Math.max(0, left - boxW * 0.75)}px, ${-Math.max(0, top - boxH * 0.3)}px)`
          : `translateX(${-Math.max(0, left - boxW * 0.35)}px)`;
    };
    place();
    // Re-place when the box or the text changes size (phone rotated, keyboard shown or hidden).
    const resize = new ResizeObserver(place);
    if (boxRef.current) resize.observe(boxRef.current);
    if (lineRef.current) resize.observe(lineRef.current);
    return () => resize.disconnect();
  }, [pos, text, code, para]);

  // Report the result once.
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onFinish(measure(state, 0, text));
  }, [finished, state, text, onFinish]);

  // Correct letters so far, for the race track.
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  });
  const typed = state.typed;
  useEffect(() => {
    if (!progressRef.current) return;
    let correct = 0;
    for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) correct++;
    progressRef.current(correct);
  }, [typed, text]);

  // The latest handlers live in a ref, so the on-screen keyboard and the key listener
  // don't have to be rebuilt after every letter.
  const handlers = useRef({ backspace, typeChar, text });
  useLayoutEffect(() => {
    handlers.current = { backspace, typeChar, text };
  });

  const handleAction = useCallback((action: KeyAction) => {
    const { backspace, typeChar, text } = handlers.current;
    if (action.type === "shift") return setShift((s) => !s);
    if (action.type === "backspace") return backspace(false);
    if (action.type === "tab") return dispatch({ type: "tab", text });
    typeChar(action.char, keyFor(action.char)?.id);
    setShift(false);
  }, []);

  // Physical keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { backspace, typeChar, text } = handlers.current;
      if (e.metaKey) return;
      // Phone soft keyboards send "Unidentified"; a named key means a real keyboard.
      if (e.key !== "Unidentified" && !e.repeat) noteHardwareKey();
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        return backspace(e.ctrlKey || e.altKey);
      }
      if (e.ctrlKey || e.altKey) return;
      if (e.key === "Tab") {
        e.preventDefault();
        dispatch({ type: "tab", text });
      } else if (e.key.length === 1 || e.key === "Enter") {
        e.preventDefault();
        typeChar(e.key === "Enter" ? "\n" : e.key, keyIdForEventKey(e.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="session">
      <div ref={boxRef} className={`text-box ${code ? "is-code" : ""} ${para ? "is-para" : ""}`}>
        {hint && !para && <div className="hint">{hint}</div>}
        <div ref={lineRef} className="text-line">
          <Letters text={text} typed={state.typed} />
          <div ref={caretRef} className={`caret ${state.startedAt === null ? "blink" : ""}`} />
        </div>
      </div>

      <StatusBar state={state} text={text} timeLimit={timeLimit} />

      <Keyboard nextChar={finished ? undefined : text[pos]} shift={shift} boxRef={kbdRef} onAction={handleAction} />
    </div>
  );
}

/** One letter; only re-renders when its own colour changes. */
const Letter = memo(function Letter({ ch, cls }: { ch: string; cls: "ok" | "bad" | "todo" }) {
  return (
    <span className={`ch ${cls} ${ch === " " ? "sp" : ""} ${ch === "\n" ? "nl" : ""}`}>
      {ch === "\n" ? "↵\n" : cls === "bad" && ch === " " ? "·" : ch}
    </span>
  );
});

/** The text as letters: skipped entirely on clock ticks and key flashes. */
const Letters = memo(function Letters({ text, typed }: { text: string; typed: string }) {
  return [...text].map((ch, i) => <Letter key={i} ch={ch} cls={i < typed.length ? (typed[i] === ch ? "ok" : "bad") : "todo"} />);
});

/** Speed, accuracy and time — the only part that re-renders every clock tick. */
function StatusBar({ state, text, timeLimit }: { state: State; text: string; timeLimit?: number }) {
  const [now, setNow] = useState(0);
  const running = state.startedAt !== null && state.finishedAt === null;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(t);
  }, [running]);

  const live = measure(state, Math.max(now, state.startedAt ?? 0), text);
  const band = state.startedAt === null ? "" : speedBand(live.wpm);
  const pos = state.typed.length;

  return (
    <div className="statusbar">
      <div className="stat">
        <span className="stat-label">Speed</span>
        <span className={`stat-value speed ${band}`}>
          {live.wpm}
          <small>wpm</small>
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Accuracy</span>
        <span className="stat-value">
          {live.acc}
          <small>%</small>
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">{timeLimit ? "Time left" : "Time"}</span>
        <span className="stat-value">{fmtTime(timeLimit ? Math.max(0, timeLimit - live.seconds) : live.seconds)}</span>
      </div>
      <div className="status-progress" aria-label="Progress">
        <span style={{ width: `${timeLimit ? Math.min(100, (live.seconds / timeLimit) * 100) : (pos / text.length) * 100}%` }} />
      </div>
    </div>
  );
}
