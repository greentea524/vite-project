// Big 2 table state — KAN-60. Pure, immutable state transitions the
// UI (and later the bots/server) drive: turn rotation, trick lifecycle,
// and win detection. Scoring lands in KAN-62.

import { deal, findStartingPlayer, PLAYER_COUNT } from "./deck.js";
import { canBeat, canPass, classifyHand, COMBO_BONUSES } from "./rules.js";

/**
 * Fresh round: dealt hands (pre-sorted), 3♦ holder to lead, no trick.
 * state.trick is null between tricks, else { cards, owner }.
 */
export function newGame(rng = Math.random) {
  const hands = deal(rng);
  return {
    hands,
    turn: findStartingPlayer(hands),
    trick: null,
    winner: null,
    comboBonuses: [0, 0, 0, 0],
  };
}

/**
 * Advance to the next seat. When the turn would return to the trick
 * owner, everyone else passed (or couldn't beat it): the trick clears
 * and the owner leads fresh.
 */
function advanceTurn(state) {
  const turn = (state.turn + 1) % PLAYER_COUNT;
  if (state.trick && turn === state.trick.owner) {
    return { ...state, turn, trick: null };
  }
  return { ...state, turn };
}

/**
 * The current player plays the given card ids from their hand.
 * Returns the next state, or the original state unchanged if the play
 * is illegal (UI disables these paths; this is the final guard).
 */
export function playCards(state, cardIds) {
  if (state.winner !== null) return state;
  const hand = state.hands[state.turn];
  const ids = new Set(cardIds);
  const cards = hand.filter((c) => ids.has(c.id));
  if (cards.length !== ids.size) return state;
  if (!canBeat(cards, state.trick?.cards)) return state;

  const classified = classifyHand(cards);
  const bonus = (classified && COMBO_BONUSES[classified.type]) || 0;
  const currentBonuses = state.comboBonuses ?? [0, 0, 0, 0];
  const comboBonuses =
    bonus > 0
      ? currentBonuses.map((b, i) => (i === state.turn ? b + bonus : b))
      : currentBonuses;

  const nextHand = hand.filter((c) => !ids.has(c.id));
  const hands = state.hands.map((h, i) => (i === state.turn ? nextHand : h));
  const played = {
    ...state,
    hands,
    trick: { cards, owner: state.turn },
    winner: nextHand.length === 0 ? state.turn : null,
    comboBonuses,
  };
  return played.winner !== null ? played : advanceTurn(played);
}

/**
 * The current player passes. Illegal when opening a trick (nothing to
 * beat); returns the original state unchanged in that case.
 */
export function passTurn(state) {
  if (state.winner !== null) return state;
  if (!canPass(state.trick?.cards)) return state;
  return advanceTurn(state);
}
