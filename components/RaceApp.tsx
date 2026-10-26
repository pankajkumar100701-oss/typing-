"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import TypingSession, { SessionResult } from "./TypingSession";
import Car from "./Car";
import Chat from "./Chat";
import { FullscreenButton, KeyboardIcon, LaunchPrompt, UnlockToast } from "./Shell";
import { CLEAN_SHARE, MAX_PLAYERS, Player, RACE_WORDS, Race, RaceView, cleanName, raceLink } from "@/lib/race";
import { CAR_MODELS, CarLook, PAINTS, TIERS, bestSpeed, getCar, getCarOnServer, hasSavedCar, isUnlocked, modelOf, paintCar, saveCar, subscribeCar } from "@/lib/cars";
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
  const returning = useSyncExternalStore(noSubscribe, hasSavedCar, () => false);
  // No step chosen yet: a first visit opens the garage, a returning player the start screen.
  const [chosenStep, setStep] = useState<Step | null>(null);
  const step = chosenStep ?? (returning ? "start" : "car");
  const [name, setName] = useState<string | null>(null);
  const [view, setView] = useState<RaceView | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [asking, setAsking] = useState(false);
  const [garageOpen, setGarageOpen] = useState(false);
  const raceRef = useRef<Race | null>(null);

  // Leaving the page keeps it mounted but hidden; end any room and start fresh on the way back.
  useEffect(
    () => () => {
      raceRef.current?.destroy();
      raceRef.current = null;
      setRace(null);
      setView(null);
      setStep(null);
      setChatOpen(false);
      setGarageOpen(false);
      setAsking(false);
    },
    [],
  );
  useEffect(primeAudio, []);

  const begin = (code: string, host: boolean, solo = false) => {
    const clean = cleanName(name ?? storedName);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      // storage blocked — the name just isn't remembered
    }
    raceRef.current?.destroy();
    // The room gets its own history entry, so the phone's back button asks before leaving it.
    const url = solo ? "/race" : `/race#${code}`;
    if (history.state?.room) history.replaceState({ room: true }, "", url);
    else history.pushState({ room: true }, "", url);
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

  // Steps, the chat and the garage each get a history entry, so the phone's back button
  // steps back through them instead of leaving the game.
  const go = (next: Step) => {
    history.pushState({ step: next }, "", location.href);
    setStep(next);
  };
  const back = () => {
    if (history.state?.step) history.back();
    else setStep("start");
  };
  const openChat = () => {
    history.pushState({ room: true, chat: true }, "", location.href);
    setChatOpen(true);
  };
  const closeChat = () => {
    if (history.state?.chat) history.back();
    else setChatOpen(false);
  };
  const openGarage = () => {
    history.pushState({ room: true, garage: true }, "", location.href);
    setGarageOpen(true);
  };
  const closeGarage = () => {
    if (history.state?.garage) history.back();
    else setGarageOpen(false);
  };

  const racing = view?.room.phase === "countdown" || view?.room.phase === "race";
  const quit = () => {
    // Nothing to lose alone in the lobby; otherwise ask first.
    if (view?.solo && !racing) leave();
    else setAsking(true);
  };

  const onBack = useEffectEvent(() => {
    const state = history.state ?? {};
    if (!state.chat) setChatOpen(false);
    if (!state.garage) setGarageOpen(false);
    if (view) {
      if (state.room) return;
      // Backed out of the room: stay in it, and ask first.
      history.pushState({ room: true }, "", view.solo ? "/race" : `/race#${view.code}`);
      quit();
      return;
    }
    setStep(state.step ?? null);
  });
  useEffect(() => {
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  // A new car or paint picked in the garage shows in the room straight away.
  useEffect(() => race?.changeCar(car), [race, car]);

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
        ) : step === "start" || !returning ? (
          <Link className="menu-btn" href="/?open=games">
            ← Games
          </Link>
        ) : (
          <button className="menu-btn" onClick={back}>
            ← Back
          </button>
        )}
        <span className="brand">
          type<b>fast</b> <span className="race-tag">Car Race</span>
        </span>
        <span className="spacer" />
        {view && !view.solo && <RoomCode code={view.code} />}
        {online && !docked && (
          <button
            // a new message restarts the shake
            key={unread ? lastChat : 0}
            className={`sound-btn chat-btn ${chatOpen ? "on" : ""} ${unread ? "shake" : ""}`}
            onClick={() => (chatOpen ? closeChat() : openChat())} aria-label="Chat">
            💬 <span>Chat</span>
            {unread > 0 && <i className="dot" aria-label={`${unread} new`} />}
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
          <CarStep car={car} invite={urlCode} done={returning ? "Done ✓" : "Next →"} onNext={() => (returning ? back() : go("start"))} />
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
            onGarage={() => go("car")}
            onJoin={() => (urlCode ? begin(urlCode, false) : go("join"))}
            onJoinOther={() => {
              history.replaceState(null, "", "/race");
              go("join");
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
            onGarage={openGarage}
            chat={docked ? <Chat {...chatProps(view, race)} /> : null}
          />
        )
      )}

      {garageOpen && view && (
        <div className="garage-sheet">
          <CarStep car={car} invite={null} done="Done ✓" onNext={closeGarage} />
        </div>
      )}

      {online && !docked && chatOpen && race && (
        <div className="chat-sheet" onClick={closeChat}>
          <div onClick={(e) => e.stopPropagation()}>
            <Chat {...chatProps(view, race)} onClose={closeChat} />
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

/** Ready-made chat messages for what's going on in the room. */
function chatTips({ room, isHost }: RaceView) {
  const { phase, words } = room;
  if (phase === "countdown" || phase === "race") return ["Go go go! 🔥", "So fast 😮", "Wait for me 🐢", "GG"];
  if (phase === "done")
    return ["GG 🏆", "One more race? 🔁", "Nice race! 👏", isHost ? "Ready for the next one?" : words < 50 ? "Can we do more words?" : "Can we do fewer words?"];
  return isHost
    ? ["Everyone ready? 🏁", "Starting in a moment!", `This race is ${words} words`, "Change your car in the Garage 🚗"]
    : ["I'm ready! 🏁", "Wait, I'm changing my car colour 🎨", words === 15 ? "Can we do 30 words?" : "Can we do 15 words?", "Can we do 50 words?", "Start please 🙏"];
}

const chatProps = (view: RaceView, race: Race) => ({
  messages: view.chat,
  myId: view.myId,
  secure: view.secure,
  suggestions: chatTips(view),
  onSend: (t: string) => void race.say(t),
  onEdit: (key: string, t: string) => void race.edit(key, t),
});

/** The garage: pick a car and its paint. Cars unlock tier by tier as the player gets faster. */
function CarStep({ car, invite, done, onNext }: { car: CarLook; invite: string | null; done: string; onNext: () => void }) {
  const best = useSyncExternalStore(subscribeProgress, bestSpeed, () => 0);
  const [ring, setRing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
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

  // Keep the chosen car in the middle of the strip.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>(".model.on");
    if (strip && tile) strip.scrollTo({ left: tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2, behavior: "smooth" });
  }, [car.id]);

  return (
    <div className="setup car-step">
      <div className="garage">
        {invite && <p className="eyebrow">Invited to room {invite}</p>}
        <h1>Your garage</h1>
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
          {next ? ` · next cars at ${next} wpm` : " · every car unlocked 🏆"}
        </p>
      </div>

      <div className="garage-options">
        <h3>
          Car{" "}
          <small>
            {open.length} of {CAR_MODELS.length} unlocked
          </small>
        </h3>
        <div className="model-strip" ref={stripRef}>
          {CAR_MODELS.map((m) => {
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
          <span className="model soon">
            🚧
            <span>More cars soon</span>
          </span>
        </div>
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
          {done}
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
  onGarage,
  onSolo,
  onCreate,
  onJoin,
  onJoinOther,
}: {
  car: CarLook;
  invite: string | null;
  name: string;
  onName: (name: string) => void;
  onGarage: () => void;
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
        <button type="button" className="play-car" onClick={onGarage} aria-label="Open the garage">
          <Car look={car} />
          <span className="garage-chip">🚗 Garage</span>
        </button>
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
    <div className="setup join-step">
      <form
        className="play-card join-card"
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

function RaceRoom({ view, race, chat, onGarage }: { view: RaceView; race: Race; chat: React.ReactNode; onGarage: () => void }) {
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
            race.setWords(n);
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
          if (n > 0) {
            setWords(Math.min(300, Math.max(5, n)));
            race.setWords(Math.min(300, Math.max(5, n)));
          }
        }}
        aria-label="Custom number of words"
      />
    </div>
  );

  return (
    <div className="race-room">
      <Track players={room.players} text={room.text} myId={myId} mine={myRound} phase={room.phase} solo={solo} />

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
              {room.phase === "done" && me?.place && <Cheer wpm={me.wpm} />}
              {!solo && <RoomSettings room={room} />}
              {isHost ? (
                <>
                  {!solo && room.phase === "lobby" && <ShareRoom code={view.code} title="Invite friends" />}
                  {!solo && room.phase === "done" && <p className="muted wait">The room stays open — race again whenever you like.</p>}
                  {lengthPicker}
                  <div className="race-actions">
                    <button className="btn big garage-btn" onClick={onGarage}>
                      🚗 Garage
                    </button>
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
                  {me && (
                    <button className={`ready-btn ${me.ready ? "on" : ""}`} onClick={() => race.setReady(!me.ready)} aria-pressed={me.ready}>
                      {me.ready ? "✅ Ready" : "⏸ Not ready — tap when you are"}
                    </button>
                  )}
                  <p className="muted wait">
                    <span className="dots" aria-hidden /> Waiting for the host to start {room.phase === "done" ? "the next race" : "the race"}…
                  </p>
                  <p className="muted wait">Chat while you wait. You stay in this room until you quit.</p>
                  <div className="race-actions center">
                    <button className="btn garage-btn" onClick={onGarage}>
                      🚗 Garage · change your car
                    </button>
                  </div>
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
          {canType && me && myRound.pos >= 10 && <Cheer wpm={me.wpm} />}
          {canType ? (
            <TypingSession key={room.round} text={room.text} para onFinish={onFinish} onProgress={onProgress} />
          ) : me?.racing && myRound.done ? (
            <div className="race-panel">
              <div className="race-card">
                <h2>{me.place ? `You finished ${PLACES[me.place - 1]}!` : me.messy ? "Finished — with too many mistakes" : "Finished!"}</h2>
                <Cheer wpm={me.wpm} />
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
  solo,
}: {
  players: Player[];
  text: string;
  myId: string;
  mine: { pos: number };
  phase: string;
  solo: boolean;
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
              <div
                className={`car-slot ${boost ? "boost" : ""}`}
                // short cars take a narrower slot, so they start at the line and stop at the flag
                style={{ "--span": modelOf(p.car.id).span ?? 1, transform: `translateX(calc(${pct} * (var(--road-w) - var(--slot-w))))` } as React.CSSProperties}
              >
                <Car look={p.car} front />
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
                {live && !p.racing
                  ? "next race"
                  : phase === "lobby"
                    ? p.id === "host" && !solo
                      ? "host"
                      : p.ready || solo
                        ? "ready"
                        : "not ready"
                    : `${p.wpm} wpm`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** What the next race is, so everyone in the room can see it. */
function RoomSettings({ room }: { room: RaceView["room"] }) {
  const ready = room.players.filter((p) => p.id === "host" || p.ready).length;
  return (
    <p className="room-settings">
      <span>📝 {room.words} words</span>
      <span>
        👥 {room.players.length}/{MAX_PLAYERS} players
      </span>
      <span>✅ {ready} ready</span>
    </p>
  );
}

/** A word of encouragement for the speed so far. */
function Cheer({ wpm }: { wpm: number }) {
  const [band, text] =
    wpm < 20 ? ["slow", "You are too slow 🐢 speed up!"] : wpm < 30 ? ["ok", "Doing great 👍"] : wpm < 50 ? ["mid", "Keep practicing 💪"] : ["top", "Amazing! 🔥"];
  return (
    <p key={band} className={`cheer ${band}`} role="status">
      {text}
    </p>
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
        <div className="code-row">
          <button className="code-big" onClick={() => copy("code")} title="Copy password" aria-label={`Copy password ${code}`}>
            {code.split("").map((ch, i) => (
              <i key={i}>{ch}</i>
            ))}
          </button>
          <button className={`copy-code ${copied === "code" ? "done" : ""}`} onClick={() => copy("code")} title="Copy password" aria-label="Copy password">
            {copied === "code" ? (
              "✓"
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
            )}
          </button>
        </div>
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
