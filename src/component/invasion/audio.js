// WebAudio SFX for Alien Invasion (#75), ported from the inline
// functions in the legacy game/js-alien-invasion/index.html. The
// AudioContext is created lazily and resumed on the first user
// gesture — browsers block audio that starts before an interaction,
// so every input handler calls unlock() before play can matter.

export function createAudio() {
  let ctx = null;

  // Call from any user-gesture handler (keydown, pointerdown, touch).
  // Creates the context on first use and resumes it if the browser
  // suspended it. Safe to call repeatedly.
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  // Shared oscillator envelope: `type` waveform sweeping from f0 to f1
  // over `sweep`s, gain up to `peak` then out by `dur`s.
  function blip(type, f0, f1, sweep, peak, attack, dur) {
    if (!ctx) return; // never played before the first gesture
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(f0, now);
    oscillator.frequency.exponentialRampToValueAtTime(f1, now + sweep);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(peak, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + dur + 0.01);
  }

  return {
    unlock,
    alienHit: () => blip("square", 780, 220, 0.08, 0.16, 0.01, 0.09),
    powerUp: () => blip("triangle", 420, 960, 0.12, 0.14, 0.015, 0.14),
    powerUpShield: () => blip("sine", 300, 400, 0.2, 0.15, 0.05, 0.25),
    powerUpSpeed: () => blip("sawtooth", 500, 800, 0.15, 0.1, 0.02, 0.2),
    powerUpLaser: () => blip("square", 600, 1200, 0.1, 0.15, 0.01, 0.15),
    powerUpHoming: () => blip("triangle", 800, 600, 0.2, 0.15, 0.02, 0.25),
    shootFighter: () => blip("square", 600, 300, 0.05, 0.1, 0.005, 0.06),
    shootCruiser: () => blip("sawtooth", 300, 150, 0.08, 0.15, 0.01, 0.1),
    shootInterceptor: () => blip("triangle", 900, 700, 0.04, 0.08, 0.005, 0.05),
    destroy: () => ctx?.close().catch(() => {}),
  };
}
