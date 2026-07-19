import React, { useEffect, useMemo, useState } from "react";
import { TableView, ResultsOverlay, PauseOverlay, ScoreboardOverlay } from "./Table.jsx";
import { newGame, playCards, passTurn } from "./game.js";
import { classifyHand, canBeat, canPass, isUnbeatable, HAND_TYPE_LABEL } from "./rules.js";
import { chooseBotMove } from "./bot.js";
import { scoreRound } from "./scoring.js";
import Card from "./Card.jsx";
import { Network } from "./network.js";
import { InstructionsOverlay } from "./Instructions.jsx";
import { StatsOverlay } from "./StatsOverlay.jsx";
import { recordGame } from "./stats.js";
import Online from "./Online.jsx";
import "./big2.css";

const PLAYER_NAMES = ["You", "West 🤖", "North 🤖", "East 🤖"];
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
  const [paused, setPaused] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);

  const scores = useMemo(() => {
    return PLAYER_NAMES.map((name, i) => ({
      name,
      total: totals[i],
      isMe: i === LOCAL_PLAYER,
    }));
  }, [totals]);

  const isMyTurn = state.turn === LOCAL_PLAYER && state.winner === null;
  const myHand = state.hands[LOCAL_PLAYER];
  const selectedCards = useMemo(
    () => myHand.filter((c) => selectedIds.has(c.id)),
    [myHand, selectedIds]
  );
  const selection = classifyHand(selectedCards);
  const playable = isMyTurn && canBeat(selectedCards, state.trick?.cards);
  const passable = isMyTurn && canPass(state.trick?.cards);

  // Auto-pass if the trick is absolutely unbeatable (e.g. 2 of Spades).
  useEffect(() => {
    if (paused || state.winner !== null || state.turn !== LOCAL_PLAYER) return;
    if (state.trick && isUnbeatable(state.trick.cards)) {
      const timer = setTimeout(() => {
        setState((s) => passTurn(s));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state, paused]);

  // Bot turns (KAN-61), randomly delayed 800–1200ms to feel natural.
  // Pausing clears the pending timer; resuming reschedules it.
  useEffect(() => {
    if (paused || state.winner !== null || state.turn === LOCAL_PLAYER)
      return undefined;
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.winner !== null || s.turn === LOCAL_PLAYER) return s;
        const move = chooseBotMove(s.hands[s.turn], s.trick?.cards);
        return move.type === "play" ? playCards(s, move.cardIds) : passTurn(s);
      });
    }, 1000 + Math.random() * 1000);
    return () => clearTimeout(timer);
  }, [state, paused]);

  // Score the round exactly once when someone goes out (KAN-62).
  useEffect(() => {
    if (state.winner === null || roundResult !== null) return;
    const result = scoreRound(state.hands, state.winner);
    setRoundResult(result);
    setTotals((t) => t.map((v, i) => v + result.deltas[i]));
    recordGame(state.winner === LOCAL_PLAYER);
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
    total: totals[i],
  });

  return (
    <div className="big2-table-page">
      {paused && state.winner === null && !showInstructions && !showStats && (
        <PauseOverlay onResume={() => setPaused(false)}>
          <button type="button" className="big2-link-btn" onClick={() => setShowInstructions(true)}>
            How to Play
          </button>
          <button type="button" className="big2-link-btn" onClick={() => setShowStats(true)}>
            Statistics
          </button>
          <button type="button" className="big2-link-btn" onClick={onExit}>
            Back to menu
          </button>
        </PauseOverlay>
      )}
      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
      {showStats && <StatsOverlay onClose={() => setShowStats(false)} />}
      {showScoreboard && <ScoreboardOverlay scores={scores} onClose={() => setShowScoreboard(false)} />}
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
                origin: state.trick.owner === 0 ? "south" : state.trick.owner === 1 ? "west" : state.trick.owner === 2 ? "north" : "east",
              }
            : null
        }
        leadText={
          state.turn === LOCAL_PLAYER
            ? "You lead anything"
            : `${PLAYER_NAMES[state.turn]} leads anything`
        }
        turnText={
          state.winner === null
            ? isMyTurn
              ? "Your turn"
              : `${PLAYER_NAMES[state.turn]}’s turn`
            : null
        }
        myActive={isMyTurn}
        myName={PLAYER_NAMES[LOCAL_PLAYER]}
        myTotal={totals[LOCAL_PLAYER]}
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
        onMenu={() => setPaused(true)}
        onScoreboard={() => setShowScoreboard(true)}
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStats, setShowStats] = useState(false);

  if (mode === "solo") return <SoloGame onExit={() => setMode("menu")} />;
  if (mode === "online") return <Online joinCode={joinCode} onExit={() => setMode("menu")} />;

  return (
    <div className="big2-panel big2-menu">
      <div className="big2-menu-cards">
        <div className="big2-menu-card-wrap big2-menu-card-left">
          <Card card={{ rank: "2", suit: "S", id: "menu-2S" }} />
        </div>
        <div className="big2-menu-card-wrap big2-menu-card-right">
          <Card card={{ rank: "2", suit: "H", id: "menu-2H" }} />
        </div>
      </div>
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
      <button type="button" className="big2-menu-btn" onClick={() => setShowInstructions(true)}>
        📖 How to Play
      </button>
      <button type="button" className="big2-menu-btn" onClick={() => setShowStats(true)}>
        📊 Statistics
      </button>
      {!Network.isConfigured() && (
        <p className="big2-muted">Multiplayer isn’t configured in this build.</p>
      )}
      <a className="big2-link-btn" href="../">
        ‹ Back to Games
      </a>
      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
      {showStats && <StatsOverlay onClose={() => setShowStats(false)} />}
    </div>
  );
}

export default Big2;
