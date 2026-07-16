// Sound for the Treasure Hunt port. The original played bgm.mid /
// gameover.mid via the (long-removed) applet AudioClip API; browsers
// can't play MIDI, so those two tracks are stand-in chiptune loops
// synthesized with the Web Audio API (KAN-122 §6). explosion.wav is
// the original asset, played as-is.

const BGM_NOTES = [220, 262, 330, 262, 220, 262, 330, 392]; // A3 C4 E4 arpeggio
const GAME_OVER_NOTES = [330, 262, 220, 165]; // descending "game over" phrase
const NOTE_INTERVAL_MS = 280;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private explosion = new Audio("audio/explosion.wav");
  private bgmTimer: number | null = null;
  private gameOverTimer: number | null = null;

  /** Must be called from a user gesture (autoplay policy). */
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  playExplosion(): void {
    this.explosion.currentTime = 0;
    void this.explosion.play().catch(() => {
      /* ignore — sound is non-essential */
    });
  }

  startBgm(): void {
    if (this.bgmTimer !== null) return;
    let step = 0;
    this.bgmTimer = window.setInterval(() => {
      this.beep(BGM_NOTES[step % BGM_NOTES.length], 0.18, 0.03);
      step++;
    }, NOTE_INTERVAL_MS);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  /** Loops the game-over phrase, like the original's gOver.loop(). */
  startGameOver(): void {
    if (this.gameOverTimer !== null) return;
    let step = 0;
    const phrase = () => {
      this.beep(
        GAME_OVER_NOTES[step % GAME_OVER_NOTES.length],
        0.4,
        0.05,
        "triangle",
      );
      step++;
    };
    phrase();
    this.gameOverTimer = window.setInterval(phrase, 450);
  }

  stopAll(): void {
    this.stopBgm();
    if (this.gameOverTimer !== null) {
      window.clearInterval(this.gameOverTimer);
      this.gameOverTimer = null;
    }
  }

  private beep(
    freq: number,
    duration: number,
    gain: number,
    type: OscillatorType = "square",
  ): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = this.ctx.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
}
