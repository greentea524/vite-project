// Seeded RNG for deterministic multiplayer (#81). Both players seed
// from the same value (broadcast by the relay at raceStart) so alien
// spawns and power-up drops match on every screen.
//
// Pure and dependency-free so it's unit-testable. Single-player never
// seeds an engine, so it keeps using Math.random and is unaffected.

// mulberry32: a tiny, fast 32-bit PRNG. Given the same seed it always
// produces the same stream of floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash -> 32-bit unsigned int. Turns an entity key like
// "w2-r1-c7" into a seed offset.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Order-independent per-entity randomness: derive a stable float in
// [0, 1) from (seed, key). Because it's a pure function of the key, two
// players compute the same value for the same alien regardless of who
// kills what, or in which order — no shared mutable RNG state to keep
// in sync. Consuming `n` values (via `+i`) gives independent rolls for
// the same entity (e.g. drop-chance vs. drop-type).
export function derive(seed, key, n = 0) {
  const s = (hashString(key) ^ ((seed >>> 0) + n * 0x9e3779b1)) >>> 0;
  return mulberry32(s)();
}
