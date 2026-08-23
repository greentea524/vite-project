// Room allocation limits on the relay (#141).
//
// The relay is public and unauthenticated on a free-tier host. Before this,
// every client-triggered allocation was unbounded: 300 sockets made 301
// rooms, and one socket managed 200 create-and-leave cycles in 90ms — pure
// code generation and room churn on the event loop.
//
// The per-socket concurrent cap the issue asked for turned out to already be
// satisfied: since #140 a socket leaves its current room before entering
// another, so it is structurally in exactly one. That is pinned below rather
// than reimplemented.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { createRelayServer, MAX_ROOMS } from "./relay.js";

const sockets = [];

function connect(url) {
  const socket = ioClient(url, { transports: ["websocket"] });
  sockets.push(socket);
  return new Promise((resolve) => socket.on("connect", () => resolve(socket)));
}

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

afterAll(() => {
  for (const socket of sockets) socket.disconnect();
});

describe("a socket only ever holds one room", () => {
  let server, url;
  beforeAll(async () => {
    server = await createRelayServer({ port: 0 });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => await server.close());

  it("does not accumulate rooms however many it creates", async () => {
    const socket = await connect(url);
    for (let i = 0; i < 8; i++) await emit(socket, "createRoom", {});
    const held = [...server.rooms.values()].filter((r) => r.players.has(socket.id));
    expect(held).toHaveLength(1);
    expect(server.rooms.size).toBe(1);
  });
});

describe("server-wide room cap", () => {
  let server, url;
  // Three rooms rather than the real 200, so the cap is reachable in a test
  // without opening 200 sockets.
  beforeAll(async () => {
    server = await createRelayServer({ port: 0, maxRooms: 3 });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => await server.close());

  it("refuses a new room past the cap, with a message a player can read", async () => {
    for (let i = 0; i < 3; i++) {
      const socket = await connect(url);
      const res = await emit(socket, "createRoom", {});
      expect(res.ok).toBe(true);
    }
    expect(server.rooms.size).toBe(3);

    const extra = await connect(url);
    const refused = await emit(extra, "createRoom", {});
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/capacity/i);
    expect(server.rooms.size).toBe(3);
  });

  it("still lets a player join an existing room when full", async () => {
    // The cap is on allocation, not on play — a full server must not stop
    // people joining the games that are already running.
    const code = [...server.rooms.keys()][0];
    const guest = await connect(url);
    const res = await emit(guest, "joinRoom", { code });
    expect(res.ok).toBe(true);
  });

  it("frees a slot when the last member of a room leaves", async () => {
    // The cap is checked after leave(), so a player who was alone in their
    // room can always open a new one — they are net-neutral on occupancy.
    const holder = [...server.rooms.values()].find((r) => r.players.size === 1);
    const holderId = [...holder.players.keys()][0];
    const socket = sockets.find((s) => s.id === holderId);
    expect(server.rooms.size).toBe(3);

    const res = await emit(socket, "createRoom", {});
    expect(res.ok).toBe(true);
    expect(server.rooms.size).toBe(3);
  });
});

describe("room-lifecycle rate limiting", () => {
  let server, url;
  beforeAll(async () => {
    server = await createRelayServer({ port: 0 });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => await server.close());

  it("throttles a createRoom flood", async () => {
    const socket = await connect(url);
    const results = [];
    for (let i = 0; i < 40; i++) results.push(await emit(socket, "createRoom", {}));
    const accepted = results.filter((r) => r.ok).length;
    const refused = results.filter((r) => !r.ok);

    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(20); // burst 10, refilling at 5/s
    expect(refused[0].error).toMatch(/too many attempts/i);
  });

  it("throttles a joinRoom flood", async () => {
    const host = await connect(url);
    const { code } = await emit(host, "createRoom", {});
    const guest = await connect(url);

    const results = [];
    for (let i = 0; i < 40; i++) results.push(await emit(guest, "joinRoom", { code }));
    const refused = results.filter((r) => !r.ok && /too many attempts/i.test(r.error ?? ""));
    expect(refused.length).toBeGreaterThan(0);
  });

  it("never throttles a normal host-and-join", async () => {
    const host = await connect(url);
    const created = await emit(host, "createRoom", {});
    expect(created.ok).toBe(true);

    const guest = await connect(url);
    const joined = await emit(guest, "joinRoom", { code: created.code });
    expect(joined.ok).toBe(true);
    expect(joined.roster).toHaveLength(2);
  });

  it("budgets each socket separately", async () => {
    // One noisy client must not lock anyone else out.
    const noisy = await connect(url);
    for (let i = 0; i < 40; i++) await emit(noisy, "createRoom", {});

    const bystander = await connect(url);
    const res = await emit(bystander, "createRoom", {});
    expect(res.ok).toBe(true);
  });
});

describe("MAX_ROOMS", () => {
  it("stays far below the room-code space so allocation cannot spin", () => {
    // 32^4 codes. makeCode retries on collision; the cap is what keeps the
    // occupancy ratio negligible, and its retry loop is bounded regardless.
    const codeSpace = 32 ** 4;
    expect(MAX_ROOMS / codeSpace).toBeLessThan(0.001);
  });
});
