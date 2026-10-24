"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult, fmtTime } from "./TypingSession";
import { KeyboardIcon, SoundIcon } from "./TypingApp";
import { MAX_PLAYERS, Player, RACE_WORDS, Race, RaceView, cleanName, newCode, raceLink } from "@/lib/race";
import { speedBand } from "@/lib/progress";
import {
  getKbdPref,
  getKbdPrefOnServer,
  isMuted,
  isMutedOnServer,
  playComplete,
  playCount,
  primeAudio,
  subscribeSound,
  toggleKbd,
  toggleMute,
} from "@/lib/sound";

const CAR_COLORS = ["#1f6feb", "#e5484d", "#2f9e5b", "#f2b01e", "#8e4ec6", "#e5739d", "#12a5b5", "#f76b15"];
const NAME_KEY = "typefast:name";
const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

const noSubscribe = () => () => {};
const roomFromUrl = () => new URLSearchParams(location.search).get("room");

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function RaceApp() {
  const urlRoom = useSyncExternalStore(noSubscribe, roomFromUrl, () => null);
  const muted = useSyncExternalStore(subscribeSound, isMuted, isMutedOnServer);
  const kbdPref = useSyncExternalStore(subscribeSound, getKbdPref, getKbdPrefOnServer);
  const storedName = useSyncExternalStore(noSubscribe, savedName, () => "");
  const [name, setName] = useState<string | null>(null);
  const [view, setView] = useState<RaceView | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const raceRef = useRef<Race | null>(null);

  useEffect(() => () => raceRef.current?.destroy(), []);
  useEffect(primeAudio, []);

  const begin = (host: boolean) => {
    const clean = cleanName(name ?? storedName);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      // storage blocked — the name just isn't remembered
    }
    raceRef.current?.destroy();
    const code = host ? newCode() : urlRoom!;
    if (host) history.replaceState(null, "", `/race?room=${code}`);
    raceRef.current = new Race(code, host, clean, setView);
    setRace(raceRef.current);
    setView(raceRef.current.view);
  };

  const leave = () => {
    raceRef.current?.destroy();
    raceRef.current = null;
    setRace(null);
    setView(null);
    history.replaceState(null, "", "/race");
  };

  return (
    <div className={`app race-app kbd-${kbdPref}`}>
      <header className="toolbar" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
        <Link className="menu-btn" href="/">
          ← Lessons
        </Link>
        <span className="brand">
          type<b>fast</b> <span className="race-tag">Car Race</span>
        </span>
        <span className="spacer" />
        {view && <span className="room-code">Room {view.code}</span>}
        <button className="sound-btn kbd-btn" onClick={toggleKbd} aria-label="Show or hide the on-screen keyboard">
          <KeyboardIcon />
          <span className="kbd-state" />
        </button>
        <button className={`sound-btn ${muted ? "off" : ""}`} onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
          <SoundIcon muted={muted} />
          <span>{muted ? "Off" : "On"}</span>
        </button>
      </header>

      {!view ? (
        <Setup
          joining={urlRoom}
          name={name ?? storedName}
          onName={setName}
          onCreate={() => begin(true)}
          onJoin={() => begin(false)}
          onNewInstead={() => {
            history.replaceState(null, "", "/race");
            begin(true);
          }}
        />
      ) : view.status === "error" ? (
        <div className="race-panel">
          <div className="race-card">
            <h2>Race link closed</h2>
            <p className="muted">{view.error}</p>
            <div className="race-actions">
              <button className="btn primary" onClick={leave}>
                Make a new race
              </button>
            </div>
          </div>
        </div>
      ) : (
        race && <RaceRoom key={view.code} view={view} race={race} onNewRace={() => begin(true)} onLeave={leave} />
      )}
    </div>
  );
}

function Setup({
  joining,
  name,
  onName,
  onCreate,
  onJoin,
  onNewInstead,
}: {
  joining: string | null;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onNewInstead: () => void;
}) {
  return (
    <div className="race-panel">
      <form
        className="race-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (joining) onJoin();
          else onCreate();
        }}
      >
        <div className="race-hero" aria-hidden>
          <Car color={CAR_COLORS[0]} />
          <Car color={CAR_COLORS[1]} />
        </div>
        <h2>{joining ? "You're invited to a typing race!" : "Typing car race"}</h2>
        <p className="muted">
          {joining
            ? "Type the paragraph fast and correctly — your car moves with every right letter and stops at a mistake until you fix it."
            : `Make a race link, send it to friends (up to ${MAX_PLAYERS} players) and race on the same paragraph. One link is for one race.`}
        </p>
        <label className="name-field">
          <span>Your name</span>
          <input value={name} onChange={(e) => onName(e.target.value)} maxLength={16} placeholder="Player" autoFocus />
        </label>
        <div className="race-actions">
          {joining ? (
            <>
              <button type="button" className="btn" onClick={onNewInstead}>
                Make my own race
              </button>
              <button type="submit" className="btn primary">
                Join race 🏁
              </button>
            </>
          ) : (
            <button type="submit" className="btn primary">
              Create race link 🔗
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function RaceRoom({ view, race, onNewRace, onLeave }: { view: RaceView; race: Race; onNewRace: () => void; onLeave: () => void }) {
  const { room, myId, isHost, goAt, closesAt, status } = view;
  const me = room.players.find((p) => p.id === myId);
  const [words, setWords] = useState(RACE_WORDS[1]);
  const [customWords, setCustomWords] = useState("");
  // My own car follows my typing straight away instead of waiting for the host's echo.
  const [mine, setMine] = useState({ round: 0, correct: 0, done: false });
  const [goRound, setGoRound] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const racing = room.round > 0 && goRound === room.round && (room.phase === "countdown" || room.phase === "race");
  const myRound = mine.round === room.round ? mine : { round: room.round, correct: 0, done: false };
  const canType = racing && me && !myRound.done;

  const onProgress = useCallback(
    (correct: number) => {
      if (goAt === null) return;
      setMine((m) => (m.round === room.round && m.done ? m : { round: room.round, correct, done: false }));
      if (correct >= room.text.length) return; // the finish is sent by onFinish, with accuracy
      const minutes = Math.max(performance.now() - goAt, 1000) / 60000;
      race.progress(correct, Math.round(correct / 5 / minutes), 100);
    },
    [race, goAt, room.round, room.text.length],
  );

  const onFinish = useCallback(
    (r: SessionResult) => {
      const end = performance.now();
      const minutes = Math.max(end - (goAt ?? end), 1000) / 60000;
      setMine({ round: room.round, correct: room.text.length, done: true });
      setDoneAt(end);
      race.progress(room.text.length, Math.round(r.correct / 5 / minutes), r.acc);
      playComplete();
    },
    [race, goAt, room.round, room.text.length],
  );

  const shareLink = raceLink(view.code);

  return (
    <div className="race-room">
      <Track players={room.players} text={room.text} myId={myId} mine={myRound} phase={room.phase} />

      {status === "connecting" ? (
        <div className="race-panel">
          <div className="race-card">
            <h2>Connecting…</h2>
            <p className="muted">{isHost ? "Making your race link." : "Joining the race."}</p>
          </div>
        </div>
      ) : room.phase === "lobby" || room.phase === "done" ? (
        <div className="race-panel">
          <div className="race-card wide">
            {room.phase === "done" ? (
              <>
                <Results players={room.players} />
                <p className="muted wait">This race is over, so its link is closed. Make a new link to race again.</p>
                <div className="race-actions">
                  {isHost ? (
                    <button className="btn primary" onClick={onNewRace}>
                      New race link 🔗
                    </button>
                  ) : (
                    <button className="btn primary" onClick={onLeave}>
                      Make my own race
                    </button>
                  )}
                </div>
              </>
            ) : isHost ? (
              <>
                <h2>Share this link with friends</h2>
                <ShareLink link={shareLink} />
                {closesAt !== null && <ClosesIn at={closesAt} />}
                <div className="race-setup">
                  <span className="muted">Paragraph</span>
                  {RACE_WORDS.map((n) => (
                    <button
                      key={n}
                      className={`chip ${words === n && !customWords ? "on" : ""}`}
                      onClick={() => {
                        setCustomWords("");
                        setWords(n);
                      }}
                    >
                      {n} words
                    </button>
                  ))}
                  <input
                    className={`race-custom ${customWords ? "on" : ""}`}
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={300}
                    placeholder="Custom"
                    value={customWords}
                    onChange={(e) => {
                      setCustomWords(e.target.value);
                      const n = Math.round(Number(e.target.value));
                      if (n > 0) setWords(Math.min(300, Math.max(5, n)));
                    }}
                    aria-label="Custom number of words"
                  />
                </div>
                <div className="race-actions">
                  <button className="btn primary" onClick={() => race.start(words)}>
                    {room.players.length > 1 ? "Start race 🏁" : "Start alone 🏁"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted wait">You&apos;re in! Waiting for the host to start the race…</p>
                {closesAt !== null && <ClosesIn at={closesAt} />}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="race-typing">
          {goRound !== room.round && goAt !== null && (
            <Countdown key={room.round} goAt={goAt} onGo={() => setGoRound(room.round)} />
          )}
          {canType ? (
            <TypingSession key={room.round} text={room.text} para exact onFinish={onFinish} onProgress={onProgress} />
          ) : myRound.done ? (
            <div className="race-panel">
              <div className="race-card">
                <h2>{me?.place ? `You finished ${PLACES[me.place - 1]}!` : "Finished!"}</h2>
                <p className="muted">
                  {me?.wpm ?? 0} wpm · {me?.acc ?? 100}% accuracy
                  {doneAt && goAt ? ` · ${((doneAt - goAt) / 1000).toFixed(1)}s` : ""}
                </p>
                <p className="muted">Waiting for the others to finish…</p>
                {isHost && (
                  <div className="race-actions">
                    <button className="btn" onClick={() => race.end()}>
                      End race now
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-box is-para race-preview">
              <div className="text-line">{room.text}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Track({
  players,
  text,
  myId,
  mine,
  phase,
}: {
  players: Player[];
  text: string;
  myId: string;
  mine: { correct: number };
  phase: string;
}) {
  return (
    <div className="track" style={{ "--lanes": Math.max(players.length, 2) } as React.CSSProperties}>
      {players.map((p) => {
        const correct = p.id === myId && phase !== "lobby" ? mine.correct : p.correct;
        const pct = text ? Math.min(1, correct / text.length) : 0;
        return (
          <div key={p.id} className={`lane ${p.id === myId ? "me" : ""}`}>
            <span className="lane-name">
              {p.name}
              {p.id === myId && <small> (you)</small>}
            </span>
            <div className="road">
              <div className="car-slot" style={{ transform: `translateX(calc(${pct} * (var(--road-w) - var(--car-w))))` }}>
                <Car color={CAR_COLORS[p.color % CAR_COLORS.length]} />
              </div>
            </div>
            <span className="lane-stat">
              {p.place ? <b className="place">{PLACES[p.place - 1]}</b> : null}
              <span className={`lane-wpm ${phase === "lobby" ? "" : speedBand(p.wpm)}`}>{phase === "lobby" ? "ready" : `${p.wpm} wpm`}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ goAt, onGo }: { goAt: number; onGo: () => void }) {
  const [left, setLeft] = useState(() => Math.ceil((goAt - performance.now()) / 1000));
  const onGoRef = useRef(onGo);
  useEffect(() => {
    onGoRef.current = onGo;
  });
  useEffect(() => {
    let last = -1;
    let frame = 0;
    const tick = () => {
      const s = Math.ceil((goAt - performance.now()) / 1000);
      if (s !== last) {
        last = s;
        setLeft(s);
        if (s <= 3) playCount(s <= 0);
      }
      if (s <= 0) return onGoRef.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [goAt]);
  return (
    <div className="countdown" aria-live="assertive">
      <span key={left}>{left > 0 ? left : "GO!"}</span>
    </div>
  );
}

/** The unstarted link's time left, so nobody is surprised when it closes. */
function ClosesIn({ at }: { at: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <p className={`closes-in ${left <= 60 ? "soon" : ""}`}>
      Link closes in <b>{fmtTime(left)}</b> if the race isn&apos;t started
    </p>
  );
}

function Results({ players }: { players: Player[] }) {
  const order = [...players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.correct - a.correct);
  return (
    <div className="results">
      <h2>Race results</h2>
      <ol>
        {order.map((p) => (
          <li key={p.id} className={p.place === 1 ? "winner" : ""}>
            <span className="r-place">{p.place ? PLACES[p.place - 1] : "—"}</span>
            <span className="r-name">
              <i style={{ background: CAR_COLORS[p.color % CAR_COLORS.length] }} />
              {p.name}
            </span>
            <span className="r-stat">{p.place ? `${p.wpm} wpm · ${p.acc}%` : "didn't finish"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShareLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this link", link);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const share = () => navigator.share?.({ title: "TypeFast car race", text: "Race me in a typing race!", url: link }).catch(() => {});
  return (
    <div className="share">
      <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Race link" />
      <button className="btn primary" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button className="btn" onClick={share}>
          Share
        </button>
      )}
    </div>
  );
}

function Car({ color }: { color: string }) {
  return (
    <svg className="car" viewBox="0 0 64 30" aria-hidden>
      <path d="M4 20c0-4 2-6 6-7l9-6c2-1.5 4-2 7-2h12c3 0 5 1 7 3l5 5 7 1c3 .5 4 2 4 5v3c0 1-1 2-2 2H6c-1 0-2-1-2-2z" fill={color} />
      <path d="M21 12l5-4c1-.7 2-1 3.5-1H34v5zM37 7h1.5c2 0 3 .6 4.3 2l3 3H37z" fill="#dff1ff" />
      <rect x="57" y="16" width="5" height="3" rx="1.5" fill="#ffe08a" />
      <circle cx="17" cy="24" r="5" fill="#1d2633" />
      <circle cx="17" cy="24" r="2" fill="#c9d3df" />
      <circle cx="49" cy="24" r="5" fill="#1d2633" />
      <circle cx="49" cy="24" r="2" fill="#c9d3df" />
    </svg>
  );
}
