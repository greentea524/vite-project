// Ghost fire-event bullet tests: shots the local player fires are
// buffered and piggybacked on the state snapshot, and the peer spawns
// cosmetic, non-colliding ghost bullets that simulate and cull locally.

import { describe, it, expect, beforeEach, vi } from "vitest";

function makeCanvas() {
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return () => ({ addColorStop() {} });
        }
        if (prop === "canvas") return { width: 800, height: 700 };
        return () => {};
      },
    },
  );
  return {
    width: 800,
    height: 700,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 700 }),
  };
}

// Fake network that captures state snapshots and honors a throttle flag.
function fakeNetwork() {
  return {
    roomCode: "TEST",
    sent: [],
    _allow: true,
    sendEnemyKill() {},
    sendState(snap, force) {
      if (!force && !this._allow) return false;
      this.sent.push(structuredClone(snap));
      return true;
    },
  };
}

describe("ghost fire-event bullets", () => {
  let InvasionEngine;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("window", {
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 800,
      innerHeight: 700,
      matchMedia: () => ({ matches: false }),
    });
    ({ InvasionEngine } = await import("./engine.js"));
  });

  const start = (net) => {
    const eng = new InvasionEngine(makeCanvas(), null, {});
    if (net) eng.attachNetwork(net);
    eng.play(1);
    return eng;
  };

  it("buffers fired shots as base-800 descriptors when in a room", () => {
    const net = fakeNetwork();
    const eng = start(net);
    eng.weaponLevel = 1;
    eng._shootBullet();
    expect(eng._pendingShots.length).toBe(1);
    const s = eng._pendingShots[0];
    expect(s).toHaveProperty("x");
    expect(s).toHaveProperty("y");
    // 800px canvas → scale 1 → base coords equal screen coords here.
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(800);
  });

  it("does not buffer shots in single player (no room)", () => {
    const eng = start(null);
    eng._shootBullet();
    expect(eng._pendingShots).toEqual([]);
  });

  it("piggybacks shots on the snapshot and flushes only once it's sent", () => {
    const net = fakeNetwork();
    const eng = start(net);
    eng._shootBullet();
    expect(eng._pendingShots.length).toBeGreaterThan(0);

    // Throttled (dropped) snapshot keeps the shots.
    net._allow = false;
    eng._broadcastState(false);
    expect(eng._pendingShots.length).toBeGreaterThan(0);

    // A real send carries the shots and clears the buffer.
    net._allow = true;
    eng._broadcastState(false);
    const last = net.sent[net.sent.length - 1];
    expect(Array.isArray(last.shots)).toBe(true);
    expect(last.shots.length).toBeGreaterThan(0);
    expect(eng._pendingShots).toEqual([]);
  });

  it("spawns cosmetic ghost bullets on the peer, apart from colliding bullets", () => {
    const eng = start(null); // receiver; single-player sim is fine
    eng.setGhost({ id: "opp", name: "Rival" });
    const bulletsBefore = eng.bullets.length;
    eng.pushGhostSnapshot({
      id: "opp",
      x: 400,
      y: 600,
      shots: [
        { x: 400, y: 600, vx: 0, isLaser: false, isHoming: false },
        { x: 300, y: 600, vx: -1, isLaser: false, isHoming: false },
      ],
    });
    expect(eng.ghostBullets.length).toBe(2);
    // Ghost bullets never enter the colliding bullet array.
    expect(eng.bullets.length).toBe(bulletsBefore);
  });

  it("advances ghost bullets upward and culls them off the top", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    eng.pushGhostSnapshot({
      id: "opp",
      x: 400,
      y: 10,
      shots: [{ x: 400, y: 10, vx: 0, isLaser: false, isHoming: false }],
    });
    const y0 = eng.ghostBullets[0].y;
    eng._updateGhostBullets();
    expect(eng.ghostBullets[0].y).toBeLessThan(y0); // moved up
    // A few more frames clears the top (y started at 10).
    for (let i = 0; i < 6; i++) eng._updateGhostBullets();
    expect(eng.ghostBullets.length).toBe(0);
  });

  it("ignores shots from a snapshot whose id isn't the current ghost", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    eng.pushGhostSnapshot({
      id: "someone-else",
      x: 400,
      y: 600,
      shots: [{ x: 400, y: 600 }],
    });
    expect(eng.ghostBullets.length).toBe(0);
  });
});
