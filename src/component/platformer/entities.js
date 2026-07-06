// Trigger entities ported from the Godot Area2D scenes — coin,
// spikes, checkpoint, goal flag — plus processInteractions, which
// applies the gameplay contact rules each frame. Pure logic: the
// engine supplies callbacks for sounds and game-state changes.

import { bodyRect, rectsOverlap, pointSolid, GRAVITY, TILE } from "./physics.js";
import { bounce } from "./player.js";
import { enemyHitbox, squashEnemy } from "./enemy.js";

export const COIN_SPIN_FRAMES = [0, 1];
export const COIN_SPIN_FPS = 4;
// coin.gd pickup tween: rise 8px + fade over 0.15s, 0.1s pause, free.
const COIN_PICK_RISE = 0.15;
const COIN_PICK_TOTAL = 0.25;

export function createCoin(x, y) {
  return { type: "coin", x, y, picked: false, pickT: 0, gone: false, animT: 0, alpha: 1, riseY: 0 };
}

export function createSpikes(x, y) {
  return { type: "spikes", x, y };
}

export function createCheckpoint(x, y) {
  return { type: "checkpoint", x, y, activated: false };
}

export function createFlag(x, y) {
  return { type: "flag", x, y, reached: false };
}

// --- World 3/4 hazards (PG-38/PG-39) ---------------------------------

// Lava pool: a non-solid tile cell that kills on contact (World 3).
export function createLava(x, y) {
  return { type: "lava", x, y, animT: 0 };
}

// Stalactite: hangs from the ceiling until the player passes beneath,
// then drops under gravity and shatters on the floor (World 3).
export const STALACTITE_TRIGGER_X = 12; // horizontal proximity to drop
export function createStalactite(x, y) {
  return { type: "stalactite", x, y, vy: 0, falling: false, gone: false };
}

// Meteor: falls straight down at a constant speed; kills on contact and
// is removed once it drops past the level (World 4). Spawned by the
// engine at random intervals, not from a tile.
export const METEOR_SPEED = 170;
export function createMeteor(x, y) {
  return { type: "meteor", x, y, animT: 0, gone: false };
}

export function updateStalactite(s, level, player, dt) {
  if (s.gone) return;
  if (!s.falling) {
    // Drop once the player is roughly underneath and below the tip.
    if (
      player &&
      !player.dying &&
      Math.abs(player.x - s.x) < STALACTITE_TRIGGER_X &&
      player.y > s.y
    ) {
      s.falling = true;
    }
    return;
  }
  s.vy += GRAVITY * dt;
  s.y += s.vy * dt;
  // Shatter when the tip reaches a solid tile or falls out of the level.
  if (pointSolid(level, s.x, s.y + 8) || s.y > level.killY) s.gone = true;
}

export function updateMeteor(m, level, dt) {
  if (m.gone) return;
  m.animT += dt;
  m.y += METEOR_SPEED * dt;
  if (m.y > level.killY) m.gone = true;
}

// Volcano (World 3, PG-58): a ground mound that periodically erupts,
// lobbing lava rocks in an arc. The mound itself is harmless and
// non-solid — the rocks are the hazard.
export const VOLCANO_MIN_INTERVAL = 2.8;
export const VOLCANO_MAX_INTERVAL = 4.4;
export function createVolcano(x, y) {
  return {
    type: "volcano",
    x,
    y,
    // Random initial phase so multiple volcanoes don't fire in sync.
    timer: 1 + Math.random() * VOLCANO_MIN_INTERVAL,
    interval: VOLCANO_MIN_INTERVAL, // set per eruption
    animT: 0,
  };
}

export function createLavaRock(x, y, vx, vy) {
  return { type: "lavarock", x, y, vx, vy, airborne: true, gone: false, animT: 0 };
}

// Counts down to the next eruption; spent time drives the crater-glow
// charge in the renderer. New rocks are pushed into `out`.
export function updateVolcano(v, dt, out) {
  v.animT += dt;
  v.timer -= dt;
  if (v.timer > 0) return;
  v.interval =
    VOLCANO_MIN_INTERVAL + Math.random() * (VOLCANO_MAX_INTERVAL - VOLCANO_MIN_INTERVAL);
  v.timer = v.interval;
  const count = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const vx = (Math.random() * 2 - 1) * 70;
    const vy = -(200 + Math.random() * 60);
    out.push(createLavaRock(v.x, v.y - 6, vx, vy));
  }
}

export function updateLavaRock(r, level, dt) {
  if (r.gone) return;
  r.animT += dt;
  r.vy += GRAVITY * dt;
  r.x += r.vx * dt;
  r.y += r.vy * dt;
  // Rocks shatter when they land on something solid (only on the way
  // down, so they can rise out of the crater) or fall out of the level.
  if ((r.vy > 0 && pointSolid(level, r.x, r.y + 3)) || r.y > level.killY) {
    r.gone = true;
  }
}

export function coinFrame(c) {
  return COIN_SPIN_FRAMES[Math.floor(c.animT * COIN_SPIN_FPS) % COIN_SPIN_FRAMES.length];
}

export function updateCoin(c, dt) {
  c.animT += dt;
  if (!c.picked) return;
  c.pickT += dt;
  const t = Math.min(c.pickT / COIN_PICK_RISE, 1);
  c.riseY = -8 * t;
  c.alpha = 1 - t;
  if (c.pickT >= COIN_PICK_TOTAL) c.gone = true;
}

// Trigger rects from the CollisionShape2D nodes in the .tscn files.
// The coin's circle (r=6) is approximated by its 12x12 bounding box.
export function coinRect(c) {
  return { left: c.x - 6, top: c.y - 6, right: c.x + 6, bottom: c.y + 6 };
}

export function spikesRect(s) {
  // 14x8 at y+4
  return { left: s.x - 7, top: s.y, right: s.x + 7, bottom: s.y + 8 };
}

export function checkpointRect(k) {
  // 12x16 centered
  return { left: k.x - 6, top: k.y - 8, right: k.x + 6, bottom: k.y + 8 };
}

export function flagRect(f) {
  // 12x30 at y-8
  return { left: f.x - 6, top: f.y - 23, right: f.x + 6, bottom: f.y + 7 };
}

// Lava fills its tile cell; the top is dropped a few px so merely
// standing at the edge of an adjacent tile isn't an instant kill.
export function lavaRect(l) {
  return { left: l.x - TILE / 2, top: l.y - 4, right: l.x + TILE / 2, bottom: l.y + TILE / 2 };
}

export function stalactiteRect(s) {
  // ~10x14 pointing down from (x, y).
  return { left: s.x - 5, top: s.y - 7, right: s.x + 5, bottom: s.y + 7 };
}

export function meteorRect(m) {
  // ~12x12 fireball core.
  return { left: m.x - 6, top: m.y - 6, right: m.x + 6, bottom: m.y + 6 };
}

export function lavaRockRect(r) {
  // ~8x8 glowing rock.
  return { left: r.x - 4, top: r.y - 4, right: r.x + 4, bottom: r.y + 4 };
}

// Applies the contact rules for one frame. `world` holds the player,
// entity lists, and level; `ev` supplies the outcome callbacks:
//   onCoin(coin), onStomp(enemy), onPlayerDeath(), onCheckpoint(k),
//   onFlag(flag)
export function processInteractions(world, ev) {
  const p = world.player;
  if (p.dying) return;
  const pr = bodyRect(p);

  for (const c of world.coins) {
    if (!c.picked && rectsOverlap(pr, coinRect(c))) {
      c.picked = true;
      ev.onCoin(c);
    }
  }

  for (const s of world.spikes) {
    if (rectsOverlap(pr, spikesRect(s))) {
      ev.onPlayerDeath();
      return;
    }
  }

  // Lava, falling stalactites, and meteors are all touch-to-die hazards
  // (World 3/4). Lists are absent on earlier worlds — treat as empty.
  for (const l of world.lava ?? []) {
    if (rectsOverlap(pr, lavaRect(l))) {
      ev.onPlayerDeath();
      return;
    }
  }
  for (const s of world.stalactites ?? []) {
    if (!s.gone && rectsOverlap(pr, stalactiteRect(s))) {
      ev.onPlayerDeath();
      return;
    }
  }
  for (const m of world.meteors ?? []) {
    if (!m.gone && rectsOverlap(pr, meteorRect(m))) {
      ev.onPlayerDeath();
      return;
    }
  }
  for (const r of world.lavaRocks ?? []) {
    if (!r.gone && rectsOverlap(pr, lavaRockRect(r))) {
      ev.onPlayerDeath();
      return;
    }
  }

  for (const e of world.enemies) {
    if (e.dead) continue;
    if (rectsOverlap(pr, enemyHitbox(e))) {
      // Stomp: player moving down and clearly above the enemy's center.
      if (p.vy > 0 && p.y < e.y - 2) {
        bounce(p);
        squashEnemy(e);
        ev.onStomp(e);
      } else {
        ev.onPlayerDeath();
        return;
      }
    }
  }

  for (const k of world.checkpoints) {
    if (!k.activated && rectsOverlap(pr, checkpointRect(k))) {
      k.activated = true;
      ev.onCheckpoint(k);
    }
  }

  for (const f of world.flags) {
    if (!f.reached && rectsOverlap(pr, flagRect(f))) {
      f.reached = true;
      ev.onFlag(f);
    }
  }

  // Falling below the level bounds kills the player (PG-16).
  if (p.y > world.level.killY) ev.onPlayerDeath();
}
