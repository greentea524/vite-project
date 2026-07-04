// Ghost interpolation (PLAT-22). Remote players arrive at ~15 Hz; we
// render them ~100 ms in the past and interpolate between the two
// bracketing snapshots so motion stays smooth. Pure functions — no
// canvas — so the timing logic is unit-testable.

export const INTERP_DELAY_MS = 100;
// When the next packet is late, keep the ghost moving along its last
// velocity for a short while instead of freezing (PLAT-28).
export const MAX_EXTRAPOLATE_MS = 200;
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
  const first = buf[0];
  const last = buf[buf.length - 1];

  if (renderT <= first.t) return snapshotView(ghost, first);

  // Past the newest snapshot: extrapolate along the last velocity for a
  // capped window so the ghost glides through packet gaps (PLAT-28).
  if (renderT >= last.t) {
    const ahead = Math.min(renderT - last.t, MAX_EXTRAPOLATE_MS) / 1000;
    const view = snapshotView(ghost, last);
    view.x += (last.vx ?? 0) * ahead;
    return view;
  }

  // Interpolate between the two snapshots bracketing renderT.
  let a = first;
  let b = last;
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
