// Core cube model: 54-facelet string in the URFDLB convention used by
// min2phase (faces in U R F D L B order, each face's 9 stickers row-major,
// reading the face with U on top / F toward you).

export const SOLVED =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];

// Standard Western color scheme, keyed by face letter.
export const FACE_COLORS = {
  U: { name: "White", hex: "#f8f9fa" },
  R: { name: "Red", hex: "#dc3545" },
  F: { name: "Green", hex: "#2f9e44" },
  D: { name: "Yellow", hex: "#ffd43b" },
  L: { name: "Orange", hex: "#fd7e14" },
  B: { name: "Blue", hex: "#3572d6" },
};

// Position permutations for the six clockwise face moves:
// next[i] = prev[PERM[face][i]].
// These were NOT derived by hand: they were extracted from
// min2phase.fromScramble using randomly scrambled probe states (unique
// per-position signatures), then verified with 300 random scramble→solve→
// re-apply round-trips. Do not edit manually — see scripts in KAN-42 notes.
const PERM = {
  U: [6,3,0,7,4,1,8,5,2,45,46,47,12,13,14,15,16,17,9,10,11,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,18,19,20,39,40,41,42,43,44,36,37,38,48,49,50,51,52,53],
  D: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,24,25,26,18,19,20,21,22,23,42,43,44,33,30,27,34,31,28,35,32,29,36,37,38,39,40,41,51,52,53,45,46,47,48,49,50,15,16,17],
  R: [0,1,20,3,4,23,6,7,26,15,12,9,16,13,10,17,14,11,18,19,29,21,22,32,24,25,35,27,28,51,30,31,48,33,34,45,36,37,38,39,40,41,42,43,44,8,46,47,5,49,50,2,52,53],
  L: [53,1,2,50,4,5,47,7,8,9,10,11,12,13,14,15,16,17,0,19,20,3,22,23,6,25,26,18,28,29,21,31,32,24,34,35,42,39,36,43,40,37,44,41,38,45,46,33,48,49,30,51,52,27],
  F: [0,1,2,3,4,5,44,41,38,6,10,11,7,13,14,8,16,17,24,21,18,25,22,19,26,23,20,15,12,9,30,31,32,33,34,35,36,37,27,39,40,28,42,43,29,45,46,47,48,49,50,51,52,53],
  B: [11,14,17,3,4,5,6,7,8,9,10,35,12,13,34,15,16,33,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,36,39,42,2,37,38,1,40,41,0,43,44,51,48,45,52,49,46,53,50,47],
};

function permute(facelets, perm) {
  let out = "";
  for (let i = 0; i < 54; i++) out += facelets[perm[i]];
  return out;
}

// Apply a single move token ("R", "R'", "R2") to a facelet string.
export function applyMove(facelets, token) {
  const face = token[0];
  const mod = token.slice(1);
  if (!PERM[face] || (mod !== "" && mod !== "'" && mod !== "2")) {
    throw new Error(`Invalid move token: ${token}`);
  }
  const times = mod === "2" ? 2 : mod === "'" ? 3 : 1;
  let s = facelets;
  for (let k = 0; k < times; k++) s = permute(s, PERM[face]);
  return s;
}

// Parse a space-separated move sequence into tokens (ignores extra spaces).
export function parseMoves(sequence) {
  return sequence.trim().split(/\s+/).filter(Boolean);
}

export function applyMoves(facelets, tokens) {
  let s = facelets;
  for (const t of tokens) s = applyMove(s, t);
  return s;
}

// Invert a move sequence: reverse order, flip modifiers.
export function invertMoves(tokens) {
  return tokens
    .slice()
    .reverse()
    .map((t) => {
      const face = t[0];
      const mod = t.slice(1);
      if (mod === "'") return face;
      if (mod === "2") return t;
      return face + "'";
    });
}

// Random move-sequence scramble (for the Scramble button).
export function randomScramble(length = 25) {
  const faces = Object.keys(PERM);
  const mods = ["", "'", "2"];
  const tokens = [];
  let prevFace = null;
  while (tokens.length < length) {
    const face = faces[Math.floor(Math.random() * faces.length)];
    if (face === prevFace) continue; // avoid trivially-merging repeats
    tokens.push(face + mods[Math.floor(Math.random() * mods.length)]);
    prevFace = face;
  }
  return tokens;
}
