// Big 2 bot opponents — KAN-61. Pure move selection over the rules
// module; the UI schedules the turns with a natural delay.
//
// Basic strategy: beat the trick with the lowest valid combination,
// lead the lowest single (or its pair, to shed faster) when opening,
// pass when nothing fits. Endgame twist: with 1–2 cards left, play the
// strongest valid option instead to snatch the win.

import { sortHand } from "./deck.js";
import { classifyHand, canBeat, FIVE_CARD_TYPE_RANK } from "./rules.js";

/** All k-card subsets of hand (n ≤ 13, k ≤ 5 → at most 1287). */
function* combinations(cards, k, start = 0, picked = []) {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= cards.length - (k - picked.length); i++) {
    yield* combinations(cards, k, i + 1, [...picked, cards[i]]);
  }
}

/** Orders same-size candidates weakest → strongest. */
function strength(cls) {
  return cls.size === 5
    ? FIVE_CARD_TYPE_RANK[cls.type] * 10000 + cls.value
    : cls.value;
}

/** Every legal combination of `size` cards that beats the trick. */
function beatingCandidates(hand, trickCards, size) {
  const out = [];
  for (const cards of combinations(hand, size)) {
    const cls = classifyHand(cards);
    if (cls && canBeat(cards, trickCards)) out.push({ cards, cls });
  }
  return out;
}

/**
 * Decide the bot's move for its hand against the current trick
 * (null/empty = bot opens). Returns { type: "play", cardIds } or
 * { type: "pass" }. An opener always plays, so the game never stalls.
 */
export function chooseBotMove(hand, trickCards) {
  if (!trickCards || trickCards.length === 0) {
    // Open with the lowest card; take its pair partner along when one
    // exists to shed low cards faster.
    const sorted = sortHand(hand);
    const lowest = sorted[0];
    const partners = sorted.filter((c) => c.rank === lowest.rank);
    const lead = partners.length >= 2 ? partners.slice(0, 2) : [lowest];
    return { type: "play", cardIds: lead.map((c) => c.id) };
  }

  const candidates = beatingCandidates(hand, trickCards, trickCards.length);
  if (candidates.length === 0) return { type: "pass" };

  candidates.sort((a, b) => strength(a.cls) - strength(b.cls));
  // Down to 1–2 cards: play to win, not to conserve.
  const pick =
    hand.length <= 2 ? candidates[candidates.length - 1] : candidates[0];
  return { type: "play", cardIds: pick.cards.map((c) => c.id) };
}
