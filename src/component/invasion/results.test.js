// Results tests (#82): the pure match-outcome helper and the engine's
// enriched game-over / terminal-snapshot payload that feeds the
// spectating and results screens.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchOutcome, OUTCOME_LABEL } from "./results.js";

describe("matchOutcome", () => {
  it("decides win / lose / tie by score", () => {
    expect(matchOutcome(100, 50)).toBe("win");
    expect(matchOutcome(50, 100)).toBe("lose");
    expect(matchOutcome(70, 70)).toBe("tie");
  });

  it("coerces missing/garbage scores to 0", () => {
    expect(matchOutcome(undefined, undefined)).toBe("tie");
    expect(matchOutcome(10, undefined)).toBe("win");
    expect(matchOutcome(null, 5)).toBe("lose");
  });

  it("has a label for every outcome", () => {
    for (const o of ["win", "lose", "tie"]) {
      expect(OUTCOME_LABEL[o]).toBeTruthy();
    }
  });
});

// Headless canvas/context stub so the engine runs without a DOM.
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

describe("engine results payload (#82)", () => {
  let InvasionEngine;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("window", {
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 800,
      innerHeight: 700,
      matchMedia: () => ({ matches: false }),
    });
    ({ InvasionEngine } = await import("./engine.js"));
  });

  it("tracks the best combo streak across the run", () => {
    const eng = new InvasionEngine(makeCanvas(), null, {});
    eng.play(1); // seeded run
    // Three quick scoring events build a 3-combo, then it lapses.
    eng._addScore(10, 100, 100);
    eng._addScore(10, 100, 100);
    eng._addScore(10, 100, 100);
    expect(eng.runBestCombo).toBe(3);
    eng.comboTimerFrames = 0; // combo window expires
    eng._addScore(10, 100, 100); // streak restarts at 1
    expect(eng.comboCount).toBe(1);
    expect(eng.runBestCombo).toBe(3); // high-water mark holds
  });

  it("onGameOver reports score, hits, and best combo", () => {
    let result = null;
    const eng = new InvasionEngine(makeCanvas(), null, {
      onGameOver: (r) => (result = r),
    });
    eng.play(1);
    eng._addScore(10, 100, 100);
    eng._addScore(10, 100, 100);
    eng.hits = 7;
    eng.gameOver = true;
    eng._loop(); // parks on game over and fires onGameOver
    expect(result).toMatchObject({ score: eng.score, hits: 7, bestCombo: 2 });
    expect(result.bestMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("the terminal broadcast snapshot carries the full results", () => {
    const sent = [];
    const fakeNetwork = {
      roomCode: "TEST",
      sendState: (snap, force) => sent.push({ snap, force }),
      sendEnemyKill() {},
    };
    const eng = new InvasionEngine(makeCanvas(), null, {});
    eng.attachNetwork(fakeNetwork);
    eng.play(1);
    eng._addScore(10, 100, 100);
    eng.hits = 4;

    // Mid-run snapshot: live score only, no results yet.
    eng._broadcastState();
    const live = sent[sent.length - 1].snap;
    expect(live.over).toBe(false);
    expect(live.score).toBe(eng.score);
    expect(live.hits).toBeUndefined();

    // Terminal snapshot: over + full results.
    eng.gameOver = true;
    eng._broadcastState(true);
    const final = sent[sent.length - 1].snap;
    expect(final.over).toBe(true);
    expect(final.score).toBe(eng.score);
    expect(final.hits).toBe(4);
    expect(final.bestCombo).toBe(1);
    expect(final.bestMultiplier).toBeGreaterThanOrEqual(1);
  });
});
