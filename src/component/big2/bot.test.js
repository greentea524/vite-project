// KAN-61 acceptance tests: bots always produce a legal move or pass,
// follow the lowest-valid strategy, and full bot-vs-bot games always
// run from deal to a winner without stalling.

import { describe, it, expect } from "vitest";
import { makeCard } from "./deck.js";
import { canBeat } from "./rules.js";
import { newGame, playCards, passTurn } from "./game.js";
import { chooseBotMove } from "./bot.js";

const c = (id) => {
  const suit = id.slice(-1);
  const rank = id.slice(0, -1);
  return makeCard(rank, suit);
};
const hand = (...ids) => ids.map(c);

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe("chooseBotMove — opening", () => {
  it("leads the lowest single", () => {
    const move = chooseBotMove(hand("KD", "5C", "9H", "3S"), null);
    expect(move).toEqual({ type: "play", cardIds: ["3S"] });
  });

  it("leads the pair when the lowest card has a partner", () => {
    const move = chooseBotMove(hand("KD", "3C", "9H", "3D"), null);
    expect(move.type).toBe("play");
    expect(move.cardIds.sort()).toEqual(["3C", "3D"]);
  });
});

describe("chooseBotMove — beating a trick", () => {
  it("plays the lowest single that beats", () => {
    const move = chooseBotMove(hand("2S", "9H", "JC", "5D"), hand("8C"));
    expect(move).toEqual({ type: "play", cardIds: ["9H"] });
  });

  it("plays the lowest pair that beats", () => {
    const move = chooseBotMove(
      hand("9H", "9C", "KD", "KS", "4D"),
      hand("8S", "8H")
    );
    expect(move.type).toBe("play");
    expect(move.cardIds.sort()).toEqual(["9C", "9H"]);
  });

  it("finds a 5-card answer, preferring the weakest type", () => {
    // Holds both a straight (5-9) and a flush (hearts); a straight
    // already beats the 8-high straight on the table, and is weaker
    // than the flush, so it should be kept back.
    const move = chooseBotMove(
      hand("5D", "6H", "7H", "8H", "9H", "5H", "2H"),
      hand("4D", "5C", "6S", "7H", "8C")
    );
    expect(move.type).toBe("play");
    const played = move.cardIds.sort().join(",");
    expect(played).toBe(["5D", "6H", "7H", "8H", "9H"].sort().join(","));
  });

  it("passes when nothing beats the trick", () => {
    expect(chooseBotMove(hand("3C", "4D", "5H"), hand("2S"))).toEqual({
      type: "pass",
    });
    // Right sizes but too weak: pair of 4s vs pair of kings.
    expect(
      chooseBotMove(hand("4C", "4D", "9H"), hand("KS", "KH"))
    ).toEqual({ type: "pass" });
  });

  it("never returns an illegal play", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      const state = newGame(rng);
      const bot = state.hands[1];
      const trick = [state.hands[2][Math.floor(rng() * 13)]];
      const move = chooseBotMove(bot, trick);
      if (move.type === "play") {
        const cards = bot.filter((card) => move.cardIds.includes(card.id));
        expect(cards).toHaveLength(move.cardIds.length);
        expect(canBeat(cards, trick)).toBe(true);
      }
    }
  });
});

describe("chooseBotMove — endgame aggression", () => {
  it("plays its strongest valid single when down to 2 cards", () => {
    const move = chooseBotMove(hand("9H", "2S"), hand("8C"));
    expect(move).toEqual({ type: "play", cardIds: ["2S"] });
  });
});

describe("full bot-vs-bot games", () => {
  it("always reach a winner without stalling (30 seeded deals)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = newGame(seededRng(seed));
      let steps = 0;
      while (state.winner === null) {
        const move = chooseBotMove(state.hands[state.turn], state.trick?.cards);
        const next =
          move.type === "play"
            ? playCards(state, move.cardIds)
            : passTurn(state);
        // A legal move must change the state, otherwise we'd loop forever.
        expect(next).not.toBe(state);
        state = next;
        steps += 1;
        expect(steps).toBeLessThan(500);
      }
      expect(state.hands[state.winner]).toHaveLength(0);
    }
  });
});
