// Asset manifest. Vite turns these imports into hashed URLs, so the
// GitHub Pages build bundles everything automatically.

import playerUrl from "./assets/player.png";
import player2Url from "./assets/player2.png";
import player3Url from "./assets/player3.png";
import enemyUrl from "./assets/enemy.png";
import coinUrl from "./assets/coin.png";
import spikeUrl from "./assets/spike.png";
import flagUrl from "./assets/flag.png";
import checkpointUrl from "./assets/checkpoint.png";
import tilesUrl from "./assets/tiles.png";
import cloudsUrl from "./assets/clouds.png";

import jumpWav from "./assets/sfx/jump.wav";
import doubleJumpWav from "./assets/sfx/double_jump.wav";
import coinWav from "./assets/sfx/coin.wav";
import stompWav from "./assets/sfx/stomp.wav";
import levelCompleteWav from "./assets/sfx/level_complete.wav";

// The three avatar sheets share one frame layout, so switching
// avatars is just an atlas swap (PG-30).
export const AVATAR_SHEETS = [playerUrl, player2Url, player3Url];

export const IMAGE_URLS = {
  player: playerUrl,
  player2: player2Url,
  player3: player3Url,
  enemy: enemyUrl,
  coin: coinUrl,
  spike: spikeUrl,
  flag: flagUrl,
  checkpoint: checkpointUrl,
  tiles: tilesUrl,
  clouds: cloudsUrl,
};

export const SOUND_URLS = {
  jump: jumpWav,
  double_jump: doubleJumpWav,
  coin: coinWav,
  stomp: stompWav,
  level_complete: levelCompleteWav,
};

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadImages() {
  const entries = await Promise.all(
    Object.entries(IMAGE_URLS).map(async ([name, url]) => [name, await loadImage(url)]),
  );
  return Object.fromEntries(entries);
}
