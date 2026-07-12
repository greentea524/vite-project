// #110: invite links must point at the same /big2/ page with the room
// code as ?join=, surviving existing query params and dropping hashes.

import { describe, it, expect } from "vitest";
import { buildJoinLink } from "./joinLink.js";

describe("buildJoinLink", () => {
  it("appends ?join=CODE to the current page", () => {
    expect(buildJoinLink("AB12", "https://example.com/vite-project/big2/")).toBe(
      "https://example.com/vite-project/big2/?join=AB12"
    );
  });

  it("replaces an existing join code and clears hashes", () => {
    expect(
      buildJoinLink("ZZ99", "https://example.com/big2/?join=OLD1#lobby")
    ).toBe("https://example.com/big2/?join=ZZ99");
  });

  it("returns empty for missing code or href", () => {
    expect(buildJoinLink("", "https://example.com/big2/")).toBe("");
    expect(buildJoinLink("AB12", "")).toBe("");
  });
});
