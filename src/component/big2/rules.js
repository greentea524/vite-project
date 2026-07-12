// Big 2 combination classification and comparison — KAN-59.
// Pure logic on card objects from deck.js; no React.

import { RANKS, SUITS, cardValue } from "./deck.js";

// Combination types. FIVE_CARD_TYPE_RANK orders the 5-card hands
// (straight < flush < full house < four of a kind < straight flush).
export const HAND_TYPES = {
  SINGLE: "single",
  PAIR: "pair",
  TRIPLE: "triple",
  STRAIGHT: "straight",
  FLUSH: "flush",
  FULL_HOUSE: "fullhouse",
  FOUR_OF_A_KIND: "fourofakind",
  STRAIGHT_FLUSH: "straightflush",
};

export const FIVE_CARD_TYPE_RANK = {
  [HAND_TYPES.STRAIGHT]: 1,
  [HAND_TYPES.FLUSH]: 2,
  [HAND_TYPES.FULL_HOUSE]: 3,
  [HAND_TYPES.FOUR_OF_A_KIND]: 4,
  [HAND_TYPES.STRAIGHT_FLUSH]: 5,
};

export const HAND_TYPE_LABEL = {
  [HAND_TYPES.SINGLE]: "Single",
  [HAND_TYPES.PAIR]: "Pair",
  [HAND_TYPES.TRIPLE]: "Triple",
  [HAND_TYPES.STRAIGHT]: "Straight",
  [HAND_TYPES.FLUSH]: "Flush",
  [HAND_TYPES.FULL_HOUSE]: "Full House",
  [HAND_TYPES.FOUR_OF_A_KIND]: "Four of a Kind",
  [HAND_TYPES.STRAIGHT_FLUSH]: "Straight Flush",
};

// Straights use sequence order, not Big 2 rank order: 2 is always low
// (no wrapping like K-A-2), A is normally high (10-J-Q-K-A is the top
// straight) but may also play low for the 5-4-3-2-A wheel. Exported for
// the scoring module's straight-flush detection.
export const SEQ_VALUE = {
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
  J: 11, Q: 12, K: 13, A: 14,
};

function rankIndex(card) {
  return RANKS.indexOf(card.rank);
}

function suitIndex(card) {
  return SUITS.indexOf(card.suit);
}

/**
 * If the 5 cards form a straight, return its comparison value
 * (sequence-high card's seq value, suit as tiebreaker); else null.
 */
function straightValue(cards) {
  const tryRun = (aceLow) => {
    const seq = cards
      .map((c) => ({
        card: c,
        v: c.rank === "A" && aceLow ? 1 : SEQ_VALUE[c.rank],
      }))
      .sort((a, b) => a.v - b.v);
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].v !== seq[i - 1].v + 1) return null;
    }
    const high = seq[seq.length - 1];
    return high.v * SUITS.length + suitIndex(high.card);
  };
  return tryRun(false) ?? tryRun(true);
}

/**
 * Classify a proposed play. Returns { type, size, value } where value
 * orders combinations of the same type (and same size), or null if the
 * cards are not a legal Big 2 combination.
 */
export function classifyHand(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== cards.length) return null;

  if (cards.length === 1) {
    return { type: HAND_TYPES.SINGLE, size: 1, value: cardValue(cards[0]) };
  }

  if (cards.length === 2 || cards.length === 3) {
    if (!cards.every((c) => c.rank === cards[0].rank)) return null;
    const type = cards.length === 2 ? HAND_TYPES.PAIR : HAND_TYPES.TRIPLE;
    // Pairs tie-break on the higher suit of the two; triples can never
    // tie on rank within one deck, so the suit term is harmless.
    const bestSuit = Math.max(...cards.map(suitIndex));
    return {
      type,
      size: cards.length,
      value: rankIndex(cards[0]) * SUITS.length + bestSuit,
    };
  }

  if (cards.length !== 5) return null;

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const straight = straightValue(cards);

  if (isFlush && straight !== null) {
    return { type: HAND_TYPES.STRAIGHT_FLUSH, size: 5, value: straight };
  }

  const counts = new Map();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (byCount[0][1] === 4) {
    return {
      type: HAND_TYPES.FOUR_OF_A_KIND,
      size: 5,
      value: RANKS.indexOf(byCount[0][0]),
    };
  }
  if (byCount[0][1] === 3 && byCount[1][1] === 2) {
    return {
      type: HAND_TYPES.FULL_HOUSE,
      size: 5,
      value: RANKS.indexOf(byCount[0][0]),
    };
  }
  if (isFlush) {
    // Flushes compare by suit first, then by the highest card in Big 2
    // rank order (all cards share the suit, so rank settles it).
    const bestRank = Math.max(...cards.map(rankIndex));
    return {
      type: HAND_TYPES.FLUSH,
      size: 5,
      value: suitIndex(cards[0]) * RANKS.length + bestRank,
    };
  }
  if (straight !== null) {
    return { type: HAND_TYPES.STRAIGHT, size: 5, value: straight };
  }
  return null;
}

/**
 * True if `played` (array of cards) beats `current` (array of cards, or
 * null/empty when opening a trick). Only combinations of the same card
 * count compete; among 5-card hands a higher type always wins, and ties
 * of type fall back to the type's own value ordering.
 */
export function canBeat(played, current) {
  const p = classifyHand(played);
  if (!p) return false;
  if (!current || current.length === 0) return true;
  const c = classifyHand(current);
  if (!c || p.size !== c.size) return false;
  if (p.size === 5 && p.type !== c.type) {
    return FIVE_CARD_TYPE_RANK[p.type] > FIVE_CARD_TYPE_RANK[c.type];
  }
  if (p.type !== c.type) return false;
  return p.value > c.value;
}

/**
 * Pass rules: a player may pass on any turn except when they open the
 * trick (no current combination to beat).
 */
export function canPass(currentTrick) {
  return Boolean(currentTrick && currentTrick.length > 0);
}
