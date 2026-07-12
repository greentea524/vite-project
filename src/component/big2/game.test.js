// KAN-60 state-machine tests: turn rotation, trick lifecycle (clears
// when the turn returns to the owner), legality guards, win detection.

import { describe, it, expect } from "vitest";
import { newGame, playCards, passTurn } from "./game.js";
import { PLAYER_COUNT } from "./deck.js";

// Seeded rng so every test deals the same hands.
function seededRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function freshGame() {
  return newGame(seededRng());
}

describe("newGame", () => {
  it("gives the 3♦ holder the lead with no trick on the table", () => {
    const state = freshGame();
    expect(state.trick).toBeNull();
    expect(state.winner).toBeNull();
    expect(state.hands[state.turn].some((c) => c.id === "3D")).toBe(true);
  });
});

describe("playCards", () => {
  it("moves the cards out of the hand onto the trick and advances the turn", () => {
    const state = freshGame();
    const opener = state.turn;
    const lowest = state.hands[opener][0];
    const next = playCards(state, [lowest.id]);
    expect(next.hands[opener]).toHaveLength(12);
    expect(next.hands[opener].some((c) => c.id === lowest.id)).toBe(false);
    expect(next.trick).toEqual({ cards: [lowest], owner: opener });
    expect(next.turn).toBe((opener + 1) % PLAYER_COUNT);
  });

  it("rejects cards the player does not hold", () => {
    const state = freshGame();
    const notMine = state.hands[(state.turn + 1) % PLAYER_COUNT][0];
    expect(playCards(state, [notMine.id])).toBe(state);
  });

  it("rejects plays that cannot beat the current trick", () => {
    let state = freshGame();
    // Opener leads their highest single; next player tries their lowest.
    const opener = state.turn;
    const high = state.hands[opener][12];
    state = playCards(state, [high.id]);
    const weak = state.hands[state.turn][0];
    // Seeded deal: next player's lowest single can't beat the opener's
    // highest card unless it's a 2 — guard the assumption.
    expect(weak.rank).not.toBe("2");
    expect(playCards(state, [weak.id])).toBe(state);
  });

  it("declares a winner when a hand empties", () => {
    let state = freshGame();
    // Play out the opener's whole hand as singles, others always pass.
    const opener = state.turn;
    while (state.winner === null) {
      if (state.turn === opener) {
        state = playCards(state, [state.hands[opener][0].id]);
      } else {
        state = passTurn(state);
      }
    }
    expect(state.winner).toBe(opener);
    expect(state.hands[opener]).toHaveLength(0);
  });
});

describe("passTurn", () => {
  it("cannot pass when opening a trick", () => {
    const state = freshGame();
    expect(state.trick).toBeNull();
    expect(passTurn(state)).toBe(state);
  });

  it("clears the trick back to the owner after three passes", () => {
    let state = freshGame();
    const opener = state.turn;
    state = playCards(state, [state.hands[opener][0].id]);
    state = passTurn(state);
    state = passTurn(state);
    expect(state.trick).not.toBeNull();
    state = passTurn(state);
    expect(state.turn).toBe(opener);
    expect(state.trick).toBeNull(); // owner leads a fresh trick
  });
});
