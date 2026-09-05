import type { Prisma } from "@prisma/client";
import type { GameResult } from "../lib/game/types";

export interface TransactionRunner {
  $transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
}

export interface CompletedGameWrite {
  matchId: string;
  expectedGameNumber: number;
  seed: number;
  /** Exact serialized state that was persisted immediately before the final move. */
  expectedPriorGameStateJson: string | null;
  result: GameResult;
  gameStateJson: string;
  boardJson: string;
}

export interface CompletedGameOutcome {
  applied: boolean;
  scoreHost: number;
  scoreGuest: number;
  status: "active" | "complete";
  winnerId: string | null;
}

export class MatchPersistenceConflictError extends Error {}

const matchSelection = {
  hostId: true,
  guestId: true,
  scoreHost: true,
  scoreGuest: true,
  targetWins: true,
  status: true,
  gameNumber: true,
  gameSeed: true,
  gameState: true,
  readyHost: true,
  readyGuest: true,
  winnerId: true,
} satisfies Prisma.MatchSelect;

const gameSelection = {
  id: true,
  seed: true,
  winnerSeat: true,
  isFiveO: true,
  resultJson: true,
  boardJson: true,
} satisfies Prisma.GameSelect;

type AuthoritativeMatch = Prisma.MatchGetPayload<{
  select: typeof matchSelection;
}>;
type StoredGame = Prisma.GameGetPayload<{ select: typeof gameSelection }>;

function statusForOutcome(value: string): "active" | "complete" {
  if (value === "active") return "active";
  if (value === "complete" || value === "abandoned") return "complete";
  throw new MatchPersistenceConflictError(
    `Completed game belongs to a match in invalid status ${value}`,
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: string): string {
  try {
    return JSON.stringify(canonicalValue(JSON.parse(value)));
  } catch {
    throw new MatchPersistenceConflictError(
      "Completed game contains invalid JSON",
    );
  }
}

function expectedResultJson(input: CompletedGameWrite): string {
  return JSON.stringify(canonicalValue(input.result));
}

function assertStoredGameMatches(
  stored: StoredGame,
  input: CompletedGameWrite,
): void {
  const matches =
    stored.seed === input.seed &&
    stored.winnerSeat === input.result.winner &&
    stored.isFiveO === input.result.isFiveO &&
    canonicalJson(stored.resultJson) === expectedResultJson(input) &&
    canonicalJson(stored.boardJson) === canonicalJson(input.boardJson);
  if (!matches) {
    throw new MatchPersistenceConflictError(
      "Completed game retry does not match the stored result",
    );
  }
}

/**
 * The completed Game row intentionally stores only the immutable audit fields
 * needed for long-term replay. While Match still points at the same game, its
 * full snapshot is also authoritative and must match an idempotent retry. Once
 * a later game has started, Match.gameState belongs to that later game and is
 * no longer comparable.
 */
function assertStoredFinalStateMatchesWhenCurrent(
  match: AuthoritativeMatch,
  input: CompletedGameWrite,
): void {
  if (match.gameNumber < input.expectedGameNumber) {
    throw new MatchPersistenceConflictError(
      "Completed game is ahead of the authoritative match",
    );
  }
  if (match.gameNumber !== input.expectedGameNumber) return;

  if (
    match.gameSeed !== input.seed ||
    match.gameState === null ||
    canonicalJson(match.gameState) !== canonicalJson(input.gameStateJson)
  ) {
    throw new MatchPersistenceConflictError(
      "Completed game retry does not match the stored final state",
    );
  }
}

function assertMatchOwnsPriorState(
  match: AuthoritativeMatch,
  input: CompletedGameWrite,
): asserts input is CompletedGameWrite & {
  expectedPriorGameStateJson: string;
} {
  if (
    input.expectedPriorGameStateJson === null ||
    match.gameSeed !== input.seed ||
    match.gameState !== input.expectedPriorGameStateJson
  ) {
    throw new MatchPersistenceConflictError(
      "Match seed or state changed before the game result was stored",
    );
  }
}

function assertFinalSnapshotMatchesParticipants(
  input: CompletedGameWrite,
  match: AuthoritativeMatch,
): void {
  let state: unknown;
  try {
    state = JSON.parse(input.gameStateJson);
  } catch {
    throw new MatchPersistenceConflictError("Final game state is invalid JSON");
  }
  if (!state || typeof state !== "object") {
    throw new MatchPersistenceConflictError("Final game state is invalid");
  }

  const snapshot = state as {
    phase?: unknown;
    players?: Array<{ userId?: unknown; rows?: unknown; hand?: unknown }>;
    result?: unknown;
  };
  if (
    snapshot.phase !== "complete" ||
    snapshot.players?.length !== 2 ||
    snapshot.players[0]?.userId !== match.hostId ||
    snapshot.players[1]?.userId !== match.guestId ||
    JSON.stringify(canonicalValue(snapshot.result)) !== expectedResultJson(input)
  ) {
    throw new MatchPersistenceConflictError(
      "Final game state does not match the authoritative match",
    );
  }

  const boardFromState = snapshot.players.map(({ rows, hand }) => ({
    rows,
    hand,
  }));
  if (
    JSON.stringify(canonicalValue(boardFromState)) !==
    canonicalJson(input.boardJson)
  ) {
    throw new MatchPersistenceConflictError(
      "Final board does not match the final game state",
    );
  }
}

function outcomeFromMatch(
  match: AuthoritativeMatch,
  applied: boolean,
): CompletedGameOutcome {
  return {
    applied,
    scoreHost: match.scoreHost,
    scoreGuest: match.scoreGuest,
    status: statusForOutcome(match.status),
    winnerId: match.winnerId,
  };
}

async function loadMatch(
  tx: Prisma.TransactionClient,
  matchId: string,
): Promise<AuthoritativeMatch> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: matchSelection,
  });
  if (!match) throw new MatchPersistenceConflictError("Match no longer exists");
  return match;
}

async function findStoredGame(
  tx: Prisma.TransactionClient,
  input: CompletedGameWrite,
): Promise<StoredGame | null> {
  return tx.game.findUnique({
    where: {
      matchId_gameNumber: {
        matchId: input.matchId,
        gameNumber: input.expectedGameNumber,
      },
    },
    select: gameSelection,
  });
}

async function ensureStatsRows(
  tx: Prisma.TransactionClient,
  userIds: readonly [string, string],
): Promise<void> {
  for (const userId of userIds) {
    await tx.stats.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
}

async function applyGameStats(
  tx: Prisma.TransactionClient,
  hostId: string,
  guestId: string,
  result: GameResult,
): Promise<void> {
  const winnerId =
    result.winner === 0 ? hostId : result.winner === 1 ? guestId : null;
  const loserId =
    result.winner === 0 ? guestId : result.winner === 1 ? hostId : null;

  if (winnerId && loserId) {
    const winner = await tx.stats.update({
      where: { userId: winnerId },
      data: {
        gamesPlayed: { increment: 1 },
        gameWins: { increment: 1 },
        currentStreak: { increment: 1 },
        fiveOs: { increment: result.isFiveO ? 1 : 0 },
      },
      select: { currentStreak: true, bestStreak: true },
    });
    if (winner.currentStreak > winner.bestStreak) {
      await tx.stats.update({
        where: { userId: winnerId },
        data: { bestStreak: winner.currentStreak },
      });
    }
    await tx.stats.update({
      where: { userId: loserId },
      data: {
        gamesPlayed: { increment: 1 },
        gameLosses: { increment: 1 },
        currentStreak: 0,
      },
    });
    return;
  }

  // A streak means consecutive game wins, so a pushed game breaks both streaks.
  for (const userId of [hostId, guestId]) {
    await tx.stats.update({
      where: { userId },
      data: {
        gamesPlayed: { increment: 1 },
        gamePushes: { increment: 1 },
        currentStreak: 0,
      },
    });
  }
}

async function applyMatchStats(
  tx: Prisma.TransactionClient,
  hostId: string,
  guestId: string,
  winnerId: string,
): Promise<void> {
  for (const userId of [hostId, guestId]) {
    await tx.stats.update({
      where: { userId },
      data: { matchesPlayed: { increment: 1 } },
    });
  }
  await tx.stats.update({
    where: { userId: winnerId },
    data: { matchWins: { increment: 1 } },
  });
}

async function reconcileStoredGame(
  tx: Prisma.TransactionClient,
  input: CompletedGameWrite,
): Promise<CompletedGameOutcome> {
  const [match, stored] = await Promise.all([
    loadMatch(tx, input.matchId),
    findStoredGame(tx, input),
  ]);
  if (!stored) {
    throw new MatchPersistenceConflictError(
      "Completed game conflict could not be reconciled",
    );
  }
  assertStoredGameMatches(stored, input);
  assertStoredFinalStateMatchesWhenCurrent(match, input);
  return outcomeFromMatch(match, false);
}

/**
 * Atomically records one completed game and every derived counter. Match
 * membership, scores, target, status, and game number are read and compared
 * inside the transaction; callers provide only the server-produced result.
 */
export async function persistCompletedGame(
  client: TransactionRunner,
  input: CompletedGameWrite,
): Promise<CompletedGameOutcome> {
  try {
    return await client.$transaction(async (tx) => {
      const match = await loadMatch(tx, input.matchId);
      const existing = await findStoredGame(tx, input);
      if (existing) {
        assertStoredGameMatches(existing, input);
        assertStoredFinalStateMatchesWhenCurrent(match, input);
        return outcomeFromMatch(match, false);
      }

      if (
        match.status !== "active" ||
        !match.guestId ||
        match.hostId === match.guestId ||
        match.gameNumber !== input.expectedGameNumber
      ) {
        throw new MatchPersistenceConflictError(
          "Match changed while the game result was being stored",
        );
      }
      assertMatchOwnsPriorState(match, input);
      assertFinalSnapshotMatchesParticipants(input, match);

      const scoreHost =
        match.scoreHost + (input.result.winner === 0 ? 1 : 0);
      const scoreGuest =
        match.scoreGuest + (input.result.winner === 1 ? 1 : 0);
      const winnerId =
        scoreHost >= match.targetWins
          ? match.hostId
          : scoreGuest >= match.targetWins
            ? match.guestId
            : null;
      const status = winnerId ? "complete" : "active";

      await tx.game.create({
        data: {
          matchId: input.matchId,
          gameNumber: match.gameNumber,
          seed: input.seed,
          winnerSeat: input.result.winner,
          isFiveO: input.result.isFiveO,
          resultJson: JSON.stringify(input.result),
          boardJson: input.boardJson,
        },
      });

      const matchWrite = await tx.match.updateMany({
        where: {
          id: input.matchId,
          hostId: match.hostId,
          guestId: match.guestId,
          status: "active",
          targetWins: match.targetWins,
          gameNumber: match.gameNumber,
          scoreHost: match.scoreHost,
          scoreGuest: match.scoreGuest,
          gameSeed: input.seed,
          gameState: input.expectedPriorGameStateJson,
        },
        data: {
          status,
          scoreHost,
          scoreGuest,
          winnerId,
          gameSeed: input.seed,
          gameState: input.gameStateJson,
          readyHost: match.readyHost,
          readyGuest: match.readyGuest,
        },
      });
      if (matchWrite.count !== 1) {
        throw new MatchPersistenceConflictError(
          "Match changed while the game result was being stored",
        );
      }

      await ensureStatsRows(tx, [match.hostId, match.guestId]);
      await applyGameStats(tx, match.hostId, match.guestId, input.result);
      if (winnerId) {
        await applyMatchStats(tx, match.hostId, match.guestId, winnerId);
      }

      return { applied: true, scoreHost, scoreGuest, status, winnerId };
    });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    // A second process may have won the composite insert race. Only an exact
    // payload match is idempotent; a divergent duplicate remains a conflict.
    return client.$transaction((tx) => reconcileStoredGame(tx, input));
  }
}
