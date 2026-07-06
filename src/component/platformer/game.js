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
  updateCoin,
  updateStalactite,
  updateMeteor,
  updateVolcano,
  updateLavaRock,
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
function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
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
    );
  }

  async start() {
    this.images = await loadImages();
    this.input.attach(window);
    this._unsubs.push(this.state.on("level", (index) => this.loadLevel(index)));
    let last = performance.now();
    let acc = 0;
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      acc += Math.min((now - last) / 1000, MAX_FRAME);
      last = now;

      // ESC toggles the pause menu (PG-29).
      if (this.input.justPressed("pause")) {
        if (this.state.screen === "playing") this.state.pause();
        else if (this.state.screen === "paused") this.state.resume();
      }

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
    for (const s of this.level.spawns) {
      if (s.type === "coin") this.coins.push(createCoin(s.x, s.y));
      else if (s.type === "enemy") this.enemies.push(createEnemy(s.x, s.y));
      else if (s.type === "alien") this.enemies.push(createAlien(s.x, s.y));
      else if (s.type === "bat") this.enemies.push(createBat(s.x, s.y));
      else if (s.type === "spikes") this.spikes.push(createSpikes(s.x, s.y));
      else if (s.type === "lava") this.lava.push(createLava(s.x, s.y));
      else if (s.type === "stalactite")
        this.stalactites.push(createStalactite(s.x, s.y));
      else if (s.type === "volcano") this.volcanoes.push(createVolcano(s.x, s.y));
      else if (s.type === "crumble")
        this.crumbles.push({ tx: s.tx, ty: s.ty, x: s.x, y: s.y, state: "idle", t: 0 });
      else if (s.type === "checkpoint")
        this.checkpoints.push(createCheckpoint(s.x, s.y));
      else if (s.type === "flag") this.flags.push(createFlag(s.x, s.y));
    }
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
    this.state.setCheckpoint(spawn);
    this.cam = { x: 0, y: 0 };
    this.snapCamera();
  }

  step(dt) {
    const p = this.player;
    updatePlayer(p, this.input, this.level, dt, this.sfx);
    for (const e of this.enemies) {
      if (e.gone) continue;
      if (e.kind === "bat") updateBat(e, this.level, dt);
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
    if (this.meteorsOn) this.updateMeteorSpawner(dt);

    processInteractions(
      {
        player: p,
        level: this.level,
        coins: this.coins,
        enemies: this.enemies,
        spikes: this.spikes,
        lava: this.lava,
        stalactites: this.stalactites,
        meteors: this.meteors,
        lavaRocks: this.lavaRocks,
        checkpoints: this.checkpoints,
        flags: this.flags,
      },
      {
        onCoin: () => {
          this.state.addCoin();
          this.sfx.play("coin");
        },
        onStomp: () => this.sfx.play("stomp"),
        onCheckpoint: (k) => this.state.setCheckpoint({ x: k.x, y: k.y }),
        onFlag: () => {
          // Jingle plays on goal contact, before the UI transition (PG-27).
          this.sfx.play("level_complete");
          this.input.clear(); // Clear held input to prevent momentum on next level
          this.state.levelComplete();
        },
        onPlayerDeath: () => this.onPlayerDeath(),
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

  onPlayerDeath() {
    if (!killPlayer(this.player)) return;
    this.input.clear(); // Clear held input to prevent momentum during respawn
    if (this.state.loseLife()) {
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
      ctx.fillStyle = css([0.43, 0.72, 0.91]);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }

    ctx.fillStyle = css(this.theme.sky);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const ox = this.cam.x - VIEW_W / 2; // world coords of the view origin
    const oy = this.cam.y - VIEW_H / 2;

    // Themed backdrop: cave glow or space starfield (PG-40/PG-43).
    if (this.theme.decor) this.renderDecor(ctx, ox, oy);
    // Space skips clouds; other worlds keep the parallax layers.
    if (this.theme.clouds !== false) this.renderClouds(ctx, ox, oy);
    this.renderTiles(ctx, ox, oy);
    this.renderLava(ctx, ox, oy);
    this.renderCrumbleFx(ctx, ox, oy);

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
    ctx.globalAlpha = 1;
    // Own name tag in a race, so it's easy to tell who's who.
    if (this.network && this.state.multiplayer && this.network.selfName) {
      this.drawNameLabel(this.network.selfName, p.x - ox, p.y - oy);
    }
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
    const tiles = this.tinted("tiles", this.theme.tileTint);
    const tx0 = Math.floor(ox / TILE);
    const tx1 = Math.floor((ox + VIEW_W) / TILE);
    const ty0 = Math.floor(oy / TILE);
    const ty1 = Math.floor((oy + VIEW_H) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = this.level.tiles.get(`${tx},${ty}`);
        if (id === undefined) continue;
        ctx.drawImage(
          tiles,
          id * TILE,
          0,
          TILE,
          TILE,
          Math.round(tx * TILE - ox),
          Math.round(ty * TILE - oy),
          TILE,
          TILE,
        );
      }
    }
  }

  // Themed parallax backdrop drawn behind the clouds/tiles.
  renderDecor(ctx, ox, oy) {
    if (this.theme.decor === "space") {
      // Starfield (parallax) + a couple of distant planets.
      const par = 0.35;
      const sx = ox * par;
      const sy = oy * par;
      const CELL = 22;
      const now = performance.now() / 1000;
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
      const planets = [
        { x: 60, y: 40, r: 14, c: "#6c5ce7" },
        { x: 250, y: 70, r: 20, c: "#c0562e" },
      ];
      for (const pl of planets) {
        const x = pl.x - ox * 0.2;
        const y = pl.y - oy * 0.2;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = pl.c;
        ctx.beginPath();
        ctx.arc(x, y, pl.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
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

    for (let gx = gx0; gx <= gx1; gx++) {
      if (hash2(gx, forest ? 41 : 17) < 0.45) continue; // sparse scatter
      const wx = gx * STEP + hash2(gx, 3) * (STEP - 10);
      if (!solidAt(this.level, Math.floor(wx / TILE), groundRow)) continue;
      const x = Math.round(wx - ox);
      const y = Math.round(groundY - oy);
      const pick = hash2(gx, forest ? 71 : 29);
      if (forest) {
        if (pick < 0.42) this.drawTallTree(ctx, x, y);
        else if (pick < 0.68) this.drawMushroom(ctx, x, y);
        else this.drawLog(ctx, x, y);
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
}
