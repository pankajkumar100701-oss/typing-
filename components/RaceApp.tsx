"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult, fmtTime } from "./TypingSession";
import { KeyboardIcon, SoundIcon } from "./TypingApp";
import { CLEAN_SHARE, MAX_PLAYERS, Player, RACE_WORDS, Race, RaceView, cleanName, newCode, raceLink } from "@/lib/race";
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
/** Above this speed the car fires its booster. */
const BOOST_WPM = 40;
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

  const quit = () => {
    const racing = view?.room.phase === "countdown" || view?.room.phase === "race";
    if (racing && !window.confirm(view.isHost ? "Quit? This ends the race for everyone." : "Quit this race?")) return;
    leave();
  };

  const leave = () => {
    raceRef.current?.quit();
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
        {view && view.status !== "error" && view.room.phase !== "done" && (
          <button className="btn quit-btn" onClick={quit}>
            Quit
          </button>
        )}
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
            ? "Type the paragraph fast — your car moves with every letter. Small slips are fine, but a paragraph typed mostly wrong only gets a place after everyone else."
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
  const [mine, setMine] = useState({ round: 0, pos: 0, done: false });
  const [goRound, setGoRound] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const racing = room.round > 0 && goRound === room.round && (room.phase === "countdown" || room.phase === "race");
  const myRound = mine.round === room.round ? mine : { round: room.round, pos: 0, done: false };
  const canType = racing && me && !myRound.done;

  const onProgress = useCallback(
    (pos: number, correct: number) => {
      if (goAt === null) return;
      setMine((m) => (m.round === room.round && m.done ? m : { round: room.round, pos, done: false }));
      if (pos >= room.text.length) return; // the finish is sent by onFinish, with accuracy
      const minutes = Math.max(performance.now() - goAt, 1000) / 60000;
      race.progress(pos, Math.round(correct / 5 / minutes), 100);
    },
    [race, goAt, room.round, room.text.length],
  );

  const onFinish = useCallback(
    (r: SessionResult) => {
      const end = performance.now();
      const minutes = Math.max(end - (goAt ?? end), 1000) / 60000;
      setMine({ round: room.round, pos: room.text.length, done: true });
      setDoneAt(end);
      race.progress(room.text.length, Math.round(r.correct / 5 / minutes), r.acc, r.correct >= r.total * CLEAN_SHARE);
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
            <TypingSession key={room.round} text={room.text} para onFinish={onFinish} onProgress={onProgress} />
          ) : myRound.done ? (
            <div className="race-panel">
              <div className="race-card">
                <h2>{me?.place ? `You finished ${PLACES[me.place - 1]}!` : me?.messy ? "Finished — with too many mistakes" : "Finished!"}</h2>
                <p className="muted">
                  {me?.wpm ?? 0} wpm · {me?.acc ?? 100}% accuracy
                  {doneAt && goAt ? ` · ${((doneAt - goAt) / 1000).toFixed(1)}s` : ""}
                </p>
                {me?.messy && <p className="muted">You&apos;ll be placed after everyone who typed it cleanly.</p>}
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
  mine: { pos: number };
  phase: string;
}) {
  return (
    <div className="track" style={{ "--lanes": Math.max(players.length, 2) } as React.CSSProperties}>
      {players.map((p) => {
        const pos = p.id === myId && phase !== "lobby" ? mine.pos : p.pos;
        const pct = text ? Math.min(1, pos / text.length) : 0;
        const boost = phase === "race" && p.finished === null && p.wpm > BOOST_WPM;
        return (
          <div key={p.id} className={`lane ${p.id === myId ? "me" : ""}`}>
            <span className="lane-name">
              {p.name}
              {p.id === myId && <small> (you)</small>}
            </span>
            <div className="road">
              <div className={`car-slot ${boost ? "boost" : ""}`} style={{ transform: `translateX(calc(${pct} * (var(--road-w) - var(--car-w))))` }}>
                <Car color={CAR_COLORS[p.color % CAR_COLORS.length]} />
              </div>
            </div>
            <span className="lane-stat">
              {p.place ? (
                <b className="place">{PLACES[p.place - 1]}</b>
              ) : p.messy ? (
                <b className="messy" title="Too many mistakes">
                  ✗
                </b>
              ) : null}
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
  const order = [...players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.pos - a.pos);
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
            <span className="r-stat">{p.place ? `${p.wpm} wpm · ${p.acc}%${p.messy ? " · too many mistakes" : ""}` : "didn't finish"}</span>
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

/** A Ford Mustang fastback, side view, facing the finish. */
function Car({ color }: { color: string }) {
  return (
    <svg className="car" viewBox="0 0 64 30" aria-hidden>
      {/* body: shark nose, long hood, roof sweeping down to a short ducktail */}
      <path
        d="M3 22.6v-6.2q0-1.2 1.2-1.5l-1.6-.8 5.9.1 16-3.9q2-.5 4.5-.5h2.5q2 .1 3.5 1.2l3.6 3 16.9.9q4.5.4 6.7 1.9l-1 3.8.6 2.1q0 1.4-1.5 1.4H4.6Q3 24.1 3 22.6z"
        fill={color}
      />
      {/* shine along the shoulder, shade along the sill */}
      <path d="M4.2 15.6l51.6-.2q4.4.3 6.2 1.6l-.3.8-57.5-.6z" fill="#fff" opacity=".25" />
      <path d="M3 20.8h58.6l.2 1.9q0 1.4-1.5 1.4H4.6Q3 24.1 3 22.6z" fill="#000" opacity=".25" />
      {/* glass: small rear quarter window and the door window */}
      <path d="M16 13.9l7.5-2.6.7 2.6z" fill="#141c26" />
      <path d="M25.2 13.9l-.6-2.9q2-.5 4.4-.5h2.2q2 .1 3.2 1.1l2.4 2.3z" fill="#141c26" />
      <path d="M26.4 11.2l3-.5h1.6l-4.2 3z" fill="#fff" opacity=".2" />
      {/* side scoop ahead of the rear wheel, door line, GT stripe */}
      <path d="M20.6 17.6l5-1-.6 2.2z" fill="#000" opacity=".5" />
      <path d="M37 14.2l.4 6.4" stroke="#000" strokeOpacity=".3" strokeWidth=".4" fill="none" />
      <rect x="21" y="19.6" width="28" height=".8" rx=".4" fill="#111" opacity=".75" />
      {/* tail light, spoiler lip, headlight, grille, splitter */}
      <rect x="2.9" y="15.8" width="1.5" height="2.6" rx=".5" fill="#ff2d2d" />
      <path d="M2.6 14.1l2.6.1-1 .6z" fill="#111" />
      <path d="M56.6 15.5l5 .9-.5 1-4.3-.8z" fill="#fff6c2" />
      <path d="M60.6 17.6h1.3l-.6 3h-1z" fill="#111" />
      <rect x="54.5" y="23.2" width="7.4" height="1" rx=".5" fill="#111" />
      <rect x="2.8" y="23.2" width="5" height="1" rx=".5" fill="#111" />
      {/* wheels in their arches, five-spoke rims */}
      {[14.5, 51].map((x) => (
        <g key={x}>
          <circle cx={x} cy="23.8" r="5.4" fill="#0d1117" />
          <circle cx={x} cy="23.8" r="4.6" fill="#1b1f24" />
          <circle cx={x} cy="23.8" r="3.1" fill="#c3ccd6" />
          <circle cx={x} cy="23.8" r="2.1" fill="none" stroke="#4b5560" strokeWidth="1.5" strokeDasharray="1.2 1.44" />
          <circle cx={x} cy="23.8" r=".8" fill="#2a323d" />
        </g>
      ))}
    </svg>
  );
}
