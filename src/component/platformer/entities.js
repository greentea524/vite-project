// Trigger entities ported from the Godot Area2D scenes — coin,
// spikes, checkpoint, goal flag — plus processInteractions, which
// applies the gameplay contact rules each frame. Pure logic: the
// engine supplies callbacks for sounds and game-state changes.

import { bodyRect, rectsOverlap } from "./physics.js";
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
