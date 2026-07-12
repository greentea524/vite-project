// Big 2 multiplayer tests (KAN-63): real Network clients against an
// in-process relay running the server-authoritative game — private
// hands, server-side validation, bot seats, disconnect takeover, and
// full games over sockets.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRelayServer } from "../../../server/relay.js";
import { Network } from "./network.js";
import { chooseBotMove } from "./bot.js";

const BOT_DELAY_MS = 5;

function once(net, event, timeout = 3000) {
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

// Auto-drive a seat like the UI would: whenever it's this player's
// turn, ask the client-side bot brain for a move and send it.
function autoDrive(net) {
  return net.on("state", (state) => {
    if (state.winner !== null || state.turn !== net.mySeat) return;
    const move = chooseBotMove(net.myHand, state.trick?.cards ?? null);
    if (move.type === "play") net.play(move.cardIds);
    else net.pass();
  });
}

describe("big2 multiplayer (KAN-63)", () => {
  let server, url;

  beforeAll(async () => {
    server = await createRelayServer({ port: 0 });
    url = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it("deals private 13-card hands and seats bots in the empty chairs", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);

    const created = await host.createRoom("Ada");
    expect(created.ok).toBe(true);
    const joined = await guest.joinRoom(created.code, "Bob");
    expect(joined.ok).toBe(true);

    const hostHand = once(host, "hand");
    const guestHand = once(guest, "hand");
    const hostState = once(host, "state");
    host.startGame({ botDelayMs: BOT_DELAY_MS });

    const [h, g, state] = await Promise.all([hostHand, guestHand, hostState]);
    expect(h.seat).toBe(0);
    expect(g.seat).toBe(1);
    expect(h.hand).toHaveLength(13);
    expect(g.hand).toHaveLength(13);
    // Private hands: no card appears in both, and neither client ever
    // sees a third hand — the public state carries only counts.
    const hostIds = new Set(h.hand.map((c) => c.id));
    expect(g.hand.some((c) => hostIds.has(c.id))).toBe(false);
    expect(state.counts).toEqual([13, 13, 13, 13]);
    expect(state.seats.map((s) => s.isBot)).toEqual([false, false, true, true]);
    expect(state.round).toBe(1);

    host.destroy();
    guest.destroy();
  });

  it("syncs a lobby rename to every client (#116)", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Ada");
    await guest.joinRoom(code, "CardShark");

    // Roster events also fire for the join itself, so wait on each
    // client for the event that actually carries the new name.
    const sawRename = (net) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("rename never arrived")), 3000);
        net.on("roster", (roster) => {
          if (roster.some((r) => r.name === "Bob the Bold")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    const hostSaw = sawRename(host);
    const guestSaw = sawRename(guest);
    guest.setName("Bob the Bold");
    await Promise.all([hostSaw, guestSaw]);
    expect(host.roster.find((r) => r.id === guest.playerId)?.name).toBe(
      "Bob the Bold"
    );
    // The guest's own roster reflects it too (relay echoes to sender).
    expect(guest.roster.find((r) => r.id === guest.playerId)?.name).toBe(
      "Bob the Bold"
    );

    host.destroy();
    guest.destroy();
  });

  it("rejects out-of-turn and invalid plays server-side", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Ada");
    await guest.joinRoom(code, "Bob");

    const dealt = Promise.all([once(host, "hand"), once(guest, "hand"), once(host, "state")]);
    host.startGame({ botDelayMs: BOT_DELAY_MS });
    const [, , state] = await dealt;

    // Whoever is NOT on turn gets rejected out of hand.
    const offTurn = state.turn === host.mySeat ? guest : host;
    const rejected = once(offTurn, "rejected");
    offTurn.play([offTurn.myHand[0].id]);
    expect((await rejected).reason).toBe("Not your turn");

    // The on-turn player sending garbage ids is rejected too (when a
    // human holds the turn; a bot may hold it on some deals).
    const onTurn = state.turn === host.mySeat ? host : state.turn === guest.mySeat ? guest : null;
    if (onTurn) {
      const badPlay = once(onTurn, "rejected");
      onTurn.play(["XX"]);
      expect((await badPlay).reason).toMatch(/valid/);
    }

    host.destroy();
    guest.destroy();
  });

  it("plays a full round over sockets, then a disconnected seat goes bot and the game still finishes", async () => {
    const host = new Network();
    const guest = new Network();
    await connected(host, url);
    await connected(guest, url);
    const { code } = await host.createRoom("Ada");
    await guest.joinRoom(code, "Bob");

    const stopHost = autoDrive(host);
    const stopGuest = autoDrive(guest);
    const over = once(host, "roundOver", 15000);
    const dealt = Promise.all([once(host, "hand"), once(guest, "hand")]);
    host.startGame({ botDelayMs: BOT_DELAY_MS });
    await dealt;

    // Let the round get going, then yank the guest mid-game.
    await new Promise((r) => setTimeout(r, 150));
    const guestSeat = guest.mySeat;
    stopGuest();
    guest.destroy();

    const result = await over;
    expect(result.winner).toBeGreaterThanOrEqual(0);
    expect(result.hands[result.winner]).toHaveLength(0);
    expect(result.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(result.totals).toEqual(result.deltas); // first round: totals = deltas
    // The abandoned seat is now a bot in the public state.
    expect(host.gameState.seats[guestSeat].isBot).toBe(true);

    // Host starts round 2 from the results screen: fresh 13-card hand.
    const redeal = once(host, "hand");
    const nextState = once(host, "state");
    host.newRound();
    expect((await redeal).hand).toHaveLength(13);
    expect((await nextState).round).toBe(2);

    stopHost();
    host.destroy();
  }, 20000);
});
