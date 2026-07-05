// Patrolling enemy ported from scripts/enemy.gd: walks until its
// floor probe finds a ledge or its wall probe hits a tile, then turns
// around. Stompable from above (rule lives in entities.js).

import { GRAVITY, moveBody, pointSolid } from "./physics.js";

export const ENEMY_SPEED = 30;
// Probe points derived from the FloorRay/WallRay nodes in enemy.tscn:
// floor ray from (±6, 2) reaching 12px down, wall ray reaching ±7 at y+4.
const FLOOR_PROBE_X = 6;
const FLOOR_PROBE_Y = 14;
const WALL_PROBE_X = 7;
const WALL_PROBE_Y = 4;

export const ENEMY_WALK_FPS = 6;
export const ENEMY_WALK_FRAMES = [0, 1];
const SQUASH_TIME = 0.1;

export function createEnemy(x, y) {
  return {
    // body 12x10 at y+3, hitbox 14x12 at y+2 (enemy.tscn)
    x, y, vx: 0, vy: 0, w: 12, h: 10, ox: 0, oy: 3,
    onFloor: false, onWall: false, onCeiling: false,
    dir: -1,
    dead: false, squashT: 0, gone: false,
    animT: 0, scaleY: 1,
    kind: "walker",
  };
}

// Alien (World 4): same ground-patrol AI as the walker, distinguished
// only by its procedural render. Reuses updateEnemy.
export function createAlien(x, y) {
  return { ...createEnemy(x, y), kind: "alien" };
}

// Bat (World 3): flies a fixed horizontal patrol with a gentle vertical
// bob, ignoring gravity and floors. Reverses at walls or at the edges of
// its patrol span. Stompable via the shared rule in entities.js.
export const BAT_SPEED = 42;
const BAT_BOB_AMP = 7; // px
const BAT_BOB_FREQ = 3; // rad/s
const BAT_SPAN = 40; // px each way from spawn before turning
export const BAT_FLAP_FPS = 8;
export const BAT_FLAP_FRAMES = [0, 1];

export function createBat(x, y) {
  return {
    x, y, vx: 0, vy: 0, w: 12, h: 8, ox: 0, oy: 0,
    onFloor: false, onWall: false, onCeiling: false,
    dir: -1,
    dead: false, squashT: 0, gone: false,
    animT: 0, scaleY: 1,
    kind: "bat",
    homeX: x, baseY: y, bobT: Math.random() * Math.PI * 2,
  };
}

export function batFrame(e) {
  return BAT_FLAP_FRAMES[Math.floor(e.animT * BAT_FLAP_FPS) % BAT_FLAP_FRAMES.length];
}

export function updateBat(e, level, dt) {
  if (e.dead) {
    e.squashT = Math.max(0, e.squashT - dt);
    e.scaleY = 0.2 + 0.8 * (e.squashT / SQUASH_TIME);
    if (e.squashT === 0) e.gone = true;
    return;
  }
  e.animT += dt;
  e.bobT += dt;

  // Horizontal patrol: turn at a wall ahead or at the span limit.
  const nextX = e.x + e.dir * BAT_SPEED * dt;
  if (
    pointSolid(level, nextX + e.dir * (e.w / 2), e.y) ||
    Math.abs(nextX - e.homeX) > BAT_SPAN
  ) {
    e.dir *= -1;
  } else {
    e.x = nextX;
  }
  // Vertical bob around the spawn height (purely presentational motion).
  e.y = e.baseY + Math.sin(e.bobT * BAT_BOB_FREQ) * BAT_BOB_AMP;
}

export function enemyFrame(e) {
  return ENEMY_WALK_FRAMES[Math.floor(e.animT * ENEMY_WALK_FPS) % ENEMY_WALK_FRAMES.length];
}

function turn(e) {
  e.dir *= -1;
}

export function updateEnemy(e, level, dt) {
  if (e.dead) {
    // Squash: scale-y shrinks to 0.2 over 0.1s, then the enemy is gone.
    e.squashT = Math.max(0, e.squashT - dt);
    e.scaleY = 0.2 + 0.8 * (e.squashT / SQUASH_TIME);
    if (e.squashT === 0) e.gone = true;
    return;
  }
  e.animT += dt;

  if (!e.onFloor) {
    e.vy += GRAVITY * (level.gravityScale ?? 1) * dt;
  } else if (
    pointSolid(level, e.x + WALL_PROBE_X * e.dir, e.y + WALL_PROBE_Y) ||
    !pointSolid(level, e.x + FLOOR_PROBE_X * e.dir, e.y + FLOOR_PROBE_Y)
  ) {
    turn(e);
  }
  e.vx = e.dir * ENEMY_SPEED;
  moveBody(level, e, dt);
}

// The Area2D hitbox used for player contact (14x12 at y+2).
export function enemyHitbox(e) {
  return {
    left: e.x - 7,
    top: e.y + 2 - 6,
    right: e.x + 7,
    bottom: e.y + 2 + 6,
  };
}

export function squashEnemy(e) {
  e.dead = true;
  e.squashT = SQUASH_TIME;
}
