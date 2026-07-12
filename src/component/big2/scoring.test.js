// KAN-62 acceptance tests: penalty tiers (including the 0-card and
// 13-card edges), both house-rule doublings, and zero-sum round deltas.

import { describe, it, expect } from "vitest";
import { makeCard } from "./deck.js";
import { penaltyPoints, scoreRound } from "./scoring.js";

const c = (id) => {
  const suit = id.slice(-1);
  const rank = id.slice(0, -1);
  return makeCard(rank, suit);
};
const hand = (...ids) => ids.map(c);

// n distinct plain cards (3..K of rotating suits) with no 2s, no quads,
// no straight-flush potential.
function plainHand(n) {
  const ranks = ["3", "5", "7", "9", "J", "K", "4", "6", "8", "10", "Q", "3", "5"];
  const suits = ["D", "C", "H", "S"];
  return Array.from({ length: n }, (_, i) =>
    makeCard(ranks[i], suits[(i + Math.floor(i / 4)) % 4])
  );
}

describe("penaltyPoints — tiers", () => {
  it("scores 0 for an empty hand", () => {
    expect(penaltyPoints([]).points).toBe(0);
  });

  it("scores 1 point per card for 1-9 cards", () => {
    expect(penaltyPoints(plainHand(1)).points).toBe(1);
    expect(penaltyPoints(plainHand(9)).points).toBe(9);
  });

  it("scores 2 points per card for 10-12 cards", () => {
    expect(penaltyPoints(plainHand(10)).points).toBe(20);
    expect(penaltyPoints(plainHand(12)).points).toBe(24);
  });

  it("scores 3 points per card for all 13 cards", () => {
    expect(penaltyPoints(plainHand(13)).points).toBe(39);
  });
});

describe("penaltyPoints — house-rule doublings", () => {
  it("doubles for an unused 2", () => {
    const p = penaltyPoints(hand("2S", "5D", "9C"));
    expect(p.doubledByTwos).toBe(true);
    expect(p.points).toBe(6); // 3 cards ×1, doubled
  });

  it("doubles for an unused four-of-a-kind", () => {
    const p = penaltyPoints(hand("9D", "9C", "9H", "9S", "4D"));
    expect(p.doubledByStrong).toBe(true);
    expect(p.points).toBe(10); // 5 ×1, doubled
  });

  it("doubles for an unused straight flush (including the wheel)", () => {
    const p = penaltyPoints(hand("5H", "6H", "7H", "8H", "9H", "3D"));
    expect(p.doubledByStrong).toBe(true);
    expect(p.points).toBe(12); // 6 ×1, doubled
    const wheel = penaltyPoints(hand("AH", "2H", "3H", "4H", "5H", "6D"));
    expect(wheel.doubledByStrong).toBe(true);
  });

  it("stacks both doublings (×4)", () => {
    const p = penaltyPoints(hand("2S", "9D", "9C", "9H", "9S"));
    expect(p.points).toBe(20); // 5 ×1 ×2 ×2
  });

  it("a full 13-card hand with a 2 hits 78", () => {
    const cards = [...plainHand(12), c("2S")];
    expect(penaltyPoints(cards).points).toBe(78); // 13×3 = 39, doubled
  });

  it("can be turned off", () => {
    expect(penaltyPoints(hand("2S", "5D", "9C"), false).points).toBe(3);
  });
});

describe("scoreRound", () => {
  it("winner nets the sum of the losers' penalties (zero-sum)", () => {
    const hands = [[], plainHand(3), plainHand(10), hand("2S", "4D")];
    const { breakdown, winnerGain, deltas } = scoreRound(hands, 0);
    expect(breakdown[0].points).toBe(0);
    expect(breakdown[1].points).toBe(3);
    expect(breakdown[2].points).toBe(20);
    expect(breakdown[3].points).toBe(4); // 2 ×1, doubled for the 2
    expect(winnerGain).toBe(27);
    expect(deltas).toEqual([27, -3, -20, -4]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
