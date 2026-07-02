// Fire-and-forget sound effects, covering both Godot patterns: the
// per-node AudioStreamPlayers and the Sfx autoload that outlives
// freed nodes (PG-25..27). Cloning the base element lets overlapping
// plays coexist, and nothing ties a sound to an entity's lifetime.

import { SOUND_URLS } from "./assets.js";

export class Sfx {
  constructor() {
    this.base = {};
    for (const [name, url] of Object.entries(SOUND_URLS)) {
      const audio = new Audio(url);
      audio.preload = "auto";
      this.base[name] = audio;
    }
  }

  play(name) {
    const base = this.base[name];
    if (!base) return;
    const sound = base.cloneNode();
    // Autoplay policies can reject before the first user gesture;
    // the canvas game only plays sounds after input, so just ignore.
    sound.play().catch(() => {});
  }
}
