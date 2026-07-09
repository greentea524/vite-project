// Achievements suite (#66): the pure evaluate() predicates, and the
// GameState integration — lifetime stats accrue across runs, persist,
// survive resetProgress, and never accrue during multiplayer races.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ACHIEVEMENTS, evaluate } from "./achievements.js";
import { GameState } from "./state.js";
import { loadSave } from "./save.js";
import { LEVELS } from "./levels.js";

const SAVE_KEY = "platformer_save";

const stats = (over = {}) => ({
  totalCoins: 0,
  deaths: 0,
  levelsCleared: 0,
  gamesCompleted: 0,
  stomps: 0,
  avatarsUsed: [],
  levelsCompleted: 0,
  ...over,
});

describe("achievements.js", () => {
  it("every achievement has a unique id and a positive target", () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.target).toBeGreaterThan(0);
      expect(a.goal(stats())).toBe(0); // zero stats unlock nothing
    }
  });

  it("unlocks exactly at the threshold (49/50/51 coins)", () => {
    expect(evaluate(stats({ totalCoins: 49 }), {})).toEqual([]);
    expect(evaluate(stats({ totalCoins: 50 }), {})).toEqual(["coins_50"]);
    expect(evaluate(stats({ totalCoins: 51 }), {})).toEqual(["coins_50"]);
  });

  it("returns each id only once when callers record unlocks", () => {
    const s = stats({ totalCoins: 120 });
    const unlocked = {};
    const first = evaluate(s, unlocked);
    expect(first).toEqual(["coins_50", "coins_100"]);
    for (const id of first) unlocked[id] = Date.now();
    expect(evaluate(s, unlocked)).toEqual([]);
  });

  it("level-frontier achievements unlock from levelsCompleted", () => {
    expect(evaluate(stats({ levelsCompleted: 1 }), {})).toContain("first_steps");
    expect(evaluate(stats({ levelsCompleted: 3 }), {})).toContain("world_traveler");
    expect(evaluate(stats({ levelsCompleted: 12 }), {})).toContain("peak_performance");
    expect(evaluate(stats({ levelsCompleted: LEVELS.length }), {})).toContain("champion");
  });
});

describe("GameState achievements integration", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, value) => {
        store[key] = value.toString();
      }),
    });
  });

  it("accumulates lifetime coins across runs and persists them", () => {
    const s = new GameState();
    s.playStage(0);
    for (let i = 0; i < 30; i++) s.addCoin();
    s.playStage(1); // per-run coins reset...
    expect(s.coins).toBe(0);
    for (let i = 0; i < 20; i++) s.addCoin();
    expect(s.stats.totalCoins).toBe(50); // ...lifetime total doesn't

    // A brand-new GameState hydrates the same totals from storage.
    const reloaded = new GameState();
    expect(reloaded.stats.totalCoins).toBe(50);
    expect(reloaded.achievements.coins_50).toBeTypeOf("number");
  });

  it("emits the achievement event exactly once per unlock", () => {
    const s = new GameState();
    s.playStage(0);
    const seen = [];
    s.on("achievement", (a) => seen.push(a.id));
    for (let i = 0; i < 60; i++) s.addCoin();
    expect(seen.filter((id) => id === "coins_50")).toHaveLength(1);
  });

  it("unlocks First Steps on completing 1-1", () => {
    const s = new GameState();
    s.playStage(0);
    s.levelComplete();
    expect(s.achievements.first_steps).toBeTypeOf("number");
    expect(s.stats.levelsCleared).toBe(1);
  });

  it("tracks stomps and deaths", () => {
    const s = new GameState();
    s.playStage(0);
    s.addStomp();
    s.loseLife();
    expect(s.stats.stomps).toBe(1);
    expect(s.stats.deaths).toBe(1);
  });

  it("records each avatar used at level start (Fashionista)", () => {
    const s = new GameState();
    s.setAvatar(2);
    s.playStage(0);
    s.setAvatar(4);
    s.playStage(0);
    s.playStage(0); // repeat doesn't duplicate
    expect(s.stats.avatarsUsed).toEqual([2, 4]);
  });

  it("does not accrue stats or unlocks during multiplayer races", () => {
    const s = new GameState();
    s.startGame(); // multiplayer entry point
    expect(s.multiplayer).toBe(true);
    for (let i = 0; i < 60; i++) s.addCoin();
    s.addStomp();
    s.loseLife();
    expect(s.stats.totalCoins).toBe(0);
    expect(s.stats.stomps).toBe(0);
    expect(s.stats.deaths).toBe(0);
    expect(s.achievements).toEqual({});
  });

  it("resetProgress wipes the frontier but keeps achievements and stats", () => {
    const s = new GameState();
    s.playStage(0);
    for (let i = 0; i < 50; i++) s.addCoin();
    s.levelComplete();
    expect(s.achievements.coins_50).toBeTypeOf("number");

    s.resetProgress();
    expect(s.levelsCompleted).toBe(0);
    expect(s.achievements.coins_50).toBeTypeOf("number");
    expect(s.stats.totalCoins).toBe(50);

    const persisted = loadSave();
    expect(persisted.levelsCompleted).toBe(0);
    expect(persisted.achievements.coins_50).toBeTypeOf("number");
    expect(persisted.stats.totalCoins).toBe(50);
  });
});
