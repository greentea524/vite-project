import React, { useState } from "react";
import Card from "./Card.jsx";
import { createDeck, sortHand, deal, findStartingPlayer } from "./deck.js";
import "./big2.css";

const PLAYER_NAMES = ["You", "West", "North", "East"];

/**
 * Big 2 — KAN-58 foundation screen.
 * Renders the full deck in Big 2 order and a 4-hand deal with the
 * starting player (3♦ holder) highlighted. The real game table UI
 * replaces this in KAN-60.
 */
function Big2() {
  const [hands, setHands] = useState(() => deal());
  const [showDeck, setShowDeck] = useState(false);
  const startingPlayer = findStartingPlayer(hands);

  return (
    <div className="big2-demo">
      <div className="big2-demo-controls">
        <button type="button" onClick={() => setHands(deal())}>
          <i className="fa fa-refresh" aria-hidden="true"></i> Re-deal
        </button>
        <div className="field-row" style={{ margin: 0 }}>
          <input
            type="checkbox"
            id="big2-show-deck"
            checked={showDeck}
            onChange={(e) => setShowDeck(e.target.checked)}
          />
          <label htmlFor="big2-show-deck">Show full deck (sorted low → high)</label>
        </div>
      </div>

      {showDeck && (
        <div>
          <h6 className="big2-hand-title">Full deck — 3♦ (lowest) to 2♠ (highest)</h6>
          <div className="big2-deck-grid">
            {sortHand(createDeck()).map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}

      {hands.map((hand, i) => (
        <div key={PLAYER_NAMES[i]}>
          <h6 className="big2-hand-title">
            {PLAYER_NAMES[i]} — {hand.length} cards
            {i === startingPlayer && (
              <span className="big2-starting-badge">Starts (holds 3♦)</span>
            )}
          </h6>
          <div className="big2-hand">
            {hand.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Big2;
