import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "./platformer.css";
import { GameState, AVATAR_NAMES, START_LIVES } from "./state.js";
import { Engine, VIEW_W, VIEW_H, LABEL_SCALE } from "./game.js";
import { AVATAR_SHEETS, IMAGE_URLS } from "./assets.js";
import { WORLDS } from "./levels.js";
import { Network, MAX_PLAYERS } from "./network.js";

// mm:ss.d for the leaderboard/results (PLAT-24).
function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

const LEVEL_LABEL = (i) => `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`;

function buildJoinLink(code) {
  if (typeof window === "undefined" || !code) return "";
  const url = new URL(window.location.href);
  url.searchParams.set("join", code);
  url.hash = "";
  return url.toString();
}

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
  const labelCanvasRef = useRef(null);
  const engineRef = useRef(null);
  const shellRef = useRef(null);
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = new GameState();
  const state = stateRef.current;
  const networkRef = useRef(null);
  if (!networkRef.current && Network.isConfigured())
    networkRef.current = new Network();
  const network = networkRef.current;
  // Live level/time for remote players, updated per message without
  // re-rendering; the leaderboard samples it on a timer (PLAT-24).
  const remoteLatestRef = useRef(new Map());
  const sentFinishRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  // iPhone Safari has no Fullscreen API for arbitrary elements — hide
  // the button entirely there rather than showing a no-op control.
  const fullscreenSupported =
    typeof document !== "undefined" && !!document.fullscreenEnabled;
  // Primary input decides the control bar: coarse pointers (phones,
  // tablets) get the touch joystick; fine pointers (desktop) play on
  // the keyboard, so show key hints instead of irrelevant controls.
  const touchDevice =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  const [screen, setScreen] = useState(state.screen);
  const [coins, setCoins] = useState(state.coins);
  const [lives, setLives] = useState(state.lives);
  const [avatar, setAvatar] = useState(state.selectedAvatar);
  const [levelIndex, setLevelIndex] = useState(state.currentLevel);

  // Multiplayer UI state (PLAT-23/24).
  const [playerName, setPlayerName] = useState("");
  const [lobbyMode, setLobbyMode] = useState("choose"); // choose | room
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [roster, setRoster] = useState([]);
  const [mpError, setMpError] = useState("");
  // Relay connection status for the lobby (KAN-53). Free hosting naps
  // when idle, so the first connection can take ~30-60s:
  // connecting -> waking (after a grace period or the first
  // connect_error) -> connected, or failed after ~90s.
  const [connStatus, setConnStatus] = useState("connecting");
  const [retryTick, setRetryTick] = useState(0);
  const [standings, setStandings] = useState([]);
  const [countdown, setCountdown] = useState(null); // synced-start 3-2-1
  const autoJoinRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get("join")?.trim().toUpperCase();
    if (!joinParam) return;
    setJoinCode(joinParam);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("join");
    window.history.replaceState({}, "", nextUrl);
    autoJoinRef.current = true;
  }, []);

  useEffect(() => {
    const engine = new Engine(canvasRef.current, state, labelCanvasRef.current);
    engineRef.current = engine;
    const unsubs = [
      state.on("screen", setScreen),
      state.on("coins", setCoins),
      state.on("lives", setLives),
      state.on("level", setLevelIndex),
    ];
    if (network) {
      engine.attachNetwork(network);
      unsubs.push(
        network.on("roster", setRoster),
        // Connection lifecycle drives the lobby status. connect_error
        // is routed here too — during a cold start those are expected,
        // so they surface as "waking", not as a raw error message.
        network.on("connected", () => setConnStatus("connected")),
        network.on("disconnected", () =>
          setConnStatus((s) => (s === "failed" ? s : "connecting")),
        ),
        network.on("error", () =>
          setConnStatus((s) =>
            s === "connected" || s === "failed" ? s : "waking",
          ),
        ),
        network.on("remoteState", (snap) =>
          remoteLatestRef.current.set(snap.id, {
            level: snap.level,
            runTimeMs: snap.runTimeMs,
            finished: snap.finished,
          }),
        ),
        network.on("playerFinished", ({ id, totalTimeMs }) => {
          const prev = remoteLatestRef.current.get(id) ?? {};
          remoteLatestRef.current.set(id, {
            ...prev,
            finished: true,
            runTimeMs: totalTimeMs ?? prev.runTimeMs,
          });
        }),
        network.on("playerLeft", ({ id }) =>
          remoteLatestRef.current.delete(id),
        ),
      );
    }
    engine.start();
    return () => {
      for (const unsub of unsubs) unsub();
      engine.destroy();
      network?.destroy();
      engineRef.current = null;
    };
  }, [state, network]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Enter advances the post-level screens without the mouse (PG-56):
  // world map → next level, game over → retry. The engine's Input only
  // tracks gameplay actions and is frozen on these screens, so this is
  // a plain listener. The win screen is deliberately excluded — Enter
  // out of habit would dismiss the race results.
  useEffect(() => {
    if (screen !== "worldmap" && screen !== "gameover") return undefined;
    const onKey = (e) => {
      if (e.key !== "Enter" || e.repeat) return;
      e.preventDefault();
      if (screen === "worldmap") state.continueFromWorldMap();
      else state.retryLevel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, state]);

  // Grace/fail timers while waiting for the relay in the lobby
  // (KAN-53): after 4s of silence assume it's a cold start ("waking"),
  // after 90s give up and offer a retry. Socket.io keeps reconnecting
  // in the background the whole time, so "connected" can still arrive
  // and win at any point.
  useEffect(() => {
    if (screen !== "lobby" || !network) return undefined;
    if (network.isConnected) {
      setConnStatus("connected");
      return undefined;
    }
    setConnStatus("connecting");
    const wake = setTimeout(
      () => setConnStatus((s) => (s === "connecting" ? "waking" : s)),
      4000,
    );
    const fail = setTimeout(
      () => setConnStatus((s) => (s === "connected" ? s : "failed")),
      90000,
    );
    return () => {
      clearTimeout(wake);
      clearTimeout(fail);
    };
  }, [screen, network, retryTick]);

  useEffect(() => {
    if (!roomCode && !network?.roomCode) {
      setJoinLink("");
      setQrDataUrl("");
      return;
    }
    const nextRoomCode = roomCode || network?.roomCode || "";
    const nextLink = buildJoinLink(nextRoomCode);
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
  }, [roomCode, network?.roomCode]);

  useEffect(() => {
    if (
      !autoJoinRef.current ||
      !network ||
      connStatus !== "connected" ||
      screen !== "menu"
    )
      return;
    autoJoinRef.current = false;
    openMultiplayer();
  }, [network, connStatus, screen]);

  useEffect(() => {
    if (
      !autoJoinRef.current ||
      screen !== "lobby" ||
      lobbyMode !== "choose" ||
      !joinCode.trim()
    )
      return;
    autoJoinRef.current = false;
    void joinRace();
  }, [screen, lobbyMode, joinCode]);

  const retryConnect = () => {
    Network.warmUp();
    network?.connect();
    setRetryTick((t) => t + 1); // restarts the grace/fail timers
  };

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
          // window.screen — the local `screen` here is the game-state string.
          await window.screen.orientation.lock("landscape");
        } catch {
          // orientation lock unsupported — fullscreen alone is fine
        }
      } else {
        try {
          window.screen.orientation.unlock();
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

  // --- Multiplayer lobby + race (PLAT-23/24) ---
  const openMultiplayer = () => {
    setMpError("");
    setLobbyMode("choose");
    setRoster([]);
    Network.warmUp(); // HTTP ping wakes a sleeping host early (KAN-53)
    network?.connect();
    state.openLobby();
  };

  const hostRace = async () => {
    setMpError("");
    const res = await network.createRoom(playerName || "Host", avatar);
    if (res?.ok) {
      setRoomCode(res.code);
      setLobbyMode("room");
    } else {
      setMpError(res?.error || "Could not create room");
    }
  };

  const joinRace = async () => {
    setMpError("");
    const res = await network.joinRoom(
      joinCode.trim().toUpperCase(),
      playerName || "Player",
      avatar,
    );
    if (res?.ok) {
      setRoomCode(res.code);
      setLobbyMode("room");
    } else {
      setMpError(res?.error || "Could not join room");
    }
  };

  // Host clicks Start -> ask the server to start the synced countdown
  // for everyone (PLAT-30). The actual local start happens when the
  // raceStart broadcast comes back and the countdown reaches 0.
  const startRace = () => {
    if (network?.isHost) network.startRace();
  };

  const beginLocalRace = () => {
    remoteLatestRef.current.clear();
    sentFinishRef.current = false;
    state.multiplayer = true;
    state.startGame();
  };

  // Synced start: every client counts down from the same broadcast and
  // drops into level 1 together (PLAT-30).
  useEffect(() => {
    if (!network) return;
    return network.on("raceStart", ({ countdownMs }) => {
      setCountdown(Math.ceil((countdownMs ?? 3000) / 1000));
    });
  }, [network]);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown < 0) {
      // After "GO!" (0), drop into the race.
      setCountdown(null);
      beginLocalRace();
      return;
    }
    const t = setTimeout(
      () => setCountdown((c) => c - 1),
      countdown === 0 ? 500 : 1000,
    );
    return () => clearTimeout(t);
  }, [countdown]);

  // Send the finish once, when the race ends at the win screen.
  useEffect(() => {
    if (
      screen === "win" &&
      state.multiplayer &&
      network &&
      !sentFinishRef.current
    ) {
      sentFinishRef.current = true;
      network.sendFinished(Math.round(state.runTimeMs));
    }
  }, [screen, state, network]);

  // Leaving to the menu drops the room and clears race data.
  useEffect(() => {
    if (screen === "menu" && network) {
      network.leave();
      remoteLatestRef.current.clear();
      sentFinishRef.current = false;
      setStandings([]);
    }
  }, [screen, network]);

  // Sample a live leaderboard ~4x/sec while in a multiplayer race,
  // combining the roster (names/avatars) with per-message live data
  // for remotes and local GameState for self (PLAT-24).
  useEffect(() => {
    if (
      !network ||
      !state.multiplayer ||
      screen === "menu" ||
      screen === "lobby"
    )
      return;
    const build = () => {
      const list = network.roster.map((r) => {
        if (r.id === network.playerId) {
          return {
            id: r.id,
            name: r.name,
            self: true,
            level: state.currentLevel,
            runTimeMs: state.runTimeMs,
            finished: state.finished,
          };
        }
        const live = remoteLatestRef.current.get(r.id) ?? {};
        return {
          id: r.id,
          name: r.name,
          level: live.level ?? 0,
          runTimeMs: live.runTimeMs ?? 0,
          finished: Boolean(live.finished),
        };
      });
      list.sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.runTimeMs - b.runTimeMs;
        if (b.level !== a.level) return b.level - a.level;
        return a.runTimeMs - b.runTimeMs;
      });
      setStandings(list);
    };
    build();
    const timer = setInterval(build, 250);
    return () => clearInterval(timer);
  }, [network, screen, state]);

  // Enabled wherever a relay URL is configured (VITE_MULTIPLAYER_URL):
  // the production build bakes in the Render relay (PLAT-27), local dev
  // sets it in .env.local. The old LAN-only gate predated the public
  // relay and would have kept the button dead on the deployed site.
  const raceFriendEnabled = Boolean(network);
  const activeRoomCode = roomCode || network?.roomCode || "";

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
        {/* High-res overlay for crisp name labels over the pixel canvas. */}
        <canvas
          ref={labelCanvasRef}
          width={VIEW_W * LABEL_SCALE}
          height={VIEW_H * LABEL_SCALE}
          className="plat-label-canvas"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        />

        {inGame && (
          <div className="plat-hud">
            <span>Coins: {coins}</span>
            {/* Current world's stages, world-map style: done stages
                gold, the current one highlighted, the rest dimmed. */}
            <span
              className="plat-hud-stages"
              aria-label={`Level ${state.levelLabel()}`}
            >
              {WORLDS[state.worldOf(levelIndex)].map((_, s) => {
                const w = state.worldOf(levelIndex);
                const idx = state.flatIndex(w, s);
                const cls =
                  idx === levelIndex
                    ? " plat-hud-stage-current"
                    : state.isCompleted(idx)
                      ? " plat-hud-stage-done"
                      : " plat-hud-stage-todo";
                return (
                  <span key={s} className={`plat-hud-stage${cls}`}>
                    {w + 1}-{s + 1}
                  </span>
                );
              })}
            </span>
            <span>Lives: {lives}</span>
          </div>
        )}

        {state.multiplayer && inGame && standings.length > 0 && (
          <div className="plat-leaderboard">
            {standings.map((p, i) => (
              <div
                key={p.id}
                className={`plat-lb-row${p.self ? " plat-lb-self" : ""}`}
              >
                <span className="plat-lb-rank">{i + 1}</span>
                <span className="plat-lb-name">{p.name}</span>
                <span className="plat-lb-lvl">
                  {p.finished ? "✓" : LEVEL_LABEL(p.level)}
                </span>
                <span className="plat-lb-time">{formatTime(p.runTimeMs)}</span>
              </div>
            ))}
          </div>
        )}

        {countdown != null && (
          <div className="plat-overlay plat-countdown">
            <div className="plat-countdown-num">
              {countdown > 0 ? countdown : "GO!"}
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="plat-overlay">
            <h3 className="plat-title">Platform Game</h3>
            <div className="plat-help">
              <p className="plat-text">
                Reach the flag{" "}
                <SpriteIcon
                  sheet={IMAGE_URLS.flag}
                  frames={1}
                  size={12}
                  aspect={2}
                />{" "}
                to clear each level — six levels across two worlds.
              </p>
              <p className="plat-text">
                Grab coins{" "}
                <SpriteIcon sheet={IMAGE_URLS.coin} frames={2} size={16} /> ·
                stomp enemies{" "}
                <SpriteIcon sheet={IMAGE_URLS.enemy} frames={2} size={16} /> by
                landing on top · checkpoints{" "}
                <SpriteIcon
                  sheet={IMAGE_URLS.checkpoint}
                  frames={1}
                  size={16}
                />{" "}
                set your respawn.
              </p>
              <p className="plat-text">
                Avoid spikes{" "}
                <SpriteIcon sheet={IMAGE_URLS.spike} frames={1} size={16} /> and
                falling into pits — you have 3 lives per run.
              </p>
              <p className="plat-text">
                Move with A/D, ◀▶ keys, or the on-screen buttons · jump with
                Space or ▲ — hold for a higher jump, press again mid-air to
                double jump · pause with Esc or ❚❚.
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
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.startGame()}
            >
              Start
            </button>
            <button
              type="button"
              className="plat-btn"
              onClick={raceFriendEnabled ? openMultiplayer : undefined}
              disabled={!raceFriendEnabled}
              title={raceFriendEnabled ? "Race a friend" : "Work in progress"}
            >
              {raceFriendEnabled ? "Race a friend" : "Work in progress"}
            </button>
          </div>
        )}

        {screen === "lobby" && (
          <div className="plat-overlay">
            <h4 className="plat-title">Race a friend</h4>
            {lobbyMode === "choose" && (
              <div className="plat-lobby">
                {connStatus === "waking" && (
                  <p className="plat-text plat-conn">
                    <span className="plat-spinner" aria-hidden="true"></span>
                    Waking up the race server — free hosting naps when idle,
                    this can take ~30–60s…
                  </p>
                )}
                {connStatus === "connecting" && (
                  <p className="plat-text plat-conn">Connecting…</p>
                )}
                {connStatus === "failed" && (
                  <p className="plat-text plat-error">
                    Couldn't reach the race server.{" "}
                    <button
                      type="button"
                      className="plat-btn plat-btn-subtle plat-retry-btn"
                      onClick={retryConnect}
                    >
                      Retry
                    </button>
                  </p>
                )}
                <label className="plat-field">
                  <span className="plat-field-label">Your name</span>
                  <input
                    className="plat-input"
                    type="text"
                    maxLength={16}
                    placeholder="Player"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="plat-btn"
                  disabled={connStatus !== "connected"}
                  onClick={hostRace}
                >
                  Create room
                </button>
                <div className="plat-lobby-divider">or join a room</div>
                <input
                  className="plat-input plat-input-code"
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
                  className="plat-btn"
                  disabled={
                    connStatus !== "connected" || joinCode.trim().length < 4
                  }
                  onClick={joinRace}
                >
                  Join room
                </button>
                {mpError && <p className="plat-text plat-error">{mpError}</p>}
                <button
                  type="button"
                  className="plat-btn plat-btn-subtle"
                  onClick={() => state.mainMenu()}
                >
                  Back
                </button>
              </div>
            )}
            {lobbyMode === "room" && (
              <div className="plat-lobby">
                <p className="plat-text">
                  Room code: <span className="plat-code">{activeRoomCode}</span>
                </p>
                {qrDataUrl && (
                  <div className="plat-qr-card">
                    <img
                      className="plat-qr-image"
                      src={qrDataUrl}
                      alt="QR code to join the race room"
                    />
                    <p className="plat-text">Scan to join this room</p>
                    {joinLink && (
                      <p className="plat-text plat-link-text">{joinLink}</p>
                    )}
                  </div>
                )}
                <p className="plat-text">
                  Players ({roster.length}/{MAX_PLAYERS})
                </p>
                <ul className="plat-roster">
                  {roster.map((r) => (
                    <li key={r.id}>
                      <SpriteIcon
                        sheet={AVATAR_SHEETS[r.avatar] ?? AVATAR_SHEETS[0]}
                        frames={8}
                        size={16}
                      />{" "}
                      {r.name}
                      {r.id === network?.playerId ? " (you)" : ""}
                      {r.id === network?.hostId ? " 👑" : ""}
                    </li>
                  ))}
                </ul>
                {network?.isHost ? (
                  <button
                    type="button"
                    className="plat-btn"
                    onClick={startRace}
                  >
                    Start race
                  </button>
                ) : (
                  <p className="plat-text">Waiting for the host to start…</p>
                )}
                <button
                  type="button"
                  className="plat-btn plat-btn-subtle"
                  onClick={() => state.mainMenu()}
                >
                  Leave
                </button>
              </div>
            )}
          </div>
        )}

        {screen === "paused" && (
          <div className="plat-overlay plat-overlay-dim">
            <h4 className="plat-title">Paused</h4>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.resume()}
            >
              Resume
            </button>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.restartLevel()}
            >
              Restart
            </button>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.mainMenu()}
            >
              Quit to menu
            </button>
          </div>
        )}

        {screen === "gameover" && (
          <div className="plat-overlay">
            <h4 className="plat-title">Game Over</h4>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.retryLevel()}
            >
              Retry
            </button>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.mainMenu()}
            >
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
                        {done && (
                          <SpriteIcon
                            sheet={IMAGE_URLS.coin}
                            frames={2}
                            size={20}
                          />
                        )}
                        {next && (
                          <SpriteIcon
                            sheet={AVATAR_SHEETS[avatar]}
                            frames={8}
                            size={20}
                          />
                        )}
                        {!done && !next && <span className="plat-icon-blank" />}
                        {w + 1}-{s + 1}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="plat-btn"
              onClick={() => state.continueFromWorldMap()}
            >
              Continue
            </button>
            {!touchDevice && <p className="plat-enter-hint">or press Enter</p>}
          </div>
        )}

        {screen === "win" && (
          <div className="plat-overlay">
            {state.multiplayer ? (
              <>
                <h4 className="plat-title">Race Results 🏁</h4>
                <p className="plat-text">
                  Your time: {formatTime(state.runTimeMs)}
                </p>
                <div className="plat-results">
                  {standings.map((p, i) => (
                    <div
                      key={p.id}
                      className={`plat-lb-row${p.self ? " plat-lb-self" : ""}`}
                    >
                      <span className="plat-lb-rank">{i + 1}</span>
                      <span className="plat-lb-name">{p.name}</span>
                      <span className="plat-lb-time">
                        {p.finished
                          ? formatTime(p.runTimeMs)
                          : `${LEVEL_LABEL(p.level)}…`}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="plat-btn"
                  onClick={() => state.mainMenu()}
                >
                  Menu
                </button>
              </>
            ) : (
              <>
                <h4 className="plat-title">You Win! 🎉</h4>
                <p className="plat-text">Total coins: {coins}</p>
                <button
                  type="button"
                  className="plat-btn"
                  onClick={() => state.mainMenu()}
                >
                  Menu
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {inGame &&
        (touchDevice ? (
          <div className="plat-touch-bar">
            <VirtualJoystick onDirection={handleJoystick} />
            <div className="plat-touch-center">
              <button
                type="button"
                className="plat-touch-btn plat-touch-pause"
                onClick={() =>
                  screen === "paused" ? state.resume() : state.pause()
                }
              >
                ❚❚
              </button>
              {fullscreenSupported && (
                <button
                  type="button"
                  className="plat-touch-btn plat-touch-pause"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={toggleFullscreen}
                >
                  ⛶
                </button>
              )}
            </div>
            <TouchButton
              label="▲"
              className="plat-touch-jump"
              onPress={press("jump")}
              onRelease={release("jump")}
            />
          </div>
        ) : (
          // Desktop plays on the keyboard — show key hints instead of
          // touch controls. Fullscreen keeps a button (no key for it).
          <div className="plat-key-hints">
            <span className="plat-key-hint">
              <kbd>←</kbd>
              <kbd>→</kbd> move
            </span>
            <span className="plat-key-hint">
              <kbd>↑</kbd> / <kbd>Space</kbd> jump
            </span>
            <span className="plat-key-hint">
              <kbd>Esc</kbd> pause
            </span>
            {fullscreenSupported && (
              <button
                type="button"
                className="plat-touch-btn plat-touch-pause"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={toggleFullscreen}
              >
                ⛶
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

export default Platformer;
