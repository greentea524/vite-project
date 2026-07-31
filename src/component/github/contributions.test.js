import { describe, it, expect } from "vitest";
import {
  buildContributionsUrl,
  parseContributions,
  summarize,
  toCalendarRows,
  toLocalDate,
  toTrendRows,
} from "./contributions.js";

function payload(entries) {
  return { total: { lastYear: 0 }, contributions: entries };
}

describe("buildContributionsUrl", () => {
  it("targets the v4 endpoint for the requested year", () => {
    expect(buildContributionsUrl("greentea524", "last")).toBe(
      "https://github-contributions-api.jogruber.de/v4/greentea524?y=last",
    );
  });

  it("escapes the username", () => {
    expect(buildContributionsUrl("a b", 2025)).toContain("/v4/a%20b?y=2025");
  });
});

describe("toLocalDate", () => {
  it("keeps the calendar day in the local timezone", () => {
    const date = toLocalDate("2026-07-30");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(30);
  });
});

describe("parseContributions", () => {
  it("sorts ascending and coerces counts", () => {
    const series = parseContributions(
      payload([
        { date: "2026-01-03", count: "4", level: 2 },
        { date: "2026-01-01", count: 0, level: 0 },
      ]),
    );

    expect(series).toEqual([
      { date: "2026-01-01", count: 0 },
      { date: "2026-01-03", count: 4 },
    ]);
  });

  it("drops malformed entries", () => {
    const series = parseContributions(
      payload([
        { date: "2026-01-01", count: 1 },
        { date: "not-a-date", count: 3 },
        { date: "2026-01-02", count: "nope" },
        null,
      ]),
    );

    expect(series).toEqual([{ date: "2026-01-01", count: 1 }]);
  });

  it("clamps negative counts to zero", () => {
    expect(parseContributions(payload([{ date: "2026-01-01", count: -5 }]))).toEqual(
      [{ date: "2026-01-01", count: 0 }],
    );
  });

  it("throws when the response shape is unrecognized", () => {
    expect(() => parseContributions(null)).toThrow(/unexpected/i);
    expect(() => parseContributions({})).toThrow(/unexpected/i);
    expect(() => parseContributions({ contributions: "nope" })).toThrow(
      /unexpected/i,
    );
  });
});

describe("toCalendarRows", () => {
  it("emits a typed header plus one row per day", () => {
    const rows = toCalendarRows([{ date: "2026-01-01", count: 3 }]);

    expect(rows[0]).toEqual([
      { type: "date", id: "Date" },
      { type: "number", id: "Contributions" },
    ]);
    expect(rows[1][0]).toBeInstanceOf(Date);
    expect(rows[1][1]).toBe(3);
  });
});

describe("toTrendRows", () => {
  it("averages over the partial window before it fills", () => {
    const rows = toTrendRows(
      [
        { date: "2026-01-01", count: 2 },
        { date: "2026-01-02", count: 4 },
      ],
      7,
    );

    expect(rows[1][1]).toBe(2);
    expect(rows[2][1]).toBe(3);
  });

  it("slides the window once it is full", () => {
    const series = [
      { date: "2026-01-01", count: 3 },
      { date: "2026-01-02", count: 3 },
      { date: "2026-01-03", count: 0 },
    ];

    const rows = toTrendRows(series, 2);

    expect(rows[3][1]).toBe(1.5);
  });
});

describe("summarize", () => {
  it("returns an empty summary for an empty series", () => {
    expect(summarize([])).toEqual({
      total: 0,
      activeDays: 0,
      bestDay: null,
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  it("totals contributions and finds the best day", () => {
    const stats = summarize([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 9 },
      { date: "2026-01-03", count: 0 },
    ]);

    expect(stats.total).toBe(10);
    expect(stats.activeDays).toBe(2);
    expect(stats.bestDay).toEqual({ date: "2026-01-02", count: 9 });
  });

  it("tracks the longest streak across gaps", () => {
    const stats = summarize([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 1 },
      { date: "2026-01-03", count: 0 },
      { date: "2026-01-04", count: 1 },
    ]);

    expect(stats.longestStreak).toBe(2);
  });

  it("does not let a quiet final day break the current streak", () => {
    const stats = summarize([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 1 },
      { date: "2026-01-03", count: 0 },
    ]);

    expect(stats.currentStreak).toBe(2);
  });

  it("breaks the current streak on an older gap", () => {
    const stats = summarize([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 0 },
      { date: "2026-01-03", count: 0 },
    ]);

    expect(stats.currentStreak).toBe(0);
  });

  it("reports no best day when nothing happened", () => {
    expect(summarize([{ date: "2026-01-01", count: 0 }]).bestDay).toBeNull();
  });
});
