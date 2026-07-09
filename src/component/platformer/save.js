import { LEVELS } from "./levels.js";
import { ACHIEVEMENTS } from "./achievements.js";

const SAVE_KEY = "platformer_save";
// v2 (#66): adds lifetime `stats` and unlocked `achievements`.
const CURRENT_VERSION = 2;

const AVATAR_COUNT = 6;

const DEFAULT_STATS = {
  totalCoins: 0,
  deaths: 0,
  levelsCleared: 0,
  gamesCompleted: 0,
  stomps: 0,
  avatarsUsed: [],
};

const DEFAULT_SAVE = {
  version: CURRENT_VERSION,
  levelsCompleted: 0,
  selectedAvatar: 0,
  playerName: "",
  stats: { ...DEFAULT_STATS },
  achievements: {},
};

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

// Lifetime stats: non-negative integers; avatarsUsed keeps only valid,
// deduped avatar indices so corrupt input can't fake progress.
function validStats(raw) {
  const s = typeof raw === "object" && raw !== null ? raw : {};
  return {
    totalCoins: count(s.totalCoins),
    deaths: count(s.deaths),
    levelsCleared: count(s.levelsCleared),
    gamesCompleted: count(s.gamesCompleted),
    stomps: count(s.stomps),
    avatarsUsed: Array.isArray(s.avatarsUsed)
      ? [...new Set(s.avatarsUsed.filter((n) => Number.isInteger(n) && n >= 0 && n < AVATAR_COUNT))]
      : [],
  };
}

// Unlocked achievements: id -> unlockedAt timestamp. Unknown ids are
// dropped so removing an achievement later never crashes the load.
function validAchievements(raw) {
  const out = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const a of ACHIEVEMENTS) {
    const t = raw[a.id];
    if (typeof t === "number" && Number.isFinite(t)) out[a.id] = t;
  }
  return out;
}

export function loadSave() {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return structuredClone(DEFAULT_SAVE);

    const parsed = JSON.parse(data);

    // Fallback if data is corrupt or old version
    if (typeof parsed !== "object" || parsed === null) return structuredClone(DEFAULT_SAVE);

    // Validate fields. A v1 save simply has no stats/achievements, so
    // the validators fill defaults — that IS the v1 -> v2 migration.
    return {
      version: CURRENT_VERSION,
      levelsCompleted: Math.max(0, Math.min(Number(parsed.levelsCompleted) || 0, LEVELS.length)),
      selectedAvatar: Math.max(0, Number(parsed.selectedAvatar) || 0),
      playerName: typeof parsed.playerName === "string" ? parsed.playerName : "",
      stats: validStats(parsed.stats),
      achievements: validAchievements(parsed.achievements),
    };
  } catch (err) {
    console.warn("Failed to load save data, falling back to defaults.", err);
    return structuredClone(DEFAULT_SAVE);
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
