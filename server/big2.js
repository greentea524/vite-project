// Server-authoritative Big 2 rooms (KAN-63) on the shared relay.
// Unlike the platformer/invasion relay traffic, all game logic runs
// here: the server deals, validates every play against the rules, and
// sends each player only their own hand (event "big2:hand"), so
// clients can't see or forge anything. Bots (KAN-61) fill empty seats
// and take over when a player disconnects mid-game.
//
// Events (client → server): big2:start, big2:play, big2:pass,
// big2:newRound. Events (server → client): big2:hand (private),
// big2:state (public), big2:rejected (private), big2:roundOver.

import { newGame, playCards, passTurn } from "../src/component/big2/game.js";
import { chooseBotMove } from "../src/component/big2/bot.js";
import { scoreRound } from "../src/component/big2/scoring.js";
import { PLAYER_COUNT } from "../src/component/big2/deck.js";

export const BIG2_GAME_TAG = "big2";
export const BIG2_MAX_PLAYERS = PLAYER_COUNT;
const BOT_NAMES = ["Bot Ming", "Bot Mei", "Bot Long", "Bot Wei"];
const MIN_BOT_DELAY_MS = 5; // tests dial it down; humans get 800-1200ms

// Public view of a room's game: names, seat kinds, card counts, whose
// turn, and the open trick — never hand contents.
function publicState(g) {
  return {
    seats: g.seats.map((s) => ({ name: s.name, isBot: !s.socketId })),
    counts: g.state.hands.map((h) => h.length),
    turn: g.state.turn,
    trick: g.state.trick,
    winner: g.state.winner,
    round: g.round,
  };
}

function emitHands(io, g) {
  g.seats.forEach((seat, i) => {
    if (seat.socketId) {
      io.to(seat.socketId).emit("big2:hand", { seat: i, hand: g.state.hands[i] });
    }
  });
}

function broadcast(io, code, g) {
  io.to(code).emit("big2:state", publicState(g));
}

function finishRound(io, code, g) {
  const { breakdown, deltas } = scoreRound(g.state.hands, g.state.winner);
  g.totals = g.totals.map((t, i) => t + deltas[i]);
  g.result = { breakdown, deltas };
  io.to(code).emit("big2:roundOver", {
    winner: g.state.winner,
    hands: g.state.hands, // reveal everyone's leftovers for the results screen
    breakdown,
    deltas,
    totals: g.totals,
    round: g.round,
  });
}

// Advance past the human action that just happened, then keep playing
// bot turns until it's a human's move (or the round ends).
function afterAction(io, code, room) {
  const g = room.big2;
  broadcast(io, code, g);
  if (g.state.winner !== null) {
    finishRound(io, code, g);
    return;
  }
  scheduleBot(io, code, room);
}

function scheduleBot(io, code, room) {
  const g = room.big2;
  if (!g || g.state.winner !== null) return;
  const seat = g.seats[g.state.turn];
  if (seat.socketId) return; // human's move
  const delay = g.botDelayMs ?? 800 + Math.random() * 400;
  g.timer = setTimeout(() => {
    // The room may have emptied (and been closed) while we slept.
    if (room.big2 !== g || g.state.winner !== null) return;
    const move = chooseBotMove(g.state.hands[g.state.turn], g.state.trick?.cards);
    g.state =
      move.type === "play" ? playCards(g.state, move.cardIds) : passTurn(g.state);
    afterAction(io, code, room);
  }, delay);
}

function startRound(io, code, room) {
  const g = room.big2;
  g.state = newGame();
  g.result = null;
  emitHands(io, g);
  broadcast(io, code, g);
  scheduleBot(io, code, room);
}

function seatOf(g, socketId) {
  return g.seats.findIndex((s) => s.socketId === socketId);
}

export function attachBig2(io, rooms, socket) {
  const getRoom = () => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    return room && room.game === BIG2_GAME_TAG ? { code, room } : null;
  };

  socket.on("big2:start", (payload = {}) => {
    const ctx = getRoom();
    if (!ctx || ctx.room.hostId !== socket.id || ctx.room.big2) return;
    const humans = [...ctx.room.players.values()].slice(0, BIG2_MAX_PLAYERS);
    const seats = Array.from({ length: BIG2_MAX_PLAYERS }, (_, i) =>
      i < humans.length
        ? { socketId: humans[i].id, name: humans[i].name }
        : { socketId: null, name: BOT_NAMES[i - humans.length] }
    );
    ctx.room.big2 = {
      seats,
      state: null,
      totals: Array(BIG2_MAX_PLAYERS).fill(0),
      round: 1,
      result: null,
      timer: null,
      botDelayMs: Number.isFinite(payload.botDelayMs)
        ? Math.max(MIN_BOT_DELAY_MS, Math.min(payload.botDelayMs, 2000))
        : null,
    };
    startRound(io, ctx.code, ctx.room);
  });

  socket.on("big2:play", ({ cardIds } = {}) => {
    const ctx = getRoom();
    const g = ctx?.room.big2;
    if (!g || g.result) return;
    const seat = seatOf(g, socket.id);
    if (seat !== g.state.turn) {
      socket.emit("big2:rejected", { reason: "Not your turn" });
      return;
    }
    const next = playCards(g.state, Array.isArray(cardIds) ? cardIds : []);
    if (next === g.state) {
      socket.emit("big2:rejected", { reason: "That play isn’t valid here" });
      return;
    }
    g.state = next;
    socket.emit("big2:hand", { seat, hand: g.state.hands[seat] });
    afterAction(io, ctx.code, ctx.room);
  });

  socket.on("big2:pass", () => {
    const ctx = getRoom();
    const g = ctx?.room.big2;
    if (!g || g.result) return;
    const seat = seatOf(g, socket.id);
    if (seat !== g.state.turn) {
      socket.emit("big2:rejected", { reason: "Not your turn" });
      return;
    }
    const next = passTurn(g.state);
    if (next === g.state) {
      socket.emit("big2:rejected", { reason: "The trick opener can’t pass" });
      return;
    }
    g.state = next;
    afterAction(io, ctx.code, ctx.room);
  });

  socket.on("big2:newRound", () => {
    const ctx = getRoom();
    const g = ctx?.room.big2;
    if (!g || !g.result || ctx.room.hostId !== socket.id) return;
    // Seat any humans who joined the room mid-round in place of bots.
    const seated = new Set(g.seats.map((s) => s.socketId).filter(Boolean));
    const waiting = [...ctx.room.players.values()].filter((p) => !seated.has(p.id));
    for (const seat of g.seats) {
      if (!seat.socketId && waiting.length > 0) {
        const p = waiting.shift();
        seat.socketId = p.id;
        seat.name = p.name;
      }
    }
    g.round += 1;
    startRound(io, ctx.code, ctx.room);
  });
}

// A player left the room (relay's leave()): their seat plays on as a
// bot so the game never stalls for the others.
export function big2OnLeave(io, code, room, socketId) {
  const g = room.big2;
  if (!g) return;
  const seat = seatOf(g, socketId);
  if (seat === -1) return;
  g.seats[seat] = { socketId: null, name: `${g.seats[seat].name} (bot)` };
  broadcast(io, code, g);
  if (!g.result) scheduleBot(io, code, room);
}

// The room emptied and is being deleted: stop any pending bot timer.
export function big2OnRoomClosed(room) {
  if (room.big2?.timer) clearTimeout(room.big2.timer);
  room.big2 = null;
}
