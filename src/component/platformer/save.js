import { LEVELS } from "./levels.js";

const SAVE_KEY = "platformer_save";
const CURRENT_VERSION = 1;

const DEFAULT_SAVE = {
  version: CURRENT_VERSION,
  levelsCompleted: 0,
  selectedAvatar: 0,
  playerName: "",
  tutorialDoubleJumpShown: false,
};

export function loadSave() {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return { ...DEFAULT_SAVE };
    
    const parsed = JSON.parse(data);
    
    // Fallback if data is corrupt or old version
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SAVE };

    // Validate fields
    return {
      version: CURRENT_VERSION,
      levelsCompleted: Math.max(0, Math.min(Number(parsed.levelsCompleted) || 0, LEVELS.length)),
      selectedAvatar: Math.max(0, Number(parsed.selectedAvatar) || 0),
      playerName: typeof parsed.playerName === "string" ? parsed.playerName : "",
      tutorialDoubleJumpShown: Boolean(parsed.tutorialDoubleJumpShown),
    };
  } catch (err) {
    console.warn("Failed to load save data, falling back to defaults.", err);
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(partial) {
  try {
    const current = loadSave();
    const updated = { ...current, ...partial, version: CURRENT_VERSION };
    localStorage.setItem(SAVE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to write save data. Progress will not be saved.", err);
  }
}
