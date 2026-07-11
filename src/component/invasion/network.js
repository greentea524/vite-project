// Client network module for 2-player invasion multiplayer (#79).
// Copied and adapted from the platformer's network.js: same Socket.io
// wrapper, room codes, ack deadlines, and Render cold-start warm-up,
// minus the race-specific events (finish times, catch-up shields,
// lobby avatar/name edits). Pure of DOM so it can be unit tested
// against an in-process relay.
//
// The server URL comes from VITE_MULTIPLAYER_URL at build time; unset
// means multiplayer is simply unavailable and single-player is
// unaffected. connect() also accepts an explicit url (used by tests).

import { io } from "socket.io-client";

export const MULTIPLAYER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MULTIPLAYER_URL) || "";

export const SEND_INTERVAL_MS = 66; // ~15 Hz, decoupled from the 60 Hz sim
// Head-to-head only (#79). The shared relay caps rooms per-room now, so
// this is sent with createRoom and enforced server-side.
export const MAX_PLAYERS = 2;
// Rooms are tagged per game on the shared relay so a platformer code
// can't land you in an invasion room (and vice versa).
export const GAME_TAG = "invasion";
// Room create/join acks time out rather than hang forever if the
// server goes quiet mid-session (KAN-53).
export const ACK_TIMEOUT_MS = 10000;

export class Network {
  constructor() {
    this._listeners = new Map();
    this.socket = null;
    this.playerId = null;
    this.roomCode = null;
    this.hostId = null;
    this.selfName = "";
    this.roster = [];
    // Shared-kill state (#81): enemies already destroyed by either
    // player, so a late joiner or a duplicate event never respawns or
    // double-processes one. Seeded on join from the relay's set.
    this.deadEnemies = new Set();
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
      this.roster = [...this.roster.filter((r) => r.id !== p.id), { id: p.id, name: p.name }];
      this._emit("roster", this.roster);
      this._emit("playerJoined", p);
    });
    socket.on("playerLeft", ({ id }) => {
      this.roster = this.roster.filter((r) => r.id !== id);
      this._emit("roster", this.roster);
      this._emit("playerLeft", { id });
    });
    socket.on("remoteState", (snap) => this._emit("remoteState", snap));
    // The other player destroyed an enemy (#81): record it and hand
    // the id up so the engine can despawn it here too.
    socket.on("enemyKilled", (enemyId) => {
      this.deadEnemies.add(enemyId);
      this._emit("enemyKilled", enemyId);
    });
    socket.on("raceStart", (info) => {
      this.deadEnemies.clear(); // fresh run
      this._emit("raceStart", info);
    });
    socket.on("hostChanged", ({ hostId }) => {
      this.hostId = hostId;
      this._emit("hostChanged", { hostId });
      this._emit("roster", this.roster); // re-render lobby (host badge/Start)
    });
    return true;
  }

  _onJoined(name, res) {
    this.playerId = res.playerId;
    this.roomCode = res.code;
    this.hostId = res.hostId ?? null;
    this.selfName = name;
    this.roster = res.roster.map((r) => ({ id: r.id, name: r.name }));
    this.deadEnemies = new Set(res.deadEnemies || []);
    this._emit("roster", this.roster);
  }

  get isHost() {
    return this.playerId != null && this.playerId === this.hostId;
  }

  // Host-only: ask the server to start the synced countdown.
  startGame() {
    this.socket?.emit("startRace");
  }

  // Acks are given a deadline (KAN-53): with socket.timeout() the
  // callback receives (err, res) and err is set when no ack arrives in
  // time, so these promises can never hang a frozen lobby.
  createRoom(name, timeoutMs = ACK_TIMEOUT_MS) {
    return new Promise((resolve) => {
      this.socket
        .timeout(timeoutMs)
        .emit("createRoom", { name, game: GAME_TAG, maxPlayers: MAX_PLAYERS }, (err, res) => {
          if (err) return resolve({ ok: false, error: "No response from the server — try again." });
          if (res?.ok) this._onJoined(name, res);
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
          if (res?.ok) this._onJoined(name, res);
          resolve(res);
        });
    });
  }

  // Throttled local-player broadcast (#80). Called every sim frame;
  // only actually sends at ~15 Hz. `force` bypasses the throttle (used
  // for the terminal game-over snapshot). Returns true when the
  // snapshot was actually emitted, so the caller can flush anything it
  // piggybacked on it (e.g. fire events) only once it's really sent.
  sendState(snapshot, force = false) {
    if (!this.socket || !this.roomCode) return false;
    const now = Date.now();
    if (!force && now - this._lastSent < SEND_INTERVAL_MS) return false;
    this._lastSent = now;
    this.socket.emit("state", snapshot);
    return true;
  }

  // Tell the room an enemy is dead (#81). Idempotent: only the first
  // report of a given id is broadcast, so a shared kill never loops.
  sendEnemyKill(enemyId) {
    if (!this.socket || !this.roomCode) return;
    if (this.deadEnemies.has(enemyId)) return;
    this.deadEnemies.add(enemyId);
    this.socket.emit("enemyKilled", { enemyId });
  }

  leave() {
    if (this.socket && this.roomCode) this.socket.emit("leaveRoom");
    this.roomCode = null;
    this.roster = [];
    this.deadEnemies.clear();
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
