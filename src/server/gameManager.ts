import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { joinMatch } from "../lib/match";
import { sendPushToUser } from "../lib/push";
import {
  persistCompletedGame,
  type CompletedGameWrite,
} from "./completedGamePersistence";
import { KeyedSerialQueue, SingleFlight } from "./keyedCoordination";
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
  gameSeed: number | null;
  game: GameState | null;
  ready: Set<string>; // userIds ready for the next game
}

interface FiveOGlobals {
  __fiveOMatches?: Map<string, LiveMatch>;
  __fiveOMatchLoads?: SingleFlight<string, LiveMatch | null>;
  __fiveOMatchMutations?: KeyedSerialQueue<string>;
}

/**
 * In-memory coordination survives development hot reloads. It intentionally
 * coordinates one Node process; deployment remains single-replica until the
 * live registry and locks move to a shared store.
 */
const fiveOGlobals = globalThis as FiveOGlobals;
const registry = fiveOGlobals.__fiveOMatches ?? new Map<string, LiveMatch>();
const matchLoads =
  fiveOGlobals.__fiveOMatchLoads ??
  new SingleFlight<string, LiveMatch | null>();
const matchMutations =
  fiveOGlobals.__fiveOMatchMutations ?? new KeyedSerialQueue<string>();
fiveOGlobals.__fiveOMatches = registry;
fiveOGlobals.__fiveOMatchLoads = matchLoads;
fiveOGlobals.__fiveOMatchMutations = matchMutations;

function room(matchId: string) {
  return `match:${matchId}`;
}

async function readLiveFromDatabase(matchId: string): Promise<LiveMatch | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { host: true, guest: true },
  });
  if (!m) return null;

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
    gameSeed: m.gameSeed,
    game: m.gameState ? (JSON.parse(m.gameState) as GameState) : null,
    ready: new Set<string>(),
  };
  if (m.readyHost) live.ready.add(m.host.id);
  if (m.guest && m.readyGuest) live.ready.add(m.guest.id);
  return live;
}

async function refreshMembership(
  matchId: string,
  cached: LiveMatch,
): Promise<LiveMatch | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { host: true, guest: true },
  });
  if (!m) {
    registry.delete(matchId);
    return null;
  }

  // REST owns seat acquisition. Reconcile only the one legal lobby-to-active
  // transition, never replacing a newer in-memory turn with persisted JSON.
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

/**
 * Load a match once. The registry is checked both before and after the await so
 * simultaneous cold callers can never install competing LiveMatch objects.
 */
async function getLive(
  matchId: string,
  shouldRefreshMembership = false,
): Promise<LiveMatch | null> {
  const cached = registry.get(matchId);
  if (cached) {
    return shouldRefreshMembership
      ? refreshMembership(matchId, cached)
      : cached;
  }

  return matchLoads.run(matchId, async () => {
    const beforeRead = registry.get(matchId);
    if (beforeRead) return beforeRead;

    const loaded = await readLiveFromDatabase(matchId);
    const installedWhileReading = registry.get(matchId);
    if (installedWhileReading) return installedWhileReading;
    if (loaded) registry.set(matchId, loaded);
    return loaded;
  });
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
      gameSeed: live.gameSeed,
      gameState: live.game ? JSON.stringify(live.game) : null,
      readyHost: live.ready.has(live.host.userId),
      readyGuest: live.guest ? live.ready.has(live.guest.userId) : false,
    },
  });
}

function cloneLive(live: LiveMatch): LiveMatch {
  return {
    ...live,
    host: { ...live.host },
    guest: live.guest ? { ...live.guest } : null,
    game: live.game ? structuredClone(live.game) : null,
    ready: new Set(live.ready),
  };
}

function restoreLive(live: LiveMatch, prior: LiveMatch): void {
  live.status = prior.status;
  live.targetWins = prior.targetWins;
  live.host = prior.host;
  live.guest = prior.guest;
  live.scoreHost = prior.scoreHost;
  live.scoreGuest = prior.scoreGuest;
  live.matchWinnerId = prior.matchWinnerId;
  live.gameNumber = prior.gameNumber;
  live.gameSeed = prior.gameSeed;
  live.game = prior.game;
  live.ready = prior.ready;
}

/** Keep process memory aligned with the database when a write rolls back. */
async function persistLiveMutation<T>(
  live: LiveMatch,
  mutation: () => Promise<T>,
): Promise<T> {
  const prior = cloneLive(live);
  try {
    return await mutation();
  } catch (error) {
    restoreLive(live, prior);
    throw error;
  }
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
  live.gameSeed = seed;
  live.game = createGame(
    { userId: live.host.userId, displayName: live.host.displayName },
    { userId: live.guest.userId, displayName: live.guest.displayName },
    { seed, firstLead },
  );
}

async function persistAndScore(live: LiveMatch) {
  const game = live.game;
  if (
    live.status !== "active" ||
    !game ||
    !game.result ||
    !live.guest
  ) {
    return;
  }

  const write: CompletedGameWrite = {
    matchId: live.id,
    gameNumber: live.gameNumber,
    seed: live.gameSeed ?? 0,
    hostId: live.host.userId,
    guestId: live.guest.userId,
    scoreHost: live.scoreHost,
    scoreGuest: live.scoreGuest,
    targetWins: live.targetWins,
    result: game.result,
    gameStateJson: JSON.stringify(game),
    boardJson: JSON.stringify(
      game.players.map((player) => ({
        rows: player.rows,
        hand: player.hand,
      })),
    ),
    readyHost: live.ready.has(live.host.userId),
    readyGuest: live.ready.has(live.guest.userId),
  };
  const outcome = await persistCompletedGame(prisma, write);
  live.scoreHost = outcome.scoreHost;
  live.scoreGuest = outcome.scoreGuest;
  live.status = outcome.status;
  live.matchWinnerId = outcome.winnerId;
}

function isMatchComplete(live: LiveMatch): boolean {
  return live.status === "complete";
}

// ----- Socket event handlers -----

export async function handleJoin(io: IO, socket: SocketT, code: string) {
  const userId = socket.data.userId as string;
  const joined = await joinMatch(code, userId);
  if (!joined.ok) {
    socket.emit("errorMsg", { message: joined.error });
    return;
  }
  await matchMutations.run(joined.matchId, async () => {
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

    if (
      live.status === "active" &&
      live.game?.phase === "complete" &&
      live.game.result
    ) {
      await persistLiveMutation(live, () => persistAndScore(live));
    }

    // Auto-start exactly once after both seats are filled.
    if (
      live.guest &&
      live.status === "active" &&
      !live.game &&
      live.gameNumber === 0
    ) {
      await persistLiveMutation(live, async () => {
        startGame(live);
        await saveState(live);
      });
      await broadcast(io, live);
      await maybeNotifyTurn(io, live);
      return;
    }

    await broadcast(io, live);
  });
}

export async function handlePlace(
  io: IO,
  socket: SocketT,
  cardId: string,
  row: number,
) {
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  await matchMutations.run(matchId, () =>
    applyMove(io, socket, (game, seat) => placeCard(game, seat, cardId, row)),
  );
}

export async function handleDiscard(io: IO, socket: SocketT, cardId: string) {
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  await matchMutations.run(matchId, () =>
    applyMove(io, socket, (game, seat) => discardCard(game, seat, cardId)),
  );
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

  let completed = false;
  try {
    await persistLiveMutation(live, async () => {
      move(live.game!, seat);
      completed = live.game!.phase === "complete";
      if (completed) await persistAndScore(live);
      else await saveState(live);
    });
  } catch (err) {
    if (err instanceof IllegalMoveError) {
      socket.emit("errorMsg", { message: err.message });
      return;
    }
    throw err;
  }

  await broadcast(io, live);
  if (!completed) await maybeNotifyTurn(io, live);
}

export async function handleNext(io: IO, socket: SocketT) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  await matchMutations.run(matchId, async () => {
    const live = registry.get(matchId);
    if (!live || live.status === "complete" || !live.guest) return;
    if (live.game && live.game.phase !== "complete") return;

    // Retry a completion whose prior transaction rolled back before accepting
    // readiness for the next game. Keep it separate from the following save so
    // a later readiness failure never rolls memory behind a committed score.
    if (live.game?.phase === "complete" && live.game.result) {
      await persistLiveMutation(live, () => persistAndScore(live));
    }
    if (isMatchComplete(live)) {
      await broadcast(io, live);
      return;
    }

    let bothReady = false;
    await persistLiveMutation(live, async () => {
      live.ready.add(userId);
      bothReady =
        live.ready.has(live.host.userId) && live.ready.has(live.guest!.userId);
      if (bothReady) startGame(live);
      await saveState(live);
    });
    await broadcast(io, live);
    if (bothReady) await maybeNotifyTurn(io, live);
  });
}

/** A player voluntarily ends the match; it is marked complete for both. */
export async function handleEndMatch(io: IO, socket: SocketT) {
  const userId = socket.data.userId as string;
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  await matchMutations.run(matchId, async () => {
    const live = registry.get(matchId) ?? (await getLive(matchId));
    if (!live || seatOfUser(live, userId) === -1) return;
    if (live.status === "complete") return;

    await persistLiveMutation(live, async () => {
      live.status = "complete";
      live.ready.clear();
      // Keep live.game so the final board stays visible; the match is just
      // marked complete for both players.
      await saveState(live);
    });
    await broadcast(io, live);
  });
}

export async function handleDisconnect(io: IO, socket: SocketT) {
  const matchId = socket.data.matchId as string | undefined;
  if (!matchId) return;
  await matchMutations.run(matchId, async () => {
    const live = registry.get(matchId);
    if (live) await broadcast(io, live);
  });
}
