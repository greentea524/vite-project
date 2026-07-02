import React, { useEffect, useRef, useState } from "react";
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
  return (
    <button
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
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = new GameState();
  const state = stateRef.current;


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

  const press = (action) => () => engineRef.current?.input.press(action);
  const release = (action) => () => engineRef.current?.input.release(action);

  const pickAvatar = (i) => {
    state.selectedAvatar = i;
    setAvatar(i);
  };

  const inGame = screen === "playing" || screen === "paused";

  return (
    <div className="plat-shell">
      <div className="plat-stage" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="plat-canvas" />

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

        {screen === "levelcomplete" && (
          <div className="plat-overlay">
            <h4 className="plat-title">Level Complete!</h4>
            <p className="plat-text">Coins collected: {coins}</p>
            <button type="button" className="plat-btn" onClick={() => state.nextLevel()}>
              Next level
            </button>
          </div>
        )}

        {screen === "worldmap" && (
          <div className="plat-overlay">
            <h4 className="plat-title">
              World {state.worldOf(state.currentLevel) + 1} complete!
            </h4>
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
          <div className="plat-touch-move">
            <TouchButton
              label="◀"
              className="plat-touch-left"
              onPress={press("move_left")}
              onRelease={release("move_left")}
            />
            <TouchButton
              label="▶"
              className="plat-touch-right"
              onPress={press("move_right")}
              onRelease={release("move_right")}
            />
          </div>
          <button
            type="button"
            className="plat-touch-btn plat-touch-pause"
            onClick={() => (screen === "paused" ? state.resume() : state.pause())}
          >
            ❚❚
          </button>
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
