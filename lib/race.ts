// Car race rooms over WebRTC (PeerJS). The player who makes the link is the host:
// their browser keeps the room and passes everyone's position to the others.
// PeerJS's free public server only introduces the browsers — no account or key needed.

import type { DataConnection, Peer as PeerType } from "peerjs";
import { ALL_LESSONS, makeText } from "./lessons";

export type Phase = "lobby" | "countdown" | "race" | "done";

export type Player = {
  id: string;
  name: string;
  color: number;
  /** Correct letters typed this round. */
  correct: number;
  wpm: number;
  acc: number;
  /** 1st, 2nd… once finished. */
  place: number | null;
  /** Joined mid-race: watches until the next round. */
  waiting: boolean;
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
};

type ToHost = { t: "join"; name: string } | { t: "progress"; correct: number; wpm: number; acc: number };
type ToGuest = { t: "welcome"; id: string } | { t: "state"; room: RoomState; startsIn: number | null };

const PREFIX = "typefast-race-";
const COUNTDOWN_MS = 3500;
export const MAX_PLAYERS = 8;
export const RACE_WORDS = [15, 30, 50];
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
  "peer-unavailable": "This race link has ended or the host left. Ask for a new link.",
  network: "Can't reach the race server. Check your internet and try again.",
  "server-error": "The race server is busy. Try again in a moment.",
  "socket-error": "Lost connection to the race server.",
  "socket-closed": "Lost connection to the race server.",
  "browser-incompatible": "This browser can't play races. Try Chrome.",
  "unavailable-id": "That race code is taken. Make a new link.",
};

export class Race {
  private peer: PeerType | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private broadcastTimer: number | null = null;
  private goTimer: number | null = null;
  private hostGoAt: number | null = null;
  private destroyed = false;
  // Closing or reloading the tab says goodbye at once, so the others aren't left waiting.
  private onPageHide = () => this.destroy();
  view: RaceView;

  constructor(
    code: string,
    isHost: boolean,
    private name: string,
    private onChange: (view: RaceView) => void,
  ) {
    this.view = { status: "connecting", code, myId: isHost ? "host" : "", isHost, room: EMPTY_ROOM, goAt: null };
    if (isHost) this.view.room = { ...EMPTY_ROOM, players: [this.newPlayer("host", name, 0)] };
    window.addEventListener("pagehide", this.onPageHide);
    void this.open();
  }

  private set(patch: Partial<RaceView>) {
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  private fail(type: string) {
    if (this.destroyed) return;
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
      if (!this.destroyed) peer.reconnect();
    });

    if (this.view.isHost) {
      peer.on("open", () => this.set({ status: "ready" }));
      peer.on("connection", (conn) => this.accept(conn));
      return;
    }

    peer.on("open", () => {
      const conn = peer.connect(PREFIX + this.view.code, { reliable: true });
      this.hostConn = conn;
      conn.on("open", () => conn.send({ t: "join", name: this.name } satisfies ToHost));
      conn.on("data", (data) => this.fromHost(data as ToGuest));
      conn.on("close", () => !this.destroyed && this.set({ status: "error", error: "The host left the race." }));
      conn.on("error", () => this.fail("socket-error"));
    });
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("pagehide", this.onPageHide);
    if (this.broadcastTimer) window.clearTimeout(this.broadcastTimer);
    if (this.goTimer) window.clearTimeout(this.goTimer);
    this.peer?.destroy();
  }

  // ---------- guest ----------

  private fromHost(msg: ToGuest) {
    if (msg.t === "welcome") return this.set({ myId: msg.id, status: "ready" });
    const prev = this.view.room;
    let goAt = this.view.goAt;
    // A new round: the countdown starts from when the message arrived.
    if (msg.room.round !== prev.round) goAt = null;
    if (goAt === null && msg.startsIn !== null) goAt = performance.now() + msg.startsIn;
    this.set({ room: msg.room, goAt });
  }

  /** My position, sent on every change (they are tiny messages). */
  progress(correct: number, wpm: number, acc: number) {
    if (this.view.isHost) return this.update("host", correct, wpm, acc);
    this.hostConn?.send({ t: "progress", correct, wpm, acc } satisfies ToHost);
  }

  // ---------- host ----------

  private newPlayer(id: string, name: string, color: number): Player {
    return { id, name, color, correct: 0, wpm: 0, acc: 100, place: null, waiting: false };
  }

  private accept(conn: DataConnection) {
    conn.on("data", (data) => {
      const msg = data as ToHost;
      if (msg.t === "join") this.join(conn, msg.name);
      else if (msg.t === "progress") this.update(conn.peer, msg.correct, msg.wpm, msg.acc);
    });
    const leave = () => {
      this.conns.delete(conn.peer);
      this.setRoom({ players: this.view.room.players.filter((p) => p.id !== conn.peer) });
      this.checkDone();
    };
    conn.on("close", leave);
    conn.on("error", leave);
  }

  private join(conn: DataConnection, name: string) {
    const { players, phase } = this.view.room;
    if (players.length >= MAX_PLAYERS) {
      conn.close();
      return;
    }
    const used = new Set(players.map((p) => p.color));
    const color = Array.from({ length: MAX_PLAYERS }, (_, i) => i).find((c) => !used.has(c)) ?? 0;
    const player = this.newPlayer(conn.peer, cleanName(name), color);
    player.waiting = phase === "countdown" || phase === "race";
    this.conns.set(conn.peer, conn);
    conn.send({ t: "welcome", id: conn.peer } satisfies ToGuest);
    this.setRoom({ players: [...players, player] });
  }

  start(words: number) {
    if (!this.view.isHost) return;
    const text = makeText(RACE_LESSON, (Math.random() * 2 ** 32) | 0, Math.min(300, Math.max(5, words)));
    const players = this.view.room.players.map((p) => ({ ...p, correct: 0, wpm: 0, acc: 100, place: null, waiting: false }));
    this.hostGoAt = performance.now() + COUNTDOWN_MS;
    this.view.goAt = this.hostGoAt;
    this.setRoom({ phase: "countdown", round: this.view.room.round + 1, text, players });
    if (this.goTimer) window.clearTimeout(this.goTimer);
    this.goTimer = window.setTimeout(() => this.setRoom({ phase: "race" }), COUNTDOWN_MS);
  }

  /** Stop waiting for slow or idle players. */
  end() {
    if (this.view.isHost && this.view.room.phase !== "lobby") this.setRoom({ phase: "done" });
  }

  private update(id: string, correct: number, wpm: number, acc: number) {
    const { room } = this.view;
    if (room.phase !== "race") return;
    let place = room.players.filter((p) => p.place !== null).length;
    const players = room.players.map((p) => {
      if (p.id !== id || p.waiting || p.place !== null) return p;
      const done = correct >= room.text.length;
      return { ...p, correct, wpm, acc, place: done ? ++place : null };
    });
    this.setRoom({ players });
    this.checkDone();
  }

  private checkDone() {
    const { room } = this.view;
    const racing = room.players.filter((p) => !p.waiting);
    if (room.phase === "race" && racing.length > 0 && racing.every((p) => p.place !== null)) this.setRoom({ phase: "done" });
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
    const startsIn = room.phase === "countdown" && this.hostGoAt !== null ? Math.max(0, this.hostGoAt - performance.now()) : null;
    const msg: ToGuest = { t: "state", room, startsIn };
    for (const conn of this.conns.values()) if (conn.open) conn.send(msg);
  }
}

export function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 16) || "Player";
}
