import React from "react";
import { SUIT_SYMBOL, SUIT_NAME, SUIT_COLOR } from "./deck.js";
import "./big2.css";

/**
 * A single playing card face (KAN-58). CSS-styled: corner rank+suit
 * indices plus a large centre pip.
 *
 * Props:
 *  - card: { rank, suit, id } from deck.js
 *  - selected: lifts the card up (used by the table UI in KAN-60)
 *  - onClick: optional click handler
 */
function Card({ card, selected = false, onClick }) {
  const symbol = SUIT_SYMBOL[card.suit];
  const label = `${card.rank} of ${SUIT_NAME[card.suit]}`;
  return (
    <button
      type="button"
      className={`big2-card big2-card-${SUIT_COLOR[card.suit]}${
        selected ? " big2-card-selected" : ""
      }`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
    >
      <span className="big2-card-corner big2-card-corner-top">
        <span className="big2-card-rank">{card.rank}</span>
        <span className="big2-card-suit">{symbol}</span>
      </span>
      <span className="big2-card-pip" aria-hidden="true">
        {symbol}
      </span>
      <span className="big2-card-corner big2-card-corner-bottom">
        <span className="big2-card-rank">{card.rank}</span>
        <span className="big2-card-suit">{symbol}</span>
      </span>
    </button>
  );
}

/** Face-down card back, used for opponents' hands. */
export function CardBack() {
  return (
    <span className="big2-card big2-card-back" aria-hidden="true">
      <span className="big2-card-back-pattern" />
    </span>
  );
}

export default Card;
