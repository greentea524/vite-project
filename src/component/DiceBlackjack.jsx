import React, { useMemo, useReducer, useRef } from "react";

const STARTING_BALANCE = 1000;
const MAX_SCORE = 21;
const MAX_BET = 100000;
const REGULAR_WIN_RETURN_MULTIPLIER = 2;
const HIT_21_RETURN_MULTIPLIER = 2.5;
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
  UPDATE_BET_INPUT: "UPDATE_BET_INPUT",
  PLACE_BET: "PLACE_BET",
  CLEAR_BET: "CLEAR_BET",
  REFILL_BALANCE: "REFILL_BALANCE",
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
  playerWins: 0,
  dealerWins: 0,
  ties: 0,
  balance: STARTING_BALANCE,
  betInput: 50,
  currentBet: 0,
};

function BalanceAndPayout({
  balance,
  currentBet,
  canRefill,
  onRefill,
  regularProfit,
  regularReturn,
  hit21Profit,
  hit21Return,
}) {
  return (
    <>
      <div className="d-flex gap-3 flex-wrap justify-content-center align-items-center mb-3">
        <div style={{ fontWeight: 700 }}>Balance: ${balance}</div>
        <div style={{ fontWeight: 700 }}>Current Bet: ${currentBet}</div>
        {canRefill && (
          <button type="button" onClick={onRefill}>
            Refill $1000
          </button>
        )}
      </div>
      <div className="mb-3" style={{ fontWeight: 700 }}>
        Win Odds: Regular 1:1 | Hit 21 Bonus 3:2
        <br />
        Regular win: +${regularProfit} (return ${regularReturn}) | Hit 21: +$
        {hit21Profit} (return ${hit21Return})
      </div>
    </>
  );
}

function BetControls({
  betInput,
  canManageBet,
  canPlaceBet,
  canClearBet,
  currentBet,
  onBetInputChange,
  onPlaceBet,
  onClearBet,
}) {
  return (
    <div className="d-flex gap-2 flex-wrap justify-content-center align-items-center mb-3">
      <label htmlFor="bet-input" className="mb-0">
        Bet Amount:
      </label>
      <input
        id="bet-input"
        type="number"
        min="1"
        max={MAX_BET}
        step="1"
        value={betInput}
        onChange={onBetInputChange}
        style={{ width: 120 }}
        disabled={!canManageBet || currentBet > 0}
      />
      <button type="button" onClick={onPlaceBet} disabled={!canPlaceBet}>
        Place Bet
      </button>
      <button type="button" onClick={onClearBet} disabled={!canClearBet}>
        Cancel Bet
      </button>
    </div>
  );
}

function MatchupPanel({
  playerTotal,
  dealerTotal,
  playerRolls,
  dealerRolls,
  playerDisplayDice,
  dealerDisplayDice,
  latestPlayerRoll,
  latestDealerRoll,
}) {
  return (
    <div className="d-flex gap-4 flex-wrap justify-content-center mb-3">
      <div className="text-center">
        <h5>Player</h5>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Total: {playerTotal}
        </div>
        <div>Rolls: {playerRolls.length}</div>
        <div style={{ fontSize: "3.1rem", lineHeight: 1.1 }}>
          {getDieFace(playerDisplayDice[0] ?? latestPlayerRoll?.dice?.[0])}{" "}
          {getDieFace(playerDisplayDice[1] ?? latestPlayerRoll?.dice?.[1])}
        </div>
      </div>
      <div className="text-center">
        <h5>Dealer</h5>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Total: {dealerTotal}
        </div>
        <div>Rolls: {dealerRolls.length}</div>
        <div style={{ fontSize: "3.1rem", lineHeight: 1.1 }}>
          {getDieFace(dealerDisplayDice[0] ?? latestDealerRoll?.dice?.[0])}{" "}
          {getDieFace(dealerDisplayDice[1] ?? latestDealerRoll?.dice?.[1])}
        </div>
      </div>
    </div>
  );
}

function RollHistory({ title, rolls }) {
  return (
    <div className="mb-3">
      <h6>{title}</h6>
      {rolls.length === 0 ? (
        <div>No rolls yet.</div>
      ) : (
        <ul className="list-unstyled ps-0 mb-0">
          {rolls.map((roll, index) => (
            <li key={roll.id}>
              Roll {index + 1}: [{roll.dice[0]}, {roll.dice[1]}] = {roll.total}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function settleBet(state, outcome) {
  if (state.currentBet <= 0) {
    return {
      balance: state.balance,
      currentBet: 0,
    };
  }

  if (outcome === "player21") {
    return {
      balance: state.balance + state.currentBet * HIT_21_RETURN_MULTIPLIER,
      currentBet: 0,
    };
  }

  if (outcome === "player") {
    return {
      balance: state.balance + state.currentBet * REGULAR_WIN_RETURN_MULTIPLIER,
      currentBet: 0,
    };
  }

  if (outcome === "tie") {
    return {
      balance: state.balance + state.currentBet,
      currentBet: 0,
    };
  }

  return {
    balance: state.balance,
    currentBet: 0,
  };
}

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
        const settled = settleBet(state, "player21");
        return {
          ...nextState,
          result: "Player hits 21. Bonus payout win.",
          phase: "finished",
          playerWins: state.playerWins + 1,
          ...settled,
        };
      }

      if (nextTotal > MAX_SCORE) {
        const settled = settleBet(state, "dealer");
        return {
          ...nextState,
          result: "Player busts over 21. Dealer wins.",
          phase: "finished",
          dealerWins: state.dealerWins + 1,
          ...settled,
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
    case ACTIONS.DEALER_END: {
      const settled = settleBet(state, action.payload.winner);
      return {
        ...state,
        isDealerRolling: false,
        phase: "finished",
        result: action.payload.result,
        playerWins:
          state.playerWins + (action.payload.winner === "player" ? 1 : 0),
        dealerWins:
          state.dealerWins + (action.payload.winner === "dealer" ? 1 : 0),
        ties: state.ties + (action.payload.winner === "tie" ? 1 : 0),
        ...settled,
      };
    }
    case ACTIONS.UPDATE_BET_INPUT:
      return {
        ...state,
        betInput: action.payload.value,
      };
    case ACTIONS.PLACE_BET:
      return {
        ...state,
        balance: state.balance - action.payload.amount,
        currentBet: action.payload.amount,
      };
    case ACTIONS.CLEAR_BET:
      return {
        ...state,
        balance: state.balance + state.currentBet,
        currentBet: 0,
      };
    case ACTIONS.REFILL_BALANCE:
      return {
        ...state,
        balance: STARTING_BALANCE,
      };
    case ACTIONS.SET_PLAYER_DISPLAY:
      return { ...state, playerDisplayDice: action.payload.dice };
    case ACTIONS.SET_DEALER_DISPLAY:
      return { ...state, dealerDisplayDice: action.payload.dice };
    case ACTIONS.RESET:
      return {
        ...INITIAL_STATE,
        playerWins: state.playerWins,
        dealerWins: state.dealerWins,
        ties: state.ties,
        balance: state.balance + state.currentBet,
      };
    default:
      return state;
  }
}

function DiceBlackjack() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const canPlayerRoll =
    state.phase === "player" &&
    !state.result &&
    !state.isPlayerRolling &&
    state.currentBet > 0;
  const canStand =
    state.phase === "player" &&
    state.playerRolls.length > 0 &&
    !state.result &&
    !state.isPlayerRolling &&
    !state.isDealerRolling;
  const latestPlayerRoll = state.playerRolls[state.playerRolls.length - 1];
  const latestDealerRoll = state.dealerRolls[state.dealerRolls.length - 1];
  const canManageBet =
    state.phase === "player" &&
    state.playerRolls.length === 0 &&
    !state.isPlayerRolling &&
    !state.isDealerRolling &&
    !state.result;
  const normalizedBetInput = Number.isFinite(Number(state.betInput))
    ? Math.min(MAX_BET, Math.floor(Number(state.betInput)))
    : 0;
  const canPlaceBet =
    canManageBet &&
    state.currentBet === 0 &&
    normalizedBetInput > 0 &&
    normalizedBetInput <= MAX_BET &&
    normalizedBetInput <= state.balance;
  const canClearBet = canManageBet && state.currentBet > 0;
  const canRefill = state.balance <= 0 && state.currentBet === 0;
  const activeBet =
    state.currentBet > 0 ? state.currentBet : normalizedBetInput;
  const regularProfit = activeBet > 0 ? activeBet : 0;
  const regularReturn =
    activeBet > 0 ? activeBet * REGULAR_WIN_RETURN_MULTIPLIER : 0;
  const hit21Profit = activeBet > 0 ? activeBet * 1.5 : 0;
  const hit21Return = activeBet > 0 ? activeBet * HIT_21_RETURN_MULTIPLIER : 0;

  const statusText = useMemo(() => {
    if (state.result) {
      return state.result;
    }

    if (state.phase === "player") {
      if (state.playerRolls.length === 0) {
        if (state.currentBet <= 0) {
          if (state.balance <= 0) {
            return "No balance left. Refill to keep playing.";
          }
          return "Place your bet to start the round.";
        }
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

  const handleBetInputChange = (e) => {
    const rawValue = e.target.value;
    const numericValue = Math.min(MAX_BET, Math.max(0, Number(rawValue) || 0));
    dispatch({
      type: ACTIONS.UPDATE_BET_INPUT,
      payload: { value: numericValue },
    });
  };

  const handlePlaceBet = () => {
    if (!canPlaceBet) {
      return;
    }

    dispatch({
      type: ACTIONS.PLACE_BET,
      payload: { amount: normalizedBetInput },
    });
  };

  const handleClearBet = () => {
    if (!canClearBet) {
      return;
    }

    dispatch({ type: ACTIONS.CLEAR_BET });
  };

  const handleRefill = () => {
    if (!canRefill) {
      return;
    }

    dispatch({ type: ACTIONS.REFILL_BALANCE });
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
        payload: {
          result: "Dealer busts over 21. Player wins.",
          winner: "player",
        },
      });
      return;
    }

    if (finalDealer > finalPlayer) {
      dispatch({
        type: ACTIONS.DEALER_END,
        payload: {
          result: "Dealer wins with a higher score.",
          winner: "dealer",
        },
      });
      return;
    }

    if (finalDealer < finalPlayer) {
      dispatch({
        type: ACTIONS.DEALER_END,
        payload: {
          result: "Player wins with a higher score.",
          winner: "player",
        },
      });
      return;
    }

    dispatch({
      type: ACTIONS.DEALER_END,
      payload: { result: "Tie game.", winner: "tie" },
    });
  };

  const handleReset = () => {
    dispatch({ type: ACTIONS.RESET });
  };

  return (
    <div className="p-3" style={{ maxWidth: 760, width: "100%" }}>
      <h3>Dice 21: Player vs Dealer</h3>
      <p className="mb-2">{statusText}</p>
      <BalanceAndPayout
        balance={state.balance}
        currentBet={state.currentBet}
        canRefill={canRefill}
        onRefill={handleRefill}
        regularProfit={regularProfit}
        regularReturn={regularReturn}
        hit21Profit={hit21Profit}
        hit21Return={hit21Return}
      />
      <BetControls
        betInput={state.betInput}
        canManageBet={canManageBet}
        canPlaceBet={canPlaceBet}
        canClearBet={canClearBet}
        currentBet={state.currentBet}
        onBetInputChange={handleBetInputChange}
        onPlaceBet={handlePlaceBet}
        onClearBet={handleClearBet}
      />
      <div className="d-flex gap-3 flex-wrap justify-content-center mb-3">
        <div style={{ fontWeight: 700 }}>Player Wins: {state.playerWins}</div>
        <div style={{ fontWeight: 700 }}>Dealer Wins: {state.dealerWins}</div>
        <div style={{ fontWeight: 700 }}>Ties: {state.ties}</div>
      </div>
      <MatchupPanel
        playerTotal={state.playerTotal}
        dealerTotal={state.dealerTotal}
        playerRolls={state.playerRolls}
        dealerRolls={state.dealerRolls}
        playerDisplayDice={state.playerDisplayDice}
        dealerDisplayDice={state.dealerDisplayDice}
        latestPlayerRoll={latestPlayerRoll}
        latestDealerRoll={latestDealerRoll}
      />

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

      <RollHistory title="Player Roll History" rolls={state.playerRolls} />
      <RollHistory title="Dealer Roll History" rolls={state.dealerRolls} />
    </div>
  );
}

export default DiceBlackjack;
