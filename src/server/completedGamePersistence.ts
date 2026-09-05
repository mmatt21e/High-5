import type { Prisma } from "@prisma/client";
import type { GameResult } from "../lib/game/types";

export interface TransactionRunner {
  $transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
}

export interface CompletedGameWrite {
  matchId: string;
  gameNumber: number;
  seed: number;
  hostId: string;
  guestId: string;
  scoreHost: number;
  scoreGuest: number;
  targetWins: number;
  result: GameResult;
  gameStateJson: string;
  boardJson: string;
  readyHost: boolean;
  readyGuest: boolean;
}

export interface CompletedGameOutcome {
  applied: boolean;
  scoreHost: number;
  scoreGuest: number;
  status: "active" | "complete";
  winnerId: string | null;
}

export class MatchPersistenceConflictError extends Error {}

function statusForDatabase(value: string): "active" | "complete" {
  return value === "active" ? "active" : "complete";
}

async function existingOutcome(
  tx: Prisma.TransactionClient,
  input: CompletedGameWrite,
): Promise<CompletedGameOutcome> {
  const match = await tx.match.findUnique({
    where: { id: input.matchId },
    select: {
      scoreHost: true,
      scoreGuest: true,
      status: true,
      winnerId: true,
    },
  });
  if (!match) throw new MatchPersistenceConflictError("Match no longer exists");
  return {
    applied: false,
    scoreHost: match.scoreHost,
    scoreGuest: match.scoreGuest,
    status: statusForDatabase(match.status),
    winnerId: match.winnerId,
  };
}

async function applyGameStats(
  tx: Prisma.TransactionClient,
  input: CompletedGameWrite,
): Promise<void> {
  const { hostId, guestId, result } = input;
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

  await tx.stats.updateMany({
    where: { userId: { in: [hostId, guestId] } },
    data: { gamesPlayed: { increment: 1 }, gamePushes: { increment: 1 } },
  });
}

async function applyMatchStats(
  tx: Prisma.TransactionClient,
  input: CompletedGameWrite,
  winnerId: string,
): Promise<void> {
  await tx.stats.updateMany({
    where: { userId: { in: [input.hostId, input.guestId] } },
    data: { matchesPlayed: { increment: 1 } },
  });
  await tx.stats.update({
    where: { userId: winnerId },
    data: { matchWins: { increment: 1 } },
  });
}

/**
 * Atomically records one completed game and every derived counter. The
 * [matchId, gameNumber] identity makes a retry a read-only reconciliation.
 */
export async function persistCompletedGame(
  client: TransactionRunner,
  input: CompletedGameWrite,
): Promise<CompletedGameOutcome> {
  try {
    return await client.$transaction(async (tx) => {
      const existing = await tx.game.findUnique({
        where: {
          matchId_gameNumber: {
            matchId: input.matchId,
            gameNumber: input.gameNumber,
          },
        },
        select: { id: true },
      });
      if (existing) return existingOutcome(tx, input);

      const scoreHost =
        input.scoreHost + (input.result.winner === 0 ? 1 : 0);
      const scoreGuest =
        input.scoreGuest + (input.result.winner === 1 ? 1 : 0);
      const winnerId =
        scoreHost >= input.targetWins
          ? input.hostId
          : scoreGuest >= input.targetWins
            ? input.guestId
            : null;
      const status = winnerId ? "complete" : "active";

      await tx.game.create({
        data: {
          matchId: input.matchId,
          gameNumber: input.gameNumber,
          seed: input.seed,
          winnerSeat: input.result.winner,
          isFiveO: input.result.isFiveO,
          resultJson: JSON.stringify(input.result),
          boardJson: input.boardJson,
        },
      });

      // This compare-and-set prevents a completion racing with a voluntary end
      // (or a different process) from reviving and scoring a closed match.
      const matchWrite = await tx.match.updateMany({
        where: {
          id: input.matchId,
          status: "active",
          gameNumber: input.gameNumber,
        },
        data: {
          status,
          scoreHost,
          scoreGuest,
          winnerId,
          gameSeed: input.seed,
          gameState: input.gameStateJson,
          readyHost: input.readyHost,
          readyGuest: input.readyGuest,
        },
      });
      if (matchWrite.count !== 1) {
        throw new MatchPersistenceConflictError(
          "Match changed while the game result was being stored",
        );
      }

      await applyGameStats(tx, input);
      if (winnerId) await applyMatchStats(tx, input, winnerId);

      return { applied: true, scoreHost, scoreGuest, status, winnerId };
    });
  } catch (error) {
    // Another process can pass the pre-read and win the composite unique insert
    // first. Confirm that exact identity now exists, then reconcile from the
    // transaction it committed. Other unique failures remain real errors.
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    return client.$transaction(async (tx) => {
      const existing = await tx.game.findUnique({
        where: {
          matchId_gameNumber: {
            matchId: input.matchId,
            gameNumber: input.gameNumber,
          },
        },
        select: { id: true },
      });
      if (!existing) throw error;
      return existingOutcome(tx, input);
    });
  }
}
