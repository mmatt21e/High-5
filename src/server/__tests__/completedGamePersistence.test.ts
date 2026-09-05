import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  persistCompletedGame,
  type CompletedGameWrite,
  type TransactionRunner,
} from "../completedGamePersistence";

const input: CompletedGameWrite = {
  matchId: "match-1",
  gameNumber: 1,
  seed: 123456,
  hostId: "host",
  guestId: "guest",
  scoreHost: 0,
  scoreGuest: 0,
  targetWins: 1,
  result: { hands: [], handWins: [3, 2], winner: 0, isFiveO: false },
  gameStateJson: "{\"phase\":\"complete\"}",
  boardJson: "[]",
  readyHost: false,
  readyGuest: false,
};

interface StoredState {
  game: null | { gameNumber: number; seed: number };
  match: {
    scoreHost: number;
    scoreGuest: number;
    status: string;
    winnerId: string | null;
    gameNumber: number;
  };
  statWrites: number;
}

function createHarness() {
  let state: StoredState = {
    game: null,
    match: {
      scoreHost: 0,
      scoreGuest: 0,
      status: "active",
      winnerId: null,
      gameNumber: 1,
    },
    statWrites: 0,
  };
  let failStats = false;

  const client: TransactionRunner = {
    async $transaction<T>(
      work: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      const draft = structuredClone(state);
      const tx = {
        game: {
          findUnique: async () => (draft.game ? { id: "game-1" } : null),
          create: async ({ data }: { data: { gameNumber: number; seed: number } }) => {
            draft.game = { gameNumber: data.gameNumber, seed: data.seed };
            return { id: "game-1" };
          },
        },
        match: {
          findUnique: async () => ({ ...draft.match }),
          updateMany: async ({ data }: { data: Partial<StoredState["match"]> }) => {
            if (
              draft.match.status !== "active" ||
              draft.match.gameNumber !== input.gameNumber
            ) {
              return { count: 0 };
            }
            Object.assign(draft.match, data);
            return { count: 1 };
          },
        },
        stats: {
          update: async () => {
            if (failStats) throw new Error("stats failed");
            draft.statWrites += 1;
            return { currentStreak: 1, bestStreak: 0 };
          },
          updateMany: async () => {
            if (failStats) throw new Error("stats failed");
            draft.statWrites += 1;
            return { count: 2 };
          },
        },
      } as unknown as Prisma.TransactionClient;

      const result = await work(tx);
      state = draft;
      return result;
    },
  };

  return {
    client,
    state: () => state,
    failStats(value: boolean) {
      failStats = value;
    },
  };
}

describe("persistCompletedGame", () => {
  it("atomically stores the real seed, score, stats, and match winner", async () => {
    const harness = createHarness();

    const outcome = await persistCompletedGame(harness.client, input);

    expect(outcome).toEqual({
      applied: true,
      scoreHost: 1,
      scoreGuest: 0,
      status: "complete",
      winnerId: "host",
    });
    expect(harness.state().game).toEqual({ gameNumber: 1, seed: 123456 });
    expect(harness.state().match).toMatchObject({
      scoreHost: 1,
      status: "complete",
      winnerId: "host",
    });
    expect(harness.state().statWrites).toBeGreaterThan(0);
  });

  it("makes a retry read-only once the completed-game identity exists", async () => {
    const harness = createHarness();
    await persistCompletedGame(harness.client, input);
    const writesAfterFirstAttempt = harness.state().statWrites;

    const retried = await persistCompletedGame(harness.client, input);

    expect(retried.applied).toBe(false);
    expect(retried.scoreHost).toBe(1);
    expect(harness.state().statWrites).toBe(writesAfterFirstAttempt);
  });

  it("rolls back the game and match update when a stats write fails", async () => {
    const harness = createHarness();
    harness.failStats(true);

    await expect(persistCompletedGame(harness.client, input)).rejects.toThrow(
      "stats failed",
    );
    expect(harness.state().game).toBeNull();
    expect(harness.state().match).toMatchObject({
      scoreHost: 0,
      status: "active",
      winnerId: null,
    });
    expect(harness.state().statWrites).toBe(0);

    harness.failStats(false);
    await expect(persistCompletedGame(harness.client, input)).resolves.toMatchObject({
      applied: true,
    });
  });

  it("reconciles a composite-unique race won by another process", async () => {
    let transactions = 0;
    const tx = {
      game: { findUnique: async () => ({ id: "other-process-game" }) },
      match: {
        findUnique: async () => ({
          scoreHost: 1,
          scoreGuest: 0,
          status: "complete",
          winnerId: "host",
        }),
      },
    } as unknown as Prisma.TransactionClient;
    const client: TransactionRunner = {
      async $transaction<T>(work: (value: Prisma.TransactionClient) => Promise<T>) {
        transactions += 1;
        if (transactions === 1) {
          throw Object.assign(new Error("unique conflict"), { code: "P2002" });
        }
        return work(tx);
      },
    };

    await expect(persistCompletedGame(client, input)).resolves.toEqual({
      applied: false,
      scoreHost: 1,
      scoreGuest: 0,
      status: "complete",
      winnerId: "host",
    });
    expect(transactions).toBe(2);
  });
});
