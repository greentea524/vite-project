import React, { useEffect, useRef, useState } from "react";
import { InvasionEngine, WEAPON_NAMES } from "./engine.js";
import { createAudio } from "./audio.js";
import { VirtualJoystick } from "../common/VirtualJoystick.jsx";
import styles from "./AlienInvasion.module.css";

// Alien Invasion container (#72): owns the canvas ref and the engine
// lifecycle. The HUD (score, wave, weapon, combo) and the overlays are
// React state fed by engine callbacks (#74) — the canvas only draws
// the game world. Input flows the other way: React handlers call the
// engine's input API.
export default function AlienInvasion() {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const engineRef = useRef(null);
  const audioRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [gameOver, setGameOver] = useState(null); // { score, hitRate } | null
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;
    const engine = new InvasionEngine(canvasRef.current, wrapperRef.current, {
      audio,
      onHud: setHud,
      onGameOver: setGameOver,
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      audio.destroy();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Desktop keyboard (#74). Bound while the component is mounted; the
  // first keydown also unlocks the AudioContext (#75).
  useEffect(() => {
    const down = (e) => {
      audioRef.current?.unlock();
      const engine = engineRef.current;
      if (!engine) return;
      if (e.key === "Right" || e.key === "ArrowRight") engine.setRight(true);
      if (e.key === "Left" || e.key === "ArrowLeft") engine.setLeft(true);
      if (e.key === " ") {
        e.preventDefault(); // keep space from scrolling the page
        engine.setShootHeld(true);
      }
    };
    const up = (e) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.key === "Right" || e.key === "ArrowRight") engine.setRight(false);
      if (e.key === "Left" || e.key === "ArrowLeft") engine.setLeft(false);
      if (e.key === " ") engine.setShootHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const restart = () => {
    setGameOver(null);
    engineRef.current?.restart();
  };

  // Touch buttons use pointer events with touch-action: none in CSS —
  // no preventDefault needed (React's root touch listeners are
  // passive), and they respond to mouse for desktop testing.
  const hold = (setter) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      audioRef.current?.unlock();
      engineRef.current?.[setter](true);
    },
    onPointerUp: () => engineRef.current?.[setter](false),
    onPointerCancel: () => engineRef.current?.[setter](false),
  });

  const weaponName = WEAPON_NAMES[hud?.weaponLevel] ?? WEAPON_NAMES[1];
  const hitRate = hud?.shots > 0 ? ((hud.hits / hud.shots) * 100).toFixed(1) : "0.0";

  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <h2 className={styles.title}>Invasion</h2>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.barBtn}
            onClick={() => setShowInstructions((v) => !v)}
          >
            Instructions
          </button>
          <button type="button" className={styles.barBtn} onClick={restart}>
            Restart
          </button>
        </div>
      </div>

      {hud && (
        <div className={styles.hud}>
          <span className={styles.score}>Score {hud.score}</span>
          {hud.comboMultiplier > 1 && (
            <span className={styles.combo}>
              COMBO x{hud.comboMultiplier} ({hud.comboCount})
            </span>
          )}
          <span>Wave {hud.wave}</span>
          <span>{weaponName}</span>
          <span>Coins {hud.coins}</span>
          <span>
            Hit rate {hitRate}% ({hud.hits}/{hud.shots})
          </span>
          {hud.bossHp > 0 && <span className={styles.bossHp}>Boss HP {hud.bossHp}</span>}
        </div>
      )}

      <div className={styles.gameArea} ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={() => {
            audioRef.current?.unlock();
            engineRef.current?.triggerShoot();
          }}
          onMouseMove={(e) => engineRef.current?.pointTo(e.clientX)}
        />

        {showInstructions && (
          <div className={styles.instructions}>
            <h3>Instructions</h3>
            <ul>
              <li>Touch Left/Right: Move (Mobile)</li>
              <li>Touch Shoot: Fire (Mobile)</li>
              <li>Mouse: Move left/right (Desktop)</li>
              <li>Left/Right Arrow: Move (Desktop)</li>
              <li>Spacebar/Click: Shoot (Desktop)</li>
              <li>White jet: You</li>
              <li>Green ships: Enemy</li>
              <li>Large dark ship: Boss (multi-hit)</li>
              <li>Red shots: Your bullets</li>
              <li>Cyan crate: Weapon upgrade pickup</li>
              <li>1st pickup: Dual missiles (permanent)</li>
              <li>2nd pickup+: Triple-shot (permanent)</li>
              <li>Gold coin: Bonus points after max weapon</li>
              <li>Score +10 per hit</li>
              <li>Game ends if enemy reach bottom</li>
            </ul>
            <button
              type="button"
              className={styles.barBtn}
              onClick={() => setShowInstructions(false)}
            >
              Close
            </button>
          </div>
        )}

        {gameOver && (
          <div className={styles.gameOver}>
            <h3>Game Over!</h3>
            <p>Final Score: {gameOver.score}</p>
            <p>Hit Rate: {gameOver.hitRate}%</p>
            <button type="button" className={styles.restartBtn} onClick={restart}>
              Restart
            </button>
          </div>
        )}
      </div>

      <div className={styles.touchControls}>
        {/* Analog joystick (#93): deflection scales ship speed, so
            small nudges make precise dodges. The wrapper unlocks audio
            on the first touch (pointerdown bubbles up from the base). */}
        <div onPointerDown={() => audioRef.current?.unlock()}>
          <VirtualJoystick
            onAxis={(v) => engineRef.current?.setMoveAxis(v)}
            className={styles.joystick}
            knobClassName={styles.joystickKnob}
          />
        </div>
        <button type="button" aria-label="Shoot" className={styles.touchBtn} {...hold("setShootHeld")}>
          ✦
        </button>
      </div>
    </div>
  );
}
