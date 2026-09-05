import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { joinMatch } from "../lib/match";
import { sendPushToUser } from "../lib/push";
import {
  createGame,
  placeCard,
  discardCard,
  viewFor,
  IllegalMoveError,
} from "../lib/game/engine";
import type { GameState, PlayerIndex } from "../lib/game/types";
import type {
  ClientToServerEvents,
  MatchSnapshot,
  ServerToClientEvents,
} from "../lib/realtime/events";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type SocketT = Socket<ClientToServerEvents, ServerToClientEvents>;

interface LiveMatch {
  id: string;
  inviteCode: string;
  status: "lobby" | "active" | "complete";
  targetWins: number;
  host: { userId: string; displayName: string };
  guest: { userId: string; displayName: string } | null;
  scoreHost: number;
  scoreGuest: number;
  matchWinnerId: string | null;
  gameNumber: number; // 1-based index of the current/last game
  game: GameState | null;
  ready: Set<string>; // userIds ready for the next game
}

/** In-memory registry of live matches, surviving dev hot reloads. */
const registry: Map<string, LiveMatch> =
  (globalThis as { __fiveOMatches?: Map<string, LiveMatch> }).__fiveOMatches ??
  new Map();
(globalThis as { __fiveOMatches?: Map<string, LiveMatch> }).__fiveOMatches =
  registry;

function room(matchId: string) {
  return `match:${matchId}`;
}

/** Load a match from the DB into the live registry (or return the cached one). */
async function getLive(
  matchId: string,
  refreshMembership = false,
): Promise<LiveMatch | null> {
  const cached = registry.get(matchId);
  if (cached && !refreshMembership) return cached;

  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { host: true, guest: true },
  });
  if (!m) {
    registry.delete(matchId);
    return null;
  }

  if (cached) {
    // REST owns seat acquisition. Reconcile only membership/status here so a
    // host's cached lobby cannot reject the guest who legitimately claimed the
    // seat, without replacing a newer in-memory turn with stale persisted JSON.
    cached.host = { userId: m.host.id, displayName: m.host.displayName };
    if (
      !cached.guest &&
      cached.status === "lobby" &&
      !cached.game &&
      m.guest &&
      m.status === "active"
    ) {
      cached.guest = {
        userId: m.guest.id,
        displayName: m.guest.displayName,
      };
      cached.status = "active";
    }
    if (m.status === "complete" || m.status === "abandoned") {
      cached.status = "complete";
    }
    return cached;
  }

  const live: LiveMatch = {
    id: m.id,
    inviteCode: m.inviteCode,
    status:
      m.status === "active"
        ? "active"
        : m.status === "lobby"
          ? "lobby"
          : "complete",
    targetWins: m.targetWins,
    host: { userId: m.host.id, displayName: m.host.displayName },
    guest: m.guest
      ? { userId: m.guest.id, displayName: m.guest.displayName }
      : null,
    scoreHost: m.scoreHost,
    scoreGuest: m.scoreGuest,
    matchWinnerId: m.winnerId,
    // Restore the persisted in-progress game so play resumes across app
    // closes and server restarts.
    gameNumber: m.gameNumber,
    game: m.gameState ? (JSON.parse(m.gameState) as GameState) : null,
    ready: new Set<string>(),
  };
  if (m.readyHost) live.ready.add(m.host.id);
  if (m.guest && m.readyGuest) live.ready.add(m.guest.id);
  registry.set(matchId, live);
  return live;
}

/** Persist the full live match + in-progress game so it can be resumed later. */
async function saveState(live: LiveMatch) {
  await prisma.match.update({
    where: { id: live.id },
    data: {
      status: live.status,
      gameNumber: live.gameNumber,
      scoreHost: live.scoreHost,
      scoreGuest: live.scoreGuest,
      winnerId: live.matchWinnerId,
      gameState: live.game ? JSON.stringify(live.game) : null,
      readyHost: live.ready.has(live.host.userId),
      readyGuest: live.guest ? live.ready.has(live.guest.userId) : false,
    },
  });
}

function seatOfUser(live: LiveMatch, userId: string): PlayerIndex | -1 {
  if (live.host.userId === userId) return 0;
  if (live.guest && live.guest.userId === userId) return 1;
  return -1;
}

function snapshotFor(live: LiveMatch, userId: string): MatchSnapshot {
  const opponentId =
    live.host.userId === userId ? live.guest?.userId : live.host.userId;
  return {
    matchId: live.id,
    inviteCode: live.inviteCode,
    status: live.status,
    targetWins: live.targetWins,
    host: live.host,
    guest: live.guest,
    scoreHost: live.scoreHost,
    scoreGuest: live.scoreGuest,
    gameNumber: live.gameNumber,
    matchWinnerId: live.matchWinnerId,
    youReady: live.ready.has(userId),
    opponentReady: opponentId ? live.ready.has(opponentId) : false,
  };
}

/** Push the current match snapshot + per-seat game view to everyone in the room. */
async function broadcast(io: IO, live: LiveMatch) {
  const sockets = await io.in(room(live.id)).fetchSockets();
  for (const s of sockets) {
    const userId = s.data.userId as string | undefined;
    if (!userId) continue;
    s.emit("match:snapshot", snapshotFor(live, userId));
    const seat = seatOfUser(live, userId);
    s.emit(
      "game:view",
      live.game && seat !== -1 ? viewFor(live.game, seat) : null,
    );
  }
}

/**
 * If it's a player's turn but they're not currently connected to the match,
 * send them an "it's your turn" push notification.
 */
async function maybeNotifyTurn(io: IO, live: LiveMatch) {
  if (!live.game || live.game.phase !== "playing" || !live.guest) return;
  const seat = live.game.toMove;
  const player = seat === 0 ? live.host : live.guest;
  const opponent = seat === 0 ? live.guest : live.host;

  const sockets = await io.in(room(live.id)).fetchSockets();
  const online = sockets.some((s) => s.data.userId === player.userId);
  if (online) return; // they're already looking at the game

  await sendPushToUser(player.userId, {
    title: "Your turn — Five-O Poker",
    body: `It's your move vs ${opponent.displayName}.`,
    url: `/play/${live.inviteCode}`,
  });
}

function startGame(live: LiveMatch) {
  if (!live.guest) return;
  live.gameNumber += 1;
  live.ready.clear();
  // Alternate who leads the first round of each game for fairness.
  const firstLead: PlayerIndex = ((live.gameNumber - 1) % 2) as PlayerIndex;
  const seed = Math.floor(Math.random() * 0x7fffffff);
  live.game = createGame(
    { userId: live.host.userId, displayName: live.host.displayName },
    { userId: live.guest.userId, displayName: live.guest.displayName },
    { seed, firstLead },
  );
}

async function persistAndScore(live: LiveMatch) {
  const game = live.game;
  if (!game || !game.result || !live.guest) return;
  const result = game.result;

  // Record the completed game.
  await prisma.game.create({
    data: {
      matchId: live.id,
      seed: 0,
      winnerSeat: result.winner,
      isFiveO: result.isFiveO,
      resultJson: JSON.stringify(result),
      boardJson: JSON.stringify(
        game.players.map((p) => ({ rows: p.rows, hand: p.hand })),
      ),
    },
  });

  // Update running match score.
  if (result.winner === 0) live.scoreHost += 1;
  else if (result.winner === 1) live.scoreGuest += 1;

  // Per-user lifetime stats.
  const hostId = live.host.userId;
  const guestId = live.guest.userId;
  await applyGameStats(hostId, guestId, result.winner, result.isFiveO);

  // Has anyone reached the target?
  let matchComplete = false;
  if (live.scoreHost >= live.targetWins) {
    live.matchWinnerId = hostId;
    matchComplete = true;
  } else if (live.scoreGuest >= live.targetWins) {
    live.matchWinnerId = guestId;
    matchComplete = true;
  }
  if (matchComplete) {
    live.status = "complete";
    await applyMatchStats(hostId, guestId, live.matchWinnerId!);
  }

  // Persist the completed game snapshot + updated scores/status so a
  // reconnecting player still sees the showdown and running match state.
  await saveState(live);
}

async function applyGameStats(
  hostId: string,
  guestId: string,
  winner: PlayerIndex | null,
  isFiveO: boolean,
) {
  const winnerId = winner === 0 ? hostId : winner === 1 ? guestId : null;
  const loserId = winner === 0 ? guestId : winner === 1 ? hostId : null;

  if (winnerId && loserId) {
    const w = await prisma.stats.update({
      where: { userId: winnerId },
      data: {
        gamesPlayed: { increment: 1 },
        gameWins: { increment: 1 },
        currentStreak: { increment: 1 },
        fiveOs: { increment: isFiveO ? 1 : 0 },
      },
    });
    if (w.currentStreak > w.bestStreak) {
      await prisma.stats.update({
        where: { userId: winnerId },
        data: { bestStreak: w.currentStreak },
      });
    }
    await prisma.stats.update({
      where: { userId: loserId },
      data: {
        gamesPlayed: { increment: 1 },
        gameLosses: { increment: 1 },
        currentStreak: 0,
      },
    });
  } else {
    // Push: both played, neither win/loss, streaks unchanged.
    await prisma.stats.updateMany({
      where: { userId: { in: [hostId, guestId] } },
      data: { gamesPlayed: { increment: 1 }, gamePushes: { increment: 1 } },
    });
  }
}

async function applyMatchStats(
  hostId: string,
  guestId: string,
  winnerId: string,
) {
  await prisma.stats.updateMany({
    where: { userId: { in: [hostId, guestId] } },
    data: { matchesPlayed: { increment: 1 } },
  });
  await prisma.stats.update({
    where: { userId: winnerId },
    data: { matchWins: { increment: 1 } },
  });
}

// ----- Socket event handlers -----

export async function handleJoin(io: IO, socket: SocketT, code: string) {
  const userId = socket.data.userId as string;
  const joined = await joinMatch(code, userId);
  if (!joined.ok) {
    socket.emit("errorMsg", { message: joined.error });
    return;
  }
  const live = await getLive(joined.matchId, true);
  if (!live) {
    socket.emit("errorMsg", { message: "Game not found" });
    return;
  }
  if (seatOfUser(live, userId) === -1) {
    socket.emit("errorMsg", { message: "You are not part of this game" });
    return;
  }

  socket.data.matchId = live.id;
  await socket.join(room(live.id));

  // Auto-start the first game once both seats are filled.
  if (
    live.guest &&
    live.status === "active" &&
    !live.game &&
    live.gameNumber === 0
  ) {
    startGame(live);
    await saveState(live);
    await broadcast(io, live);
    await maybeNotifyTurn(io, live);
    return;
  }

  await broadcast(io, live);
}

export async function handlePlace(
  io: IO,
  socket: SocketT,
  cardId: string,
  row: number,
) {
  await applyMove(io, socket, (game, seat) => placeCard(game, seat, cardId, row));
}

export async function handleDiscard(io: IO, socket: SocketT, cardId: string) {
  await applyMove(io, socket, (game, seat) => discardCard(game, seat, cardId));
}

async function applyMove(
  io: IO,
  socket: SocketT,
  move: (game: NonNullable<LiveMatch["game"]>, seat: PlayerIndex) => void,
) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId);
  if (!live || !live.game) return;

  if (live.status !== "active") {
    socket.emit("errorMsg", { message: "This match has ended" });
    return;
  }

  const seat = seatOfUser(live, userId);
  if (seat === -1) return;

  try {
    move(live.game, seat);
  } catch (err) {
    if (err instanceof IllegalMoveError) {
      socket.emit("errorMsg", { message: err.message });
      return;
    }
    throw err;
  }

  if (live.game.phase === "complete") {
    await persistAndScore(live);
    await broadcast(io, live);
  } else {
    await saveState(live);
    await broadcast(io, live);
    // Ping the player whose turn it now is, if they've stepped away.
    await maybeNotifyTurn(io, live);
  }
}

export async function handleNext(io: IO, socket: SocketT) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId);
  if (!live || live.status === "complete" || !live.guest) return;
  // Only meaningful once the current game is over.
  if (live.game && live.game.phase !== "complete") return;

  live.ready.add(userId);
  const bothReady =
    live.ready.has(live.host.userId) && live.ready.has(live.guest.userId);
  if (bothReady) {
    startGame(live);
  }
  await saveState(live);
  await broadcast(io, live);
  if (bothReady) await maybeNotifyTurn(io, live);
}

/** A player voluntarily ends the match; it is marked complete for both. */
export async function handleEndMatch(io: IO, socket: SocketT) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId) ?? (await getLive(matchId));
  if (!live || seatOfUser(live, userId) === -1) return;
  if (live.status === "complete") return;

  live.status = "complete";
  live.ready.clear();
  // Keep live.game so the final board stays visible; the match is just marked
  // complete for both players.
  await saveState(live);
  await broadcast(io, live);
}

export async function handleDisconnect(io: IO, socket: SocketT) {
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId);
  if (live) await broadcast(io, live);
}
