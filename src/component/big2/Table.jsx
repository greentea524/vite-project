import React, { useMemo, useRef, useState } from "react";
import { LayoutGroup } from "framer-motion";
import Card, { CardBack } from "./Card.jsx";
import { sortHandBySuit } from "./deck.js";
import "./big2.css";

/** Card id under a pointer position, or null (used by swipe-select). */
function cardIdAt(x, y) {
  return (
    document.elementFromPoint(x, y)?.closest("[data-card-id]")?.dataset
      .cardId ?? null
  );
}

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
      <div className="big2-thinking-container">
        {active && (
          <span className="big2-thinking">
            thinking<span>.</span><span>.</span><span>.</span>
          </span>
        )}
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
 * { cards, label } or null with `leadText` shown instead. `onMenu`
 * (optional) shows the pause/menu button in the table corner.
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
  onMenu,
  onScoreboard,
}) {
  const [west, north, east] = opponents;
  // Display sort (#114): hands arrive rank-sorted; "suit" regroups the
  // view only — selection state keys on card ids, so it's unaffected.
  const [sortMode, setSortMode] = useState(
    () => window.localStorage.getItem("big2:sort") || "rank"
  );
  const displayHand = useMemo(
    () => (sortMode === "suit" ? sortHandBySuit(myHand) : myHand),
    [myHand, sortMode]
  );
  const pickSort = (mode) => {
    setSortMode(mode);
    window.localStorage.setItem("big2:sort", mode);
  };

  // Swipe-to-select (#113): dragging a finger (or mouse) across the
  // hand toggles each card it passes over, once per gesture. A plain
  // tap still goes through each card's click handler; after a swipe,
  // the trailing click on the release target is swallowed.
  const dragRef = useRef({ downId: null, swiped: false, seen: null });
  const clickGuardRef = useRef(false);

  const onHandPointerDown = (e) => {
    dragRef.current = {
      downId: cardIdAt(e.clientX, e.clientY),
      swiped: false,
      seen: new Set(),
    };
  };

  const onHandPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag.seen || e.buttons === 0) return;
    const id = cardIdAt(e.clientX, e.clientY);
    if (!id || (id === drag.downId && !drag.swiped)) return;
    if (!drag.swiped) {
      drag.swiped = true;
      if (drag.downId) {
        onToggleCard(drag.downId);
        drag.seen.add(drag.downId);
      }
    }
    if (!drag.seen.has(id)) {
      onToggleCard(id);
      drag.seen.add(id);
    }
  };

  const onHandPointerEnd = () => {
    if (dragRef.current.swiped) {
      // The browser still fires a click on the release target; ignore
      // it, and self-clear in case the release lands off-card.
      clickGuardRef.current = true;
      setTimeout(() => {
        clickGuardRef.current = false;
      }, 300);
    }
    dragRef.current = { downId: null, swiped: false, seen: null };
  };

  const tapCard = (id) => {
    if (clickGuardRef.current) {
      clickGuardRef.current = false;
      return;
    }
    onToggleCard(id);
  };

  return (
    <LayoutGroup>
      <div className="big2-table">
      {onMenu && (
        <button
          type="button"
          className="big2-menu-toggle"
          onClick={onMenu}
          aria-label="Game menu"
          title="Game menu"
        >
          ⏸
        </button>
      )}
      {onScoreboard && (
        <button
          type="button"
          className="big2-score-toggle"
          onClick={onScoreboard}
          aria-label="Score board"
          title="Score board"
        >
          🏆
        </button>
      )}
      <OpponentSeat {...north} side="north" />
      <OpponentSeat {...west} side="west" />

      <div className="big2-center">
        {trick ? (
          <>
            <div className="big2-trick-cards">
              {trick.cards.map((card) => (
                <Card key={card.id} card={card} origin={trick.origin} />
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
        <div
          className="big2-my-hand"
          onPointerDown={onHandPointerDown}
          onPointerMove={onHandPointerMove}
          onPointerUp={onHandPointerEnd}
          onPointerCancel={onHandPointerEnd}
        >
          {displayHand.map((card) => (
            <Card
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              onClick={() => tapCard(card.id)}
            />
          ))}
        </div>
        <div className="big2-actions">
          <div className="big2-actions-spacer"></div>
          <div className="big2-play-actions">
            <button type="button" onClick={onPlay} disabled={!playEnabled}>
              Play
            </button>
            <button type="button" onClick={onPass} disabled={!passEnabled}>
              Pass
            </button>
            {hint}
          </div>
          <div className="big2-actions-spacer big2-sort-wrapper">
            <span className="big2-sort" role="group" aria-label="Sort hand">
              <span className="big2-sort-label">Sort:</span>
              <button
                type="button"
                className={sortMode === "rank" ? "big2-sort-active" : ""}
                aria-pressed={sortMode === "rank"}
                onClick={() => pickSort("rank")}
              >
                Rank
              </button>
              <button
                type="button"
                className={sortMode === "suit" ? "big2-sort-active" : ""}
                aria-pressed={sortMode === "suit"}
                onClick={() => pickSort("suit")}
              >
                Suit
              </button>
            </span>
          </div>
        </div>
      </div>
      </div>
    </LayoutGroup>
  );
}

/**
 * Pause/game menu overlay. Solo really pauses; online keeps running
 * underneath, so callers pass a fitting `note`. Extra actions (leave
 * game, back to menu) come in as children below the Resume button.
 */
export function PauseOverlay({ title = "Paused", note, onResume, children }) {
  return (
    <div className="big2-results-overlay">
      <div className="big2-results big2-pause">
        <h2 className="big2-results-title">{title}</h2>
        {note && <p className="big2-muted">{note}</p>}
        <div className="big2-pause-actions">
          <button type="button" onClick={onResume}>
            Resume
          </button>
          {children}
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

/**
 * Scoreboard overlay: displays a leaderboard of cumulative scores.
 * `scores` is an array of { name, total, isMe }.
 */
export function ScoreboardOverlay({ scores, onClose }) {
  const sortedScores = useMemo(() => {
    return [...scores].sort((a, b) => b.total - a.total);
  }, [scores]);

  return (
    <div className="big2-results-overlay">
      <div className="big2-results big2-scoreboard">
        <h2 className="big2-results-title">Leaderboard</h2>
        <table className="big2-results-table">
          <thead>
            <tr>
              <th style={{ width: "60px" }}>Rank</th>
              <th>Player</th>
              <th style={{ textAlign: "right" }}>Total Score</th>
            </tr>
          </thead>
          <tbody>
            {sortedScores.map((row, idx) => {
              const rank = idx + 1;
              let rankEmoji = "";
              if (rank === 1) rankEmoji = "🥇";
              else if (rank === 2) rankEmoji = "🥈";
              else if (rank === 3) rankEmoji = "🥉";
              
              return (
                <tr key={row.name} style={row.isMe ? { backgroundColor: "rgba(255, 213, 79, 0.15)", fontWeight: "bold" } : {}}>
                  <td>
                    {rankEmoji} {rank}
                  </td>
                  <td>
                    {row.name} {row.isMe && " (You)"}
                  </td>
                  <td
                    className={row.total >= 0 ? "big2-score-pos" : "big2-score-neg"}
                    style={{ textAlign: "right" }}
                  >
                    {row.total >= 0 ? "+" : ""}
                    {row.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="big2-results-actions" style={{ justifyContent: "center", marginTop: "16px" }}>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
