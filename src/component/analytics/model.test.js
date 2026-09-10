import { describe, it, expect } from "vitest";
import {
  addDays,
  applySelection,
  bucketOf,
  calendarGrid,
  clampRange,
  hasActiveFilter,
  heatThresholds,
  isFullRange,
  orderRange,
  presetRange,
  rangeIncluding,
  rampIndexOf,
  seriesBounds,
  sortRows,
  summarizeSlice,
  tableRows,
  toCsv,
  toIso,
  toWeekBins,
  weekdayOf,
  weekdayTotals,
} from "./model.js";

/** A run of consecutive days starting at `start`, counts taken in order. */
function series(start, counts) {
  return counts.map((count, index) => ({
    date: addDays(start, index),
    count,
  }));
}

describe("date helpers", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("subtracts days", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("survives a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("round-trips through toIso in local time", () => {
    expect(toIso(new Date(2026, 6, 4))).toBe("2026-07-04");
  });

  it("reads the weekday of a known date", () => {
    // 2026-01-04 is a Sunday.
    expect(weekdayOf("2026-01-04")).toBe(0);
    expect(weekdayOf("2026-01-10")).toBe(6);
  });
});

describe("ranges", () => {
  const data = series("2026-01-01", new Array(60).fill(1));
  const bounds = seriesBounds(data);

  it("reports the bounds of the series", () => {
    expect(bounds).toEqual({ start: "2026-01-01", end: "2026-03-01" });
  });

  it("returns null bounds for an empty series", () => {
    expect(seriesBounds([])).toBeNull();
  });

  it("anchors a preset to the end of the series, not to today", () => {
    expect(presetRange(data, 30)).toEqual({
      start: "2026-01-31",
      end: "2026-03-01",
    });
  });

  it("treats a preset longer than the series as the whole series", () => {
    expect(presetRange(data, 365)).toEqual(bounds);
  });

  it("treats a null preset as the whole series", () => {
    expect(presetRange(data, null)).toEqual(bounds);
  });

  it("clamps a range to the bounds", () => {
    expect(
      clampRange({ start: "2025-01-01", end: "2027-01-01" }, bounds),
    ).toEqual(bounds);
  });

  it("falls back to the bounds when a range misses them entirely", () => {
    expect(
      clampRange({ start: "2030-01-01", end: "2031-01-01" }, bounds),
    ).toEqual(bounds);
  });

  it("orders a dragged pair either way round", () => {
    expect(orderRange("2026-02-01", "2026-01-01")).toEqual({
      start: "2026-01-01",
      end: "2026-02-01",
    });
  });

  it("recognizes a full range", () => {
    expect(isFullRange(bounds, bounds)).toBe(true);
    expect(isFullRange({ start: "2026-02-01", end: "2026-03-01" }, bounds)).toBe(
      false,
    );
  });
});

describe("applySelection", () => {
  // 2026-01-04 is a Sunday, so this covers two whole weeks.
  const data = series("2026-01-04", new Array(14).fill(2));

  it("returns everything for an empty selection", () => {
    expect(applySelection(data, {})).toHaveLength(14);
  });

  it("filters by range", () => {
    const rows = applySelection(data, {
      range: { start: "2026-01-06", end: "2026-01-08" },
    });
    expect(rows.map((row) => row.date)).toEqual([
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
    ]);
  });

  it("filters by weekday", () => {
    const rows = applySelection(data, { weekday: 0 });
    expect(rows.map((row) => row.date)).toEqual(["2026-01-04", "2026-01-11"]);
  });

  it("filters by a drilled-down day", () => {
    expect(applySelection(data, { day: "2026-01-09" })).toHaveLength(1);
  });

  it("combines facets", () => {
    const rows = applySelection(data, {
      range: { start: "2026-01-04", end: "2026-01-10" },
      weekday: 0,
    });
    expect(rows.map((row) => row.date)).toEqual(["2026-01-04"]);
  });

  it("leaves out the excluded facet so a view can still be un-clicked", () => {
    // This is the cross-filtering rule: the weekday chart is scoped by the
    // range but never by its own weekday selection, or it would render one bar.
    const rows = applySelection(data, { weekday: 3 }, "weekday");
    expect(rows).toHaveLength(14);
  });

  it("still applies the other facets when one is excluded", () => {
    const rows = applySelection(
      data,
      { range: { start: "2026-01-04", end: "2026-01-10" }, weekday: 3 },
      "weekday",
    );
    expect(rows).toHaveLength(7);
  });
});

describe("hasActiveFilter", () => {
  const data = series("2026-01-01", new Array(10).fill(1));
  const bounds = seriesBounds(data);

  it("is false for the untouched dashboard", () => {
    expect(hasActiveFilter({ range: bounds, weekday: null, day: null }, bounds)).toBe(
      false,
    );
  });

  it("is true once the range narrows", () => {
    expect(
      hasActiveFilter(
        { range: { start: "2026-01-02", end: "2026-01-05" } },
        bounds,
      ),
    ).toBe(true);
  });

  it("is true for a weekday selection, including Sunday", () => {
    expect(hasActiveFilter({ range: bounds, weekday: 0 }, bounds)).toBe(true);
  });

  it("is true for a drill-down", () => {
    expect(hasActiveFilter({ range: bounds, day: "2026-01-02" }, bounds)).toBe(
      true,
    );
  });
});

describe("summarizeSlice", () => {
  it("reports zeroes for an empty slice", () => {
    expect(summarizeSlice([])).toEqual({
      total: 0,
      activeDays: 0,
      days: 0,
      perDay: 0,
      busiest: null,
    });
  });

  it("totals a slice and finds its busiest day", () => {
    const stats = summarizeSlice(series("2026-01-01", [0, 4, 1, 9, 0]));
    expect(stats.total).toBe(14);
    expect(stats.activeDays).toBe(3);
    expect(stats.days).toBe(5);
    expect(stats.perDay).toBeCloseTo(2.8);
    expect(stats.busiest).toEqual({ date: "2026-01-04", count: 9 });
  });

  it("reports no busiest day when nothing happened", () => {
    expect(summarizeSlice(series("2026-01-01", [0, 0])).busiest).toBeNull();
  });
});

describe("toWeekBins", () => {
  it("groups into Sunday-start weeks", () => {
    const bins = toWeekBins(series("2026-01-04", new Array(14).fill(1)));
    expect(bins).toHaveLength(2);
    expect(bins[0]).toEqual({
      weekStart: "2026-01-04",
      weekEnd: "2026-01-10",
      total: 7,
      days: 7,
    });
    expect(bins[1].weekStart).toBe("2026-01-11");
  });

  it("keeps a partial leading week in its own bin", () => {
    // 2026-01-07 is a Wednesday, so the first bin holds four days.
    const bins = toWeekBins(series("2026-01-07", new Array(10).fill(1)));
    expect(bins[0]).toMatchObject({ weekStart: "2026-01-04", days: 4 });
    expect(bins[1]).toMatchObject({ weekStart: "2026-01-11", days: 6 });
  });

  it("returns nothing for an empty series", () => {
    expect(toWeekBins([])).toEqual([]);
  });
});

describe("weekdayTotals", () => {
  it("always returns seven rows, even for an empty slice", () => {
    const rows = weekdayTotals([]);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.total === 0 && row.average === 0)).toBe(true);
  });

  it("totals and averages per weekday", () => {
    const rows = weekdayTotals(series("2026-01-04", [3, 0, 0, 0, 0, 0, 0, 5]));
    expect(rows[0]).toMatchObject({ label: "Sun", total: 8, days: 2 });
    expect(rows[0].average).toBe(4);
    expect(rows[1]).toMatchObject({ label: "Mon", total: 0, days: 1 });
  });
});

describe("calendarGrid", () => {
  it("is empty for an empty series", () => {
    expect(calendarGrid([])).toEqual({ columns: [], months: [] });
  });

  it("pads a partial first week with nulls so weekdays stay aligned", () => {
    // Starts on a Wednesday: three leading nulls.
    const grid = calendarGrid(series("2026-01-07", new Array(7).fill(1)));
    expect(grid.columns[0].cells.slice(0, 3)).toEqual([null, null, null]);
    expect(grid.columns[0].cells[3]).toMatchObject({
      date: "2026-01-07",
      weekday: 3,
    });
  });

  it("pads a partial last week with nulls", () => {
    const grid = calendarGrid(series("2026-01-04", new Array(9).fill(1)));
    const last = grid.columns[grid.columns.length - 1];
    expect(last.cells[2]).toBeNull();
  });

  it("marks a month tick on the column where a month first appears", () => {
    const grid = calendarGrid(series("2026-01-04", new Array(70).fill(1)));
    expect(grid.months[0]).toMatchObject({ column: 0, label: "Jan" });
    expect(grid.months.map((month) => month.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
    ]);
  });
});

describe("heat buckets", () => {
  it("fits edges to the data rather than to fixed counts", () => {
    const thresholds = heatThresholds(series("2026-01-01", [1, 1, 2, 3, 20]));
    expect(thresholds[0]).toBe(1);
    expect(thresholds[thresholds.length - 1]).toBe(20);
  });

  it("always makes the busiest day reachable in the top bucket", () => {
    const data = series("2026-01-01", [1, 1, 2, 3, 20]);
    const thresholds = heatThresholds(data);
    expect(bucketOf(20, thresholds)).toBe(thresholds.length);
  });

  it("returns strictly increasing edges", () => {
    const data = series("2026-01-01", [1, 1, 1, 1, 2, 9, 9, 40]);
    const thresholds = heatThresholds(data);
    thresholds.forEach((edge, index) => {
      if (index > 0) expect(edge).toBeGreaterThan(thresholds[index - 1]);
    });
  });

  it("collapses to fewer buckets when every active day is the same", () => {
    const thresholds = heatThresholds(series("2026-01-01", [2, 2, 2, 2]));
    expect(thresholds).toEqual([1, 2]);
    expect(bucketOf(2, thresholds)).toBe(2);
  });

  it("falls back to a full set of edges with no activity at all", () => {
    expect(heatThresholds(series("2026-01-01", [0, 0]))).toEqual([1, 2, 3, 4]);
  });

  it("puts an empty day in bucket 0 and the busiest in the top bucket", () => {
    const thresholds = [1, 3, 6, 10];
    expect(bucketOf(0, thresholds)).toBe(0);
    expect(bucketOf(1, thresholds)).toBe(1);
    expect(bucketOf(3, thresholds)).toBe(2);
    expect(bucketOf(6, thresholds)).toBe(3);
    expect(bucketOf(99, thresholds)).toBe(4);
  });

  it("spreads buckets across the whole ramp however many there are", () => {
    expect([1, 2, 3, 4].map((b) => rampIndexOf(b, 4))).toEqual([0, 1, 2, 3]);
    expect([1, 2].map((b) => rampIndexOf(b, 2))).toEqual([0, 3]);
    expect(rampIndexOf(1, 1)).toBe(3);
    expect(rampIndexOf(0, 4)).toBe(-1);
  });
});

describe("table rows and CSV", () => {
  it("names the weekday on every row", () => {
    const rows = tableRows(series("2026-01-04", [1, 2]));
    expect(rows[0]).toEqual({
      date: "2026-01-04",
      weekday: "Sunday",
      count: 1,
    });
    expect(rows[1].weekday).toBe("Monday");
  });

  it("sorts ascending and descending", () => {
    const rows = tableRows(series("2026-01-01", [5, 1, 3]));
    expect(sortRows(rows, "count", "asc").map((row) => row.count)).toEqual([
      1, 3, 5,
    ]);
    expect(sortRows(rows, "count", "desc").map((row) => row.count)).toEqual([
      5, 3, 1,
    ]);
  });

  it("breaks ties by date so the order never shuffles", () => {
    const rows = tableRows(series("2026-01-01", [2, 2, 2]));
    expect(sortRows(rows, "count", "desc").map((row) => row.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = tableRows(series("2026-01-01", [5, 1]));
    sortRows(rows, "count", "asc");
    expect(rows[0].count).toBe(5);
  });

  it("joins cells with a header row", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\n1,2");
  });

  it("quotes cells containing a comma or a quote", () => {
    expect(toCsv(["a"], [['x,y']])).toBe('a\n"x,y"');
    expect(toCsv(["a"], [['he said "hi"']])).toBe('a\n"he said ""hi"""');
  });
});

describe("rangeIncluding", () => {
  const range = { start: "2026-02-01", end: "2026-02-28" };

  it("leaves a range that already contains the date alone", () => {
    expect(rangeIncluding(range, "2026-02-14")).toBe(range);
  });

  it("reaches back for an earlier date", () => {
    expect(rangeIncluding(range, "2026-01-05")).toEqual({
      start: "2026-01-05",
      end: "2026-02-28",
    });
  });

  it("reaches forward for a later date", () => {
    expect(rangeIncluding(range, "2026-03-30")).toEqual({
      start: "2026-02-01",
      end: "2026-03-30",
    });
  });

  it("collapses to the single day when there is no range yet", () => {
    expect(rangeIncluding(null, "2026-02-14")).toEqual({
      start: "2026-02-14",
      end: "2026-02-14",
    });
  });

  it("keeps a pinned day visible — the bug this exists for", () => {
    const widened = rangeIncluding(range, "2026-03-30");
    const rows = applySelection(
      [{ date: "2026-03-30", count: 4 }],
      { range: widened, day: "2026-03-30" },
    );
    expect(rows).toHaveLength(1);
  });
});
