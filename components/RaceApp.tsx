"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult } from "./TypingSession";
import Car from "./Car";
import Chat from "./Chat";
import { FullscreenButton, KeyboardIcon, LaunchPrompt, UnlockToast } from "./Shell";
import { CLEAN_SHARE, MAX_PLAYERS, Player, RACE_WORDS, Race, RaceView, cleanName, raceLink } from "@/lib/race";
import { CAR_MODELS, CarLook, PAINTS, TIERS, bestSpeed, getCar, getCarOnServer, isUnlocked, modelOf, paintCar, saveCar, subscribeCar } from "@/lib/cars";
import ColourRing from "./ColourRing";
import { CODE_LEN, cleanCode, isCode, newCode } from "@/lib/secure";
import { saveResult, speedBand, subscribe as subscribeProgress } from "@/lib/progress";
import { getKbdPref, getKbdPrefOnServer, playComplete, playCount, primeAudio, subscribeSound, toggleKbd } from "@/lib/sound";

const NAME_KEY = "typefast:name";
/** Above this speed the car fires its booster. */
const BOOST_WPM = 40;
const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

type Step = "car" | "start" | "join";

const noSubscribe = () => () => {};
const hashSubscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
/** An invite link: /race#ABCDEF (older links used ?room=). */
const codeFromUrl = () => {
  const raw = location.hash.slice(1) || new URLSearchParams(location.search).get("room") || "";
  const code = cleanCode(raw);
  return isCode(code) ? code : null;
};
const wideQuery = "(min-width: 900px) and (min-height: 480px)";
const wideSubscribe = (cb: () => void) => {
  const mq = window.matchMedia(wideQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(wideQuery).matches;

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function RaceApp() {
  const urlCode = useSyncExternalStore(hashSubscribe, codeFromUrl, () => null);
  const kbdPref = useSyncExternalStore(subscribeSound, getKbdPref, getKbdPrefOnServer);
  const storedName = useSyncExternalStore(noSubscribe, savedName, () => "");
  const car = useSyncExternalStore(subscribeCar, getCar, getCarOnServer);
  const wide = useSyncExternalStore(wideSubscribe, isWide, () => false);
  const [step, setStep] = useState<Step>("car");
  const [name, setName] = useState<string | null>(null);
  const [view, setView] = useState<RaceView | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [asking, setAsking] = useState(false);
  const raceRef = useRef<Race | null>(null);

  useEffect(() => () => raceRef.current?.destroy(), []);
  useEffect(primeAudio, []);

  const begin = (code: string, host: boolean, solo = false) => {
    const clean = cleanName(name ?? storedName);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      // storage blocked — the name just isn't remembered
    }
    raceRef.current?.destroy();
    if (!solo) history.replaceState(null, "", `/race#${code}`);
    raceRef.current = new Race(code, host, clean, car, setView, solo);
    setRace(raceRef.current);
    setView(raceRef.current.view);
    setChatOpen(false);
    setSeenChat(0);
  };

  const leave = () => {
    raceRef.current?.quit();
    raceRef.current = null;
    setRace(null);
    setView(null);
    setAsking(false);
    setStep("start");
    history.replaceState(null, "", "/race");
  };

  const racing = view?.room.phase === "countdown" || view?.room.phase === "race";
  const quit = () => {
    // Nothing to lose alone in the lobby; otherwise ask first.
    if (view?.solo && !racing) leave();
    else setAsking(true);
  };

  const online = view && !view.solo && view.status === "ready";
  const inLobby = view?.room.phase === "lobby" || view?.room.phase === "done";
  const docked = !!online && inLobby && wide;
  const chatVisible = !!online && (docked || chatOpen);
  const lastChat = view?.chat.at(-1)?.id ?? 0;
  const unread = chatVisible ? 0 : view ? view.chat.filter((m) => m.id > seenChat && !m.system && m.from !== view.myId).length : 0;
  // Everything on screen counts as read.
  if (chatVisible && seenChat !== lastChat) setSeenChat(lastChat);

  return (
    <div className={`app race-app kbd-${kbdPref}`}>
      <LaunchPrompt />
      <UnlockToast />
      <header className="toolbar" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
        {view ? (
          <button className="btn quit-btn" onClick={quit}>
            ✕ Quit
          </button>
        ) : step === "car" ? (
          <Link className="menu-btn" href="/?open=games">
            ← Games
          </Link>
        ) : (
          <button className="menu-btn" onClick={() => setStep(step === "join" ? "start" : "car")}>
            ← Back
          </button>
        )}
        <span className="brand">
          type<b>fast</b> <span className="race-tag">Car Race</span>
        </span>
        <span className="spacer" />
        {view && !view.solo && <RoomCode code={view.code} />}
        {online && !docked && (
          <button className={`sound-btn chat-btn ${chatOpen ? "on" : ""}`} onClick={() => setChatOpen((o) => !o)} aria-label="Chat">
            💬 <span>Chat</span>
            {unread > 0 && <i className="badge">{unread > 9 ? "9+" : unread}</i>}
          </button>
        )}
        {view && (
          <button className="sound-btn kbd-btn" onClick={toggleKbd} aria-label="Show or hide the on-screen keyboard">
            <KeyboardIcon />
            <span className="kbd-state" />
          </button>
        )}
        <FullscreenButton />
      </header>

      {!view ? (
        step === "car" ? (
          <CarStep car={car} invite={urlCode} onNext={() => setStep("start")} />
        ) : step === "join" ? (
          <JoinStep onJoin={(code) => begin(code, false)} />
        ) : (
          <StartStep
            car={car}
            invite={urlCode}
            name={name ?? storedName}
            onName={setName}
            onSolo={() => begin("SOLO", true, true)}
            onCreate={() => begin(newCode(), true)}
            onJoin={() => (urlCode ? begin(urlCode, false) : setStep("join"))}
            onJoinOther={() => {
              history.replaceState(null, "", "/race");
              setStep("join");
            }}
          />
        )
      ) : view.status === "error" ? (
        <div className="race-panel">
          <div className="race-card">
            <h2>Disconnected</h2>
            <p className="muted">{view.error}</p>
            <div className="race-actions">
              <button className="btn" onClick={leave}>
                Back
              </button>
              {!view.isHost && (
                <button className="btn primary" onClick={() => begin(view.code, false)}>
                  Try again ↻
                </button>
              )}
              {view.isHost && (
                <button className="btn primary" onClick={() => begin(newCode(), true)}>
                  New room
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        race && (
          <RaceRoom
            key={view.code}
            view={view}
            race={race}
            chat={docked ? <Chat messages={view.chat} myId={view.myId} secure={view.secure} onSend={(t) => void race.say(t)} /> : null}
          />
        )
      )}

      {online && !docked && chatOpen && race && (
        <div className="chat-sheet" onClick={() => setChatOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Chat messages={view.chat} myId={view.myId} secure={view.secure} onSend={(t) => void race.say(t)} onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}

      {asking && view && (
        <div className="modal-backdrop" onClick={() => setAsking(false)}>
          <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <span className="modal-icon" aria-hidden>
              🚪
            </span>
            <h2>{view.solo ? "Stop this race?" : "Leave the room?"}</h2>
            <p className="muted">
              {view.solo
                ? "Your progress in this race is lost."
                : view.isHost && view.room.players.length > 1
                  ? "You're the host — leaving closes the room for everyone."
                  : view.isHost
                    ? "The room closes and its password stops working."
                    : "You can come back any time with the same password."}
            </p>
            <div className="race-actions center">
              <button className="btn" onClick={() => setAsking(false)}>
                Stay
              </button>
              <button className="btn danger" onClick={leave}>
                {view.solo ? "Stop" : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Step 1: pick a car and its paint. Cars unlock tier by tier as the player gets faster. */
function CarStep({ car, invite, onNext }: { car: CarLook; invite: string | null; onNext: () => void }) {
  const best = useSyncExternalStore(subscribeProgress, bestSpeed, () => 0);
  const [ring, setRing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const set = (patch: Partial<CarLook>) => saveCar({ ...getCar(), ...patch });
  const open = CAR_MODELS.filter((m) => isUnlocked(m, best));
  const step = (d: number) => {
    const i = open.findIndex((m) => m.id === car.id);
    set({ id: open[(i + d + open.length) % open.length].id });
  };
  const preset = PAINTS.find((x) => x.hex === car.p);
  const next = TIERS.find((t) => t > best);

  // Paint the chosen car in every ready-made colour now, so switching is instant.
  useEffect(() => {
    for (const x of PAINTS) void paintCar({ id: car.id, p: x.hex });
  }, [car.id]);

  return (
    <div className="setup car-step">
      <div className="garage">
        <p className="eyebrow">{invite ? `Invited to room ${invite} · step 1 of 2` : "Step 1 of 2"}</p>
        <h1>Customise your car</h1>
        <div className="stage">
          <button className="stage-arrow" onClick={() => step(-1)} aria-label="Previous car" disabled={open.length < 2}>
            ‹
          </button>
          <div className="stage-car">
            <Car look={car} />
          </div>
          <button className="stage-arrow" onClick={() => step(1)} aria-label="Next car" disabled={open.length < 2}>
            ›
          </button>
        </div>
        <p className="stage-name">
          <b>{modelOf(car.id).name}</b> · {car.p ? (preset?.name ?? car.p.toUpperCase()) : "Original"}
        </p>
        <p className="speed-note">
          Your best: <b>{best} wpm</b>
          {next ? ` · next cars at ${next} wpm` : " · every car unlocked 🏆 More cars coming soon!"}
        </p>
      </div>

      <div className="garage-options">
        <h3>Car</h3>
        <div className="tiers">
          {TIERS.map((tier) => {
            const cars = CAR_MODELS.filter((m) => m.tier === tier);
            if (!cars.length) return null;
            const reached = best >= tier;
            return (
              <section key={tier} className={`tier ${reached ? "open" : ""}`}>
                <h4>
                  {reached ? "🔓" : "🔒"} {tier} wpm
                  {!reached && <small> · {tier - best} wpm to go</small>}
                </h4>
                <div className="model-grid">
                  {cars.map((m) => {
                    const free = isUnlocked(m, best);
                    return (
                      <button
                        key={m.id}
                        className={`model ${car.id === m.id ? "on" : ""} ${free ? "" : "locked"}`}
                        onClick={() => {
                          if (free) {
                            setHint(null);
                            set({ id: m.id });
                          } else setHint(`🔒 ${m.name} unlocks at ${m.tier} wpm. Your best is ${best} wpm — race, take a test or type paragraphs to get faster!`);
                        }}
                        aria-label={free ? m.name : `${m.name}, locked until ${m.tier} wpm`}
                      >
                        <Car look={{ id: m.id, p: free ? car.p : null }} />
                        <span>{m.name}</span>
                        {!free && <i className="lock">🔒 {m.tier}</i>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <p className="speed-note">🚧 Faster cars beyond 55 wpm are coming soon — keep practising!</p>
        {hint && <p className="lock-hint">{hint}</p>}

        <h3>Paint</h3>
        <div className="swatches">
          <button
            className={`swatch wheel ${ring || (car.p && !preset) ? "on" : ""}`}
            style={car.p && !preset ? ({ "--pick": car.p } as React.CSSProperties) : undefined}
            onClick={() => setRing((r) => !r)}
            aria-label="Any colour"
            title="Any colour"
          />
          <button className={`swatch original ${car.p === null ? "on" : ""}`} onClick={() => set({ p: null })} aria-label="Original" title="Original colour">
            <span>Original</span>
          </button>
          {PAINTS.map((x) => (
            <button
              key={x.hex}
              className={`swatch ${car.p === x.hex ? "on" : ""}`}
              style={{ background: x.hex }}
              onClick={() => set({ p: x.hex })}
              aria-label={x.name}
              title={x.name}
            />
          ))}
        </div>
        {ring && <ColourRing value={car.p} onPick={(hex) => set({ p: hex })} onDone={() => setRing(false)} />}
        <button className="btn primary big next-btn" onClick={onNext}>
          Next →
        </button>
      </div>
    </div>
  );
}

/** Step 2: name, then play alone, make a room or join one. */
function StartStep({
  car,
  invite,
  name,
  onName,
  onSolo,
  onCreate,
  onJoin,
  onJoinOther,
}: {
  car: CarLook;
  invite: string | null;
  name: string;
  onName: (name: string) => void;
  onSolo: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onJoinOther: () => void;
}) {
  return (
    <div className="setup">
      <form
        className="play-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (invite) onJoin();
          else onSolo();
        }}
      >
        <div className="play-car" aria-hidden>
          <Car look={car} />
        </div>
        {invite && (
          <p className="invite">
            You&apos;re invited to room <b>{invite}</b>
          </p>
        )}
        <label className="name-field">
          <span>Your name</span>
          <input value={name} onChange={(e) => onName(e.target.value)} maxLength={16} placeholder="Player" />
        </label>
        <button type="submit" className="play-btn">
          {invite ? "JOIN GAME" : "PLAY"}
        </button>
        <div className="play-row">
          {invite ? (
            <>
              <button type="button" className="play-sub" onClick={onSolo}>
                Play alone
              </button>
              <button type="button" className="play-sub" onClick={onCreate}>
                Create game
              </button>
            </>
          ) : (
            <>
              <button type="button" className="play-sub" onClick={onCreate}>
                Create game
              </button>
              <button type="button" className="play-sub" onClick={onJoin}>
                Join game
              </button>
            </>
          )}
        </div>
        <p className="play-hint muted">
          {invite ? (
            <>
              Different room?{" "}
              <button type="button" className="link-btn" onClick={onJoinOther}>
                Enter a password
              </button>
            </>
          ) : (
            <>PLAY races alone · Create game makes a room with a password for up to {MAX_PLAYERS} friends</>
          )}
        </p>
      </form>
    </div>
  );
}

function JoinStep({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="setup">
      <form
        className="play-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (isCode(code)) onJoin(code);
        }}
      >
        <h2>Join a game</h2>
        <p className="muted">Type the room password your friend sent you ({CODE_LEN} letters) — or just open their link.</p>
        <input
          className="code-input"
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="ABCDEF"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Room password"
          autoFocus
        />
        <button type="submit" className="play-btn" disabled={!isCode(code)}>
          JOIN
        </button>
      </form>
    </div>
  );
}

function RaceRoom({ view, race, chat }: { view: RaceView; race: Race; chat: React.ReactNode }) {
  const { room, myId, isHost, goAt, status, solo } = view;
  const me = room.players.find((p) => p.id === myId);
  const [words, setWords] = useState(RACE_WORDS[1]);
  const [customWords, setCustomWords] = useState("");
  // My own car follows my typing straight away instead of waiting for the host's echo.
  const [mine, setMine] = useState({ round: 0, pos: 0, done: false });
  const [goRound, setGoRound] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const live = room.phase === "countdown" || room.phase === "race";
  const racing = room.round > 0 && goRound === room.round && live;
  const myRound = mine.round === room.round ? mine : { round: room.round, pos: 0, done: false };
  const canType = racing && me?.racing && !myRound.done;

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
      const wpm = Math.round(r.correct / 5 / minutes);
      race.progress(room.text.length, wpm, r.acc, r.correct >= r.total * CLEAN_SHARE);
      // A race's speed counts towards unlocking cars.
      saveResult("race", { wpm, acc: r.acc });
      playComplete();
    },
    [race, goAt, room.round, room.text.length],
  );

  const lengthPicker = (
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
  );

  return (
    <div className="race-room">
      <Track players={room.players} text={room.text} myId={myId} mine={myRound} phase={room.phase} />

      {status === "connecting" ? (
        <div className="race-panel">
          <div className="race-card">
            <h2>Connecting…</h2>
            <p className="muted">{isHost ? "Opening your room." : `Joining room ${view.code}.`}</p>
          </div>
        </div>
      ) : !live ? (
        <div className={`lobby ${chat ? "with-chat" : ""}`}>
          <div className="race-panel">
            <div className="race-card wide">
              {room.phase === "done" && <Results players={room.players} />}
              {isHost ? (
                <>
                  {!solo && room.phase === "lobby" && <ShareRoom code={view.code} title="Invite friends" />}
                  {!solo && room.phase === "done" && <p className="muted wait">The room stays open — race again whenever you like.</p>}
                  {lengthPicker}
                  <div className="race-actions">
                    <button className="btn primary big" onClick={() => race.start(words)}>
                      {room.phase === "done" ? "Race again 🏁" : solo || room.players.length === 1 ? "Start 🏁" : `Start race · ${room.players.length} players 🏁`}
                    </button>
                  </div>
                  {!solo && room.players.length === 1 && room.phase === "lobby" && (
                    <p className="muted wait">Waiting for friends… you can also start alone.</p>
                  )}
                </>
              ) : (
                <>
                  {room.phase === "lobby" && <h2>You&apos;re in! 🎉</h2>}
                  <p className="muted wait">
                    <span className="dots" aria-hidden /> Waiting for the host to start {room.phase === "done" ? "the next race" : "the race"}…
                  </p>
                  <p className="muted wait">Chat while you wait. You stay in this room until you quit.</p>
                  {room.phase === "lobby" && <ShareRoom code={view.code} title="Invite more friends" />}
                </>
              )}
            </div>
          </div>
          {chat && <div className="lobby-chat">{chat}</div>}
        </div>
      ) : (
        <div className="race-typing">
          {me?.racing && goRound !== room.round && goAt !== null && (
            <Countdown key={room.round} goAt={goAt} onGo={() => setGoRound(room.round)} />
          )}
          {canType ? (
            <TypingSession key={room.round} text={room.text} para onFinish={onFinish} onProgress={onProgress} />
          ) : me?.racing && myRound.done ? (
            <div className="race-panel">
              <div className="race-card">
                <h2>{me.place ? `You finished ${PLACES[me.place - 1]}!` : me.messy ? "Finished — with too many mistakes" : "Finished!"}</h2>
                <p className="muted">
                  {me.wpm} wpm · {me.acc}% accuracy
                  {doneAt && goAt ? ` · ${((doneAt - goAt) / 1000).toFixed(1)}s` : ""}
                </p>
                {me.messy && <p className="muted">You&apos;ll be placed after everyone who typed it cleanly.</p>}
                {!solo && <p className="muted">Waiting for the others to finish…</p>}
                {isHost && !solo && (
                  <div className="race-actions">
                    <button className="btn" onClick={() => race.end()}>
                      End race now
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {!me?.racing && <p className="watching">A race is on — you&apos;ll join the next one 👀</p>}
              <div className="text-box is-para race-preview">
                <div className="text-line">{room.text}</div>
              </div>
            </>
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
  const live = phase === "countdown" || phase === "race";
  return (
    <div className="track" style={{ "--lanes": Math.max(players.length, 2) } as React.CSSProperties}>
      {players.map((p) => {
        const pos = p.id === myId && live ? mine.pos : p.pos;
        const pct = text && (p.racing || !live) && phase !== "lobby" ? Math.min(1, pos / text.length) : 0;
        const boost = phase === "race" && p.racing && p.finished === null && p.wpm > BOOST_WPM;
        return (
          <div key={p.id} className={`lane ${p.id === myId ? "me" : ""}`}>
            <span className="lane-name">
              {p.name}
              {p.id === myId && <small> (you)</small>}
            </span>
            <div className="road">
              <div className={`car-slot ${boost ? "boost" : ""}`} style={{ transform: `translateX(calc(${pct} * (var(--road-w) - var(--car-w))))` }}>
                <Car look={p.car} />
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
              <span className={`lane-wpm ${live && p.racing ? speedBand(p.wpm) : ""}`}>
                {phase === "lobby" || (live && !p.racing) ? (live ? "next race" : "ready") : `${p.wpm} wpm`}
              </span>
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

function Results({ players }: { players: Player[] }) {
  const order = players.filter((p) => p.racing).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.pos - a.pos);
  return (
    <div className="results">
      <h2>Race results</h2>
      <ol>
        {order.map((p) => (
          <li key={p.id} className={p.place === 1 ? "winner" : ""}>
            <span className="r-place">{p.place === 1 ? "🏆" : p.place ? PLACES[p.place - 1] : "—"}</span>
            <span className="r-name">
              <span className="r-car">
                <Car look={p.car} />
              </span>
              {p.name}
            </span>
            <span className="r-stat">{p.place ? `${p.wpm} wpm · ${p.acc}%${p.messy ? " · too many mistakes" : ""}` : "didn't finish"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Clipboard copy that also works on plain-http pages (a phone on the LAN address), where navigator.clipboard is missing. */
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      // no way to copy here
    }
    area.remove();
    if (!ok) window.prompt("Copy this", value);
    return ok;
  }
}

/** The room password in the top bar: tap to copy. */
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`room-code ${copied ? "copied" : ""}`}
      onClick={async () => {
        if (!(await copyText(code))) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      title="Copy room password"
    >
      {copied ? "✓ Copied" : `🔑 ${code}`}
    </button>
  );
}

function ShareRoom({ code, title }: { code: string; title: string }) {
  const link = raceLink(code);
  const [copied, setCopied] = useState<"" | "code" | "link">("");
  const copy = async (what: "code" | "link") => {
    if (!(await copyText(what === "code" ? code : link))) return;
    setCopied(what);
    window.setTimeout(() => setCopied(""), 1600);
  };
  const share = () =>
    navigator.share?.({ title: "TypeFast car race", text: `Race me in TypeFast! Room password: ${code}`, url: link }).catch(() => {});
  return (
    <div className="share-room">
      <h2>{title}</h2>
      <div className="code-box">
        <span className="muted">Room password</span>
        <button className="code-big" onClick={() => copy("code")} title="Copy password" aria-label={`Copy password ${code}`}>
          {code.split("").map((ch, i) => (
            <i key={i}>{ch}</i>
          ))}
        </button>
        <button className={`btn copy-code ${copied === "code" ? "done" : ""}`} onClick={() => copy("code")}>
          {copied === "code" ? "✓ Password copied" : "📋 Copy password"}
        </button>
        <small className="muted">Friends pick Join game and paste or type it</small>
      </div>
      <div className="share">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Room link" />
        <button className="btn primary" onClick={() => copy("link")}>
          {copied === "link" ? "Copied ✓" : "Copy link"}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button className="btn" onClick={share}>
            Share
          </button>
        )}
      </div>
    </div>
  );
}
