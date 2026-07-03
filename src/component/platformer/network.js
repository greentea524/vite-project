// Client network module for ghost-race multiplayer (PLAT-21). Wraps
// the Socket.io client and exposes a small event API mirroring the
// GameState pattern (on/off + emit). Pure of DOM so it can be unit
// tested against an in-process relay.
//
// The server URL comes from VITE_MULTIPLAYER_URL at build time; unset
// means multiplayer is simply unavailable and single-player is
// unaffected. connect() also accepts an explicit url (used by tests).

import { io } from "socket.io-client";

export const MULTIPLAYER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MULTIPLAYER_URL) || "";

export const SEND_INTERVAL_MS = 66; // ~15 Hz, decoupled from the 60 Hz sim

export class Network {
  constructor() {
    this._listeners = new Map();
    this.socket = null;
    this.playerId = null;
    this.roomCode = null;
    this.selfName = "";
    this.selfSlot = 0; // spawn-fan slot assigned by the server
    this.roster = [];
    this._lastSent = 0;
  }

  static isConfigured() {
    return Boolean(MULTIPLAYER_URL);
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
      this.roster = [...this.roster.filter((r) => r.id !== p.id), { ...p, level: 0, runTimeMs: 0, finished: false }];
      this._emit("roster", this.roster);
      this._emit("playerJoined", p);
    });
    socket.on("playerLeft", ({ id }) => {
      this.roster = this.roster.filter((r) => r.id !== id);
      this._emit("roster", this.roster);
      this._emit("playerLeft", { id });
    });
    socket.on("remoteState", (snap) => this._emit("remoteState", snap));
    socket.on("playerFinished", (info) => {
      const r = this.roster.find((p) => p.id === info.id);
      if (r) { r.finished = true; if (info.totalTimeMs != null) r.runTimeMs = info.totalTimeMs; }
      this._emit("roster", this.roster);
      this._emit("playerFinished", info);
    });
    return true;
  }

  _setRoster(list) {
    this.roster = list;
    this._emit("roster", this.roster);
  }

  _onJoined(name, res) {
    this.playerId = res.playerId;
    this.roomCode = res.code;
    this.selfName = name;
    this.selfSlot = res.roster.find((r) => r.id === res.playerId)?.slot ?? 0;
    this._setRoster(res.roster);
  }

  createRoom(name, avatar) {
    return new Promise((resolve) => {
      this.socket.emit("createRoom", { name, avatar }, (res) => {
        if (res?.ok) this._onJoined(name, res);
        resolve(res);
      });
    });
  }

  joinRoom(code, name, avatar) {
    return new Promise((resolve) => {
      this.socket.emit("joinRoom", { code, name, avatar }, (res) => {
        if (res?.ok) this._onJoined(name, res);
        resolve(res);
      });
    });
  }

  // Throttled local-player broadcast. Called every sim frame; only
  // actually sends at ~15 Hz. `force` bypasses the throttle (used for
  // the terminal "finished" snapshot).
  sendState(snapshot, force = false) {
    if (!this.socket || !this.roomCode) return;
    const now = Date.now();
    if (!force && now - this._lastSent < SEND_INTERVAL_MS) return;
    this._lastSent = now;
    this.socket.emit("state", snapshot);
  }

  sendFinished(totalTimeMs) {
    if (!this.socket || !this.roomCode) return;
    this.socket.emit("finished", { totalTimeMs });
  }

  leave() {
    if (this.socket && this.roomCode) this.socket.emit("leaveRoom");
    this.roomCode = null;
    this.roster = [];
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
