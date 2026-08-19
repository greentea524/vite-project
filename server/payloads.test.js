// Relay payload validation (#142).
//
// The relay is public and unauthenticated. `state` used to be stored and
// rebroadcast verbatim — one sender's message fanned out to every other
// socket in the room, at whatever rate and size they chose, with fields the
// whole room reads back typed however they liked. `enemyKilled` appended an
// unchecked id to a set that only ever grew.
//
// The first test is the one that matters most: an allowlist is only correct
// if nothing real falls off it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import {
  createRelayServer,
  sanitizeSnapshot,
  sanitizeEnemyId,
  MAX_DEAD_ENEMIES,
} from "./relay.js";

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

function next(socket, event, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout on ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// A host and a guest sharing a room, so relayed messages have somewhere to go.
async function pair() {
  const host = await connect();
  const { code } = await emit(host, "createRoom", {});
  const guest = await connect();
  await emit(guest, "joinRoom", { code });
  return { host, guest, code };
}

describe("snapshot fidelity", () => {
  // The exact object src/component/platformer/game.js builds.
  const platformerSnapshot = {
    x: 120.5, y: 64, vx: -3.25, facing: -1, anim: "run",
    avatar: 3, name: "Alice", level: 2, runTimeMs: 12345,
  };

  // The exact object src/component/invasion/engine.js builds, in its
  // fullest form: terminal snapshot with piggybacked shots and boss damage.
  const invasionSnapshot = {
    x: 380.25, y: 540, vx: -120, over: true, shipType: "interceptor",
    score: 4200, isFiring: true, hits: 37, bestCombo: 12, bestMultiplier: 5,
    shots: [
      { x: 100, y: 20, vx: 0, isLaser: false, isHoming: false },
      { x: 110, y: 20, vx: -2, isLaser: true, isHoming: false },
      { x: 120, y: 20, vx: 2, isLaser: false, isHoming: true },
    ],
    bossDamage: { "w2-boss": 40, "w2-boss.1": 15 },
  };

  it("relays every field the platformer sends", async () => {
    const { host, guest } = await pair();
    const arrived = next(guest, "remoteState");
    host.emit("state", platformerSnapshot);
    const got = await arrived;
    expect(got).toEqual({ ...platformerSnapshot, id: host.id });
    host.disconnect();
    guest.disconnect();
  });

  it("relays every field the invasion shooter sends", async () => {
    const { host, guest } = await pair();
    const arrived = next(guest, "remoteState");
    host.emit("state", invasionSnapshot);
    const got = await arrived;
    expect(got).toEqual({ ...invasionSnapshot, id: host.id });
    host.disconnect();
    guest.disconnect();
  });

  it("keeps absent fields absent so client-side defaults still apply", () => {
    // sampleGhost reads `snap.facing ?? 1` and `snap.anim ?? "idle"`; a key
    // present-but-undefined would defeat neither, but a key present-and-null
    // would, so nothing unspecified may be invented.
    expect(sanitizeSnapshot({ x: 1 })).toEqual({ x: 1 });
  });
});

describe("snapshot validation", () => {
  it("drops fields that are not part of the protocol", () => {
    const out = sanitizeSnapshot({ x: 1, junk: "x".repeat(200_000), nested: { a: 1 } });
    expect(out).toEqual({ x: 1 });
  });

  it("refuses non-numeric values for numeric fields", () => {
    const out = sanitizeSnapshot({ level: "not-a-number", runTimeMs: NaN, x: Infinity });
    expect(out).toEqual({});
  });

  it("coerces flags to real booleans", () => {
    expect(sanitizeSnapshot({ over: "yes", finished: 1, isFiring: true }))
      .toEqual({ over: false, finished: false, isFiring: true });
  });

  it("caps strings", () => {
    const out = sanitizeSnapshot({ name: "N".repeat(100), anim: "A".repeat(100) });
    expect(out.name).toHaveLength(16);
    expect(out.anim).toHaveLength(24);
  });

  it("bounds the piggybacked shot list", () => {
    const shots = Array.from({ length: 500 }, (_, i) => ({ x: i, y: 0, vx: 0 }));
    expect(sanitizeSnapshot({ shots }).shots).toHaveLength(32);
  });

  it("bounds the boss damage map and its keys", () => {
    const bossDamage = {};
    for (let i = 0; i < 100; i++) bossDamage[`b${i}`.padEnd(200, "x")] = i;
    const out = sanitizeSnapshot({ bossDamage });
    expect(Object.keys(out.bossDamage)).toHaveLength(8);
    for (const key of Object.keys(out.bossDamage)) expect(key.length).toBeLessThanOrEqual(64);
  });

  it("survives a payload that is not an object", () => {
    expect(sanitizeSnapshot(null)).toEqual({});
    expect(sanitizeSnapshot("nope")).toEqual({});
  });
});

describe("relayed payloads are bounded end to end", () => {
  it("strips junk from an oversized-but-deliverable message", async () => {
    // Under the transport cap, so this exercises the allowlist rather than
    // maxHttpBufferSize: 10 KB in, a handful of bytes out.
    const { host, guest } = await pair();
    const arrived = next(guest, "remoteState");
    host.emit("state", { x: 1, junk: "x".repeat(10_000) });
    const got = await arrived;
    expect(got).toEqual({ x: 1, id: host.id });
    expect(JSON.stringify(got).length).toBeLessThan(200);
    host.disconnect();
    guest.disconnect();
  });

  it("refuses a message past the transport cap instead of fanning it out", async () => {
    // 200 KB was relayed verbatim to every other socket in the room before
    // maxHttpBufferSize was set. Now the connection is closed and nothing is
    // broadcast at all — the amplification never gets a chance to happen.
    const { host, guest } = await pair();
    let relayed = 0;
    guest.on("remoteState", () => relayed++);
    const closed = new Promise((resolve) => host.once("disconnect", resolve));

    host.emit("state", { x: 1, junk: "x".repeat(200_000) });
    await closed;
    await new Promise((r) => setTimeout(r, 100));

    expect(relayed).toBe(0);
    expect(host.connected).toBe(false);
    guest.disconnect();
  });

  it("stores coerced values in the roster, not attacker types", async () => {
    const { host, guest, code } = await pair();
    host.emit("state", { level: "not-a-number", runTimeMs: "soon", finished: "yes" });
    await new Promise((r) => setTimeout(r, 80));
    const player = server.rooms.get(code).players.get(host.id);
    expect(player.level).toBe(0);
    expect(player.runTimeMs).toBe(0);
    expect(player.finished).toBe(false);
    host.disconnect();
    guest.disconnect();
  });

  it("throttles a state flood without dropping a legitimate 15 Hz stream", async () => {
    const { host, guest } = await pair();
    let received = 0;
    guest.on("remoteState", () => received++);

    // 300 snapshots as fast as the socket will take them.
    for (let i = 0; i < 300; i++) host.emit("state", { x: i });
    await new Promise((r) => setTimeout(r, 250));
    expect(received).toBeGreaterThan(0);
    expect(received).toBeLessThan(60); // burst 15 + ~30/s refill over 250ms

    host.disconnect();
    guest.disconnect();
  });

  it("passes a real 15 Hz stream through untouched", async () => {
    const { host, guest } = await pair();
    let received = 0;
    guest.on("remoteState", () => received++);
    // SEND_INTERVAL_MS is 66ms; send ten at that cadence.
    for (let i = 0; i < 10; i++) {
      host.emit("state", { x: i });
      await new Promise((r) => setTimeout(r, 66));
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toBe(10);
    host.disconnect();
    guest.disconnect();
  });
});

describe("enemyKilled", () => {
  it("rejects ids that are not usable strings", () => {
    expect(sanitizeEnemyId("")).toBeNull();
    expect(sanitizeEnemyId(42)).toBeNull();
    expect(sanitizeEnemyId({})).toBeNull();
    expect(sanitizeEnemyId("L3_enemy_7")).toBe("L3_enemy_7");
  });

  it("caps the id length", () => {
    expect(sanitizeEnemyId("e".repeat(500))).toHaveLength(64);
  });

  it("bounds the dead-enemy set, which every join ack carries", async () => {
    const { host, guest, code } = await pair();
    const room = server.rooms.get(code);
    for (let i = 0; i < MAX_DEAD_ENEMIES + 500; i++) {
      host.emit("enemyKilled", { enemyId: `e${i}` });
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(room.deadEnemies.size).toBeLessThanOrEqual(MAX_DEAD_ENEMIES);
    host.disconnect();
    guest.disconnect();
  });

  it("still relays a real kill to the room", async () => {
    const { host, guest } = await pair();
    const arrived = next(guest, "enemyKilled");
    host.emit("enemyKilled", { enemyId: "L3_enemy_7" });
    expect(await arrived).toBe("L3_enemy_7");
    host.disconnect();
    guest.disconnect();
  });
});
