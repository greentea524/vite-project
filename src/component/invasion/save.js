// Persistent save for Alien Invasion (#94), modeled on the
// platformer's save.js: a versioned localStorage blob validated field
// by field on load, so corrupt or stale data degrades to defaults
// instead of crashing. Invasion had no persistence before this, so v1
// only carries lifetime stats and unlocked achievements.

import { ACHIEVEMENTS, SHIP_TYPES } from "./achievements.js";

const SAVE_KEY = "invasion_save";
const CURRENT_VERSION = 1;

const DEFAULT_STATS = {
  totalKills: 0,
  bossKills: 0,
  wavesCleared: 0,
  flawlessWaves: 0,
  bestCombo: 0,
  maxWeaponLevel: 1, // weapon level starts at 1
  shipsUsed: [],
};

const DEFAULT_SAVE = {
  version: CURRENT_VERSION,
  stats: { ...DEFAULT_STATS },
  achievements: {},
};

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

// Lifetime stats: non-negative integers; shipsUsed keeps only known,
// deduped ship types so corrupt input can't fake Test Pilot progress.
function validStats(raw) {
  const s = typeof raw === "object" && raw !== null ? raw : {};
  return {
    totalKills: count(s.totalKills),
    bossKills: count(s.bossKills),
    wavesCleared: count(s.wavesCleared),
    flawlessWaves: count(s.flawlessWaves),
    bestCombo: count(s.bestCombo),
    maxWeaponLevel: Math.max(1, count(s.maxWeaponLevel)),
    shipsUsed: Array.isArray(s.shipsUsed)
      ? [...new Set(s.shipsUsed.filter((t) => SHIP_TYPES.includes(t)))]
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
    if (typeof parsed !== "object" || parsed === null) return structuredClone(DEFAULT_SAVE);

    return {
      version: CURRENT_VERSION,
      stats: validStats(parsed.stats),
      achievements: validAchievements(parsed.achievements),
    };
  } catch (err) {
    console.warn("Failed to load invasion save, falling back to defaults.", err);
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(partial) {
  try {
    const current = loadSave();
    const updated = { ...current, ...partial, version: CURRENT_VERSION };
    localStorage.setItem(SAVE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to write invasion save. Progress will not be saved.", err);
  }
}

// --- stat mutation semantics -------------------------------------------
// The engine reports raw events; these pure helpers define how each
// event lands in the lifetime stats (kept here, not in the component,
// so they're unit-testable).

// Additive counters: kills, waves, flawless waves, boss kills.
export function addStat(stats, key, n = 1) {
  stats[key] = count(stats[key]) + count(n);
}

// High-water marks: best combo streak, max weapon level.
export function maxStat(stats, key, value) {
  stats[key] = Math.max(count(stats[key]), count(value));
}

// Set membership: ship types flown (unknown types ignored).
export function addShip(stats, type) {
  if (!SHIP_TYPES.includes(type)) return;
  if (!Array.isArray(stats.shipsUsed)) stats.shipsUsed = [];
  if (!stats.shipsUsed.includes(type)) stats.shipsUsed.push(type);
}
