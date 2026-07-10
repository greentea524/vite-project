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

// Base design resolution; everything scales from an 800px-wide board.
const BASE_WIDTH = 800;

const BULLET_SPEED = 7;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 10;
const SHOOT_COOLDOWN_MS = 200;

const ALIEN_WIDTH = 30;
const ALIEN_HEIGHT = 20;
const ALIEN_SPEED = 1;

const BOSS_MAX_HP = 12;

const PARTICLE_COUNT = 20;
const PARTICLE_LIFETIME = 30;

const POWERUP_SIZE = 16;
const POWERUP_SPEED = 2;
const POWERUP_DROP_CHANCE = 0.15;

const COIN_RADIUS = 7;
const COIN_SPEED = 2.5;
const COIN_DROP_CHANCE = 0.35;
const COIN_VALUE = 25;

const COMBO_WINDOW_FRAMES = 90;
const COMBO_STEP_HITS = 3;
const MAX_COMBO_MULTIPLIER = 6;

export const WEAPON_NAMES = { 1: "Single Shot", 2: "Dual Missile", 3: "Triple Shot" };

export class InvasionEngine {
  // `wrapper` is the sizing container (the component's game area);
  // callbacks: onHud(hud) fires when any HUD value changes,
  // onGameOver({score, hitRate}) once per game end.
  constructor(canvas, wrapper, { audio, onHud, onGameOver } = {}) {
    this.canvas = canvas;
    canvas.__engine = this; // debug/testing handle (matches platformer)
    this.ctx = canvas.getContext("2d");
    this.wrapper = wrapper;
    this.audio = audio;
    this.onHud = onHud ?? (() => {});
    this.onGameOver = onGameOver ?? (() => {});

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

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);

    this._resetRun();
  }

  // --- lifecycle -------------------------------------------------------

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

  _resetRun() {
    this.bullets = [];
    this.aliens = [];
    this.particles = [];
    this.powerUps = [];
    this.coins = [];
    this.scorePopups = [];
    this.stars = [];
    this.planets = [];
    this.boss = null;
    this.alienDirection = 1;
    this.score = 0;
    this.scoreFlashFrames = 0;
    this.comboCount = 0;
    this.comboTimerFrames = 0;
    this.bulletsShot = 0;
    this.hits = 0;
    this.coinsCollected = 0;
    this.weaponLevel = 1;
    this.waveNumber = 1;
    this.gameOver = false;
    this._wantsToShoot = false;
    this._canShoot = true;
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
      window.innerHeight * 0.78 - reservedControlsHeight - verticalPadding,
    );
    const aspectRatio = isMobile ? 800 / 900 : 800 / 600;

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
    this.player.width = 40 * scale;
    this.player.height = 20 * scale;
    this.player.speed = 5 * scale;
    this.player.y = canvas.height - this.player.height - 10;
    this.player.x = canvas.width / 2 - this.player.width / 2;

    this.aliens.length = 0;
    this._createAliens();
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
    const columns = Math.max(
      1,
      Math.floor((this.canvas.width - sidePadding * 2 + gap) / step),
    );

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < columns; col++) {
        this.aliens.push({
          x: sidePadding + col * step,
          y: sidePadding + row * (h + gap),
          width: w,
          height: h,
          type: row % 3,
        });
      }
    }

    this._createBoss();
  }

  _createBoss() {
    const scale = this._scale();
    const width = 90 * scale;
    const hue = Math.floor(Math.random() * 360);
    this.boss = {
      x: this.canvas.width / 2 - width / 2,
      y: 8 * scale,
      width,
      height: 30 * scale,
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      bodyColor: `hsl(${hue}, 65%, 38%)`,
      highlightColor: `hsl(${hue}, 70%, 62%)`,
      tentacleColor: `hsl(${hue}, 72%, 32%)`,
    };
  }

  _setupBackground() {
    const scale = this._scale();
    this.stars.length = 0;
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: (Math.random() * 1.5 + 0.5) * scale,
        opacity: Math.random(),
        speed: (Math.random() * 0.5 + 0.1) * scale,
      });
    }
    this.planets.length = 0;
    this.planets.push({
      x: Math.random() * this.canvas.width,
      y: Math.random() * (this.canvas.height / 2),
      r: (Math.random() * 30 + 20) * scale,
      color: `hsl(${Math.random() * 360}, 60%, 40%)`,
      glow: `hsl(${Math.random() * 360}, 60%, 20%)`,
      speed: 0.05 * scale,
    });
  }

  _createFireworks(x, y) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
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
    this.weaponLevel = Math.min(3, this.weaponLevel + 1);
    // Max weapon reached: clear pending pickups; kills drop coins now.
    if (this.weaponLevel === 3) this.powerUps.length = 0;
  }

  _shootBullet() {
    const p = this.player;
    const spawn = (fx) =>
      this.bullets.push({
        x: p.x + p.width * fx - BULLET_WIDTH / 2,
        y: p.y - BULLET_HEIGHT,
      });

    if (this.weaponLevel === 3) {
      spawn(0.2);
      spawn(0.5);
      spawn(0.8);
    } else if (this.weaponLevel === 2) {
      spawn(0.25);
      spawn(0.75);
    } else {
      spawn(0.5);
    }

    this.bulletsShot += this.weaponLevel;
    this._canShoot = false;
    clearTimeout(this._shootTimer);
    this._shootTimer = setTimeout(() => (this._canShoot = true), SHOOT_COOLDOWN_MS);
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
      bullet.y -= BULLET_SPEED;
      if (bullet.y < 0) this.bullets.splice(index, 1);
    });

    let hitEdge = false;
    this.aliens.forEach((alien) => {
      alien.x += ALIEN_SPEED * this.alienDirection;
      if (alien.x + alien.width > canvas.width || alien.x < 0) hitEdge = true;
      if (alien.y + alien.height > canvas.height) this.gameOver = true;
    });

    if (this.boss) {
      this.boss.x += ALIEN_SPEED * 0.7 * this.alienDirection;
      if (this.boss.x + this.boss.width > canvas.width || this.boss.x < 0) hitEdge = true;
      if (this.boss.y + this.boss.height > canvas.height) this.gameOver = true;
    }

    if (hitEdge) {
      this.alienDirection *= -1;
      this.aliens.forEach((alien) => (alien.y += 20));
      if (this.boss) this.boss.y += 12;
    }

    this._collideBullets();
    this._collectPickups();
  }

  _collideBullets() {
    for (let bIndex = this.bullets.length - 1; bIndex >= 0; bIndex--) {
      const bullet = this.bullets[bIndex];
      let hitAlien = false;

      for (let aIndex = this.aliens.length - 1; aIndex >= 0; aIndex--) {
        const alien = this.aliens[aIndex];
        if (
          bullet.x < alien.x + alien.width &&
          bullet.x + BULLET_WIDTH > alien.x &&
          bullet.y < alien.y + alien.height &&
          bullet.y + BULLET_HEIGHT > alien.y
        ) {
          this._createFireworks(alien.x, alien.y);
          this.audio?.alienHit();
          if (this.weaponLevel < 3 && Math.random() < POWERUP_DROP_CHANCE) {
            this.powerUps.push({
              x: alien.x + alien.width / 2 - POWERUP_SIZE / 2,
              y: alien.y + alien.height / 2 - POWERUP_SIZE / 2,
            });
          } else if (this.weaponLevel === 3 && Math.random() < COIN_DROP_CHANCE) {
            this.coins.push({
              x: alien.x + alien.width / 2,
              y: alien.y + alien.height / 2,
            });
          }
          this.aliens.splice(aIndex, 1);
          this.bullets.splice(bIndex, 1);
          this._addScore(10, alien.x + alien.width / 2, alien.y + alien.height / 2);
          this.hits++;
          hitAlien = true;
          break;
        }
      }

      if (hitAlien || !this.bullets[bIndex]) continue;

      const boss = this.boss;
      if (
        boss &&
        bullet.x < boss.x + boss.width &&
        bullet.x + BULLET_WIDTH > boss.x &&
        bullet.y < boss.y + boss.height &&
        bullet.y + BULLET_HEIGHT > boss.y
      ) {
        this.audio?.alienHit();
        boss.hp--;
        this.bullets.splice(bIndex, 1);
        this.hits++;
        this._addScore(5, bullet.x, bullet.y, "#9be7ff");

        if (boss.hp <= 0) {
          this._createFireworks(boss.x + boss.width / 2, boss.y + boss.height / 2);
          this._createFireworks(boss.x + boss.width / 2 + 10, boss.y + boss.height / 2);
          this._addScore(120, boss.x + boss.width / 2, boss.y + boss.height / 2, "#7af58f");
          this.boss = null;
        }
      }
    }
  }

  _collectPickups() {
    const player = this.player;
    const canvas = this.canvas;

    this.powerUps.forEach((powerUp, index) => {
      powerUp.y += POWERUP_SPEED;
      const collected =
        powerUp.x < player.x + player.width &&
        powerUp.x + POWERUP_SIZE > player.x &&
        powerUp.y < player.y + player.height &&
        powerUp.y + POWERUP_SIZE > player.y;

      if (collected) {
        this._applyWeaponUpgrade();
        this.audio?.powerUp();
        this.powerUps.splice(index, 1);
      } else if (powerUp.y > canvas.height) {
        this.powerUps.splice(index, 1);
      }
    });

    this.coins.forEach((coin, index) => {
      coin.y += COIN_SPEED;
      const collected =
        coin.x + COIN_RADIUS > player.x &&
        coin.x - COIN_RADIUS < player.x + player.width &&
        coin.y + COIN_RADIUS > player.y &&
        coin.y - COIN_RADIUS < player.y + player.height;

      if (collected) {
        this._addScore(COIN_VALUE, coin.x, coin.y, "#ffe066", false);
        this.coinsCollected++;
        this.audio?.coin();
        this.coins.splice(index, 1);
      } else if (coin.y - COIN_RADIUS > canvas.height) {
        this.coins.splice(index, 1);
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

  _drawPlayer() {
    const ctx = this.ctx;
    const { x: px, y: py, width: pw, height: ph } = this.player;

    // Thruster flame
    if (Math.random() > 0.3) {
      ctx.fillStyle = Math.random() > 0.5 ? "orange" : "cyan";
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.4, py + ph);
      ctx.lineTo(px + pw * 0.5, py + ph + Math.random() * 15 + 5);
      ctx.lineTo(px + pw * 0.6, py + ph);
      ctx.fill();
    }

    // Glow when weapon level is high
    if (this.weaponLevel > 1) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.weaponLevel === 2 ? "cyan" : "magenta";
    }

    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(1, "#888");
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(px + pw * 0.5, py); // Nose
    ctx.lineTo(px + pw * 0.8, py + ph * 0.6); // Right wing top
    ctx.lineTo(px + pw, py + ph); // Right wing bottom
    ctx.lineTo(px + pw * 0.7, py + ph * 0.8); // Right inner
    ctx.lineTo(px + pw * 0.3, py + ph * 0.8); // Left inner
    ctx.lineTo(px, py + ph); // Left wing bottom
    ctx.lineTo(px + pw * 0.2, py + ph * 0.6); // Left wing top
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = "#33ccff";
    ctx.beginPath();
    ctx.ellipse(px + pw * 0.5, py + ph * 0.4, pw * 0.1, ph * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  }

  _drawBullets() {
    this.ctx.fillStyle = "red";
    this.bullets.forEach((bullet) => {
      this.ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });
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

  _drawBoss() {
    const boss = this.boss;
    if (!boss) return;
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

    const hpRatio = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = "#222";
    ctx.fillRect(boss.x, boss.y - 8, boss.width, 4);
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(boss.x, boss.y - 8, boss.width * hpRatio, 4);
  }

  _drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach((particle, index) => {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
      ctx.fill();

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.1;
      particle.life--;

      if (particle.life <= 0) this.particles.splice(index, 1);
    });
  }

  _drawPowerUps() {
    const ctx = this.ctx;
    ctx.fillStyle = "cyan";
    this.powerUps.forEach((powerUp) => {
      ctx.fillRect(powerUp.x, powerUp.y, POWERUP_SIZE, POWERUP_SIZE);
      ctx.fillStyle = "black";
      ctx.fillRect(powerUp.x + 6, powerUp.y + 3, 4, 10);
      ctx.fillRect(powerUp.x + 3, powerUp.y + 6, 10, 4);
      ctx.fillStyle = "cyan";
    });
  }

  _drawCoins() {
    const ctx = this.ctx;
    this.coins.forEach((coin) => {
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, COIN_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#7a5a00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, COIN_RADIUS - 1, 0, Math.PI * 2);
      ctx.stroke();
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
      coins: this.coinsCollected,
      shots: this.bulletsShot,
      hits: this.hits,
      bossHp: this.boss ? this.boss.hp : 0,
      comboCount: this.comboTimerFrames > 0 ? this.comboCount : 0,
      comboMultiplier:
        this.comboTimerFrames > 0 ? this._comboMultiplier(this.comboCount) : 1,
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
      // restart() starts a fresh run.
      this._running = false;
      this._publishHud();
      this.onGameOver({ score: this.score, hitRate: this.hitRate() });
      return;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawBackground();
    this._drawPlayer();
    this._drawBullets();
    this._drawPowerUps();
    this._drawCoins();
    this._drawBoss();
    this._drawAliens();
    this._drawParticles();
    this._drawScorePopups();
    this._update();
    this._publishHud();

    if (this.aliens.length === 0) {
      this.waveNumber++;
      this._createAliens();
    }

    this._raf = requestAnimationFrame(this._loop);
  }
}
