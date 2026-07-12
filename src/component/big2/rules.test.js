// KAN-59 acceptance tests: classification of all 8 combination types,
// rejection of invalid combos, canBeat comparisons (including suit
// tiebreakers and 5-card type ordering), and pass logic.

import { describe, it, expect } from "vitest";
import { makeCard } from "./deck.js";
import { classifyHand, canBeat, canPass, HAND_TYPES } from "./rules.js";

// "QS" → card object; keeps hands readable.
const c = (id) => {
  const suit = id.slice(-1);
  const rank = id.slice(0, -1);
  return makeCard(rank, suit);
};
const hand = (...ids) => ids.map(c);

describe("classifyHand — all 8 types", () => {
  it("classifies singles, pairs, and triples", () => {
    expect(classifyHand(hand("7H")).type).toBe(HAND_TYPES.SINGLE);
    expect(classifyHand(hand("7H", "7D")).type).toBe(HAND_TYPES.PAIR);
    expect(classifyHand(hand("7H", "7D", "7S")).type).toBe(HAND_TYPES.TRIPLE);
  });

  it("classifies straights (mixed suits, 5 consecutive)", () => {
    expect(classifyHand(hand("5D", "6C", "7H", "8S", "9D")).type).toBe(
      HAND_TYPES.STRAIGHT
    );
  });

  it("classifies flushes (same suit, non-consecutive)", () => {
    expect(classifyHand(hand("3H", "6H", "9H", "JH", "KH")).type).toBe(
      HAND_TYPES.FLUSH
    );
  });

  it("classifies full houses and four of a kind", () => {
    expect(classifyHand(hand("9D", "9C", "9H", "4S", "4D")).type).toBe(
      HAND_TYPES.FULL_HOUSE
    );
    expect(classifyHand(hand("9D", "9C", "9H", "9S", "4D")).type).toBe(
      HAND_TYPES.FOUR_OF_A_KIND
    );
  });

  it("classifies straight flushes", () => {
    expect(classifyHand(hand("5H", "6H", "7H", "8H", "9H")).type).toBe(
      HAND_TYPES.STRAIGHT_FLUSH
    );
  });
});

describe("classifyHand — straight edge rules", () => {
  it("allows the A-low wheel (5-4-3-2-A)", () => {
    expect(classifyHand(hand("5D", "4C", "3H", "2S", "AD")).type).toBe(
      HAND_TYPES.STRAIGHT
    );
  });

  it("treats 10-J-Q-K-A as the highest straight", () => {
    const top = hand("10D", "JC", "QH", "KS", "AD");
    expect(classifyHand(top).type).toBe(HAND_TYPES.STRAIGHT);
    const nextBest = hand("9D", "10C", "JH", "QS", "KD");
    expect(canBeat(top, nextBest)).toBe(true);
  });

  it("rejects straights that wrap through 2 (J-Q-K-A-2, 2-3-4-5 with K)", () => {
    expect(classifyHand(hand("JD", "QC", "KH", "AS", "2D"))).toBeNull();
    expect(classifyHand(hand("QD", "KC", "AH", "2S", "3D"))).toBeNull();
  });

  it("ranks the wheel below a 6-high straight (A plays low)", () => {
    const wheel = hand("5D", "4C", "3H", "2S", "AD");
    const sixHigh = hand("2D", "3C", "4H", "5S", "6D");
    expect(canBeat(sixHigh, wheel)).toBe(true);
    expect(canBeat(wheel, sixHigh)).toBe(false);
  });
});

describe("classifyHand — invalid combinations", () => {
  it("rejects empty, mismatched pairs, and bad sizes", () => {
    expect(classifyHand([])).toBeNull();
    expect(classifyHand(null)).toBeNull();
    expect(classifyHand(hand("7H", "8H"))).toBeNull(); // not a pair
    expect(classifyHand(hand("7H", "7D", "8S"))).toBeNull(); // not a triple
    expect(classifyHand(hand("3H", "6H", "9H"))).toBeNull(); // 3-card "flush"
    expect(classifyHand(hand("7H", "7D", "7S", "7C"))).toBeNull(); // 4 cards
  });

  it("rejects 5 cards that form nothing", () => {
    expect(classifyHand(hand("3D", "5C", "8H", "JS", "KD"))).toBeNull();
  });

  it("rejects duplicate cards", () => {
    expect(classifyHand(hand("7H", "7H"))).toBeNull();
  });
});

describe("canBeat — like-for-like comparisons", () => {
  it("singles: rank first, suit breaks ties (2♠ > 2♥ > A♠)", () => {
    expect(canBeat(hand("2S"), hand("2H"))).toBe(true);
    expect(canBeat(hand("2H"), hand("AS"))).toBe(true);
    expect(canBeat(hand("AS"), hand("2H"))).toBe(false);
  });

  it("pairs: higher rank wins; same rank decided by best suit", () => {
    expect(canBeat(hand("9D", "9C"), hand("8S", "8H"))).toBe(true);
    // 9♠+9♦ contains the spade, beating 9♥+9♣
    expect(canBeat(hand("9S", "9D"), hand("9H", "9C"))).toBe(true);
    expect(canBeat(hand("9H", "9C"), hand("9S", "9D"))).toBe(false);
  });

  it("straights: highest card, then its suit", () => {
    const nineHighSpade = hand("5D", "6C", "7H", "8S", "9S");
    const nineHighHeart = hand("5C", "6D", "7S", "8H", "9H");
    expect(canBeat(nineHighSpade, nineHighHeart)).toBe(true);
    expect(canBeat(nineHighHeart, nineHighSpade)).toBe(false);
  });

  it("flushes: suit first, then highest card", () => {
    const clubFlushHigh = hand("4C", "7C", "9C", "JC", "AC");
    const diamondFlushHigher = hand("5D", "8D", "10D", "QD", "2D");
    // Clubs outrank diamonds even though the diamond flush has a 2.
    expect(canBeat(clubFlushHigh, diamondFlushHigher)).toBe(true);
    const clubFlushLow = hand("3C", "5C", "8C", "10C", "QC");
    expect(canBeat(clubFlushHigh, clubFlushLow)).toBe(true);
  });

  it("full houses and quads: by the triple/quad rank", () => {
    expect(
      canBeat(hand("10D", "10C", "10H", "3S", "3D"), hand("9D", "9C", "9H", "AS", "AD"))
    ).toBe(true);
    expect(
      canBeat(hand("5D", "5C", "5H", "5S", "3D"), hand("4D", "4C", "4H", "4S", "2D"))
    ).toBe(true);
  });
});

describe("canBeat — cross-type and cross-size rules", () => {
  it("only same card counts compete", () => {
    expect(canBeat(hand("2S"), hand("3D", "3C"))).toBe(false);
    expect(canBeat(hand("2S", "2H"), hand("3D"))).toBe(false);
    expect(canBeat(hand("2S", "2H", "2D"), hand("5D", "6C", "7H", "8S", "9D"))).toBe(
      false
    );
  });

  it("5-card type hierarchy: straight < flush < full house < quads < straight flush", () => {
    const straight = hand("5D", "6C", "7H", "8S", "9D");
    const flush = hand("3H", "6H", "9H", "JH", "KH");
    const fullHouse = hand("4D", "4C", "4H", "3S", "3D");
    const quads = hand("3D", "3C", "3H", "3S", "4D");
    const straightFlush = hand("3H", "4H", "5H", "6H", "7H");
    expect(canBeat(flush, straight)).toBe(true);
    expect(canBeat(fullHouse, flush)).toBe(true);
    expect(canBeat(quads, fullHouse)).toBe(true);
    expect(canBeat(straightFlush, quads)).toBe(true);
    expect(canBeat(straight, flush)).toBe(false);
    expect(canBeat(flush, fullHouse)).toBe(false);
  });

  it("an invalid play never beats anything", () => {
    expect(canBeat(hand("7H", "8H"), hand("3D", "3C"))).toBe(false);
    expect(canBeat([], hand("3D"))).toBe(false);
  });

  it("any valid combination may open an empty trick", () => {
    expect(canBeat(hand("3D"), null)).toBe(true);
    expect(canBeat(hand("3D"), [])).toBe(true);
    expect(canBeat(hand("7H", "8H"), null)).toBe(false); // still must be valid
  });
});

describe("canPass", () => {
  it("allows passing only when there is a trick to beat", () => {
    expect(canPass(hand("3D"))).toBe(true);
    expect(canPass(hand("5D", "6C", "7H", "8S", "9D"))).toBe(true);
    expect(canPass(null)).toBe(false);
    expect(canPass([])).toBe(false);
  });
});
