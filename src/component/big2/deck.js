// Big 2 (大老二) deck logic — KAN-58.
// Pure data + functions, no React. UI lives in Card.jsx / Big2.jsx.

// Rank order low → high (Big 2: 2 is highest, 3 is lowest).
export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

// Suit order low → high: Diamonds < Clubs < Hearts < Spades.
export const SUITS = ["D", "C", "H", "S"];

export const SUIT_SYMBOL = { D: "♦", C: "♣", H: "♥", S: "♠" };
export const SUIT_NAME = { D: "Diamonds", C: "Clubs", H: "Hearts", S: "Spades" };
export const SUIT_COLOR = { D: "red", H: "red", C: "black", S: "black" };

export const PLAYER_COUNT = 4;
export const HAND_SIZE = 13;

/** Make a card object. id is stable ("3D", "10S", …) for React keys. */
export function makeCard(rank, suit) {
  return { rank, suit, id: `${rank}${suit}` };
}

/** Standard 52-card deck (no jokers), in sorted low → high order. */
export function createDeck() {
  const deck = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

/**
 * Total ordering of a single card under Big 2 rules.
 * Rank dominates; suit breaks ties (e.g. 2♠ > 2♥ > A♠).
 */
export function cardValue(card) {
  return RANKS.indexOf(card.rank) * SUITS.length + SUITS.indexOf(card.suit);
}

/** Comparator for Array.prototype.sort — ascending Big 2 order. */
export function compareCards(a, b) {
  return cardValue(a) - cardValue(b);
}

/** Sorted copy of a hand, ascending (3♦ first, 2♠ last). */
export function sortHand(hand) {
  return [...hand].sort(compareCards);
}

/**
 * Suit-first comparator (#114): groups ♦, ♣, ♥, ♠ with ranks ascending
 * inside each suit — the layout that makes flushes easy to spot.
 */
export function compareBySuit(a, b) {
  const suit = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  return suit !== 0 ? suit : RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
}

/** Sorted copy of a hand grouped by suit (see compareBySuit). */
export function sortHandBySuit(hand) {
  return [...hand].sort(compareBySuit);
}

/**
 * Fisher–Yates shuffle. Returns a new array; the input is not mutated.
 * rng is injectable for deterministic tests.
 */
export function shuffle(deck, rng = Math.random) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Shuffle and deal the full deck round-robin into 4 hands of 13,
 * each hand pre-sorted ascending.
 */
export function deal(rng = Math.random) {
  const shuffled = shuffle(createDeck(), rng);
  const hands = Array.from({ length: PLAYER_COUNT }, () => []);
  shuffled.forEach((card, i) => hands[i % PLAYER_COUNT].push(card));
  return hands.map(sortHand);
}

/**
 * The player holding the 3♦ leads the first trick.
 * Returns the index into hands, or -1 if not found (bad input).
 */
export function findStartingPlayer(hands) {
  return hands.findIndex((hand) => hand.some((c) => c.rank === "3" && c.suit === "D"));
}
