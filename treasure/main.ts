// Standalone entry for Treasure Hunt, served at /treasure/ as a Vite
// page (see rollupOptions.input in vite.config.js). Plain TypeScript —
// the game renders its own canvas and needs no React shell. Mirrors
// the /space/ and /platformer/ entry pattern otherwise.
//
// Screen flow: menu → playing ⇄ paused, with Back to Menu from the
// pause screen and the game-over banner (both reset the world).

import { TreasureGame, type Hud } from "./game";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const container = byId("game");
const menu = byId("menu");
const pauseOverlay = byId("pause");
const playBtn = byId("menu-play") as HTMLButtonElement;

const hud: Hud = {
  score: byId("hud-score"),
  left: byId("hud-left"),
  life: byId("hud-life"),
  banner: byId("banner"),
  bannerText: byId("banner-text"),
};

const game = new TreasureGame(container, hud);

if (import.meta.env.DEV) {
  // Debug handle for poking at the game from the console.
  (window as unknown as Record<string, unknown>).__treasureGame = game;
}

game
  .load()
  .then(() => {
    playBtn.disabled = false;
    playBtn.textContent = "Play";
  })
  .catch((err: unknown) => {
    playBtn.textContent = "Failed to load assets";
    console.error(err);
  });

const show = (el: HTMLElement, visible: boolean): void => {
  el.style.display = visible ? "flex" : "none";
};

let playing = false;

function startPlaying(): void {
  playing = true;
  show(menu, false);
  show(pauseOverlay, false);
  game.start();
  game.requestLook();
}

function pauseGame(): void {
  if (!playing || game.gameOver) return;
  playing = false;
  game.pause();
  show(pauseOverlay, true);
}

function backToMenu(): void {
  playing = false;
  game.reset();
  show(pauseOverlay, false);
  show(menu, true);
}

playBtn.addEventListener("click", startPlaying);
byId("pause-resume").addEventListener("click", startPlaying);
byId("pause-menu").addEventListener("click", backToMenu);
byId("banner-menu").addEventListener("click", backToMenu);

// ESC pauses: releasing pointer lock fires pointerlockchange, and the
// keydown covers drag-look mode where there is no lock to release.
// (Both fire when locked; pauseGame is a no-op the second time.)
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== game.renderer.domElement) pauseGame();
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") pauseGame();
});
