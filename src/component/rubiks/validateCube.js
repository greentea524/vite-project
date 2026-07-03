import { FACE_ORDER, FACE_COLORS } from "./cubeEngine.js";

// Fast structural checks done in the UI before handing the state to the
// solver. Deeper physical checks (piece existence, twist/flip, permutation
// parity) are performed by min2phase itself and reported via error codes —
// see SOLVER_ERRORS below.
export function validateCube(facelets) {
  const errors = [];

  if (facelets.length !== 54) {
    return ["Internal error: cube state is not 54 stickers."];
  }

  // Exactly 9 stickers of each color.
  const counts = {};
  for (const ch of facelets) counts[ch] = (counts[ch] || 0) + 1;
  for (const face of FACE_ORDER) {
    const n = counts[face] || 0;
    if (n !== 9) {
      const color = FACE_COLORS[face].name;
      errors.push(`${color} appears ${n} time${n === 1 ? "" : "s"} — every color needs exactly 9 stickers.`);
    }
  }

  // Six distinct centers (indices 4, 13, 22, 31, 40, 49).
  const centers = [4, 13, 22, 31, 40, 49].map((i) => facelets[i]);
  if (new Set(centers).size !== 6) {
    errors.push("The six center stickers must all be different colors.");
  }

  return errors;
}

// Human-readable explanations for min2phase's "Error N" results, which cover
// the physical-solvability checks (piece set, orientation sums, parity).
export const SOLVER_ERRORS = {
  "Error 1": "Each color must appear exactly 9 times.",
  "Error 2": "Invalid edges — some edge pieces are duplicated or impossible. Check the two stickers of each edge.",
  "Error 3": "One edge is flipped — this state can't be reached on a real cube. Check your edge stickers.",
  "Error 4": "Invalid corners — some corner pieces are duplicated or impossible. Check the three stickers of each corner.",
  "Error 5": "One corner is twisted — this state can't be reached on a real cube. Check your corner stickers.",
  "Error 6": "Parity error — two pieces are swapped. This state can't be reached on a real cube without disassembling it.",
  "Error 7": "No solution found within the move limit.",
  "Error 8": "Solver gave up (probe limit exceeded). Try again.",
};

export function describeSolverError(result) {
  const key = result.trim();
  return SOLVER_ERRORS[key] || `Solver error: ${result}`;
}
