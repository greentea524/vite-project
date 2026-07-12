import React, { useEffect, useMemo, useState } from "react";
import { TableView, ResultsOverlay } from "./Table.jsx";
import { newGame, playCards, passTurn } from "./game.js";
import { classifyHand, canBeat, canPass, HAND_TYPE_LABEL } from "./rules.js";
import { chooseBotMove } from "./bot.js";
import { scoreRound } from "./scoring.js";
import { Network } from "./network.js";
import Online from "./Online.jsx";
import "./big2.css";

const PLAYER_NAMES = ["You", "West", "North", "East"];
const LOCAL_PLAYER = 0;

/**
 * Solo Big 2 vs three bots (KAN-60/61/62): local state machine, bot
 * turns on a natural delay, scoring overlay between rounds.
 */
function SoloGame({ onExit }) {
  const [state, setState] = useState(() => newGame());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [round, setRound] = useState(1);
  const [totals, setTotals] = useState([0, 0, 0, 0]);
  const [roundResult, setRoundResult] = useState(null);

  const isMyTurn = state.turn === LOCAL_PLAYER && state.winner === null;
  const myHand = state.hands[LOCAL_PLAYER];
  const selectedCards = useMemo(
    () => myHand.filter((c) => selectedIds.has(c.id)),
    [myHand, selectedIds]
  );
  const selection = classifyHand(selectedCards);
  const playable = isMyTurn && canBeat(selectedCards, state.trick?.cards);
  const passable = isMyTurn && canPass(state.trick?.cards);

  // Bot turns (KAN-61), randomly delayed 800–1200ms to feel natural.
  useEffect(() => {
    if (state.winner !== null || state.turn === LOCAL_PLAYER) return undefined;
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.winner !== null || s.turn === LOCAL_PLAYER) return s;
        const move = chooseBotMove(s.hands[s.turn], s.trick?.cards);
        return move.type === "play" ? playCards(s, move.cardIds) : passTurn(s);
      });
    }, 800 + Math.random() * 400);
    return () => clearTimeout(timer);
  }, [state]);

  // Score the round exactly once when someone goes out (KAN-62).
  useEffect(() => {
    if (state.winner === null || roundResult !== null) return;
    const result = scoreRound(state.hands, state.winner);
    setRoundResult(result);
    setTotals((t) => t.map((v, i) => v + result.deltas[i]));
  }, [state, roundResult]);

  const nextRound = () => {
    setState(newGame()); // fresh shuffle, deal, and 3♦ lead
    setSelectedIds(new Set());
    setRoundResult(null);
    setRound((r) => r + 1);
  };

  const toggleCard = (id) => {
    if (state.winner !== null) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selection feedback doubles as the invalid-play error state.
  let hint = null;
  if (selectedCards.length > 0) {
    if (!selection) {
      hint = <span className="big2-hint big2-hint-bad">Not a valid combination</span>;
    } else if (!playable && isMyTurn) {
      hint = (
        <span className="big2-hint big2-hint-bad">
          {HAND_TYPE_LABEL[selection.type]} can’t beat the current trick
        </span>
      );
    } else {
      hint = (
        <span className="big2-hint big2-hint-ok">{HAND_TYPE_LABEL[selection.type]}</span>
      );
    }
  }

  const seat = (i) => ({
    name: PLAYER_NAMES[i],
    count: state.hands[i].length,
    active: state.winner === null && state.turn === i,
  });

  return (
    <div className="big2-table-page">
      {state.winner !== null && roundResult && (
        <ResultsOverlay
          title={`Round ${round} — ${PLAYER_NAMES[state.winner]} ${
            state.winner === LOCAL_PLAYER ? "win" : "wins"
          }!`}
          rows={PLAYER_NAMES.map((name, i) => ({
            name,
            isWinner: i === state.winner,
            cards: state.hands[i],
            doubledByTwos: roundResult.breakdown[i].doubledByTwos,
            doubledByStrong: roundResult.breakdown[i].doubledByStrong,
            delta: roundResult.deltas[i],
            total: totals[i],
          }))}
        >
          <button type="button" onClick={nextRound}>
            Play again
          </button>
          <button type="button" className="big2-link-btn" onClick={onExit}>
            Menu
          </button>
        </ResultsOverlay>
      )}
      <TableView
        opponents={[seat(1), seat(2), seat(3)]}
        trick={
          state.trick
            ? {
                cards: state.trick.cards,
                label: `${HAND_TYPE_LABEL[classifyHand(state.trick.cards)?.type]} by ${PLAYER_NAMES[state.trick.owner]}`,
              }
            : null
        }
        leadText={`New trick — ${PLAYER_NAMES[state.turn]} lead${
          state.turn === LOCAL_PLAYER ? "" : "s"
        } anything`}
        turnText={
          state.winner === null
            ? isMyTurn
              ? "Your turn"
              : `${PLAYER_NAMES[state.turn]}’s turn`
            : null
        }
        myActive={isMyTurn}
        myHand={myHand}
        selectedIds={selectedIds}
        onToggleCard={toggleCard}
        onPlay={() => {
          if (!playable) return;
          setState((s) => playCards(s, [...selectedIds]));
          setSelectedIds(new Set());
        }}
        onPass={() => passable && setState(passTurn)}
        playEnabled={playable}
        passEnabled={passable}
        hint={hint}
      />
    </div>
  );
}

/**
 * Big 2 entry point: main menu choosing solo vs bots (KAN-60/61/62) or
 * online with friends (KAN-63). A ?join=CODE invite link skips the
 * menu straight into the online join flow.
 */
function Big2() {
  const joinCode = useMemo(
    () => new URLSearchParams(window.location.search).get("join") || "",
    []
  );
  const [mode, setMode] = useState(joinCode ? "online" : "menu");

  if (mode === "solo") return <SoloGame onExit={() => setMode("menu")} />;
  if (mode === "online") return <Online joinCode={joinCode} onExit={() => setMode("menu")} />;

  return (
    <div className="big2-panel big2-menu">
      <h1 className="big2-menu-title">Big 2 大老二</h1>
      <p className="big2-muted">
        Shed all 13 cards first. Singles, pairs, triples, and five-card
        poker hands — 2s rank highest.
      </p>
      <button type="button" className="big2-menu-btn" onClick={() => setMode("solo")}>
        🤖 Play vs bots
      </button>
      <button
        type="button"
        className="big2-menu-btn"
        disabled={!Network.isConfigured()}
        onClick={() => setMode("online")}
      >
        👥 Play with friends
      </button>
      {!Network.isConfigured() && (
        <p className="big2-muted">Multiplayer isn’t configured in this build.</p>
      )}
      <a className="big2-link-btn" href="../">
        ‹ Back to Games
      </a>
    </div>
  );
}

export default Big2;
