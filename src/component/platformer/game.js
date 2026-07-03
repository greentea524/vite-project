// Canvas engine: fixed-timestep loop, camera, and rendering. Godot
// equivalents: the level scene (level.gd), the ParallaxBackground
// clouds, per-world tinting via modulate, and the Camera2D with
// smoothing and limits. The game renders a 320x180 world view — the
// Godot project's 640x360 viewport at 2x camera zoom.

import { TILE, buildLevel } from "./physics.js";
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
import { createEnemy, updateEnemy, enemyFrame } from "./enemy.js";
import {
  createCoin,
  createSpikes,
  createCheckpoint,
  createFlag,
  updateCoin,
  coinFrame,
  processInteractions,
} from "./entities.js";
import { Input } from "./input.js";
import { Sfx } from "./sfx.js";
import { loadImages } from "./assets.js";
import { createGhost, pushSnapshot, sampleGhost } from "./ghosts.js";

export const VIEW_W = 320;
export const VIEW_H = 180;
const DT = 1 / 60;
const MAX_FRAME = 0.25;
const CAM_SMOOTHING = 5; // Camera2D position_smoothing_speed default
const GAME_OVER_DELAY = 1.0;

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

// Frame for a ghost given only its anim name (we don't track a remote
// player's animation clock, so drive it from wall time).
function animFrameFor(anim) {
  const frames = SHEET_FRAMES[anim] ?? SHEET_FRAMES.idle;
  const fps = SHEET_FPS[anim] ?? 4;
  return frames[Math.floor((performance.now() / 1000) * fps) % frames.length];
}

export class Engine {
  constructor(canvas, state) {
    this.canvas = canvas;
    canvas.__engine = this; // debug/testing handle
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
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
    this.theme = data;
    this._pending = null;

    this.coins = [];
    this.enemies = [];
    this.spikes = [];
    this.checkpoints = [];
    this.flags = [];
    for (const s of this.level.spawns) {
      if (s.type === "coin") this.coins.push(createCoin(s.x, s.y));
      else if (s.type === "enemy") this.enemies.push(createEnemy(s.x, s.y));
      else if (s.type === "spikes") this.spikes.push(createSpikes(s.x, s.y));
      else if (s.type === "checkpoint")
        this.checkpoints.push(createCheckpoint(s.x, s.y));
      else if (s.type === "flag") this.flags.push(createFlag(s.x, s.y));
    }

    const start = this.level.playerStart ?? { x: TILE / 2, y: TILE / 2 };
    this.player = createPlayer(start.x, start.y);
    this.state.setCheckpoint(start);
    this.cam = { x: 0, y: 0 };
    this.snapCamera();
  }

  step(dt) {
    const p = this.player;
    updatePlayer(p, this.input, this.level, dt, this.sfx);
    for (const e of this.enemies) if (!e.gone) updateEnemy(e, this.level, dt);
    for (const c of this.coins) if (!c.gone) updateCoin(c, dt);

    processInteractions(
      {
        player: p,
        level: this.level,
        coins: this.coins,
        enemies: this.enemies,
        spikes: this.spikes,
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
    if (!this.level) {
      ctx.fillStyle = css([0.43, 0.72, 0.91]);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }

    ctx.fillStyle = css(this.theme.sky);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const ox = this.cam.x - VIEW_W / 2; // world coords of the view origin
    const oy = this.cam.y - VIEW_H / 2;

    this.renderClouds(ctx, ox, oy);
    this.renderTiles(ctx, ox, oy);

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
    for (const e of this.enemies) {
      if (e.gone) continue;
      this.drawFrame(
        ctx,
        this.images.enemy,
        enemyFrame(e),
        e.x - ox,
        e.y - oy,
        {
          flip: e.dir > 0,
          scaleY: e.scaleY,
        },
      );
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
      // Name label above the ghost.
      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(v.name, Math.round(gx), Math.round(gy - 12));
      ctx.textAlign = "left";
    }
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
