// Standalone entry for Treasure Hunt, served at /treasure/ as a Vite
// page (see rollupOptions.input in vite.config.js). Plain TypeScript —
// the game renders its own canvas and needs no React shell. Mirrors
// the /space/ and /platformer/ entry pattern otherwise.

import { TreasureGame, type Hud } from "./game";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const container = byId("game");
const startOverlay = byId("start");
const startTitle = startOverlay.querySelector("h1")!;

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

startTitle.textContent = "Loading…";
game
  .load()
  .then(() => {
    startTitle.textContent = "Treasure Hunt";
  })
  .catch((err: unknown) => {
    startTitle.textContent = "Failed to load assets";
    console.error(err);
  });

startOverlay.addEventListener("click", () => {
  if (game.gameOver) return;
  startOverlay.style.display = "none";
  game.start();
  game.requestLook();
});

// ESC releases pointer lock; treat that as pause (or exit on game over),
// standing in for the original QuitGameAction.
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === game.renderer.domElement) return;
  if (game.gameOver) return;
  game.pause();
  startTitle.textContent = "Paused — click to resume";
  startOverlay.style.display = "flex";
});
