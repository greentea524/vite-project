// Room lifecycle on the relay (#140).
//
// The bug these guard: join() overwrites socket.data.roomCode and leave()
// only ever cleans up the room that pointer names, so a socket that moved
// between rooms stayed listed in the old one forever. Rooms are deleted only
// when players.size hits zero, so such a room could never be collected — the
// relay's memory grew monotonically for the life of the process.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { createRelayServer } from "./relay.js";

let server, url;

beforeAll(async () => {
  server = await createRelayServer({ port: 0 });
  url = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

function connect() {
  const socket = ioClient(url, { transports: ["websocket"] });
  return new Promise((resolve) => socket.on("connect", () => resolve(socket)));
}

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

// Disconnects are asynchronous server-side; wait for the relay to notice.
function settle(ms = 120) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("relay room lifecycle", () => {
  it("frees every room once all sockets disconnect", async () => {
    const a = await connect();
    const { code } = await emit(a, "createRoom", {});
    const b = await connect();
    await emit(b, "joinRoom", { code });
    expect(server.rooms.get(code).players.size).toBe(2);

    a.disconnect();
    b.disconnect();
    await settle();
    expect(server.rooms.has(code)).toBe(false);
  });

  it("removes a socket from its old room when it creates another", async () => {
    const a = await connect();
    const first = await emit(a, "createRoom", {});
    const b = await connect();
    await emit(b, "joinRoom", { code: first.code });

    // b abandons the first room by creating its own.
    const second = await emit(b, "createRoom", {});
    expect(second.code).not.toBe(first.code);
    expect(server.rooms.get(first.code).players.has(b.id)).toBe(false);
    expect(server.rooms.get(first.code).players.size).toBe(1);

    a.disconnect();
    b.disconnect();
    await settle();
    expect(server.rooms.has(first.code)).toBe(false);
    expect(server.rooms.has(second.code)).toBe(false);
  });

  it("removes a socket from its old room when it joins another", async () => {
    const a = await connect();
    const first = await emit(a, "createRoom", {});
    const b = await connect();
    const second = await emit(b, "createRoom", {});

    // a hops from its own room into b's.
    const res = await emit(a, "joinRoom", { code: second.code });
    expect(res.ok).toBe(true);
    expect(server.rooms.has(first.code)).toBe(false); // emptied, so collected
    expect(server.rooms.get(second.code).players.size).toBe(2);

    a.disconnect();
    b.disconnect();
    await settle();
    expect(server.rooms.size).toBe(0);
  });

  it("holds no rooms after a socket creates many of them", async () => {
    const before = server.rooms.size;
    const c = await connect();
    for (let i = 0; i < 50; i++) await emit(c, "createRoom", {});
    // Only the most recent room survives each hop, so one is live at a time.
    expect(server.rooms.size).toBe(before + 1);

    c.disconnect();
    await settle();
    expect(server.rooms.size).toBe(before);
  });

  it("tells the old room the player left, and promotes a new host", async () => {
    const host = await connect();
    const { code } = await emit(host, "createRoom", {});
    const guest = await connect();
    await emit(guest, "joinRoom", { code });

    const sawHostChange = new Promise((r) => guest.on("hostChanged", r));
    const sawLeft = new Promise((r) => guest.on("playerLeft", r));
    await emit(host, "createRoom", {}); // host walks out

    expect((await sawLeft).id).toBe(host.id);
    expect((await sawHostChange).hostId).toBe(guest.id);

    host.disconnect();
    guest.disconnect();
    await settle();
  });

  it("does not evict a player from their room when a join fails", async () => {
    const a = await connect();
    const { code } = await emit(a, "createRoom", {});

    const missing = await emit(a, "joinRoom", { code: "ZZZZ" });
    expect(missing.ok).toBe(false);
    // Still where they were.
    expect(server.rooms.get(code).players.has(a.id)).toBe(true);

    a.disconnect();
    await settle();
  });

  it("survives re-joining the room it is already in", async () => {
    const a = await connect();
    const { code } = await emit(a, "createRoom", {});

    // Leaving first here would delete the room (a is its only member) and
    // then re-add a to an object no longer in `rooms`.
    const again = await emit(a, "joinRoom", { code });
    expect(again.ok).toBe(true);
    expect(server.rooms.has(code)).toBe(true);
    expect(server.rooms.get(code).players.size).toBe(1);

    a.disconnect();
    await settle();
    expect(server.rooms.has(code)).toBe(false);
  });
});
