// Achievements (#94). Pure data + pure predicates — no DOM, no
// storage — mirroring the platformer's architecture (achievements.js,
// #66) so the module is unit-testable and the UI/state layers stay
// thin. Each achievement reads a lifetime-stats snapshot via goal()
// and unlocks at target; expressing them this way gives the panel
// progress bars for free ("214 / 500 kills").
//
// The snapshot is the persisted save.stats from save.js. Lifetime
// stats accumulate across all modes (classic, rogue-lite, multiplayer)
// so no run feels wasted; rogue-lite combat sectors count as waves.

export const SHIP_TYPES = ["fighter", "cruiser", "interceptor"];

export const ACHIEVEMENTS = [
  {
    id: "first_blood",
    name: "First Blood",
    desc: "Destroy your first alien",
    icon: "🩸",
    goal: (s) => s.totalKills,
    target: 1,
  },
  {
    id: "pest_control",
    name: "Pest Control",
    desc: "Destroy 100 enemies",
    icon: "🔫",
    goal: (s) => s.totalKills,
    target: 100,
  },
  {
    id: "exterminator",
    name: "Exterminator",
    desc: "Destroy 500 enemies",
    icon: "☠️",
    goal: (s) => s.totalKills,
    target: 500,
  },
  {
    // The combo multiplier caps at 6x, so "Sharpshooter" is a 10-hit
    // combo streak (hits inside the combo window), not a multiplier.
    id: "sharpshooter",
    name: "Sharpshooter",
    desc: "Land a 10-hit combo",
    icon: "🎯",
    goal: (s) => s.bestCombo,
    target: 10,
  },
  {
    id: "fully_loaded",
    name: "Fully Loaded",
    desc: "Reach weapon level 5",
    icon: "🚀",
    goal: (s) => s.maxWeaponLevel,
    target: 5,
  },
  {
    id: "boss_slayer",
    name: "Boss Slayer",
    desc: "Destroy 10 bosses",
    icon: "👾",
    goal: (s) => s.bossKills,
    target: 10,
  },
  {
    id: "wave_rider",
    name: "Wave Rider",
    desc: "Clear 10 waves",
    icon: "🌊",
    goal: (s) => s.wavesCleared,
    target: 10,
  },
  {
    id: "wave_master",
    name: "Wave Master",
    desc: "Clear 50 waves",
    icon: "🌀",
    goal: (s) => s.wavesCleared,
    target: 50,
  },
  {
    id: "untouchable",
    name: "Untouchable",
    desc: "Clear a wave without taking damage",
    icon: "🛡️",
    goal: (s) => s.flawlessWaves,
    target: 1,
  },
  {
    id: "test_pilot",
    name: "Test Pilot",
    desc: `Fly all ${SHIP_TYPES.length} ship types`,
    icon: "🧑‍🚀",
    goal: (s) => (Array.isArray(s.shipsUsed) ? s.shipsUsed.length : 0),
    target: SHIP_TYPES.length,
  },
];

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// Returns the ids that cross their target given `stats` and are not in
// `unlocked` yet. Callers mark them unlocked before the next call, so
// each id is only ever returned once — no duplicate toasts.
export function evaluate(stats, unlocked) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    if (a.goal(stats) >= a.target) newly.push(a.id);
  }
  return newly;
}
