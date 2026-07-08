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
      version: 1,
      levelsCompleted: 0,
      selectedAvatar: 0,
      playerName: "",
    });
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
    expect(data.version).toBe(1);
    
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
