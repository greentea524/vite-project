import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSave, writeSave } from "./save.js";

const SAVE_KEY = "platformer_save";

describe("save.js", () => {
  let store = {};
  
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      clear: vi.fn(() => { store = {}; })
    });
    vi.restoreAllMocks();
  });

  it("returns default save if no data", () => {
    const save = loadSave();
    expect(save).toEqual({
      version: 2,
      levelsCompleted: 0,
      selectedAvatar: 0,
      playerName: "",
      stats: {
        totalCoins: 0,
        deaths: 0,
        levelsCleared: 0,
        gamesCompleted: 0,
        stomps: 0,
        avatarsUsed: [],
      },
      achievements: {},
    });
  });

  it("migrates a version-1 save, filling stats/achievements defaults", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, levelsCompleted: 5, selectedAvatar: 2, playerName: "GT" }),
    );
    const save = loadSave();
    expect(save.version).toBe(2);
    expect(save.levelsCompleted).toBe(5);
    expect(save.stats.totalCoins).toBe(0);
    expect(save.stats.avatarsUsed).toEqual([]);
    expect(save.achievements).toEqual({});
  });

  it("sanitizes corrupt stats and drops unknown achievement ids", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        stats: { totalCoins: -10, deaths: "junk", avatarsUsed: [0, 0, 99, "x", 3] },
        achievements: { coins_50: 123, removed_achievement: 456, coins_100: "bad" },
      }),
    );
    const save = loadSave();
    expect(save.stats.totalCoins).toBe(0);
    expect(save.stats.deaths).toBe(0);
    expect(save.stats.avatarsUsed).toEqual([0, 3]);
    expect(save.achievements).toEqual({ coins_50: 123 });
  });

  it("loads and validates existing data", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ levelsCompleted: 3, selectedAvatar: 2 }));
    const save = loadSave();
    expect(save.levelsCompleted).toBe(3);
    expect(save.selectedAvatar).toBe(2);
  });

  it("clamps levelsCompleted to valid bounds", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ levelsCompleted: 999 }));
    const save = loadSave();
    expect(save.levelsCompleted).toBeLessThan(999);
    
    localStorage.setItem(SAVE_KEY, JSON.stringify({ levelsCompleted: -5 }));
    const save2 = loadSave();
    expect(save2.levelsCompleted).toBe(0);
  });

  it("falls back to defaults if JSON is corrupt", () => {
    localStorage.setItem(SAVE_KEY, "not valid json");
    const save = loadSave();
    expect(save.levelsCompleted).toBe(0);
  });

  it("falls back to defaults if localStorage throws", () => {
    localStorage.getItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const save = loadSave();
    expect(save.levelsCompleted).toBe(0);
  });

  it("writes partial updates to save", () => {
    writeSave({ levelsCompleted: 5 });
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    expect(data.levelsCompleted).toBe(5);
    expect(data.version).toBe(2);
    
    // Test sequential updates
    writeSave({ selectedAvatar: 3 });
    const data2 = JSON.parse(localStorage.getItem(SAVE_KEY));
    expect(data2.levelsCompleted).toBe(5);
    expect(data2.selectedAvatar).toBe(3);
  });

  it("handles write errors gracefully", () => {
    localStorage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    // Should not throw
    expect(() => writeSave({ levelsCompleted: 5 })).not.toThrow();
  });
});
