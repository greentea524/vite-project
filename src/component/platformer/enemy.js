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
  };
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
    e.vy += GRAVITY * dt;
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
