import React from "react";
import Card, { CardBack } from "./Card.jsx";
import "./big2.css";

/**
 * Presentational pieces shared by the solo (KAN-60) and online
 * (KAN-63) games: the felt table with four seats, and the end-of-round
 * results overlay (KAN-62). All state lives in the callers.
 */

function OpponentSeat({ name, count, active, side }) {
  return (
    <div className={`big2-seat big2-seat-${side}${active ? " big2-seat-active" : ""}`}>
      <div className="big2-seat-name">
        {name} <span className="big2-seat-count">{count}</span>
      </div>
      <div className="big2-seat-cards">
        {Array.from({ length: count }, (_, i) => (
          <CardBack key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * The table. `opponents` is [west, north, east]; `trick` is
 * { cards, label } or null with `leadText` shown instead.
 */
export function TableView({
  opponents,
  trick,
  leadText,
  turnText,
  myActive,
  myHand,
  selectedIds,
  onToggleCard,
  onPlay,
  onPass,
  playEnabled,
  passEnabled,
  hint,
}) {
  const [west, north, east] = opponents;
  return (
    <div className="big2-table">
      <OpponentSeat {...north} side="north" />
      <OpponentSeat {...west} side="west" />

      <div className="big2-center">
        {trick ? (
          <>
            <div className="big2-trick-cards">
              {trick.cards.map((card) => (
                <Card key={card.id} card={card} />
              ))}
            </div>
            <div className="big2-trick-label">{trick.label}</div>
          </>
        ) : (
          <div className="big2-trick-label">{leadText}</div>
        )}
        {turnText && <div className="big2-turn-indicator">{turnText}</div>}
      </div>

      <OpponentSeat {...east} side="east" />

      <div className={`big2-seat big2-seat-south${myActive ? " big2-seat-active" : ""}`}>
        <div className="big2-my-hand">
          {myHand.map((card) => (
            <Card
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              onClick={() => onToggleCard(card.id)}
            />
          ))}
        </div>
        <div className="big2-actions">
          <button type="button" onClick={onPlay} disabled={!playEnabled}>
            Play
          </button>
          <button type="button" onClick={onPass} disabled={!passEnabled}>
            Pass
          </button>
          {hint}
        </div>
      </div>
    </div>
  );
}

/**
 * End-of-round results. `rows` follow seat order:
 * { name, isWinner, cards, doubledByTwos, doubledByStrong, delta, total }.
 * Action buttons come in as children.
 */
export function ResultsOverlay({ title, rows, children }) {
  return (
    <div className="big2-results-overlay">
      <div className="big2-results">
        <h2 className="big2-results-title">{title}</h2>
        <table className="big2-results-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Cards left</th>
              <th>Round</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>
                  {row.name}
                  {row.isWinner && " 🏆"}
                </td>
                <td>
                  {row.isWinner ? (
                    <em>went out</em>
                  ) : (
                    <span className="big2-results-cards">
                      {row.cards.map((card) => (
                        <Card key={card.id} card={card} />
                      ))}
                    </span>
                  )}
                  {(row.doubledByTwos || row.doubledByStrong) && (
                    <div className="big2-results-doubles">
                      {row.doubledByTwos && <span>unused 2 ×2</span>}
                      {row.doubledByStrong && <span>quad/straight flush ×2</span>}
                    </div>
                  )}
                </td>
                <td className={row.delta >= 0 ? "big2-score-pos" : "big2-score-neg"}>
                  {row.delta >= 0 ? "+" : ""}
                  {row.delta}
                </td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="big2-results-actions">{children}</div>
      </div>
    </div>
  );
}
