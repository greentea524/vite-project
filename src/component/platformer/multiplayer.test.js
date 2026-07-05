// Multiplayer tests: the relay server driven by real Network clients
// over an in-process socket.io server (PLAT-20/21 acceptance), plus the
// pure ghost-interpolation logic (PLAT-22).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRelayServer, MAX_PLAYERS } from "../../../server/relay.js";
import { Network, isLocalNetworkHost, MAX_PLAYERS as CLIENT_MAX } from "./network.js";
import { createGhost, pushSnapshot, sampleGhost } from "./ghosts.js";

describe("isLocalNetworkHost", () => {
  it("allows localhost and private LAN addresses", () => {
    for (const h of ["localhost", "127.0.0.1", "::1", "0.0.0.0", "dev.local",
      "192.168.0.21", "192.168.1.100", "10.0.0.5", "172.16.3.4", "172.31.255.1"]) {
      expect(isLocalNetworkHost(h)).toBe(true);
    }
  });
  it("rejects public hosts", () => {
    for (const h of ["greentea524.github.io", "example.com", "8.8.8.8",
      "172.15.0.1", "172.32.0.1", "11.0.0.1", ""]) {
      expect(isLocalNetworkHost(h)).toBe(false);
    }
  });
});

// Resolve when `event` fires on the network, or reject after timeout.
function once(net, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    const off = net.on(event, (payload) => {
      clearTimeout(timer);
      off();
      resolve(payload);
    });
  });
}

function connected(net, url) {
  const p = once(net, "connected");
  net.connect(url);
  return p;
}

describe("relay server + network client", () => {
  let server, url;

  beforeAll(async () => {
    server = await createRelayServer({ port: 0 });
    url = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates a room and a second client joins by code", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);

    const created = await host.createRoom("Alice", 0);
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(host.roster).toHaveLength(1);

    const hostSawJoin = once(host, "playerJoined");
    const joined = await guest.joinRoom(created.code, "Bob", 2);
    expect(joined.ok).toBe(true);
    expect(joined.roster).toHaveLength(2);
    const j = await hostSawJoin;
    expect(j.name).toBe("Bob");
    expect(j.avatar).toBe(2);

    host.destroy();
    guest.destroy();
  });

  it(`caps a room at ${MAX_PLAYERS} players and rejects one more`, async () => {
    // The client constant must mirror the server cap (PG-57).
    expect(CLIENT_MAX).toBe(MAX_PLAYERS);

    const host = new Network();
    await connected(host, url);
    const { code } = await host.createRoom("Host", 0);

    const guests = [];
    // Guests fill the room to the cap.
    for (let i = 0; i < MAX_PLAYERS - 1; i++) {
      const g = new Network();
      await connected(g, url);
      const res = await g.joinRoom(code, `G${i}`, 0);
      expect(res.ok).toBe(true);
      guests.push(g);
    }

    const extra = new Network();
    await connected(extra, url);
    const res = await extra.joinRoom(code, "TooMany", 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/full/i);

    host.destroy();
    extra.destroy();
    guests.forEach((g) => g.destroy());
  });

  it("rejects joining an unknown room code", async () => {
    const c = new Network();
    await connected(c, url);
    const res = await c.joinRoom("ZZZZ", "Nobody", 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
    c.destroy();
  });

  it("relays state snapshots to other players in the room", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Alice", 0);
    await guest.joinRoom(code, "Bob", 1);

    const gotState = once(guest, "remoteState");
    host.sendState({ x: 42, y: 7, facing: -1, anim: "run", level: 1, runTimeMs: 1234 }, true);
    const snap = await gotState;
    expect(snap.id).toBe(host.playerId);
    expect(snap.x).toBe(42);
    expect(snap.level).toBe(1);

    host.destroy();
    guest.destroy();
  });

  it("broadcasts finish and marks the roster", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Alice", 0);
    await guest.joinRoom(code, "Bob", 1);

    const gotFinish = once(guest, "playerFinished");
    host.sendFinished(9999);
    const info = await gotFinish;
    expect(info.id).toBe(host.playerId);
    expect(info.totalTimeMs).toBe(9999);

    host.destroy();
    guest.destroy();
  });

  it("removes a player from the roster when they leave", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Alice", 0);
    await guest.joinRoom(code, "Bob", 1);

    const hostSawLeave = once(host, "playerLeft");
    guest.leave();
    const left = await hostSawLeave;
    expect(left.id).toBe(guest.playerId);

    host.destroy();
    guest.destroy();
  });

  it("marks the creator as host and joiners as non-host (PLAT-30)", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const c = await host.createRoom("H", 0);
    expect(host.isHost).toBe(true);
    expect(host.hostId).toBe(host.playerId);
    await guest.joinRoom(c.code, "G", 0);
    expect(guest.isHost).toBe(false);
    expect(guest.hostId).toBe(host.playerId);
    host.destroy();
    guest.destroy();
  });

  it("host startRace broadcasts a countdown to everyone; non-host is ignored (PLAT-30)", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("H", 0);
    await guest.joinRoom(code, "G", 0);

    // Non-host start does nothing.
    let fired = false;
    const offHost = host.on("raceStart", () => (fired = true));
    guest.startRace();
    await new Promise((r) => setTimeout(r, 150));
    expect(fired).toBe(false);
    offHost();

    // Host start reaches both players.
    const hostStart = once(host, "raceStart");
    const guestStart = once(guest, "raceStart");
    host.startRace();
    const [h, g] = await Promise.all([hostStart, guestStart]);
    expect(h.countdownMs).toBeGreaterThan(0);
    expect(g.countdownMs).toBeGreaterThan(0);

    host.destroy();
    guest.destroy();
  });

  it("promotes a new host when the host leaves (PLAT-30)", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("H", 0);
    await guest.joinRoom(code, "G", 0);

    const promoted = once(guest, "hostChanged");
    host.leave();
    const info = await promoted;
    expect(info.hostId).toBe(guest.playerId);

    guest.destroy();
    host.destroy();
  });
});

describe("ghost interpolation", () => {
  it("returns null before any snapshot, then the first once present", () => {
    const g = createGhost({ id: "x", name: "Bob", avatar: 1 });
    expect(sampleGhost(g, 1000)).toBeNull();
    pushSnapshot(g, { x: 10, y: 5, facing: -1, anim: "run", level: 2 }, 1000);
    const v = sampleGhost(g, 1000);
    expect(v).toMatchObject({ x: 10, y: 5, facing: -1, anim: "run", level: 2, name: "Bob", avatar: 1 });
  });

  it("interpolates position between two snapshots at the delayed render time", () => {
    const g = createGhost({ id: "x" });
    // snapshots 100ms apart; render delay is 100ms
    pushSnapshot(g, { x: 0, y: 0 }, 1000);
    pushSnapshot(g, { x: 100, y: 40 }, 1100);
    // now = 1200 -> renderT = 1100 -> exactly the second snapshot
    expect(sampleGhost(g, 1200)).toMatchObject({ x: 100, y: 40 });
    // now = 1150 -> renderT = 1050 -> halfway between the two
    const mid = sampleGhost(g, 1150);
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.y).toBeCloseTo(20, 5);
  });

  it("holds the last position when render time is ahead and no velocity is known", () => {
    const g = createGhost({ id: "x" });
    pushSnapshot(g, { x: 0, y: 0 }, 1000);
    pushSnapshot(g, { x: 100, y: 0 }, 1100); // no vx -> extrapolation adds 0
    expect(sampleGhost(g, 5000).x).toBe(100);
  });

  it("extrapolates along velocity through a late packet, capped (PLAT-28)", () => {
    const g = createGhost({ id: "x" });
    pushSnapshot(g, { x: 0, y: 0, vx: 100 }, 1000);
    pushSnapshot(g, { x: 10, y: 0, vx: 100 }, 1100); // moving right at 100 px/s
    // now=1250 -> renderT=1150 -> 50ms past last -> 10 + 100*0.05 = 15
    expect(sampleGhost(g, 1250).x).toBeCloseTo(15, 5);
    // far ahead -> capped at MAX_EXTRAPOLATE_MS (200ms) -> 10 + 100*0.2 = 30
    expect(sampleGhost(g, 9000).x).toBeCloseTo(30, 5);
  });
});
