// Regression suite for the World 3 (cave) and World 4 (space) mechanics
// (PG-38/PG-39): gravity scaling, bats, alien spawns, falling
// stalactites, meteors, lava, crumbling-platform tiles, and that the two
// new worlds are wired into WORLDS/LEVELS.

import { describe, it, expect } from "vitest";
import { TILE, GRAVITY, buildLevel, solidAt } from "./physics.js";
import { createPlayer, updatePlayer } from "./player.js";
import { createBat, updateBat, createAlien } from "./enemy.js";
import {
  createLava,
  createStalactite,
  createMeteor,
  updateStalactite,
  updateMeteor,
  processInteractions,
  METEOR_SPEED,
} from "./entities.js";
import { WORLDS, LEVELS } from "./levels.js";

const DT = 1 / 60;
const IDLE = {
  isDown: () => false,
  justPressed: () => false,
  justReleased: () => false,
  axis: () => 0,
};
const noFx = { play: () => {} };

// A tall, floorless column so the player just falls (tests gravity).
const AIR = ["..P.................", ...Array(20).fill("...................")].join("\n");

describe("gravity scaling (low-gravity worlds)", () => {
  it("falls slower when gravityScale < 1", () => {
    const full = buildLevel(AIR);
    full.gravityScale = 1;
    const low = buildLevel(AIR);
    low.gravityScale = 0.5;

    const pFull = createPlayer(full.playerStart.x, full.playerStart.y);
    const pLow = createPlayer(low.playerStart.x, low.playerStart.y);
    for (let i = 0; i < 10; i++) {
      updatePlayer(pFull, IDLE, full, DT, noFx);
      updatePlayer(pLow, IDLE, low, DT, noFx);
    }
    // Half gravity => roughly half the downward speed and distance.
    expect(pLow.vy).toBeGreaterThan(0);
    expect(pLow.vy).toBeCloseTo(pFull.vy * 0.5, 1);
    expect(pLow.y).toBeLessThan(pFull.y);
  });

  it("defaults to full gravity when unset", () => {
    const lvl = buildLevel(AIR); // no gravityScale set
    const p = createPlayer(lvl.playerStart.x, lvl.playerStart.y);
    updatePlayer(p, IDLE, lvl, DT, noFx);
    expect(p.vy).toBeCloseTo(GRAVITY * DT, 3);
  });
});

describe("bat enemy", () => {
  it("reverses when it meets a wall", () => {
    // Tall wall column at x=0 spanning the bat's row; bat starts a couple
    // tiles right of it, drifting left (dir defaults to -1).
    const lvl = buildLevel(
      ["B...................", "B...................", "GGGGGGGGGGGGGGGGGGGG"].join("\n"),
    );
    const bat = createBat(TILE * 2, TILE * 1); // row 1, where the wall is solid
    expect(bat.dir).toBe(-1);
    for (let i = 0; i < 40; i++) updateBat(bat, lvl, DT);
    expect(bat.dir).toBe(1); // turned around at the wall
  });

  it("bobs vertically around its spawn height", () => {
    const lvl = buildLevel(["....................", "GGGGGGGGGGGGGGGGGGGG"].join("\n"));
    const bat = createBat(TILE * 8, TILE * 3);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      updateBat(bat, lvl, DT);
      min = Math.min(min, bat.y);
      max = Math.max(max, bat.y);
    }
    expect(max - min).toBeGreaterThan(4); // visible bob amplitude
  });

  it("alien is a walker kind, bat is a bat kind", () => {
    expect(createAlien(0, 0).kind).toBe("alien");
    expect(createBat(0, 0).kind).toBe("bat");
  });
});

describe("falling stalactite", () => {
  const lvl = buildLevel(["....................", "GGGGGGGGGGGGGGGGGGGG"].join("\n"));

  it("stays put until the player passes beneath, then falls", () => {
    const s = createStalactite(TILE * 5, TILE * 2);
    const away = createPlayer(TILE * 12, TILE * 2 + 40);
    updateStalactite(s, lvl, away, DT);
    expect(s.falling).toBe(false);

    const below = createPlayer(TILE * 5, TILE * 4);
    updateStalactite(s, lvl, below, DT);
    expect(s.falling).toBe(true);
    const y0 = s.y;
    for (let i = 0; i < 5; i++) updateStalactite(s, lvl, below, DT);
    expect(s.y).toBeGreaterThan(y0);
  });

  it("kills the player on contact", () => {
    const s = createStalactite(TILE * 5, TILE * 2);
    s.falling = true;
    const p = createPlayer(TILE * 5, TILE * 2); // overlapping
    let died = false;
    processInteractions(
      { player: p, level: lvl, coins: [], enemies: [], spikes: [], stalactites: [s], checkpoints: [], flags: [] },
      { onCoin() {}, onStomp() {}, onCheckpoint() {}, onFlag() {}, onPlayerDeath() { died = true; } },
    );
    expect(died).toBe(true);
  });
});

describe("meteor", () => {
  const lvl = buildLevel(["....................", "GGGGGGGGGGGGGGGGGGGG"].join("\n"));

  it("falls at constant speed and is removed past killY", () => {
    const m = createMeteor(TILE * 5, 0);
    updateMeteor(m, lvl, DT);
    expect(m.y).toBeCloseTo(METEOR_SPEED * DT, 3);
    for (let i = 0; i < 600 && !m.gone; i++) updateMeteor(m, lvl, DT);
    expect(m.gone).toBe(true);
  });

  it("kills the player on contact", () => {
    const m = createMeteor(TILE * 5, TILE * 3);
    const p = createPlayer(TILE * 5, TILE * 3);
    let died = false;
    processInteractions(
      { player: p, level: lvl, coins: [], enemies: [], spikes: [], meteors: [m], checkpoints: [], flags: [] },
      { onCoin() {}, onStomp() {}, onCheckpoint() {}, onFlag() {}, onPlayerDeath() { died = true; } },
    );
    expect(died).toBe(true);
  });
});

describe("lava", () => {
  const lvl = buildLevel(["....................", "GGGGGGGGGGGGGGGGGGGG"].join("\n"));
  it("kills the player on contact", () => {
    const l = createLava(TILE * 5, TILE * 3);
    const p = createPlayer(TILE * 5, TILE * 3);
    let died = false;
    processInteractions(
      { player: p, level: lvl, coins: [], enemies: [], spikes: [], lava: [l], checkpoints: [], flags: [] },
      { onCoin() {}, onStomp() {}, onCheckpoint() {}, onFlag() {}, onPlayerDeath() { died = true; } },
    );
    expect(died).toBe(true);
  });
});

describe("buildLevel new legend", () => {
  it("crumble tile starts solid and also emits a crumble spawn", () => {
    const lvl = buildLevel(["X...", "GGGG"].join("\n"));
    expect(solidAt(lvl, 0, 0)).toBe(true); // X is solid to start
    const crumble = lvl.spawns.find((s) => s.type === "crumble");
    expect(crumble).toMatchObject({ tx: 0, ty: 0 });
  });

  it("spawns lava, bat, alien, and stalactite from L/V/A/T", () => {
    const lvl = buildLevel(["LVAT", "GGGG"].join("\n"));
    const types = lvl.spawns.map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(["lava", "bat", "alien", "stalactite"]));
    // Lava must not be solid (it's a touch-to-die hazard, not a floor).
    expect(solidAt(lvl, 0, 0)).toBe(false);
  });
});

describe("worlds wiring", () => {
  it("exposes four worlds of three levels each", () => {
    expect(WORLDS).toHaveLength(4);
    for (const world of WORLDS) expect(world).toHaveLength(3);
    expect(LEVELS).toHaveLength(12);
  });

  it("labels the new levels 3-1..4-3 and every level is completable-shaped", () => {
    expect(LEVELS[6].label).toBe("3-1");
    expect(LEVELS[11].label).toBe("4-3");
    for (const lvl of LEVELS) {
      const built = buildLevel(lvl.layout);
      expect(built.playerStart).toBeTruthy();
      expect(built.spawns.some((s) => s.type === "flag")).toBe(true);
    }
  });

  it("applies low gravity only to World 4", () => {
    expect(LEVELS[6].gravity).toBeUndefined(); // World 3 = normal
    expect(LEVELS[9].gravity).toBe(0.55); // World 4-1
    expect(LEVELS[10].meteors).toBe(true); // 4-2 meteor shower
  });
});
