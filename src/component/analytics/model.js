/**
 * Data model for the activity dashboard.
 *
 * Everything here is pure: it takes the normalized contribution series from
 * `github/contributions.js` and a selection, and returns rows. The view layer
 * owns no derivation at all — which is what keeps the dashboard from growing
 * into one unreadable component the way the old DataAnalytics did.
 */

import { toLocalDate } from "../github/contributions.js";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Presets for the range row. `null` days means "the whole series". */
export const RANGE_PRESETS = [
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "180d", label: "6 months", days: 180 },
  { id: "all", label: "All", days: null },
];

export const EMPTY_SELECTION = { range: null, weekday: null, day: null };

export function toIso(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate, amount) {
  const date = toLocalDate(isoDate);
  date.setDate(date.getDate() + amount);
  return toIso(date);
}

export function weekdayOf(isoDate) {
  return toLocalDate(isoDate).getDay();
}

export function seriesBounds(series) {
  if (series.length === 0) return null;
  return { start: series[0].date, end: series[series.length - 1].date };
}

/**
 * The last `days` days of the series, anchored to the series' own end rather
 * than to today — the API's window is "last year", and anchoring to the wall
 * clock would silently produce an empty range if the feed lags a day.
 */
export function presetRange(series, days) {
  const bounds = seriesBounds(series);
  if (!bounds) return null;
  if (days === null || days === undefined) return bounds;

  const start = addDays(bounds.end, -(days - 1));
  return clampRange({ start, end: bounds.end }, bounds);
}

export function clampRange(range, bounds) {
  if (!range || !bounds) return bounds;
  const start = range.start < bounds.start ? bounds.start : range.start;
  const end = range.end > bounds.end ? bounds.end : range.end;
  return start <= end ? { start, end } : bounds;
}

/** Normalizes a dragged pair of dates into an ordered range. */
export function orderRange(a, b) {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Smallest range containing both `range` and `date`.
 *
 * Pinning a day is a drill-down, so it has to win over the window it lands
 * outside of — otherwise clicking a dimmed calendar cell selects a day the
 * range filter immediately throws away, and the whole dashboard reads empty.
 */
export function rangeIncluding(range, date) {
  if (!range) return { start: date, end: date };
  if (date < range.start) return { start: date, end: range.end };
  if (date > range.end) return { start: range.start, end: date };
  return range;
}

export function isFullRange(range, bounds) {
  if (!range || !bounds) return true;
  return range.start <= bounds.start && range.end >= bounds.end;
}

/**
 * Applies a selection to the series.
 *
 * `exclude` names a facet to leave out, which is the cross-filtering rule that
 * makes the views agree: a chart is filtered by every selection except the one
 * it owns. Without it, clicking a weekday bar would leave a chart with exactly
 * one bar standing and nothing to click back to.
 */
export function applySelection(series, selection = EMPTY_SELECTION, exclude) {
  const { range, weekday, day } = { ...EMPTY_SELECTION, ...selection };

  return series.filter((entry) => {
    if (exclude !== "range" && range) {
      if (entry.date < range.start || entry.date > range.end) return false;
    }
    if (exclude !== "weekday" && weekday !== null && weekday !== undefined) {
      if (weekdayOf(entry.date) !== weekday) return false;
    }
    if (exclude !== "day" && day) {
      if (entry.date !== day) return false;
    }
    return true;
  });
}

export function hasActiveFilter(selection, bounds) {
  const { range, weekday, day } = { ...EMPTY_SELECTION, ...selection };
  if (day) return true;
  if (weekday !== null && weekday !== undefined) return true;
  return !isFullRange(range, bounds);
}

/**
 * Stat-tile figures for a slice. Deliberately not `summarize()` from
 * contributions.js: streaks are meaningless once a filter has removed the days
 * in between, so a slice reports totals and its busiest day instead.
 */
export function summarizeSlice(entries) {
  if (entries.length === 0) {
    return { total: 0, activeDays: 0, days: 0, perDay: 0, busiest: null };
  }

  let total = 0;
  let activeDays = 0;
  let busiest = entries[0];

  entries.forEach((entry) => {
    total += entry.count;
    if (entry.count > 0) activeDays += 1;
    if (entry.count > busiest.count) busiest = entry;
  });

  return {
    total,
    activeDays,
    days: entries.length,
    perDay: total / entries.length,
    busiest: busiest.count > 0 ? busiest : null,
  };
}

/**
 * Weekly totals for the timeline. Weeks start on Sunday so the bins line up
 * column-for-column with the calendar underneath them.
 */
export function toWeekBins(series) {
  const bins = [];
  let current = null;

  series.forEach((entry) => {
    const weekStart = addDays(entry.date, -weekdayOf(entry.date));

    if (!current || current.weekStart !== weekStart) {
      current = { weekStart, weekEnd: addDays(weekStart, 6), total: 0, days: 0 };
      bins.push(current);
    }

    current.total += entry.count;
    current.days += 1;
  });

  return bins;
}

export function weekdayTotals(entries) {
  const rows = WEEKDAY_SHORT.map((label, weekday) => ({
    weekday,
    label,
    name: WEEKDAY_LABELS[weekday],
    total: 0,
    days: 0,
  }));

  entries.forEach((entry) => {
    const row = rows[weekdayOf(entry.date)];
    row.total += entry.count;
    row.days += 1;
  });

  return rows.map((row) => ({
    ...row,
    average: row.days === 0 ? 0 : row.total / row.days,
  }));
}

/**
 * Column-per-week grid for the heatmap. Leading and trailing cells are `null`
 * so a partial first or last week keeps its weekday alignment instead of
 * sliding the whole column up.
 */
export function calendarGrid(series) {
  if (series.length === 0) return { columns: [], months: [] };

  const byDate = new Map(series.map((entry) => [entry.date, entry]));
  const first = series[0].date;
  const last = series[series.length - 1].date;

  const columns = [];
  const months = [];
  let cursor = addDays(first, -weekdayOf(first));
  let lastMonth = null;

  while (cursor <= last) {
    const cells = [];

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(cursor, weekday);
      if (date < first || date > last) {
        cells.push(null);
        continue;
      }
      const entry = byDate.get(date);
      cells.push({ date, weekday, count: entry ? entry.count : 0 });
    }

    const firstCell = cells.find(Boolean);
    if (firstCell) {
      const month = firstCell.date.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        months.push({
          column: columns.length,
          label: MONTH_SHORT[Number(month.slice(5, 7)) - 1],
          month,
        });
      }
    }

    columns.push({ weekStart: cursor, cells });
    cursor = addDays(cursor, 7);
  }

  return { columns, months };
}

/** The heat ramp has four steps; a degenerate series may use fewer buckets. */
export const HEAT_RAMP_STEPS = 4;

/**
 * Bucket edges from the quantiles of the *active* days. Fixed edges (1/3/6/10,
 * the way GitHub's own graph works) wash out for anyone whose busy day is three
 * commits, so the ramp is fitted to the data it is drawing.
 *
 * Edges come back strictly increasing and topped out at the busiest day, so the
 * darkest step always means "the busiest days" and is always reachable. A
 * series with little spread simply yields fewer than four buckets rather than
 * an edge nothing can reach.
 */
export function heatThresholds(series) {
  const active = series
    .map((entry) => entry.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);

  if (active.length === 0) {
    // Nothing to colour, but the legend still wants its full set of steps.
    return [1, 2, 3, 4];
  }

  const max = active[active.length - 1];
  const at = (fraction) =>
    active[Math.min(active.length - 1, Math.floor(active.length * fraction))];

  const edges = [];
  [1, at(0.5), at(0.8), max].forEach((value) => {
    const clamped = Math.min(Math.max(1, Math.round(value)), max);
    if (edges.length === 0 || clamped > edges[edges.length - 1]) {
      edges.push(clamped);
    }
  });

  return edges;
}

/** 0 for an empty day, then 1..thresholds.length. */
export function bucketOf(count, thresholds) {
  if (count <= 0) return 0;
  let bucket = 0;
  thresholds.forEach((edge) => {
    if (count >= edge) bucket += 1;
  });
  return Math.max(1, bucket);
}

/**
 * Spreads however many buckets the data produced across the four ramp steps, so
 * the lightest and darkest steps are always both in play.
 */
export function rampIndexOf(bucket, bucketCount) {
  if (bucket <= 0) return -1;
  if (bucketCount <= 1) return HEAT_RAMP_STEPS - 1;
  const ratio = (bucket - 1) / (bucketCount - 1);
  return Math.round(ratio * (HEAT_RAMP_STEPS - 1));
}

const CSV_NEEDS_QUOTES = /[",\n]/;

function csvCell(value) {
  const text = String(value);
  return CSV_NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function tableRows(entries) {
  return entries.map((entry) => ({
    date: entry.date,
    weekday: WEEKDAY_LABELS[weekdayOf(entry.date)],
    count: entry.count,
  }));
}

export function sortRows(rows, key, direction) {
  const sorted = [...rows];
  const sign = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    if (a[key] < b[key]) return -sign;
    if (a[key] > b[key]) return sign;
    // Date is the stable tiebreaker; two days with the same count should not
    // shuffle between renders.
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return sorted;
}
