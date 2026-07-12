// KAN-58 acceptance tests: deck composition, Big 2 ordering,
// shuffle/deal, and starting-player (3♦) identification.

import { describe, it, expect } from "vitest";
import {
  RANKS,
  SUITS,
  createDeck,
  makeCard,
  cardValue,
  compareCards,
  sortHand,
  sortHandBySuit,
  shuffle,
  deal,
  findStartingPlayer,
  PLAYER_COUNT,
  HAND_SIZE,
} from "./deck.js";

describe("createDeck", () => {
  it("has 52 unique cards, 13 ranks x 4 suits", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const rank of RANKS) {
      expect(deck.filter((c) => c.rank === rank)).toHaveLength(4);
    }
    for (const suit of SUITS) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
  });
});

describe("Big 2 ordering", () => {
  it("ranks 2 highest and 3 lowest", () => {
    expect(cardValue(makeCard("2", "D"))).toBeGreaterThan(cardValue(makeCard("A", "S")));
    expect(cardValue(makeCard("3", "S"))).toBeLessThan(cardValue(makeCard("4", "D")));
  });

  it("breaks rank ties by suit: ♠ > ♥ > ♣ > ♦", () => {
    const order = ["D", "C", "H", "S"];
    for (let i = 1; i < order.length; i++) {
      expect(
        compareCards(makeCard("9", order[i]), makeCard("9", order[i - 1]))
      ).toBeGreaterThan(0);
    }
  });

  it("2♠ > 2♥ > A♠ (example from the ticket)", () => {
    const twoSpades = makeCard("2", "S");
    const twoHearts = makeCard("2", "H");
    const aceSpades = makeCard("A", "S");
    expect(cardValue(twoSpades)).toBeGreaterThan(cardValue(twoHearts));
    expect(cardValue(twoHearts)).toBeGreaterThan(cardValue(aceSpades));
  });

  it("sortHand sorts ascending with 3♦ lowest and 2♠ highest", () => {
    const sorted = sortHand(createDeck());
    expect(sorted[0].id).toBe("3D");
    expect(sorted[51].id).toBe("2S");
  });

  it("sortHandBySuit groups ♦♣♥♠ with ranks ascending inside each suit (#114)", () => {
    const sorted = sortHandBySuit(createDeck());
    // 13 diamonds, then clubs, hearts, spades — each run 3 → 2.
    expect(sorted.map((c) => c.suit)).toEqual(
      SUITS.flatMap((s) => Array(13).fill(s))
    );
    expect(sorted[0].id).toBe("3D");
    expect(sorted[12].id).toBe("2D");
    expect(sorted[13].id).toBe("3C");
    expect(sorted[51].id).toBe("2S");
    // Does not mutate the input.
    const hand = [makeCard("2", "S"), makeCard("3", "S"), makeCard("4", "D")];
    const copy = [...hand];
    sortHandBySuit(hand);
    expect(hand).toEqual(copy);
  });
});

describe("shuffle", () => {
  it("keeps the same 52 cards and does not mutate the input", () => {
    const deck = createDeck();
    const before = deck.map((c) => c.id);
    const shuffled = shuffle(deck);
    expect(deck.map((c) => c.id)).toEqual(before);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(52);
  });

  it("is deterministic with an injected rng", () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    let seed2 = 42;
    const rng2 = () => {
      seed2 = (seed2 * 1664525 + 1013904223) % 2 ** 32;
      return seed2 / 2 ** 32;
    };
    expect(shuffle(createDeck(), rng).map((c) => c.id)).toEqual(
      shuffle(createDeck(), rng2).map((c) => c.id)
    );
  });
});

describe("deal", () => {
  it("deals 4 sorted hands of 13 covering the whole deck", () => {
    const hands = deal();
    expect(hands).toHaveLength(PLAYER_COUNT);
    const all = hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    for (const hand of hands) {
      expect(hand).toHaveLength(HAND_SIZE);
      for (let i = 1; i < hand.length; i++) {
        expect(cardValue(hand[i])).toBeGreaterThan(cardValue(hand[i - 1]));
      }
    }
  });
});

describe("findStartingPlayer", () => {
  it("finds the holder of 3♦ on every deal", () => {
    for (let i = 0; i < 20; i++) {
      const hands = deal();
      const idx = findStartingPlayer(hands);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(hands[idx].some((c) => c.id === "3D")).toBe(true);
    }
  });

  it("returns -1 when 3♦ is absent", () => {
    expect(findStartingPlayer([[makeCard("2", "S")], []])).toBe(-1);
  });
});
