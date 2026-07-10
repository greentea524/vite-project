// Achievements (#66). Pure data + pure predicates — no DOM, no
// storage — so the module is unit-testable and the UI/state layers
// stay thin. Each achievement reads a lifetime-stats snapshot via
// goal() and unlocks at target; expressing them this way gives the
// panel progress bars for free ("62 / 100 coins").
//
// The snapshot is the persisted save.stats plus levelsCompleted (the
// world-map frontier), merged by GameState.achievementStats().

import { WORLDS, LEVELS } from "./levels.js";

// Flat level count of the first `worlds` worlds, e.g. 1 world -> 3.
const levelsThroughWorld = (worlds) =>
  WORLDS.slice(0, worlds).reduce((n, world) => n + world.length, 0);

export const ACHIEVEMENTS = [
  {
    id: "coins_50",
    name: "Pocket Change",
    desc: "Collect 50 coins",
    icon: "🪙",
    goal: (s) => s.totalCoins,
    target: 50,
  },
  {
    id: "coins_100",
    name: "Coin Collector",
    desc: "Collect 100 coins",
    icon: "💰",
    goal: (s) => s.totalCoins,
    target: 100,
  },
  {
    id: "coins_500",
    name: "Treasure Hunter",
    desc: "Collect 500 coins",
    icon: "👑",
    goal: (s) => s.totalCoins,
    target: 500,
  },
  {
    id: "first_steps",
    name: "First Steps",
    desc: "Complete level 1-1",
    icon: "👣",
    goal: (s) => s.levelsCompleted,
    target: 1,
  },
  {
    id: "world_traveler",
    name: "World Traveler",
    desc: "Complete a full world",
    icon: "🗺️",
    goal: (s) => s.levelsCompleted,
    target: levelsThroughWorld(1),
  },
  {
    id: "peak_performance",
    name: "Peak Performance",
    desc: "Reach World 5 — Frozen Peaks",
    icon: "🏔️",
    goal: (s) => s.levelsCompleted,
    target: levelsThroughWorld(4),
  },
  {
    id: "champion",
    name: "Champion",
    desc: `Complete all ${LEVELS.length} levels`,
    icon: "🏆",
    goal: (s) => s.levelsCompleted,
    target: LEVELS.length,
  },
  {
    id: "stomper",
    name: "Stomper",
    desc: "Stomp 50 enemies",
    icon: "👟",
    goal: (s) => s.stomps,
    target: 50,
  },
  {
    id: "persistent",
    name: "Persistent",
    desc: "Die 50 times",
    icon: "💀",
    goal: (s) => s.deaths,
    target: 50,
  },
  {
    id: "fashionista",
    name: "Fashionista",
    desc: "Play as all 6 avatars",
    icon: "🎨",
    goal: (s) => (Array.isArray(s.avatarsUsed) ? s.avatarsUsed.length : 0),
    target: 6,
  },
  // --- Phase 2 (#67): per-run performance. Modeled as lifetime counts
  // ("death-free clears so far") so evaluate() and the panel's
  // progress bars work unchanged — locked cards read "0 / 1".
  {
    id: "untouchable",
    name: "Untouchable",
    desc: "Clear a level without dying",
    icon: "🛡️",
    goal: (s) => s.deathFreeClears,
    target: 1,
  },
  {
    id: "flawless",
    name: "Flawless",
    desc: "Clear a full world without dying",
    icon: "💎",
    goal: (s) => s.deathFreeWorlds,
    target: 1,
  },
  {
    id: "speedrunner",
    name: "Speedrunner",
    desc: "Clear a level in under 30 seconds",
    icon: "⏱️",
    goal: (s) => s.fastClears,
    target: 1,
  },
  {
    id: "lightning_run",
    name: "Lightning Run",
    desc: "Clear a level in under 15 seconds",
    icon: "⚡",
    goal: (s) => s.lightningClears,
    target: 1,
  },
  {
    id: "lava_dodger",
    name: "Lava Dodger",
    desc: "Clear World 3 without a lava death",
    icon: "🌋",
    goal: (s) => s.world3LavaFree,
    target: 1,
  },
  {
    id: "ice_legs",
    name: "Ice Legs",
    desc: "Clear World 5 without a freezing-water death",
    icon: "🧊",
    goal: (s) => s.world5WaterFree,
    target: 1,
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
