// Gameplay regression suite — the Vitest counterpart of godot-game's
// tests/gameplay_test.gd, run against the pure logic modules:
// physics step, collision, player feel (coyote/buffer/double jump),
// enemy patrol, contact rules, and the game-state flow.

import { describe, it, expect, vi } from "vitest";
import {
  TILE,
  GRAVITY,
  buildLevel,
  solidAt,
  moveBody,
  bodyRect,
  GRASS,
  DIRT,
  BLOCK,
} from "./physics.js";
import { Input } from "./input.js";
import { buildJoinLink } from "./joinLink.js";
import {
  createPlayer,
  updatePlayer,
  killPlayer,
  respawnPlayer,
  SPEED,
  JUMP_VELOCITY,
  JUMP_CUT_MULTIPLIER,
  STOMP_BOUNCE,
  MAX_AIR_JUMPS,
} from "./player.js";
import { createEnemy, updateEnemy, ENEMY_SPEED } from "./enemy.js";
import {
  createCoin,
  createSpikes,
  createCheckpoint,
  createFlag,
  updateCoin,
  processInteractions,
} from "./entities.js";
import { GameState, START_LIVES } from "./state.js";
import { LEVELS } from "./levels.js";

const DT = 1 / 60;

// A flat 20-tile floor with walls implied by the layout edges.
const FLAT = ["..P.................", "G".repeat(20)].join("\n");

function makeInput({ down = [], pressed = [], released = [] } = {}) {
  return {
    isDown: (a) => down.includes(a),
    justPressed: (a) => pressed.includes(a),
    justReleased: (a) => released.includes(a),
    axis: () =>
      (down.includes("move_right") ? 1 : 0) -
      (down.includes("move_left") ? 1 : 0),
  };
}

const IDLE = makeInput();
const noFx = { play: () => {} };

function settle(player, level, frames = 30) {
  for (let i = 0; i < frames; i++) updatePlayer(player, IDLE, level, DT, noFx);
}

function events() {
  const log = [];
  return {
    log,
    ev: {
      onCoin: () => log.push("coin"),
      onStomp: () => log.push("stomp"),
      onPlayerDeath: () => log.push("death"),
      onCheckpoint: () => log.push("checkpoint"),
      onFlag: () => log.push("flag"),
    },
  };
}

function world(level, player, over = {}) {
  return {
    player,
    level,
    coins: [],
    enemies: [],
    spikes: [],
    checkpoints: [],
    flags: [],
    ...over,
  };
}

describe("buildJoinLink", () => {
  it("adds the join parameter and targets the platformer page", () => {
    const link = buildJoinLink("ABCD", "https://example.com/vite-project/");
    expect(link).toContain("join=ABCD");
    expect(link).toContain("/platformer/");
  });
});

describe("Input", () => {
  it("does not hijack movement keys while typing in a text field", () => {
    const input = new Input();
    const preventDefault = vi.fn();
    input._keyDown({
      code: "KeyD",
      repeat: false,
      target: { tagName: "INPUT" },
      preventDefault,
    });

    expect(input.isDown("move_right")).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("buildLevel", () => {
  it("parses tiles, spawns, and the player start", () => {
    const level = buildLevel("..P.C.E.S.K.F...\n" + "G".repeat(16));
    expect(level.width).toBe(16);
    expect(level.playerStart).toEqual({ x: 2 * TILE + 8, y: 8 });
    const types = level.spawns.map((s) => s.type).sort();
    expect(types).toEqual(["checkpoint", "coin", "enemy", "flag", "spikes"]);
    expect(level.tiles.get("0,1")).toBe(GRASS);
    // grass backfills two dirt rows below (level.gd::_place)
    expect(level.tiles.get("0,2")).toBe(DIRT);
    expect(level.tiles.get("0,3")).toBe(DIRT);
    expect(level.killY).toBe((2 + 4) * TILE);
  });

  it("treats columns outside the level as solid walls (PG-35)", () => {
    const level = buildLevel(FLAT);
    expect(solidAt(level, -1, 0)).toBe(true);
    expect(solidAt(level, level.width, 0)).toBe(true);
    expect(solidAt(level, 5, 0)).toBe(false);
  });

  it("all six shipped levels parse with a player start and a flag", () => {
    for (const data of LEVELS) {
      const level = buildLevel(data.layout);
      expect(level.playerStart).toBeTruthy();
      expect(level.spawns.some((s) => s.type === "flag")).toBe(true);
    }
  });
});

describe("moveBody", () => {
  it("lands a falling body on the floor and keeps onFloor while resting", () => {
    const level = buildLevel(FLAT);
    const body = { x: 40, y: 0, vx: 0, vy: 100, w: 10, h: 14, ox: 0, oy: 1 };
    for (let i = 0; i < 60; i++) {
      body.vy += GRAVITY * DT * (body.onFloor ? 0 : 1);
      moveBody(level, body, DT);
    }
    expect(body.onFloor).toBe(true);
    expect(bodyRect(body).bottom).toBeCloseTo(TILE, 3); // floor top
    // resting with vy == 0 must not flicker the flag (floor probe)
    moveBody(level, body, DT);
    expect(body.onFloor).toBe(true);
  });

  it("blocks horizontal movement at the level edge walls", () => {
    const level = buildLevel(FLAT);
    const body = {
      x: 8,
      y: TILE - 8,
      vx: 0,
      vy: 0,
      w: 10,
      h: 14,
      ox: 0,
      oy: 1,
    };
    // vx is re-applied each frame, as the player/enemy updates do —
    // contact flags reflect the latest moveBody call, like Godot.
    for (let i = 0; i < 30; i++) {
      body.vx = -SPEED;
      moveBody(level, body, DT);
    }
    expect(bodyRect(body).left).toBeGreaterThanOrEqual(0);
    expect(body.onWall).toBe(true);
  });

  it("stops upward movement at a ceiling", () => {
    const level = buildLevel(["BBBB", "....", "....", "GGGG"].join("\n"));
    const body = { x: 32, y: 40, vx: 0, vy: 0, w: 10, h: 14, ox: 0, oy: 1 };
    for (let i = 0; i < 10; i++) {
      body.vy = -300;
      moveBody(level, body, DT);
    }
    expect(body.onCeiling).toBe(true);
    expect(bodyRect(body).top).toBeGreaterThanOrEqual(TILE);
  });
});

describe("player", () => {
  function grounded() {
    const level = buildLevel(FLAT);
    const p = createPlayer(level.playerStart.x, level.playerStart.y);
    settle(p, level);
    return { level, p };
  }

  it("jumps from the floor with JUMP_VELOCITY", () => {
    const { level, p } = grounded();
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx);
    expect(p.vy).toBeCloseTo(JUMP_VELOCITY, 0);
  });

  it("cuts the ascent when jump is released early", () => {
    const { level, p } = grounded();
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx);
    const rising = p.vy;
    updatePlayer(p, makeInput({ released: ["jump"] }), level, DT, noFx);
    expect(p.vy).toBeGreaterThan(rising * 0.5); // less negative
    expect(p.vy).toBeCloseTo((rising + GRAVITY * DT) * JUMP_CUT_MULTIPLIER, 1);
  });

  it("allows a coyote-time jump shortly after leaving a ledge", () => {
    const level = buildLevel(["P...", "G...", "....", "...."].join("\n"));
    const p = createPlayer(8, 8);
    settle(p, level, 10);
    const run = makeInput({ down: ["move_right"] });
    while (p.onFloor) updatePlayer(p, run, level, DT, noFx);
    updatePlayer(p, run, level, DT, noFx); // 1 airborne frame < 0.1s
    updatePlayer(
      p,
      makeInput({ down: ["move_right"], pressed: ["jump"] }),
      level,
      DT,
      noFx,
    );
    expect(p.vy).toBeLessThan(JUMP_VELOCITY * 0.9);
  });

  it("buffers a jump pressed just before landing", () => {
    const { level, p } = grounded();
    p.y -= 4; // a hair above the floor, falling
    p.vy = 50;
    p.onFloor = false;
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx); // buffered, no double jump left? airJumps consumed?
    p.airJumps = 0; // isolate the buffer path
    for (let i = 0; i < 5 && p.vy >= 0; i++)
      updatePlayer(p, IDLE, level, DT, noFx);
    expect(p.vy).toBeLessThan(0); // jumped on the frame it landed
  });

  it("grants exactly one double jump, reset on landing", () => {
    const { level, p } = grounded();
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx);
    for (let i = 0; i < 8; i++) updatePlayer(p, IDLE, level, DT, noFx);
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx);
    expect(p.vy).toBeCloseTo(JUMP_VELOCITY, 0);
    expect(p.airJumps).toBe(0);
    const vyBefore = (updatePlayer(p, IDLE, level, DT, noFx), p.vy);
    updatePlayer(p, makeInput({ pressed: ["jump"] }), level, DT, noFx);
    expect(p.vy).toBeCloseTo(vyBefore + GRAVITY * DT, 1); // third press ignored
    settle(p, level, 120);
    expect(p.onFloor).toBe(true);
    expect(p.airJumps).toBe(MAX_AIR_JUMPS);
  });

  it("respawns at the checkpoint after dying", () => {
    const { level, p } = grounded();
    expect(killPlayer(p)).toBe(true);
    expect(killPlayer(p)).toBe(false); // guarded while dying
    expect(p.dying).toBe(true);
    respawnPlayer(p, { x: 100, y: 8 });
    expect(p.dying).toBe(false);
    expect(p.x).toBe(100);
  });
});

describe("enemy", () => {
  it("patrols a platform without walking off the ledge", () => {
    const level = buildLevel(
      ["........", "..GGGG..", "........", "........"].join("\n"),
    );
    const e = createEnemy(4 * TILE, TILE + 3);
    for (let i = 0; i < 60 * 10; i++) updateEnemy(e, level, DT);
    expect(e.x).toBeGreaterThan(2 * TILE);
    expect(e.x).toBeLessThan(6 * TILE);
    expect(e.onFloor).toBe(true);
  });

  it("turns around at walls", () => {
    const level = buildLevel(["B......B", "GGGGGGGG"].join("\n"));
    const e = createEnemy(4 * TILE, 8);
    const before = e.dir;
    let turned = false;
    for (let i = 0; i < 60 * 5; i++) {
      updateEnemy(e, level, DT);
      if (e.dir !== before) turned = true;
    }
    expect(turned).toBe(true);
    expect(e.x).toBeGreaterThan(TILE);
    expect(e.x).toBeLessThan(7 * TILE);
  });
});

describe("contact rules", () => {
  it("coin pickup fires once and increments through the callback", () => {
    const level = buildLevel(FLAT);
    const p = createPlayer(40, TILE - 8);
    const coin = createCoin(40, TILE - 8);
    const { log, ev } = events();
    const w = world(level, p, { coins: [coin] });
    processInteractions(w, ev);
    processInteractions(w, ev);
    expect(log).toEqual(["coin"]);
    for (let i = 0; i < 20; i++) updateCoin(coin, DT);
    expect(coin.gone).toBe(true);
  });

  it("stomping kills the enemy and bounces the player", () => {
    const level = buildLevel(FLAT);
    const e = createEnemy(40, TILE - 8);
    // Feet overlapping the top of the hitbox, center above the enemy.
    const p = createPlayer(40, TILE - 16);
    p.vy = 100; // falling onto it from above
    const { log, ev } = events();
    processInteractions(world(level, p, { enemies: [e] }), ev);
    expect(log).toEqual(["stomp"]);
    expect(e.dead).toBe(true);
    expect(p.vy).toBe(STOMP_BOUNCE);
    for (let i = 0; i < 10; i++) updateEnemy(e, level, DT);
    expect(e.gone).toBe(true);
  });

  it("side contact with an enemy kills the player", () => {
    const level = buildLevel(FLAT);
    const e = createEnemy(40, TILE - 8);
    const p = createPlayer(46, TILE - 8); // beside it, not above
    const { log, ev } = events();
    processInteractions(world(level, p, { enemies: [e] }), ev);
    expect(log).toEqual(["death"]);
    expect(e.dead).toBe(false);
  });

  it("spikes kill the player", () => {
    const level = buildLevel(FLAT);
    const p = createPlayer(40, TILE - 8);
    const { log, ev } = events();
    processInteractions(
      world(level, p, { spikes: [createSpikes(40, TILE - 8)] }),
      ev,
    );
    expect(log).toEqual(["death"]);
  });

  it("checkpoint and flag trigger once each", () => {
    const level = buildLevel(FLAT);
    const p = createPlayer(40, TILE - 8);
    const k = createCheckpoint(40, TILE - 8);
    const f = createFlag(40, TILE - 8);
    const { log, ev } = events();
    const w = world(level, p, { checkpoints: [k], flags: [f] });
    processInteractions(w, ev);
    processInteractions(w, ev);
    expect(log).toEqual(["checkpoint", "flag"]);
    expect(k.activated).toBe(true);
    expect(f.reached).toBe(true);
  });

  it("falling below the kill plane kills the player (PG-16)", () => {
    const level = buildLevel(FLAT);
    const p = createPlayer(40, level.killY + 1);
    const { log, ev } = events();
    processInteractions(world(level, p), ev);
    expect(log).toEqual(["death"]);
  });

  it("a dying player triggers nothing", () => {
    const level = buildLevel(FLAT);
    const p = createPlayer(40, TILE - 8);
    killPlayer(p);
    const { log, ev } = events();
    processInteractions(
      world(level, p, { spikes: [createSpikes(40, TILE - 8)] }),
      ev,
    );
    expect(log).toEqual([]);
  });
});

describe("game state flow", () => {
  it("start -> mid-world complete -> world map (PLAT-25)", () => {
    const s = new GameState();
    s.startGame();
    expect(s.screen).toBe("playing");
    expect(s.lives).toBe(START_LIVES);
    s.levelComplete(); // level 1-1 is not last in world 1
    expect(s.screen).toBe("worldmap");
    expect(s.levelsCompleted).toBe(1);
    // Continue proceeds to the next level (1-2).
    s.continueFromWorldMap();
    expect(s.screen).toBe("playing");
    expect(s.currentLevel).toBe(1);
  });

  it("finishing a world shows the world map, then continues", () => {
    const s = new GameState();
    s.startGame();
    s.gotoLevel(2); // 1-3, last of world 1
    s.levelComplete();
    expect(s.screen).toBe("worldmap");
    s.continueFromWorldMap();
    expect(s.screen).toBe("playing");
    expect(s.currentLevel).toBe(3); // 2-1
  });

  it("finishing the last level wins the game", () => {
    const s = new GameState();
    s.startGame();
    s.gotoLevel(LEVELS.length - 1);
    s.levelsCompleted = LEVELS.length - 1;
    s.levelComplete();
    expect(s.screen).toBe("worldmap");
    s.continueFromWorldMap();
    expect(s.screen).toBe("win");
  });

  it("running out of lives, then Retry resets lives (game_over.gd)", () => {
    const s = new GameState();
    s.startGame();
    expect(s.loseLife()).toBe(false);
    expect(s.loseLife()).toBe(false);
    expect(s.loseLife()).toBe(true);
    s.gameOver();
    expect(s.screen).toBe("gameover");
    s.retryLevel();
    expect(s.lives).toBe(START_LIVES);
    expect(s.screen).toBe("playing");
  });

  it("labels levels world-stage and detects world boundaries", () => {
    const s = new GameState();
    expect(LEVELS.map((l) => l.label)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "2-1",
      "2-2",
      "2-3",
      "3-1",
      "3-2",
      "3-3",
      "4-1",
      "4-2",
      "4-3",
      "5-1",
      "5-2",
      "5-3",
      "6-1",
      "6-2",
      "6-3",
    ]);
    expect(s.isLastInWorld(2)).toBe(true);
    expect(s.isLastInWorld(1)).toBe(false);
    expect(s.isLastInWorld(LEVELS.length - 1)).toBe(true);
    expect(s.flatIndex(1, 0)).toBe(3);
  });
});
