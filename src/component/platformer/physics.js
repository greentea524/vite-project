// Tile-grid physics ported from the Godot project (level.gd builds the
// grid; CharacterBody2D.move_and_slide is replaced by moveBody).
// Pure module — no canvas/DOM access — so it can be unit-tested.

export const TILE = 16;
// Godot's default 2D gravity (project.godot does not override it).
export const GRAVITY = 980;

// Tile ids double as the atlas x-index in tiles.png.
export const GRASS = 0;
export const DIRT = 1;
export const BLOCK = 2;

// Builds the tile grid and entity spawn list from an ASCII layout.
// Mirrors level.gd::_build/_place, including the two dirt rows
// auto-backfilled under every grass tile and the kill plane and
// camera bottom limit derived from the layout height.
export function buildLevel(layout) {
  const lines = layout.replace(/\r/g, "").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  const tiles = new Map(); // "x,y" -> tile id
  const spawns = [];
  let playerStart = null;
  let width = 0;

  lines.forEach((line, y) => {
    width = Math.max(width, line.length);
    for (let x = 0; x < line.length; x++) {
      const pos = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      switch (line[x]) {
        case "G":
          tiles.set(`${x},${y}`, GRASS);
          tiles.set(`${x},${y + 1}`, DIRT);
          tiles.set(`${x},${y + 2}`, DIRT);
          break;
        case "D":
          tiles.set(`${x},${y}`, DIRT);
          break;
        case "B":
          tiles.set(`${x},${y}`, BLOCK);
          break;
        case "C":
          spawns.push({ type: "coin", ...pos });
          break;
        case "E":
          spawns.push({ type: "enemy", ...pos });
          break;
        case "S":
          spawns.push({ type: "spikes", ...pos });
          break;
        case "F":
          spawns.push({ type: "flag", ...pos });
          break;
        case "K":
          spawns.push({ type: "checkpoint", ...pos });
          break;
        // World 3/4 mechanics (PG-38/PG-39).
        case "L": // lava pool — non-solid, deadly on contact
          spawns.push({ type: "lava", ...pos });
          break;
        case "V": // bat — flying patrol enemy
          spawns.push({ type: "bat", ...pos });
          break;
        case "A": // alien — walking enemy (space-themed)
          spawns.push({ type: "alien", ...pos });
          break;
        case "T": // stalactite — drops when the player passes beneath
          spawns.push({ type: "stalactite", ...pos });
          break;
        case "X": // crumbling platform — solid until stood on, then falls
          tiles.set(`${x},${y}`, BLOCK);
          spawns.push({ type: "crumble", tx: x, ty: y, ...pos });
          break;
        case "P":
          playerStart = pos;
          break;
      }
    }
  });

  return {
    tiles,
    width,
    rows: lines.length,
    playerStart,
    spawns,
    killY: (lines.length + 4) * TILE, // falling below this kills (PG-16)
    camBottom: (lines.length + 2) * TILE,
  };
}

// Solid query. Columns outside the layout act as invisible walls at
// both level ends (PG-35).
export function solidAt(level, tx, ty) {
  if (tx < 0 || tx >= level.width) return true;
  return level.tiles.has(`${tx},${ty}`);
}

export function pointSolid(level, px, py) {
  return solidAt(level, Math.floor(px / TILE), Math.floor(py / TILE));
}

// Bodies are { x, y, w, h, ox, oy, vx, vy } with (x, y) the node
// origin and (ox, oy) the collision-shape offset, like the Godot
// scenes (player box is 10x14 at y+1, enemy body 12x10 at y+3).
export function bodyRect(body) {
  return {
    left: body.x + (body.ox || 0) - body.w / 2,
    top: body.y + (body.oy || 0) - body.h / 2,
    right: body.x + (body.ox || 0) + body.w / 2,
    bottom: body.y + (body.oy || 0) + body.h / 2,
  };
}

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

const EPS = 0.001;

// Per-axis AABB-vs-grid movement with contact flags, replacing
// move_and_slide. Velocities are pixels/second; per-frame movement is
// far below one tile at 60 Hz, so single-step clamping cannot tunnel.
// Sets body.onFloor / onWall / onCeiling and zeroes the blocked axis.
export function moveBody(level, body, dt) {
  body.onFloor = false;
  body.onWall = false;
  body.onCeiling = false;

  // Horizontal
  body.x += body.vx * dt;
  let r = bodyRect(body);
  const ty0 = Math.floor(r.top / TILE);
  const ty1 = Math.floor((r.bottom - EPS) / TILE);
  if (body.vx > 0) {
    const tx = Math.floor((r.right - EPS) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (solidAt(level, tx, ty)) {
        body.x -= r.right - tx * TILE;
        body.vx = 0;
        body.onWall = true;
        break;
      }
    }
  } else if (body.vx < 0) {
    const tx = Math.floor(r.left / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (solidAt(level, tx, ty)) {
        body.x += (tx + 1) * TILE - r.left;
        body.vx = 0;
        body.onWall = true;
        break;
      }
    }
  }

  // Vertical. The downward check also runs at vy == 0 with a tiny
  // probe below the feet so onFloor stays true while resting — the
  // callers (player/enemy) skip gravity on the floor, like the Godot
  // scripts, so without the probe the flag would flicker every frame.
  body.y += body.vy * dt;
  r = bodyRect(body);
  const tx0 = Math.floor(r.left / TILE);
  const tx1 = Math.floor((r.right - EPS) / TILE);
  if (body.vy >= 0) {
    const ty = Math.floor((r.bottom + 0.01) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (solidAt(level, tx, ty)) {
        if (r.bottom > ty * TILE) body.y -= r.bottom - ty * TILE;
        body.vy = 0;
        body.onFloor = true;
        break;
      }
    }
  } else {
    const ty = Math.floor(r.top / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (solidAt(level, tx, ty)) {
        body.y += (ty + 1) * TILE - r.top;
        body.vy = 0;
        body.onCeiling = true;
        break;
      }
    }
  }
}
