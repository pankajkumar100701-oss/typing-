"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult, fmtTime } from "./TypingSession";
import Car from "./Car";
import { FullscreenButton, FullscreenIcon, KeyboardIcon, LaunchPrompt, UnlockToast, toggleFullscreen, useFullscreen } from "./Shell";
import { ALL_LESSONS, SECTIONS, Section, makeText, testText } from "@/lib/lessons";
import { BANDS, getProgress, getServerProgress, saveResult, speedBand, subscribe } from "@/lib/progress";
import { getCar, getCarOnServer, subscribeCar } from "@/lib/cars";
import {
  WORD_CHOICES,
  getKbdPref,
  getKbdPrefOnServer,
  getWordCount,
  getWordCountOnServer,
  playComplete,
  setWordCount,
  subscribeSound,
  toggleKbd,
} from "@/lib/sound";

/** Either a lesson (by index) or a timed test (by minutes). */
type Run = { round: number; text: string } & ({ kind: "lesson"; index: number } | { kind: "test"; minutes: number });
/** A full page opened from the menu, in place of the typing screen. */
type Page = "practice" | "games";

const TEST_MINUTES = [1, 2, 3, 5, 10];
// Basic, Experienced, Advance, then Test, then C Programs.
const ITEMS = [...SECTIONS.slice(0, 3).map((s) => s.id), "test", SECTIONS[3].id];
const ICONS: Record<string, string> = { basic: "🔤", experienced: "✍️", advance: "🚀", test: "⏱️", c: "💻" };

const noSubscribe = () => () => {};
// The race page links back to "/?open=games".
const pageFromUrl = () => {
  const open = new URLSearchParams(location.search).get("open");
  return open === "games" || open === "practice" ? open : null;
};

export default function TypingApp() {
  const [run, setRun] = useState<Run>(() => ({ kind: "lesson", index: 0, text: makeText(ALL_LESSONS[0], 1), round: 0 }));
  const [result, setResult] = useState<SessionResult | null>(null);
  const [menu, setMenu] = useState(false);
  const urlPage = useSyncExternalStore(noSubscribe, pageFromUrl, () => null);
  const [chosenPage, setChosenPage] = useState<Page | null | undefined>(undefined);
  const page = chosenPage === undefined ? urlPage : chosenPage;
  const kbdPref = useSyncExternalStore(subscribeSound, getKbdPref, getKbdPrefOnServer);
  const wordCount = useSyncExternalStore(subscribeSound, getWordCount, getWordCountOnServer);

  const lesson = run.kind === "lesson" ? ALL_LESSONS[run.index] : null;

  const openPage = (p: Page | null) => {
    setChosenPage(p);
    setMenu(false);
    if (urlPage) history.replaceState(null, "", "/");
  };

  // Every start builds a new random text.
  const openLesson = useCallback(
    (index: number) => {
      setRun((r) => ({ kind: "lesson", index, text: makeText(ALL_LESSONS[index], Date.now(), wordCount), round: r.round + 1 }));
      setResult(null);
      openPage(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openPage only sets state
    [wordCount, urlPage],
  );

  // New paragraph length: rebuild the current paragraph lesson straight away.
  const changeWords = (n: number) => {
    setWordCount(n);
    const words = getWordCount();
    if (run.kind === "lesson" && ALL_LESSONS[run.index].para) {
      setRun((r) => ({ ...r, text: makeText(ALL_LESSONS[run.index], Date.now(), words), round: r.round + 1 }));
      setResult(null);
    }
  };

  const openTest = (minutes: number) => {
    setRun((r) => ({ kind: "test", minutes, text: testText(Date.now()), round: r.round + 1 }));
    setResult(null);
    openPage(null);
  };

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
      <LaunchPrompt />
      <UnlockToast />

      {/* Drop focus after a toolbar click so typed keys never re-press a button. */}
      <header className="toolbar" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
        <button className="menu-btn" onClick={() => setMenu(true)}>
          <span aria-hidden>☰</span> Menu
        </button>
        <span className="brand">
          type<b>fast</b>
        </span>
        <span className="spacer" />
        {!page && (
          <button className="sound-btn kbd-btn" onClick={toggleKbd} aria-label="Show or hide the on-screen keyboard">
            <KeyboardIcon />
            <span className="kbd-state" />
          </button>
        )}
        <FullscreenButton />
      </header>

      {page === "practice" ? (
        <PracticePage
          current={run.kind === "lesson" ? run.index : -1}
          words={wordCount}
          onWords={changeWords}
          onLesson={openLesson}
          onTest={openTest}
          onClose={() => openPage(null)}
        />
      ) : page === "games" ? (
        <GamesPage onClose={() => openPage(null)} />
      ) : result ? (
        <ResultPage
          result={result}
          title={lesson ? lesson.title : "Typing test"}
          bestId={id}
          onAgain={() => (run.kind === "lesson" ? openLesson(run.index) : openTest(run.minutes))}
          onNext={hasNext && run.kind === "lesson" ? () => openLesson(run.index + 1) : undefined}
          onMenu={() => openPage("practice")}
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

      {menu && <Menu page={page} onPage={openPage} onClose={() => setMenu(false)} />}
    </div>
  );
}

function Menu({ page, onPage, onClose }: { page: Page | null; onPage: (p: Page | null) => void; onClose: () => void }) {
  const fs = useFullscreen();
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
          <button className={`menu-item ${page === "practice" ? "on" : ""}`} onClick={() => onPage("practice")}>
            <span className="menu-icon" aria-hidden>
              ⌨️
            </span>
            <span className="level-text">
              <b>Typing Practice</b>
              <small>Lessons, timed tests and C programs</small>
            </span>
            <i aria-hidden>→</i>
          </button>
          <button className={`menu-item ${page === "games" ? "on" : ""}`} onClick={() => onPage("games")}>
            <span className="menu-icon" aria-hidden>
              🎮
            </span>
            <span className="level-text">
              <b>Games</b>
              <small>Typing car race — alone or with friends</small>
            </span>
            <i aria-hidden>→</i>
          </button>
          {fs.supported && (
            <button className="menu-item" onClick={toggleFullscreen}>
              <span className="menu-icon" aria-hidden>
                <FullscreenIcon on={fs.on} />
              </span>
              <span className="level-text">
                <b>{fs.on ? "Exit full screen" : "Full screen"}</b>
                <small>{fs.on ? "Show the browser bars again" : "Hide the browser bars"}</small>
              </span>
            </button>
          )}
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

/** Typing Practice: the five parts as big cards in the middle of the page, then a part's lessons. */
function PracticePage({
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
  const [open, setOpen] = useState<string | null>(null);
  const section = SECTIONS.find((s) => s.id === open);

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn" onClick={open ? () => setOpen(null) : onClose}>
          ← {open ? "All parts" : "Back"}
        </button>
        <h1>{open ? (section ? section.title : "Test") : "Typing Practice"}</h1>
      </div>

      <div className="page-body">
        {!open && (
          <>
            <div className="hub-grid">
              {ITEMS.map((itemId, n) => {
                const s = SECTIONS.find((x) => x.id === itemId);
                const done = s ? s.lessons.filter((l) => progress[l.id]).length : 0;
                return (
                  <button key={itemId} className={`hub-card tone-${n}`} onClick={() => setOpen(itemId)}>
                    <span className="hub-num">{n + 1}</span>
                    <span className="hub-icon" aria-hidden>
                      {ICONS[itemId] ?? "📘"}
                    </span>
                    <b>{s ? s.title : "Test"}</b>
                    <small>{s ? s.note : "Timed test — pick any minutes"}</small>
                    <span className="hub-meta">
                      {s ? (
                        <>
                          {s.lessons.length} lessons
                          {done > 0 && <em> · {done} done</em>}
                        </>
                      ) : (
                        "1 – 60 minutes"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <WordsPick words={words} onWords={onWords} />
          </>
        )}

        {section && (
          <>
            {section.lessons.some((l) => l.para) && <WordsPick words={words} onWords={onWords} />}
            <LessonGrid section={section} current={current} onLesson={onLesson} />
          </>
        )}

        {open === "test" && <TestPick onTest={onTest} />}
      </div>
    </div>
  );
}

function LessonGrid({ section, current, onLesson }: { section: Section; current: number; onLesson: (i: number) => void }) {
  const progress = useSyncExternalStore(subscribe, getProgress, getServerProgress);
  return (
    <div className="lesson-grid">
      {section.lessons.map((l, li) => {
        const i = ALL_LESSONS.indexOf(l);
        const best = progress[l.id];
        return (
          <button key={l.id} className={`lesson-card ${i === current ? "current" : ""}`} onClick={() => onLesson(i)}>
            <span className="row-num">Lesson {li + 1}</span>
            <b>{l.title}</b>
            {best ? <span className={`best ${speedBand(best.wpm)}`}>{best.wpm} wpm</span> : <span className="best none">Not tried</span>}
          </button>
        );
      })}
    </div>
  );
}

function TestPick({ onTest }: { onTest: (minutes: number) => void }) {
  const [custom, setCustom] = useState("15");
  return (
    <div className="test-page">
      <p className="muted">Type as many words as you can before the time runs out.</p>
      <div className="minute-grid">
        {TEST_MINUTES.map((m) => (
          <button key={m} className="minute-card" onClick={() => onTest(m)}>
            <b>{m}</b>
            <small>{m === 1 ? "minute" : "minutes"}</small>
          </button>
        ))}
      </div>
      <form
        className="custom"
        onSubmit={(e) => {
          e.preventDefault();
          onTest(Math.min(60, Math.max(1, Math.round(Number(custom)) || 1)));
        }}
      >
        <span>Your own:</span>
        <input type="number" inputMode="numeric" min={1} max={60} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Minutes" />
        <span>min</span>
        <button className="btn primary" type="submit">
          Start
        </button>
      </form>
    </div>
  );
}

function WordsPick({ words, onWords }: { words: number; onWords: (n: number) => void }) {
  const [customWords, setCustomWords] = useState(WORD_CHOICES.includes(words) ? "" : String(words));
  return (
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
  );
}

function GamesPage({ onClose }: { onClose: () => void }) {
  const car = useSyncExternalStore(subscribeCar, getCar, getCarOnServer);
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn" onClick={onClose}>
          ← Back
        </button>
        <h1>Games</h1>
      </div>
      <div className="page-body">
        <div className="hub-grid games">
          <Link className="game-card" href="/race">
            <span className="game-art" aria-hidden>
              <Car look={car} />
            </span>
            <b>Car Race</b>
            <small>Pick your car, then race alone or make a room and race friends — up to 8 players, with chat.</small>
            <span className="game-play">Play ▶</span>
          </Link>
          <div className="game-card soon" aria-disabled>
            <span className="game-art soon-art" aria-hidden>
              🎮
            </span>
            <b>More games</b>
            <small>New typing games are on the way.</small>
            <span className="game-play">Coming soon</span>
          </div>
        </div>
      </div>
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
              Lessons
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

