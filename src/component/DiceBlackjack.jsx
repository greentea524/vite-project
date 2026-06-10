import React, { useMemo, useState } from "react";

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

function DiceBlackjack() {
  const [playerTotal, setPlayerTotal] = useState(0);
  const [dealerTotal, setDealerTotal] = useState(0);
  const [playerRolls, setPlayerRolls] = useState([]);
  const [dealerRolls, setDealerRolls] = useState([]);
  const [playerDisplayDice, setPlayerDisplayDice] = useState([null, null]);
  const [dealerDisplayDice, setDealerDisplayDice] = useState([null, null]);
  const [isPlayerRolling, setIsPlayerRolling] = useState(false);
  const [isDealerRolling, setIsDealerRolling] = useState(false);
  const [phase, setPhase] = useState("player");
  const [result, setResult] = useState("");

  const canPlayerRoll = phase === "player" && !result && !isPlayerRolling;
  const canStand =
    phase === "player" &&
    playerRolls.length > 0 &&
    !result &&
    !isPlayerRolling &&
    !isDealerRolling;
  const latestPlayerRoll = playerRolls[playerRolls.length - 1];
  const latestDealerRoll = dealerRolls[dealerRolls.length - 1];

  const runRollAnimation = (setDisplayDice) => {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const timer = setInterval(() => {
        setDisplayDice([getRandomDieValue(), getRandomDieValue()]);

        if (Date.now() - startedAt >= ROLL_ANIMATION_MS) {
          clearInterval(timer);
          const finalRoll = rollTwoDice();
          setDisplayDice(finalRoll.dice);
          resolve(finalRoll);
        }
      }, ROLL_FRAME_MS);
    });
  };

  const statusText = useMemo(() => {
    if (result) {
      return result;
    }

    if (phase === "player") {
      if (playerRolls.length === 0) {
        return "Player turn: Roll 2 dice to start.";
      }

      if (isPlayerRolling) {
        return "Player is rolling...";
      }

      return "Player turn: Roll again or stand.";
    }

    if (phase === "dealer") {
      return "Dealer is rolling...";
    }

    return "Dealer turn complete.";
  }, [result, phase, playerRolls.length, isPlayerRolling]);

  const handlePlayerRoll = async () => {
    if (!canPlayerRoll) {
      return;
    }

    setIsPlayerRolling(true);
    const roll = await runRollAnimation(setPlayerDisplayDice);
    setIsPlayerRolling(false);

    const nextTotal = playerTotal + roll.total;

    setPlayerRolls((prev) => [...prev, roll]);
    setPlayerTotal(nextTotal);

    if (nextTotal === MAX_SCORE) {
      setResult("Player hits 21. Auto win.");
      setPhase("finished");
      return;
    }

    if (nextTotal > MAX_SCORE) {
      setResult("Player busts over 21. Dealer wins.");
      setPhase("finished");
    }
  };

  const handleStand = async () => {
    if (!canStand) {
      return;
    }

    setPhase("dealer");
    setIsDealerRolling(true);

    let runningDealerTotal = 0;
    const nextDealerRolls = [];

    // Dealer keeps rolling until beating the player or busting.
    while (
      runningDealerTotal < playerTotal &&
      runningDealerTotal <= MAX_SCORE
    ) {
      const roll = await runRollAnimation(setDealerDisplayDice);
      runningDealerTotal += roll.total;
      nextDealerRolls.push(roll);
      setDealerRolls([...nextDealerRolls]);
      setDealerTotal(runningDealerTotal);

      if (runningDealerTotal > MAX_SCORE) {
        break;
      }

      await sleep(DEALER_ROLL_PAUSE_MS);
    }

    setIsDealerRolling(false);
    setPhase("finished");

    if (runningDealerTotal > MAX_SCORE) {
      setResult("Dealer busts over 21. Player wins.");
      return;
    }

    if (runningDealerTotal > playerTotal) {
      setResult("Dealer wins with a higher score.");
      return;
    }

    if (runningDealerTotal < playerTotal) {
      setResult("Player wins with a higher score.");
      return;
    }

    setResult("Tie game.");
  };

  const handleReset = () => {
    setPlayerTotal(0);
    setDealerTotal(0);
    setPlayerRolls([]);
    setDealerRolls([]);
    setPlayerDisplayDice([null, null]);
    setDealerDisplayDice([null, null]);
    setIsPlayerRolling(false);
    setIsDealerRolling(false);
    setPhase("player");
    setResult("");
  };

  return (
    <div className="p-3" style={{ maxWidth: 760, width: "100%" }}>
      <h3>Dice 21: Player vs Dealer</h3>
      <p className="mb-2">{statusText}</p>

      <div className="d-flex gap-4 flex-wrap justify-content-center mb-3">
        <div className="text-center">
          <h5>Player</h5>
          <div>Total: {playerTotal}</div>
          <div>Rolls: {playerRolls.length}</div>
          <div style={{ fontSize: "2rem", lineHeight: 1.2 }}>
            {getDieFace(playerDisplayDice[0] ?? latestPlayerRoll?.dice?.[0])}{" "}
            {getDieFace(playerDisplayDice[1] ?? latestPlayerRoll?.dice?.[1])}
          </div>
        </div>
        <div className="text-center">
          <h5>Dealer</h5>
          <div>Total: {dealerTotal}</div>
          <div>Rolls: {dealerRolls.length}</div>
          <div style={{ fontSize: "2rem", lineHeight: 1.2 }}>
            {getDieFace(dealerDisplayDice[0] ?? latestDealerRoll?.dice?.[0])}{" "}
            {getDieFace(dealerDisplayDice[1] ?? latestDealerRoll?.dice?.[1])}
          </div>
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap justify-content-center mb-3">
        <button onClick={handlePlayerRoll} disabled={!canPlayerRoll}>
          Roll Dice
        </button>
        <button onClick={handleStand} disabled={!canStand}>
          Stand
        </button>
        <button onClick={handleReset}>New Game</button>
      </div>

      <div className="mb-3">
        <h6>Player Roll History</h6>
        {playerRolls.length === 0 ? (
          <div>No rolls yet.</div>
        ) : (
          <ul className="list-unstyled ps-0 mb-0">
            {playerRolls.map((roll, index) => (
              <li key={`player-${index}`}>
                Roll {index + 1}: [{roll.dice[0]}, {roll.dice[1]}] ={" "}
                {roll.total}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h6>Dealer Roll History</h6>
        {dealerRolls.length === 0 ? (
          <div>No rolls yet.</div>
        ) : (
          <ul className="list-unstyled ps-0 mb-0">
            {dealerRolls.map((roll, index) => (
              <li key={`dealer-${index}`}>
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
