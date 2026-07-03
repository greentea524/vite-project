// Ghost interpolation (PLAT-22). Remote players arrive at ~15 Hz; we
// render them ~100 ms in the past and interpolate between the two
// bracketing snapshots so motion stays smooth. Pure functions — no
// canvas — so the timing logic is unit-testable.

export const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOTS = 20;

export function createGhost(meta) {
  return {
    id: meta.id,
    name: meta.name ?? "Player",
    avatar: meta.avatar ?? 0,
    buffer: [], // [{ t, x, y, vx, facing, anim, level, ... }]
  };
}

// Append a received snapshot stamped with local receive time.
export function pushSnapshot(ghost, snap, now) {
  ghost.buffer.push({ ...snap, t: now });
  if (ghost.buffer.length > MAX_SNAPSHOTS) ghost.buffer.shift();
  if (snap.name != null) ghost.name = snap.name;
  if (snap.avatar != null) ghost.avatar = snap.avatar;
}

// Sample the ghost at (now - INTERP_DELAY_MS), lerping position between
// the two snapshots bracketing that render time. Returns null until we
// have any data. Discrete fields (facing/anim/level) come from the
// earlier of the bracket so they line up with the drawn position.
export function sampleGhost(ghost, now, delay = INTERP_DELAY_MS) {
  const buf = ghost.buffer;
  if (buf.length === 0) return null;
  const renderT = now - delay;

  if (buf.length === 1 || renderT <= buf[0].t) return snapshotView(ghost, buf[0]);
  const last = buf[buf.length - 1];
  if (renderT >= last.t) return snapshotView(ghost, last);

  let a = buf[0];
  let b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].t <= renderT && renderT <= buf[i + 1].t) {
      a = buf[i];
      b = buf[i + 1];
      break;
    }
  }
  const span = b.t - a.t;
  const f = span > 0 ? (renderT - a.t) / span : 0;
  return {
    ...snapshotView(ghost, a),
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
  };
}

function snapshotView(ghost, s) {
  return {
    id: ghost.id,
    name: ghost.name,
    avatar: ghost.avatar,
    x: s.x,
    y: s.y,
    facing: s.facing ?? 1,
    anim: s.anim ?? "idle",
    level: s.level ?? 0,
  };
}
