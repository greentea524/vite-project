// Client network module for Big 2 multiplayer (KAN-63). Adapted from
// the invasion/platformer network.js: same Socket.io wrapper, room
// codes, ack deadlines, and Render cold-start warm-up (KAN-53). The
// game itself is server-authoritative — this module only sends
// intentions (play/pass) and receives the private hand ("hand"),
// public state ("state"), rejections, and round results.

import { io } from "socket.io-client";

export const MULTIPLAYER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MULTIPLAYER_URL) || "";

export const MAX_PLAYERS = 4;
export const GAME_TAG = "big2";
export const ACK_TIMEOUT_MS = 10000;

export class Network {
  constructor() {
    this._listeners = new Map();
    this.socket = null;
    this.playerId = null;
    this.roomCode = null;
    this.hostId = null;
    this.roster = [];
    // Server-fed game view: my seat + private hand, and the shared
    // public state (never anyone else's cards).
    this.mySeat = null;
    this.myHand = [];
    this.gameState = null;
  }

  static isConfigured() {
    return Boolean(MULTIPLAYER_URL);
  }

  // Cold-start warm-up (KAN-53): ping /health so a sleeping free-tier
  // host starts waking before the socket connects.
  static warmUp(url = MULTIPLAYER_URL) {
    if (!url || typeof fetch !== "function") return;
    fetch(`${url.replace(/\/$/, "")}/health`, { cache: "no-store" }).catch(() => {});
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }

  _emit(event, payload) {
    for (const cb of this._listeners.get(event) ?? []) cb(payload);
  }

  connect(url = MULTIPLAYER_URL) {
    if (!url) return false;
    if (this.socket) return true;
    const socket = io(url, { transports: ["websocket"], autoConnect: true });
    this.socket = socket;

    socket.on("connect", () => this._emit("connected"));
    socket.on("disconnect", () => this._emit("disconnected"));
    socket.on("connect_error", (err) => this._emit("error", err?.message || "connect_error"));

    socket.on("playerJoined", (p) => {
      this.roster = [...this.roster.filter((r) => r.id !== p.id), { id: p.id, name: p.name }];
      this._emit("roster", this.roster);
    });
    socket.on("playerLeft", ({ id }) => {
      this.roster = this.roster.filter((r) => r.id !== id);
      this._emit("roster", this.roster);
    });
    socket.on("hostChanged", ({ hostId }) => {
      this.hostId = hostId;
      this._emit("roster", this.roster); // re-render lobby (host badge/Start)
    });

    socket.on("big2:hand", ({ seat, hand }) => {
      this.mySeat = seat;
      this.myHand = hand;
      this._emit("hand", { seat, hand });
    });
    socket.on("big2:state", (state) => {
      this.gameState = state;
      this._emit("state", state);
    });
    socket.on("big2:rejected", (info) => this._emit("rejected", info));
    socket.on("big2:roundOver", (result) => this._emit("roundOver", result));
    return true;
  }

  _onJoined(res) {
    this.playerId = res.playerId;
    this.roomCode = res.code;
    this.hostId = res.hostId ?? null;
    this.roster = res.roster.map((r) => ({ id: r.id, name: r.name }));
    this._emit("roster", this.roster);
  }

  get isHost() {
    return this.playerId != null && this.playerId === this.hostId;
  }

  createRoom(name, timeoutMs = ACK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      this.socket
        .timeout(timeoutMs)
        .emit("createRoom", { name, game: GAME_TAG, maxPlayers: MAX_PLAYERS }, (err, res) => {
          if (err) return resolve({ ok: false, error: "No response from the server — try again." });
          if (res?.ok) this._onJoined(res);
          resolve(res);
        });
    });
  }

  joinRoom(code, name, timeoutMs = ACK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      this.socket
        .timeout(timeoutMs)
        .emit("joinRoom", { code, name, game: GAME_TAG }, (err, res) => {
          if (err) return resolve({ ok: false, error: "No response from the server — try again." });
          if (res?.ok) this._onJoined(res);
          resolve(res);
        });
    });
  }

  // Host-only: deal and start; bots fill any empty seats server-side.
  startGame(options = {}) {
    this.socket?.emit("big2:start", options);
  }

  play(cardIds) {
    this.socket?.emit("big2:play", { cardIds });
  }

  pass() {
    this.socket?.emit("big2:pass");
  }

  // Host-only, from the results screen.
  newRound() {
    this.socket?.emit("big2:newRound");
  }

  leave() {
    if (this.socket && this.roomCode) this.socket.emit("leaveRoom");
    this.roomCode = null;
    this.roster = [];
    this.mySeat = null;
    this.myHand = [];
    this.gameState = null;
  }

  destroy() {
    this.leave();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this._listeners.clear();
  }
}
