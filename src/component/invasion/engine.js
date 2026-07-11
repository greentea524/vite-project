// Alien Invasion canvas engine (#73), ported from the legacy
// game/js-alien-invasion/index.html. A faithful port: entity data,
// movement, collisions, waves, combo scoring, and the rAF loop are
// unchanged — reorganized into a class with an explicit lifecycle so
// React can own the canvas and unmount cleanly.
//
// Boundaries (per the migration issues):
//   - The engine binds only window resize/orientationchange itself.
//     Keyboard, mouse, and touch input arrive through the input API
//     below (#74) — no document/getElementById access here.
//   - Score/wave/etc. are pushed to React through onHud/onGameOver
//     callbacks instead of being drawn as canvas text. World-anchored
//     effects (score popups, combo-scaled flashes) stay on canvas.
//   - Sounds go through the injected audio module (#75).

// Ghost interpolation is a pure, game-agnostic module (no canvas, no
// platformer imports) — reused rather than copied (#80).
import { createGhost, pushSnapshot, sampleGhost } from "../platformer/ghosts.js";
// Seeded RNG for deterministic multiplayer spawns/drops (#81).
import { derive } from "./rng.js";

// Base design resolution; everything scales from an 800px-wide board.
// Multiplayer snapshots (#80) are exchanged in these base units so
// differently-sized canvases (mobile vs desktop) agree on positions.
const BASE_WIDTH = 800;

const BULLET_SPEED = 7;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 10;
const SHOOT_COOLDOWN_MS = 200;

const ALIEN_WIDTH = 30;
const ALIEN_HEIGHT = 20;
const ALIEN_SPEED = 1;

// Deterministic-race fleet width (#81): a fixed column count so both
// players get the same aliens regardless of screen size. Chosen to
// sit between the old mobile (~9) and desktop (~19) counts.
const DETERMINISTIC_COLUMNS = 14;

// Boss variations (#90/#91/#92). One boss per wave, cycling through
// the roster so wave 1 keeps the classic octopus. Sizes are in base
// (800px) units, speed multiplies ALIEN_SPEED, score is the kill bonus.
export const BOSS_TYPES = ["octopus", "mothership", "lasercore", "hive"];
export const BOSS_NAMES = {
  octopus: "Octo Commander",
  mothership: "The Mothership",
  lasercore: "The Laser Core",
  hive: "The Swarm Hive",
};
const BOSS_STATS = {
  octopus: { hp: 12, width: 90, height: 30, speed: 1.5, score: 120 },
  mothership: { hp: 28, width: 130, height: 34, speed: 0.8, score: 250 },
  lasercore: { hp: 16, width: 70, height: 46, speed: 1.2, score: 180 },
  hive: { hp: 12, width: 84, height: 42, speed: 1.2, score: 60 },
};

// Mothership carrier behavior (#90): kamikaze spawn cadence and cap.
const SPAWNLING_INTERVAL = 150; // frames between launches
const SPAWNLING_MAX = 4;
const SPAWNLING_SCORE = 15;

// Laser Core beam cycle (#91), in frames.
const BEAM_MOVE = 150;
const BEAM_CHARGE = 70;
const BEAM_FIRE = 50;

// Swarm Hive splitting (#92): each death below max gen spawns two
// smaller, faster copies with half the HP.
const HIVE_MAX_GEN = 2;
const HIVE_GEN_SCORE = [60, 40, 25];
const HIVE_GEN_SPEED = [1.2, 2, 2.8];
const HIVE_CHILD_SIZE = 0.65; // per generation

// Octo Commander ink shots: slow lobbed globs aimed at the player.
// Dodgeable at wave-1 pace, and shootable for a small bounty.
const INK_INTERVAL = 170; // frames between shots
const INK_SPEED = 2.1;
const INK_SCORE = 10;

const PARTICLE_COUNT = 20;
const PARTICLE_LIFETIME = 30;

const POWERUP_SIZE = 16;
const POWERUP_SPEED = 2;
const POWERUP_DROP_CHANCE = 0.15;

const COMBO_WINDOW_FRAMES = 90;
const COMBO_STEP_HITS = 3;
const MAX_COMBO_MULTIPLIER = 6;

export const WEAPON_NAMES = { 1: "Single Shot", 2: "Dual Missile", 3: "Triple Shot" };

export class InvasionEngine {
  // `wrapper` is the sizing container (the component's game area);
  // callbacks: onHud(hud) fires when any HUD value changes,
  // onGameOver({score, hitRate}) once per game end, onStat(kind, key,
  // value) reports achievement stat events (#94) — kind is "add"
  // (counter), "max" (high-water mark), or "ship" (set membership).
  constructor(canvas, wrapper, { audio, onHud, onGameOver, onStat } = {}) {
    this.canvas = canvas;
    canvas.__engine = this; // debug/testing handle (matches platformer)
    this.ctx = canvas.getContext("2d");
    this.wrapper = wrapper;
    this.audio = audio;
    this.onHud = onHud ?? (() => {});
    this.onGameOver = onGameOver ?? (() => {});
    this.onStat = onStat ?? (() => {});
    this.onSectorClear = arguments[2]?.onSectorClear ?? (() => {});

    this.shipType = "fighter"; // "fighter", "cruiser", "interceptor"
    this.player = { x: 0, y: 0, width: 40, height: 20, speed: 5 };
    // left/right are the digital inputs (keyboard); axis is the analog
    // joystick deflection (-1..1, #93). Whichever is non-zero wins.
    this.input = { left: false, right: false, axis: 0, shootHeld: false };
    this._wantsToShoot = false;
    this._canShoot = true;
    this._shootTimer = 0;
    this._raf = 0;
    this._running = false;
    this._lastHud = null;

    this.menuMode = true;
    this.paused = false;

    // Multiplayer (#79/#80): the network is attached by React when a
    // room session starts; the ghost mirrors the one remote player.
    this.network = null;
    this.ghost = null;
    this._prevX = null; // last frame's x, for the broadcast velocity
    // Deterministic-multiplayer seed (#81): non-null only in a room
    // race, shared by the relay so both players spawn identical waves
    // and roll identical power-up drops. Single player leaves it null
    // and keeps using Math.random — behavior is unchanged.
    this._seed = null;

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);

    this._resetRun();
  }

  // --- lifecycle -------------------------------------------------------

  setShipType(type) {
    if (this.shipType === type) return;
    this.shipType = type;
    this._resize();
    if (this.menuMode) {
      this.playerHp = this.playerMaxHp;
    }
  }

  start() {
    window.addEventListener("resize", this._resize);
    window.addEventListener("orientationchange", this._resize);
    this._resize();
    this._startLoop();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._running = false;
    clearTimeout(this._shootTimer);
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("orientationchange", this._resize);
  }

  restart() {
    cancelAnimationFrame(this._raf);
    this._running = false;
    this._resetRun();
    this._resize(); // rebuilds the wave and recenters the player
    this._startLoop();
  }

  // `seed` (#81) turns on deterministic spawns/drops for a room race;
  // omitted (single player) keeps the classic Math.random behavior.
  play(seed = null) {
    this.menuMode = false;
    this.paused = false;
    this.permanentBuffs = null;
    this._seed = seed == null ? null : seed >>> 0;
    this.restart();
    if (!this.menuMode) {
      this.hyperdriveState = "dropping_in";
      this.player.y = this.canvas.height + this.player.height;
    }
    this._stat("ship", "shipsUsed", this.shipType);
  }

  // True when this run is a seeded, deterministic multiplayer race.
  get _deterministic() {
    return this._seed != null;
  }

  setPermanentBuffs(buffs, loopCount = 0, tier = 0) {
    this.permanentBuffs = buffs;
    this.difficultyLevel = 1 + (loopCount * 5) + tier;
  }

  playSector(hp) {
    this.menuMode = false;
    this.paused = false;
    this._seed = null; // rogue-lite is single player (#81)
    cancelAnimationFrame(this._raf);
    this._running = false;
    this._resetRun();
    
    if (this.permanentBuffs) {
      this.weaponLevel = this.permanentBuffs.weaponLevel;
      this.playerMaxHp += this.permanentBuffs.maxHp;
      this.playerHp = hp !== null ? hp : this.playerMaxHp;
      this.waveNumber = this.difficultyLevel;
    }
    
    this._resize();
    this.hyperdriveState = "dropping_in";
    this.player.y = this.canvas.height + this.player.height;
    this._startLoop();
    this._stat("ship", "shipsUsed", this.shipType);
  }

  setPaused(isPaused) {
    if (this.gameOver) return;
    this.paused = isPaused;
    if (!isPaused && !this._running) {
      this._startLoop();
    }
  }

  _resetRun() {
    this.bullets = [];
    this.aliens = [];
    this.particles = [];
    this.powerUps = [];
    this.scorePopups = [];
    this.stars = [];
    this.planets = [];
    // Bosses are a list (#92): the Swarm Hive splits into multiple
    // live entities. Non-splitting waves just hold one.
    this.bosses = [];
    this.spawnlings = []; // Mothership kamikazes (#90)
    this.inkShots = []; // Octo Commander ink globs
    this.alienDirection = 1;
    this.hyperdriveState = null;
    this._hyperdriveStart = 0;
    this.playerShieldHp = 0;
    this.droneTimer = 0;
    this.drones = [{ x: 0, y: 0, cooldown: 0 }, { x: 0, y: 0, cooldown: 0 }];
    this.laserTimer = 0;
    this.homingTimer = 0;
    this.weaponCratesCollected = 0;
    if (this.shipType === "cruiser") {
      this.playerMaxHp = 150;
    } else if (this.shipType === "interceptor") {
      this.playerMaxHp = 75;
    } else {
      this.playerMaxHp = 100;
    }
    this.playerHp = this.playerMaxHp;
    this.playerHitFlash = 0;
    this.score = 0;
    this.scoreFlashFrames = 0;
    this.comboCount = 0;
    this.comboTimerFrames = 0;
    this.runBestCombo = 0; // best combo streak this run, for results (#82)
    this.bulletsShot = 0;
    this.hits = 0;
    this.weaponLevel = 1;
    this.waveNumber = 1;
    this.gameOver = false;
    this._wantsToShoot = false;
    this._canShoot = true;
    this.paused = false;
    this._prevX = null;
    this._waveDamageFree = true; // Untouchable tracking (#94)
  }

  // Report a stat event to the achievements layer (#94). No-ops in
  // menu mode so the idle menu scene can't accrue stats.
  _stat(kind, key, value = 1) {
    if (this.menuMode) return;
    this.onStat(kind, key, value);
  }

  // --- input API (driven by React handlers, #74) -----------------------

  setLeft(down) {
    this.input.left = down;
  }

  setRight(down) {
    this.input.right = down;
  }

  // Analog joystick deflection (#93): -1..1, scales the ship's speed.
  setMoveAxis(value) {
    this.input.axis = Math.max(-1, Math.min(1, value || 0));
  }

  setShootHeld(down) {
    this.input.shootHeld = down;
    if (down) this.triggerShoot();
  }

  // One-shot fire request (tap / click / spacebar press).
  triggerShoot() {
    if (!this.gameOver) this._wantsToShoot = true;
  }

  // Mouse aiming: center the ship under the pointer (desktop).
  pointTo(clientX) {
    if (this.gameOver) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    this.player.x = Math.max(
      0,
      Math.min(x - this.player.width / 2, this.canvas.width - this.player.width),
    );
  }

  // --- multiplayer (#79/#80) --------------------------------------------

  attachNetwork(network) {
    this.network = network;
  }

  // Create/refresh the remote player's ghost from the roster. The same
  // id keeps the snapshot buffer (a name change doesn't reset motion);
  // null clears it (player left / room closed).
  setGhost(meta) {
    if (!meta) {
      this.ghost = null;
      return;
    }
    if (this.ghost?.id === meta.id) {
      if (meta.name != null) this.ghost.name = meta.name;
      return;
    }
    this.ghost = createGhost(meta);
    this.ghost.over = false;
  }

  // A remoteState snapshot arrived: buffer it for interpolated
  // rendering. Snapshots are dropped until the roster has introduced
  // the sender (setGhost), which happens at join time.
  pushGhostSnapshot(snap) {
    if (!this.ghost || this.ghost.id !== snap.id) return;
    this.ghost.over = Boolean(snap.over); // terminal flag: latest wins
    if (snap.shipType) this.ghost.shipType = snap.shipType;
    this.ghost.isFiring = Boolean(snap.isFiring);
    pushSnapshot(this.ghost, snap, performance.now());
  }

  // Broadcast the local ship at ~15 Hz (the network module throttles;
  // #80). Positions travel in base-800 units so peers with different
  // canvas sizes agree; vx (base units/sec) feeds the peer's
  // extrapolation through packet gaps. `force` pushes the terminal
  // game-over snapshot past the throttle.
  _broadcastState(force = false) {
    const scale = this._scale();
    const x = this.player.x / scale;
    const vx = this._prevX == null ? 0 : ((this.player.x - this._prevX) / scale) * 60;
    this._prevX = this.player.x;
    if (!this.network?.roomCode || this.menuMode) return;
    // Live score rides along so the peer can show it while spectating
    // (#82); the terminal snapshot carries the full results.
    const snap = { 
      x, 
      y: this.player.y / scale,
      vx, 
      over: this.gameOver, 
      shipType: this.shipType, 
      score: this.score,
      isFiring: Boolean(this.input.shootHeld || this._wantsToShoot)
    };
    if (this.gameOver) {
      snap.hits = this.hits;
      snap.bestCombo = this.runBestCombo;
      snap.bestMultiplier = this._comboMultiplier(this.runBestCombo);
    }
    this.network.sendState(snap, force);
  }

  // --- sizing ----------------------------------------------------------

  // Fits the board to the wrapper. Ported from the legacy resizeCanvas:
  // mobile gets a taller aspect and reserved room for touch controls.
  // Like the original, resizing rebuilds the current wave.
  _resize() {
    const canvas = this.canvas;
    const isMobile = window.matchMedia(
      "(max-width: 767px), (pointer: coarse)",
    ).matches;

    const wrapperWidth = this.wrapper?.getBoundingClientRect().width || window.innerWidth;
    const reservedControlsHeight = isMobile ? 118 : 24;
    const verticalPadding = isMobile ? 24 : 40;

    const maxWidth = Math.max(260, wrapperWidth);
    const maxHeight = Math.max(
      220,
      window.innerHeight - reservedControlsHeight - verticalPadding,
    );
    const aspectRatio = isMobile ? 800 / 1200 : 800 / 700;

    let newWidth = isMobile ? maxWidth : Math.min(maxWidth, 960);
    let newHeight = newWidth / aspectRatio;
    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = newHeight * aspectRatio;
    }

    canvas.width = Math.floor(newWidth);
    canvas.height = Math.floor(newHeight);
    canvas.style.width = `${Math.floor(newWidth)}px`;
    canvas.style.height = `${Math.floor(newHeight)}px`;

    const scale = this._scale();
    if (this.shipType === "cruiser") {
      this.player.width = 50 * scale;
      this.player.height = 28 * scale;
      this.player.speed = 3.5 * scale;
    } else if (this.shipType === "interceptor") {
      this.player.width = 30 * scale;
      this.player.height = 16 * scale;
      this.player.speed = 6.5 * scale;
    } else {
      this.player.width = 40 * scale;
      this.player.height = 20 * scale;
      this.player.speed = 5 * scale;
    }
    this.player.y = canvas.height - this.player.height - 10;
    this.player.x = canvas.width / 2 - this.player.width / 2;

    this.aliens.length = 0;
    if (!this.menuMode) {
      this._createAliens();
    }
    this._setupBackground();
  }

  _scale() {
    return this.canvas.width / BASE_WIDTH;
  }

  // --- spawning --------------------------------------------------------

  _createAliens() {
    const scale = this._scale();
    const w = ALIEN_WIDTH * scale;
    const h = ALIEN_HEIGHT * scale;
    const sidePadding = 30 * scale;
    const gap = 20 * scale;
    const step = w + gap;

    // Column count: canvas-derived for single player (unchanged), but a
    // FIXED count in a deterministic race (#81) so both players share
    // the same alien set — and IDs. The fixed grid is spread across
    // whatever width each screen has, so positions differ per device
    // but identity (row/col) matches, which is what shared kills need.
    let columns;
    let colStep;
    if (this._deterministic) {
      columns = DETERMINISTIC_COLUMNS;
      colStep = (this.canvas.width - sidePadding * 2) / columns;
    } else {
      columns = Math.max(
        1,
        Math.floor((this.canvas.width - sidePadding * 2 + gap) / step),
      );
      colStep = step;
    }

    const hp = 1 + Math.floor((this.waveNumber - 1) / 3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < columns; col++) {
        this.aliens.push({
          // Stable per-wave identity for shared kills / drops (#81).
          id: `w${this.waveNumber}-r${row}-c${col}`,
          x: sidePadding + col * colStep,
          y: sidePadding + row * (h + gap),
          width: w,
          height: h,
          type: row % 3,
          hp,
          hitFlash: 0,
        });
      }
    }

    this._spawnWaveBoss();
  }

  // Each wave gets one boss from the cycling roster (#90/#91/#92);
  // wave 1 is always the classic octopus.
  _spawnWaveBoss() {
    this.spawnlings = [];
    this.inkShots = [];
    const type = BOSS_TYPES[(this.waveNumber - 1) % BOSS_TYPES.length];
    this.bosses = [this._makeBoss(type, { id: `w${this.waveNumber}-boss` })];
  }

  _makeBoss(type, over = {}) {
    const scale = this._scale();
    const stats = BOSS_STATS[type];
    const sizeMul = over.sizeMul ?? 1;
    const width = stats.width * scale * sizeMul;
    const height = stats.height * scale * sizeMul;
    const hue = Math.floor(Math.random() * 360);
    
    // Progressive scaling
    const hpMulti = 1 + (this.waveNumber - 1) * 0.2;
    const speedMulti = 1 + (this.waveNumber - 1) * 0.1;
    const attackRateMulti = 1 + (this.waveNumber - 1) * 0.1;
    
    const scaledHp = Math.floor(stats.hp * hpMulti);
    const scaledSpeed = stats.speed * speedMulti;
    const baseSpawnT = type === "octopus" ? INK_INTERVAL : SPAWNLING_INTERVAL;

    return {
      type,
      // Stable identity for shared kills (#81); hive children derive
      // theirs from the parent so both screens agree after a split.
      id: over.id ?? `w${this.waveNumber}-boss`,
      x: over.x ?? this.canvas.width / 2 - width / 2,
      y: over.y ?? 8 * scale,
      width,
      height,
      hp: over.hp ?? scaledHp,
      maxHp: over.hp ?? scaledHp,
      dir: over.dir ?? 1,
      speed: scaledSpeed,
      gen: over.gen ?? 0, // hive generation (#92)
      phase: "move", // lasercore beam cycle (#91)
      phaseT: Math.floor(BEAM_MOVE / attackRateMulti),
      // Attack timer: kamikaze launches (mothership) or ink shots
      // (octopus) share the field — one boss type per entity.
      spawnT: Math.max(10, Math.floor(baseSpawnT / attackRateMulti)),
      wobbleT: Math.random() * Math.PI * 2, // hive goo animation
      hue,
      hitFlash: 0,
      bodyColor: `hsl(${hue}, 65%, 38%)`,
      highlightColor: `hsl(${hue}, 70%, 62%)`,
      tentacleColor: `hsl(${hue}, 72%, 32%)`,
    };
  }

  _spawnKamikaze(boss) {
    const scale = this._scale();
    this.spawnlings.push({
      x: boss.x + boss.width / 2 - 9 * scale,
      y: boss.y + boss.height,
      width: 18 * scale,
      height: 16 * scale,
      vx: 0,
      vy: 2.2 * scale,
    });
  }

  _setupBackground() {
    const scale = this._scale();
    // Size floors keep the backdrop alive on small screens, where the
    // base-800 scale (~0.47 on phones) would shrink stars and planets
    // to near-invisible specks.
    this.stars.length = 0;
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.max(1.4, (Math.random() * 1.5 + 0.5) * scale),
        opacity: Math.random() * 0.5 + 0.5,
        speed: Math.max(0.2, (Math.random() * 0.5 + 0.1) * scale),
      });
    }
    this.planets.length = 0;
    this.planets.push({
      x: Math.random() * this.canvas.width,
      y: Math.random() * (this.canvas.height / 2),
      r: Math.max(26, (Math.random() * 30 + 20) * scale),
      color: `hsl(${Math.random() * 360}, 60%, 40%)`,
      glow: `hsl(${Math.random() * 360}, 60%, 20%)`,
      speed: Math.max(0.03, 0.05 * scale),
    });
  }

  _createFireworks(x, y) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3 + 1) * this._scale();
      this.particles.push({
        x: x + ALIEN_WIDTH / 2,
        y: y + ALIEN_HEIGHT / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE_LIFETIME,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
      });
    }
  }

  // --- scoring ---------------------------------------------------------

  _comboMultiplier(streak) {
    return Math.min(
      MAX_COMBO_MULTIPLIER,
      1 + Math.floor(Math.max(streak - 1, 0) / COMBO_STEP_HITS),
    );
  }

  _addScore(points, x, y, color = "#ffd54a", countsForCombo = true) {
    if (countsForCombo) {
      this.comboCount = this.comboTimerFrames > 0 ? this.comboCount + 1 : 1;
      this.comboTimerFrames = COMBO_WINDOW_FRAMES;
      this.runBestCombo = Math.max(this.runBestCombo, this.comboCount);
      this._stat("max", "bestCombo", this.comboCount);
    }

    const multiplier = countsForCombo ? this._comboMultiplier(this.comboCount) : 1;
    const finalPoints = points * multiplier;

    this.score += finalPoints;
    this.scoreFlashFrames = Math.min(26, 10 + multiplier * 3);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.scorePopups.push({
        x,
        y,
        text: multiplier > 1 ? `+${finalPoints} x${multiplier}` : `+${finalPoints}`,
        life: 32,
        color,
      });
    }
  }

  _applyWeaponUpgrade() {
    this.weaponCratesCollected++;
    if (this.weaponCratesCollected >= 10) {
      this.weaponLevel = 5;
    } else if (this.weaponCratesCollected >= 6) {
      this.weaponLevel = 4;
    } else if (this.weaponCratesCollected >= 3) {
      this.weaponLevel = 3;
    } else if (this.weaponCratesCollected >= 1) {
      this.weaponLevel = 2;
    }
    // Max weapon reached: clear pending weapon pickups
    if (this.weaponLevel === 5) {
      this.powerUps = this.powerUps.filter(p => p.type !== "weapon");
    }
    this._stat("max", "maxWeaponLevel", this.weaponLevel);
  }

  _shootBullet() {
    const p = this.player;
    
    const spawn = (fx, vx = 0, isHoming = false, isLaser = false) => {
      this.bullets.push({
        x: p.x + p.width * fx - (isLaser ? 8 : BULLET_WIDTH / 2),
        y: p.y - (isLaser ? 40 : BULLET_HEIGHT),
        vx: vx,
        isHoming: isHoming,
        isLaser: isLaser,
        width: isLaser ? 16 : BULLET_WIDTH,
        height: isLaser ? 40 : BULLET_HEIGHT,
      });
    };

    const useLaser = this.laserTimer > 0 && (this.homingTimer <= 0 || this.bulletsShot % 2 === 0);
    const useHoming = this.homingTimer > 0 && !useLaser;

    if (useLaser) {
      spawn(0.5, 0, false, true);
    } else if (useHoming) {
      spawn(0.2, -2, true);
      spawn(0.5, 0, true);
      spawn(0.8, 2, true);
    } else if (this.weaponLevel >= 5) {
      // 5-way Spread
      spawn(0.5, 0);
      spawn(0.3, -1);
      spawn(0.7, 1);
      spawn(0.1, -2.5);
      spawn(0.9, 2.5);
    } else if (this.weaponLevel === 4) {
      // Quad
      spawn(0.2, -0.5);
      spawn(0.4, 0);
      spawn(0.6, 0);
      spawn(0.8, 0.5);
    } else if (this.weaponLevel === 3) {
      spawn(0.2);
      spawn(0.5);
      spawn(0.8);
    } else if (this.weaponLevel === 2) {
      spawn(0.25);
      spawn(0.75);
    } else {
      spawn(0.5);
    }

    if (this.shipType === "cruiser") {
      this.audio?.shootCruiser?.();
    } else if (this.shipType === "interceptor") {
      this.audio?.shootInterceptor?.();
    } else {
      this.audio?.shootFighter?.();
    }

    this.bulletsShot += this.weaponLevel;
    this._canShoot = false;
    clearTimeout(this._shootTimer);
    this._shootTimer = setTimeout(() => (this._canShoot = true), SHOOT_COOLDOWN_MS);
  }

  _damagePlayer(amount) {
    if (this.gameOver) return;

    // Any hit — even one the shield absorbs — breaks the wave's
    // Untouchable status (#94).
    this._waveDamageFree = false;

    if (this.playerShieldHp > 0) {
      if (amount <= this.playerShieldHp) {
        this.playerShieldHp -= amount;
        amount = 0;
      } else {
        amount -= this.playerShieldHp;
        this.playerShieldHp = 0;
      }
    }
    
    this.playerHp -= amount;
    this.playerHitFlash = 10;
    this.audio?.alienHit(); // Play hit sound
    if (this.playerHp <= 0) {
      this.playerHp = 0;
      this.gameOver = true;
      this._createFireworks(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
    }
  }

  // --- shared kills & deterministic drops (#81) --------------------------

  // The power-up types an alien can drop, in a fixed order so a seeded
  // index picks the same one on both screens.
  static get POWERUP_TYPES() {
    return ["weapon", "shield", "drone", "laser", "homing"];
  }

  // Drop for a killed alien. In a deterministic race the roll is a pure
  // function of (seed, alien id) — so both players get the SAME drop
  // for the same alien no matter who lands the kill or in what order,
  // with no shared RNG state to keep in sync. Single player keeps the
  // original Math.random rolls.
  _maybeDropPowerUp(alien) {
    const chance = this._deterministic ? derive(this._seed, alien.id, 0) : Math.random();
    if (chance >= POWERUP_DROP_CHANCE) return;
    const types = InvasionEngine.POWERUP_TYPES;
    const pick = this._deterministic ? derive(this._seed, alien.id, 1) : Math.random();
    const type = types[Math.floor(pick * types.length)];
    // A maxed-out player can't use another weapon crate — skip it (the
    // roll was still consumed, so both screens stay in lockstep).
    if (type === "weapon" && this.weaponLevel >= 5) return;
    this.powerUps.push({
      x: alien.x + alien.width / 2 - POWERUP_SIZE / 2,
      y: alien.y + alien.height / 2 - POWERUP_SIZE / 2,
      type,
    });
  }

  // Tell the room this enemy is dead so it despawns on the other
  // screen too (#81). No-op outside a room; network dedupes by id.
  _reportKill(id) {
    if (this._deterministic && id) this.network?.sendEnemyKill?.(id);
  }

  // The other player destroyed an enemy: mirror it here (#81). Despawn
  // the matching alien (replicating its deterministic drop so the
  // power-up shows on both screens) or kill the matching boss (which
  // also replicates a hive split). No score/stat is granted — the
  // kill belongs to the other player. Safe if the enemy is already
  // gone locally (both players killed it) — it just no-ops.
  applyRemoteKill(id) {
    if (!id) return;
    const ai = this.aliens.findIndex((a) => a.id === id);
    if (ai >= 0) {
      const alien = this.aliens[ai];
      this._createFireworks(alien.x, alien.y);
      this._maybeDropPowerUp(alien);
      this.aliens.splice(ai, 1);
      return;
    }
    const bi = this.bosses.findIndex((b) => b.id === id);
    if (bi >= 0) this._killBoss(bi, true);
  }

  // --- simulation ------------------------------------------------------

  _update() {
    const canvas = this.canvas;
    const player = this.player;

    this.stars.forEach((star) => {
      star.y += star.speed;
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }
    });
    this.planets.forEach((planet) => {
      planet.y += planet.speed;
      if (planet.y - planet.r > canvas.height) {
        planet.y = -planet.r;
        planet.x = Math.random() * canvas.width;
      }
    });

    if (this.menuMode) {
      // Menu showcase: the ship idles with a slow drift so the menu
      // screen reads as a live scene instead of a static frame.
      this._menuT = (this._menuT ?? Math.random() * Math.PI * 2) + 0.012;
      const p = this.player;
      p.x =
        canvas.width / 2 -
        p.width / 2 +
        Math.sin(this._menuT) * canvas.width * 0.1;
      return;
    }

    if (this.hyperdriveState === "jumping") {
      const dt = performance.now() - this._hyperdriveStart;
      const speedMulti = Math.min(25, 1 + dt / 80);
      this.player.y -= this.player.speed * speedMulti;
      
      this.particles.push({
        x: this.player.x + this.player.width * Math.random(),
        y: this.player.y + this.player.height,
        vx: 0,
        vy: 20 + Math.random() * 10,
        life: 20,
        color: "rgba(255, 255, 255, 0.8)",
        width: 2,
        height: 25
      });
      
      if (this.player.y < -this.player.height) {
        if (this.permanentBuffs) {
          this._running = false;
          this.onSectorClear(this.playerHp);
          return;
        } else {
          this.waveNumber++;
          this._createAliens();
          this.hyperdriveState = "dropping_in";
          this.player.y = this.canvas.height + this.player.height;
        }
      }
      return;
    } else if (this.hyperdriveState === "dropping_in") {
      const targetY = this.canvas.height - this.player.height - 10;
      const dist = this.player.y - targetY;
      if (dist > 1) {
        this.player.y -= Math.max(1, dist * 0.1);
        return;
      } else {
        this.player.y = targetY;
        this.hyperdriveState = null;
      }
    }

    if (this.playerHitFlash > 0) this.playerHitFlash--;
    
    if (!this.permanentBuffs?.hasDrones && this.droneTimer > 0) this.droneTimer--;
    if (!this.permanentBuffs?.hasLaser && this.laserTimer > 0) this.laserTimer--;
    if (!this.permanentBuffs?.hasHoming && this.homingTimer > 0) this.homingTimer--;

    if (this.permanentBuffs?.hasDrones) this.droneTimer = 2;
    if (this.permanentBuffs?.hasLaser) this.laserTimer = 2;
    if (this.permanentBuffs?.hasHoming) this.homingTimer = 2;

    if (this.comboTimerFrames > 0) {
      this.comboTimerFrames--;
      if (this.comboTimerFrames === 0) this.comboCount = 0;
    }

    // Analog joystick wins when deflected; keyboard stays digital ±1.
    // Speed scales with deflection, so small nudges allow precise
    // dodges (#93).
    const moveAxis =
      this.input.axis !== 0
        ? this.input.axis
        : (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (moveAxis !== 0) {
      player.x = Math.max(
        0,
        Math.min(player.x + moveAxis * player.speed, canvas.width - player.width),
      );
    }

    if ((this.input.shootHeld || this._wantsToShoot) && this._canShoot && !this.gameOver) {
      this._shootBullet();
      this._wantsToShoot = false;
    }

    this.bullets.forEach((bullet, index) => {
      if (bullet.vy) {
        bullet.y += bullet.vy * this._scale();
      } else {
        const bSpeed = bullet.isLaser ? BULLET_SPEED * 2.5 : BULLET_SPEED;
        bullet.y -= bSpeed * this._scale();
      }
      if (bullet.vx) bullet.x += bullet.vx * this._scale();
      
      if (bullet.isHoming && this.aliens.length > 0) {
        // Find nearest alien
        let nearest = this.aliens[0];
        let minDist = Infinity;
        for (const a of this.aliens) {
          const dx = (a.x + a.width/2) - bullet.x;
          const dy = (a.y + a.height/2) - bullet.y;
          const dist = dx*dx + dy*dy;
          if (dist < minDist) { minDist = dist; nearest = a; }
        }
        // Steer towards nearest
        const dir = Math.sign((nearest.x + nearest.width/2) - bullet.x);
        bullet.vx += dir * 0.5;
        // Cap horizontal speed
        bullet.vx = Math.max(-4, Math.min(4, bullet.vx));
      }
      
      if (bullet.y < -50 || bullet.x < -50 || bullet.x > canvas.width + 50) {
        this.bullets.splice(index, 1);
      }
    });

    const scale = this._scale();
    let hitEdge = false;
    const currentAlienSpeed = ALIEN_SPEED * Math.min(2.5, 1 + (this.waveNumber - 1) * 0.1);
    this.aliens.forEach((alien) => {
      alien.x += currentAlienSpeed * scale * this.alienDirection;
      if (alien.hitFlash > 0) alien.hitFlash--;
      if (alien.x + alien.width > canvas.width || alien.x < 0) hitEdge = true;
      if (alien.y + alien.height > canvas.height) this.gameOver = true;
    });

    this._updateBosses(scale);

    if (hitEdge) {
      this.alienDirection *= -1;
      this.aliens.forEach((alien) => (alien.y += 20 * scale));
      this.bosses.forEach((boss) => (boss.y += 12 * scale));
    }

    this._updateSpawnlings(scale);
    this._updateInkShots();
    this._updateDrones();
    this._collideBullets();
    this._collectPickups();
    this._broadcastState();
  }

  _updateDrones() {
    if (this.droneTimer <= 0) return;

    const player = this.player;
    const targetY = player.y + 10 * this._scale();
    
    // Update target positions for left and right drones
    const targets = [
      { x: player.x - 30 * this._scale(), y: targetY },
      { x: player.x + player.width + 10 * this._scale(), y: targetY }
    ];

    this.drones.forEach((drone, index) => {
      // Lerp towards target
      if (drone.x === 0 && drone.y === 0) {
        drone.x = targets[index].x;
        drone.y = targets[index].y;
      } else {
        drone.x += (targets[index].x - drone.x) * 0.2;
        drone.y += (targets[index].y - drone.y) * 0.2;
      }

      // Firing logic
      if (drone.cooldown > 0) drone.cooldown--;
      if (drone.cooldown <= 0) {
        // Find nearest target (alien or boss)
        let nearest = null;
        let minDist = Infinity;
        
        const checkTarget = (t) => {
          const dx = (t.x + t.width/2) - drone.x;
          const dy = (t.y + t.height/2) - drone.y;
          const dist = dx*dx + dy*dy;
          if (dist < minDist) { minDist = dist; nearest = t; }
        };

        this.aliens.forEach(checkTarget);
        this.bosses.forEach(checkTarget);
        
        if (nearest) {
          const dx = (nearest.x + nearest.width/2) - drone.x;
          const dy = (nearest.y + nearest.height/2) - drone.y;
          const angle = Math.atan2(dy, dx);
          
          this.bullets.push({
            x: drone.x,
            y: drone.y,
            vx: Math.cos(angle) * BULLET_SPEED,
            vy: Math.sin(angle) * BULLET_SPEED,
          });
          
          drone.cooldown = 30; // fire every half second
        }
      }
    });
  }

  _updateBosses(scale) {
    const canvas = this.canvas;
    const player = this.player;

    for (const boss of this.bosses) {
      let moving = true;

      if (boss.type === "lasercore") {
        // Beam cycle (#91): move -> charging (telegraph) -> firing.
        // The ship freezes while charging/firing so the telegraphed
        // column stays dodgeable.
        boss.phaseT--;
        if (boss.phaseT <= 0) {
          const attackRateMulti = 1 + (this.waveNumber - 1) * 0.1;
          if (boss.phase === "move") {
            boss.phase = "charging";
            boss.phaseT = Math.floor(BEAM_CHARGE / attackRateMulti);
          } else if (boss.phase === "charging") {
            boss.phase = "firing";
            boss.phaseT = Math.floor(BEAM_FIRE / attackRateMulti);
          } else {
            boss.phase = "move";
            boss.phaseT = Math.floor(BEAM_MOVE / attackRateMulti);
          }
        }
        moving = boss.phase === "move";

        // The beam melts the player while firing: 2 damage per frame
        // while overlapping the column (~120 DPS).
        if (boss.phase === "firing") {
          const beam = this._beamRect(boss);
          if (
            player.x < beam.right &&
            player.x + player.width > beam.left &&
            player.y + player.height > beam.top
          ) {
            this._damagePlayer(2);
          }
        }
      } else if (boss.type === "mothership") {
        // Carrier (#90): periodically launches kamikaze spawnlings,
        // capped so the swarm stays manageable.
        boss.spawnT--;
        if (boss.spawnT <= 0 && this.spawnlings.length < SPAWNLING_MAX) {
          const attackRateMulti = 1 + (this.waveNumber - 1) * 0.1;
          boss.spawnT = Math.floor(SPAWNLING_INTERVAL / attackRateMulti);
          this._spawnKamikaze(boss);
        }
      } else if (boss.type === "hive") {
        boss.wobbleT += 0.08 + boss.gen * 0.03;
      } else if (boss.type === "octopus") {
        // Ink shots: lobbed globs aimed loosely at the player.
        boss.spawnT--;
        if (boss.spawnT <= 0) {
          const attackRateMulti = 1 + (this.waveNumber - 1) * 0.1;
          boss.spawnT = Math.floor(INK_INTERVAL / attackRateMulti);
          this._spawnInk(boss);
        }
      }

      if (moving) {
        const mul = boss.type === "hive" ? HIVE_GEN_SPEED[boss.gen] : boss.speed;
        boss.x += ALIEN_SPEED * scale * mul * boss.dir;
        if (boss.x + boss.width > canvas.width) {
          boss.x = canvas.width - boss.width;
          boss.dir = -1;
        } else if (boss.x < 0) {
          boss.x = 0;
          boss.dir = 1;
        }
      }

      if (boss.y + boss.height > canvas.height) this.gameOver = true;
    }
  }

  // Lethal column under a firing Laser Core (#91).
  _beamRect(boss) {
    const cx = boss.x + boss.width / 2;
    const half = boss.width * 0.45;
    return { left: cx - half, right: cx + half, top: boss.y + boss.height };
  }

  _spawnInk(boss) {
    const scale = this._scale();
    const cx = boss.x + boss.width / 2;
    // Aim toward the player's current side with a gentle drift — the
    // glob is dodgeable once fired (no homing).
    const aim =
      Math.sign(this.player.x + this.player.width / 2 - cx) * 0.6 * scale;
    this.inkShots.push({
      x: cx,
      y: boss.y + boss.height,
      vx: aim,
      vy: INK_SPEED * scale,
      r: Math.max(6, 12 * scale),
      wobbleT: Math.random() * Math.PI * 2,
    });
  }

  // Ink globs: fall with a slight wobble; contact is lethal.
  _updateInkShots() {
    const player = this.player;
    const canvas = this.canvas;
    for (let i = this.inkShots.length - 1; i >= 0; i--) {
      const ink = this.inkShots[i];
      ink.wobbleT += 0.15;
      ink.x += ink.vx + Math.sin(ink.wobbleT) * 0.4;
      ink.y += ink.vy;

      if (
        ink.x + ink.r > player.x &&
        ink.x - ink.r < player.x + player.width &&
        ink.y + ink.r > player.y &&
        ink.y - ink.r < player.y + player.height
      ) {
        this._damagePlayer(20);
        this.inkShots.splice(i, 1);
        continue;
      }
      if (ink.y - ink.r > canvas.height) this.inkShots.splice(i, 1);
    }
  }

  // Kamikaze spawnlings (#90): dive at constant speed while easing
  // horizontally toward the player. Contact is lethal.
  _updateSpawnlings(scale) {
    const player = this.player;
    const canvas = this.canvas;
    for (let i = this.spawnlings.length - 1; i >= 0; i--) {
      const k = this.spawnlings[i];
      const targetVx =
        Math.sign(player.x + player.width / 2 - (k.x + k.width / 2)) * 1.5 * scale;
      k.vx += (targetVx - k.vx) * 0.05;
      k.x += k.vx;
      k.y += k.vy;

      if (
        k.x < player.x + player.width &&
        k.x + k.width > player.x &&
        k.y < player.y + player.height &&
        k.y + k.height > player.y
      ) {
        this._damagePlayer(25);
        this._createFireworks(k.x + k.width / 2, k.y + k.height / 2);
        this.spawnlings.splice(i, 1);
        continue;
      }
      if (k.y > canvas.height) this.spawnlings.splice(i, 1);
    }
  }

  _collideBullets() {
    for (let bIndex = this.bullets.length - 1; bIndex >= 0; bIndex--) {
      const bullet = this.bullets[bIndex];
      let hitAlien = false;

      for (let aIndex = this.aliens.length - 1; aIndex >= 0; aIndex--) {
        const alien = this.aliens[aIndex];
        if (
          bullet.x < alien.x + alien.width &&
          bullet.x + (bullet.width || BULLET_WIDTH) > alien.x &&
          bullet.y < alien.y + alien.height &&
          bullet.y + (bullet.height || BULLET_HEIGHT) > alien.y
        ) {
          this._createFireworks(alien.x, alien.y);
          this.audio?.alienHit();
          
          if (alien.hp > 1) {
            alien.hp--;
            alien.hitFlash = 5;
            if (!bullet.isLaser) {
              this.bullets.splice(bIndex, 1);
            }
            this.hits++;
            hitAlien = true;
            if (!bullet.isLaser) break;
          } else {
            this._maybeDropPowerUp(alien);
            this.aliens.splice(aIndex, 1);
            if (!bullet.isLaser) {
              this.bullets.splice(bIndex, 1);
            }
            this._addScore(10, alien.x + alien.width / 2, alien.y + alien.height / 2);
            this._stat("add", "totalKills");
            this._reportKill(alien.id); // shared kill (#81)
            this.hits++;
            hitAlien = true;
            if (!bullet.isLaser) break;
          }
        }
      }

      if (hitAlien || !this.bullets[bIndex]) continue;

      // Kamikaze spawnlings (#90): one-hit kills worth a small bounty.
      let hitSpawnling = false;
      for (let sIndex = this.spawnlings.length - 1; sIndex >= 0; sIndex--) {
        const k = this.spawnlings[sIndex];
        if (
          bullet.x < k.x + k.width &&
          bullet.x + (bullet.width || BULLET_WIDTH) > k.x &&
          bullet.y < k.y + k.height &&
          bullet.y + (bullet.height || BULLET_HEIGHT) > k.y
        ) {
          this._createFireworks(k.x, k.y);
          this.audio?.alienHit();
          this.spawnlings.splice(sIndex, 1);
          if (!bullet.isLaser) {
            this.bullets.splice(bIndex, 1);
          }
          this._addScore(SPAWNLING_SCORE, k.x + k.width / 2, k.y + k.height / 2, "#ffb46b");
          this._stat("add", "totalKills");
          this.hits++;
          hitSpawnling = true;
          if (!bullet.isLaser) break;
        }
      }
      if (hitSpawnling || !this.bullets[bIndex]) continue;

      // Ink globs: poppable for a small bounty.
      let hitInk = false;
      for (let iIndex = this.inkShots.length - 1; iIndex >= 0; iIndex--) {
        const ink = this.inkShots[iIndex];
        if (
          bullet.x < ink.x + ink.r &&
          bullet.x + (bullet.width || BULLET_WIDTH) > ink.x - ink.r &&
          bullet.y < ink.y + ink.r &&
          bullet.y + (bullet.height || BULLET_HEIGHT) > ink.y - ink.r
        ) {
          this.inkShots.splice(iIndex, 1);
          if (!bullet.isLaser) {
            this.bullets.splice(bIndex, 1);
          }
          this._addScore(INK_SCORE, ink.x, ink.y, "#b48ae0");
          this.hits++;
          hitInk = true;
          if (!bullet.isLaser) break;
        }
      }
      if (hitInk || !this.bullets[bIndex]) continue;

      for (let boIndex = this.bosses.length - 1; boIndex >= 0; boIndex--) {
        const boss = this.bosses[boIndex];
        if (
          bullet.x < boss.x + boss.width &&
          bullet.x + (bullet.width || BULLET_WIDTH) > boss.x &&
          bullet.y < boss.y + boss.height &&
          bullet.y + (bullet.height || BULLET_HEIGHT) > boss.y
        ) {
          this.audio?.alienHit();
          boss.hp--;
          if (!bullet.isLaser) {
            this.bullets.splice(bIndex, 1);
          }
          this.hits++;
          this._addScore(5, bullet.x, bullet.y, "#9be7ff");
          if (boss.hp <= 0) this._killBoss(boIndex);
          if (!bullet.isLaser) break;
        }
      }
    }
  }

  // `fromRemote` (#81): the other player landed the kill, so we
  // despawn/split to stay in sync but grant no score/stat and don't
  // re-broadcast (that would loop the event back).
  _killBoss(index, fromRemote = false) {
    const boss = this.bosses[index];
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height / 2;
    this._createFireworks(cx, cy);
    this._createFireworks(cx + 10, cy);
    if (!fromRemote) {
      const score =
        boss.type === "hive" ? HIVE_GEN_SCORE[boss.gen] : BOSS_STATS[boss.type].score;
      this._addScore(score, cx, cy, "#7af58f");
      // Every boss entity counts — hive splits are bosses in their own
      // right (own HP bar), so a full hive is worth several (#94).
      this._stat("add", "totalKills");
      this._stat("add", "bossKills");
      this._reportKill(boss.id); // shared kill (#81)
    }
    this.bosses.splice(index, 1);

    // Swarm Hive (#92): dying below max generation splits the mass
    // into two smaller, faster copies that fly apart, each with half
    // the HP and its own health bar.
    if (boss.type === "hive" && boss.gen < HIVE_MAX_GEN) {
      const gen = boss.gen + 1;
      const hp = Math.max(1, Math.round(boss.maxHp / 2));
      const sizeMul = HIVE_CHILD_SIZE ** gen;
      const childW = BOSS_STATS.hive.width * this._scale() * sizeMul;
      let childIndex = 0;
      for (const dir of [-1, 1]) {
        const child = this._makeBoss("hive", {
          // Children derive their id from the parent so both screens
          // agree on which split is which after a shared kill (#81).
          id: `${boss.id}.${childIndex++}`,
          gen,
          hp,
          dir,
          sizeMul,
          x: Math.max(
            0,
            Math.min(
              cx + dir * boss.width * 0.35 - childW / 2,
              this.canvas.width - childW,
            ),
          ),
          y: boss.y + boss.height * 0.15,
        });
        this.bosses.push(child);
        // Goo burst at each child so the split reads clearly.
        this._createFireworks(child.x + child.width / 2, child.y + child.height / 2);
      }
      this.scorePopups.push({
        x: cx,
        y: cy - 14,
        text: "SPLIT!",
        life: 40,
        color: "#8aff8a",
      });
    }
  }

  _collectPickups() {
    const player = this.player;
    const canvas = this.canvas;

    const scale = this._scale();
    this.powerUps.forEach((powerUp, index) => {
      powerUp.y += POWERUP_SPEED * scale;
      const collected =
        powerUp.x < player.x + player.width &&
        powerUp.x + POWERUP_SIZE > player.x &&
        powerUp.y < player.y + player.height &&
        powerUp.y + POWERUP_SIZE > player.y;

      if (collected) {
        if (powerUp.type === "weapon") {
          this._applyWeaponUpgrade();
          this.audio?.powerUp();
        } else if (powerUp.type === "shield") {
          this.playerShieldHp = 50;
          this.audio?.powerUpShield?.();
        } else if (powerUp.type === "drone") {
          this.droneTimer = 600; // 10 seconds at 60fps
          this.audio?.powerUpDrone?.();
        } else if (powerUp.type === "laser") {
          this.laserTimer = 300; // 5 seconds
          this.audio?.powerUpLaser?.();
        } else if (powerUp.type === "homing") {
          this.homingTimer = 300; // 5 seconds
          this.audio?.powerUpHoming?.();
        }
        this._addScore(50, powerUp.x, powerUp.y, "#00ffff");
        this.powerUps.splice(index, 1);
      } else if (powerUp.y > canvas.height) {
        this.powerUps.splice(index, 1);
      }
    });
  }

  // --- rendering -------------------------------------------------------

  _drawBackground() {
    const ctx = this.ctx;
    this.stars.forEach((star) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    this.planets.forEach((planet) => {
      const grad = ctx.createRadialGradient(
        planet.x - planet.r * 0.3,
        planet.y - planet.r * 0.3,
        planet.r * 0.1,
        planet.x,
        planet.y,
        planet.r,
      );
      grad.addColorStop(0, planet.color);
      grad.addColorStop(1, planet.glow);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Shared ship painter: the local player and the remote ghost (#80)
  // draw the same hull with different colors/alpha.
  _drawHull(px, py, pw, ph, { bodyTop, bodyBottom, cockpit, flame, alpha = 1, shadow = null }, type) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (shadow) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = shadow;
    }

    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, bodyTop);
    grad.addColorStop(1, bodyBottom);
    ctx.fillStyle = grad;

    ctx.beginPath();
    
    if (type === "cruiser") {
      // Bulky, heavy cruiser
      ctx.moveTo(px + pw * 0.5, py); // Nose
      ctx.lineTo(px + pw * 0.85, py + ph * 0.4); // Right bulk
      ctx.lineTo(px + pw, py + ph * 0.9); // Right thruster outer
      ctx.lineTo(px + pw * 0.7, py + ph); // Right thruster inner
      ctx.lineTo(px + pw * 0.5, py + ph * 0.8); // Center back
      ctx.lineTo(px + pw * 0.3, py + ph); // Left thruster inner
      ctx.lineTo(px, py + ph * 0.9); // Left thruster outer
      ctx.lineTo(px + pw * 0.15, py + ph * 0.4); // Left bulk
    } else if (type === "interceptor") {
      // Sleek swept-wing interceptor
      ctx.moveTo(px + pw * 0.5, py); // Pointy nose
      ctx.lineTo(px + pw, py + ph); // Swept right wing tip
      ctx.lineTo(px + pw * 0.6, py + ph * 0.8); // Right inner
      ctx.lineTo(px + pw * 0.5, py + ph); // Engine
      ctx.lineTo(px + pw * 0.4, py + ph * 0.8); // Left inner
      ctx.lineTo(px, py + ph); // Swept left wing tip
    } else {
      // Classic fighter
      ctx.moveTo(px + pw * 0.5, py); // Nose
      ctx.lineTo(px + pw * 0.8, py + ph * 0.6); // Right wing top
      ctx.lineTo(px + pw, py + ph); // Right wing bottom
      ctx.lineTo(px + pw * 0.7, py + ph * 0.8); // Right inner
      ctx.lineTo(px + pw * 0.3, py + ph * 0.8); // Left inner
      ctx.lineTo(px, py + ph); // Left wing bottom
      ctx.lineTo(px + pw * 0.2, py + ph * 0.6); // Left wing top
    }
    
    ctx.closePath();
    ctx.fill();

    // Thruster flame
    if (Math.random() > 0.3) {
      ctx.fillStyle = flame[Math.random() > 0.5 ? 0 : 1];
      ctx.beginPath();
      if (type === "cruiser") {
        ctx.moveTo(px + pw * 0.2, py + ph * 0.9);
        ctx.lineTo(px + pw * 0.3, py + ph + Math.random() * 15 + 5);
        ctx.lineTo(px + pw * 0.4, py + ph * 0.9);
        
        ctx.moveTo(px + pw * 0.6, py + ph * 0.9);
        ctx.lineTo(px + pw * 0.7, py + ph + Math.random() * 15 + 5);
        ctx.lineTo(px + pw * 0.8, py + ph * 0.9);
      } else {
        ctx.moveTo(px + pw * 0.4, py + ph * (type === "interceptor" ? 0.8 : 1));
        ctx.lineTo(px + pw * 0.5, py + ph + Math.random() * 15 + 5);
        ctx.lineTo(px + pw * 0.6, py + ph * (type === "interceptor" ? 0.8 : 1));
      }
      ctx.fill();
    }

    // Cockpit
    ctx.fillStyle = cockpit;
    ctx.beginPath();
    if (type === "cruiser") {
      ctx.ellipse(px + pw * 0.5, py + ph * 0.3, pw * 0.15, ph * 0.15, 0, 0, Math.PI * 2);
    } else if (type === "interceptor") {
      ctx.ellipse(px + pw * 0.5, py + ph * 0.5, pw * 0.08, ph * 0.3, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(px + pw * 0.5, py + ph * 0.4, pw * 0.1, ph * 0.25, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.restore();
  }

  _drawPlayer() {
    const { x, y, width, height } = this.player;
    
    // Hit flash overrides the ship colors
    const isFlashing = this.playerHitFlash > 0 && Math.floor(Date.now() / 50) % 2 === 0;
    const style = {
      bodyTop: isFlashing ? "#ff5555" : "#fff",
      bodyBottom: isFlashing ? "#ff0000" : "#888",
      cockpit: isFlashing ? "#ffcccc" : "#33ccff",
      flame: isFlashing ? ["#ff0000", "#ffaa00"] : ["orange", "cyan"],
      // Glow when weapon level is high, overridden by hit flash
      shadow: isFlashing ? "red" : this.weaponLevel === 2 ? "cyan" : this.weaponLevel === 3 ? "magenta" : null,
    };
    
    if (this.menuMode) {
      // Menu showcase: gameplay scale shrinks the ship to ~19px on
      // phones — draw it larger (same bottom anchor) so it reads
      // under the menu overlay on any screen.
      const w = Math.max(width * 1.6, 56);
      const h = w * (height / width);
      this._drawHull(x + width / 2 - w / 2, y + height - h, w, h, style, this.shipType);
      return;
    }
    this._drawHull(x, y, width, height, style, this.shipType);

    // Draw the player health bar directly underneath the ship natively
    const ctx = this.ctx;
    const hpRatio = Math.max(0, this.playerHp / this.playerMaxHp);
    const barWidth = width * 1.2;
    const barX = x + width / 2 - barWidth / 2;
    const barY = y + height + 6 * this._scale();
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(barX, barY, barWidth, 4 * this._scale());
    ctx.fillStyle = hpRatio > 0.4 ? "#33ccff" : "#ff3333";
    ctx.fillRect(barX, barY, barWidth * hpRatio, 4 * this._scale());
    
    if (this.playerShieldHp > 0) {
      const shieldRatio = Math.max(0, Math.min(1, this.playerShieldHp / 50));
      ctx.fillStyle = "#3399ff";
      ctx.fillRect(barX, barY - 4 * this._scale(), barWidth * shieldRatio, 3 * this._scale());
    }
  }

  // The other player's ship (#80): translucent and blue-tinted so it
  // never reads as your own, with their name floating above. Skipped
  // once their run has ended (terminal `over` snapshot).
  _drawGhost() {
    if (!this.ghost || this.menuMode) return;
    const view = sampleGhost(this.ghost, performance.now());
    if (!view || this.ghost.over) return;

    const scale = this._scale();
    const { width: pw, height: ph } = this.player;
    const py = view.y != null ? view.y * scale : this.player.y;
    const px = Math.max(0, Math.min(view.x * scale, this.canvas.width - pw));
    this._drawHull(px, py, pw, ph, {
      bodyTop: "#b8d4ff",
      bodyBottom: "#3c6cd6",
      cockpit: "#e0f0ff",
      flame: ["#6fa8ff", "#9fd0ff"],
      alpha: 0.5,
    }, this.ghost.shipType || "fighter");

    const ctx = this.ctx;

    if (this.ghost.isFiring) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#e0f0ff";
      ctx.shadowBlur = 8 * scale;
      ctx.shadowColor = "#9fd0ff";
      ctx.beginPath();
      // Draw a sleek muzzle flash ellipse at the nose
      ctx.ellipse(px + pw / 2, py - 4 * scale, 4 * scale, 8 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = `${Math.max(10, 12 * scale)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#9fd0ff";
    ctx.fillText(this.ghost.name, px + pw / 2, py - 6 * scale);
    ctx.restore();
  }

  _drawBullets() {
    const ctx = this.ctx;
    this.bullets.forEach((bullet) => {
      if (bullet.isLaser) {
        ctx.fillStyle = "#ff3399";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff3399";
      } else if (bullet.isHoming) {
        ctx.fillStyle = "#9933ff";
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "red";
        ctx.shadowBlur = 0;
      }
      ctx.fillRect(bullet.x, bullet.y, bullet.width || BULLET_WIDTH, bullet.height || BULLET_HEIGHT);
    });
    ctx.shadowBlur = 0;
  }

  _drawAliens() {
    const ctx = this.ctx;
    const frame = Math.floor(Date.now() / 300) % 2; // 0 or 1 for wiggle

    this.aliens.forEach((alien) => {
      const { x: ax, y: ay, width: aw, height: ah } = alien;

      if (alien.type === 0) {
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(ax + aw / 2, ay + ah / 2, aw / 2, Math.PI, 0);
        ctx.lineTo(ax + aw, ay + ah);
        if (frame === 0) {
          ctx.lineTo(ax + aw * 0.75, ay + ah * 0.7);
          ctx.lineTo(ax + aw * 0.5, ay + ah);
          ctx.lineTo(ax + aw * 0.25, ay + ah * 0.7);
        } else {
          ctx.lineTo(ax + aw * 0.75, ay + ah);
          ctx.lineTo(ax + aw * 0.5, ay + ah * 0.7);
          ctx.lineTo(ax + aw * 0.25, ay + ah);
        }
        ctx.lineTo(ax, ay + ah);
        ctx.fill();
        // Eyes
        ctx.fillStyle = "white";
        ctx.fillRect(ax + aw * 0.25, ay + ah * 0.3, aw * 0.15, ah * 0.2);
        ctx.fillRect(ax + aw * 0.6, ay + ah * 0.3, aw * 0.15, ah * 0.2);
        ctx.fillStyle = "black";
        ctx.fillRect(ax + aw * 0.3, ay + ah * 0.4, aw * 0.05, ah * 0.1);
        ctx.fillRect(ax + aw * 0.65, ay + ah * 0.4, aw * 0.05, ah * 0.1);
      } else if (alien.type === 1) {
        ctx.fillStyle = "#44ff44";
        ctx.beginPath();
        ctx.rect(ax + aw * 0.1, ay, aw * 0.8, ah * 0.6);
        // Antennas
        ctx.rect(ax + aw * 0.2, ay - ah * 0.2, aw * 0.1, ah * 0.2);
        ctx.rect(ax + aw * 0.7, ay - ah * 0.2, aw * 0.1, ah * 0.2);
        // Legs
        ctx.rect(ax + aw * 0.2, ay + ah * 0.6, aw * 0.2, ah * 0.4 - frame * ah * 0.1);
        ctx.rect(ax + aw * 0.6, ay + ah * 0.6, aw * 0.2, ah * 0.4 - (1 - frame) * ah * 0.1);
        ctx.fill();
        // Eyes
        ctx.fillStyle = "white";
        ctx.fillRect(ax + aw * 0.2, ay + ah * 0.2, aw * 0.2, ah * 0.2);
        ctx.fillRect(ax + aw * 0.6, ay + ah * 0.2, aw * 0.2, ah * 0.2);
        ctx.fillStyle = "black";
        ctx.fillRect(ax + aw * 0.25, ay + ah * 0.3, aw * 0.1, ah * 0.1);
        ctx.fillRect(ax + aw * 0.65, ay + ah * 0.3, aw * 0.1, ah * 0.1);
      } else {
        ctx.fillStyle = "#4444ff";
        ctx.beginPath();
        ctx.moveTo(ax + aw * 0.5, ay);
        ctx.lineTo(ax + aw, ay + ah * 0.5);
        ctx.lineTo(ax + aw * 0.8, ay + ah);
        if (frame === 0) {
          ctx.lineTo(ax + aw * 0.5, ay + ah * 0.8);
        } else {
          ctx.lineTo(ax + aw * 0.5, ay + ah);
        }
        ctx.lineTo(ax + aw * 0.2, ay + ah);
        ctx.lineTo(ax, ay + ah * 0.5);
        ctx.fill();
        // Cyclops eye
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(ax + aw * 0.5, ay + ah * 0.4, aw * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(ax + aw * 0.5, ay + ah * 0.4, aw * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  _drawBosses() {
    for (const boss of this.bosses) {
      if (boss.type === "mothership") this._drawMothership(boss);
      else if (boss.type === "lasercore") this._drawLaserCore(boss);
      else if (boss.type === "hive") this._drawHive(boss);
      else this._drawOctopus(boss);
      // Per-entity HP bars once the hive splits (#92) — the shared
      // HUD bar only shows the aggregate.
      if (this.bosses.length > 1) this._drawBossHpBar(boss);
    }
    this._drawSpawnlings();
    this._drawInkShots();
  }

  // Octo Commander ink globs: dark wobbling blobs with a glossy sheen.
  _drawInkShots() {
    const ctx = this.ctx;
    for (const ink of this.inkShots) {
      const squish = 1 + 0.15 * Math.sin(ink.wobbleT * 2);
      ctx.fillStyle = "rgba(150, 100, 220, 0.6)"; // halo
      ctx.beginPath();
      ctx.ellipse(ink.x, ink.y, ink.r * 1.5 * squish, ink.r * 1.5 / squish, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9a6ddb"; // lighter purple core
      ctx.beginPath();
      ctx.ellipse(ink.x, ink.y, ink.r * squish, ink.r / squish, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240, 220, 255, 0.9)"; // sheen
      ctx.beginPath();
      ctx.arc(ink.x - ink.r * 0.3, ink.y - ink.r * 0.3, Math.max(1, ink.r * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBossHpBar(boss) {
    const ctx = this.ctx;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    const y = boss.y - 7;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(boss.x, y, boss.width, 4);
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(boss.x, y, boss.width * ratio, 4);
  }

  // Massive armored saucer that launches kamikaze spawnlings (#90).
  _drawMothership(boss) {
    const ctx = this.ctx;
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height * 0.55;
    const now = Date.now() / 1000;

    // Hull
    const grad = ctx.createLinearGradient(boss.x, boss.y, boss.x, boss.y + boss.height);
    grad.addColorStop(0, "#8d98ad");
    grad.addColorStop(0.6, "#525c70");
    grad.addColorStop(1, "#2e3442");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, boss.width / 2, boss.height * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Command dome
    ctx.fillStyle = "#3a4358";
    ctx.beginPath();
    ctx.ellipse(cx, boss.y + boss.height * 0.32, boss.width * 0.22, boss.height * 0.3, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(140, 220, 255, 0.5)";
    ctx.beginPath();
    ctx.ellipse(cx, boss.y + boss.height * 0.3, boss.width * 0.13, boss.height * 0.16, 0, Math.PI, 0);
    ctx.fill();

    // Running lights along the rim, chasing
    const lightCount = 7;
    for (let i = 0; i < lightCount; i++) {
      const t = i / (lightCount - 1);
      const lx = boss.x + boss.width * (0.12 + t * 0.76);
      const on = Math.floor(now * 4) % lightCount === i;
      ctx.fillStyle = on ? "#ffe066" : "rgba(255, 224, 102, 0.25)";
      ctx.beginPath();
      ctx.arc(lx, cy + boss.height * 0.18, Math.max(1.5, boss.width * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }

    // Hangar bay glow: intensifies as the next launch approaches.
    const charge = 1 - boss.spawnT / SPAWNLING_INTERVAL;
    ctx.fillStyle = `rgba(255, 140, 60, ${(0.15 + 0.45 * charge).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx, boss.y + boss.height * 0.85, boss.width * 0.16, boss.height * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sleek geometric diamond that fires a telegraphed vertical beam (#91).
  _drawLaserCore(boss) {
    const ctx = this.ctx;
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height / 2;
    const charging = boss.phase === "charging";
    const firing = boss.phase === "firing";
    const chargeProgress = charging ? 1 - boss.phaseT / BEAM_CHARGE : 0;
    const now = Date.now() / 1000;

    // Telegraph: pulsing guide line while charging (#91 — players must
    // read this and dodge before the beam fires).
    if (charging) {
      const pulse = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now * 24)) * chargeProgress;
      ctx.strokeStyle = `rgba(255, 80, 120, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, boss.y + boss.height);
      ctx.lineTo(cx, this.canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Beam: a wide lethal column while firing.
    if (firing) {
      const beam = this._beamRect(boss);
      const grad = ctx.createLinearGradient(beam.left, 0, beam.right, 0);
      grad.addColorStop(0, "rgba(255, 60, 120, 0)");
      grad.addColorStop(0.5, "rgba(255, 60, 120, 0.75)");
      grad.addColorStop(1, "rgba(255, 60, 120, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(beam.left, beam.top, beam.right - beam.left, this.canvas.height - beam.top);
      // White-hot core
      ctx.fillStyle = `rgba(255, 235, 245, ${(0.75 + 0.25 * Math.sin(now * 40)).toFixed(2)})`;
      const coreHalf = (beam.right - beam.left) * 0.16;
      ctx.fillRect(cx - coreHalf, beam.top, coreHalf * 2, this.canvas.height - beam.top);
    }

    // Diamond hull
    ctx.save();
    if (charging || firing) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#ff3c78";
    }
    const grad = ctx.createLinearGradient(boss.x, boss.y, boss.x, boss.y + boss.height);
    grad.addColorStop(0, "#e8ecf7");
    grad.addColorStop(0.5, "#7b87a8");
    grad.addColorStop(1, "#39415a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, boss.y); // top
    ctx.lineTo(boss.x + boss.width, cy); // right
    ctx.lineTo(cx, boss.y + boss.height); // bottom
    ctx.lineTo(boss.x, cy); // left
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Core: grows and brightens with charge, blazing while firing.
    const coreR =
      boss.width * (0.1 + 0.08 * chargeProgress + (firing ? 0.1 : 0));
    const coreAlpha = firing ? 1 : 0.45 + 0.55 * chargeProgress;
    ctx.fillStyle = `rgba(255, 60, 120, ${coreAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 230, 240, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Gooey biological mass that splits when killed (#92).
  _drawHive(boss) {
    const ctx = this.ctx;
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height / 2;
    const rx = boss.width / 2;
    const ry = boss.height / 2;
    const hue = 110 - boss.gen * 18; // greener core, sicklier splits

    // Wobbly blob outline: radius modulated around the perimeter.
    ctx.fillStyle = `hsla(${hue}, 65%, 32%, 0.92)`;
    ctx.beginPath();
    const SEGS = 14;
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(boss.wobbleT + i * 2.1);
      const px = cx + Math.cos(a) * rx * wob;
      const py = cy + Math.sin(a) * ry * wob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Inner membrane + nucleus
    ctx.fillStyle = `hsla(${hue}, 70%, 45%, 0.7)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${hue + 30}, 80%, 62%, 0.9)`;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.sin(boss.wobbleT * 0.7) * rx * 0.1,
      cy + Math.cos(boss.wobbleT * 0.9) * ry * 0.1,
      rx * 0.28,
      ry * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Drifting bubbles in the goo
    for (let i = 0; i < 3; i++) {
      const bx = cx + Math.sin(boss.wobbleT * 1.3 + i * 2.4) * rx * 0.4;
      const by = cy + Math.cos(boss.wobbleT * 1.1 + i * 1.9) * ry * 0.4;
      ctx.fillStyle = `hsla(${hue + 40}, 80%, 70%, 0.5)`;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(1.5, rx * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }

    // Angry eyes
    ctx.fillStyle = "#1a0f1e";
    const eyeR = Math.max(1.5, rx * 0.09);
    ctx.beginPath();
    ctx.arc(cx - rx * 0.28, cy - ry * 0.12, eyeR, 0, Math.PI * 2);
    ctx.arc(cx + rx * 0.28, cy - ry * 0.12, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kamikaze spawnlings (#90): small daggers diving at the player.
  _drawSpawnlings() {
    const ctx = this.ctx;
    for (const k of this.spawnlings) {
      const cx = k.x + k.width / 2;
      // Exhaust trail above (they fly downward)
      if (Math.random() > 0.4) {
        ctx.fillStyle = Math.random() > 0.5 ? "orange" : "#ff5d5d";
        ctx.beginPath();
        ctx.moveTo(cx - k.width * 0.12, k.y);
        ctx.lineTo(cx, k.y - Math.random() * k.height * 0.7 - 2);
        ctx.lineTo(cx + k.width * 0.12, k.y);
        ctx.fill();
      }
      // Hull: downward-pointing dagger
      const grad = ctx.createLinearGradient(k.x, k.y, k.x, k.y + k.height);
      grad.addColorStop(0, "#b8642e");
      grad.addColorStop(1, "#ffb46b");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, k.y + k.height); // nose (down)
      ctx.lineTo(k.x + k.width, k.y + k.height * 0.25);
      ctx.lineTo(cx, k.y + k.height * 0.45);
      ctx.lineTo(k.x, k.y + k.height * 0.25);
      ctx.closePath();
      ctx.fill();
      // Canopy glint
      ctx.fillStyle = "#ffe9c9";
      ctx.beginPath();
      ctx.arc(cx, k.y + k.height * 0.55, Math.max(1, k.width * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The classic wave-1 octopus.
  _drawOctopus(boss) {
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = 0.85;

    const cx = boss.x + boss.width / 2;
    const headRadius = boss.width * 0.28;
    const headCenterY = boss.y + boss.height * 0.45;

    // Octopus head
    ctx.fillStyle = boss.bodyColor;
    ctx.beginPath();
    ctx.arc(cx, headCenterY, headRadius, Math.PI, 0);
    ctx.lineTo(boss.x + boss.width * 0.78, boss.y + boss.height * 0.72);
    ctx.quadraticCurveTo(
      cx,
      boss.y + boss.height * 0.92,
      boss.x + boss.width * 0.22,
      boss.y + boss.height * 0.72,
    );
    ctx.closePath();
    ctx.fill();

    // Head highlight
    ctx.fillStyle = boss.highlightColor;
    ctx.beginPath();
    ctx.arc(boss.x + boss.width * 0.42, boss.y + boss.height * 0.33, headRadius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeY = boss.y + boss.height * 0.52;
    const leftEyeX = boss.x + boss.width * 0.42;
    const rightEyeX = boss.x + boss.width * 0.58;
    const eyeRadius = boss.width * 0.045;

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.arc(rightEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, eyeRadius * 0.45, 0, Math.PI * 2);
    ctx.arc(rightEyeX, eyeY, eyeRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Tentacles
    ctx.strokeStyle = boss.tentacleColor;
    ctx.lineWidth = Math.max(2, boss.width * 0.04);
    const baseY = boss.y + boss.height * 0.72;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const startX = boss.x + boss.width * (0.2 + t * 0.6);
      const swing = (i % 2 === 0 ? -1 : 1) * boss.width * 0.05;
      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      ctx.bezierCurveTo(
        startX + swing,
        baseY + boss.height * 0.18,
        startX - swing,
        baseY + boss.height * 0.3,
        startX,
        baseY + boss.height * 0.42,
      );
      ctx.stroke();
    }
    ctx.restore();

  }

  _drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach((particle, index) => {
      ctx.fillStyle = particle.color;
      if (particle.width) {
        ctx.fillRect(particle.x, particle.y, particle.width, particle.height || particle.width);
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size || 2, 0, Math.PI * 2);
        ctx.fill();
      }

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.1;
      particle.life--;

      if (particle.life <= 0) this.particles.splice(index, 1);
    });
  }

  _drawPowerUps() {
    const ctx = this.ctx;
    this.powerUps.forEach((powerUp) => {
      let color = "cyan";
      let text = "W";
      if (powerUp.type === "shield") { color = "#3399ff"; text = "S"; }
      else if (powerUp.type === "drone") { color = "#00ff88"; text = "D"; }
      else if (powerUp.type === "laser") { color = "#ff3399"; text = "L"; }
      else if (powerUp.type === "homing") { color = "#9933ff"; text = "H"; }
      
      ctx.fillStyle = color;
      ctx.fillRect(powerUp.x, powerUp.y, POWERUP_SIZE, POWERUP_SIZE);
      
      ctx.fillStyle = "black";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, powerUp.x + POWERUP_SIZE / 2, powerUp.y + POWERUP_SIZE * 0.75);
    });
  }

  _drawDrones() {
    if (this.droneTimer <= 0) return;
    const ctx = this.ctx;
    const scale = this._scale();

    ctx.fillStyle = "#00ff88";
    this.drones.forEach(drone => {
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y - 6 * scale);
      ctx.lineTo(drone.x + 6 * scale, drone.y + 4 * scale);
      ctx.lineTo(drone.x - 6 * scale, drone.y + 4 * scale);
      ctx.fill();
    });
  }

  _drawScorePopups() {
    const ctx = this.ctx;
    const scale = this._scale();
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const popup = this.scorePopups[i];
      popup.y -= 0.85;
      popup.life--;

      ctx.save();
      ctx.globalAlpha = Math.max(popup.life / 32, 0);
      ctx.font = `${14 * scale}px Arial`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(popup.text, popup.x, popup.y);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, popup.x, popup.y);
      ctx.restore();

      if (popup.life <= 0) this.scorePopups.splice(i, 1);
    }
  }

  // --- HUD bridge (#74) --------------------------------------------------

  // Pushes a snapshot to React whenever a displayed value changes.
  // The legacy game drew these as canvas text every frame.
  _publishHud() {
    if (this.scoreFlashFrames > 0) this.scoreFlashFrames--;
    const hud = {
      score: this.score,
      wave: this.waveNumber,
      weaponLevel: this.weaponLevel,
      shots: this.bulletsShot,
      hits: this.hits,
      // Aggregated across all live bosses — the hive splits into
      // several (#92); each split also has its own on-canvas bar.
      bossHp: this.bosses.reduce((sum, b) => sum + b.hp, 0),
      bossMaxHp: this.bosses.reduce((sum, b) => sum + b.maxHp, 0),
      bossName: this.bosses.length
        ? BOSS_NAMES[this.bosses[0].type] +
          (this.bosses.length > 1 ? ` ×${this.bosses.length}` : "")
        : "",
      comboCount: this.comboTimerFrames > 0 ? this.comboCount : 0,
      comboMultiplier:
        this.comboTimerFrames > 0 ? this._comboMultiplier(this.comboCount) : 1,
      droneTimer: this.droneTimer,
      laserTimer: this.laserTimer,
      homingTimer: this.homingTimer,
    };
    const last = this._lastHud;
    if (last && Object.keys(hud).every((k) => hud[k] === last[k])) return;
    this._lastHud = hud;
    this.onHud(hud);
  }

  hitRate() {
    return this.bulletsShot > 0 ? ((this.hits / this.bulletsShot) * 100).toFixed(1) : 0;
  }

  // --- loop --------------------------------------------------------------

  _startLoop() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  _loop() {
    if (this.gameOver) {
      // The loop parks here; React shows the game-over overlay and
      // restart() starts a fresh run. The forced final snapshot tells
      // the peer this ship is done, so its ghost fades instead of
      // freezing mid-screen (#80).
      this._broadcastState(true);
      this._running = false;
      this._publishHud();
      this.onGameOver({
        score: this.score,
        hitRate: this.hitRate(),
        hits: this.hits,
        bestCombo: this.runBestCombo,
        bestMultiplier: this._comboMultiplier(this.runBestCombo),
      });
      return;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawBackground();
    this._drawGhost(); // under the local ship (#80)
    this._drawPlayer();
    this._drawDrones();
    this._drawBullets();
    this._drawPowerUps();
    this._drawBosses();
    this._drawAliens();
    this._drawParticles();
    this._drawScorePopups();

    if (!this.paused) {
      this._update();
      this._publishHud();

      // Sector cleared!
      if (!this.menuMode && this.aliens.length === 0 && this.bosses.length === 0) {
        if (!this.hyperdriveState) {
          this._stat("add", "wavesCleared");
          if (this._waveDamageFree) this._stat("add", "flawlessWaves");
          this._waveDamageFree = true;
          this.hyperdriveState = "jumping";
          this._hyperdriveStart = performance.now();
        }
      }
    }

    this._raf = requestAnimationFrame(this._loop);
  }
}
