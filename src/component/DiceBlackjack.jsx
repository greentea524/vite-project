import React, { useMemo, useReducer, useRef } from "react";

const MAX_SCORE = 21;
const ROLL_ANIMATION_MS = 700;
const ROLL_FRAME_MS = 90;
const DEALER_ROLL_PAUSE_MS = 250;
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function getDieFace(value) {
  if (typeof value !== "number" || value < 1 || value > 6) {
    return "□";
  }

  return DICE_FACES[value - 1];
}

function rollTwoDice() {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;

  return {
    dice: [die1, die2],
    total: die1 + die2,
  };
}

function getRandomDieValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createRollId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function runDealerTurn({ getState, dispatch, maxScore, pauseMs }) {
  const current = getState();
  if (
    !(
      current.dealerTotal < current.playerTotal &&
      current.dealerTotal <= maxScore
    )
  ) {
    return;
  }

  const roll = await runRollAnimation((dice) => {
    dispatch({ type: ACTIONS.SET_DEALER_DISPLAY, payload: { dice } });
  });
  dispatch({ type: ACTIONS.DEALER_ROLL_DONE, payload: { roll } });

  const afterRoll = getState().dealerTotal + roll.total;
  if (afterRoll > maxScore) {
    return;
  }

  await sleep(pauseMs);
  await runDealerTurn({ getState, dispatch, maxScore, pauseMs });
}

function runRollAnimation(updateDisplayDice) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      updateDisplayDice([getRandomDieValue(), getRandomDieValue()]);

      if (Date.now() - startedAt >= ROLL_ANIMATION_MS) {
        clearInterval(timer);
        const finalRoll = rollTwoDice();
        updateDisplayDice(finalRoll.dice);
        resolve(finalRoll);
      }
    }, ROLL_FRAME_MS);
  });
}

const ACTIONS = {
  PLAYER_ROLL_START: "PLAYER_ROLL_START",
  PLAYER_ROLL_DONE: "PLAYER_ROLL_DONE",
  DEALER_START: "DEALER_START",
  DEALER_ROLL_DONE: "DEALER_ROLL_DONE",
  DEALER_END: "DEALER_END",
  SET_PLAYER_DISPLAY: "SET_PLAYER_DISPLAY",
  SET_DEALER_DISPLAY: "SET_DEALER_DISPLAY",
  RESET: "RESET",
};

const INITIAL_STATE = {
  playerTotal: 0,
  dealerTotal: 0,
  playerRolls: [],
  dealerRolls: [],
  playerDisplayDice: [null, null],
  dealerDisplayDice: [null, null],
  isPlayerRolling: false,
  isDealerRolling: false,
  phase: "player",
  result: "",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.PLAYER_ROLL_START:
      return { ...state, isPlayerRolling: true };
    case ACTIONS.PLAYER_ROLL_DONE: {
      const nextTotal = state.playerTotal + action.payload.roll.total;
      const nextState = {
        ...state,
        isPlayerRolling: false,
        playerTotal: nextTotal,
        playerRolls: [
          ...state.playerRolls,
          { ...action.payload.roll, id: createRollId() },
        ],
      };

      if (nextTotal === MAX_SCORE) {
        return {
          ...nextState,
          result: "Player hits 21. Auto win.",
          phase: "finished",
        };
      }

      if (nextTotal > MAX_SCORE) {
        return {
          ...nextState,
          result: "Player busts over 21. Dealer wins.",
          phase: "finished",
        };
      }

      return nextState;
    }
    case ACTIONS.DEALER_START:
      return {
        ...state,
        phase: "dealer",
        isDealerRolling: true,
        dealerTotal: 0,
        dealerRolls: [],
      };
    case ACTIONS.DEALER_ROLL_DONE:
      return {
        ...state,
        dealerTotal: state.dealerTotal + action.payload.roll.total,
        dealerRolls: [
          ...state.dealerRolls,
          { ...action.payload.roll, id: createRollId() },
        ],
      };
    case ACTIONS.DEALER_END:
      return {
        ...state,
        isDealerRolling: false,
        phase: "finished",
        result: action.payload.result,
      };
    case ACTIONS.SET_PLAYER_DISPLAY:
      return { ...state, playerDisplayDice: action.payload.dice };
    case ACTIONS.SET_DEALER_DISPLAY:
      return { ...state, dealerDisplayDice: action.payload.dice };
    case ACTIONS.RESET:
      return INITIAL_STATE;
    default:
      return state;
  }
}

function DiceBlackjack() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const canPlayerRoll =
    state.phase === "player" && !state.result && !state.isPlayerRolling;
  const canStand =
    state.phase === "player" &&
    state.playerRolls.length > 0 &&
    !state.result &&
    !state.isPlayerRolling &&
    !state.isDealerRolling;
  const latestPlayerRoll = state.playerRolls[state.playerRolls.length - 1];
  const latestDealerRoll = state.dealerRolls[state.dealerRolls.length - 1];

  const statusText = useMemo(() => {
    if (state.result) {
      return state.result;
    }

    if (state.phase === "player") {
      if (state.playerRolls.length === 0) {
        return "Player turn: Roll 2 dice to start.";
      }

      if (state.isPlayerRolling) {
        return "Player is rolling...";
      }

      return "Player turn: Roll again or stand.";
    }

    if (state.phase === "dealer") {
      return "Dealer is rolling...";
    }

    return "Dealer turn complete.";
  }, [state]);

  const handlePlayerRoll = async () => {
    if (!canPlayerRoll) {
      return;
    }

    dispatch({ type: ACTIONS.PLAYER_ROLL_START });
    const roll = await runRollAnimation((dice) => {
      dispatch({ type: ACTIONS.SET_PLAYER_DISPLAY, payload: { dice } });
    });
    dispatch({ type: ACTIONS.PLAYER_ROLL_DONE, payload: { roll } });
  };

  const handleStand = async () => {
    if (!canStand) {
      return;
    }

    dispatch({ type: ACTIONS.DEALER_START });

    await runDealerTurn({
      getState: () => stateRef.current,
      dispatch,
      maxScore: MAX_SCORE,
      pauseMs: DEALER_ROLL_PAUSE_MS,
    });

    const finalDealer = stateRef.current.dealerTotal;
    const finalPlayer = stateRef.current.playerTotal;

    if (finalDealer > MAX_SCORE) {
      dispatch({
        type: ACTIONS.DEALER_END,
        payload: { result: "Dealer busts over 21. Player wins." },
      });
      return;
    }

    if (finalDealer > finalPlayer) {
      dispatch({
        type: ACTIONS.DEALER_END,
        payload: { result: "Dealer wins with a higher score." },
      });
      return;
    }

    if (finalDealer < finalPlayer) {
      dispatch({
        type: ACTIONS.DEALER_END,
        payload: { result: "Player wins with a higher score." },
      });
      return;
    }

    dispatch({ type: ACTIONS.DEALER_END, payload: { result: "Tie game." } });
  };

  const handleReset = () => {
    dispatch({ type: ACTIONS.RESET });
  };

  return (
    <div className="p-3" style={{ maxWidth: 760, width: "100%" }}>
      <h3>Dice 21: Player vs Dealer</h3>
      <p className="mb-2">{statusText}</p>

      <div className="d-flex gap-4 flex-wrap justify-content-center mb-3">
        <div className="text-center">
          <h5>Player</h5>
          <div>Total: {state.playerTotal}</div>
          <div>Rolls: {state.playerRolls.length}</div>
          <div style={{ fontSize: "2rem", lineHeight: 1.2 }}>
            {getDieFace(
              state.playerDisplayDice[0] ?? latestPlayerRoll?.dice?.[0],
            )}{" "}
            {getDieFace(
              state.playerDisplayDice[1] ?? latestPlayerRoll?.dice?.[1],
            )}
          </div>
        </div>
        <div className="text-center">
          <h5>Dealer</h5>
          <div>Total: {state.dealerTotal}</div>
          <div>Rolls: {state.dealerRolls.length}</div>
          <div style={{ fontSize: "2rem", lineHeight: 1.2 }}>
            {getDieFace(
              state.dealerDisplayDice[0] ?? latestDealerRoll?.dice?.[0],
            )}{" "}
            {getDieFace(
              state.dealerDisplayDice[1] ?? latestDealerRoll?.dice?.[1],
            )}
          </div>
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap justify-content-center mb-3">
        <button
          type="button"
          onClick={handlePlayerRoll}
          disabled={!canPlayerRoll}
        >
          Roll Dice
        </button>
        <button type="button" onClick={handleStand} disabled={!canStand}>
          Stand
        </button>
        <button type="button" onClick={handleReset}>
          New Game
        </button>
      </div>

      <div className="mb-3">
        <h6>Player Roll History</h6>
        {state.playerRolls.length === 0 ? (
          <div>No rolls yet.</div>
        ) : (
          <ul className="list-unstyled ps-0 mb-0">
            {state.playerRolls.map((roll, index) => (
              <li key={roll.id}>
                Roll {index + 1}: [{roll.dice[0]}, {roll.dice[1]}] ={" "}
                {roll.total}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h6>Dealer Roll History</h6>
        {state.dealerRolls.length === 0 ? (
          <div>No rolls yet.</div>
        ) : (
          <ul className="list-unstyled ps-0 mb-0">
            {state.dealerRolls.map((roll, index) => (
              <li key={roll.id}>
                Roll {index + 1}: [{roll.dice[0]}, {roll.dice[1]}] ={" "}
                {roll.total}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DiceBlackjack;
