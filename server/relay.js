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

function makeCode(taken) {
  let code;
  do {
    code = Array.from({ length: CODE_LEN }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join("");
  } while (taken.has(code));
  return code;
}

// Public roster shape sent to clients.
function roster(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    slot: p.slot,
    level: p.level,
    runTimeMs: p.runTimeMs,
    finished: p.finished,
  }));
}

export function createRelayServer({ port = 0, allowedOrigins } = {}) {
  const httpServer = createServer((req, res) => {
    // Tiny health check for hosting platforms (PLAT-27).
    if (req.url === "/health") {
      res.writeHead(200, {
        "content-type": "text/plain",
        "Access-Control-Allow-Origin": req.headers.origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end("ok");
      return;
    }
    // Also handle preflight requests if needed
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": req.headers.origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins ?? "*", methods: ["GET", "POST"] },
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

  function join(socket, room, code, { name, avatar }) {
    // A stable, monotonic slot per room drives the fanned-out spawn so
    // players don't stack on the start point (never reused, so leaves
    // don't shuffle anyone).
    const slot = room.nextSlot++;
    const player = {
      id: socket.id,
      name: (name || "Player").slice(0, 16),
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
      const code = makeCode(rooms);
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
      const player = join(socket, room, code, payload);
      ack?.({ ok: true, code, playerId: socket.id, hostId: room.hostId, roster: roster(room), deadEnemies: Array.from(room.deadEnemies), catchUpShields: room.catchUpShields });
      // Tell everyone else who joined.
      socket.to(code).emit("playerJoined", {
        id: player.id, name: player.name, avatar: player.avatar, slot: player.slot,
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
      if (!room || !enemyId) return;
      room.deadEnemies.add(enemyId);
      socket.to(code).emit("enemyKilled", enemyId);
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
    socket.on("setName", ({ name } = {}) => {
      const code = socket.data.roomCode;
      const player = code && rooms.get(code)?.players.get(socket.id);
      if (!player || typeof name !== "string") return;
      player.name = (name.trim() || "Player").slice(0, 16);
      io.to(code).emit("playerUpdated", { id: socket.id, name: player.name });
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

    // Relayed as-is to the rest of the room; the client controls send rate.
    socket.on("state", (snap = {}) => {
      const code = socket.data.roomCode;
      if (!code) return;
      const room = rooms.get(code);
      const player = room?.players.get(socket.id);
      if (player) {
        player.level = snap.level ?? player.level;
        player.runTimeMs = snap.runTimeMs ?? player.runTimeMs;
        player.finished = snap.finished ?? player.finished;
      }
      socket.to(code).emit("remoteState", { ...snap, id: socket.id });
    });

    socket.on("finished", ({ totalTimeMs } = {}) => {
      const code = socket.data.roomCode;
      if (!code) return;
      const player = rooms.get(code)?.players.get(socket.id);
      if (player) {
        player.finished = true;
        player.runTimeMs = totalTimeMs ?? player.runTimeMs;
      }
      io.to(code).emit("playerFinished", { id: socket.id, totalTimeMs });
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
