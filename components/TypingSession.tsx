"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import Keyboard, { KeyAction, keyFor, keyIdForEventKey } from "./Keyboard";
import { speedBand } from "@/lib/progress";
import { playBack, playError, playKey } from "@/lib/sound";

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
  keystrokes: number;
  mistakes: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type Action =
  | { type: "type"; char: string; at: number; text: string; code: boolean }
  | { type: "tab"; text: string }
  | { type: "back"; word: boolean }
  | { type: "timeup"; at: number };

const INITIAL: State = { typed: "", keystrokes: 0, mistakes: 0, startedAt: null, finishedAt: null };

function reducer(state: State, action: Action): State {
  if (state.finishedAt !== null) return state;
  if (action.type === "timeup") return { ...state, finishedAt: action.at };
  if (action.type === "tab") {
    // Tab fills in the indentation spaces of a code line.
    let typed = state.typed;
    while (action.text[typed.length] === " " && typed.length < action.text.length) typed += " ";
    return { ...state, typed };
  }
  if (action.type === "back") {
    if (!state.typed) return state;
    // Ctrl/Alt+Backspace removes the whole word.
    const cut = action.word ? state.typed.replace(/\S*\s?$/, "") : state.typed.slice(0, -1);
    return { ...state, typed: cut };
  }
  const { char, at, text, code } = action;
  if (state.typed.length >= text.length) return state;
  let typed = state.typed + char;
  // In code, the next line's indentation is typed for you after a correct Enter.
  if (code && char === "\n" && text[state.typed.length] === "\n") {
    while (text[typed.length] === " ") typed += " ";
  }
  return {
    typed,
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
  let correct = 0;
  for (let i = 0; i < state.typed.length; i++) if (state.typed[i] === text[i]) correct++;
  const wrong = state.typed.length - correct;
  return {
    wpm: state.startedAt === null ? 0 : Math.round(correct / 5 / minutes),
    raw: state.startedAt === null ? 0 : Math.round(state.typed.length / 5 / minutes),
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
  /** Seconds; the session ends when time runs out (timed test). */
  timeLimit?: number;
  onFinish: (result: SessionResult) => void;
};

export default function TypingSession({ text, hint, code = false, timeLimit, onFinish }: Props) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [now, setNow] = useState(0);
  const [shift, setShift] = useState(false);
  const [pressedId, setPressedId] = useState<string>();
  const [wrongId, setWrongId] = useState<string>();

  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const finished = state.finishedAt !== null;
  const pos = state.typed.length;

  const flash = useCallback((setter: typeof setPressedId, id: string | undefined, ms: number) => {
    setter(id);
    window.setTimeout(() => setter((cur) => (cur === id ? undefined : cur)), ms);
  }, []);

  const typeChar = useCallback(
    (char: string, keyId?: string) => {
      if (pos >= text.length) return;
      if (char !== text[pos]) {
        flash(setWrongId, keyFor(char)?.id ?? keyId, 220);
        navigator.vibrate?.(30);
        playError();
      } else {
        if (keyId) flash(setPressedId, keyId, 110);
        playKey();
      }
      dispatch({ type: "type", char, at: performance.now(), text, code });
    },
    [flash, pos, text, code],
  );

  const backspace = useCallback(
    (word: boolean) => {
      flash(setPressedId, "backspace", 110);
      if (pos > 0) playBack();
      dispatch({ type: "back", word });
    },
    [flash, pos],
  );

  // Live speed, and the time limit for tests.
  const startedAt = state.startedAt;
  useEffect(() => {
    if (startedAt === null || finished) return;
    const t = window.setInterval(() => {
      const at = performance.now();
      if (timeLimit && at - startedAt >= timeLimit * 1000) dispatch({ type: "timeup", at: startedAt + timeLimit * 1000 });
      setNow(at);
    }, 250);
    return () => window.clearInterval(t);
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
      const left = atEnd ? span.offsetLeft + span.offsetWidth : span.offsetLeft;
      caret.style.transform = `translate(${left}px, ${span.offsetTop}px)`;
      caret.style.height = `${span.offsetHeight}px`;
      // Lessons slide sideways; code scrolls up line by line.
      line.style.transform = code
        ? `translate(${-Math.max(0, left - box.clientWidth * 0.75)}px, ${-Math.max(0, span.offsetTop - box.clientHeight * 0.3)}px)`
        : `translateX(${-Math.max(0, left - box.clientWidth * 0.35)}px)`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [pos, text, code]);

  // Report the result once.
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onFinish(measure(state, 0, text));
  }, [finished, state, text, onFinish]);

  const handleAction = useCallback(
    (action: KeyAction) => {
      if (action.type === "shift") return setShift((s) => !s);
      if (action.type === "backspace") return backspace(false);
      if (action.type === "tab") return dispatch({ type: "tab", text });
      typeChar(action.char, keyFor(action.char)?.id);
      setShift(false);
    },
    [backspace, typeChar, text],
  );

  // Physical keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) return;
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
  }, [backspace, typeChar, text]);

  const live = measure(state, now, text);
  const band = state.startedAt === null ? "" : speedBand(live.wpm);

  return (
    <div className="session">
      <div ref={boxRef} className={`text-box ${code ? "is-code" : ""}`}>
        {hint && <div className="hint">{hint}</div>}
        <div ref={lineRef} className="text-line">
          {[...text].map((ch, i) => {
            const cls = i < pos ? (state.typed[i] === ch ? "ok" : "bad") : "todo";
            return (
              <span key={i} className={`ch ${cls} ${ch === " " ? "sp" : ""} ${ch === "\n" ? "nl" : ""}`}>
                {ch === "\n" ? "↵\n" : i < pos && state.typed[i] !== ch && ch === " " ? "·" : ch}
              </span>
            );
          })}
          <div ref={caretRef} className={`caret ${state.startedAt === null ? "blink" : ""}`} />
        </div>
      </div>

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

      <Keyboard nextChar={finished ? undefined : text[pos]} shift={shift} pressedId={pressedId} wrongId={wrongId} onAction={handleAction} />
    </div>
  );
}
