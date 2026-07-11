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

  it("spawns bullets at this screen's ship row and flies them up off the top", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    eng.pushGhostSnapshot({
      id: "opp",
      x: 400,
      y: 10, // remote base-Y is ignored; bullet starts at the local row
      shots: [{ x: 400, y: 10, vx: 0, isLaser: false, isHoming: false }],
    });
    // Launches from the ship row (near the bottom), not the remote Y.
    const expectedRow = eng._ghostRowY() / eng._scale();
    expect(eng.ghostBullets[0].y).toBeCloseTo(expectedRow, 5);

    const y0 = eng.ghostBullets[0].y;
    eng._updateGhostBullets();
    expect(eng.ghostBullets[0].y).toBeLessThan(y0); // moved up

    // Enough frames to cross the whole board and cull off the top.
    for (let i = 0; i < 200; i++) eng._updateGhostBullets();
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

describe("shared boss HP", () => {
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

  it("accumulates boss damage per id and flushes it on a sent snapshot", () => {
    const net = fakeNetwork();
    const eng = start(net);
    const boss = eng.bosses[0];
    const before = boss.hp;

    // Two hits on the wave boss.
    eng._pendingBossDamage[boss.id] = 0;
    boss.hp -= 1;
    eng._pendingBossDamage[boss.id]++;
    boss.hp -= 1;
    eng._pendingBossDamage[boss.id]++;
    expect(boss.hp).toBe(before - 2);

    eng._broadcastState(false);
    const last = net.sent[net.sent.length - 1];
    expect(last.bossDamage[boss.id]).toBe(2);
    expect(eng._pendingBossDamage).toEqual({}); // flushed
  });

  it("applies the opponent's boss damage to the same boss", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    const boss = eng.bosses[0];
    const before = boss.hp;
    eng.pushGhostSnapshot({ id: "opp", x: 400, bossDamage: { [boss.id]: 3 } });
    expect(eng.bosses[0].hp).toBe(before - 3);
  });

  it("a remote fatal blow despawns the boss without scoring the receiver", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    const boss = eng.bosses[0];
    eng.pushGhostSnapshot({ id: "opp", x: 400, bossDamage: { [boss.id]: boss.hp + 5 } });
    // Boss (a non-hive octopus at wave 1) is gone, and no score awarded.
    expect(eng.bosses.find((b) => b.id === "w1-boss")).toBeUndefined();
    expect(eng.score).toBe(0);
  });

  it("ignores boss damage for a boss that's already gone locally", () => {
    const eng = start(null);
    eng.setGhost({ id: "opp", name: "Rival" });
    eng.bosses = []; // already cleared here
    expect(() =>
      eng.pushGhostSnapshot({ id: "opp", x: 400, bossDamage: { "w1-boss": 5 } }),
    ).not.toThrow();
    expect(eng.score).toBe(0);
  });
});
