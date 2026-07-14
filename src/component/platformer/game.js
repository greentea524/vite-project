// Canvas engine: fixed-timestep loop, camera, and rendering. Godot
// equivalents: the level scene (level.gd), the ParallaxBackground
// clouds, per-world tinting via modulate, and the Camera2D with
// smoothing and limits. The game renders a 320x180 world view — the
// Godot project's 640x360 viewport at 2x camera zoom.

import { TILE, BLOCK, buildLevel, bodyRect, rectsOverlap, solidAt } from "./physics.js";
import { LEVELS } from "./levels.js";
import {
  createPlayer,
  updatePlayer,
  killPlayer,
  respawnPlayer,
  playerFrame,
  RESPAWN_DELAY,
  SHEET_FRAMES,
  SHEET_FPS,
} from "./player.js";
import {
  createEnemy,
  updateEnemy,
  enemyFrame,
  createAlien,
  createBat,
  updateBat,
  batFrame,
  createYeti,
  createDrone,
} from "./enemy.js";
import {
  createCoin,
  createSpikes,
  createCheckpoint,
  createFlag,
  createLava,
  createStalactite,
  createMeteor,
  createVolcano,
  createFreezingWater,
  createLaser,
  updateCoin,
  updateStalactite,
  updateMeteor,
  updateVolcano,
  updateLavaRock,
  updateLaser,
  coinFrame,
  processInteractions,
} from "./entities.js";
import { Input } from "./input.js";
import { Sfx } from "./sfx.js";
import { loadImages } from "./assets.js";
import { createGhost, pushSnapshot, sampleGhost } from "./ghosts.js";

export const VIEW_W = 320;
export const VIEW_H = 180;
// Name labels render on a separate, higher-res overlay canvas that
// scales smoothly, so text stays crisp over the pixelated game canvas.
export const LABEL_SCALE = 4;
const DT = 1 / 60;
const MAX_FRAME = 0.25;
const CAM_SMOOTHING = 5; // Camera2D position_smoothing_speed default
const GAME_OVER_DELAY = 1.0;
// Crumbling platform timings (World 3, PG-42).
const CRUMBLE_SHAKE = 0.4; // wobble time before it drops
const CRUMBLE_RESPAWN = 3.0; // time before it returns
const CONVEYOR_DRIFT = 60; // px/s nudge on conveyor belts (World 6)

// Two looping cloud layers at different scroll speeds and sizes give
// the background depth (PG-31). From level.gd::_add_clouds.
const CLOUD_LAYERS = [
  { speed: 0.2, y: 10, scale: 1, alpha: 0.65 },
  { speed: 0.45, y: 46, scale: 1.5, alpha: 1 },
];
const CLOUD_Y_SCALE = 0.1; // vertical motion_scale

const AVATAR_SHEET_NAMES = ["player", "player2", "player3", "player4", "player5", "player6"];
const CHECKPOINT_TINT = [0.55, 1, 0.55];
const DEATH_TINT = [1, 0.45, 0.45];

const css = ([r, g, b]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
const isWhite = ([r, g, b]) => r === 1 && g === 1 && b === 1;

// Stable per-cell pseudo-random in [0,1) for procedural decor (stars,
// crystals) so the backdrop doesn't jitter as the camera moves.
// Math.imul keeps the multiplies in 32-bit — a plain float multiply
// overflows 2^53 and truncates the low bits, which made outputs
// cluster near 0 for some seeds (#53: cave props barely spawned).
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Frame for a ghost given only its anim name (we don't track a remote
// player's animation clock, so drive it from wall time).
function animFrameFor(anim) {
  const frames = SHEET_FRAMES[anim] ?? SHEET_FRAMES.idle;
  const fps = SHEET_FPS[anim] ?? 4;
  return frames[Math.floor((performance.now() / 1000) * fps) % frames.length];
}

// Fan players out around the start point by their room slot so ghosts
// don't stack on the local player (PLAT-19 polish). Centered on P so no
// slot gets a positional edge: 0, +12, -12, +24, -24, …
const SPAWN_SPACING = 12;
function spawnOffset(slot) {
  if (!slot) return 0;
  const step = Math.ceil(slot / 2) * SPAWN_SPACING;
  return slot % 2 === 1 ? step : -step;
}

export class Engine {
  constructor(canvas, state, labelCanvas = null) {
    this.canvas = canvas;
    canvas.__engine = this; // debug/testing handle
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    // Optional high-res overlay for crisp name labels (multiplayer).
    this.labelCanvas = labelCanvas;
    this.labelCtx = labelCanvas ? labelCanvas.getContext("2d") : null;
    this.state = state;
    this.input = new Input();
    this.sfx = new Sfx();
    this.level = null;
    this.theme = null;
    this._tintCache = new Map();
    this._raf = 0;
    this._unsubs = [];
    this._pending = null; // { t, fn } — delayed respawn / game over
    // Multiplayer (PLAT-22): remote players rendered as ghosts.
    this.network = null;
    this.ghosts = new Map(); // id -> ghost (see ghosts.js)
  }

  // Wire in a Network so the engine broadcasts the local player and
  // renders remote players as ghosts. Single-player leaves this unset.
  attachNetwork(network) {
    this.network = network;
    this._unsubs.push(
      network.on("remoteState", (snap) => {
        let ghost = this.ghosts.get(snap.id);
        if (!ghost) {
          const meta = network.roster.find((r) => r.id === snap.id) ?? { id: snap.id };
          ghost = createGhost(meta);
          this.ghosts.set(snap.id, ghost);
        }
        pushSnapshot(ghost, snap, performance.now());
      }),
      network.on("playerLeft", ({ id }) => this.ghosts.delete(id)),
      network.on("enemyKilled", (enemyId) => {
        if (!this.enemies) return;
        const e = this.enemies.find((x) => x.id === enemyId);
        if (e && !e.gone) e.gone = true;
      }),
    );
  }

  async start() {
    this.images = await loadImages();
    this.input.attach(window);
    this._unsubs.push(this.state.on("level", (index) => this.loadLevel(index)));
    this._unsubs.push(this.state.on("screen", (screen) => {
      if (screen === "menu" || screen === "lobby") {
        this.level = null;
      }
    }));
    let last = performance.now();
    let acc = 0;
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      acc += Math.min((now - last) / 1000, MAX_FRAME);
      last = now;

      // Pause menu toggling is now handled centrally by React in Platformer.jsx

      if (this.state.screen === "playing" && this.level) {
        while (acc >= DT) {
          acc -= DT;
          this.step(DT);
          this.input.endFrame();
        }
      } else {
        // Frozen (menu/pause/transition screens): drop time and edges.
        acc = 0;
        this.input.endFrame();
      }
      this.render();
    };
    this._raf = requestAnimationFrame(tick);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.input.detach();
    for (const unsub of this._unsubs) unsub();
  }

  loadLevel(index) {
    const data = LEVELS[index];
    this.level = buildLevel(data.layout);
    // Low-gravity worlds scale the whole sim; default 1 (PG-43).
    this.level.gravityScale = data.gravity ?? 1;
    this.theme = data;
    this._pending = null;

    this.coins = [];
    this.enemies = [];
    this.spikes = [];
    this.checkpoints = [];
    this.flags = [];
    this.lava = [];
    this.stalactites = [];
    this.crumbles = [];
    this.meteors = [];
    this.volcanoes = [];
    this.lavaRocks = [];
    this.freezingWater = [];
    this.lasers = [];
    this.conveyors = [];
    for (const s of this.level.spawns) {
      if (s.type === "coin") this.coins.push(createCoin(s.x, s.y));
      else if (s.type === "enemy") this.enemies.push(createEnemy(s.x, s.y));
      else if (s.type === "alien") this.enemies.push(createAlien(s.x, s.y));
      else if (s.type === "bat") this.enemies.push(createBat(s.x, s.y));
      else if (s.type === "yeti") this.enemies.push(createYeti(s.x, s.y));
      else if (s.type === "drone") this.enemies.push(createDrone(s.x, s.y));
      else if (s.type === "spikes") this.spikes.push(createSpikes(s.x, s.y));
      else if (s.type === "lava") this.lava.push(createLava(s.x, s.y));
      else if (s.type === "freezingwater") this.freezingWater.push(createFreezingWater(s.x, s.y));
      else if (s.type === "stalactite")
        this.stalactites.push(createStalactite(s.x, s.y));
      else if (s.type === "volcano") this.volcanoes.push(createVolcano(s.x, s.y));
      else if (s.type === "laser") this.lasers.push(createLaser(s.x, s.y));
      else if (s.type === "conveyor")
        this.conveyors.push({ tx: s.tx, ty: s.ty, x: s.x, y: s.y, dir: s.dir });
      else if (s.type === "crumble")
        this.crumbles.push({ tx: s.tx, ty: s.ty, x: s.x, y: s.y, state: "idle", t: 0 });
      else if (s.type === "checkpoint")
        this.checkpoints.push(createCheckpoint(s.x, s.y));
      else if (s.type === "flag") this.flags.push(createFlag(s.x, s.y));
    }

    // Assign deterministic IDs to enemies for multiplayer sync (PG-61)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.id = `enemy_${i}`;
      if (this.network?.deadEnemies?.has(e.id)) {
        e.gone = true;
      }
    }

    // Ice physics flag (World 5): makes the player slide.
    this.level.ice = !!data.ice;
    // Meteor shower (World 4): spawn on a randomized timer across the
    // visible span. Disabled unless the theme opts in.
    this.meteorsOn = !!data.meteors;
    this.meteorTimer = 1.2;

    const start = this.level.playerStart ?? { x: TILE / 2, y: TILE / 2 };
    // In a race, offset the spawn by this player's slot so everyone
    // starts standing next to each other rather than stacked.
    const offset =
      this.network && this.state.multiplayer ? spawnOffset(this.network.selfSlot) : 0;
    const spawn = { x: start.x + offset, y: start.y };
    this.player = createPlayer(spawn.x, spawn.y);
    if (this.state.multiplayer && !this.network?.catchUpShields) {
      this.player.shield = 0;
    } else if (this.state.consecutiveDeaths >= 6) {
      this.player.shield = 2;
      this.state._emit("showTutorial", "shield2");
    } else if (this.state.consecutiveDeaths >= 3) {
      this.player.shield = 1;
      this.state._emit("showTutorial", "shield1");
    }
    this.state.setCheckpoint(spawn);
    this.cam = { x: 0, y: 0 };
    this.snapCamera();
  }

  step(dt) {
    const p = this.player;
    updatePlayer(p, this.input, this.level, dt, this.sfx);
    for (const e of this.enemies) {
      if (e.gone) continue;
      if (e.kind === "bat" || e.kind === "drone") updateBat(e, this.level, dt);
      else updateEnemy(e, this.level, dt);
    }
    for (const c of this.coins) if (!c.gone) updateCoin(c, dt);
    for (const s of this.stalactites) updateStalactite(s, this.level, p, dt);
    for (const m of this.meteors) if (!m.gone) updateMeteor(m, this.level, dt);
    for (const v of this.volcanoes) updateVolcano(v, dt, this.lavaRocks);
    for (const r of this.lavaRocks) if (!r.gone) updateLavaRock(r, this.level, dt);
    if (this.lavaRocks.length > 60) {
      this.lavaRocks = this.lavaRocks.filter((r) => !r.gone);
    }
    this.updateCrumbles(dt);
    for (const l of this.lasers) updateLaser(l, dt);
    this.updateConveyorDrift(dt);
    if (this.meteorsOn) this.updateMeteorSpawner(dt);

    processInteractions(
      {
        player: p,
        level: this.level,
        coins: this.coins,
        enemies: this.enemies,
        spikes: this.spikes,
        lava: this.lava,
        freezingWater: this.freezingWater,
        stalactites: this.stalactites,
        meteors: this.meteors,
        lavaRocks: this.lavaRocks,
        lasers: this.lasers,
        checkpoints: this.checkpoints,
        flags: this.flags,
      },
      {
        onCoin: () => {
          this.state.addCoin();
          this.sfx.play("coin");
        },
        onStomp: (e) => {
          this.state.addStomp();
          this.sfx.play("stomp");
          if (this.network && this.state.multiplayer) {
            this.network.sendEnemyKill(e.id);
          }
        },
        onCheckpoint: (k) => this.state.setCheckpoint({ x: k.x, y: k.y }),
        onFlag: () => {
          // Jingle plays on goal contact, before the UI transition (PG-27).
          this.sfx.play("level_complete");
          this.input.clear(); // Clear held input to prevent momentum on next level
          this.state.levelComplete();
        },
        onPlayerDeath: (cause) => this.onPlayerDeath(cause),
      },
    );

    if (this._pending) {
      this._pending.t -= dt;
      if (this._pending.t <= 0) {
        const fn = this._pending.fn;
        this._pending = null;
        fn();
      }
    }

    if (
      this.state.currentLevel === 0 &&
      !this.state.tutorialDoubleJumpShown &&
      p.x >= 280
    ) {
      this.state.markTutorialShown();
      this.state._emit("showTutorial", "doubleJump");
    }

    // Per-level clear timer for the speedrun achievements (#67).
    // step() only runs while screen === "playing", so pause and menu
    // time never count.
    this.state.addLevelTime(dt * 1000);

    // Multiplayer: accumulate the run timer (playing time only, so
    // pauses don't count) and broadcast a throttled snapshot.
    if (this.network && this.state.multiplayer) {
      this.state.addRunTime(dt * 1000);
      this.network.sendState({
        x: p.x,
        y: p.y,
        vx: p.vx,
        facing: p.facing,
        anim: p.anim,
        // Carried in every snapshot so ghosts self-correct even if a
        // roster update was missed (pushSnapshot consumes both).
        avatar: this.state.selectedAvatar,
        name: this.network.selfName,
        level: this.state.currentLevel,
        runTimeMs: Math.round(this.state.runTimeMs),
      });
    }

    this.updateCamera(dt);
  }

  onPlayerDeath(cause) {
    if (this.player.invuln > 0) return;

    if (this.player.shield > 0) {
      this.player.shield--;
      this.player.invuln = 1.5;
      this.sfx.play("checkpoint");
      if (cause === "fall") {
        respawnPlayer(this.player, this.state.respawn);
      } else {
        this.player.vy = -300;
        this.player.vx = -this.player.dir * 150;
      }
      return;
    }

    if (!killPlayer(this.player)) return;
    this.input.clear(); // Clear held input to prevent momentum during respawn
    if (this.state.loseLife(cause)) {
      this._pending = { t: GAME_OVER_DELAY, fn: () => this.state.gameOver() };
    } else {
      this._pending = {
        t: RESPAWN_DELAY,
        fn: () => {
          respawnPlayer(this.player, this.state.respawn);
          this.snapCamera();
        },
      };
    }
  }

  // Crumbling platforms (World 3): a cell shakes when the player stands
  // on it, drops out after CRUMBLE_SHAKE, then returns after
  // CRUMBLE_RESPAWN. Solidity is the presence of the tile key, so we
  // just delete / re-add it in level.tiles.
  updateCrumbles(dt) {
    const p = this.player;
    const pr = bodyRect(p);
    const feetTy = Math.floor((pr.bottom + 0.01) / TILE);
    const txMin = Math.floor(pr.left / TILE);
    const txMax = Math.floor((pr.right - 0.001) / TILE);
    for (const c of this.crumbles) {
      if (c.state === "idle") {
        const standing =
          p.onFloor && feetTy === c.ty && c.tx >= txMin && c.tx <= txMax;
        if (standing) {
          c.state = "shaking";
          c.t = CRUMBLE_SHAKE;
        }
      } else if (c.state === "shaking") {
        c.t -= dt;
        if (c.t <= 0) {
          this.level.tiles.delete(`${c.tx},${c.ty}`);
          c.state = "gone";
          c.t = CRUMBLE_RESPAWN;
        }
      } else if (c.state === "gone") {
        c.t -= dt;
        if (c.t <= 0) {
          // Don't rematerialize inside the player — wait until clear.
          const cell = {
            left: c.tx * TILE,
            top: c.ty * TILE,
            right: c.tx * TILE + TILE,
            bottom: c.ty * TILE + TILE,
          };
          if (!rectsOverlap(bodyRect(p), cell)) {
            this.level.tiles.set(`${c.tx},${c.ty}`, BLOCK);
            c.state = "idle";
          }
        }
      }
    }
  }

  // World 4 meteor shower: drop a meteor from above the camera at a
  // random x across the level on a randomized cadence, and drop
  // spent meteors from the list.
  updateMeteorSpawner(dt) {
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 0.7 + Math.random() * 1.1;
      const x = Math.random() * this.level.width * TILE;
      const y = this.cam.y - VIEW_H / 2 - TILE;
      this.meteors.push(createMeteor(x, y));
    }
    if (this.meteors.length > 40) {
      this.meteors = this.meteors.filter((m) => !m.gone);
    }
  }

  // World 6 conveyor belt drift: when the player stands on a conveyor tile,
  // apply a constant horizontal nudge.
  updateConveyorDrift(dt) {
    const p = this.player;
    if (!p.onFloor) return;
    const pr = bodyRect(p);
    const feetTy = Math.floor((pr.bottom + 0.01) / TILE);
    const txMin = Math.floor(pr.left / TILE);
    const txMax = Math.floor((pr.right - 0.001) / TILE);
    for (const c of this.conveyors) {
      if (feetTy === c.ty && c.tx >= txMin && c.tx <= txMax) {
        p.x += c.dir * CONVEYOR_DRIFT * dt;
        break; // only apply once if straddling two belts
      }
    }
  }

  cameraTarget() {
    const halfW = VIEW_W / 2;
    const halfH = VIEW_H / 2;
    const maxX = Math.max(halfW, this.level.width * TILE - halfW);
    return {
      x: Math.min(Math.max(this.player.x, halfW), maxX),
      y: Math.min(this.player.y, this.level.camBottom - halfH),
    };
  }

  snapCamera() {
    this.cam = this.cameraTarget();
  }

  updateCamera(dt) {
    const target = this.cameraTarget();
    const w = 1 - Math.exp(-CAM_SMOOTHING * dt);
    this.cam.x += (target.x - this.cam.x) * w;
    this.cam.y += (target.y - this.cam.y) * w;
  }

  // Multiply-tints an image, preserving alpha — Godot's modulate.
  // Used for the per-world tile/cloud tints, the activated
  // checkpoint, and the red death flash.
  tinted(name, color) {
    if (!color || isWhite(color)) return this.images[name];
    const key = `${name}:${color.join(",")}`;
    let canvas = this._tintCache.get(key);
    if (!canvas) {
      const img = this.images[name];
      canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = css(color);
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(img, 0, 0);
      this._tintCache.set(key, canvas);
    }
    return canvas;
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    // Clear the label overlay each frame (labels are redrawn below).
    if (this.labelCtx) this.labelCtx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    if (!this.level) {
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      return;
    }

    ctx.fillStyle = css(this.theme.sky);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const ox = this.cam.x - VIEW_W / 2; // world coords of the view origin
    const oy = this.cam.y - VIEW_H / 2;

    // Space skips clouds; other worlds keep the parallax layers.
    if (this.theme.clouds !== false) this.renderClouds(ctx, ox, oy);
    // Themed backdrop: cave glow or space starfield (PG-40/PG-43).
    if (this.theme.decor) this.renderDecor(ctx, ox, oy);
    this.renderTiles(ctx, ox, oy);
    this.renderLava(ctx, ox, oy);
    this.renderFreezingWater(ctx, ox, oy);
    this.renderConveyors(ctx, ox, oy);
    this.renderCrumbleFx(ctx, ox, oy);
    this.renderLasers(ctx, ox, oy);

    for (const s of this.spikes)
      this.drawSprite(ctx, "spike", 0, s.x - ox, s.y - oy);
    for (const k of this.checkpoints) {
      const img = k.activated
        ? this.tinted("checkpoint", CHECKPOINT_TINT)
        : this.images.checkpoint;
      ctx.drawImage(
        img,
        Math.round(k.x - ox - img.width / 2),
        Math.round(k.y - oy - img.height / 2),
      );
    }
    for (const f of this.flags) {
      const img = this.images.flag;
      ctx.drawImage(
        img,
        Math.round(f.x - ox - img.width / 2),
        Math.round(f.y - 8 - oy - img.height / 2),
      );
    }
    for (const c of this.coins) {
      if (c.gone) continue;
      ctx.globalAlpha = c.alpha;
      this.drawSprite(ctx, "coin", coinFrame(c), c.x - ox, c.y + c.riseY - oy);
      ctx.globalAlpha = 1;
    }
    for (const v of this.volcanoes) this.drawVolcano(ctx, v, ox, oy);
    for (const s of this.stalactites) {
      if (!s.gone) this.drawStalactite(ctx, s, ox, oy);
    }
    for (const m of this.meteors) {
      if (!m.gone) this.drawMeteor(ctx, m, ox, oy);
    }
    for (const r of this.lavaRocks) {
      if (!r.gone) this.drawLavaRock(ctx, r, ox, oy);
    }
    for (const e of this.enemies) {
      if (e.gone) continue;
      if (e.kind === "bat") this.drawBat(ctx, e, ox, oy);
      else if (e.kind === "alien") this.drawAlien(ctx, e, ox, oy);
      else if (e.kind === "yeti") this.drawYeti(ctx, e, ox, oy);
      else if (e.kind === "drone") this.drawDrone(ctx, e, ox, oy);
      else
        this.drawFrame(ctx, this.images.enemy, enemyFrame(e), e.x - ox, e.y - oy, {
          flip: e.dir > 0,
          scaleY: e.scaleY,
        });
    }

    // Ghosts: remote players on this same level, drawn translucently
    // behind the local player (PLAT-22).
    if (this.ghosts.size) this.renderGhosts(ctx, ox, oy);

    const p = this.player;
    const sheetName = AVATAR_SHEET_NAMES[this.state.selectedAvatar] ?? "player";
    const sheet = p.tint
      ? this.tinted(sheetName, DEATH_TINT)
      : this.images[sheetName];
    ctx.globalAlpha = p.alpha;
    this.drawFrame(ctx, sheet, playerFrame(p), p.x - ox, p.y - oy, {
      flip: p.facing < 0,
      scaleX: p.scaleX,
      scaleY: p.scaleY,
    });
    if (p.shield > 0) {
      ctx.beginPath();
      ctx.arc(p.x - ox, p.y - oy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = p.shield === 2 ? "rgba(255, 215, 0, 0.8)" : "rgba(85, 170, 255, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = p.shield === 2 ? "rgba(255, 215, 0, 0.2)" : "rgba(85, 170, 255, 0.2)";
      ctx.fill();
    }
    this.drawPlayerCostume(ctx, Math.round(p.x - ox), Math.round(p.y - oy), p.facing);
    ctx.globalAlpha = 1;
    // Own name tag in a race, so it's easy to tell who's who.
    if (this.network && this.state.multiplayer && this.network.selfName) {
      this.drawNameLabel(this.network.selfName, p.x - ox, p.y - oy);
    }

    this.renderProgressBar();
  }

  renderGhosts(ctx, ox, oy) {
    const now = performance.now();
    for (const ghost of this.ghosts.values()) {
      const v = sampleGhost(ghost, now);
      if (!v || v.level !== this.state.currentLevel) continue; // only same-level ghosts
      const sheet = this.images[AVATAR_SHEET_NAMES[v.avatar] ?? "player"];
      const gx = v.x - ox;
      const gy = v.y - oy;
      ctx.globalAlpha = 0.5;
      this.drawFrame(ctx, sheet, animFrameFor(v.anim), gx, gy, { flip: v.facing < 0 });
      this.drawPlayerCostume(ctx, Math.round(gx), Math.round(gy), v.facing);
      ctx.globalAlpha = 1;
      this.drawNameLabel(v.name, gx, gy);
    }
  }

  // Name tag above a player/ghost (multiplayer). Drawn to the high-res
  // overlay canvas so the text is crisp, not pixel-upscaled. (x, y) are
  // in game-view pixels; scaled up to the overlay's resolution.
  drawNameLabel(name, x, y) {
    const lc = this.labelCtx;
    if (!name || !lc) return;
    const S = LABEL_SCALE;
    lc.font = `bold ${6 * S}px monospace`;
    lc.textAlign = "center";
    lc.textBaseline = "alphabetic";
    const px = Math.round(x * S);
    const py = Math.round((y - 12) * S);
    lc.fillStyle = "rgba(0,0,0,0.65)";
    lc.fillText(name, px, py + S); // shadow for legibility
    lc.fillStyle = "rgba(255,255,255,0.95)";
    lc.fillText(name, px, py);
    lc.textAlign = "left";
  }

  renderProgressBar() {
    if (!this.flags.length || !this.labelCtx || this.state.screen !== "playing") return;
    const lc = this.labelCtx;
    const S = LABEL_SCALE;
    const startX = this.level.playerStart?.x ?? 0;
    const flagX = this.flags[0].x;
    
    // Bar dimensions
    const barW = VIEW_W - 40;
    const barH = 2;
    const bx = Math.round(20 * S);
    const by = Math.round(24 * S);
    const bw = Math.round(barW * S);
    const bh = Math.round(barH * S);

    // Track
    lc.fillStyle = "rgba(0,0,0,0.4)";
    lc.fillRect(bx, by, bw, bh);

    // Helpers
    const getProg = (x) => Math.max(0, Math.min(1, (x - startX) / (flagX - startX)));
    const getPx = (prog) => bx + Math.round(prog * bw);

    // Checkpoints
    for (const k of this.checkpoints) {
      const px = getPx(getProg(k.x));
      lc.fillStyle = k.activated ? "rgb(140,255,140)" : "rgba(255,255,255,0.3)";
      lc.fillRect(px - S, by - S, S * 2, bh + S * 2);
    }

    // Goal
    lc.fillStyle = "rgb(255,210,50)";
    lc.fillRect(bx + bw, by - S, S * 2, bh + S * 2);

    // Multiplayer ghosts
    const now = performance.now();
    for (const ghost of this.ghosts.values()) {
      const v = sampleGhost(ghost, now);
      if (!v || v.level !== this.state.currentLevel) continue;
      const prog = getProg(v.x);
      const px = getPx(prog);
      lc.fillStyle = "rgba(200,200,255,0.7)";
      lc.beginPath();
      lc.arc(px, by + S, S * 2, 0, Math.PI * 2);
      lc.fill();
    }

    // Local player
    const prog = getProg(this.player.x);
    const px = getPx(prog);
    lc.fillStyle = "rgb(255,255,255)";
    lc.beginPath();
    lc.arc(px, by + S, S * 3, 0, Math.PI * 2);
    lc.fill();
    lc.fillStyle = "rgb(50,150,255)";
    lc.beginPath();
    lc.arc(px, by + S, S * 1.5, 0, Math.PI * 2);
    lc.fill();
  }

  renderClouds(ctx, ox, oy) {
    const clouds = this.tinted("clouds", this.theme.cloudTint);
    for (const layer of CLOUD_LAYERS) {
      const w = clouds.width * layer.scale;
      const h = clouds.height * layer.scale;
      const y = layer.y - oy * CLOUD_Y_SCALE;
      let x = (-ox * layer.speed) % w;
      if (x > 0) x -= w;
      ctx.globalAlpha = layer.alpha;
      for (; x < VIEW_W; x += w) ctx.drawImage(clouds, x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  renderTiles(ctx, ox, oy) {
    // Frozen Peaks (World 5) reuses the grass atlas tile for its ground
    // (physics.js: ICE === GRASS), and a pale-blue multiply tint over
    // green grass still reads as green. Draw snow procedurally instead
    // so the floor actually looks wintry (#54 follow-up).
    const ice = this.theme.decor === "ice";
    const tiles = this.tinted("tiles", this.theme.tileTint);
    const tx0 = Math.floor(ox / TILE);
    const tx1 = Math.floor((ox + VIEW_W) / TILE);
    const ty0 = Math.floor(oy / TILE);
    const ty1 = Math.floor((oy + VIEW_H) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = this.level.tiles.get(`${tx},${ty}`);
        if (id === undefined) continue;
        const sx = Math.round(tx * TILE - ox);
        const sy = Math.round(ty * TILE - oy);
        if (ice) {
          // A tile is a "surface" when nothing sits directly above it —
          // that's where the fresh-snow cap goes (ground top and the top
          // of block platforms).
          const surface = !this.level.tiles.has(`${tx},${ty - 1}`);
          this.drawIceTile(ctx, sx, sy, id, surface);
        } else {
          ctx.drawImage(tiles, id * TILE, 0, TILE, TILE, sx, sy, TILE, TILE);
        }
      }
    }
  }

  // Snowy tile for World 5. id 0 = snow surface, id 1 = packed ice
  // (backfilled under the ground), id 2 = icy block platform. Surface
  // tiles get a bright, softly-scalloped snow cap.
  drawIceTile(ctx, x, y, id, surface) {
    if (id === 1) ctx.fillStyle = "#a9bcd0"; // packed ice/rock below
    else if (id === 2) ctx.fillStyle = "#c3d7ea"; // icy block
    else ctx.fillStyle = "#dceaf5"; // snow body
    ctx.fillRect(x, y, TILE, TILE);

    // Vertical shading for a little depth.
    const g = ctx.createLinearGradient(0, y, 0, y + TILE);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(120,150,180,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, TILE, TILE);

    if (surface) {
      // Faint blue shadow just beneath the snow line.
      ctx.fillStyle = "rgba(150,180,210,0.55)";
      ctx.fillRect(x, y + 4, TILE, 2);
      // Bright fresh snow with two rounded humps so the line isn't flat.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, TILE, 4);
      ctx.beginPath();
      ctx.arc(x + 4, y + 4, 3.2, 0, Math.PI * 2);
      ctx.arc(x + 12, y + 4, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Themed parallax backdrop drawn behind the clouds/tiles.
  renderDecor(ctx, ox, oy) {
    if (this.theme.decor === "space") {
      // Layered space backdrop (#52): stars scroll slowest, planets in
      // the mid layer, satellites/debris closest — classic parallax
      // depth ordering.
      const now = performance.now() / 1000;

      // Stars — farthest layer.
      const spar = 0.15;
      const sx = ox * spar;
      const sy = oy * spar;
      const CELL = 22;
      for (let gy = Math.floor(sy / CELL) - 1; gy <= Math.floor((sy + VIEW_H) / CELL) + 1; gy++) {
        for (let gx = Math.floor(sx / CELL) - 1; gx <= Math.floor((sx + VIEW_W) / CELL) + 1; gx++) {
          const h = hash2(gx, gy);
          if (h < 0.5) continue;
          const px = Math.round(gx * CELL + hash2(gx + 7, gy) * CELL - sx);
          const py = Math.round(gy * CELL + hash2(gx, gy + 7) * CELL - sy);
          const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now * 2 + h * 30));
          ctx.fillStyle = `rgba(255,255,255,${(h > 0.9 ? twinkle : h * 0.7).toFixed(2)})`;
          ctx.fillRect(px, py, h > 0.85 ? 2 : 1, h > 0.85 ? 2 : 1);
        }
      }

      // Planets — mid layer, repeating with varied size/color; roughly
      // every third gets a ring.
      const PLANET_COLORS = ["#6c5ce7", "#c0562e", "#3fa7a3", "#b06ab3", "#8898b0"];
      const ppar = 0.3;
      const pxo = ox * ppar;
      const PSPACE = 340;
      for (let g = Math.floor(pxo / PSPACE) - 1; g <= Math.floor((pxo + VIEW_W) / PSPACE) + 1; g++) {
        const h = hash2(g, 77);
        if (h < 0.25) continue;
        const x = Math.round(g * PSPACE + hash2(g, 3) * 200 - pxo);
        const y = 24 + Math.round(hash2(g, 11) * 70);
        const r = 8 + Math.round(hash2(g, 19) * 16);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = PLANET_COLORS[Math.floor(h * PLANET_COLORS.length)];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // shading crescent
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.arc(x + r * 0.3, y + r * 0.2, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        if (hash2(g, 23) > 0.6) {
          ctx.strokeStyle = "rgba(220,220,240,0.5)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Satellites — near layer, slowly drifting with a blinking light.
      const napar = 0.5;
      const nxo = ox * napar;
      const SATSPACE = 420;
      for (let g = Math.floor(nxo / SATSPACE) - 1; g <= Math.floor((nxo + VIEW_W) / SATSPACE) + 1; g++) {
        if (hash2(g, 91) < 0.45) continue;
        const drift = (now * 3) % SATSPACE;
        const x = Math.round(g * SATSPACE + hash2(g, 5) * 260 + drift - nxo);
        const y = 18 + Math.round(hash2(g, 29) * 55);
        ctx.fillStyle = "#9aa4b8";
        ctx.fillRect(x - 2, y - 2, 4, 4); // body
        ctx.fillStyle = "#5b7fd4";
        ctx.fillRect(x - 8, y - 1, 5, 2); // solar panels
        ctx.fillRect(x + 3, y - 1, 5, 2);
        if (Math.sin(now * 5 + g) > 0.4) {
          ctx.fillStyle = "#ff5d5d";
          ctx.fillRect(x - 1, y - 4, 1, 1); // blinking beacon
        }
      }

      // Floating rock debris — closest layer, slowly tumbling.
      const dxo = ox * napar;
      const dyo = oy * napar;
      const DCELL = 90;
      for (let gy = Math.floor(dyo / DCELL) - 1; gy <= Math.floor((dyo + VIEW_H) / DCELL) + 1; gy++) {
        for (let gx = Math.floor(dxo / DCELL) - 1; gx <= Math.floor((dxo + VIEW_W) / DCELL) + 1; gx++) {
          const h = hash2(gx, gy + 500);
          if (h < 0.7) continue;
          const px = gx * DCELL + hash2(gx + 1, gy) * DCELL - dxo;
          const py = gy * DCELL + hash2(gx, gy + 1) * DCELL - dyo;
          const size = 2 + h * 3;
          ctx.save();
          ctx.translate(Math.round(px), Math.round(py));
          ctx.rotate(now * (0.3 + h) * (h > 0.85 ? 1 : -1));
          ctx.fillStyle = "rgba(150,150,165,0.6)";
          ctx.fillRect(-size / 2, -size / 2, size, size * 0.8);
          ctx.restore();
        }
      }
    } else if (this.theme.decor === "grassland" || this.theme.decor === "forest") {
      this.renderGroundDecor(ctx, ox, oy, this.theme.decor);
    } else if (this.theme.decor === "cave") {
      // Distant volcano silhouettes against the cave gloom (PG-58),
      // on a slow parallax so they read as far background.
      const vpar = 0.25;
      const vsx = ox * vpar;
      const SPACING = 170;
      const t = performance.now() / 1000;
      for (let g = Math.floor(vsx / SPACING) - 1; g <= Math.floor((vsx + VIEW_W) / SPACING) + 1; g++) {
        if (hash2(g, 555) < 0.4) continue;
        const px = Math.round(g * SPACING + hash2(g, 9) * 60 - vsx);
        const base = 152 + Math.round(hash2(g, 13) * 10);
        const w = 34 + Math.round(hash2(g, 21) * 22);
        const h = 26 + Math.round(hash2(g, 27) * 14);
        ctx.fillStyle = "rgba(90, 60, 90, 0.28)";
        ctx.beginPath();
        ctx.moveTo(px - w, base);
        ctx.lineTo(px - 5, base - h);
        ctx.lineTo(px + 5, base - h);
        ctx.lineTo(px + w, base);
        ctx.closePath();
        ctx.fill();
        // pulsing crater glow
        const glow = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.5 + g * 2.1));
        ctx.fillStyle = `rgba(255, 120, 40, ${glow.toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(px, base - h, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faint glowing crystals scattered in the background rock.
      const par = 0.5;
      const sx = ox * par;
      const sy = oy * par;
      const CELL = 40;
      for (let gy = Math.floor(sy / CELL) - 1; gy <= Math.floor((sy + VIEW_H) / CELL) + 1; gy++) {
        for (let gx = Math.floor(sx / CELL) - 1; gx <= Math.floor((sx + VIEW_W) / CELL) + 1; gx++) {
          const h = hash2(gx, gy);
          if (h < 0.72) continue;
          const px = Math.round(gx * CELL + hash2(gx + 3, gy) * CELL - sx);
          const py = Math.round(gy * CELL + hash2(gx, gy + 3) * CELL - sy);
          ctx.fillStyle = h > 0.88 ? "rgba(120,230,180,0.35)" : "rgba(150,120,220,0.28)";
          ctx.beginPath();
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px + 3, py);
          ctx.lineTo(px, py + 5);
          ctx.lineTo(px - 3, py);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Ceiling stalactites (#53): silhouettes hanging from the cave
      // roof on the same background layer (decorative only — the
      // gameplay ones that fall are level entities, legend T).
      const SSTEP = 26;
      const roofY = -oy * par; // layer world-top mapped to the screen
      for (let g = Math.floor(sx / SSTEP) - 1; g <= Math.floor((sx + VIEW_W) / SSTEP) + 1; g++) {
        const h = hash2(g, 321);
        if (h < 0.35) continue;
        const px = Math.round(g * SSTEP + hash2(g, 7) * 14 - sx);
        const len = 6 + Math.round(h * 20);
        const wid = 2 + Math.round(hash2(g, 15) * 3);
        ctx.fillStyle = "rgba(70, 50, 80, 0.5)";
        ctx.beginPath();
        ctx.moveTo(px - wid, roofY);
        ctx.lineTo(px + wid, roofY);
        ctx.lineTo(px, roofY + len);
        ctx.closePath();
        ctx.fill();
      }

      // Ground-anchored cave props: torches, skull piles, stalagmites,
      // bright crystal clusters (#53).
      this.renderGroundDecor(ctx, ox, oy, "cave");
    } else if (this.theme.decor === "ice") {
      const now = performance.now() / 1000;
      
      // Distant mountains
      const mpar = 0.2;
      const mx = ox * mpar;
      const MSTEP = 200;
      for (let g = Math.floor(mx / MSTEP) - 1; g <= Math.floor((mx + VIEW_W) / MSTEP) + 1; g++) {
        if (hash2(g, 101) < 0.3) continue;
        const px = Math.round(g * MSTEP + hash2(g, 13) * 80 - mx);
        const w = 60 + Math.round(hash2(g, 21) * 40);
        const h = 50 + Math.round(hash2(g, 29) * 30);
        const base = VIEW_H - 10;
        ctx.fillStyle = "rgba(160, 190, 210, 0.4)";
        ctx.beginPath();
        ctx.moveTo(px - w, base);
        ctx.lineTo(px, base - h);
        ctx.lineTo(px + w, base);
        ctx.fill();
        // snow cap
        ctx.fillStyle = "rgba(230, 245, 255, 0.5)";
        ctx.beginPath();
        ctx.moveTo(px - w*0.3, base - h*0.7);
        ctx.lineTo(px, base - h);
        ctx.lineTo(px + w*0.3, base - h*0.7);
        ctx.lineTo(px + w*0.1, base - h*0.6);
        ctx.lineTo(px - w*0.1, base - h*0.65);
        ctx.fill();
      }

      // Aurora bands
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 3; i++) {
        const speed = 0.5 + i * 0.2;
        const offset = now * speed + i * 100;
        const y = 30 + i * 25;
        const wave = Math.sin(offset * 0.5) * 15;
        ctx.fillStyle = i === 1 ? "rgba(120, 255, 180, 0.15)" : "rgba(180, 120, 255, 0.12)";
        ctx.beginPath();
        ctx.ellipse(VIEW_W / 2 + Math.cos(offset * 0.3) * 50, y + wave, VIEW_W * 0.8, 20 + i * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // Snowflakes
      const spar = 0.8;
      const sx = ox * spar;
      const sy = oy * spar - now * 30; // drifting down
      const SCELL = 40;
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      for (let gy = Math.floor(sy / SCELL) - 1; gy <= Math.floor((sy + VIEW_H) / SCELL) + 1; gy++) {
        for (let gx = Math.floor(sx / SCELL) - 1; gx <= Math.floor((sx + VIEW_W) / SCELL) + 1; gx++) {
          const h = hash2(gx, gy + 888);
          if (h < 0.4) continue;
          const drift = Math.sin(now * 2 + h * 10) * 10;
          const px = Math.round(gx * SCELL + hash2(gx + 1, gy) * SCELL - sx + drift);
          const py = Math.round(gy * SCELL + hash2(gx, gy + 1) * SCELL - sy);
          ctx.fillRect(px, py, h > 0.8 ? 2 : 1, h > 0.8 ? 2 : 1);
        }
      }

      this.renderGroundDecor(ctx, ox, oy, "ice");
    } else if (this.theme.decor === "factory") {
      const now = performance.now() / 1000;
      
      // City skyline
      const cpar = 0.15;
      const cx = ox * cpar;
      const CSTEP = 40;
      const base = VIEW_H;
      for (let g = Math.floor(cx / CSTEP) - 1; g <= Math.floor((cx + VIEW_W) / CSTEP) + 1; g++) {
        const h = hash2(g, 404);
        const px = Math.round(g * CSTEP + hash2(g, 5) * 10 - cx);
        const w = 20 + Math.floor(h * 30);
        const ht = 40 + Math.floor(hash2(g, 9) * 80);
        ctx.fillStyle = "rgba(20, 15, 30, 0.8)";
        ctx.fillRect(px, base - ht, w, ht);
        
        // Windows
        ctx.fillStyle = "rgba(255, 220, 100, 0.4)";
        for (let wy = base - ht + 10; wy < base - 10; wy += 12) {
          for (let wx = px + 4; wx < px + w - 8; wx += 8) {
            if (hash2(g + wx, wy) > 0.3) ctx.fillRect(wx, wy, 4, 6);
          }
        }
        
        // Antenna/beacon
        if (h > 0.7) {
          ctx.fillStyle = "rgba(20, 15, 30, 0.8)";
          ctx.fillRect(px + w/2 - 1, base - ht - 20, 2, 20);
          if (Math.sin(now * 4 + g) > 0) {
            ctx.fillStyle = "#ff4444";
            ctx.fillRect(px + w/2 - 1, base - ht - 22, 2, 2);
          }
        }
      }

      this.renderGroundDecor(ctx, ox, oy, "factory");
    }
  }

  // Grassland (World 1) / dusk-forest (World 2) background scenery
  // (PG-46). World-anchored decorative props drawn behind the tilemap,
  // only over solid ground, deterministically placed so they don't
  // jitter. Purely visual — no collision.
  renderGroundDecor(ctx, ox, oy, kind) {
    const forest = kind === "forest";
    const groundRow = this.level.rows - 1;
    const groundY = groundRow * TILE;
    const STEP = 34;
    const gx0 = Math.floor(ox / STEP) - 1;
    const gx1 = Math.floor((ox + VIEW_W) / STEP) + 1;

    // Forest vines hang from the top of the view (independent of ground).
    if (forest) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (hash2(gx, 999) < 0.72) continue;
        const sx = Math.round(gx * STEP + hash2(gx, 5) * STEP - ox);
        const len = 22 + Math.floor(hash2(gx, 8) * 40);
        ctx.strokeStyle = "rgba(58,92,58,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.quadraticCurveTo(sx + 4, len * 0.5, sx, len);
        ctx.stroke();
        ctx.fillStyle = "rgba(70,110,70,0.55)";
        ctx.beginPath();
        ctx.ellipse(sx, len, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cave = kind === "cave";
    const ice = kind === "ice";
    const factory = kind === "factory";
    for (let gx = gx0; gx <= gx1; gx++) {
      if (hash2(gx, forest ? 41 : cave ? 63 : ice ? 82 : factory ? 55 : 17) < 0.45) continue; // sparse scatter
      const wx = gx * STEP + hash2(gx, 3) * (STEP - 10);
      if (!solidAt(this.level, Math.floor(wx / TILE), groundRow)) continue;
      const x = Math.round(wx - ox);
      const y = Math.round(groundY - oy);
      const pick = hash2(gx, forest ? 71 : cave ? 83 : ice ? 19 : factory ? 33 : 29);
      if (cave) {
        if (pick < 0.3) this.drawTorch(ctx, x, y);
        else if (pick < 0.55) this.drawSkullPile(ctx, x, y);
        else if (pick < 0.8) this.drawStalagmite(ctx, x, y, gx);
        else this.drawCrystalCluster(ctx, x, y, gx);
      } else if (forest) {
        if (pick < 0.42) this.drawTallTree(ctx, x, y);
        else if (pick < 0.68) this.drawMushroom(ctx, x, y);
        else this.drawLog(ctx, x, y);
      } else if (ice) {
        if (pick < 0.4) this.drawPineTree(ctx, x, y);
        else if (pick < 0.7) this.drawSnowman(ctx, x, y);
        else this.drawIceCrystals(ctx, x, y, gx);
      } else if (factory) {
        if (pick < 0.3) this.drawMachineBox(ctx, x, y, gx);
        else if (pick < 0.6) this.drawPipes(ctx, x, y, gx);
        else this.drawGirder(ctx, x, y);
      } else {
        if (pick < 0.4) this.drawTree(ctx, x, y);
        else if (pick < 0.62) this.drawBush(ctx, x, y);
        else if (pick < 0.82) this.drawFlowers(ctx, x, y);
        else this.drawFence(ctx, x, y);
      }
    }
  }

  drawTree(ctx, x, yb) {
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(x - 2, yb - 14, 4, 14);
    ctx.fillStyle = "#4a9e3a";
    for (const [dx, dy, r] of [[0, -20, 9], [-6, -15, 7], [6, -15, 7]]) {
      ctx.beginPath();
      ctx.arc(x + dx, yb + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#57b046";
    ctx.beginPath();
    ctx.arc(x - 3, yb - 22, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBush(ctx, x, yb) {
    ctx.fillStyle = "#5aa845";
    for (const [dx, r] of [[-5, 5], [0, 7], [5, 5]]) {
      ctx.beginPath();
      ctx.arc(x + dx, yb - 4, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFlowers(ctx, x, yb) {
    const cols = ["#ff5d73", "#ffd93b", "#ff9ff3"];
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * 5;
      ctx.strokeStyle = "#3f8f38";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, yb);
      ctx.lineTo(fx, yb - 8);
      ctx.stroke();
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(fx, yb - 9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFence(ctx, x, yb) {
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(x - 7, yb - 10, 2, 10);
    ctx.fillRect(x + 5, yb - 10, 2, 10);
    ctx.fillRect(x - 8, yb - 8, 15, 2);
    ctx.fillRect(x - 8, yb - 4, 15, 2);
  }

  drawTallTree(ctx, x, yb) {
    ctx.fillStyle = "#3a2b1f";
    ctx.fillRect(x - 2, yb - 22, 3, 22);
    ctx.fillStyle = "#243a28";
    ctx.beginPath();
    ctx.moveTo(x - 8, yb - 20);
    ctx.lineTo(x + 8, yb - 20);
    ctx.lineTo(x, yb - 36);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 7, yb - 27);
    ctx.lineTo(x + 7, yb - 27);
    ctx.lineTo(x, yb - 41);
    ctx.closePath();
    ctx.fill();
  }

  drawMushroom(ctx, x, yb) {
    ctx.fillStyle = "#e6dcc8";
    ctx.fillRect(x - 1, yb - 6, 3, 6);
    ctx.fillStyle = "#b0455a";
    ctx.beginPath();
    ctx.ellipse(x, yb - 6, 5, 3, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(x - 2, yb - 7, 1, 1);
    ctx.fillRect(x + 1, yb - 8, 1, 1);
  }

  // Wall torch with a subtle flame flicker (#53).
  drawTorch(ctx, x, yb) {
    const t = performance.now() / 1000;
    ctx.fillStyle = "#5a4632";
    ctx.fillRect(x - 1, yb - 12, 2, 12); // pole
    ctx.fillStyle = "#3a2e20";
    ctx.fillRect(x - 2, yb - 13, 4, 2); // bracket
    const f = 0.7 + 0.3 * Math.sin(t * 11 + x * 0.7); // flicker
    ctx.fillStyle = `rgba(255, 160, 40, ${(0.45 * f).toFixed(2)})`; // glow halo
    ctx.beginPath();
    ctx.arc(x, yb - 16, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9c2a";
    ctx.beginPath();
    ctx.ellipse(x, yb - 16, 2, 3 * f + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(x - 1, yb - 17, 1, 2);
  }

  // Small pile of skulls (#53).
  drawSkullPile(ctx, x, yb) {
    const skull = (sx, sy, r) => {
      ctx.fillStyle = "#ddd5c4";
      ctx.beginPath();
      ctx.arc(sx, sy - r * 0.3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - r * 0.6, sy - r * 0.2, r * 1.2, r * 0.7);
      ctx.fillStyle = "#241c28";
      ctx.fillRect(sx - r * 0.55, sy - r * 0.5, r * 0.4, r * 0.45); // eyes
      ctx.fillRect(sx + r * 0.15, sy - r * 0.5, r * 0.4, r * 0.45);
    };
    skull(x - 4, yb - 2, 3);
    skull(x + 4, yb - 2, 3);
    skull(x, yb - 7, 3.5); // one on top
  }

  // Floor stalagmite — the upward twin of the ceiling silhouettes (#53).
  drawStalagmite(ctx, x, yb, seed) {
    const h = 8 + Math.round(hash2(seed, 6) * 10);
    ctx.fillStyle = "#4c3a58";
    ctx.beginPath();
    ctx.moveTo(x - 5, yb);
    ctx.lineTo(x, yb - h);
    ctx.lineTo(x + 5, yb);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(x - 2, yb);
    ctx.lineTo(x, yb - h + 2);
    ctx.lineTo(x, yb);
    ctx.closePath();
    ctx.fill();
  }

  // Bright glowing crystal cluster on the cave floor (#53).
  drawCrystalCluster(ctx, x, yb, seed) {
    const t = performance.now() / 1000;
    const green = hash2(seed, 44) > 0.5;
    const pulse = 0.7 + 0.3 * Math.sin(t * 2 + seed);
    const shard = (sx, h, lean) => {
      ctx.beginPath();
      ctx.moveTo(sx - 3, yb);
      ctx.lineTo(sx + lean, yb - h);
      ctx.lineTo(sx + 3, yb);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = green
      ? `rgba(110, 235, 175, ${(0.75 * pulse).toFixed(2)})`
      : `rgba(170, 130, 240, ${(0.75 * pulse).toFixed(2)})`;
    shard(x - 4, 8, -2);
    shard(x + 4, 7, 2);
    ctx.fillStyle = green
      ? `rgba(180, 255, 220, ${pulse.toFixed(2)})`
      : `rgba(215, 190, 255, ${pulse.toFixed(2)})`;
    shard(x, 12, 0);
  }

  drawLog(ctx, x, yb) {
    ctx.fillStyle = "#5b3a24";
    ctx.beginPath();
    ctx.ellipse(x, yb - 3, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f2817";
    ctx.beginPath();
    ctx.ellipse(x - 9, yb - 3, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a4e30";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6, yb - 4);
    ctx.lineTo(x + 8, yb - 4);
    ctx.stroke();
  }

  // Animated lava tiles (PG-40).
  renderLava(ctx, ox, oy) {
    if (!this.lava.length) return;
    const t = performance.now() / 1000;
    for (const l of this.lava) {
      const x = Math.round(l.x - TILE / 2 - ox);
      const y = Math.round(l.y - TILE / 2 - oy);
      ctx.fillStyle = "#7a1500";
      ctx.fillRect(x, y, TILE, TILE);
      const g = ctx.createLinearGradient(0, y, 0, y + TILE);
      g.addColorStop(0, "#ffb02f");
      g.addColorStop(0.45, "#ff5a00");
      g.addColorStop(1, "#a81a00");
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 2, TILE, TILE - 2);
      const b = 0.5 + 0.5 * Math.sin(t * 3 + l.x * 0.5);
      ctx.fillStyle = `rgba(255,235,140,${(0.35 + 0.4 * b).toFixed(2)})`;
      ctx.fillRect(x + 2 + Math.round(b * 8), y + 3, 2, 2);
      ctx.fillRect(x + 9 - Math.round(b * 5), y + 5, 2, 2);
    }
  }

  // Crack/shake overlay marking crumbling platforms (PG-42). The solid
  // tile itself is drawn by renderTiles while present.
  renderCrumbleFx(ctx, ox, oy) {
    for (const c of this.crumbles) {
      if (c.state === "gone") continue;
      let x = c.tx * TILE - ox;
      const y = c.ty * TILE - oy;
      if (c.state === "shaking") x += (Math.random() * 2 - 1) * 1.5;
      x = Math.round(x);
      const yy = Math.round(y);
      ctx.fillStyle = "rgba(120,80,40,0.35)";
      ctx.fillRect(x, yy, TILE, TILE);
      ctx.strokeStyle = "rgba(20,10,0,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, yy);
      ctx.lineTo(x + 7, yy + 8);
      ctx.lineTo(x + 3, yy + TILE);
      ctx.moveTo(x + 11, yy);
      ctx.lineTo(x + 9, yy + 9);
      ctx.lineTo(x + 13, yy + TILE);
      ctx.stroke();
    }
  }

  drawStalactite(ctx, s, ox, oy) {
    const x = Math.round(s.x - ox);
    const y = Math.round(s.y - oy);
    ctx.fillStyle = "#6b5a7a";
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 7);
    ctx.lineTo(x + 5, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x - 3, y - 6, 2, 4);
  }

  drawMeteor(ctx, m, ox, oy) {
    const x = Math.round(m.x - ox);
    const y = Math.round(m.y - oy);
    ctx.fillStyle = "rgba(255,160,40,0.35)";
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffcf5a";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6a00";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Erupting volcano mound (PG-58). The crater glow charges up as the
  // next eruption approaches, telegraphing it to the player.
  drawVolcano(ctx, v, ox, oy) {
    const x = Math.round(v.x - ox);
    const yb = Math.round(v.y + 8 - oy); // mound base sits on the tile bottom
    // cone
    ctx.fillStyle = "#3a2430";
    ctx.beginPath();
    ctx.moveTo(x - 13, yb);
    ctx.lineTo(x - 4, yb - 16);
    ctx.lineTo(x + 4, yb - 16);
    ctx.lineTo(x + 13, yb);
    ctx.closePath();
    ctx.fill();
    // ridge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 10, yb - 2);
    ctx.lineTo(x - 3, yb - 15);
    ctx.stroke();
    // crater glow: brightens as the eruption charges
    const charge = 1 - Math.max(0, v.timer) / (v.interval || 1);
    const flicker = 0.85 + 0.15 * Math.sin(v.animT * 9);
    ctx.fillStyle = `rgba(255, ${Math.round(120 + 60 * charge)}, 40, ${(
      (0.35 + 0.55 * charge) * flicker
    ).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(x, yb - 16, 4.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // embers rising when nearly ready
    if (charge > 0.7) {
      ctx.fillStyle = "rgba(255, 200, 90, 0.8)";
      const e1 = (v.animT * 22) % 10;
      ctx.fillRect(x - 2, yb - 18 - e1, 1, 1);
      ctx.fillRect(x + 2, yb - 16 - ((v.animT * 30 + 4) % 8), 1, 1);
    }
  }

  drawLavaRock(ctx, r, ox, oy) {
    const x = Math.round(r.x - ox);
    const y = Math.round(r.y - oy);
    ctx.fillStyle = "rgba(255, 140, 30, 0.35)"; // glow halo
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff7a1a";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd95a";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  drawBat(ctx, e, ox, oy) {
    const x = Math.round(e.x - ox);
    const y = Math.round(e.y - oy);
    const wingUp = batFrame(e) === 0;
    const wy = wingUp ? -4 : 2;
    ctx.fillStyle = "#2b2333";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + wy);
    ctx.lineTo(x - 3, y + 3);
    ctx.lineTo(x + 3, y + 3);
    ctx.lineTo(x + 9, y + wy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3a2f47";
    ctx.beginPath();
    ctx.arc(x, y + 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4d4d";
    ctx.fillRect(x - 2, y, 1, 1);
    ctx.fillRect(x + 1, y, 1, 1);
  }

  drawAlien(ctx, e, ox, oy) {
    const x = Math.round(e.x - ox);
    const y = Math.round(e.y - oy);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, e.scaleY);
    ctx.fillStyle = "#4caf50";
    ctx.beginPath();
    ctx.arc(0, 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#66d17a";
    ctx.beginPath();
    ctx.arc(0, -3, 5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(0, -3, 2.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-1, -5, 1, 1);
    ctx.restore();
  }

  // Draws one 16x16 frame from a horizontal sheet, centered at (x, y).
  drawSprite(ctx, name, frame, x, y) {
    ctx.drawImage(
      this.images[name],
      frame * 16,
      0,
      16,
      16,
      Math.round(x - 8),
      Math.round(y - 8),
      16,
      16,
    );
  }

  // Centered frame draw with optional flip and squash scaling, like
  // an AnimatedSprite2D with flip_h / scale.
  drawFrame(
    ctx,
    sheet,
    frame,
    x,
    y,
    { flip = false, scaleX = 1, scaleY = 1 } = {},
  ) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(flip ? -scaleX : scaleX, scaleY);
    ctx.drawImage(sheet, frame * 16, 0, 16, 16, -8, -8, 16, 16);
    ctx.restore();
  }

  // Theme-based player accessories drawn over the avatar sprite:
  // an astronaut helmet in Space (World 4) and skis in Frozen Peaks
  // (World 5). (cx, cy) is the sprite centre in screen pixels; the
  // 16x16 avatar spans cx-8..cx+8 with feet near cy+8.
  drawPlayerCostume(ctx, cx, cy, facing) {
    const decor = this.theme?.decor;
    if (decor === "space") this.drawSpaceHelmet(ctx, cx, cy);
    else if (decor === "ice") this.drawSkis(ctx, cx, cy, facing);
    else if (decor === "grassland") this.drawStrawHat(ctx, cx, cy);
    else if (decor === "forest") this.drawLantern(ctx, cx, cy, facing);
    else if (decor === "cave") this.drawMinersHeadlamp(ctx, cx, cy, facing);
    else if (decor === "factory") this.drawCyberVisor(ctx, cx, cy, facing);
  }

  drawSpaceHelmet(ctx, cx, cy) {
    const hy = cy - 4; // head sits in the top half of the sprite
    // Glass dome — translucent so the face still reads through it.
    ctx.beginPath();
    ctx.arc(cx, hy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(150, 210, 255, 0.22)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(235, 248, 255, 0.92)";
    ctx.stroke();
    // Neck ring / collar.
    ctx.fillStyle = "#e2e9f0";
    ctx.fillRect(cx - 6, hy + 5, 12, 2);
    // Highlight glint.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx - 3, hy - 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStrawHat(ctx, cx, cy) {
    const hy = cy - 6;
    ctx.fillStyle = "#e6c229"; // straw color
    
    // Brim
    ctx.beginPath();
    ctx.ellipse(cx, hy + 2, 8, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Crown
    ctx.beginPath();
    ctx.arc(cx, hy + 1, 4.5, Math.PI, 0);
    ctx.fill();

    // Hat band
    ctx.strokeStyle = "#c1121f"; // red band
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 4.5, hy + 1);
    ctx.lineTo(cx + 4.5, hy + 1);
    ctx.stroke();
  }

  drawLantern(ctx, cx, cy, facing) {
    // Held slightly in front
    const lx = cx + facing * 6;
    const ly = cy + 2;

    // Glow aura
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 24);
    grad.addColorStop(0, "rgba(255, 180, 50, 0.4)");
    grad.addColorStop(1, "rgba(255, 180, 50, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, 24, 0, Math.PI * 2);
    ctx.fill();

    // Lantern body
    ctx.fillStyle = "#4a4e69"; // dark metal
    ctx.fillRect(lx - 2, ly - 3, 4, 1); // top
    ctx.fillRect(lx - 2, ly + 3, 4, 1); // bottom
    ctx.fillStyle = "#f4a261"; // glass
    ctx.fillRect(lx - 1.5, ly - 2, 3, 5); // middle

    // Handle
    ctx.strokeStyle = "#4a4e69";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 2, ly - 3);
    ctx.lineTo(lx, ly - 5);
    ctx.lineTo(lx + 2, ly - 3);
    ctx.stroke();

    // Player arm holding it
    ctx.strokeStyle = "#fff"; // Simple arm representation
    ctx.beginPath();
    ctx.moveTo(cx + facing * 2, cy + 1);
    ctx.lineTo(lx, ly - 5); // Connect to handle
    ctx.stroke();
  }

  drawMinersHeadlamp(ctx, cx, cy, facing) {
    const hy = cy - 5;
    const strapXOffset = facing * 1;
    
    // Strap
    ctx.fillStyle = "#2b2d42";
    ctx.fillRect(cx - 5 + strapXOffset, hy - 1, 10, 2.5);

    // Light fixture
    const fx = cx + facing * 5;
    ctx.fillStyle = "#8d99ae"; // metal fixture
    ctx.beginPath();
    ctx.arc(fx, hy + 0.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Bright yellow bulb
    ctx.fillStyle = "#ffee32";
    ctx.beginPath();
    ctx.arc(fx + facing * 0.5, hy + 0.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Cone of light
    ctx.fillStyle = "rgba(255, 238, 50, 0.15)";
    ctx.beginPath();
    ctx.moveTo(fx + facing * 1, hy + 0.5);
    ctx.lineTo(fx + facing * 40, hy - 15);
    ctx.lineTo(fx + facing * 40, hy + 20);
    ctx.fill();
  }

  drawCyberVisor(ctx, cx, cy, facing) {
    const hy = cy - 1; // Eye level
    
    ctx.save();
    
    // Create neon glow effect
    ctx.shadowColor = "#f01c8b";
    ctx.shadowBlur = 6;
    ctx.lineCap = "round";
    
    // Visor shape
    ctx.strokeStyle = "#00f0ff"; // Cyan center
    ctx.lineWidth = 2.5;
    
    ctx.beginPath();
    // Wrap around face slightly based on facing
    const startX = cx - facing * 2;
    const endX = cx + facing * 6;
    
    ctx.moveTo(startX, hy - 1);
    // Slight curve down and back up
    ctx.quadraticCurveTo(cx + facing * 2, hy + 1, endX, hy - 1);
    ctx.stroke();
    
    // Inner white core for extreme brightness
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.restore();
  }

  drawSkis(ctx, cx, cy, facing) {
    const y = cy + 8; // ground line under the feet
    const dir = facing < 0 ? -1 : 1;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Two parallel skis, slightly staggered for a 3/4 read, each with
    // an upturned tip pointing the way the player faces.
    for (const off of [-3, 1]) {
      const bx = cx + off;
      ctx.strokeStyle = "#d0392b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - dir * 6, y);
      ctx.lineTo(bx + dir * 7, y);
      ctx.lineTo(bx + dir * 9, y - 2.5);
      ctx.stroke();
      // Binding nub where the boot meets the ski.
      ctx.fillStyle = "#3a3f45";
      ctx.fillRect(bx - 1, y - 2, 2, 2);
    }
    ctx.restore();
  }

  // --- World 5 & 6 Helpers ---

  renderFreezingWater(ctx, ox, oy) {
    if (!this.freezingWater.length) return;
    const t = performance.now() / 1000;
    for (const w of this.freezingWater) {
      const x = Math.round(w.x - TILE / 2 - ox);
      const y = Math.round(w.y - TILE / 2 - oy);
      ctx.fillStyle = "#1b4d8a";
      ctx.fillRect(x, y, TILE, TILE);
      const g = ctx.createLinearGradient(0, y, 0, y + TILE);
      g.addColorStop(0, "#8ac4ff");
      g.addColorStop(0.45, "#469df5");
      g.addColorStop(1, "#1858a8");
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 2, TILE, TILE - 2);
      // chunks of floating ice instead of embers
      const drift = Math.sin(t * 1.5 + w.x * 0.5);
      ctx.fillStyle = "rgba(220, 240, 255, 0.8)";
      ctx.fillRect(x + 4 + Math.round(drift * 3), y + 3, 4, 2);
      ctx.fillRect(x + 10 - Math.round(drift * 2), y + 7, 3, 2);
    }
  }

  renderLasers(ctx, ox, oy) {
    if (!this.lasers.length) return;
    const now = performance.now() / 1000;
    for (const l of this.lasers) {
      const x = Math.round(l.x - ox);
      const y = Math.round(l.y - oy);
      
      // Emitter
      ctx.fillStyle = "#333";
      ctx.fillRect(x - 5, y, 10, 6);
      ctx.fillStyle = "#111";
      ctx.fillRect(x - 3, y + 6, 6, 4);

      if (l.state === "cooldown") continue;
      
      if (l.state === "charging") {
        const pulse = 0.5 + 0.5 * Math.sin(now * 30);
        ctx.fillStyle = `rgba(255, 50, 50, ${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = `rgba(255, 50, 50, ${pulse * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 10);
        ctx.lineTo(x, y - 160);
        ctx.stroke();
      } else if (l.state === "active") {
        const pulse = 0.8 + 0.2 * Math.sin(now * 50);
        // Outer glow
        ctx.strokeStyle = `rgba(255, 100, 100, ${pulse * 0.5})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, y + 10);
        ctx.lineTo(x, y - 160);
        ctx.stroke();
        // Inner core
        ctx.strokeStyle = `rgba(255, 200, 200, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = `rgba(255, 200, 200, ${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y + 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  renderConveyors(ctx, ox, oy) {
    if (!this.conveyors.length) return;
    const t = (performance.now() / 1000) * 2;
    for (const c of this.conveyors) {
      const x = Math.round(c.x - TILE / 2 - ox);
      const y = Math.round(c.y - TILE / 2 - oy);
      ctx.fillStyle = "#3a3a45";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#222";
      ctx.fillRect(x, y + 2, TILE, TILE - 4);
      
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      const offset = (t * 10 * c.dir) % 8;
      for (let i = -8; i <= TILE; i += 8) {
        const ax = x + i + (offset > 0 ? offset : 8 + offset);
        if (ax > x + 2 && ax < x + TILE - 2) {
          ctx.beginPath();
          if (c.dir > 0) {
            ctx.moveTo(ax, y + 4);
            ctx.lineTo(ax + 3, y + TILE/2);
            ctx.lineTo(ax, y + TILE - 4);
          } else {
            ctx.moveTo(ax + 3, y + 4);
            ctx.lineTo(ax, y + TILE/2);
            ctx.lineTo(ax + 3, y + TILE - 4);
          }
          ctx.stroke();
        }
      }
    }
  }

  drawYeti(ctx, e, ox, oy) {
    const x = Math.round(e.x - ox);
    const y = Math.round(e.y - oy);
    const squish = e.scaleY;
    const isStep = Math.sin(e.animT * 12) > 0;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(e.dir < 0 ? 1 : -1, squish);
    
    // Body (bulky fur)
    ctx.fillStyle = "#e0e6ed";
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(7, -8);
    ctx.lineTo(9, 3);
    ctx.lineTo(-9, 3);
    ctx.closePath();
    ctx.fill();
    
    // Ears/horns
    ctx.fillStyle = "#b0bac5";
    ctx.fillRect(-8, -10, 2, 4);
    ctx.fillRect(6, -10, 2, 4);
    
    // Face plate
    ctx.fillStyle = "#7b8998";
    ctx.fillRect(-4, -4, 8, 5);
    
    // Eyes
    ctx.fillStyle = "#ff3333";
    ctx.fillRect(-2, -2, 2, 1);
    ctx.fillRect(2, -2, 2, 1);
    
    // Legs
    ctx.fillStyle = "#b0bac5";
    if (e.onFloor) {
      ctx.fillRect(-6, 3, 4, isStep ? 3 : 5);
      ctx.fillRect(2, 3, 4, isStep ? 5 : 3);
    } else {
      ctx.fillRect(-6, 3, 4, 3);
      ctx.fillRect(2, 3, 4, 3);
    }
    ctx.restore();
  }

  drawDrone(ctx, e, ox, oy) {
    const x = Math.round(e.x - ox);
    const y = Math.round(e.y - oy);
    const squish = e.scaleY;
    const now = performance.now() / 1000;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(e.dir < 0 ? 1 : -1, squish);
    
    // Rotor blades
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    const rT = now * 20;
    ctx.beginPath();
    ctx.moveTo(-6 + Math.cos(rT) * 4, -5);
    ctx.lineTo(-6 + Math.cos(rT + Math.PI) * 4, -5);
    ctx.moveTo(6 + Math.cos(rT) * 4, -5);
    ctx.lineTo(6 + Math.cos(rT + Math.PI) * 4, -5);
    ctx.stroke();
    
    // Chassis
    ctx.fillStyle = "#333b44";
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(7, -3);
    ctx.lineTo(5, 3);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();
    
    // Eye/Sensor
    ctx.fillStyle = "#111";
    ctx.fillRect(-4, -1, 4, 3);
    if (Math.sin(now * 10) > 0) {
      ctx.fillStyle = "#ff3333";
      ctx.fillRect(-3, 0, 2, 1);
    }
    
    ctx.restore();
  }

  drawPineTree(ctx, x, yb) {
    ctx.fillStyle = "#2d4432";
    ctx.fillRect(x - 2, yb - 10, 4, 10);
    ctx.fillStyle = "#436a4a";
    ctx.beginPath();
    ctx.moveTo(x - 10, yb - 8);
    ctx.lineTo(x + 10, yb - 8);
    ctx.lineTo(x, yb - 20);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 8, yb - 16);
    ctx.lineTo(x + 8, yb - 16);
    ctx.lineTo(x, yb - 28);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6, yb - 24);
    ctx.lineTo(x + 6, yb - 24);
    ctx.lineTo(x, yb - 36);
    ctx.fill();
    
    // Snow highlights
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(x + 2, yb - 24);
    ctx.lineTo(x + 6, yb - 24);
    ctx.lineTo(x, yb - 32);
    ctx.fill();
  }

  drawSnowman(ctx, x, yb) {
    ctx.fillStyle = "#e0ecf5";
    ctx.beginPath();
    ctx.arc(x, yb - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, yb - 15, 4, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 2, yb - 16, 1, 1);
    ctx.fillRect(x + 1, yb - 16, 1, 1);
    // Carrot
    ctx.fillStyle = "#f58a36";
    ctx.beginPath();
    ctx.moveTo(x, yb - 14);
    ctx.lineTo(x - 4, yb - 13);
    ctx.lineTo(x, yb - 12);
    ctx.fill();
    // Arms
    ctx.strokeStyle = "#5a4328";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6, yb - 7);
    ctx.lineTo(x - 12, yb - 9);
    ctx.moveTo(x + 6, yb - 7);
    ctx.lineTo(x + 12, yb - 9);
    ctx.stroke();
  }

  drawIceCrystals(ctx, x, yb, seed) {
    const h1 = 6 + Math.round(hash2(seed, 2) * 8);
    const h2 = 4 + Math.round(hash2(seed, 3) * 6);
    ctx.fillStyle = "rgba(160, 220, 255, 0.6)";
    ctx.beginPath();
    ctx.moveTo(x - 4, yb);
    ctx.lineTo(x - 2, yb - h2);
    ctx.lineTo(x, yb);
    ctx.fill();
    ctx.fillStyle = "rgba(190, 240, 255, 0.8)";
    ctx.beginPath();
    ctx.moveTo(x - 1, yb);
    ctx.lineTo(x + 2, yb - h1);
    ctx.lineTo(x + 5, yb);
    ctx.fill();
  }

  drawMachineBox(ctx, x, yb, seed) {
    const w = 16 + Math.round(hash2(seed, 1) * 8);
    const h = 12 + Math.round(hash2(seed, 2) * 12);
    ctx.fillStyle = "#333b44";
    ctx.fillRect(x - w/2, yb - h, w, h);
    ctx.fillStyle = "#4a5360";
    ctx.fillRect(x - w/2 + 2, yb - h + 2, w - 4, h - 4);
    
    // Warning stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - w/2, yb - h, w, 4);
    ctx.clip();
    ctx.fillStyle = "#e5b530";
    ctx.fillRect(x - w/2, yb - h, w, 4);
    ctx.fillStyle = "#222";
    for (let i = x - w/2 - 4; i < x + w/2; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, yb - h);
      ctx.lineTo(i + 4, yb - h);
      ctx.lineTo(i - 2, yb - h + 4);
      ctx.lineTo(i - 6, yb - h + 4);
      ctx.fill();
    }
    ctx.restore();
    
    // Blinking light
    if (hash2(seed, 3) > 0.5) {
      const now = performance.now() / 1000;
      const on = Math.sin(now * 4 + seed) > 0;
      ctx.fillStyle = on ? "#ff4444" : "#441111";
      ctx.fillRect(x - 2, yb - Math.round(h/2) - 2, 4, 4);
    }
  }

  drawPipes(ctx, x, yb, seed) {
    const h = 20 + Math.round(hash2(seed, 1) * 20);
    ctx.fillStyle = "#556372";
    ctx.fillRect(x - 4, yb - h, 8, h);
    ctx.fillStyle = "#3e4854";
    ctx.fillRect(x - 4, yb - h, 2, h);
    
    // Joints
    ctx.fillStyle = "#222a33";
    ctx.fillRect(x - 5, yb - h/2 - 2, 10, 4);
    ctx.fillRect(x - 5, yb - h + 2, 10, 4);
  }

  drawGirder(ctx, x, yb) {
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 8, yb - 30, 16, 30);
    ctx.fillStyle = "#444";
    ctx.fillRect(x - 6, yb - 28, 12, 28);
    // Cross beams
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, yb - 28);
    ctx.lineTo(x + 6, yb - 14);
    ctx.moveTo(x + 6, yb - 28);
    ctx.lineTo(x - 6, yb - 14);
    
    ctx.moveTo(x - 6, yb - 14);
    ctx.lineTo(x + 6, yb);
    ctx.moveTo(x + 6, yb - 14);
    ctx.lineTo(x - 6, yb);
    ctx.stroke();
  }
}
