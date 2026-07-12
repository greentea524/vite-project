import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { TableView, ResultsOverlay, PauseOverlay } from "./Table.jsx";
import { Network } from "./network.js";
import { buildJoinLink } from "./joinLink.js";
import { classifyHand, canBeat, canPass, HAND_TYPE_LABEL } from "./rules.js";
import "./big2.css";

/**
 * Online Big 2 (KAN-63): entry (name + create/join), lobby with invite
 * link, then the server-authoritative game. The server deals and
 * validates; this component only renders its private hand + the public
 * state and sends play/pass intentions.
 */
function Online({ joinCode, onExit }) {
  const netRef = useRef(null);
  if (!netRef.current) netRef.current = new Network();
  const net = netRef.current;

  const [connState, setConnState] = useState("connecting"); // connecting | up | lost
  const [phase, setPhase] = useState("entry"); // entry | lobby | playing
  const [name, setName] = useState(
    () => window.localStorage.getItem("big2:name") || ""
  );
  const [codeInput, setCodeInput] = useState(joinCode);
  const [busy, setBusy] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [roster, setRoster] = useState([]);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const autoJoinTried = useRef(false);

  const [mySeat, setMySeat] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rejection, setRejection] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    Network.warmUp(); // KAN-53: poke a sleeping free-tier host early
    const offs = [
      net.on("connected", () => setConnState("up")),
      net.on("disconnected", () => setConnState("lost")),
      net.on("roster", (r) => setRoster([...r])),
      net.on("hand", ({ seat, hand }) => {
        setMySeat(seat);
        setMyHand(hand);
        setSelectedIds(new Set());
        setRejection("");
        setResult(null); // a fresh deal closes the results screen
      }),
      net.on("state", (state) => {
        setGameState(state);
        setPhase("playing");
      }),
      net.on("rejected", ({ reason }) => setRejection(reason)),
      net.on("roundOver", (r) => setResult(r)),
    ];
    net.connect();
    return () => {
      offs.forEach((off) => off());
      net.destroy();
    };
  }, [net]);

  const submitEntry = async (create) => {
    const cleanName = name.trim() || "Player";
    window.localStorage.setItem("big2:name", cleanName);
    setBusy(true);
    setEntryError("");
    const res = create
      ? await net.createRoom(cleanName)
      : await net.joinRoom(codeInput.trim().toUpperCase(), cleanName);
    setBusy(false);
    if (res?.ok) setPhase("lobby");
    else setEntryError(res?.error || "Something went wrong — try again.");
  };

  // Auto-join (#110): arriving via an invite link / QR scan joins the
  // room as soon as the socket is up — no button press needed. One
  // attempt only, so a dead room falls back to the entry form with the
  // code prefilled and the error shown.
  useEffect(() => {
    if (!joinCode || autoJoinTried.current) return;
    if (connState !== "up" || phase !== "entry" || busy) return;
    autoJoinTried.current = true;
    submitEntry(false);
  });

  // Lobby QR code (#110): render the invite link as a scannable image,
  // same qrcode.toDataURL flow as the invasion/platformer lobbies.
  const joinLink = phase === "lobby" && net.roomCode ? buildJoinLink(net.roomCode) : "";
  useEffect(() => {
    if (!joinLink) {
      setQrDataUrl("");
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(joinLink, {
      margin: 1,
      width: 160,
      color: { dark: "#14532d", light: "#ffffff" },
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
  }, [joinLink]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildJoinLink(net.roomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // ----- derived game view -----
  const seatName = (i) => {
    if (!gameState) return "";
    const seat = gameState.seats[i];
    const label = i === mySeat ? "You" : seat.name;
    return seat.isBot ? `${label} 🤖` : label;
  };

  const isMyTurn =
    gameState && gameState.winner === null && gameState.turn === mySeat;
  const selectedCards = useMemo(
    () => myHand.filter((c) => selectedIds.has(c.id)),
    [myHand, selectedIds]
  );
  const selection = classifyHand(selectedCards);
  const playable = isMyTurn && canBeat(selectedCards, gameState?.trick?.cards);
  const passable = isMyTurn && canPass(gameState?.trick?.cards);

  const toggleCard = (id) => {
    setRejection("");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  let hint = null;
  if (rejection) {
    hint = <span className="big2-hint big2-hint-bad">{rejection}</span>;
  } else if (selectedCards.length > 0) {
    if (!selection) {
      hint = <span className="big2-hint big2-hint-bad">Not a valid combination</span>;
    } else if (!playable && isMyTurn) {
      hint = (
        <span className="big2-hint big2-hint-bad">
          {HAND_TYPE_LABEL[selection.type]} can’t beat the current trick
        </span>
      );
    } else {
      hint = (
        <span className="big2-hint big2-hint-ok">{HAND_TYPE_LABEL[selection.type]}</span>
      );
    }
  }

  // ----- screens -----
  if (connState === "lost") {
    return (
      <div className="big2-panel">
        <h2>Connection lost</h2>
        <p>The game server dropped the connection.</p>
        <button type="button" onClick={onExit}>
          Back to menu
        </button>
      </div>
    );
  }

  if (phase === "entry") {
    // Mid auto-join from an invite link: skip the form entirely.
    if (joinCode && busy && !entryError) {
      return (
        <div className="big2-panel">
          <h2>Joining room {joinCode.toUpperCase()}…</h2>
          <p className="big2-muted">Connecting you to the game.</p>
        </div>
      );
    }
    return (
      <div className="big2-panel">
        <h2>Play with friends</h2>
        {connState === "connecting" && (
          <p className="big2-muted">
            Connecting to the game server… (free hosting can take up to a
            minute to wake up)
          </p>
        )}
        <label className="big2-field">
          Your name
          <input
            type="text"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player"
          />
        </label>
        <div className="big2-entry-actions">
          <button
            type="button"
            disabled={busy || connState !== "up"}
            onClick={() => submitEntry(true)}
          >
            Create room
          </button>
          <span className="big2-muted">or</span>
          <input
            type="text"
            className="big2-code-input"
            value={codeInput}
            maxLength={4}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="CODE"
            aria-label="Room code"
          />
          <button
            type="button"
            disabled={busy || connState !== "up" || codeInput.trim().length < 4}
            onClick={() => submitEntry(false)}
          >
            Join room
          </button>
        </div>
        {entryError && <p className="big2-error">{entryError}</p>}
        <button type="button" className="big2-link-btn" onClick={onExit}>
          ‹ Back to menu
        </button>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <div className="big2-panel">
        <h2>
          Room <span className="big2-room-code">{net.roomCode}</span>
        </h2>
        <p className="big2-muted">
          Share the code, link, or QR — bots fill any empty seats when the
          host starts.
        </p>
        {qrDataUrl && (
          <img
            className="big2-qr"
            src={qrDataUrl}
            alt={`QR code to join room ${net.roomCode}`}
          />
        )}
        {joinLink && <p className="big2-join-link">{joinLink}</p>}
        <button type="button" onClick={copyLink}>
          {copied ? "Copied!" : "Copy invite link"}
        </button>
        <ul className="big2-roster">
          {roster.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === net.hostId && " (host)"}
              {p.id === net.playerId && " — you"}
            </li>
          ))}
          {Array.from({ length: Math.max(0, 4 - roster.length) }, (_, i) => (
            <li key={`bot-${i}`} className="big2-muted">
              Bot 🤖
            </li>
          ))}
        </ul>
        {net.isHost ? (
          <button type="button" onClick={() => net.startGame()}>
            Start game
          </button>
        ) : (
          <p className="big2-muted">Waiting for the host to start…</p>
        )}
        <button type="button" className="big2-link-btn" onClick={onExit}>
          ‹ Leave room
        </button>
      </div>
    );
  }

  // phase === "playing"
  if (!gameState || mySeat === null) return null;
  const seatAt = (offset) => {
    const i = (mySeat + offset) % 4;
    return {
      name: seatName(i),
      count: gameState.counts[i],
      active: gameState.winner === null && gameState.turn === i,
    };
  };
  const trick = gameState.trick
    ? {
        cards: gameState.trick.cards,
        label: `${HAND_TYPE_LABEL[classifyHand(gameState.trick.cards)?.type]} by ${seatName(gameState.trick.owner)}`,
      }
    : null;

  return (
    <div className="big2-table-page">
      {menuOpen && !result && (
        <PauseOverlay
          title="Menu"
          note="The game keeps going while this is open — a bot plays your turn if you leave."
          onResume={() => setMenuOpen(false)}
        >
          <button type="button" className="big2-link-btn" onClick={onExit}>
            Leave game
          </button>
        </PauseOverlay>
      )}
      {result && (
        <ResultsOverlay
          title={`Round ${result.round} — ${seatName(result.winner)} ${
            result.winner === mySeat ? "win" : "wins"
          }!`}
          rows={gameState.seats.map((seat, i) => ({
            name: seatName(i) || seat.name,
            isWinner: i === result.winner,
            cards: result.hands[i],
            doubledByTwos: result.breakdown[i].doubledByTwos,
            doubledByStrong: result.breakdown[i].doubledByStrong,
            delta: result.deltas[i],
            total: result.totals[i],
          }))}
        >
          {net.isHost ? (
            <button type="button" onClick={() => net.newRound()}>
              Play again
            </button>
          ) : (
            <span className="big2-muted">Waiting for the host…</span>
          )}
          <button type="button" className="big2-link-btn" onClick={onExit}>
            Leave room
          </button>
        </ResultsOverlay>
      )}
      <TableView
        opponents={[seatAt(1), seatAt(2), seatAt(3)]}
        trick={trick}
        leadText={`New trick — ${seatName(gameState.turn)} lead${
          gameState.turn === mySeat ? "" : "s"
        } anything`}
        turnText={
          gameState.winner === null
            ? isMyTurn
              ? "Your turn"
              : `${seatName(gameState.turn)}’s turn`
            : null
        }
        myActive={Boolean(isMyTurn)}
        myHand={myHand}
        selectedIds={selectedIds}
        onToggleCard={toggleCard}
        onPlay={() => playable && net.play([...selectedIds])}
        onPass={() => passable && net.pass()}
        playEnabled={Boolean(playable)}
        passEnabled={Boolean(passable)}
        hint={hint}
        onMenu={() => setMenuOpen(true)}
      />
    </div>
  );
}

export default Online;
