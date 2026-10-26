// Car race rooms over WebRTC (PeerJS). The player who makes the room is the host:
// their browser keeps the room and passes everyone's position and chat to the others.
// PeerJS's free public server only introduces the browsers — no account or key needed.
// A room stays open race after race until the host leaves; players can come and go.
// Playing alone uses the same room with no network at all.

import type { DataConnection, Peer as PeerType } from "peerjs";
import { ALL_LESSONS, makeText } from "./lessons";
import { CarLook, cleanCar } from "./cars";
import { Sealed, chatKey, roomId, seal, unseal } from "./secure";

export type Phase = "lobby" | "countdown" | "race" | "done";

export type Player = {
  id: string;
  name: string;
  car: CarLook;
  /** In the current round (people who join mid-race wait for the next one). */
  racing: boolean;
  /** Letters typed this round, right or wrong — the car's position. */
  pos: number;
  wpm: number;
  acc: number;
  /** 1, 2… in the order they crossed the finish line. */
  finished: number | null;
  /** Crossed the line with too many mistakes: no place until everyone is done, then the last ones. */
  messy: boolean;
  /** 1st, 2nd… once finished. */
  place: number | null;
};

export type RoomState = { phase: Phase; round: number; text: string; players: Player[] };

export type ChatMsg = { id: number; from: string; name: string; car: CarLook | null; text: string | null; at: number; system?: boolean };

export type RaceView = {
  status: "connecting" | "ready" | "error";
  error?: string;
  code: string;
  solo: boolean;
  myId: string;
  isHost: boolean;
  room: RoomState;
  /** performance.now() when the cars go (local clock). */
  goAt: number | null;
  chat: ChatMsg[];
  /** Chat is encrypted in this browser (WebCrypto available). */
  secure: boolean;
};

type ToHost =
  | { t: "join"; name: string; car: CarLook }
  | { t: "progress"; pos: number; wpm: number; acc: number; clean: boolean }
  | { t: "chat"; m: Sealed }
  | { t: "car"; car: CarLook };
type ToGuest =
  | { t: "welcome"; id: string }
  | { t: "full" }
  | { t: "closed" }
  | { t: "chat"; from: string; m: Sealed }
  | { t: "note"; text: string }
  | { t: "state"; room: RoomState; startsIn: number | null };

const PREFIX = "typefast-room-";
const COUNTDOWN_MS = 3500;
/** The race ends by itself when nobody has typed for this long. */
const IDLE_MS = 60_000;
/** The host repeats the room this often, so guests notice when the host is gone. */
const HEARTBEAT_MS = 4000;
const HOST_LOST_MS = 15_000;
export const MAX_PLAYERS = 8;
export const RACE_WORDS = [15, 30, 50];
export const MAX_CHAT = 300;
/** A finisher needs at least this share of the paragraph right to win a place on crossing the line. */
export const CLEAN_SHARE = 0.8;
const RACE_LESSON = ALL_LESSONS.find((l) => l.id === "a1")!;

export function raceLink(code: string) {
  return `${location.origin}/race#${code}`;
}

const EMPTY_ROOM: RoomState = { phase: "lobby", round: 0, text: "", players: [] };

const ERRORS: Record<string, string> = {
  "peer-unavailable": "No room with this password. Check the letters, or ask your friend for a new link.",
  network: "Can't reach the game server. Check your internet and try again.",
  "server-error": "The game server is busy. Try again in a moment.",
  "socket-error": "Lost connection to the game server.",
  "socket-closed": "Lost connection to the game server.",
  "browser-incompatible": "This browser can't play online. Try Chrome.",
  "unavailable-id": "That room password is in use. Make a new room.",
  full: `This room is full (${MAX_PLAYERS} players).`,
  closed: "The host closed the room.",
  "host-lost": "Lost the host — their page was closed or their phone went to sleep.",
};

export class Race {
  private peer: PeerType | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private broadcastTimer: number | null = null;
  private goTimer: number | null = null;
  private idleTimer: number | null = null;
  private heartbeat: number | null = null;
  private hostSeenTimer: number | null = null;
  private hostGoAt: number | null = null;
  private key: Promise<CryptoKey | null>;
  private chatId = 0;
  private destroyed = false;
  // Closing or reloading the tab says goodbye at once, so the others aren't left waiting.
  private onPageHide = () => this.destroy();
  view: RaceView;

  constructor(
    code: string,
    isHost: boolean,
    private name: string,
    private car: CarLook,
    private onChange: (view: RaceView) => void,
    solo = false,
  ) {
    this.view = {
      status: solo ? "ready" : "connecting",
      code,
      solo,
      myId: isHost ? "host" : "",
      isHost,
      room: EMPTY_ROOM,
      goAt: null,
      chat: [],
      secure: !!globalThis.crypto?.subtle,
    };
    if (isHost) this.view.room = { ...EMPTY_ROOM, players: [this.newPlayer("host", name, car)] };
    this.key = solo ? Promise.resolve(null) : chatKey(code);
    if (solo) return;
    window.addEventListener("pagehide", this.onPageHide);
    void this.open();
  }

  private set(patch: Partial<RaceView>) {
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  private fail(type: string) {
    if (this.destroyed || this.view.status === "error") return;
    this.set({ status: "error", error: ERRORS[type] ?? "Connection problem. Try again." });
    this.closeLink();
  }

  private async open() {
    const { Peer } = await import("peerjs");
    if (this.destroyed) return;
    const id = PREFIX + roomId(this.view.code);
    const peer = this.view.isHost ? new Peer(id) : new Peer();
    this.peer = peer;
    peer.on("error", (e) => {
      // A guest's link dropping is handled per connection; anything else ends the session.
      if (this.view.isHost && this.view.status === "ready" && e.type === "peer-unavailable") return;
      this.fail(e.type);
    });
    peer.on("disconnected", () => {
      // The signalling server dropped us; open rooms keep working, so just reconnect quietly.
      if (!this.destroyed && !peer.destroyed) peer.reconnect();
    });

    if (this.view.isHost) {
      peer.on("open", () => {
        if (this.view.status !== "connecting") return; // a reconnect, not the first open
        this.set({ status: "ready" });
        this.heartbeat = window.setInterval(() => this.broadcast(), HEARTBEAT_MS);
      });
      peer.on("connection", (conn) => this.accept(conn));
      return;
    }

    peer.on("open", () => {
      if (this.hostConn) return; // a reconnect to the signalling server
      const conn = peer.connect(id, { reliable: true });
      this.hostConn = conn;
      conn.on("open", () => {
        conn.send({ t: "join", name: this.name, car: this.car } satisfies ToHost);
        this.hostSeen();
      });
      conn.on("data", (data) => {
        this.hostSeen();
        this.fromHost(data as ToGuest);
      });
      const lost = () => this.fail(this.view.status === "ready" ? "host-lost" : "peer-unavailable");
      conn.on("close", lost);
      conn.on("error", lost);
    });
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("pagehide", this.onPageHide);
    this.closeLink();
  }

  /** Leave for good. The host's page holds the room, so the host leaving closes it for everyone. */
  quit() {
    this.onChange = () => {};
    if (!this.view.isHost || this.view.solo || this.conns.size === 0) return this.destroy();
    for (const conn of this.conns.values()) if (conn.open) conn.send({ t: "closed" } satisfies ToGuest);
    window.setTimeout(() => this.destroy(), 400);
  }

  /** Stop all timers and close the link; what's on screen stays. */
  private closeLink() {
    for (const t of [this.broadcastTimer, this.goTimer, this.idleTimer, this.hostSeenTimer]) if (t) window.clearTimeout(t);
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.broadcastTimer = this.goTimer = this.idleTimer = this.hostSeenTimer = this.heartbeat = null;
    const peer = this.peer;
    this.peer = null;
    peer?.destroy();
  }

  // ---------- chat ----------

  private addChat(msg: Omit<ChatMsg, "id" | "at">) {
    const chat = [...this.view.chat, { ...msg, id: ++this.chatId, at: Date.now() }].slice(-200);
    this.set({ chat });
  }

  private note(text: string) {
    this.addChat({ from: "", name: "", car: null, text, system: true });
  }

  private sender(id: string) {
    const p = this.view.room.players.find((x) => x.id === id);
    return { name: p?.name ?? "Player", car: p?.car ?? null };
  }

  private async received(from: string, m: Sealed) {
    const text = await unseal(await this.key, m);
    if (this.destroyed) return;
    this.addChat({ from, ...this.sender(from), text: text === null ? null : text.slice(0, MAX_CHAT) });
  }

  async say(raw: string) {
    const text = raw.trim().slice(0, MAX_CHAT);
    if (!text || this.view.solo || this.view.status !== "ready") return;
    const m = await seal(await this.key, text);
    this.addChat({ from: this.view.myId, ...this.sender(this.view.myId), text });
    if (this.view.isHost) this.relay("host", m);
    else this.hostConn?.send({ t: "chat", m } satisfies ToHost);
  }

  /** The host passes each message on as it came — sealed — to everyone but its sender. */
  private relay(from: string, m: Sealed) {
    for (const [id, conn] of this.conns) if (id !== from && conn.open) conn.send({ t: "chat", from, m } satisfies ToGuest);
  }

  private tellAll(text: string) {
    this.note(text);
    for (const conn of this.conns.values()) if (conn.open) conn.send({ t: "note", text } satisfies ToGuest);
  }

  // ---------- guest ----------

  /** Any message from the host proves it's still there. */
  private hostSeen() {
    if (this.hostSeenTimer) window.clearTimeout(this.hostSeenTimer);
    this.hostSeenTimer = window.setTimeout(() => this.fail("host-lost"), HOST_LOST_MS);
  }

  private fromHost(msg: ToGuest) {
    if (msg.t === "welcome") return this.set({ myId: msg.id, status: "ready" });
    if (msg.t === "full" || msg.t === "closed") return this.fail(msg.t);
    if (msg.t === "chat") return void this.received(msg.from, msg.m);
    if (msg.t === "note") return this.note(String(msg.text).slice(0, 80));
    // A new round: the countdown starts from when the message arrived.
    const newRound = msg.room.round !== this.view.room.round;
    const goAt = msg.startsIn !== null && (newRound || this.view.goAt === null) ? performance.now() + msg.startsIn : newRound ? null : this.view.goAt;
    this.set({ room: msg.room, goAt });
  }

  /** My position, sent on every change (they are tiny messages). `clean` matters at the finish. */
  progress(pos: number, wpm: number, acc: number, clean = true) {
    if (this.view.isHost) return this.update("host", pos, wpm, acc, clean);
    this.hostConn?.send({ t: "progress", pos, wpm, acc, clean } satisfies ToHost);
  }

  /** A new car or paint from the garage, shown to everyone in the room. */
  changeCar(car: CarLook) {
    if (car.id === this.car.id && car.p === this.car.p) return;
    this.car = car;
    if (this.view.isHost) this.setCar(this.view.myId, car);
    else if (this.hostConn?.open) this.hostConn.send({ t: "car", car } satisfies ToHost);
  }

  // ---------- host ----------

  private setCar(id: string, car: unknown) {
    const look = cleanCar(car);
    this.setRoom({ players: this.view.room.players.map((p) => (p.id === id ? { ...p, car: look } : p)) });
  }

  private newPlayer(id: string, name: string, car: CarLook): Player {
    return { id, name, car, racing: false, pos: 0, wpm: 0, acc: 100, finished: null, messy: false, place: null };
  }

  private accept(conn: DataConnection) {
    conn.on("data", (data) => {
      const msg = data as ToHost;
      if (msg.t === "join") this.join(conn, msg.name, msg.car);
      else if (!this.conns.has(conn.peer)) return;
      else if (msg.t === "car") this.setCar(conn.peer, msg.car);
      else if (msg.t === "progress") this.update(conn.peer, Number(msg.pos) || 0, Number(msg.wpm) || 0, Number(msg.acc) || 0, !!msg.clean);
      else if (msg.t === "chat" && msg.m && typeof msg.m === "object") {
        this.relay(conn.peer, msg.m);
        void this.received(conn.peer, msg.m);
      }
    });
    const leave = () => {
      if (!this.conns.delete(conn.peer)) return;
      const who = this.view.room.players.find((p) => p.id === conn.peer);
      this.setRoom({ players: this.view.room.players.filter((p) => p.id !== conn.peer) });
      if (who) this.tellAll(`${who.name} left`);
      this.checkDone();
    };
    conn.on("close", leave);
    conn.on("error", leave);
  }

  private join(conn: DataConnection, name: string, car: unknown) {
    const { players } = this.view.room;
    if (this.conns.has(conn.peer)) return;
    if (players.length >= MAX_PLAYERS) {
      conn.send({ t: "full" } satisfies ToGuest);
      window.setTimeout(() => conn.close(), 500);
      return;
    }
    // Anyone can come in at any time; mid-race they watch and join the next round.
    const player = this.newPlayer(conn.peer, cleanName(String(name)), cleanCar(car));
    this.conns.set(conn.peer, conn);
    conn.send({ t: "welcome", id: conn.peer } satisfies ToGuest);
    this.setRoom({ players: [...players, player] });
    this.tellAll(`${player.name} joined 👋`);
  }

  start(words: number) {
    const { phase, round, players } = this.view.room;
    if (!this.view.isHost || (phase !== "lobby" && phase !== "done")) return;
    const text = makeText(RACE_LESSON, (Math.random() * 2 ** 32) | 0, Math.min(300, Math.max(5, words)));
    this.hostGoAt = performance.now() + COUNTDOWN_MS;
    this.view.goAt = this.hostGoAt;
    const fresh = players.map((p) => ({ ...p, racing: true, pos: 0, wpm: 0, acc: 100, finished: null, messy: false, place: null }));
    this.setRoom({ phase: "countdown", round: round + 1, text, players: fresh });
    this.goTimer = window.setTimeout(() => {
      this.setRoom({ phase: "race" });
      this.resetIdle();
    }, COUNTDOWN_MS);
  }

  /** Stop waiting for slow or idle players; the room stays open for the next race. */
  end() {
    if (!this.view.isHost || (this.view.room.phase !== "countdown" && this.view.room.phase !== "race")) return;
    for (const t of [this.goTimer, this.idleTimer]) if (t) window.clearTimeout(t);
    this.goTimer = this.idleTimer = null;
    this.setRoom({ phase: "done", players: placeMessy(this.view.room.players) });
  }

  private resetIdle() {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.end(), IDLE_MS);
  }

  private update(id: string, pos: number, wpm: number, acc: number, clean: boolean) {
    const { room } = this.view;
    if (room.phase !== "race") return;
    this.resetIdle();
    pos = Math.min(Math.max(0, pos), room.text.length);
    let place = room.players.filter((p) => p.place !== null).length;
    const order = room.players.filter((p) => p.finished !== null).length;
    const players = room.players.map((p) => {
      if (p.id !== id || !p.racing || p.finished !== null) return p;
      if (pos < room.text.length) return { ...p, pos, wpm, acc };
      // Small slips still win a place; a paragraph typed mostly wrong only gets one at the end.
      return { ...p, pos, wpm, acc, finished: order + 1, messy: !clean, place: clean ? ++place : null };
    });
    this.setRoom({ players });
    this.checkDone();
  }

  private checkDone() {
    const { players, phase } = this.view.room;
    const racers = players.filter((p) => p.racing);
    if (phase === "race" && racers.length > 0 && racers.every((p) => p.finished !== null)) this.end();
    if ((phase === "race" || phase === "countdown") && racers.length === 0) this.end();
  }

  private setRoom(patch: Partial<RoomState>) {
    const before = this.view.room.players.length;
    this.set({ room: { ...this.view.room, ...patch } });
    if (this.view.solo) return;
    // Positions go out at most ~12 times a second; phase changes and joins/leaves go out at once.
    if (patch.phase || this.view.room.players.length !== before) return this.broadcast();
    this.broadcastTimer ??= window.setTimeout(() => this.broadcast(), 80);
  }

  private broadcast() {
    if (this.broadcastTimer) window.clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    const { room } = this.view;
    const startsIn = room.phase === "countdown" && this.hostGoAt !== null ? Math.max(0, this.hostGoAt - performance.now()) : null;
    const msg: ToGuest = { t: "state", room, startsIn };
    for (const conn of this.conns.values()) if (conn.open) conn.send(msg);
  }
}

/** At the end, messy finishers take the places after the clean ones, in the order they crossed the line. */
function placeMessy(players: Player[]) {
  let place = players.filter((p) => p.place !== null).length;
  const messy = players.filter((p) => p.messy && p.place === null).sort((a, b) => a.finished! - b.finished!);
  const places = new Map(messy.map((p) => [p.id, ++place]));
  return players.map((p) => (places.has(p.id) ? { ...p, place: places.get(p.id)! } : p));
}

export function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 16) || "Player";
}
