export const CONTRIBUTIONS_API_BASE =
  "https://github-contributions-api.jogruber.de/v4";

export const TREND_WINDOW_DAYS = 7;

export function buildContributionsUrl(username, year = "last") {
  return `${CONTRIBUTIONS_API_BASE}/${encodeURIComponent(
    username,
  )}?y=${encodeURIComponent(year)}`;
}

/**
 * The API dates are plain calendar days ("2026-07-30"). Passing those straight
 * to `new Date()` parses them as UTC midnight, which renders as the previous
 * day for anyone west of UTC. Build the date from local parts instead so the
 * calendar cell lands on the day the API meant.
 */
export function toLocalDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    Number.isFinite(Number(entry.count))
  );
}

/**
 * Normalizes the API payload into an ascending [{ date, count }] series.
 * Throws on a shape we do not recognize so the caller can show an error state
 * instead of rendering an empty chart that looks like "no activity".
 */
export function parseContributions(payload) {
  if (!payload || !Array.isArray(payload.contributions)) {
    throw new Error("Unexpected contributions response shape");
  }

  return payload.contributions
    .filter(isValidEntry)
    .map((entry) => ({
      date: entry.date,
      count: Math.max(0, Math.trunc(Number(entry.count))),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function toCalendarRows(series) {
  return [
    [
      { type: "date", id: "Date" },
      { type: "number", id: "Contributions" },
    ],
    ...series.map((entry) => [toLocalDate(entry.date), entry.count]),
  ];
}

/**
 * Trailing rolling average — a raw daily line over 365 points is mostly noise.
 */
export function toTrendRows(series, windowSize = TREND_WINDOW_DAYS) {
  const rows = [["Date", `${windowSize}-day average`]];
  let windowSum = 0;

  series.forEach((entry, index) => {
    windowSum += entry.count;
    if (index >= windowSize) {
      windowSum -= series[index - windowSize].count;
    }
    const span = Math.min(index + 1, windowSize);
    rows.push([toLocalDate(entry.date), Number((windowSum / span).toFixed(2))]);
  });

  return rows;
}

/**
 * `currentStreak` counts back from the most recent day. A zero on the final day
 * does not break it — the day is still in progress, which is how GitHub's own
 * graph behaves.
 */
export function summarize(series) {
  if (series.length === 0) {
    return {
      total: 0,
      activeDays: 0,
      bestDay: null,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  let total = 0;
  let activeDays = 0;
  let bestDay = series[0];
  let longestStreak = 0;
  let runningStreak = 0;

  series.forEach((entry) => {
    total += entry.count;

    if (entry.count > 0) {
      activeDays += 1;
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }

    if (entry.count > bestDay.count) {
      bestDay = entry;
    }
  });

  let currentStreak = 0;
  let cursor = series.length - 1;

  if (series[cursor].count === 0) {
    cursor -= 1;
  }

  while (cursor >= 0 && series[cursor].count > 0) {
    currentStreak += 1;
    cursor -= 1;
  }

  return {
    total,
    activeDays,
    bestDay: bestDay.count > 0 ? bestDay : null,
    currentStreak,
    longestStreak,
  };
}
