// Ghost-race relay server (PLAT-20). A dumb Socket.io relay: it owns
// rooms and broadcasts player state, with no game logic and no
// authority. Rooms are in-memory and vanish when empty (no database).
//
// createRelayServer() returns a started server plus a close() helper so
// tests can run it on an ephemeral port; index.js uses it for the real
// process.

import { createServer } from "node:http";
import { Server } from "socket.io";
import { attachBig2, big2OnLeave, big2OnRoomClosed } from "./big2.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars
const CODE_LEN = 4;
export const MAX_PLAYERS = 6; // per room (host + up to 5 others, PG-57)
export const COUNTDOWN_MS = 3000; // synced-start countdown (PLAT-30)

// --- client payload validation (#142) ----------------------------------
//
// The relay is public and unauthenticated, so everything below the wire is
// attacker-controlled. Two handlers used to take it at face value: `state`
// was stored and rebroadcast verbatim, and `enemyKilled` appended an
// unchecked id to a set that only grew. That gave a sender bandwidth
// amplification (one message out to every other socket in the room, at
// whatever rate they chose), type confusion in fields the whole room reads
// back, and unbounded memory growth.
//
// The rule here is that nothing crosses the relay unless this file built it.

export const MAX_SNAPSHOT_BYTES = 64 * 1024; // ~8x the largest real snapshot

const MAX_NAME = 16;          // matches the roster's own cap
const MAX_SHORT_STRING = 24;  // anim, shipType
const MAX_SHOTS = 32;         // a 15 Hz client piggybacks a handful per frame
const MAX_BOSS_DAMAGE = 8;    // no level fields more than a couple of bosses
const MAX_ENEMY_ID = 64;      // real ids are ~20 chars ("L3_enemy_7", "w2-r1-c4")
export const MAX_DEAD_ENEMIES = 2000; // far above a long race, far below harm

// Rooms live in memory on a free-tier host, and nothing authenticates the
// clients that create them (#141). A per-socket cap is not needed — since
// #140 a socket leaves its current room before entering another, so it is
// structurally in exactly one — but nothing stopped many sockets, or one
// socket churning, from filling the process.
//
// 200 concurrent games is far beyond anything this relay has ever seen, and
// bounds the worst case at roughly 8 MB (each room's dead-enemy set is
// capped above). Raise it here if that ever stops being true.
export const MAX_ROOMS = 200;

// createRoom/joinRoom are things a person does, a few times a minute at
// most. One socket managed 200 create-and-leave cycles in 90ms unthrottled,
// which is pure code generation and room churn on the event loop.
const ROOM_ACTIONS_PER_SEC = 5;
const ROOM_ACTIONS_BURST = 10;

const finite = (v) => (Number.isFinite(v) ? v : undefined);
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);

// Assign only when the coerced value survived, so absent stays absent —
// consumers rely on `snap.facing ?? 1` style defaults.
function put(target, key, value) {
  if (value !== undefined) target[key] = value;
}

// A token bucket per socket per event. Legitimate clients send state at
// ~15 Hz (SEND_INTERVAL_MS), with a `force` bypass for the terminal
// game-over snapshot — so a flat minimum interval would drop exactly the
// message that matters most, and exempting it by content would just be a
// hole to send `over: true` through. A bucket bounds the rate without
// needing to know what any field means.
function withinRate(socket, key, perSecond, burst) {
  const now = Date.now();
  const bucket = (socket.data[key] ??= { tokens: burst, at: now });
  bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Rebuild a movement snapshot from a known field list.
//
// The union of what both games send: the platformer contributes facing,
// anim, avatar, name, level and runTimeMs; the invasion shooter contributes
// over, shipType, score, isFiring, and on game over hits/bestCombo/
// bestMultiplier, plus optional piggybacked shots and boss damage. Anything
// not named here is dropped rather than relayed.
export function sanitizeSnapshot(snap) {
  if (typeof snap !== "object" || snap === null) return {};
  const out = {};

  for (const key of ["x", "y", "vx", "facing", "avatar", "level", "runTimeMs",
                     "score", "hits", "bestCombo", "bestMultiplier"]) {
    put(out, key, finite(snap[key]));
  }
  for (const key of ["over", "isFiring", "finished"]) {
    if (snap[key] !== undefined) out[key] = snap[key] === true;
  }
  put(out, "name", text(snap.name, MAX_NAME));
  put(out, "anim", text(snap.anim, MAX_SHORT_STRING));
  put(out, "shipType", text(snap.shipType, MAX_SHORT_STRING));

  // Cosmetic ghost bullets: a bounded list of bounded shapes.
  if (Array.isArray(snap.shots)) {
    const shots = [];
    for (const shot of snap.shots.slice(0, MAX_SHOTS)) {
      if (typeof shot !== "object" || shot === null) continue;
      const clean = {};
      put(clean, "x", finite(shot.x));
      put(clean, "y", finite(shot.y));
      put(clean, "vx", finite(shot.vx));
      clean.isLaser = shot.isLaser === true;
      clean.isHoming = shot.isHoming === true;
      shots.push(clean);
    }
    if (shots.length) out.shots = shots;
  }

  // Shared boss HP: an id -> damage map, both sides bounded.
  if (typeof snap.bossDamage === "object" && snap.bossDamage !== null) {
    const damage = {};
    let seen = 0;
    for (const [id, amount] of Object.entries(snap.bossDamage)) {
      if (seen >= MAX_BOSS_DAMAGE) break;
      const value = finite(amount);
      if (value === undefined) continue;
      damage[id.slice(0, MAX_ENEMY_ID)] = value;
      seen++;
    }
    if (seen) out.bossDamage = damage;
  }

  return out;
}

// An enemy id is only ever echoed back and compared, so a bounded string is
// the whole requirement.
export function sanitizeEnemyId(id) {
  return typeof id === "string" && id.length > 0 ? id.slice(0, MAX_ENEMY_ID) : null;
}

// Returns an unused room code, or null if it could not find one.
//
// The retry loop used to be unbounded: with room creation uncapped, filling
// a large fraction of the 32^4 (~1.05M) code space made it spin, stalling
// the event loop rather than failing. MAX_ROOMS now keeps occupancy about
// four orders of magnitude below that, so this is belt-and-braces — but an
// unbounded loop over a shared resource is not worth keeping either way.
// --- origin policy (#145) ----------------------------------------------
//
// The relay used to accept any origin unless ALLOWED_ORIGINS happened to be
// set, and echoed whatever Origin it was given on /health. Nothing in the
// repo asserted the variable was set on the host, so the deployed default
// was invisible from here — and it was `*`.
//
// The obvious fix, refusing to start in production without the variable,
// would take the live relay down on the next deploy if it has never been
// set. Instead the fallback is a real allowlist: the deployed site, plus the
// local and private-network origins a developer actually serves from. Set
// ALLOWED_ORIGINS to override it with an exact list.

/** Where the built client is deployed (package.json "homepage"). */
export const PRODUCTION_ORIGIN = "https://greentea524.github.io";

// Mirrors isLocalNetworkHost in the client's network.js: a phone testing
// against a dev server over the LAN is a normal thing to do here, and
// blocking it would break that without making anyone safer.
function isLocalHostname(hostname) {
  // URL.hostname keeps the brackets on an IPv6 literal ("[::1]"), so strip
  // them before comparing or IPv6 localhost is refused.
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) return true;
  if (host.endsWith(".local")) return true;
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * Builds the predicate both Socket.io and the health route use.
 *
 * `allowedOrigins` may be an explicit array (exact matches only, which is
 * what a deployment should use) or undefined/"*" for the default policy.
 */
export function makeOriginAllowed(allowedOrigins) {
  const explicit =
    Array.isArray(allowedOrigins) && allowedOrigins.length > 0 ? allowedOrigins : null;

  return function originAllowed(origin) {
    // No Origin header at all: curl, a host's health probe, a native client.
    // CORS exists to protect browsers from other pages, so there is nothing
    // to decide here — and rejecting it would break Render's health check.
    if (!origin) return true;
    if (explicit) return explicit.includes(origin);
    if (origin === PRODUCTION_ORIGIN) return true;
    try {
      return isLocalHostname(new URL(origin).hostname);
    } catch {
      return false; // unparseable Origin
    }
  };
}

function makeCode(taken) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from({ length: CODE_LEN }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join("");
    if (!taken.has(code)) return code;
  }
  return null;
}

// Public roster shape sent to clients.
function roster(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    avatar: p.avatar,
    slot: p.slot,
    level: p.level,
    runTimeMs: p.runTimeMs,
    finished: p.finished,
  }));
}

export function createRelayServer({ port = 0, allowedOrigins, maxRooms = MAX_ROOMS } = {}) {
  const originAllowed = makeOriginAllowed(allowedOrigins);

  // Echo an origin only when it is allowed; otherwise send no CORS header at
  // all and let the browser refuse. Reflecting whatever arrived turns the
  // header into a rubber stamp.
  function corsHeaders(req) {
    const origin = req.headers.origin;
    const headers = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    if (origin && originAllowed(origin)) headers["Access-Control-Allow-Origin"] = origin;
    return headers;
  }

  const httpServer = createServer((req, res) => {
    // Tiny health check for hosting platforms (PLAT-27).
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain", ...corsHeaders(req) });
      res.end("ok");
      return;
    }
    // Also handle preflight requests if needed
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: {
      // A predicate rather than a list, so the default policy can accept any
      // localhost/LAN port without enumerating them.
      origin: (origin, callback) => callback(null, originAllowed(origin)),
      methods: ["GET", "POST"],
    },
    // Socket.io defaults to 1 MB per message. The largest thing a real
    // client sends is a movement snapshot with a few piggybacked shots —
    // single-digit KB — and every one of those is fanned out to the rest of
    // the room, so the default let one sender multiply megabytes (#142).
    maxHttpBufferSize: MAX_SNAPSHOT_BYTES,
  });

  const rooms = new Map(); // code -> { players: Map<socketId, player> }

  function leave(socket) {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    socket.data.roomCode = null;
    if (!room) return;
    const wasHost = room.hostId === socket.id;
    room.players.delete(socket.id);
    socket.leave(code);
    if (room.players.size === 0) {
      big2OnRoomClosed(room); // stop any pending bot timer
      rooms.delete(code); // empty rooms disappear
      return;
    }
    io.to(code).emit("playerLeft", { id: socket.id });
    // Promote the next player to host if the host left (PLAT-30).
    if (wasHost) {
      room.hostId = room.players.keys().next().value;
      io.to(code).emit("hostChanged", { hostId: room.hostId });
    }
    // A Big 2 seat left mid-game: a bot takes it over (KAN-63).
    big2OnLeave(io, code, room, socket.id);
  }

  function join(socket, room, code, { name, emoji, avatar }) {
    // A stable, monotonic slot per room drives the fanned-out spawn so
    // players don't stack on the start point (never reused, so leaves
    // don't shuffle anyone).
    const slot = room.nextSlot++;
    const player = {
      id: socket.id,
      name: (name || "Player").slice(0, 16),
      emoji: typeof emoji === "string" ? emoji.slice(0, 4) : "",
      avatar: Number.isInteger(avatar) ? avatar : 0,
      slot,
      level: 0,
      runTimeMs: 0,
      finished: false,
    };
    room.players.set(socket.id, player);
    socket.data.roomCode = code;
    socket.join(code);
    return player;
  }

  io.on("connection", (socket) => {
    // Server-authoritative Big 2 events (KAN-63) live in big2.js.
    attachBig2(io, rooms, socket);

    socket.on("createRoom", (payload = {}, ack) => {
      // Errors here reach the player verbatim — every lobby renders res.error
      // straight into its own error line — so they are written as sentences.
      if (!withinRate(socket, "_roomActionBucket", ROOM_ACTIONS_PER_SEC, ROOM_ACTIONS_BURST)) {
        ack?.({ ok: false, error: "Too many attempts — wait a moment and try again." });
        return;
      }
      // Leave whatever room this socket is already in first (#140). join()
      // overwrites socket.data.roomCode, and leave() only ever cleans up the
      // room that pointer names — so without this the old room keeps a
      // phantom player, never reaches players.size === 0, and is therefore
      // never deleted. It outlives every socket that touched it.
      // Leaving before makeCode also frees the old code for reuse.
      leave(socket);
      // Checked after the leave, so a player who was the last member of their
      // previous room frees a slot for the one they are about to open.
      if (rooms.size >= maxRooms) {
        ack?.({ ok: false, error: "The server is at capacity — try again in a minute." });
        return;
      }
      const code = makeCode(rooms);
      if (code === null) {
        ack?.({ ok: false, error: "Could not allocate a room code — try again." });
        return;
      }
      // Rooms carry a game tag and their own player cap (#79): the
      // invasion shooter creates 2-player rooms on the same relay the
      // platformer uses. Platformer clients send neither field, so the
      // defaults (no tag, cap MAX_PLAYERS) keep old behavior.
      const maxPlayers = Number.isInteger(payload.maxPlayers)
        ? Math.max(2, Math.min(payload.maxPlayers, MAX_PLAYERS))
        : MAX_PLAYERS;
      const game = typeof payload.game === "string" ? payload.game : "";
      // The creator is the host (PLAT-30).
      const room = { players: new Map(), nextSlot: 0, hostId: socket.id, deadEnemies: new Set(), catchUpShields: false, maxPlayers, game };
      rooms.set(code, room);
      join(socket, room, code, payload);
      ack?.({ ok: true, code, playerId: socket.id, hostId: room.hostId, roster: roster(room), deadEnemies: Array.from(room.deadEnemies), catchUpShields: room.catchUpShields });
    });

    socket.on("joinRoom", (payload = {}, ack) => {
      if (!withinRate(socket, "_roomActionBucket", ROOM_ACTIONS_PER_SEC, ROOM_ACTIONS_BURST)) {
        ack?.({ ok: false, error: "Too many attempts — wait a moment and try again." });
        return;
      }
      const code = String(payload.code || "").toUpperCase();
      const room = rooms.get(code);
      // A cross-game code collision reads as "not found" — to a
      // platformer player, an invasion room's code isn't a real room.
      if (!room || room.game !== (typeof payload.game === "string" ? payload.game : "")) {
        ack?.({ ok: false, error: "Room not found" });
        return;
      }
      if (room.players.size >= room.maxPlayers) {
        ack?.({ ok: false, error: "Room is full" });
        return;
      }
      // Same as createRoom (#140) — but only after the checks above have
      // passed, so a failed join doesn't evict the player from the room they
      // are already in. Skipped when re-joining the current room: leave()
      // would delete it if they were its last member, and `room` would then
      // be an object no longer in `rooms`.
      if (socket.data.roomCode && socket.data.roomCode !== code) leave(socket);
      const player = join(socket, room, code, payload);
      ack?.({ ok: true, code, playerId: socket.id, hostId: room.hostId, roster: roster(room), deadEnemies: Array.from(room.deadEnemies), catchUpShields: room.catchUpShields });
      // Tell everyone else who joined.
      socket.to(code).emit("playerJoined", {
        id: player.id, name: player.name, emoji: player.emoji, avatar: player.avatar, slot: player.slot,
      });
    });

    // Avatar changed in the room lobby (after join): update the room
    // record and tell everyone, so rosters and ghosts stay in sync.
    socket.on("setAvatar", ({ avatar } = {}) => {
      const code = socket.data.roomCode;
      const player = code && rooms.get(code)?.players.get(socket.id);
      if (!player || !Number.isInteger(avatar)) return;
      player.avatar = avatar;
      io.to(code).emit("playerUpdated", { id: socket.id, avatar });
    });

    socket.on("enemyKilled", ({ enemyId } = {}) => {
      const code = socket.data.roomCode;
      const room = rooms.get(code);
      if (!room) return;
      // Clearing a wave kills a burst of enemies at once, so the bucket is
      // sized for that rather than for a steady trickle.
      if (!withinRate(socket, "_enemyKillBucket", 60, 60)) return;
      const id = sanitizeEnemyId(enemyId);
      if (!id) return;
      // The set is serialised into every later join ack, so an unbounded one
      // grows the room's memory and everyone's join payload (#142).
      if (room.deadEnemies.size >= MAX_DEAD_ENEMIES && !room.deadEnemies.has(id)) return;
      room.deadEnemies.add(id);
      socket.to(code).emit("enemyKilled", id);
    });

    socket.on("setCatchUpShields", (enabled) => {
      const code = socket.data.roomCode;
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      room.catchUpShields = Boolean(enabled);
      io.to(code).emit("catchUpShieldsUpdated", room.catchUpShields);
    });

    // Name changed in the room lobby: same deal as setAvatar, with the
    // same sanitization as join().
    socket.on("setName", ({ name, emoji } = {}) => {
      const code = socket.data.roomCode;
      const player = code && rooms.get(code)?.players.get(socket.id);
      if (!player) return;
      if (typeof name === "string") player.name = (name.trim() || "Player").slice(0, 16);
      if (typeof emoji === "string") player.emoji = emoji.slice(0, 4);
      io.to(code).emit("playerUpdated", { id: socket.id, name: player.name, emoji: player.emoji });
    });

    // Host-only synced start: broadcast a countdown to the whole room so
    // everyone drops into level 1 together (PLAT-30). A duration (not an
    // absolute timestamp) sidesteps cross-device clock skew.
    socket.on("startRace", () => {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      // Reset per-player race state for a fresh run.
      for (const p of room.players.values()) {
        p.level = 0;
        p.runTimeMs = 0;
        p.finished = false;
      }
      // A fresh shared seed each race (#81): both clients seed their
      // RNG with it so alien spawns and power-up drops match. Also
      // clears the room's dead-enemy set so a rematch starts clean.
      room.deadEnemies.clear();
      const seed = (Math.random() * 0x100000000) >>> 0;
      io.to(code).emit("raceStart", { countdownMs: COUNTDOWN_MS, seed });
    });

    // Rebuilt from a known field list before it goes anywhere (#142). The
    // rate is enforced here too: the client throttles itself to ~15 Hz, but
    // that is the client's choice, and this is the one message the relay
    // amplifies to every other socket in the room.
    socket.on("state", (snap = {}) => {
      const code = socket.data.roomCode;
      if (!code) return;
      if (!withinRate(socket, "_stateBucket", 30, 15)) return;
      const clean = sanitizeSnapshot(snap);
      const room = rooms.get(code);
      const player = room?.players.get(socket.id);
      if (player) {
        // These three are read back by the whole room through `roster`, so
        // they have to be the coerced values, not whatever arrived.
        if (clean.level !== undefined) player.level = clean.level;
        if (clean.runTimeMs !== undefined) player.runTimeMs = clean.runTimeMs;
        if (clean.finished !== undefined) player.finished = clean.finished;
      }
      socket.to(code).emit("remoteState", { ...clean, id: socket.id });
    });

    socket.on("finished", ({ totalTimeMs } = {}) => {
      const code = socket.data.roomCode;
      if (!code) return;
      // Same field, same coercion as the snapshot path — a run time that is
      // not a number ends up in the roster and on everyone's scoreboard.
      const total = Number.isFinite(totalTimeMs) ? totalTimeMs : undefined;
      const player = rooms.get(code)?.players.get(socket.id);
      if (player) {
        player.finished = true;
        if (total !== undefined) player.runTimeMs = total;
      }
      io.to(code).emit("playerFinished", { id: socket.id, totalTimeMs: total });
    });

    socket.on("leaveRoom", () => leave(socket));
    socket.on("disconnect", () => leave(socket));
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      resolve({
        io,
        httpServer,
        rooms,
        port: httpServer.address().port,
        close: () =>
          new Promise((done) => {
            io.close();
            httpServer.close(done);
          }),
      });
    });
  });
}
