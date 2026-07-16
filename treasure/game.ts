// Treasure Hunt — TypeScript + Three.js port of the Java/JOGL original
// (assign3, games.hunt.TreasureGame). Game rules per KAN-122:
// 15 rings (+1 each), 10 bombs (−1), 5 ghosts (score → −5);
// life = score + 5; lose at life ≤ 0, win at score 10.

import * as THREE from "three";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GameAudio } from "./audio";

const RINGS_MAX = 15;
const BOMBS_MAX = 10;
const GHOSTS_MAX = 5;
const RANDOM_BOUND_MAX = 100;
const WIN_SCORE = 10;
const START_LIFE = 5;

// Original bounding spheres: player radius 2, items radius 1.
const PLAYER_BOUND = 2;
const ITEM_BOUND = 1;

// Original moved 0.5 units per repeat-while-down tick (~60/s) → 30 u/s.
const MOVE_SPEED = 30;
// Original mouse-look: (pixels / 10) degrees of rotation.
const LOOK_SPEED = Math.PI / 180 / 10;

// Gamepad mapping from the original JInput GamePad class:
// button 0 = left, 1 = back, 2 = right, 3 = forward.
const PAD_LEFT = 0;
const PAD_BACK = 1;
const PAD_RIGHT = 2;
const PAD_FORWARD = 3;

type ItemType = "ring" | "bomb" | "ghost";

interface Item {
  object: THREE.Object3D;
  type: ItemType;
  bound: THREE.Sphere;
}

export interface Hud {
  score: HTMLElement;
  left: HTMLElement;
  life: HTMLElement;
  banner: HTMLElement;
  bannerText: HTMLElement;
}

export class TreasureGame {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private lastTick = 0;
  private readonly audio = new GameAudio();
  private readonly hud: Hud;

  private readonly keys = new Set<string>();
  private dragging = false;
  private yaw = 0;
  private pitch = 0;

  private prototypes: Record<ItemType, THREE.Object3D> | null = null;
  private items: Item[] = [];
  private playerBound = new THREE.Sphere(new THREE.Vector3(), PLAYER_BOUND);

  private score = 0;
  private treasures = 0;
  private treasuresFound = 0;
  private running = false;
  gameOver = false;

  constructor(container: HTMLElement, hud: Hud) {
    this.hud = hud;
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Size from the container (not window.innerWidth, which can be 0 at
    // module-eval time in embedded panes); tracks all later resizes too.
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    resize();
    new ResizeObserver(resize).observe(container);

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("mousemove", (e) => this.onMouseMove(e));

    // Mouse-look prefers pointer lock, but falls back to click-and-drag
    // when the browser denies it (or the user declined). Clicking the
    // canvas also re-attempts the lock.
    const canvas = this.renderer.domElement;
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      if (document.pointerLockElement !== canvas) this.requestLook();
    });
    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });
    document.addEventListener("pointerlockerror", () => {
      console.warn(
        "Treasure Hunt: pointer lock unavailable — using click-and-drag look.",
      );
    });

    // Skybox — the original TextureCube used the space*.jpg set.
    this.scene.background = new THREE.CubeTextureLoader().load([
      "skybox/space1.jpg",
      "skybox/space2.jpg",
      "skybox/space3.jpg",
      "skybox/space4.jpg",
      "skybox/space5.jpg",
      "skybox/space6.jpg",
    ]);

    // The fixed-function pipeline lit everything with a default light;
    // Phong materials from MTLLoader need explicit lights.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(50, 120, 80);
    this.scene.add(sun);
  }

  /** Loads all models; call before start(). */
  async load(): Promise<void> {
    const [terrain, ring, bomb, ghost] = await Promise.all([
      loadObj("models/terrain.obj", "models/terrain.mtl"),
      loadObj("models/ring.obj", "models/ring.mtl"),
      loadObj("models/box.obj", "models/box.mtl"),
      loadObj("models/boo.obj", null),
    ]);

    // Original: terrain.rotate(90°, X); terrain.translate(30, -100, 50).
    terrain.rotation.x = Math.PI / 2;
    terrain.position.set(30, -100, 50);
    terrain.scale.setScalar(10); // single quad in the .obj; scale to read as ground
    this.scene.add(terrain);

    // Original: ring.rotate(90°, X) at spawn time.
    ring.rotation.x = Math.PI / 2;

    // boo.obj ships with its material commented out — ghost-white it.
    const ghostMaterial = new THREE.MeshPhongMaterial({
      color: 0xf4f4ff,
      transparent: true,
      opacity: 0.8,
    });
    ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = ghostMaterial;
    });

    this.prototypes = { ring, bomb, ghost };
  }

  start(): void {
    if (!this.prototypes) throw new Error("call load() first");
    if (this.gameOver) return;

    if (!this.running) {
      if (this.items.length === 0) {
        // Host-only spawning in the original; single-player here (phase 2
        // multiplayer receives these from the relay instead).
        for (let i = 0; i < RINGS_MAX; i++) this.addRandom("ring");
        for (let i = 0; i < BOMBS_MAX; i++) this.addRandom("bomb");
        for (let i = 0; i < GHOSTS_MAX; i++) this.addRandom("ghost");
        this.updateHud();
      }
      this.running = true;
      this.lastTick = performance.now();
      this.renderer.setAnimationLoop(() => this.tick());
    }
    this.audio.unlock();
    this.audio.startBgm();
  }

  pause(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.audio.stopBgm();
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    if (!this.gameOver) {
      this.moveCamera(dt);
      this.checkCollisions();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Ask for pointer lock; failure is fine (drag-look still works). */
  requestLook(): void {
    // Older engines type requestPointerLock() as void; modern ones
    // return a rejectable promise — swallow either way.
    const result = this.renderer.domElement.requestPointerLock() as
      | Promise<void>
      | undefined;
    void result?.catch(() => {});
  }

  private onMouseMove(e: MouseEvent): void {
    // Look around while pointer-locked (replaces the AWT Robot
    // recentering hack from MouseRotationAction) or while dragging.
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && !this.dragging) return;
    if (this.gameOver || !this.running) return;
    this.yaw -= e.movementX * LOOK_SPEED;
    this.pitch -= e.movementY * LOOK_SPEED;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"),
    );
  }

  private moveCamera(dt: number): void {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has("KeyW")) forward += 1;
    if (this.keys.has("KeyS")) forward -= 1;
    if (this.keys.has("KeyA")) strafe -= 1;
    if (this.keys.has("KeyD")) strafe += 1;

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      if (pad.buttons[PAD_FORWARD]?.pressed) forward += 1;
      if (pad.buttons[PAD_BACK]?.pressed) forward -= 1;
      if (pad.buttons[PAD_LEFT]?.pressed) strafe -= 1;
      if (pad.buttons[PAD_RIGHT]?.pressed) strafe += 1;
    }

    if (forward === 0 && strafe === 0) return;

    // Free-fly, like the original: forward follows the full view
    // direction (including vertical), strafe follows the right axis.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3()
      .crossVectors(dir, this.camera.up)
      .normalize();

    this.camera.position
      .addScaledVector(dir, forward * MOVE_SPEED * dt)
      .addScaledVector(right, strafe * MOVE_SPEED * dt);
  }

  private checkCollisions(): void {
    this.playerBound.center.copy(this.camera.position);
    const hit: Item[] = [];

    for (const item of this.items) {
      if (this.playerBound.intersectsSphere(item.bound)) hit.push(item);
    }
    if (hit.length === 0) return;

    for (const item of hit) {
      this.scene.remove(item.object);
      this.items.splice(this.items.indexOf(item), 1);
      if (item.type === "ring") {
        this.score++;
        this.treasuresFound++;
      } else if (item.type === "bomb") {
        this.score--;
      } else {
        this.score = -5;
      }
      this.audio.playExplosion();
    }

    this.updateHud();

    if (this.score + START_LIFE <= 0) {
      this.endGame("GAME OVER! YOU LOSE!");
    } else if (this.score === WIN_SCORE) {
      this.endGame("GAME OVER! YOU WIN!");
    }
  }

  private endGame(message: string): void {
    this.gameOver = true;
    this.hud.bannerText.textContent = message;
    this.hud.banner.style.display = "flex";
    this.audio.stopBgm();
    this.audio.startGameOver();
    document.exitPointerLock();
  }

  private updateHud(): void {
    this.hud.score.textContent = `Score: ${this.score}`;
    this.hud.left.textContent = `Left: ${this.treasures - this.treasuresFound}`;
    this.hud.life.textContent = `Life: ${this.score + START_LIFE}`;
  }

  private addRandom(type: ItemType): void {
    // Faithful to the original addRandom(): one polarity flip applied to
    // all three axes, magnitudes in [0, 100).
    const polarity = Math.random() * 10 < 5.5 ? -1 : 1;
    const x = polarity * Math.random() * RANDOM_BOUND_MAX;
    const y = polarity * Math.random() * RANDOM_BOUND_MAX;
    const z = polarity * Math.random() * RANDOM_BOUND_MAX;
    this.addAt(type, x, y, z);
  }

  private addAt(type: ItemType, x: number, y: number, z: number): void {
    const object = this.prototypes![type].clone();
    object.position.set(x, y, z);
    this.scene.add(object);
    if (type === "ring") this.treasures++;
    this.items.push({
      object,
      type,
      bound: new THREE.Sphere(new THREE.Vector3(x, y, z), ITEM_BOUND),
    });
  }
}

async function loadObj(
  objUrl: string,
  mtlUrl: string | null,
): Promise<THREE.Object3D> {
  const objLoader = new OBJLoader();
  if (mtlUrl) {
    const materials = await new MTLLoader().loadAsync(mtlUrl);
    materials.preload();
    objLoader.setMaterials(materials);
  }
  return objLoader.loadAsync(objUrl);
}
