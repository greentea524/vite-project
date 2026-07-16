// Rogue-lite sector-clear regression: after the hyperdrive exit,
// onSectorClear must fire exactly once and the loop must park.
// (It used to re-trigger every frame — the empty field re-entered the
// jump state and each boss clear spawned another sector, endlessly.)

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

describe("rogue-lite sector clear", () => {
  let InvasionEngine;
  let rafQueue;

  beforeEach(async () => {
    rafQueue = [];
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
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

  // Run queued frames until the loop stops scheduling (or a cap).
  const drive = (maxFrames = 400) => {
    let frames = 0;
    while (rafQueue.length && frames < maxFrames) {
      rafQueue.shift()();
      frames++;
    }
    return frames;
  };

  it("fires onSectorClear exactly once and parks the loop", () => {
    const eng = new InvasionEngine(makeCanvas(), null, {});
    let clears = 0;
    eng.onSectorClear = () => clears++;
    eng.setRogueLite(0, 0, "nebula");
    eng.playSector(null);

    // Simulate the sector being finished: field empty, ship settled.
    eng.aliens = [];
    eng.bosses = [];
    eng.hyperdriveState = null;
    eng.player.y = 30; // near the top so the jump exits in a few frames

    const frames = drive();
    expect(clears).toBe(1); // not once per frame
    expect(eng._running).toBe(false);
    expect(rafQueue.length).toBe(0); // loop parked — nothing rescheduled
    expect(frames).toBeLessThan(400); // didn't hit the runaway cap
  });

  it("endless mode still rolls into the next wave after a jump", () => {
    const eng = new InvasionEngine(makeCanvas(), null, {});
    eng.play(); // endless single player (not rogue-lite)
    eng.aliens = [];
    eng.bosses = [];
    eng.hyperdriveState = null;
    eng.player.y = 30;
    const startWave = eng.waveNumber;

    // Drive a bounded number of frames: jump out, wave++, drop back in.
    for (let i = 0; i < 200 && rafQueue.length; i++) rafQueue.shift()();

    expect(eng.waveNumber).toBe(startWave + 1);
    expect(eng.aliens.length).toBeGreaterThan(0); // next wave spawned
    expect(eng._running).toBe(true); // endless keeps going
  });
});
