// Invasion multiplayer tests (#79/#80): the shared relay driven by
// real invasion Network clients over an in-process socket.io server —
// two-player rooms, game tagging, synced start, and state relay. The
// platformer client joins in to prove the shared relay stays
// backward compatible.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRelayServer, MAX_PLAYERS as RELAY_MAX } from "../../../server/relay.js";
import { Network, MAX_PLAYERS, GAME_TAG, SEND_INTERVAL_MS } from "./network.js";
import { Network as PlatformerNetwork } from "../platformer/network.js";

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

describe("invasion relay rooms (#79)", () => {
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

    const created = await host.createRoom("Ada");
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(host.isHost).toBe(true);

    const hostSawJoin = once(host, "playerJoined");
    const joined = await guest.joinRoom(created.code, "Bob");
    expect(joined.ok).toBe(true);
    expect(guest.roster).toHaveLength(2);
    expect((await hostSawJoin).name).toBe("Bob");

    host.destroy();
    guest.destroy();
  });

  it(`caps invasion rooms at ${MAX_PLAYERS} players`, async () => {
    expect(MAX_PLAYERS).toBe(2); // head-to-head (#79)

    const host = new Network();
    const guest = new Network();
    const extra = new Network();
    await connected(host, url);
    await connected(guest, url);
    await connected(extra, url);

    const { code } = await host.createRoom("Host");
    expect((await guest.joinRoom(code, "Guest")).ok).toBe(true);
    const res = await extra.joinRoom(code, "TooMany");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/full/i);

    host.destroy();
    guest.destroy();
    extra.destroy();
  });

  it("keeps the default cap for rooms that don't send maxPlayers (platformer regression)", async () => {
    expect(RELAY_MAX).toBeGreaterThan(MAX_PLAYERS);
    const host = new PlatformerNetwork();
    await connected(host, url);
    const { code } = await host.createRoom("PlatHost", 0);

    // A third player would be rejected in an invasion room; here the
    // old cap still applies. The join ack carries the room's roster.
    const guests = [new PlatformerNetwork(), new PlatformerNetwork()];
    let lastJoin;
    for (const [i, g] of guests.entries()) {
      await connected(g, url);
      lastJoin = await g.joinRoom(code, `G${i}`, 0);
      expect(lastJoin.ok).toBe(true);
    }
    expect(lastJoin.roster).toHaveLength(3);

    host.destroy();
    guests.forEach((g) => g.destroy());
  });

  it("rejects cross-game joins as 'not found'", async () => {
    const invasionHost = new Network();
    const platGuest = new PlatformerNetwork();
    await connected(invasionHost, url);
    await connected(platGuest, url);

    // A platformer client can't land in an invasion room...
    const { code } = await invasionHost.createRoom("Inv");
    const res = await platGuest.joinRoom(code, "Plat", 0);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);

    // ...and an invasion client can't land in a platformer room.
    const platHost = new PlatformerNetwork();
    const invGuest = new Network();
    await connected(platHost, url);
    await connected(invGuest, url);
    const platRoom = await platHost.createRoom("PlatHost", 0);
    const res2 = await invGuest.joinRoom(platRoom.code, "Inv2");
    expect(res2.ok).toBe(false);
    expect(res2.error).toMatch(/not found/i);

    invasionHost.destroy();
    platGuest.destroy();
    platHost.destroy();
    invGuest.destroy();
  });

  it("host startGame broadcasts the synced countdown to both players; non-host is ignored", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("H");
    await guest.joinRoom(code, "G");

    let fired = false;
    const off = host.on("raceStart", () => (fired = true));
    guest.startGame();
    await new Promise((r) => setTimeout(r, 150));
    expect(fired).toBe(false);
    off();

    const hostStart = once(host, "raceStart");
    const guestStart = once(guest, "raceStart");
    host.startGame();
    const [h, g] = await Promise.all([hostStart, guestStart]);
    expect(h.countdownMs).toBeGreaterThan(0);
    expect(g.countdownMs).toBeGreaterThan(0);

    host.destroy();
    guest.destroy();
  });

  it("relays base-unit ship snapshots to the other player (#80)", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("H");
    await guest.joinRoom(code, "G");

    const gotState = once(guest, "remoteState");
    host.sendState({ x: 380, vx: -120, over: false }, true);
    const snap = await gotState;
    expect(snap.id).toBe(host.playerId);
    expect(snap.x).toBe(380);
    expect(snap.vx).toBe(-120);
    expect(snap.over).toBe(false);

    // The terminal game-over snapshot bypasses the ~15 Hz throttle.
    const gotFinal = once(guest, "remoteState");
    host.sendState({ x: 380, vx: 0, over: true }); // throttled: dropped
    host.sendState({ x: 380, vx: 0, over: true }, true); // forced: sent
    expect((await gotFinal).over).toBe(true);

    host.destroy();
    guest.destroy();
  });

  it("clears the ghost's seat when a player leaves", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("H");
    await guest.joinRoom(code, "G");

    const hostSawLeave = once(host, "playerLeft");
    guest.leave();
    expect((await hostSawLeave).id).toBe(guest.playerId);
    expect(host.roster).toHaveLength(1);

    host.destroy();
    guest.destroy();
  });
});
