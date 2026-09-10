import { describe, it, expect } from "vitest";
import { exportFileName, slugifyRange, svgDataUrl } from "./exportView.js";

describe("exportFileName", () => {
  it("names a file after the selected range", () => {
    expect(
      exportFileName("csv", { start: "2026-01-01", end: "2026-03-01" }),
    ).toBe("github-activity_2026-01-01_2026-03-01.csv");
  });

  it("says 'all' when nothing is selected", () => {
    expect(exportFileName("png", null)).toBe("github-activity_all.png");
  });

  it("appends a qualifier", () => {
    expect(exportFileName("png", null, "calendar")).toBe(
      "github-activity_all_calendar.png",
    );
  });

  it("slugifies a range into both endpoints", () => {
    expect(slugifyRange({ start: "2026-01-01", end: "2026-01-02" })).toBe(
      "2026-01-01_2026-01-02",
    );
  });
});

describe("svgDataUrl", () => {
  it("percent-encodes markup so the '#' in a colour cannot truncate it", () => {
    const url = svgDataUrl('<svg><rect fill="#2a78d6"/></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).not.toContain("#");
    expect(decodeURIComponent(url.split(",")[1])).toContain('fill="#2a78d6"');
  });
});
