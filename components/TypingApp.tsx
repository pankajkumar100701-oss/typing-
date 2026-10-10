"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult, fmtTime } from "./TypingSession";
import { ALL_LESSONS, SECTIONS, makeText, sectionOf, testText } from "@/lib/lessons";
import { getProgress, getServerProgress, saveResult, speedBand, subscribe } from "@/lib/progress";
import { isMuted, isMutedOnServer, playComplete, subscribeSound, toggleMute } from "@/lib/sound";

/** Either a lesson (by index) or a timed test (by minutes). */
type Run = { round: number; text: string } & ({ kind: "lesson"; index: number } | { kind: "test"; minutes: number });

const BAND_LABEL = { slow: "Keep practising", mid: "Good speed", fast: "Excellent speed" };
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

  const lesson = run.kind === "lesson" ? ALL_LESSONS[run.index] : null;
  const section = lesson ? sectionOf(lesson) : null;

  // Every start builds a new random text.
  const openLesson = useCallback((index: number) => {
    setRun((r) => ({ kind: "lesson", index, text: makeText(ALL_LESSONS[index], Date.now()), round: r.round + 1 }));
    setResult(null);
    setMenu(false);
  }, []);

  const openTest = useCallback((minutes: number) => {
    setRun((r) => ({ kind: "test", minutes, text: testText(Date.now()), round: r.round + 1 }));
    setResult(null);
    setMenu(false);
  }, []);

  const again = () => (run.kind === "lesson" ? openLesson(run.index) : openTest(run.minutes));
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

  const title = lesson
    ? `${section!.title} · Lesson ${section!.lessons.indexOf(lesson) + 1}`
    : `Test · ${run.kind === "test" ? run.minutes : 0} min`;

  return (
    <div className="app">
      {!rotateDismissed && (
        <div className="rotate-overlay">
          <div className="rotate-phone" aria-hidden />
          <h2>Rotate your phone</h2>
          <p>TypeFast works best in landscape.</p>
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

        <div className="lesson-nav">
          {run.kind === "lesson" && (
            <button className="nav-btn" onClick={() => openLesson(run.index - 1)} disabled={run.index === 0} aria-label="Previous lesson">
              ‹
            </button>
          )}
          <button className="lesson-name" onClick={() => setMenu(true)}>
            <small>{title}</small>
            <span>{lesson ? lesson.title : "Typing test"}</span>
          </button>
          {run.kind === "lesson" && (
            <button className="nav-btn" onClick={() => openLesson(run.index + 1)} disabled={!hasNext} aria-label="Next lesson">
              ›
            </button>
          )}
          <button className="nav-btn" onClick={again} aria-label="Restart with new text">
            ↻
          </button>
        </div>

        <button className="nav-btn" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
          {muted ? "🔇" : "🔊"}
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
          isTest={run.kind === "test"}
          onAgain={again}
          onNext={hasNext && run.kind === "lesson" ? () => openLesson(run.index + 1) : undefined}
          onMenu={() => setMenu(true)}
        />
      ) : (
        <TypingSession
          key={run.round}
          text={run.text}
          hint={lesson?.hint ?? "Type as many words as you can before the time runs out"}
          code={lesson?.code}
          timeLimit={run.kind === "test" ? run.minutes * 60 : undefined}
          onFinish={finish}
        />
      )}

      {menu && (
        <Menu
          current={run.kind === "lesson" ? run.index : -1}
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
  onLesson,
  onTest,
  onClose,
}: {
  current: number;
  onLesson: (index: number) => void;
  onTest: (minutes: number) => void;
  onClose: () => void;
}) {
  const progress = useSyncExternalStore(subscribe, getProgress, getServerProgress);
  const [open, setOpen] = useState(current >= 0 ? sectionOf(ALL_LESSONS[current]).id : "test");
  const [custom, setCustom] = useState("15");

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
          <p className="legend">
            Speed: <span className="best slow">under 30</span> <span className="best mid">30–49</span>{" "}
            <span className="best fast">50+</span> wpm
          </p>
        </div>
      </aside>
    </div>
  );
}

function ResultPage({
  result,
  title,
  bestId,
  isTest,
  onAgain,
  onNext,
  onMenu,
}: {
  result: SessionResult;
  title: string;
  bestId: string;
  isTest: boolean;
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
          <span className="verdict">{BAND_LABEL[band]}</span>
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
            <button className="btn" onClick={onAgain}>
              {isTest ? "Test again" : "Try again"}
            </button>
            {onNext && (
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
