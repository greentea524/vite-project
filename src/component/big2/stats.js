/**
 * Local storage helper for Big 2 player statistics (Issue #115).
 */

const STATS_KEY = "big2:stats";

function loadStats() {
  const defaultStats = {
    gamesPlayed: 0,
    gamesWon: 0,
  };
  try {
    const data = window.localStorage.getItem(STATS_KEY);
    if (data) {
      return { ...defaultStats, ...JSON.parse(data) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return defaultStats;
}

function saveStats(stats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    // Ignore storage errors
  }
}

export function getStats() {
  const stats = loadStats();
  const winRate = stats.gamesPlayed > 0 
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
    : 0;
  return { ...stats, winRate };
}

export function recordGame(isWin) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  if (isWin) {
    stats.gamesWon += 1;
  }
  saveStats(stats);
}
