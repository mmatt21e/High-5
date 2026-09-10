import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GameState, GameView } from "../../lib/game/types";
import type { MatchSnapshot } from "../../lib/realtime/events";
import { createGame, placeCard, legalRows } from "../../lib/game/engine";
import { cardId } from "../../lib/game/cards";
import { RANKED_COMPUTER_LEVELS as COMPUTER_LEVELS, COMPUTER_OPPONENTS } from "../../lib/computer";
import { resetAccountRateLimit } from "../../lib/rateLimit";

const fixture = vi.hoisted(() => ({ path: `${process.cwd().replaceAll("\\", "/")}/prisma/computer-tests-${process.pid}-${Date.now()}.db` }));
vi.mock("../../lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: `file:${fixture.path}` } } }) };
});
vi.mock("../../lib/push", () => ({ sendPushToUser: vi.fn() }));
import { prisma } from "../../lib/prisma";
import { createComputerMatch } from "../computerMatches";
import { handleJoin, handlePlace, handleNext, handleEndMatch, handleDisconnect, handleExhibition } from "../gameManager";
import { joinMatch } from "../../lib/match";
import { sendInvitation } from "../invitations";
import { opponentRecords, recentGames } from "../playerHistory";
import { publicPlayer } from "../playerIdentity";
import { persistCompletedGame } from "../completedGamePersistence";

type TestGlobals = { __fiveOMatches: Map<string, unknown>; __fiveOComputerTimers: Map<string, ReturnType<typeof setTimeout>> };
const globals = globalThis as unknown as TestGlobals;
function clearLive() {
  for (const timer of globals.__fiveOComputerTimers.values()) clearTimeout(timer);
  globals.__fiveOComputerTimers.clear(); globals.__fiveOMatches.clear();
}

beforeAll(async () => {
  for (const name of readdirSync(resolve("prisma/migrations")).filter((name) => /^\d/.test(name)).sort()) {
    const sql = readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  }
}, 30_000);
beforeEach(async () => {
  clearLive();
  // Explicitly clear stats instead of relying on connection-local SQLite
  // foreign-key settings to cascade fixture cleanup on every platform.
  await prisma.stats.deleteMany();
  await prisma.gameInvitation.deleteMany(); await prisma.game.deleteMany(); await prisma.match.deleteMany(); await prisma.user.deleteMany();
  await prisma.user.createMany({ data: ["human", "outsider"].map((id) => ({ id, email: `${id}@example.test`, displayName: id })) });
  resetAccountRateLimit("match:create", "human"); resetAccountRateLimit("match:join", "human");
});
afterAll(async () => {
  clearLive(); await prisma.$disconnect();
  if (resolve(dirname(fixture.path)) !== resolve("prisma")) throw new Error("Unexpected fixture path");
  for (const suffix of ["", "-journal", "-shm", "-wal"]) rmSync(fixture.path + suffix, { force: true });
});

function connection() {
  let view: GameView | null = null;
  let snapshot: MatchSnapshot | null = null;
  const errors: string[] = [];
  const emit = (event: string, value: unknown) => {
    if (event === "game:view") view = value as GameView | null;
    if (event === "match:snapshot") snapshot = value as MatchSnapshot;
    if (event === "errorMsg") errors.push((value as { message: string }).message);
  };
  const socket = { data: { userId: "human" }, join: vi.fn(), emit } as unknown as Parameters<typeof handleJoin>[1];
  const io = { in: () => ({ fetchSockets: async () => [socket] }), to: () => ({ emit }) } as unknown as Parameters<typeof handleJoin>[0];
  return { io, socket, errors, view: () => view!, snapshot: () => snapshot! };
}

describe("computer matches on SQLite and the realtime manager", () => {
  it("finishes a legacy-named saved board without changing the exact persistence identity", async () => {
    const match = await createComputerMatch("human", "easy");
    const game = createGame({ userId: "human", displayName: "Human" }, { userId: match.guestId!, displayName: "Legacy bot name" }, { seed: 42 });
    for (let i = 0; i < 39; i++) placeCard(game, game.toMove, cardId(game.players[game.toMove].hand[0]), legalRows(game)[0]);
    await prisma.match.update({ where: { id: match.id }, data: { gameNumber: 1, gameSeed: 42, gameState: JSON.stringify(game) } });
    const c = connection(); await handleJoin(c.io, c.socket, match.inviteCode);
    await vi.waitFor(() => expect(c.view().phase).toBe("complete"));
    expect(c.view().players[1].displayName).toBe("Analyst Edge");
    expect(await prisma.game.count({ where: { matchId: match.id } })).toBe(1);
    clearLive(); await handleJoin(c.io, c.socket, match.inviteCode);
    expect(c.errors).toEqual([]);
    expect(c.view().players[1].displayName).toBe("Analyst Edge");
  });

  it("persists trick decisions across reconnects, rejects other seats and rolls back failed responses", async () => {
    const match = await createComputerMatch("human", "wildcard");
    const c = connection(); await handleJoin(c.io, c.socket, match.inviteCode);
    const card = c.view().players[0].hand.find(slot => slot.state === "card")!;
    if (card.state !== "card") throw new Error("No card");
    await handlePlace(c.io, c.socket, cardId(card.card), 0);
    await vi.waitFor(() => expect(c.view().exhibition?.pending).toBeTruthy());
    const saved = (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState;
    const token = c.view().exhibition!.token;
    const action = c.view().exhibition!.pending!.kind === "deal" ? "decline" as const : "allow" as const;
    const outsider = { data: { userId: "outsider", matchId: match.id }, emit: vi.fn() } as unknown as typeof c.socket;
    await handleExhibition(c.io, outsider, { token, action });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState).toBe(saved);
    clearLive(); await handleJoin(c.io, c.socket, match.inviteCode);
    expect(c.view().exhibition!.token).toBe(token);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_exhibition_write BEFORE UPDATE ON "Match" BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END`);
    try { await expect(handleExhibition(c.io, c.socket, { token, action })).rejects.toThrow(); }
    finally { await prisma.$executeRawUnsafe("DROP TRIGGER fail_exhibition_write"); }
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState).toBe(saved);
    await handleExhibition(c.io, c.socket, { token, action });
    expect(c.view().exhibition!.pending).toBeNull();
    await handleExhibition(c.io, c.socket, { token, action });
    expect(c.errors.at(-1)).toContain("table changed");
    const freshToken = c.view().exhibition!.token;
    await handleExhibition(c.io, c.socket, { token: freshToken, action: "restart" });
    expect(c.view().placed).toEqual([0, 0]);
    expect(c.view().exhibition!.playFair).toBe(1);
    expect(c.view().exhibition!.token).not.toBe(freshToken);
    expect(await prisma.game.count()).toBe(0);
    expect(await prisma.stats.count()).toBe(0);
  });

  it("finishes and replays an exhibition without touching stats, streaks, history, or ranked persistence", async () => {
    await prisma.stats.create({ data: { userId: "human", gamesPlayed: 8, gameWins: 6, currentStreak: 4, bestStreak: 4 } });
    const before = await prisma.stats.findUnique({ where: { userId: "human" } });
    const match = await createComputerMatch("human", "wildcard");
    const c = connection(); await handleJoin(c.io, c.socket, match.inviteCode);
    async function settle() {
      const deadline = Date.now() + 7000;
      while (!c.view().yourTurn && c.view().phase !== "complete") {
        const ex = c.view().exhibition!;
        if (ex.pending) await handleExhibition(c.io, c.socket, { token: ex.token, action: ex.pending.kind === "deal" ? "decline" : "allow" });
        if (Date.now() > deadline) throw new Error("Exhibition stalled");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    for (let turn = 0; turn < 20; turn++) {
      await settle();
      const card = c.view().players[0].hand.find(slot => slot.state === "card")!;
      if (card.state !== "card") throw new Error("No card");
      await handlePlace(c.io, c.socket, cardId(card.card), c.view().legalRows[0]);
    }
    await settle(); expect(c.view().phase).toBe("complete");
    clearLive(); await handleJoin(c.io, c.socket, match.inviteCode);
    expect(await prisma.game.count({ where: { matchId: match.id } })).toBe(0);
    expect(await prisma.stats.findUnique({ where: { userId: "human" } })).toEqual(before);
    expect(await opponentRecords("human")).toEqual([]);
    expect((await recentGames("human", undefined, 1)).total).toBe(0);
    const stored = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(stored).toMatchObject({ scoreHost: 0, scoreGuest: 0, winnerId: null });
    const final = JSON.parse(stored.gameState!) as GameState;
    await expect(persistCompletedGame(prisma, { matchId: match.id, expectedGameNumber: 1, seed: stored.gameSeed!, expectedPriorGameStateJson: null,
      result: final.result!, gameStateJson: stored.gameState!, boardJson: JSON.stringify(final.players.map(p => ({ rows: p.rows, hand: p.hand }))) })).rejects.toThrow("Exhibition games cannot");
    await handleNext(c.io, c.socket);
    expect(c.snapshot().gameNumber).toBe(2);
    expect(c.view().exhibition!.tricksUsed).toBe(0);
    await handleEndMatch(c.io, c.socket);
    expect(await prisma.stats.findUnique({ where: { userId: "human" } })).toEqual(before);
    expect(await opponentRecords("human")).toEqual([]);
    expect(c.errors).toEqual([]);
  }, 30_000);

  it("rejects exhibition actions on a ranked match", async () => {
    const match = await createComputerMatch("human", "easy");
    const c = connection(); await handleJoin(c.io, c.socket, match.inviteCode);
    const before = (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState;
    await handleExhibition(c.io, c.socket, { token: "forged", action: "restart" });
    expect(c.errors.at(-1)).toContain("only available");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState).toBe(before);
    expect(c.view().exhibition).toBeUndefined();
  });

  it.each(COMPUTER_LEVELS)("uses the current %s name for legacy accounts and saved boards", async (level) => {
    const match = await createComputerMatch("human", level);
    const legacy = await prisma.user.update({ where: { id: match.guestId! }, data: { displayName: "Old bot name" } });
    const game = createGame({ userId: "human", displayName: "Human" }, { userId: legacy.id, displayName: legacy.displayName }, { seed: 42, firstLead: 0 });
    await prisma.match.update({ where: { id: match.id }, data: { gameNumber: 1, gameSeed: 42, gameState: JSON.stringify(game) } });
    expect(publicPlayer(legacy).displayName).toBe(COMPUTER_OPPONENTS[level].name);
    const c = connection();
    await handleJoin(c.io, c.socket, match.inviteCode);
    expect(c.snapshot().guest?.displayName).toBe(COMPUTER_OPPONENTS[level].name);
    expect(c.view().players[1].displayName).toBe(COMPUTER_OPPONENTS[level].name);
    expect(c.view().placed).toEqual([0, 0]);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState).toBe(JSON.stringify(game));
    const next = await createComputerMatch("human", level);
    expect(next.guestId).toBe(legacy.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).displayName).toBe(COMPUTER_OPPONENTS[level].name);
  });

  it("creates stable named opponents, reserves their seats, and excludes invitations", async () => {
    for (const level of COMPUTER_LEVELS) {
      const a = await createComputerMatch("human", level);
      const b = await createComputerMatch("human", level);
      expect(a.guestId).toBe(b.guestId);
      expect(a.status).toBe("active");
      expect(await prisma.user.findUnique({ where: { id: a.guestId! } })).toMatchObject({ computerLevel: level, displayName: COMPUTER_OPPONENTS[level].name, passwordHash: null });
      expect((await joinMatch(a.inviteCode, "outsider")).ok).toBe(false);
      await expect(sendInvitation("human", a.guestId!)).rejects.toThrow("Use Play the computer");
    }
    expect(await prisma.user.count({ where: { computerLevel: { not: null } } })).toBe(3);
  });

  it("deduplicates scheduled turns across reconnects and stops when a match ends", async () => {
    const match = await createComputerMatch("human", "medium");
    const c = connection();
    await handleJoin(c.io, c.socket, match.inviteCode);
    expect(c.snapshot().computerLevel).toBe("medium");
    const first = c.view().players[0].hand.find((slot) => slot.state === "card")!;
    if (first.state !== "card") throw new Error("Missing card");
    await handlePlace(c.io, c.socket, cardId(first.card), 0);
    await Promise.all([handleJoin(c.io, c.socket, match.inviteCode), handleJoin(c.io, c.socket, match.inviteCode)]);
    expect(globals.__fiveOComputerTimers.size).toBe(1);
    await vi.waitFor(() => expect(c.view().placed).toEqual([1, 1]), { timeout: 5000 });
    expect(c.view().yourTurn).toBe(true);
    const second = c.view().players[0].hand.find((slot) => slot.state === "card")!;
    if (second.state !== "card") throw new Error("Missing card");
    await handlePlace(c.io, c.socket, cardId(second.card), 0);
    await handleEndMatch(c.io, c.socket);
    expect(globals.__fiveOComputerTimers.size).toBe(0);
    expect(c.view().placed).toEqual([2, 1]);
    expect(c.snapshot().status).toBe("complete");
    expect(c.errors).toEqual([]);
  }, 10_000);

  it.each(COMPUTER_LEVELS)("resumes a cold %s computer turn from the stored board", async (level) => {
    const match = await createComputerMatch("human", level);
    const game = createGame({ userId: "human", displayName: "Human" }, { userId: match.guestId!, displayName: COMPUTER_OPPONENTS[level].name }, { seed: 61, firstLead: 1 });
    await prisma.match.update({ where: { id: match.id }, data: { gameNumber: 2, gameSeed: 61, gameState: JSON.stringify(game) } });
    const c = connection();
    await handleJoin(c.io, c.socket, match.inviteCode);
    await vi.waitFor(() => expect(c.view().yourTurn).toBe(true), { timeout: 5000 });
    const stored = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect((JSON.parse(stored.gameState!) as GameState).toMove).toBe(0);
    expect(stored.gameNumber).toBe(2);
    expect(c.errors).toEqual([]);
  }, 10_000);

  it("rolls back a failed computer write and retries safely when reopened", async () => {
    const match = await createComputerMatch("human", "easy");
    const game = createGame({ userId: "human", displayName: "Human" }, { userId: match.guestId!, displayName: "Analyst Edge" }, { seed: 9, firstLead: 1 });
    const original = JSON.stringify(game);
    await prisma.match.update({ where: { id: match.id }, data: { gameNumber: 1, gameSeed: 9, gameState: original } });
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_computer_write BEFORE UPDATE ON "Match" BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END`);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = connection();
    try {
      await handleJoin(c.io, c.socket, match.inviteCode);
      await vi.waitFor(() => expect(c.errors).toHaveLength(1), { timeout: 5000 });
      expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).gameState).toBe(original);
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER fail_computer_write"); errorLog.mockRestore(); }
    await handleJoin(c.io, c.socket, match.inviteCode);
    await vi.waitFor(() => expect(c.view().placed).toEqual([0, 1]), { timeout: 5000 });
  }, 10_000);

  it("completes a full game once, records computer history, and starts the next without waiting for another player", async () => {
    const match = await createComputerMatch("human", "easy");
    const c = connection();
    await handleJoin(c.io, c.socket, match.inviteCode);
    for (let turn = 0; turn < 20; turn++) {
      await vi.waitFor(() => expect(c.view().yourTurn).toBe(true), { timeout: 5000 });
      const view = c.view();
      const card = view.players[0].hand.find((slot) => slot.state === "card")!;
      if (card.state !== "card") throw new Error("Missing card");
      await handlePlace(c.io, c.socket, cardId(card.card), view.legalRows[0]);
    }
    await vi.waitFor(() => expect(c.view().phase).toBe("complete"), { timeout: 5000 });
    expect(await prisma.game.count({ where: { matchId: match.id } })).toBe(1);
    expect(await prisma.stats.findUnique({ where: { userId: "human" } })).toMatchObject({ gamesPlayed: 1 });
    expect((await opponentRecords("human"))[0]).toMatchObject({ games: 1, player: { displayName: "Analyst Edge", computerLevel: "easy" } });
    expect((await recentGames("human", match.guestId!, 1)).total).toBe(1);
    await handleJoin(c.io, c.socket, match.inviteCode);
    expect(await prisma.game.count({ where: { matchId: match.id } })).toBe(1);
    await handleNext(c.io, c.socket);
    await vi.waitFor(() => expect(c.view().yourTurn).toBe(true), { timeout: 5000 });
    expect(c.snapshot().gameNumber).toBe(2);
    expect(c.view().placed).toEqual([0, 1]);
    expect(c.errors).toEqual([]);
    // An empty room evicts only the cache, not the persisted resume state.
    const emptyIo = { in: () => ({ fetchSockets: async () => [] }) } as unknown as typeof c.io;
    await handleDisconnect(emptyIo, c.socket);
    expect(globals.__fiveOMatches.has(match.id)).toBe(false);
    await handleJoin(c.io, c.socket, match.inviteCode);
    expect(c.view().placed).toEqual([0, 1]);
  }, 25_000);
});
