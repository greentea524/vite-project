import React, { useCallback, useEffect, useRef, useState } from "react";
import "./platformer.css";
import { GameState, AVATAR_NAMES, START_LIVES } from "./state.js";
import { Engine, VIEW_W, VIEW_H } from "./game.js";
import { AVATAR_SHEETS, IMAGE_URLS } from "./assets.js";
import { WORLDS } from "./levels.js";

// On-screen control button (PLAT-13), usable with touch or mouse.
// Pointer events feed the engine's Input actions, so press-and-hold
// and release timing behave exactly like keyboard keys. Pointer
// capture guarantees the release fires even when the pointer slides
// off the button.
function TouchButton({ label, className, onPress, onRelease }) {
  const ref = useRef(null);
  useEffect(() => {
    // React registers touch handlers as passive, which cannot block
    // the browser's long-press text-selection gesture — attach a
    // non-passive touchstart directly (PLAT-17). Pointer events
    // still fire; only the selection/callout default is cancelled.
    const el = ref.current;
    const block = (e) => e.preventDefault();
    el.addEventListener("touchstart", block, { passive: false });
    return () => el.removeEventListener("touchstart", block);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      className={`plat-touch-btn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // synthetic events have no active pointer to capture
        }
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

// Joystick-style movement control (PLAT-18). The knob follows the
// pointer, clamped to the base radius, and springs back on release.
// Horizontal displacement past a dead zone maps to the digital
// move_left/move_right actions, so movement feels identical to the
// keyboard. The knob is moved via direct style updates — no React
// re-render per pointermove.
function VirtualJoystick({ onDirection }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    // Non-passive: block the browser's long-press selection gesture.
    const block = (e) => e.preventDefault();
    base.addEventListener("touchstart", block, { passive: false });

    let activePointer = null;
    let dir = 0;
    const setDir = (d) => {
      if (dir === d) return;
      dir = d;
      onDirection(d);
    };

    const track = (e) => {
      const rect = base.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const travel = rect.width / 2 - 14; // keep the knob inside the base
      const len = Math.hypot(dx, dy);
      if (len > travel) {
        dx = (dx / len) * travel;
        dy = (dy / len) * travel;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = rect.width * 0.12;
      setDir(dx < -dead ? -1 : dx > dead ? 1 : 0);
    };
    const down = (e) => {
      activePointer = e.pointerId;
      try {
        base.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events have no active pointer to capture
      }
      track(e);
    };
    const move = (e) => {
      if (e.pointerId === activePointer) track(e);
    };
    const up = (e) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      knob.style.transform = "translate(0px, 0px)";
      setDir(0);
    };

    base.addEventListener("pointerdown", down);
    base.addEventListener("pointermove", move);
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);
    return () => {
      base.removeEventListener("touchstart", block);
      base.removeEventListener("pointerdown", down);
      base.removeEventListener("pointermove", move);
      base.removeEventListener("pointerup", up);
      base.removeEventListener("pointercancel", up);
      setDir(0);
    };
  }, [onDirection]);

  return (
    <div className="plat-joystick" ref={baseRef} aria-label="Move joystick">
      <div className="plat-joystick-knob" ref={knobRef} />
    </div>
  );
}

// Crops the first frame out of a horizontal sprite sheet. Frames are
// 16px wide; `aspect` covers non-square art (the flag is 16x32).
function SpriteIcon({ sheet, frames, size = 32, aspect = 1 }) {
  return (
    <span
      className="plat-icon"
      style={{
        width: size,
        height: size * aspect,
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${size * frames}px ${size * aspect}px`,
      }}
    />
  );
}

// 2D platformer ported from github.com/greentea524/godot-game.
// The Engine simulates and renders into the canvas; the menus, HUD,
// and transition screens are React overlays driven by GameState
// events (they replace the Godot menu scenes).
function Platformer() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const shellRef = useRef(null);
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = new GameState();
  const state = stateRef.current;
  const [isFullscreen, setIsFullscreen] = useState(false);


  const [screen, setScreen] = useState(state.screen);
  const [coins, setCoins] = useState(state.coins);
  const [lives, setLives] = useState(state.lives);
  const [avatar, setAvatar] = useState(state.selectedAvatar);
  const [levelLabel, setLevelLabel] = useState("1-1");

  useEffect(() => {
    const engine = new Engine(canvasRef.current, state);
    engineRef.current = engine;
    const unsubs = [
      state.on("screen", setScreen),
      state.on("coins", setCoins),
      state.on("lives", setLives),
      state.on("level", () => setLevelLabel(state.levelLabel())),
    ];
    engine.start();
    return () => {
      for (const unsub of unsubs) unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, [state]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const inGame = screen === "playing" || screen === "paused";

  // While playing, holding a control must not start text selection
  // anywhere on the page — the shell-level user-select only protects
  // the game's own text (PLAT-17).
  useEffect(() => {
    document.body.classList.toggle("plat-no-select", inGame);
    return () => document.body.classList.remove("plat-no-select");
  }, [inGame]);

  const press = (action) => () => engineRef.current?.input.press(action);
  const release = (action) => () => engineRef.current?.input.release(action);

  // Joystick direction -> the same digital actions the keyboard uses.
  const handleJoystick = useCallback((dir) => {
    const input = engineRef.current?.input;
    if (!input) return;
    if (dir < 0) input.press("move_left");
    else input.release("move_left");
    if (dir > 0) input.press("move_right");
    else input.release("move_right");
  }, []);

  // Fullscreen + landscape for mobile play (PLAT-16). Orientation
  // lock only works inside fullscreen and only on some platforms
  // (Android Chrome yes, iOS Safari no) — every call is guarded so
  // unsupported devices just no-op.
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current.requestFullscreen();
        try {
          await screen.orientation.lock("landscape");
        } catch {
          // orientation lock unsupported — fullscreen alone is fine
        }
      } else {
        try {
          screen.orientation.unlock();
        } catch {
          // ignore
        }
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API unavailable (e.g. iPhone Safari)
    }
  };

  const pickAvatar = (i) => {
    state.selectedAvatar = i;
    setAvatar(i);
  };

  return (
    <div className="plat-shell" ref={shellRef}>
      <div className="plat-stage">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="plat-canvas"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        />

        {inGame && (
          <div className="plat-hud">
            <span>Coins: {coins}</span>
            <span>Level {levelLabel}</span>
            <span>Lives: {lives}</span>
          </div>
        )}


        {screen === "menu" && (
          <div className="plat-overlay">
            <h3 className="plat-title">Platform Game</h3>
            <div className="plat-help">
              <p className="plat-text">
                Reach the flag <SpriteIcon sheet={IMAGE_URLS.flag} frames={1} size={12} aspect={2} /> to
                clear each level — six levels across two worlds.
              </p>
              <p className="plat-text">
                Grab coins <SpriteIcon sheet={IMAGE_URLS.coin} frames={2} size={16} /> · stomp
                enemies <SpriteIcon sheet={IMAGE_URLS.enemy} frames={2} size={16} /> by landing on
                top · checkpoints <SpriteIcon sheet={IMAGE_URLS.checkpoint} frames={1} size={16} /> set
                your respawn.
              </p>
              <p className="plat-text">
                Avoid spikes <SpriteIcon sheet={IMAGE_URLS.spike} frames={1} size={16} /> and
                falling into pits — you have 3 lives per run.
              </p>
              <p className="plat-text">
                Move with A/D, ◀▶ keys, or the on-screen buttons · jump with Space or ▲ — hold
                for a higher jump, press again mid-air to double jump · pause with Esc or ❚❚.
              </p>
            </div>
            <div className="plat-avatar-row">
              {AVATAR_SHEETS.map((sheet, i) => (
                <button
                  type="button"
                  key={AVATAR_NAMES[i]}
                  title={AVATAR_NAMES[i]}
                  className={`plat-avatar-btn${i === avatar ? " plat-avatar-selected" : ""}`}
                  onClick={() => pickAvatar(i)}
                >
                  <SpriteIcon sheet={sheet} frames={8} />
                </button>
              ))}
            </div>
            <button type="button" className="plat-btn" onClick={() => state.startGame()}>
              Start
            </button>
          </div>
        )}

        {screen === "paused" && (
          <div className="plat-overlay plat-overlay-dim">
            <h4 className="plat-title">Paused</h4>
            <button type="button" className="plat-btn" onClick={() => state.resume()}>
              Resume
            </button>
            <button type="button" className="plat-btn" onClick={() => state.restartLevel()}>
              Restart
            </button>
            <button type="button" className="plat-btn" onClick={() => state.mainMenu()}>
              Quit to menu
            </button>
          </div>
        )}

        {screen === "gameover" && (
          <div className="plat-overlay">
            <h4 className="plat-title">Game Over</h4>
            <button type="button" className="plat-btn" onClick={() => state.retryLevel()}>
              Retry
            </button>
            <button type="button" className="plat-btn" onClick={() => state.mainMenu()}>
              Menu
            </button>
          </div>
        )}

        {screen === "worldmap" && (
          <div className="plat-overlay">
            <h4 className="plat-title">
              {state.isLastInWorld(state.currentLevel)
                ? `World ${state.worldOf(state.currentLevel) + 1} complete!`
                : `Level ${state.levelLabel()} complete!`}
            </h4>
            <p className="plat-text">Coins collected: {coins}</p>
            <div className="plat-map">
              {WORLDS.map((world, w) => (
                <div className="plat-map-row" key={w}>
                  <span className="plat-map-world">World {w + 1}</span>
                  {world.map((_, s) => {
                    const index = state.flatIndex(w, s);
                    const done = state.isCompleted(index);
                    const next = index === state.levelsCompleted;
                    return (
                      <span
                        key={s}
                        className={`plat-map-cell${done ? " plat-map-done" : ""}${
                          !done && !next ? " plat-map-locked" : ""
                        }`}
                      >
                        {done && <SpriteIcon sheet={IMAGE_URLS.coin} frames={2} size={20} />}
                        {next && <SpriteIcon sheet={AVATAR_SHEETS[avatar]} frames={8} size={20} />}
                        {!done && !next && <span className="plat-icon-blank" />}
                        {w + 1}-{s + 1}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <button type="button" className="plat-btn" onClick={() => state.continueFromWorldMap()}>
              Continue
            </button>
          </div>
        )}

        {screen === "win" && (
          <div className="plat-overlay">
            <h4 className="plat-title">You Win! 🎉</h4>
            <p className="plat-text">Total coins: {coins}</p>
            <button type="button" className="plat-btn" onClick={() => state.mainMenu()}>
              Menu
            </button>
          </div>
        )}
      </div>

      {inGame && (
        <div className="plat-touch-bar">
          <VirtualJoystick onDirection={handleJoystick} />
          <div className="plat-touch-center">
            <button
              type="button"
              className="plat-touch-btn plat-touch-pause"
              onClick={() => (screen === "paused" ? state.resume() : state.pause())}
            >
              ❚❚
            </button>
            <button
              type="button"
              className="plat-touch-btn plat-touch-pause"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              ⛶
            </button>
          </div>
          <TouchButton
            label="▲"
            className="plat-touch-jump"
            onPress={press("jump")}
            onRelease={release("jump")}
          />
        </div>
      )}
    </div>
  );
}

export default Platformer;
