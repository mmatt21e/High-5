import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { GameResult } from "../../lib/game/types";
import {
  MatchPersistenceConflictError,
  persistCompletedGame,
  type CompletedGameWrite,
  type TransactionRunner,
} from "../completedGamePersistence";

const winResult: GameResult = {
  hands: [],
  handWins: [3, 2],
  winner: 0,
  isFiveO: false,
};

const priorGameStateJson = JSON.stringify({
  phase: "playing",
  turn: 24,
  players: [
    { userId: "db-host", rows: [["host-before"]], hand: ["final-card"] },
    { userId: "db-guest", rows: [["guest-before"]], hand: [] },
  ],
});

function makeInput(result: GameResult = winResult): CompletedGameWrite {
  const players = [
    { userId: "db-host", rows: [["host-row"]], hand: ["host-hand"] },
    { userId: "db-guest", rows: [["guest-row"]], hand: ["guest-hand"] },
  ];
  return {
    matchId: "match-1",
    expectedGameNumber: 4,
    seed: 123456,
    expectedPriorGameStateJson: priorGameStateJson,
    result,
    gameStateJson: JSON.stringify({ phase: "complete", players, result }),
    boardJson: JSON.stringify(
      players.map(({ rows, hand }) => ({ rows, hand })),
    ),
  };
}

interface StoredGame {
  id: string;
  matchId: string;
  gameNumber: number;
  seed: number;
  winnerSeat: number | null;
  isFiveO: boolean;
  resultJson: string;
  boardJson: string;
}

interface StoredStats {
  gamesPlayed: number;
  gameWins: number;
  gameLosses: number;
  gamePushes: number;
  fiveOs: number;
  matchesPlayed: number;
  matchWins: number;
  currentStreak: number;
  bestStreak: number;
}

interface StoredState {
  games: StoredGame[];
  match: {
    id: string;
    hostId: string;
    guestId: string | null;
    scoreHost: number;
    scoreGuest: number;
    targetWins: number;
    status: string;
    gameNumber: number;
    readyHost: boolean;
    readyGuest: boolean;
    winnerId: string | null;
    gameSeed: number | null;
    gameState: string | null;
  };
  stats: Record<string, StoredStats>;
}

const emptyStats = (): StoredStats => ({
  gamesPlayed: 0,
  gameWins: 0,
  gameLosses: 0,
  gamePushes: 0,
  fiveOs: 0,
  matchesPlayed: 0,
  matchWins: 0,
  currentStreak: 0,
  bestStreak: 0,
});

function applyStatsData(
  stats: StoredStats,
  data: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(data)) {
    const field = key as keyof StoredStats;
    if (
      value &&
      typeof value === "object" &&
      "increment" in value &&
      typeof value.increment === "number"
    ) {
      stats[field] += value.increment;
    } else if (typeof value === "number") {
      stats[field] = value;
    }
  }
}

function createHarness(initial?: Partial<StoredState["match"]>) {
  let state: StoredState = {
    games: [],
    match: {
      id: "match-1",
      hostId: "db-host",
      guestId: "db-guest",
      scoreHost: 2,
      scoreGuest: 1,
      targetWins: 3,
      status: "active",
      gameNumber: 4,
      readyHost: false,
      readyGuest: false,
      winnerId: null,
      gameSeed: 123456,
      gameState: priorGameStateJson,
      ...initial,
    },
    stats: {},
  };
  let failStats = false;
  const calls = {
    matchFindUnique: vi.fn(),
    matchUpdateMany: vi.fn(),
    gameFindUnique: vi.fn(),
    gameCreate: vi.fn(),
    statsUpsert: vi.fn(),
    statsUpdate: vi.fn(),
  };

  const client: TransactionRunner = {
    async $transaction<T>(
      work: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      const draft = structuredClone(state);
      const tx = {
        game: {
          findUnique: async (args: {
            where: { matchId_gameNumber: { matchId: string; gameNumber: number } };
          }) => {
            calls.gameFindUnique(args);
            const identity = args.where.matchId_gameNumber;
            return (
              draft.games.find(
                (game) =>
                  game.matchId === identity.matchId &&
                  game.gameNumber === identity.gameNumber,
              ) ?? null
            );
          },
          create: async ({ data }: { data: Omit<StoredGame, "id"> }) => {
            calls.gameCreate({ data });
            if (
              draft.games.some(
                (game) =>
                  game.matchId === data.matchId &&
                  game.gameNumber === data.gameNumber,
              )
            ) {
              throw Object.assign(new Error("unique conflict"), { code: "P2002" });
            }
            const game = { id: `game-${draft.games.length + 1}`, ...data };
            draft.games.push(game);
            return game;
          },
        },
        match: {
          findUnique: async (args: unknown) => {
            calls.matchFindUnique(args);
            return { ...draft.match };
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Partial<StoredState["match"]>;
          }) => {
            calls.matchUpdateMany({ where, data });
            const unchanged = Object.entries(where).every(
              ([key, value]) =>
                draft.match[key as keyof StoredState["match"]] === value,
            );
            if (!unchanged) return { count: 0 };
            Object.assign(draft.match, data);
            return { count: 1 };
          },
        },
        stats: {
          upsert: async ({ where }: { where: { userId: string } }) => {
            calls.statsUpsert({ where });
            draft.stats[where.userId] ??= emptyStats();
            return { userId: where.userId, ...draft.stats[where.userId] };
          },
          update: async ({
            where,
            data,
          }: {
            where: { userId: string };
            data: Record<string, unknown>;
          }) => {
            calls.statsUpdate({ where, data });
            if (failStats) throw new Error("stats failed");
            const stats = draft.stats[where.userId];
            if (!stats) throw new Error("missing stats row");
            applyStatsData(stats, data);
            return { userId: where.userId, ...stats };
          },
        },
      } as unknown as Prisma.TransactionClient;

      const result = await work(tx);
      state = draft;
      return result;
    },
  };

  return {
    calls,
    client,
    state: () => state,
    failStats(value: boolean) {
      failStats = value;
    },
  };
}

function storedGameFor(input: CompletedGameWrite): StoredGame {
  return {
    id: "game-4",
    matchId: input.matchId,
    gameNumber: input.expectedGameNumber,
    seed: input.seed,
    winnerSeat: input.result.winner,
    isFiveO: input.result.isFiveO,
    resultJson: JSON.stringify(input.result),
    boardJson: input.boardJson,
  };
}

describe("persistCompletedGame", () => {
  it("uses authoritative match identity, scores, target, status, and game number", async () => {
    const harness = createHarness();
    const input = makeInput();

    await expect(persistCompletedGame(harness.client, input)).resolves.toEqual({
      applied: true,
      scoreHost: 3,
      scoreGuest: 1,
      status: "complete",
      winnerId: "db-host",
    });

    expect(harness.calls.matchFindUnique).toHaveBeenCalledWith({
      where: { id: "match-1" },
      select: expect.objectContaining({
        hostId: true,
        guestId: true,
        scoreHost: true,
        scoreGuest: true,
        targetWins: true,
        status: true,
        gameNumber: true,
        gameSeed: true,
        gameState: true,
      }),
    });
    expect(harness.calls.matchUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "match-1",
        hostId: "db-host",
        guestId: "db-guest",
        status: "active",
        targetWins: 3,
        gameNumber: 4,
        scoreHost: 2,
        scoreGuest: 1,
        gameSeed: 123456,
        gameState: priorGameStateJson,
      },
      data: expect.objectContaining({
        scoreHost: 3,
        scoreGuest: 1,
        winnerId: "db-host",
      }),
    });
    expect(harness.calls.statsUpsert.mock.calls).toEqual([
      [{ where: { userId: "db-host" } }],
      [{ where: { userId: "db-guest" } }],
    ]);
    expect(harness.state().games[0]).toMatchObject({
      gameNumber: 4,
      seed: 123456,
    });
  });

  it("makes an identical retry read-only", async () => {
    const harness = createHarness();
    const input = makeInput();
    await persistCompletedGame(harness.client, input);
    const statWrites = harness.calls.statsUpdate.mock.calls.length;

    await expect(persistCompletedGame(harness.client, input)).resolves.toEqual({
      applied: false,
      scoreHost: 3,
      scoreGuest: 1,
      status: "complete",
      winnerId: "db-host",
    });
    expect(harness.calls.statsUpdate).toHaveBeenCalledTimes(statWrites);
  });

  it.each([
    ["seed", (input: CompletedGameWrite) => ({ ...input, seed: input.seed + 1 })],
    [
      "winner",
      (input: CompletedGameWrite) => ({
        ...input,
        result: { ...input.result, winner: 1 as const },
      }),
    ],
    [
      "board",
      (input: CompletedGameWrite) => ({ ...input, boardJson: "[]" }),
    ],
    [
      "final game state",
      (input: CompletedGameWrite) => ({
        ...input,
        gameStateJson: JSON.stringify({
          ...JSON.parse(input.gameStateJson),
          divergent: true,
        }),
      }),
    ],
  ])("rejects a duplicate with a divergent %s", async (_label, mutate) => {
    const harness = createHarness();
    const input = makeInput();
    await persistCompletedGame(harness.client, input);

    await expect(
      persistCompletedGame(harness.client, mutate(input)),
    ).rejects.toBeInstanceOf(MatchPersistenceConflictError);
  });

  it("rejects a stale caller game number before creating a completion", async () => {
    const harness = createHarness({ gameNumber: 5 });

    await expect(
      persistCompletedGame(harness.client, makeInput()),
    ).rejects.toBeInstanceOf(MatchPersistenceConflictError);
    expect(harness.calls.gameCreate).not.toHaveBeenCalled();
    expect(harness.calls.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a completion when the authoritative seed differs", async () => {
    const harness = createHarness({ gameSeed: 654321 });

    await expect(
      persistCompletedGame(harness.client, makeInput()),
    ).rejects.toBeInstanceOf(MatchPersistenceConflictError);
    expect(harness.calls.gameCreate).not.toHaveBeenCalled();
    expect(harness.calls.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a completion from a stale prior game state", async () => {
    const harness = createHarness({
      gameState: JSON.stringify({ phase: "playing", turn: 23 }),
    });

    await expect(
      persistCompletedGame(harness.client, makeInput()),
    ).rejects.toBeInstanceOf(MatchPersistenceConflictError);
    expect(harness.calls.gameCreate).not.toHaveBeenCalled();
    expect(harness.calls.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("rolls back all writes when stats persistence fails, then retries cleanly", async () => {
    const harness = createHarness();
    const input = makeInput();
    harness.failStats(true);

    await expect(persistCompletedGame(harness.client, input)).rejects.toThrow(
      "stats failed",
    );
    expect(harness.state().games).toEqual([]);
    expect(harness.state().match).toMatchObject({
      scoreHost: 2,
      status: "active",
      winnerId: null,
    });
    expect(harness.state().stats).toEqual({});

    harness.failStats(false);
    await expect(
      persistCompletedGame(harness.client, input),
    ).resolves.toMatchObject({ applied: true });
  });

  it("creates missing Stats rows and resets both consecutive-win streaks on a push", async () => {
    const push: GameResult = {
      hands: [],
      handWins: [2, 2],
      winner: null,
      isFiveO: false,
    };
    const harness = createHarness({ scoreHost: 0, scoreGuest: 0, targetWins: 5 });
    const current = harness.state();
    current.stats["db-host"] = { ...emptyStats(), currentStreak: 3, bestStreak: 3 };
    current.stats["db-guest"] = { ...emptyStats(), currentStreak: 2, bestStreak: 2 };

    await persistCompletedGame(harness.client, makeInput(push));

    expect(harness.state().stats["db-host"]).toMatchObject({
      gamesPlayed: 1,
      gamePushes: 1,
      currentStreak: 0,
    });
    expect(harness.state().stats["db-guest"]).toMatchObject({
      gamesPlayed: 1,
      gamePushes: 1,
      currentStreak: 0,
    });
  });

  it("reconciles only an identical composite-unique race", async () => {
    const input = makeInput();
    let transactions = 0;
    const match = {
      hostId: "db-host",
      guestId: "db-guest",
      scoreHost: 3,
      scoreGuest: 1,
      targetWins: 3,
      status: "complete",
      gameNumber: 4,
      readyHost: false,
      readyGuest: false,
      winnerId: "db-host",
      gameSeed: input.seed,
      gameState: input.gameStateJson,
    };
    const tx = {
      game: { findUnique: async () => storedGameFor(input) },
      match: { findUnique: async () => match },
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
      scoreHost: 3,
      scoreGuest: 1,
      status: "complete",
      winnerId: "db-host",
    });
    expect(transactions).toBe(2);
  });

  it("rejects a divergent payload during P2002 reconciliation", async () => {
    const input = makeInput();
    const stored = storedGameFor({ ...input, seed: input.seed + 1 });
    let transactions = 0;
    const tx = {
      game: { findUnique: async () => stored },
      match: {
        findUnique: async () => ({
          hostId: "db-host",
          guestId: "db-guest",
          scoreHost: 3,
          scoreGuest: 1,
          targetWins: 3,
          status: "complete",
          gameNumber: 4,
          readyHost: false,
          readyGuest: false,
          winnerId: "db-host",
          gameSeed: input.seed,
          gameState: input.gameStateJson,
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

    await expect(persistCompletedGame(client, input)).rejects.toBeInstanceOf(
      MatchPersistenceConflictError,
    );
  });

  it("rejects a divergent final state during P2002 reconciliation", async () => {
    const input = makeInput();
    let transactions = 0;
    const tx = {
      game: { findUnique: async () => storedGameFor(input) },
      match: {
        findUnique: async () => ({
          hostId: "db-host",
          guestId: "db-guest",
          scoreHost: 3,
          scoreGuest: 1,
          targetWins: 3,
          status: "complete",
          gameNumber: 4,
          readyHost: false,
          readyGuest: false,
          winnerId: "db-host",
          gameSeed: input.seed,
          gameState: JSON.stringify({
            ...JSON.parse(input.gameStateJson),
            divergent: true,
          }),
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

    await expect(persistCompletedGame(client, input)).rejects.toBeInstanceOf(
      MatchPersistenceConflictError,
    );
    expect(transactions).toBe(2);
  });

  it("accepts an old exact completion after the next game has started", async () => {
    const harness = createHarness({ targetWins: 5 });
    const input = makeInput();
    await persistCompletedGame(harness.client, input);

    Object.assign(harness.state().match, {
      status: "active",
      gameNumber: 5,
      gameSeed: 987654,
      gameState: JSON.stringify({ phase: "playing", turn: 1 }),
    });

    await expect(persistCompletedGame(harness.client, input)).resolves.toEqual({
      applied: false,
      scoreHost: 3,
      scoreGuest: 1,
      status: "active",
      winnerId: null,
    });
  });
});
