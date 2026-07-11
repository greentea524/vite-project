// Deterministic multiplayer tests (#81): the seeded RNG, and the
// engine's deterministic spawns / order-independent drops / shared-kill
// despawn logic driven through the public engine API against a stub
// canvas (no DOM).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mulberry32, hashString, derive } from "./rng.js";

describe("rng.js", () => {
  it("mulberry32 is deterministic and stays in [0,1)", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("hashString is stable and unsigned", () => {
    expect(hashString("w1-r0-c3")).toBe(hashString("w1-r0-c3"));
    expect(hashString("w1-r0-c3")).toBeGreaterThanOrEqual(0);
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("derive is a pure function of (seed, key, n) — order independent", () => {
    const seed = 0xabcdef;
    // Same inputs → same output regardless of call order.
    const first = derive(seed, "w1-r0-c5", 0);
    derive(seed, "somewhere-else", 0);
    derive(seed, "w1-r0-c5", 1);
    expect(derive(seed, "w1-r0-c5", 0)).toBe(first);
    // Different key or n → (almost surely) different value.
    expect(derive(seed, "w1-r0-c5", 1)).not.toBe(first);
    expect(derive(seed, "w1-r0-c6", 0)).not.toBe(first);
  });

  it("two players with the same seed compute identical drop rolls", () => {
    const seed = 987654321;
    for (const id of ["w1-r0-c0", "w2-r1-c7", "w3-boss"]) {
      expect(derive(seed, id, 0)).toBe(derive(seed, id, 0));
      expect(derive(seed, id, 1)).toBe(derive(seed, id, 1));
    }
  });
});

// A minimal canvas/context stub so the engine can run headless.
function makeEngine() {
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
  const canvas = {
    width: 800,
    height: 700,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 700 }),
  };
  // Engine binds window resize; jsdom-free env — stub the essentials.
  vi.stubGlobal("window", {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 800,
    innerHeight: 700,
    matchMedia: () => ({ matches: false }),
  });
  return { canvas };
}

describe("engine deterministic spawns & shared kills (#81)", () => {
  let InvasionEngine;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    ({ InvasionEngine } = await import("./engine.js"));
  });

  const start = (seed) => {
    const { canvas } = makeEngine();
    const eng = new InvasionEngine(canvas, null, {});
    eng.play(seed);
    return eng;
  };

  it("seeded runs produce a fixed alien count with stable ids", () => {
    const a = start(42);
    const b = start(42);
    // 14 columns × 3 rows, regardless of canvas size.
    expect(a.aliens).toHaveLength(42);
    expect(a.aliens.map((x) => x.id)).toEqual(b.aliens.map((x) => x.id));
    expect(a.aliens[0].id).toBe("w1-r0-c0");
    expect(a.bosses[0].id).toBe("w1-boss");
  });

  it("single player keeps the canvas-derived (non-fixed) layout", () => {
    const { canvas } = makeEngine();
    const eng = new InvasionEngine(canvas, null, {});
    eng.play(); // no seed
    expect(eng._deterministic).toBe(false);
    // 800px canvas → more than the fixed 14 columns.
    expect(eng.aliens.length).toBeGreaterThan(42);
    expect(eng.aliens[0].id).toBeDefined();
  });

  it("multiplayer bosses get a beefier (shared) HP pool than single player", () => {
    const mp = start(5); // seeded → multiplayer race
    const { canvas } = makeEngine();
    const solo = new InvasionEngine(canvas, null, {});
    solo.play(); // no seed → single player
    // Wave-1 octopus: solo 12 HP, multiplayer 2x.
    expect(solo.bosses[0].maxHp).toBe(12);
    expect(mp.bosses[0].maxHp).toBe(24);
    expect(mp.bosses[0].hp).toBe(24);
  });

  it("both seeded players roll the same drop for the same alien", () => {
    const a = start(7);
    const b = start(7);
    const alien = { id: "w1-r0-c3", x: 100, y: 20, width: 20, height: 14 };
    a._maybeDropPowerUp({ ...alien });
    b._maybeDropPowerUp({ ...alien });
    expect(a.powerUps.map((p) => p.type)).toEqual(b.powerUps.map((p) => p.type));
  });

  it("applyRemoteKill despawns the matching alien and replicates its drop", () => {
    const killer = start(7); // "landed" the kill: computes the drop
    const other = start(7); // receives the event
    const target = other.aliens.find((x) => x.id === "w1-r0-c3");

    // What the drop should be, per the killer's deterministic roll.
    const probe = start(7);
    probe.aliens = [];
    probe._maybeDropPowerUp({ ...target });

    other.applyRemoteKill("w1-r0-c3");
    expect(other.aliens.find((x) => x.id === "w1-r0-c3")).toBeUndefined();
    expect(other.powerUps.map((p) => p.type)).toEqual(probe.powerUps.map((p) => p.type));
    // Remote kills grant no score to the receiver.
    expect(other.score).toBe(0);
  });

  it("applyRemoteKill is a no-op when the enemy is already gone", () => {
    const eng = start(7);
    const before = eng.aliens.length;
    eng.applyRemoteKill("does-not-exist");
    expect(eng.aliens).toHaveLength(before);
  });

  it("a remote boss kill despawns the boss and splits the hive with matching child ids", () => {
    const a = start(1);
    const b = start(1);
    // Force the wave boss to a hive so the split path runs on both.
    for (const eng of [a, b]) {
      eng.bosses = [eng._makeBoss("hive", { id: "w1-boss" })];
    }
    // A kills it locally; B mirrors via the event.
    const idx = a.bosses.findIndex((x) => x.id === "w1-boss");
    a._killBoss(idx);
    b.applyRemoteKill("w1-boss");
    expect(a.bosses.map((x) => x.id).sort()).toEqual(b.bosses.map((x) => x.id).sort());
    expect(b.bosses.map((x) => x.id).sort()).toEqual(["w1-boss.0", "w1-boss.1"]);
  });
});
