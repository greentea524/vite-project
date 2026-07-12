import React from "react";
import "./big2.css";

export function InstructionsOverlay({ onClose }) {
  return (
    <div className="big2-results-overlay">
      <div className="big2-results big2-instructions">
        <h2 className="big2-results-title">How to Play Big 2</h2>
        <div className="big2-instructions-content">
          <p>
            <strong>Objective:</strong> Be the first player to shed all 13 cards from your hand!
          </p>
          <hr />
          <h3>Card Rankings</h3>
          <p>
            Cards rank from lowest to highest: <strong>3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2</strong>.
            <br />
            Suits rank (lowest to highest): <strong>Diamonds (♦), Clubs (♣), Hearts (♥), Spades (♠)</strong>.
            <br />
            <em>Example: A 2 of Spades is the highest single card in the game!</em>
          </p>
          <hr />
          <h3>Valid Combinations</h3>
          <p>You can only beat the previous play using the <strong>same type</strong> of combination (with a higher value). A new trick allows any combination.</p>
          <ul>
            <li><strong>Singles:</strong> Any single card.</li>
            <li><strong>Pairs:</strong> Two cards of the same rank.</li>
            <li><strong>Triples:</strong> Three cards of the same rank.</li>
            <li>
              <strong>5-Card Hands:</strong> Ranked similarly to poker:
              <ul>
                <li><strong>Straight:</strong> 5 consecutive cards (e.g., 3-4-5-6-7).</li>
                <li><strong>Flush:</strong> 5 cards of the same suit.</li>
                <li><strong>Full House:</strong> A triple and a pair.</li>
                <li><strong>Four of a Kind:</strong> 4 of the same rank plus 1 junk card.</li>
                <li><strong>Straight Flush:</strong> 5 consecutive cards of the same suit.</li>
              </ul>
            </li>
          </ul>
        </div>
        <div className="big2-pause-actions">
          <button type="button" onClick={onClose}>
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
