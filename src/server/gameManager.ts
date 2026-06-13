import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import {
  createGame,
  placeCard,
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
async function getLive(matchId: string): Promise<LiveMatch | null> {
  const cached = registry.get(matchId);
  if (cached) return cached;

  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { host: true, guest: true },
  });
  if (!m) return null;

  const live: LiveMatch = {
    id: m.id,
    inviteCode: m.inviteCode,
    status: m.status as LiveMatch["status"],
    targetWins: m.targetWins,
    host: { userId: m.host.id, displayName: m.host.displayName },
    guest: m.guest
      ? { userId: m.guest.id, displayName: m.guest.displayName }
      : null,
    scoreHost: m.scoreHost,
    scoreGuest: m.scoreGuest,
    matchWinnerId: m.winnerId,
    gameNumber: 0,
    game: null,
    ready: new Set(),
  };
  registry.set(matchId, live);
  return live;
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
      boardJson: JSON.stringify(game.players.map((p) => p.columns)),
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

  await prisma.match.update({
    where: { id: live.id },
    data: {
      scoreHost: live.scoreHost,
      scoreGuest: live.scoreGuest,
      status: live.status,
      winnerId: live.matchWinnerId,
    },
  });
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
  const match = await prisma.match.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });
  if (!match) {
    socket.emit("errorMsg", { message: "Game not found" });
    return;
  }
  const live = await getLive(match.id);
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
  }

  await broadcast(io, live);
}

export async function handlePlace(io: IO, socket: SocketT, column: number) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId);
  if (!live || !live.game) return;

  const seat = seatOfUser(live, userId);
  if (seat === -1) return;

  try {
    placeCard(live.game, seat, column);
  } catch (err) {
    if (err instanceof IllegalMoveError) {
      socket.emit("errorMsg", { message: err.message });
      return;
    }
    throw err;
  }

  if (live.game.phase === "complete") {
    await persistAndScore(live);
  }
  await broadcast(io, live);
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
  await broadcast(io, live);
}

export async function handleDisconnect(io: IO, socket: SocketT) {
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  const live = registry.get(matchId);
  if (live) await broadcast(io, live);
}
