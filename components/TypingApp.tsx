"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult, fmtTime } from "./TypingSession";
import { ALL_LESSONS, SECTIONS, makeText, sectionOf, testText } from "@/lib/lessons";
import { BANDS, getProgress, getServerProgress, saveResult, speedBand, subscribe } from "@/lib/progress";
import {
  WORD_CHOICES,
  getKbdPref,
  getKbdPrefOnServer,
  getWordCount,
  getWordCountOnServer,
  isMuted,
  isMutedOnServer,
  playComplete,
  setWordCount,
  subscribeSound,
  toggleKbd,
  toggleMute,
} from "@/lib/sound";

/** Either a lesson (by index) or a timed test (by minutes). */
type Run = { round: number; text: string } & ({ kind: "lesson"; index: number } | { kind: "test"; minutes: number });

const TEST_MINUTES = [1, 2, 3, 5, 10];

async function goLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // iOS Safari and desktop can't lock orientation — the user rotates by hand
  }
}

export default function TypingApp() {
  const [run, setRun] = useState<Run>(() => ({ kind: "lesson", index: 0, text: makeText(ALL_LESSONS[0], 1), round: 0 }));
  const [result, setResult] = useState<SessionResult | null>(null);
  const [menu, setMenu] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const muted = useSyncExternalStore(subscribeSound, isMuted, isMutedOnServer);
  const kbdPref = useSyncExternalStore(subscribeSound, getKbdPref, getKbdPrefOnServer);
  const wordCount = useSyncExternalStore(subscribeSound, getWordCount, getWordCountOnServer);

  const lesson = run.kind === "lesson" ? ALL_LESSONS[run.index] : null;

  // Every start builds a new random text.
  const openLesson = useCallback(
    (index: number) => {
      setRun((r) => ({ kind: "lesson", index, text: makeText(ALL_LESSONS[index], Date.now(), wordCount), round: r.round + 1 }));
      setResult(null);
      setMenu(false);
    },
    [wordCount],
  );

  // New paragraph length: rebuild the current paragraph lesson straight away (menu stays open).
  const changeWords = (n: number) => {
    setWordCount(n);
    const words = getWordCount();
    if (run.kind === "lesson" && ALL_LESSONS[run.index].para) {
      setRun((r) => ({ ...r, text: makeText(ALL_LESSONS[run.index], Date.now(), words), round: r.round + 1 }));
      setResult(null);
    }
  };

  const openTest = useCallback((minutes: number) => {
    setRun((r) => ({ kind: "test", minutes, text: testText(Date.now()), round: r.round + 1 }));
    setResult(null);
    setMenu(false);
  }, []);

  const hasNext = run.kind === "lesson" && run.index + 1 < ALL_LESSONS.length;
  const id = lesson ? lesson.id : run.kind === "test" ? `test-${run.minutes}` : "";

  const finish = useCallback(
    (r: SessionResult) => {
      saveResult(id, { wpm: r.wpm, acc: r.acc });
      setResult(r);
      playComplete();
    },
    [id],
  );


  return (
    <div className={`app kbd-${kbdPref}`}>
      {!rotateDismissed && (
        <div className="rotate-overlay">
          <div className="rotate-phone" aria-hidden />
          <h2>Rotate your phone</h2>
          <p>TypeFast works best in landscape.</p>
          <p className="kbd-tip">
            ⌨ For real typing practice, please connect a keyboard with an <b>OTG cable</b> or <b>Bluetooth</b>. The on-screen
            keyboard works too.
          </p>
          <button className="btn primary" onClick={goLandscape}>
            Go landscape
          </button>
          <button className="btn ghost" onClick={() => setRotateDismissed(true)}>
            Continue anyway
          </button>
        </div>
      )}

      {/* Drop focus after a toolbar click so typed keys never re-press a button. */}
      <header className="toolbar" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
        <button className="menu-btn" onClick={() => setMenu(true)}>
          <span aria-hidden>☰</span> Menu
        </button>
        <span className="brand">
          type<b>fast</b>
        </span>
        <span className="spacer" />

        <button className="sound-btn kbd-btn" onClick={toggleKbd} aria-label="Show or hide the on-screen keyboard">
          <KeyboardIcon />
          <span className="kbd-state" />
        </button>
        <button
          className={`sound-btn ${muted ? "off" : ""}`}
          onClick={toggleMute}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
        >
          <SoundIcon muted={muted} />
          <span>{muted ? "Off" : "On"}</span>
        </button>
        <button className="nav-btn fs" onClick={goLandscape} aria-label="Fullscreen">
          ⤢
        </button>
      </header>

      {result ? (
        <ResultPage
          result={result}
          title={lesson ? lesson.title : "Typing test"}
          bestId={id}
          onAgain={() => (run.kind === "lesson" ? openLesson(run.index) : openTest(run.minutes))}
          onNext={hasNext && run.kind === "lesson" ? () => openLesson(run.index + 1) : undefined}
          onMenu={() => setMenu(true)}
        />
      ) : (
        <TypingSession
          key={run.round}
          text={run.text}
          hint={lesson?.hint ?? "Type as many words as you can before the time runs out"}
          code={lesson?.code}
          para={run.kind === "test" || lesson?.para}
          timeLimit={run.kind === "test" ? run.minutes * 60 : undefined}
          onFinish={finish}
        />
      )}

      {menu && (
        <Menu
          current={run.kind === "lesson" ? run.index : -1}
          words={wordCount}
          onWords={changeWords}
          onLesson={openLesson}
          onTest={openTest}
          onClose={() => setMenu(false)}
        />
      )}
    </div>
  );
}

function Menu({
  current,
  words,
  onWords,
  onLesson,
  onTest,
  onClose,
}: {
  current: number;
  words: number;
  onWords: (n: number) => void;
  onLesson: (index: number) => void;
  onTest: (minutes: number) => void;
  onClose: () => void;
}) {
  const progress = useSyncExternalStore(subscribe, getProgress, getServerProgress);
  const [open, setOpen] = useState(current >= 0 ? sectionOf(ALL_LESSONS[current]).id : "test");
  const [custom, setCustom] = useState("15");
  const [customWords, setCustomWords] = useState(WORD_CHOICES.includes(words) ? "" : String(words));

  // Basic, Experienced, Advance, then Test, then C Programs.
  const items = [...SECTIONS.slice(0, 3).map((s) => s.id), "test", SECTIONS[3].id];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <b>Menu</b>
          <button className="nav-btn" onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="words-pick">
            <div className="words-head">
              <b>Paragraph length</b>
              <small>Experienced &amp; Advance · {words} words</small>
            </div>
            <div className="word-chips">
              {WORD_CHOICES.map((n) => (
                <button
                  key={n}
                  className={`chip ${words === n ? "on" : ""}`}
                  onClick={() => {
                    setCustomWords("");
                    onWords(n);
                  }}
                >
                  {n}
                </button>
              ))}
              <form
                className="chip-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customWords) onWords(Number(customWords));
                }}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={500}
                  placeholder="Custom"
                  value={customWords}
                  onChange={(e) => setCustomWords(e.target.value)}
                  className={!WORD_CHOICES.includes(words) ? "on" : ""}
                  aria-label="Custom number of words"
                />
                <button className="btn primary" type="submit" disabled={!customWords}>
                  Set
                </button>
              </form>
            </div>
          </div>
          {items.map((itemId, n) => {
            const section = SECTIONS.find((s) => s.id === itemId);
            const isOpen = open === itemId;
            return (
              <section key={itemId} className={`level ${isOpen ? "open" : ""}`}>
                <button className="level-head" onClick={() => setOpen(isOpen ? "" : itemId)}>
                  <span className="level-num">{n + 1}</span>
                  <span className="level-text">
                    <b>{section ? section.title : "Test"}</b>
                    <small>{section ? `${section.lessons.length} lessons · ${section.note}` : "Timed test — pick any minutes"}</small>
                  </span>
                  <i aria-hidden>{isOpen ? "−" : "+"}</i>
                </button>

                {isOpen && section && (
                  <div className="lesson-list">
                    {section.lessons.map((l, li) => {
                      const i = ALL_LESSONS.indexOf(l);
                      const best = progress[l.id];
                      return (
                        <button key={l.id} className={`lesson-row ${i === current ? "current" : ""}`} onClick={() => onLesson(i)}>
                          <span className="row-num">Lesson {li + 1}</span>
                          <span className="row-title">{l.title}</span>
                          {best && <span className={`best ${speedBand(best.wpm)}`}>{best.wpm}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {isOpen && !section && (
                  <div className="test-pick">
                    <div className="minutes">
                      {TEST_MINUTES.map((m) => (
                        <button key={m} className="minute" onClick={() => onTest(m)}>
                          {m} min
                        </button>
                      ))}
                    </div>
                    <form
                      className="custom"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const m = Math.min(60, Math.max(1, Math.round(Number(custom)) || 1));
                        onTest(m);
                      }}
                    >
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={60}
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        aria-label="Minutes"
                      />
                      <span>min</span>
                      <button className="btn primary" type="submit">
                        Start
                      </button>
                    </form>
                  </div>
                )}
              </section>
            );
          })}
          <Link className="race-entry" href="/race">
            <span className="race-entry-icon" aria-hidden>
              🏎️
            </span>
            <span className="level-text">
              <b>Car Race</b>
              <small>Make a link, send it to friends and race them typing</small>
            </span>
            <i aria-hidden>→</i>
          </Link>
          <div className="legend">
            <h4>Speed levels</h4>
            {(["slow", "mid", "fast"] as const).map((band) => (
              <div key={band} className={`band ${band}`}>
                <span className="band-dot" />
                <span className="band-text">
                  <b>
                    {BANDS[band].name} <small>{BANDS[band].range}</small>
                  </b>
                  <span>{BANDS[band].line}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ResultPage({
  result,
  title,
  bestId,
  onAgain,
  onNext,
  onMenu,
}: {
  result: SessionResult;
  title: string;
  bestId: string;
  onAgain: () => void;
  onNext?: () => void;
  onMenu: () => void;
}) {
  const progress = useSyncExternalStore(subscribe, getProgress, getServerProgress);
  const band = speedBand(result.wpm);
  const best = progress[bestId];

  return (
    <div className="result-page">
      <div className="result-main">
        <div className={`result-speed ${band}`}>
          <span className="burst" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--d": `${(i % 3) * 60}ms` } as React.CSSProperties} />
            ))}
          </span>
          <span className="label">Speed</span>
          <b>{result.wpm}</b>
          <span className="unit">wpm</span>
          <span className="verdict">{BANDS[band].name}</span>
          <span className="motivation">{BANDS[band].line}</span>
        </div>
        <div className="result-side">
          <h2>
            Result <small>{title}</small>
          </h2>
          <div className="result-cells">
            <Cell label="Accuracy" value={`${result.acc}%`} />
            <Cell label="Raw speed" value={`${result.raw} wpm`} />
            <Cell label="Time" value={fmtTime(result.seconds)} />
            <Cell label="Words typed" value={`${result.words}`} />
            <Cell label="Correct letters" value={`${result.correct}`} tone="good" />
            <Cell label="Wrong letters" value={`${result.wrong}`} tone={result.wrong ? "bad" : undefined} />
            <Cell label="Mistakes made" value={`${result.mistakes}`} tone={result.mistakes ? "bad" : undefined} />
            <Cell label="Best speed" value={best ? `${best.wpm} wpm` : "—"} />
          </div>
          <div className="result-actions">
            <button className="btn" onClick={onMenu}>
              Menu
            </button>
            {/* Under 30 wpm: "Try again" is the main button, but moving on is still allowed. */}
            {band === "slow" && (
              <>
                {onNext && (
                  <button className="btn" onClick={onNext}>
                    Next lesson →
                  </button>
                )}
                <button className="btn primary" onClick={onAgain}>
                  Try again ↻
                </button>
              </>
            )}
            {band !== "slow" && onNext && (
              <button className="btn primary" onClick={onNext}>
                Next lesson →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`cell ${tone ?? ""}`}>
      <span className="cell-label">{label}</span>
      <span className="cell-value">{value}</span>
    </div>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <>
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6.5 14h11" />
    </svg>
  );
}
