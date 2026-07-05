// Player controller ported from scripts/player.gd: run, variable
// jump height with coyote time + jump buffering, one mid-air double
// jump, state-driven animations, death/respawn. Pure logic — the
// engine owns rendering, sounds are requested through the fx hook.

import { GRAVITY, moveBody } from "./physics.js";

export const SPEED = 140;
export const JUMP_VELOCITY = -320;
export const JUMP_CUT_MULTIPLIER = 0.4;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.1;
export const MAX_AIR_JUMPS = 1;
export const STOMP_BOUNCE = -200;
export const DEATH_HOP = -220;
export const RESPAWN_DELAY = 0.9;

// All avatar sheets share this 8-frame layout (16x16 per frame).
export const SHEET_FRAMES = { idle: [0, 1], run: [2, 3, 4, 5], jump: [6], fall: [7] };
export const SHEET_FPS = { idle: 3, run: 10, jump: 5, fall: 5 };

export function createPlayer(x, y) {
  return {
    // body (collision box from player.tscn: 10x14 at y+1)
    x, y, vx: 0, vy: 0, w: 10, h: 14, ox: 0, oy: 1,
    onFloor: false, onWall: false, onCeiling: false,
    dying: false,
    coyote: 0, buffer: 0, airJumps: MAX_AIR_JUMPS,
    // presentation
    facing: 1, anim: "idle", animT: 0,
    scaleX: 1, scaleY: 1, flairT: 0,
    alpha: 1, fadeT: 0, tint: null,
  };
}

function setAnim(p, name) {
  if (p.anim === name) return;
  p.anim = name;
  p.animT = 0;
}

export function playerFrame(p) {
  const frames = SHEET_FRAMES[p.anim];
  return frames[Math.floor(p.animT * SHEET_FPS[p.anim]) % frames.length];
}

// One simulation step. `fx.play(name)` requests a sound effect.
export function updatePlayer(p, input, level, dt, fx) {
  p.animT += dt;

  // Respawn fade-in (0.3 -> 1.0 alpha over 0.6s)
  if (p.fadeT > 0) {
    p.fadeT = Math.max(0, p.fadeT - dt);
    p.alpha = 1 - 0.7 * (p.fadeT / 0.6);
  }

  // Double-jump squash-and-stretch easing back to 1 over 0.15s
  if (p.flairT > 0) {
    p.flairT = Math.max(0, p.flairT - dt);
    const t = p.flairT / 0.15;
    p.scaleX = 1 + 0.4 * t;
    p.scaleY = 1 - 0.4 * t;
  }

  // Low-gravity worlds (Space, PG-43) scale gravity down for floatier
  // jumps. Default 1 keeps every other world exactly as before.
  const gravity = GRAVITY * (level.gravityScale ?? 1);

  if (p.dying) {
    // Mario-style death hop: collisions are off, just fall out of view.
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return;
  }

  if (p.onFloor) {
    p.coyote = COYOTE_TIME;
    p.airJumps = MAX_AIR_JUMPS;
  } else {
    p.vy += gravity * dt;
    p.coyote -= dt;
  }

  const jumpPressed = input.justPressed("jump");
  if (jumpPressed) p.buffer = JUMP_BUFFER;
  else p.buffer -= dt;

  const canGroundJump = p.onFloor || p.coyote > 0;
  if (p.buffer > 0 && canGroundJump) {
    p.vy = JUMP_VELOCITY;
    p.buffer = 0;
    p.coyote = 0;
    fx.play("jump");
  } else if (jumpPressed && !canGroundJump && p.airJumps > 0) {
    // Double jump: one extra boost per airtime, reset on landing.
    p.vy = JUMP_VELOCITY;
    p.airJumps -= 1;
    p.buffer = 0;
    fx.play("double_jump");
    p.scaleX = 1.4;
    p.scaleY = 0.6;
    p.flairT = 0.15;
  }

  // Variable jump height: releasing jump early cuts the ascent.
  if (input.justReleased("jump") && p.vy < 0) p.vy *= JUMP_CUT_MULTIPLIER;

  const direction = input.axis();
  p.vx = direction * SPEED;

  moveBody(level, p, dt);

  if (direction !== 0) p.facing = direction;
  if (!p.onFloor) setAnim(p, p.vy < 0 ? "jump" : "fall");
  else if (Math.abs(p.vx) > 5) setAnim(p, "run");
  else setAnim(p, "idle");
}

// Upward bounce after stomping an enemy.
export function bounce(p) {
  p.vy = STOMP_BOUNCE;
}

// Starts the death sequence. Returns false if already dying. The
// engine decides between respawn and game over via the game state.
export function killPlayer(p) {
  if (p.dying) return false;
  p.dying = true;
  p.tint = [1, 0.45, 0.45];
  setAnim(p, "fall");
  p.vx = 0;
  p.vy = DEATH_HOP;
  return true;
}

export function respawnPlayer(p, pos) {
  p.x = pos.x;
  p.y = pos.y;
  p.vx = 0;
  p.vy = 0;
  p.dying = false;
  p.tint = null;
  p.alpha = 0.3;
  p.fadeT = 0.6;
  setAnim(p, "idle");
}
