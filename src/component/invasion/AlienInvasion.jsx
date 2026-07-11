import React, { useEffect, useRef, useState } from "react";
import { InvasionEngine, WEAPON_NAMES } from "./engine.js";
import { createAudio } from "./audio.js";
import { Network, MAX_PLAYERS } from "./network.js";
import { VirtualJoystick } from "../common/VirtualJoystick.jsx";
import styles from "./AlienInvasion.module.css";

// How long the lobby keeps showing "connecting" before offering a
// retry — long enough for a napping free-tier relay to wake (KAN-53).
const CONNECT_PATIENCE_MS = 15000;

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
  const [gameState, setGameState] = useState("menu"); // "menu", "lobby", "countdown", "playing", "paused", "gameover"

  // Multiplayer (#79): one Network per mount, only when a relay URL is
  // configured — otherwise the menu button stays disabled.
  const networkRef = useRef(null);
  if (!networkRef.current && Network.isConfigured()) networkRef.current = new Network();
  const network = networkRef.current;
  const [lobbyStage, setLobbyStage] = useState("choose"); // "choose" | "room"
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roster, setRoster] = useState([]);
  const [mpError, setMpError] = useState("");
  const [connStatus, setConnStatus] = useState("connecting"); // "connecting" | "connected" | "failed"
  const [countdown, setCountdown] = useState(null); // synced-start 3-2-1-GO
  const inRoom = roster.length > 0;

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;
    const engine = new InvasionEngine(canvasRef.current, wrapperRef.current, {
      audio,
      onHud: setHud,
      onGameOver: (stats) => {
        setGameOver(stats);
        setGameState("gameover");
      },
    });
    engineRef.current = engine;
    engine.start(); // Engine starts in menuMode by default

    // Multiplayer wiring (#79/#80): the roster names the one remote
    // player (their ghost), remoteState feeds its snapshot buffer.
    const offs = [];
    const net = networkRef.current;
    if (net) {
      engine.attachNetwork(net);
      offs.push(
        net.on("connected", () => setConnStatus("connected")),
        net.on("disconnected", () =>
          setConnStatus((s) => (s === "connected" ? "connecting" : s)),
        ),
        net.on("roster", (list) => {
          setRoster([...list]);
          const other = list.find((r) => r.id !== net.playerId);
          engine.setGhost(other ? { id: other.id, name: other.name } : null);
        }),
        net.on("remoteState", (snap) => engine.pushGhostSnapshot(snap)),
      );
    }

    return () => {
      offs.forEach((off) => off());
      net?.destroy();
      engine.destroy();
      audio.destroy();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Synced start (#79): the relay broadcasts raceStart to the whole
  // room; every client builds a fresh run, freezes it, and counts down
  // 3-2-1-GO before unfreezing — so both ships launch together.
  useEffect(() => {
    const net = networkRef.current;
    if (!net) return undefined;
    return net.on("raceStart", ({ countdownMs } = {}) => {
      setGameOver(null);
      setMpError("");
      setGameState("countdown");
      setCountdown(Math.ceil((countdownMs ?? 3000) / 1000));
      const engine = engineRef.current;
      if (engine) {
        engine.play(); // fresh run with the wave laid out...
        engine.setPaused(true); // ...frozen until GO
      }
    });
  }, []);

  useEffect(() => {
    if (countdown == null) return undefined;
    const timer = setTimeout(
      () => {
        if (countdown > 0) {
          setCountdown(countdown - 1);
        } else {
          // "GO!" has been up for its beat — release the ships.
          setCountdown(null);
          engineRef.current?.setPaused(false);
          setGameState("playing");
        }
      },
      countdown === 0 ? 600 : 1000,
    );
    return () => clearTimeout(timer);
  }, [countdown]);

  // Patience timer for the lobby's connection status: free hosting
  // naps when idle, so give the relay time to wake before offering a
  // retry (KAN-53).
  useEffect(() => {
    if (gameState !== "lobby" || connStatus !== "connecting") return undefined;
    const timer = setTimeout(() => setConnStatus("failed"), CONNECT_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, [gameState, connStatus]);

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
    setGameState("playing");
    engineRef.current?.play();
  };

  const handlePause = () => {
    engineRef.current?.setPaused(true);
    setGameState("paused");
  };

  const handleResume = () => {
    engineRef.current?.setPaused(false);
    setGameState("playing");
  };

  const leaveRoom = () => {
    network?.leave();
    engineRef.current?.setGhost(null);
    setRoster([]);
    setMpError("");
    setLobbyStage("choose");
  };

  const quitToMenu = () => {
    if (inRoom) leaveRoom();
    setGameOver(null);
    setGameState("menu");
    if (engineRef.current) {
      engineRef.current.menuMode = true;
      engineRef.current.restart();
    }
  };

  // --- Multiplayer lobby (#79) ---

  const openMultiplayer = () => {
    Network.warmUp(); // HTTP ping wakes a napping relay early (KAN-53)
    network?.connect();
    setConnStatus(network?.isConnected ? "connected" : "connecting");
    setMpError("");
    setJoinCode("");
    setLobbyStage("choose");
    setGameState("lobby");
  };

  const retryConnect = () => {
    Network.warmUp();
    network?.connect();
    setConnStatus("connecting");
  };

  const hostGame = async () => {
    setMpError("");
    const res = await network.createRoom(playerName.trim() || "Player 1");
    if (res?.ok) setLobbyStage("room");
    else setMpError(res?.error || "Could not create the room.");
  };

  const joinGame = async () => {
    setMpError("");
    const res = await network.joinRoom(
      joinCode.trim().toUpperCase(),
      playerName.trim() || "Player 2",
    );
    if (res?.ok) setLobbyStage("room");
    else setMpError(res?.error || "Could not join the room.");
  };

  // Multiplayer game over: back to the room lobby so the host can
  // start a rematch (results screens land with #82).
  const backToRoom = () => {
    setGameOver(null);
    setLobbyStage("room");
    setGameState("lobby");
    if (engineRef.current) {
      engineRef.current.menuMode = true;
      engineRef.current.restart();
    }
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
        {/* Pausing is single-player only: in a room your sim freezing
            while the peer's keeps running just looks broken (#80). */}
        {gameState === "playing" && !inRoom && (
          <div className={styles.topActions}>
            <button type="button" className={styles.barBtn} onClick={handlePause}>
              Pause
            </button>
          </div>
        )}
      </div>



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

        {hud && gameState === "playing" && (
          <>
            <div className={styles.hudOverlay}>
              <div className={styles.hudLeft}>
                <div className={styles.hudScore}>{hud.score}</div>
                {hud.comboMultiplier > 1 && (
                  <div className={styles.hudCombo}>x{hud.comboMultiplier} COMBO</div>
                )}
              </div>
              <div className={styles.hudRight}>
                <div className={styles.hudStat}>🌊 Wave {hud.wave}</div>
                <div className={styles.hudStat}>🪙 {hud.coins}</div>
              </div>
            </div>
            {hud.bossMaxHp > 0 && hud.bossHp > 0 && (
              <>
                <div className={styles.bossBarContainer}>
                  <div
                    className={styles.bossBarFill}
                    style={{ width: `${(hud.bossHp / hud.bossMaxHp) * 100}%` }}
                  />
                </div>
                <div className={styles.bossLabel}>{hud.bossName}</div>
              </>
            )}
          </>
        )}

        {gameState === "menu" && !showInstructions && (
          <div className={styles.menuOverlay}>
            <h3>Alien Invasion</h3>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => {
                setGameState("playing");
                engineRef.current?.play();
              }}
            >
              Single Player
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              disabled={!network}
              title={network ? "Play head-to-head with a friend" : "No multiplayer server configured"}
              onClick={openMultiplayer}
            >
              Multiplayer{!network && " (Offline)"}
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setShowInstructions(true)}
            >
              Instructions
            </button>
          </div>
        )}

        {gameState === "lobby" && !showInstructions && (
          <div className={styles.menuOverlay}>
            <h3>Multiplayer</h3>
            {lobbyStage === "choose" && (
              <div className={styles.lobby}>
                {connStatus === "connecting" && (
                  <p className={styles.connNote}>
                    Connecting — a napping server can take ~10s to wake…
                  </p>
                )}
                {connStatus === "failed" && (
                  <p className={styles.mpError}>
                    Couldn't reach the game server.{" "}
                    <button type="button" className={styles.barBtn} onClick={retryConnect}>
                      Retry
                    </button>
                  </p>
                )}
                <label className={styles.field}>
                  <span>Your name</span>
                  <input
                    className={styles.input}
                    type="text"
                    maxLength={16}
                    placeholder="Player"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={styles.menuBtn}
                  disabled={connStatus !== "connected"}
                  onClick={hostGame}
                >
                  Host Game
                </button>
                <div className={styles.joinRow}>
                  <input
                    className={`${styles.input} ${styles.codeInput}`}
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={4}
                    placeholder="CODE"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    className={styles.menuBtn}
                    disabled={connStatus !== "connected" || joinCode.trim().length < 4}
                    onClick={joinGame}
                  >
                    Join Game
                  </button>
                </div>
                {mpError && <p className={styles.mpError}>{mpError}</p>}
                <button type="button" className={styles.menuBtn} onClick={quitToMenu}>
                  Back
                </button>
              </div>
            )}
            {lobbyStage === "room" && (
              <div className={styles.lobby}>
                <p className={styles.roomCodeLabel}>Room code</p>
                <p className={styles.roomCode}>{network?.roomCode}</p>
                <p className={styles.rosterLabel}>
                  Players ({roster.length}/{MAX_PLAYERS})
                </p>
                <ul className={styles.roster}>
                  {roster.map((r) => (
                    <li key={r.id}>
                      {r.id === network?.hostId ? "👑 " : "🚀 "}
                      {r.name}
                      {r.id === network?.playerId ? " (you)" : ""}
                    </li>
                  ))}
                </ul>
                {network?.isHost ? (
                  <button type="button" className={styles.menuBtn} onClick={() => network.startGame()}>
                    Start Game
                  </button>
                ) : (
                  <p className={styles.connNote}>Waiting for the host to start…</p>
                )}
                <button type="button" className={styles.menuBtn} onClick={leaveRoom}>
                  Leave Room
                </button>
              </div>
            )}
          </div>
        )}

        {gameState === "countdown" && countdown != null && (
          <div className={styles.countdownOverlay}>
            <span key={countdown} className={styles.countdownNum}>
              {countdown > 0 ? countdown : "GO!"}
            </span>
          </div>
        )}

        {gameState === "paused" && !showInstructions && (
          <div className={styles.menuOverlay}>
            <h3>Paused</h3>
            <button type="button" className={styles.menuBtn} onClick={handleResume}>
              Resume
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setShowInstructions(true)}
            >
              Instructions
            </button>
            <button type="button" className={styles.menuBtn} onClick={restart}>
              Restart
            </button>
            <button type="button" className={styles.menuBtn} onClick={quitToMenu}>
              Quit to Menu
            </button>
          </div>
        )}

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
              <li>Bosses rotate each wave: Octopus, Mothership, Laser Core, Swarm Hive</li>
              <li>Clear the fleet AND the boss to advance to the next wave</li>
              <li>Octo Commander lobs ink globs — dodge them or shoot them down</li>
              <li>Mothership launches kamikaze ships — shoot them before they ram you</li>
              <li>Laser Core telegraphs a beam column — dodge before it fires</li>
              <li>Swarm Hive splits in two when killed — twice</li>
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
            {/* In a room, a solo restart would desync the pair — the
                rematch path is back through the lobby (#79; results
                screens land with #82). */}
            {inRoom ? (
              <button type="button" className={styles.restartBtn} onClick={backToRoom}>
                Back to Lobby
              </button>
            ) : (
              <button type="button" className={styles.restartBtn} onClick={restart}>
                Restart
              </button>
            )}
            <button type="button" className={styles.restartBtn} onClick={quitToMenu}>
              Menu
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
