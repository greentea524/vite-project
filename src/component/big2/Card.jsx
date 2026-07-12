import React from "react";
import { motion } from "framer-motion";
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
    <motion.button
      type="button"
      layoutId={card.id}
      initial={{ scale: 0, opacity: 0, y: 0 }}
      animate={{ scale: 1, opacity: 1, y: selected ? -16 : 0 }}
      exit={{ scale: 0, opacity: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`big2-card big2-card-${SUIT_COLOR[card.suit]}${
        selected ? " big2-card-selected" : ""
      }`}
      data-card-id={card.id}
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
    </motion.button>
  );
}

/** Face-down card back, used for opponents' hands. */
export function CardBack({ layoutId }) {
  return (
    <motion.span
      layoutId={layoutId}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="big2-card big2-card-back"
      aria-hidden="true"
    >
      <span className="big2-card-back-pattern" />
    </motion.span>
  );
}

export default Card;
