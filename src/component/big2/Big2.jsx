import React, { useEffect, useMemo, useState } from "react";
import Card, { CardBack } from "./Card.jsx";
import { newGame, playCards, passTurn } from "./game.js";
import { classifyHand, canBeat, canPass, HAND_TYPE_LABEL } from "./rules.js";
import "./big2.css";

const PLAYER_NAMES = ["You", "West", "North", "East"];
const LOCAL_PLAYER = 0;

/** Face-down hand + card count for an opponent seat. */
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
 * Big 2 game table — KAN-60. Four seats, centre trick display, and the
 * local player's selectable hand with Play/Pass controls. Opponents run
 * a stand-in turn (open with lowest single, else pass) until the real
 * bots arrive in KAN-61.
 */
function Big2() {
  const [state, setState] = useState(() => newGame());
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const isMyTurn = state.turn === LOCAL_PLAYER && state.winner === null;
  const myHand = state.hands[LOCAL_PLAYER];
  const selectedCards = useMemo(
    () => myHand.filter((c) => selectedIds.has(c.id)),
    [myHand, selectedIds]
  );
  const selection = classifyHand(selectedCards);
  const playable = isMyTurn && canBeat(selectedCards, state.trick?.cards);
  const passable = isMyTurn && canPass(state.trick?.cards);

  // Stand-in opponent turns until KAN-61: lead the lowest single when
  // opening, otherwise pass. Delayed so turns are followable.
  useEffect(() => {
    if (state.winner !== null || state.turn === LOCAL_PLAYER) return undefined;
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.winner !== null || s.turn === LOCAL_PLAYER) return s;
        if (!s.trick) return playCards(s, [s.hands[s.turn][0].id]);
        return passTurn(s);
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [state]);

  const toggleCard = (id) => {
    if (state.winner !== null) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitPlay = () => {
    if (!playable) return;
    setState((s) => playCards(s, [...selectedIds]));
    setSelectedIds(new Set());
  };

  const submitPass = () => {
    if (!passable) return;
    setState(passTurn);
  };

  const restart = () => {
    setState(newGame());
    setSelectedIds(new Set());
  };

  // Selection feedback doubles as the invalid-play error state.
  let selectionHint = null;
  if (selectedCards.length > 0) {
    if (!selection) {
      selectionHint = <span className="big2-hint big2-hint-bad">Not a valid combination</span>;
    } else if (!playable && isMyTurn) {
      selectionHint = (
        <span className="big2-hint big2-hint-bad">
          {HAND_TYPE_LABEL[selection.type]} can’t beat the current trick
        </span>
      );
    } else {
      selectionHint = (
        <span className="big2-hint big2-hint-ok">{HAND_TYPE_LABEL[selection.type]}</span>
      );
    }
  }

  return (
    <div className="big2-table-page">
      {state.winner !== null && (
        <div className="big2-banner">
          <strong>{PLAYER_NAMES[state.winner]} won the round!</strong>
          <button type="button" onClick={restart}>
            New game
          </button>
        </div>
      )}

      <div className="big2-table">
        <OpponentSeat
          name={PLAYER_NAMES[2]}
          count={state.hands[2].length}
          active={state.turn === 2 && state.winner === null}
          side="north"
        />
        <OpponentSeat
          name={PLAYER_NAMES[1]}
          count={state.hands[1].length}
          active={state.turn === 1 && state.winner === null}
          side="west"
        />

        <div className="big2-center">
          {state.trick ? (
            <>
              <div className="big2-trick-cards">
                {state.trick.cards.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </div>
              <div className="big2-trick-label">
                {HAND_TYPE_LABEL[classifyHand(state.trick.cards)?.type]} by{" "}
                {PLAYER_NAMES[state.trick.owner]}
              </div>
            </>
          ) : (
            <div className="big2-trick-label">
              New trick — {PLAYER_NAMES[state.turn]} lead
              {state.turn === LOCAL_PLAYER ? "" : "s"} anything
            </div>
          )}
          {state.winner === null && (
            <div className="big2-turn-indicator">
              {isMyTurn ? "Your turn" : `${PLAYER_NAMES[state.turn]}’s turn`}
            </div>
          )}
        </div>

        <OpponentSeat
          name={PLAYER_NAMES[3]}
          count={state.hands[3].length}
          active={state.turn === 3 && state.winner === null}
          side="east"
        />

        <div className={`big2-seat big2-seat-south${isMyTurn ? " big2-seat-active" : ""}`}>
          <div className="big2-my-hand">
            {myHand.map((card) => (
              <Card
                key={card.id}
                card={card}
                selected={selectedIds.has(card.id)}
                onClick={() => toggleCard(card.id)}
              />
            ))}
          </div>
          <div className="big2-actions">
            <button type="button" onClick={submitPlay} disabled={!playable}>
              Play
            </button>
            <button type="button" onClick={submitPass} disabled={!passable}>
              Pass
            </button>
            {selectionHint}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Big2;
