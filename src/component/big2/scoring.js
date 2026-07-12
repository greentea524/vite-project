// Big 2 end-of-round scoring — KAN-62. Pure functions over the hands
// left when someone goes out.
//
// Penalty tiers (per card remaining): 1–9 cards → 1pt, 10–12 → 2pts,
// all 13 (never played) → 3pts. House-rule doublings (each applied
// once, multiplicatively): holding any unused 2 doubles the penalty,
// and holding an unused four-of-a-kind or straight flush doubles it
// again. The winner nets the sum of everyone else's penalties.

import { SEQ_VALUE } from "./rules.js";

function hasFourOfAKind(hand) {
  const counts = new Map();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return [...counts.values()].some((n) => n === 4);
}

function hasStraightFlush(hand) {
  const bySuit = new Map();
  for (const c of hand) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, new Set());
    const seqs = bySuit.get(c.suit);
    seqs.add(SEQ_VALUE[c.rank]);
    if (c.rank === "A") seqs.add(1); // wheel: A plays low too
  }
  for (const seqs of bySuit.values()) {
    for (let v = 1; v + 4 <= 14; v++) {
      if ([0, 1, 2, 3, 4].every((d) => seqs.has(v + d))) return true;
    }
  }
  return false;
}

/**
 * Penalty for one losing hand. Returns a breakdown for the results
 * screen: { cardsLeft, base, doubledByTwos, doubledByStrong, points }.
 */
export function penaltyPoints(hand, houseRules = true) {
  const cardsLeft = hand.length;
  const perCard = cardsLeft === 13 ? 3 : cardsLeft >= 10 ? 2 : 1;
  const base = cardsLeft * perCard;
  const doubledByTwos = houseRules && hand.some((c) => c.rank === "2");
  const doubledByStrong =
    houseRules && (hasFourOfAKind(hand) || hasStraightFlush(hand));
  let points = base;
  if (doubledByTwos) points *= 2;
  if (doubledByStrong) points *= 2;
  return { cardsLeft, base, doubledByTwos, doubledByStrong, points };
}

/**
 * Score a finished round. deltas is zero-sum: the winner gains the sum
 * of the losers' penalties, each loser drops their own penalty.
 */
export function scoreRound(hands, winner, houseRules = true) {
  const breakdown = hands.map((hand, i) =>
    i === winner
      ? { cardsLeft: 0, base: 0, doubledByTwos: false, doubledByStrong: false, points: 0 }
      : penaltyPoints(hand, houseRules)
  );
  const winnerGain = breakdown.reduce((sum, b) => sum + b.points, 0);
  const deltas = breakdown.map((b, i) => (i === winner ? winnerGain : -b.points));
  return { breakdown, winnerGain, deltas };
}
