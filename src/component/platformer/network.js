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
export const MAX_PLAYERS = 6; // mirrors the server cap (relay.js enforces it)
// Room create/join acks time out rather than hang forever if the
// server goes quiet mid-session (KAN-53).
export const ACK_TIMEOUT_MS = 10000;

// True for localhost and RFC 1918 private LAN addresses (plus mDNS
// .local), so the multiplayer button works during local dev and for
// phones on the same Wi-Fi — but not on the public deployed site.
export function isLocalNetworkHost(hostname = "") {
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) return true;
  if (hostname.endsWith(".local")) return true;
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || // 10.0.0.0/8
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || // 192.168.0.0/16
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) // 172.16.0.0/12
  );
}

export class Network {
  constructor() {
    this._listeners = new Map();
    this.socket = null;
    this.playerId = null;
    this.roomCode = null;
    this.hostId = null;
    this.selfName = "";
    this.selfSlot = 0; // spawn-fan slot assigned by the server
    this.roster = [];
    this._lastSent = 0;
  }

  static isConfigured() {
    return Boolean(MULTIPLAYER_URL);
  }

  get isConnected() {
    return Boolean(this.socket?.connected);
  }

  // Cold-start warm-up (KAN-53): a plain HTTP ping to /health starts a
  // sleeping free-tier host spinning up immediately, while the socket
  // retries in parallel. Fire-and-forget; failures are expected while
  // the server is still waking.
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
      this.roster = [...this.roster.filter((r) => r.id !== p.id), { ...p, level: 0, runTimeMs: 0, finished: false }];
      this._emit("roster", this.roster);
      this._emit("playerJoined", p);
    });
    socket.on("playerLeft", ({ id }) => {
      this.roster = this.roster.filter((r) => r.id !== id);
      this._emit("roster", this.roster);
      this._emit("playerLeft", { id });
    });
    // A player changed avatar in the lobby: patch the roster in place.
    socket.on("playerUpdated", ({ id, avatar }) => {
      const r = this.roster.find((p) => p.id === id);
      if (r && avatar != null) r.avatar = avatar;
      this._emit("roster", this.roster);
      this._emit("playerUpdated", { id, avatar });
    });
    socket.on("remoteState", (snap) => this._emit("remoteState", snap));
    socket.on("raceStart", (info) => this._emit("raceStart", info));
    socket.on("hostChanged", ({ hostId }) => {
      this.hostId = hostId;
      this._emit("hostChanged", { hostId });
      this._emit("roster", this.roster); // re-render lobby (host badge/Start)
    });
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
    this.hostId = res.hostId ?? null;
    this.selfName = name;
    this.selfSlot = res.roster.find((r) => r.id === res.playerId)?.slot ?? 0;
    this._setRoster(res.roster);
  }

  get isHost() {
    return this.playerId != null && this.playerId === this.hostId;
  }

  // Host-only: ask the server to start the synced countdown.
  startRace() {
    this.socket?.emit("startRace");
  }

  // Broadcast a lobby avatar change so other players' rosters (and the
  // ghosts built from them) show the right color. No-op outside a room.
  setAvatar(avatar) {
    if (!this.socket || !this.roomCode) return;
    const self = this.roster.find((p) => p.id === this.playerId);
    if (self) {
      self.avatar = avatar;
      this._emit("roster", this.roster);
    }
    this.socket.emit("setAvatar", { avatar });
  }

  // Acks are given a deadline (KAN-53): with socket.timeout() the
  // callback receives (err, res) and err is set when no ack arrives in
  // time, so these promises can never hang a frozen lobby.
  createRoom(name, avatar, timeoutMs = ACK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      this.socket.timeout(timeoutMs).emit("createRoom", { name, avatar }, (err, res) => {
        if (err) return resolve({ ok: false, error: "No response from the server — try again." });
        if (res?.ok) this._onJoined(name, res);
        resolve(res);
      });
    });
  }

  joinRoom(code, name, avatar, timeoutMs = ACK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      this.socket.timeout(timeoutMs).emit("joinRoom", { code, name, avatar }, (err, res) => {
        if (err) return resolve({ ok: false, error: "No response from the server — try again." });
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
