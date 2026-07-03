// Ghost-race relay server (PLAT-20). A dumb Socket.io relay: it owns
// rooms and broadcasts player state, with no game logic and no
// authority. Rooms are in-memory and vanish when empty (no database).
//
// createRelayServer() returns a started server plus a close() helper so
// tests can run it on an ephemeral port; index.js uses it for the real
// process.

import { createServer } from "node:http";
import { Server } from "socket.io";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars
const CODE_LEN = 4;

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
    level: p.level,
    runTimeMs: p.runTimeMs,
    finished: p.finished,
  }));
}

export function createRelayServer({ port = 0, allowedOrigins } = {}) {
  const httpServer = createServer((req, res) => {
    // Tiny health check for hosting platforms (PLAT-27).
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
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
    room.players.delete(socket.id);
    socket.leave(code);
    if (room.players.size === 0) {
      rooms.delete(code); // empty rooms disappear
    } else {
      io.to(code).emit("playerLeft", { id: socket.id });
    }
  }

  function join(socket, room, code, { name, avatar }) {
    const player = {
      id: socket.id,
      name: (name || "Player").slice(0, 16),
      avatar: Number.isInteger(avatar) ? avatar : 0,
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
    socket.on("createRoom", (payload = {}, ack) => {
      const code = makeCode(rooms);
      const room = { players: new Map() };
      rooms.set(code, room);
      join(socket, room, code, payload);
      ack?.({ ok: true, code, playerId: socket.id, roster: roster(room) });
    });

    socket.on("joinRoom", (payload = {}, ack) => {
      const code = String(payload.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ack?.({ ok: false, error: "Room not found" });
        return;
      }
      const player = join(socket, room, code, payload);
      ack?.({ ok: true, code, playerId: socket.id, roster: roster(room) });
      // Tell everyone else who joined.
      socket.to(code).emit("playerJoined", {
        id: player.id, name: player.name, avatar: player.avatar,
      });
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
