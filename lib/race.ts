// Car race rooms over WebRTC (PeerJS). The player who makes the link is the host:
// their browser keeps the room and passes everyone's position to the others.
// PeerJS's free public server only introduces the browsers — no account or key needed.
// One link is one race: once the race is over (or nobody starts it in time) the link closes.

import type { DataConnection, Peer as PeerType } from "peerjs";
import { ALL_LESSONS, makeText } from "./lessons";

export type Phase = "lobby" | "countdown" | "race" | "done" | "expired";

export type Player = {
  id: string;
  name: string;
  color: number;
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

export type RaceView = {
  status: "connecting" | "ready" | "error";
  error?: string;
  code: string;
  myId: string;
  isHost: boolean;
  room: RoomState;
  /** performance.now() when the cars go (local clock). */
  goAt: number | null;
  /** performance.now() when an unstarted lobby times out (local clock). */
  closesAt: number | null;
};

type ToHost = { t: "join"; name: string } | { t: "progress"; pos: number; wpm: number; acc: number; clean: boolean };
type ToGuest =
  | { t: "welcome"; id: string }
  | { t: "full" }
  | { t: "started" }
  | { t: "state"; room: RoomState; startsIn: number | null; closesIn: number | null };

const PREFIX = "typefast-race-";
const COUNTDOWN_MS = 3500;
/** An unstarted race link closes after this long. */
export const LOBBY_MS = 10 * 60_000;
/** The race ends by itself when nobody has typed for this long. */
const IDLE_MS = 60_000;
/** The host repeats the room this often, so guests notice when the host is gone. */
const HEARTBEAT_MS = 4000;
const HOST_LOST_MS = 15_000;
export const MAX_PLAYERS = 8;
export const RACE_WORDS = [15, 30, 50];
/** A finisher needs at least this share of the paragraph right to win a place on crossing the line. */
export const CLEAN_SHARE = 0.8;
const RACE_LESSON = ALL_LESSONS.find((l) => l.id === "a1")!;

export function newCode() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
}

export function raceLink(code: string) {
  return `${location.origin}/race?room=${code}`;
}

const EMPTY_ROOM: RoomState = { phase: "lobby", round: 0, text: "", players: [] };

const ERRORS: Record<string, string> = {
  "peer-unavailable": "This race link has expired — the race is over or the host left. Ask for a new link.",
  network: "Can't reach the race server. Check your internet and try again.",
  "server-error": "The race server is busy. Try again in a moment.",
  "socket-error": "Lost connection to the race server.",
  "socket-closed": "Lost connection to the race server.",
  "browser-incompatible": "This browser can't play races. Try Chrome.",
  "unavailable-id": "That race code is taken. Make a new link.",
  full: `This race is full (${MAX_PLAYERS} players). Ask for a new link.`,
  started: "This race has already started, so the link is closed. Ask for a new link.",
  expired: "Session timed out — the race wasn't started within 10 minutes, so the link closed. Make a new link.",
  "host-lost": "Lost the host — their page was closed or went to sleep, so the race link closed.",
};

export class Race {
  private peer: PeerType | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private broadcastTimer: number | null = null;
  private goTimer: number | null = null;
  private lobbyTimer: number | null = null;
  private idleTimer: number | null = null;
  private heartbeat: number | null = null;
  private hostSeenTimer: number | null = null;
  private hostGoAt: number | null = null;
  private destroyed = false;
  /** The link is closed (race over, timed out or left) — ignore anything the connection does now. */
  private closed = false;
  // Closing or reloading the tab says goodbye at once, so the others aren't left waiting.
  private onPageHide = () => this.destroy();
  view: RaceView;

  constructor(
    code: string,
    isHost: boolean,
    private name: string,
    private onChange: (view: RaceView) => void,
  ) {
    this.view = { status: "connecting", code, myId: isHost ? "host" : "", isHost, room: EMPTY_ROOM, goAt: null, closesAt: null };
    if (isHost) this.view.room = { ...EMPTY_ROOM, players: [this.newPlayer("host", name, 0)] };
    window.addEventListener("pagehide", this.onPageHide);
    void this.open();
  }

  private set(patch: Partial<RaceView>) {
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  private fail(type: string) {
    if (this.destroyed || this.closed) return;
    this.set({ status: "error", error: ERRORS[type] ?? "Connection problem. Try again." });
  }

  private async open() {
    const { Peer } = await import("peerjs");
    if (this.destroyed) return;
    const peer = this.view.isHost ? new Peer(PREFIX + this.view.code) : new Peer();
    this.peer = peer;
    peer.on("error", (e) => this.fail(e.type));
    peer.on("disconnected", () => {
      // The signalling server dropped us; open races keep working, so just reconnect quietly.
      if (!this.destroyed && !this.closed) peer.reconnect();
    });

    if (this.view.isHost) {
      peer.on("open", () => {
        if (this.view.status !== "connecting") return; // a reconnect, not the first open
        this.set({ status: "ready", closesAt: performance.now() + LOBBY_MS });
        this.lobbyTimer = window.setTimeout(() => this.expire(), LOBBY_MS);
        this.heartbeat = window.setInterval(() => this.broadcast(), HEARTBEAT_MS);
      });
      peer.on("connection", (conn) => this.accept(conn));
      return;
    }

    peer.on("open", () => {
      const conn = peer.connect(PREFIX + this.view.code, { reliable: true });
      this.hostConn = conn;
      conn.on("open", () => {
        conn.send({ t: "join", name: this.name } satisfies ToHost);
        this.hostSeen();
      });
      conn.on("data", (data) => {
        this.hostSeen();
        this.fromHost(data as ToGuest);
      });
      // After the results the host closes the link on purpose — keep showing the results.
      const lost = () => this.view.room.phase !== "done" && this.fail(this.view.status === "ready" ? "host-lost" : "peer-unavailable");
      conn.on("close", lost);
      conn.on("error", lost);
    });
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("pagehide", this.onPageHide);
    this.closeLink();
  }

  /**
   * Leave for good. Mid-race the host's page holds the room, so the host's leaving ends the
   * race for everyone and the link stays open just long enough to send them the results.
   */
  quit() {
    this.onChange = () => {};
    const racing = this.view.room.phase === "countdown" || this.view.room.phase === "race";
    if (!this.view.isHost || !racing) return this.destroy();
    this.end();
    window.setTimeout(() => this.destroy(), 1600);
  }

  /** Stop all timers and close the link; what's on screen stays. */
  private closeLink() {
    this.closed = true;
    for (const t of [this.broadcastTimer, this.goTimer, this.lobbyTimer, this.idleTimer, this.hostSeenTimer]) if (t) window.clearTimeout(t);
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.broadcastTimer = this.goTimer = this.lobbyTimer = this.idleTimer = this.hostSeenTimer = this.heartbeat = null;
    this.peer?.destroy();
  }

  // ---------- guest ----------

  /** Any message from the host proves it's still there. */
  private hostSeen() {
    if (this.hostSeenTimer) window.clearTimeout(this.hostSeenTimer);
    this.hostSeenTimer = window.setTimeout(() => {
      if (this.view.room.phase !== "done") {
        this.fail("host-lost");
        this.closeLink();
      }
    }, HOST_LOST_MS);
  }

  private fromHost(msg: ToGuest) {
    if (msg.t === "welcome") return this.set({ myId: msg.id, status: "ready" });
    if (msg.t === "full" || msg.t === "started") return this.fail(msg.t);
    if (msg.room.phase === "expired") {
      this.fail("expired");
      return this.closeLink();
    }
    // The countdown starts from when the message arrived.
    const goAt = this.view.goAt ?? (msg.startsIn !== null ? performance.now() + msg.startsIn : null);
    const closesAt = msg.closesIn !== null ? performance.now() + msg.closesIn : null;
    this.set({ room: msg.room, goAt, closesAt });
    if (msg.room.phase === "done") this.closeLink();
  }

  /** My position, sent on every change (they are tiny messages). `clean` matters at the finish. */
  progress(pos: number, wpm: number, acc: number, clean = true) {
    if (this.view.isHost) return this.update("host", pos, wpm, acc, clean);
    this.hostConn?.send({ t: "progress", pos, wpm, acc, clean } satisfies ToHost);
  }

  // ---------- host ----------

  private newPlayer(id: string, name: string, color: number): Player {
    return { id, name, color, pos: 0, wpm: 0, acc: 100, finished: null, messy: false, place: null };
  }

  private accept(conn: DataConnection) {
    conn.on("data", (data) => {
      const msg = data as ToHost;
      if (msg.t === "join") this.join(conn, msg.name);
      else if (msg.t === "progress") this.update(conn.peer, msg.pos, msg.wpm, msg.acc, msg.clean);
    });
    const leave = () => {
      // Guests close their side once the results arrive — the results keep everyone who raced.
      if (this.closed || this.view.room.phase === "done") return;
      this.conns.delete(conn.peer);
      this.setRoom({ players: this.view.room.players.filter((p) => p.id !== conn.peer) });
      this.checkDone();
    };
    conn.on("close", leave);
    conn.on("error", leave);
  }

  private join(conn: DataConnection, name: string) {
    const { players, phase } = this.view.room;
    // The link only lets people in before the race starts.
    const refuse: ToGuest | null = phase !== "lobby" ? { t: "started" } : players.length >= MAX_PLAYERS ? { t: "full" } : null;
    if (refuse) {
      conn.send(refuse);
      window.setTimeout(() => conn.close(), 500);
      return;
    }
    const used = new Set(players.map((p) => p.color));
    const color = Array.from({ length: MAX_PLAYERS }, (_, i) => i).find((c) => !used.has(c)) ?? 0;
    const player = this.newPlayer(conn.peer, cleanName(name), color);
    this.conns.set(conn.peer, conn);
    conn.send({ t: "welcome", id: conn.peer } satisfies ToGuest);
    this.setRoom({ players: [...players, player] });
  }

  start(words: number) {
    if (!this.view.isHost || this.view.room.phase !== "lobby") return;
    if (this.lobbyTimer) window.clearTimeout(this.lobbyTimer);
    this.lobbyTimer = null;
    const text = makeText(RACE_LESSON, (Math.random() * 2 ** 32) | 0, Math.min(300, Math.max(5, words)));
    this.hostGoAt = performance.now() + COUNTDOWN_MS;
    this.view.goAt = this.hostGoAt;
    this.view.closesAt = null;
    this.setRoom({ phase: "countdown", round: 1, text });
    this.goTimer = window.setTimeout(() => {
      this.setRoom({ phase: "race" });
      this.resetIdle();
    }, COUNTDOWN_MS);
  }

  /** Stop waiting for slow or idle players. */
  end() {
    if (!this.view.isHost || (this.view.room.phase !== "countdown" && this.view.room.phase !== "race")) return;
    this.setRoom({ phase: "done", players: placeMessy(this.view.room.players) });
    // Give the results a moment to reach everyone, then close the link for good.
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    window.setTimeout(() => this.closeLink(), 1500);
  }

  /** Nobody started the race in time: tell everyone and close the link. */
  private expire() {
    this.setRoom({ phase: "expired" });
    this.fail("expired");
    window.setTimeout(() => this.closeLink(), 1500);
  }

  private resetIdle() {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.end(), IDLE_MS);
  }

  private update(id: string, pos: number, wpm: number, acc: number, clean: boolean) {
    const { room } = this.view;
    if (room.phase !== "race") return;
    this.resetIdle();
    let place = room.players.filter((p) => p.place !== null).length;
    const order = room.players.filter((p) => p.finished !== null).length;
    const players = room.players.map((p) => {
      if (p.id !== id || p.finished !== null) return p;
      if (pos < room.text.length) return { ...p, pos, wpm, acc };
      // Small slips still win a place; a paragraph typed mostly wrong only gets one at the end.
      return { ...p, pos, wpm, acc, finished: order + 1, messy: !clean, place: clean ? ++place : null };
    });
    this.setRoom({ players });
    this.checkDone();
  }

  private checkDone() {
    const { players, phase } = this.view.room;
    if (phase === "race" && players.length > 0 && players.every((p) => p.finished !== null)) this.end();
  }

  private setRoom(patch: Partial<RoomState>) {
    this.set({ room: { ...this.view.room, ...patch } });
    // Positions go out at most ~12 times a second; phase changes go out at once.
    if (patch.phase) return this.broadcast();
    this.broadcastTimer ??= window.setTimeout(() => this.broadcast(), 80);
  }

  private broadcast() {
    if (this.broadcastTimer) window.clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    const { room } = this.view;
    const now = performance.now();
    const startsIn = room.phase === "countdown" && this.hostGoAt !== null ? Math.max(0, this.hostGoAt - now) : null;
    const closesIn = room.phase === "lobby" && this.view.closesAt !== null ? Math.max(0, this.view.closesAt - now) : null;
    const msg: ToGuest = { t: "state", room, startsIn, closesIn };
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
