// Achievements tests (#94): the pure definitions/evaluate logic, the
// validated localStorage save, and the stat-mutation semantics the
// engine's onStat events flow through.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, evaluate, SHIP_TYPES } from "./achievements.js";
import { loadSave, writeSave, addStat, maxStat, addShip } from "./save.js";

const SAVE_KEY = "invasion_save";

const freshStats = () => loadSave().stats;

describe("achievement definitions", () => {
  it("have unique ids, icons, and positive targets", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(a.target).toBeGreaterThan(0);
    }
    expect(ACHIEVEMENTS_BY_ID.size).toBe(ids.length);
  });

  it("every goal() reads a number from the default stats", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const stats = freshStats();
    for (const a of ACHIEVEMENTS) {
      expect(typeof a.goal(stats)).toBe("number");
    }
  });

  it("covers the ticket's three achievements with reachable targets", () => {
    // Sharpshooter is a 10-hit combo streak (the multiplier caps at
    // 6x, so a "10x combo" would be unattainable).
    expect(ACHIEVEMENTS_BY_ID.get("sharpshooter").target).toBe(10);
    // Weapon levels now go to 5 (post-#95), not the original 3.
    expect(ACHIEVEMENTS_BY_ID.get("fully_loaded").target).toBe(5);
    expect(ACHIEVEMENTS_BY_ID.get("exterminator").target).toBe(500);
  });
});

describe("evaluate", () => {
  let stats;
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    stats = freshStats();
  });

  it("returns ids exactly when they cross their target", () => {
    expect(evaluate(stats, {})).toEqual([]);
    stats.totalKills = 1;
    expect(evaluate(stats, {})).toEqual(["first_blood"]);
    stats.totalKills = 100;
    expect(evaluate(stats, {})).toEqual(["first_blood", "pest_control"]);
  });

  it("never re-reports an unlocked id", () => {
    stats.totalKills = 500;
    const unlocked = { first_blood: 1, pest_control: 2 };
    expect(evaluate(stats, unlocked)).toEqual(["exterminator"]);
  });

  it("test_pilot unlocks only with all ship types", () => {
    stats.shipsUsed = ["fighter", "cruiser"];
    expect(evaluate(stats, {})).toEqual([]);
    stats.shipsUsed = [...SHIP_TYPES];
    expect(evaluate(stats, {})).toEqual(["test_pilot"]);
  });
});

describe("save.js", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => {
        store[key] = value.toString();
      }),
    });
  });

  it("returns the default save when nothing is stored", () => {
    expect(loadSave()).toEqual({
      version: 1,
      stats: {
        totalKills: 0,
        bossKills: 0,
        wavesCleared: 0,
        flawlessWaves: 0,
        bestCombo: 0,
        maxWeaponLevel: 1,
        shipsUsed: [],
      },
      achievements: {},
    });
  });

  it("survives corrupt JSON and wrong shapes", () => {
    store[SAVE_KEY] = "{not json";
    expect(loadSave().stats.totalKills).toBe(0);
    store[SAVE_KEY] = JSON.stringify("a string");
    expect(loadSave().achievements).toEqual({});
  });

  it("sanitizes stats: negatives clamp, unknown ships drop, dupes dedupe", () => {
    store[SAVE_KEY] = JSON.stringify({
      version: 1,
      stats: {
        totalKills: -5,
        bossKills: "12",
        wavesCleared: 3.9,
        maxWeaponLevel: 0,
        shipsUsed: ["fighter", "fighter", "battlestar", 7, "cruiser"],
      },
    });
    const { stats } = loadSave();
    expect(stats.totalKills).toBe(0);
    expect(stats.bossKills).toBe(12);
    expect(stats.wavesCleared).toBe(3);
    expect(stats.maxWeaponLevel).toBe(1); // floor: weapons start at 1
    expect(stats.shipsUsed).toEqual(["fighter", "cruiser"]);
  });

  it("drops unknown achievement ids and non-numeric timestamps", () => {
    store[SAVE_KEY] = JSON.stringify({
      version: 1,
      achievements: { first_blood: 123, ghost_achievement: 456, sharpshooter: "yes" },
    });
    expect(loadSave().achievements).toEqual({ first_blood: 123 });
  });

  it("writeSave round-trips through loadSave", () => {
    const save = loadSave();
    save.stats.totalKills = 42;
    save.achievements.first_blood = 999;
    writeSave(save);
    const back = loadSave();
    expect(back.stats.totalKills).toBe(42);
    expect(back.achievements.first_blood).toBe(999);
  });
});

describe("stat mutation semantics (engine onStat events)", () => {
  let stats;
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    stats = freshStats();
  });

  it("addStat accumulates counters", () => {
    addStat(stats, "totalKills");
    addStat(stats, "totalKills", 2);
    expect(stats.totalKills).toBe(3);
  });

  it("maxStat keeps the high-water mark", () => {
    maxStat(stats, "bestCombo", 4);
    maxStat(stats, "bestCombo", 2);
    expect(stats.bestCombo).toBe(4);
  });

  it("addShip dedupes and ignores unknown types", () => {
    addShip(stats, "fighter");
    addShip(stats, "fighter");
    addShip(stats, "deathstar");
    expect(stats.shipsUsed).toEqual(["fighter"]);
  });

  it("a simulated run unlocks in the right order", () => {
    const unlocked = {};
    const tick = () => {
      for (const id of evaluate(stats, unlocked)) unlocked[id] = Date.now();
    };

    // First kill of the run.
    addStat(stats, "totalKills");
    maxStat(stats, "bestCombo", 1);
    tick();
    expect(Object.keys(unlocked)).toEqual(["first_blood"]);

    // A 10-hit streak later in the wave.
    maxStat(stats, "bestCombo", 10);
    tick();
    expect(unlocked.sharpshooter).toBeDefined();

    // Grinding out waves and bosses across sessions.
    addStat(stats, "wavesCleared", 10);
    addStat(stats, "bossKills", 10);
    tick();
    expect(unlocked.wave_rider).toBeDefined();
    expect(unlocked.boss_slayer).toBeDefined();
    expect(unlocked.wave_master).toBeUndefined();
  });
});
