import React, { useEffect, useRef, useState } from "react";
import { InvasionEngine, WEAPON_NAMES } from "./engine.js";
import { GalaxyMap } from "./GalaxyMap";
import { generateGalaxyMap } from "./MapGenerator";
import QRCode from "qrcode";
import { buildJoinLink } from "./joinLink";
import { createAudio } from "./audio.js";
import { Network, MAX_PLAYERS } from "./network.js";
import { matchOutcome, OUTCOME_LABEL } from "./results.js";
import { evaluate, ACHIEVEMENTS_BY_ID } from "./achievements.js";
import { loadSave, writeSave, addStat, maxStat, addShip } from "./save.js";
import { AchievementsPanel } from "./Achievements.jsx";
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
  const [showAchievements, setShowAchievements] = useState(false);

  // Achievements (#94): the save (lifetime stats + unlocked ids) lives
  // in a ref, mutated by the engine's stat events; unlocks bump state
  // for the toast/panel. loadSave() validates whatever localStorage has.
  const saveRef = useRef(null);
  if (!saveRef.current) saveRef.current = loadSave();
  const [achToast, setAchToast] = useState(null); // { icon, name } | null
  const saveTimerRef = useRef(0);
  const [gameState, setGameState] = useState("menu"); // "menu", "lobby", "countdown", "playing", "paused", "gameover"
  const [mapPages, setMapPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [completedNodeIds, setCompletedNodeIds] = useState([]);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [loopCount, setLoopCount] = useState(0);
  const [runHp, setRunHp] = useState(null);
  const [selectedShip, setSelectedShip] = useState("fighter"); // "fighter", "cruiser", "interceptor"

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

  // Game Over & Results (#82): the opponent's live score (shown while
  // spectating) and their final result (arrives on their terminal
  // over:true snapshot). Both reset at the start of each race.
  const [remoteScore, setRemoteScore] = useState(0);
  const [remoteResult, setRemoteResult] = useState(null); // { score, hits, bestCombo, bestMultiplier } | null
  const opponent = roster.find((r) => r.id !== network?.playerId);
  const opponentName = opponent?.name || "Opponent";

  const [joinLink, setJoinLink] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const autoOpenLobbyRef = useRef(false);
  const autoJoinRef = useRef(false);

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;

    // Achievement stat sink (#94): fold each engine event into the
    // lifetime stats, unlock anything that crossed its target (toast +
    // immediate persist), and debounce plain stat writes.
    const applyStat = (kind, key, value) => {
      const save = saveRef.current;
      if (kind === "add") addStat(save.stats, key, value);
      else if (kind === "max") maxStat(save.stats, key, value);
      else if (kind === "ship") addShip(save.stats, value);

      const newly = evaluate(save.stats, save.achievements);
      if (newly.length > 0) {
        for (const id of newly) save.achievements[id] = Date.now();
        const first = ACHIEVEMENTS_BY_ID.get(newly[0]);
        if (first) setAchToast({ icon: first.icon, name: first.name });
        clearTimeout(saveTimerRef.current);
        writeSave(save);
      } else {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => writeSave(saveRef.current), 800);
      }
    };

    const engine = new InvasionEngine(canvasRef.current, wrapperRef.current, {
      audio,
      onHud: setHud,
      onStat: applyStat,
      onGameOver: (stats) => {
        setGameOver(stats);
        setGameState("gameover");
        // Flush any debounced stat write at the natural run boundary.
        clearTimeout(saveTimerRef.current);
        writeSave(saveRef.current);
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
        net.on("remoteState", (snap) => {
          engine.pushGhostSnapshot(snap);
          // Track the opponent's live score and, once, their final
          // result off the terminal snapshot (#82).
          if (typeof snap.score === "number") {
            setRemoteScore((s) => (s === snap.score ? s : snap.score));
          }
          if (snap.over) {
            setRemoteResult((prev) =>
              prev ?? {
                score: snap.score ?? 0,
                hits: snap.hits ?? 0,
                bestCombo: snap.bestCombo ?? 0,
                bestMultiplier: snap.bestMultiplier ?? 1,
              },
            );
          }
        }),
        // Shared kills (#81): the other player destroyed an enemy —
        // despawn it here too.
        net.on("enemyKilled", (enemyId) => engine.applyRemoteKill(enemyId)),
      );
    }

    return () => {
      offs.forEach((off) => off());
      net?.destroy();
      engine.destroy();
      audio.destroy();
      engineRef.current = null;
      audioRef.current = null;
      // Don't lose a debounced stat write on unmount.
      clearTimeout(saveTimerRef.current);
      writeSave(saveRef.current);
    };
  }, []);

  // Unlock toast (#94): one at a time, auto-dismissed.
  useEffect(() => {
    if (!achToast) return undefined;
    const timer = setTimeout(() => setAchToast(null), 3500);
    return () => clearTimeout(timer);
  }, [achToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const joinParam = url.searchParams.get("join");
    if (joinParam && joinParam.length >= 4) {
      setJoinCode(joinParam.toUpperCase());
      autoOpenLobbyRef.current = true;
      autoJoinRef.current = true;
      url.searchParams.delete("join");
      window.history.replaceState({}, document.title, url.toString());
    }
  }, []);

  useEffect(() => {
    if (!network?.roomCode) {
      setJoinLink("");
      setQrDataUrl("");
      return;
    }
    const nextLink = buildJoinLink(network.roomCode, window.location.href);
    setJoinLink(nextLink);
    let cancelled = false;
    QRCode.toDataURL(nextLink, {
      margin: 1,
      width: 160,
      color: { dark: "#14182a", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [network?.roomCode]);

  useEffect(() => {
    if (!autoOpenLobbyRef.current || !network || gameState !== "menu") return;
    autoOpenLobbyRef.current = false;
    openMultiplayer();
  }, [network, gameState]);

  useEffect(() => {
    if (
      !autoJoinRef.current ||
      gameState !== "lobby" ||
      lobbyStage !== "choose" ||
      connStatus !== "connected" ||
      !joinCode.trim()
    ) return;
    autoJoinRef.current = false;
    void joinGame();
  }, [gameState, lobbyStage, joinCode, connStatus]);

  // Synced start (#79): the relay broadcasts raceStart to the whole
  // room; every client builds a fresh run, freezes it, and counts down
  // 3-2-1-GO before unfreezing — so both ships launch together.
  useEffect(() => {
    const net = networkRef.current;
    if (!net) return undefined;
    return net.on("raceStart", ({ countdownMs, seed } = {}) => {
      setGameOver(null);
      setRemoteResult(null); // clear last match's results (#82)
      setRemoteScore(0);
      setMpError("");
      setGameState("countdown");
      setCountdown(Math.ceil((countdownMs ?? 3000) / 1000));
      const engine = engineRef.current;
      if (engine) {
        // The shared seed (#81) makes both players' waves and drops
        // identical; fresh run laid out, then frozen until GO.
        engine.play(seed);
        engine.setPaused(true);
      }
    });
  }, []);

  // Push the selected ship type into the engine so the menu showcase updates live (#86)
  useEffect(() => {
    if (engineRef.current && gameState !== "playing") {
      if (typeof engineRef.current.setShipType === 'function') {
        engineRef.current.setShipType(selectedShip);
      }
    }
  }, [selectedShip, gameState]);

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

  const startNewRun = () => {
    const newMap = generateGalaxyMap(0);
    setMapPages([newMap]);
    setCurrentPageIndex(0);
    setCompletedNodeIds([]);
    setCurrentNodeId(null);
    setLoopCount(0);
    setRunHp(null);
    setGameState("map");
  };

  const handleNodeClick = (node) => {
    setCurrentNodeId(node.id);
    setGameState("playing");
    
    const engine = engineRef.current;
    if (engine) {
      engine.setRogueLite(loopCount, node.tier, node.type);
      engine.onSectorClear = (finalHp) => {
        setGameState("map");
        setRunHp(finalHp);
        
        setCompletedNodeIds((prev) => {
          const nextCompleted = [...prev, node.id];
          if (node.type === "boss") {
            setLoopCount((c) => {
              const newLoop = c + 1;
              const newMap = generateGalaxyMap(newLoop);
              setMapPages((pages) => {
                const nextPages = [...pages, newMap];
                setCurrentPageIndex(nextPages.length - 1);
                return nextPages;
              });
              return newLoop;
            });
          }
          return nextCompleted;
        });
      };
      engine.playSector(runHp);
    }
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
    setRemoteResult(null);
    setRemoteScore(0);
  };

  const quitToMenu = () => {
    if (inRoom) leaveRoom();
    setGameOver(null);
    setJoinCode(""); // clean slate for the next lobby visit (#100)
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
    // Don't clear joinCode here: a scanned ?join= link sets it before
    // this runs, and the auto-join effect needs it to survive (#100).
    // The field is reset instead when returning to the menu.
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
    setRemoteResult(null);
    setRemoteScore(0);
    setLobbyStage("room");
    setGameState("lobby");
    if (engineRef.current) {
      engineRef.current.menuMode = true;
      engineRef.current.restart();
    }
  };

  const copyLink = () => {
    if (!joinLink) return;
    navigator.clipboard.writeText(joinLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
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
                {hud.droneTimer > 0 && <div className={styles.hudStat}>🛸 Drones: {Math.ceil(hud.droneTimer / 60)}s</div>}
                {hud.laserTimer > 0 && <div className={styles.hudStat}>🔴 Laser: {Math.ceil(hud.laserTimer / 60)}s</div>}
                {hud.homingTimer > 0 && <div className={styles.hudStat}>🟣 Homing: {Math.ceil(hud.homingTimer / 60)}s</div>}
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

        {gameState === "map" && mapPages.length > 0 && (
          <GalaxyMap
            mapPage={mapPages[currentPageIndex]}
            currentPageIndex={currentPageIndex}
            totalPages={mapPages.length}
            onPrevPage={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
            onNextPage={() => setCurrentPageIndex((p) => Math.min(mapPages.length - 1, p + 1))}
            completedNodeIds={completedNodeIds}
            onNodeClick={handleNodeClick}
          />
        )}

        {gameState === "menu" && !showInstructions && !showAchievements && !showArmory && (
          <div className={styles.menuOverlay}>
            <h3>Alien Invasion</h3>
            <div className={styles.shipPicker}>
              <button type="button" className={`${styles.shipBtn} ${selectedShip === 'fighter' ? styles.active : ''}`} onClick={() => setSelectedShip('fighter')}>Fighter</button>
              <button type="button" className={`${styles.shipBtn} ${selectedShip === 'cruiser' ? styles.active : ''}`} onClick={() => setSelectedShip('cruiser')}>Cruiser</button>
              <button type="button" className={`${styles.shipBtn} ${selectedShip === 'interceptor' ? styles.active : ''}`} onClick={() => setSelectedShip('interceptor')}>Interceptor</button>
            </div>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={startNewRun}
            >
              Start Rogue-lite Run
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => {
                setGameState("playing");
                engineRef.current?.play();
              }}
            >
              Start Endless Game
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
              onClick={() => setShowAchievements(true)}
            >
              Achievements
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setShowInstructions(true)}
            >
              Instructions & Upgrades
            </button>
          </div>
        )}

        {showAchievements && (
          <AchievementsPanel
            stats={saveRef.current.stats}
            unlocked={saveRef.current.achievements}
            onClose={() => setShowAchievements(false)}
          />
        )}

        {achToast && (
          <div className={styles.achToast}>
            <span className={styles.achToastIcon}>{achToast.icon}</span>
            <span>
              <strong>{achToast.name}</strong> unlocked!
            </span>
          </div>
        )}

        {gameState === "lobby" && !showInstructions && (
          <div className={styles.menuOverlay}>
            <h3>Multiplayer</h3>
            {lobbyStage === "choose" && (
              <div className={styles.lobby}>
                <div className={styles.shipPicker} style={{ marginBottom: '8px' }}>
                  <button type="button" className={`${styles.shipBtn} ${selectedShip === 'fighter' ? styles.active : ''}`} onClick={() => setSelectedShip('fighter')}>Fighter</button>
                  <button type="button" className={`${styles.shipBtn} ${selectedShip === 'cruiser' ? styles.active : ''}`} onClick={() => setSelectedShip('cruiser')}>Cruiser</button>
                  <button type="button" className={`${styles.shipBtn} ${selectedShip === 'interceptor' ? styles.active : ''}`} onClick={() => setSelectedShip('interceptor')}>Interceptor</button>
                </div>
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
                
                {qrDataUrl && (
                  <div className={styles.qrCard}>
                    <img
                      className={styles.qrImage}
                      src={qrDataUrl}
                      alt="QR code to join the game room"
                    />
                    <p className={styles.connNote} style={{ marginTop: 0, marginBottom: '8px' }}>Scan to join this room</p>
                    {joinLink && (
                      <div className={styles.linkRow}>
                        <p className={styles.linkText}>{joinLink}</p>
                        <button
                          type="button"
                          className={`${styles.copyBtn}${linkCopied ? ` ${styles.copyBtnDone}` : ""}`}
                          onClick={copyLink}
                          title="Copy link"
                          aria-label="Copy join link"
                        >
                          {linkCopied ? "✓" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {mpError && <p className={styles.mpError}>{mpError}</p>}

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
              Instructions & Upgrades
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
              <li>Score +10 per hit</li>
              <li>Game ends if enemy reach bottom</li>
            </ul>

            <h3 style={{ marginTop: "30px" }}>Upgrades Guide</h3>
            <p style={{ marginTop: 0, marginBottom: "20px", color: "#9fd0ff" }}>
              <strong>Pro Tip:</strong> Collecting the same power-up multiple times extends its active duration.
              Activating multiple DIFFERENT power-ups will cycle between them with every shot!
            </p>
            <div className={styles.armoryItem}>
              <div className={styles.armoryIcon}>🚀</div>
              <div className={styles.armoryText}>
                <h4>Weapon Crate (Cyan W)</h4>
                <p>Permanently upgrades your primary cannon. Levels 2-4 add extra spread bullets. Level 5 fires devastating quad waves.</p>
              </div>
            </div>
            <div className={styles.armoryItem}>
              <div className={styles.armoryIcon}>🛡️</div>
              <div className={styles.armoryText}>
                <h4>Energy Shield (Blue S)</h4>
                <p>Instantly provides a 50 HP buffer that absorbs enemy fire and collisions. Does not stack.</p>
              </div>
            </div>
            <div className={styles.armoryItem}>
              <div className={styles.armoryIcon}>🛸</div>
              <div className={styles.armoryText}>
                <h4>Wingman Drones (Green D)</h4>
                <p>Deploys two automated drones that orbit your ship and independently fire on the nearest enemies.</p>
              </div>
            </div>
            <div className={styles.armoryItem}>
              <div className={styles.armoryIcon}>🔴</div>
              <div className={styles.armoryText}>
                <h4>Piercing Laser (Pink L)</h4>
                <p>Equips a rapid-fire, high-damage laser beam that instantly damages everything in its path.</p>
              </div>
            </div>
            <div className={styles.armoryItem}>
              <div className={styles.armoryIcon}>🟣</div>
              <div className={styles.armoryText}>
                <h4>Homing Missiles (Purple H)</h4>
                <p>Fires a barrage of smart missiles that seek out and destroy enemy targets with precision tracking.</p>
              </div>
            </div>

            <button
              type="button"
              className={styles.stickyCloseBtn}
              onClick={() => setShowInstructions(false)}
            >
              Close
            </button>
          </div>
        )}

        {/* Single-player game over (unchanged). */}
        {gameOver && !inRoom && (
          <div className={styles.gameOver}>
            <h3>Game Over!</h3>
            <p>Final Score: {gameOver.score}</p>
            <p>Hit Rate: {gameOver.hitRate}%</p>
            <button type="button" className={styles.restartBtn} onClick={restart}>
              Restart
            </button>
            <button type="button" className={styles.restartBtn} onClick={quitToMenu}>
              Menu
            </button>
          </div>
        )}

        {/* Multiplayer: you're out, but the opponent is still flying —
            spectate their live score until they finish (#82). */}
        {gameOver && inRoom && !remoteResult && (
          <div className={styles.gameOver}>
            <h3>You Finished!</h3>
            <p>Your Score: {gameOver.score}</p>
            <p className={styles.spectateNote}>
              <span className={styles.spinner} aria-hidden="true" />
              Waiting for {opponentName}…
            </p>
            <p className={styles.spectateScore}>
              {opponentName}: {remoteScore}
            </p>
            <button type="button" className={styles.restartBtn} onClick={backToRoom}>
              Back to Lobby
            </button>
          </div>
        )}

        {/* Multiplayer: both done — final head-to-head results (#82). */}
        {gameOver && inRoom && remoteResult && (() => {
          const outcome = matchOutcome(gameOver.score, remoteResult.score);
          const youWin = outcome === "win";
          const oppWin = outcome === "lose";
          return (
            <div className={styles.gameOver}>
              <h3 className={styles.resultsTitle}>{OUTCOME_LABEL[outcome]}</h3>
              <table className={styles.resultsTable}>
                <thead>
                  <tr>
                    <th />
                    <th className={youWin ? styles.resultWin : undefined}>You</th>
                    <th className={oppWin ? styles.resultWin : undefined}>{opponentName}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Score</td>
                    <td>{gameOver.score}</td>
                    <td>{remoteResult.score}</td>
                  </tr>
                  <tr>
                    <td>Hits</td>
                    <td>{gameOver.hits ?? 0}</td>
                    <td>{remoteResult.hits}</td>
                  </tr>
                  <tr>
                    <td>Best Combo</td>
                    <td>×{gameOver.bestMultiplier ?? 1} ({gameOver.bestCombo ?? 0})</td>
                    <td>×{remoteResult.bestMultiplier} ({remoteResult.bestCombo})</td>
                  </tr>
                </tbody>
              </table>
              <button type="button" className={styles.restartBtn} onClick={backToRoom}>
                Rematch
              </button>
              <button type="button" className={styles.restartBtn} onClick={quitToMenu}>
                Menu
              </button>
            </div>
          );
        })()}

        {/* Still flying, but the opponent already crashed out (#82). */}
        {gameState === "playing" && inRoom && remoteResult && !gameOver && (
          <div className={styles.oppFinishedBanner}>
            {opponentName} finished — {remoteResult.score}
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
