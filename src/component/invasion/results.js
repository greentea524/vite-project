// Head-to-head match outcome (#82). Pure so the results screen stays a
// thin presenter and the win/tie logic is unit-testable. Score is the
// decider (hits and combo are shown for flavor, not tie-breaking).

// Returns "win" | "lose" | "tie" from the local player's point of view.
export function matchOutcome(youScore, opponentScore) {
  const you = Number(youScore) || 0;
  const opp = Number(opponentScore) || 0;
  if (you > opp) return "win";
  if (opp > you) return "lose";
  return "tie";
}

export const OUTCOME_LABEL = {
  win: "You Win! 🏆",
  lose: "You Lose",
  tie: "It's a Tie!",
};
