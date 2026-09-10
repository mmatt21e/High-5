import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import sharp from "sharp";

const fixture = vi.hoisted(() => ({ path: `${process.cwd().replaceAll("\\", "/")}/prisma/player-features-${process.pid}-${Date.now()}.db` }));
vi.mock("../../lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: `file:${fixture.path}?connection_limit=1` } } }) };
});
import { prisma } from "../../lib/prisma";
import { sendInvitation, respondToInvitation } from "../invitations";
import { opponentRecords, recentGames } from "../playerHistory";
import { normalizeAvatar } from "../avatarUpload";
import { publicPlayer } from "../playerIdentity";
import { readLimitedBody } from "../requestLimits";

beforeAll(async () => {
  mkdirSync(dirname(fixture.path), { recursive: true });
  const directory = resolve("prisma/migrations");
  for (const name of readdirSync(directory).filter((name) => /^\d/.test(name)).sort()) {
    const sql = readFileSync(resolve(directory, name, "migration.sql"), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}, 30_000);

beforeEach(async () => {
  await prisma.gameInvitation.deleteMany(); await prisma.game.deleteMany();
  await prisma.match.deleteMany(); await prisma.user.deleteMany();
  await prisma.user.createMany({ data: ["host", "guest", "other"].map((id) => ({ id, email: `${id}@example.test`, displayName: id === "other" ? "guest" : id })) });
});

afterAll(async () => {
  await prisma.$disconnect();
  if (dirname(fixture.path) !== resolve("prisma").replaceAll("\\", "/") && resolve(dirname(fixture.path)) !== resolve("prisma")) throw new Error("Unexpected fixture path");
  for (const suffix of ["", "-journal", "-shm", "-wal"]) rmSync(fixture.path + suffix, { force: true });
});

describe("named invitations on SQLite", () => {
  it("keeps one pending invitation across duplicate sends and both directions", async () => {
    const first = await sendInvitation("host", "guest");
    expect((await sendInvitation("host", "guest")).id).toBe(first.id);
    await expect(sendInvitation("guest", "host")).rejects.toThrow("already invited");
    expect(await prisma.gameInvitation.count()).toBe(1);
    expect(await prisma.match.count()).toBe(0);
  });
  it("rejects self and nonexistent players", async () => {
    await expect(sendInvitation("host", "host")).rejects.toThrow("another player");
    await expect(sendInvitation("host", "missing")).rejects.toThrow("unavailable");
  });
  it("only lets the recipient accept, creating exactly one reserved match", async () => {
    const invitation = await sendInvitation("host", "guest");
    await expect(respondToInvitation("other", invitation.id, "accept")).rejects.toThrow("not found");
    await expect(respondToInvitation("host", invitation.id, "accept")).rejects.toThrow("not found");
    const result = await respondToInvitation("guest", invitation.id, "accept");
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await respondToInvitation("guest", invitation.id, "accept")).toEqual(result);
    expect(await prisma.match.count()).toBe(1);
    expect(await prisma.match.findFirst()).toMatchObject({ hostId: "host", guestId: "guest", status: "active" });
  });
  it("decline and cancel release the pair without starting a game", async () => {
    const invitation = await sendInvitation("host", "guest");
    await expect(respondToInvitation("host", invitation.id, "decline")).rejects.toThrow("not found");
    await respondToInvitation("guest", invitation.id, "decline");
    await expect(respondToInvitation("guest", invitation.id, "accept")).rejects.toThrow("already been answered");
    const next = await sendInvitation("host", "guest");
    expect(next.id).not.toBe(invitation.id);
    await expect(respondToInvitation("guest", next.id, "cancel")).rejects.toThrow("not found");
    await respondToInvitation("host", next.id, "cancel");
    expect(await prisma.match.count()).toBe(0);
  });
  it("rolls back acceptance when match creation fails", async () => {
    const invitation = await sendInvitation("host", "guest");
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_test_match BEFORE INSERT ON "Match" BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`);
    try {
      await expect(respondToInvitation("guest", invitation.id, "accept")).rejects.toThrow();
      expect(await prisma.gameInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({ status: "pending", matchId: null });
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER reject_test_match"); }
  });
});

describe("opponent history", () => {
  it("uses each player's seat, counts pushes once, and excludes ended matches from match outcomes", async () => {
    const data = [
      { id: "a", hostId: "host", guestId: "guest", status: "complete", winnerId: "host", results: [0, 1, null] },
      { id: "b", hostId: "guest", guestId: "host", status: "complete", winnerId: "guest", results: [0, 1] },
      { id: "c", hostId: "host", guestId: "guest", status: "complete", winnerId: null, results: [0] },
      { id: "d", hostId: "host", guestId: "other", status: "active", winnerId: null, results: [1] },
    ];
    for (const item of data) {
      await prisma.match.create({ data: { id: item.id, inviteCode: `CODE${item.id}`, hostId: item.hostId, guestId: item.guestId, status: item.status, winnerId: item.winnerId,
        games: { create: item.results.map((winnerSeat, index) => ({ gameNumber: index + 1, seed: 1, winnerSeat, resultJson: "{}", boardJson: "[]" })) } } });
    }
    const records = await opponentRecords("host");
    expect(records.find((record) => record.player.id === "guest")).toMatchObject({ games: 6, wins: 3, losses: 2, pushes: 1, matches: 2, matchWins: 1, matchLosses: 1 });
    expect(records.find((record) => record.player.id === "other")).toMatchObject({ games: 1, wins: 0, losses: 1, matches: 0 });
    expect((await opponentRecords("guest"))[0]).toMatchObject({ games: 6, wins: 2, losses: 3, pushes: 1, matchWins: 1, matchLosses: 1 });
    const history = await recentGames("host", "guest", 1);
    expect(history.total).toBe(6);
    expect(history.games.filter((game) => game.outcome === "Win")).toHaveLength(3);
    expect((await recentGames("other", "guest", 1)).games).toHaveLength(0);
  });
});

describe("avatar uploads and request boundaries", () => {
  it("normalizes PNG to a compact 128px WebP without exposing bytes in player data", async () => {
    const source = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#345678" } }).png().toBuffer();
    const image = await normalizeAvatar(source);
    const metadata = await sharp(Buffer.from(image.split(",")[1], "base64")).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 128, height: 128 });
    expect(metadata.exif).toBeUndefined();
    const player = publicPlayer({ id: "host", displayName: "Host", image });
    expect(player.avatar).toMatch(/^\/api\/players\/host\/avatar\?v=/);
    expect(JSON.stringify(player)).not.toContain("base64");
  });
  it("rejects oversized, corrupt and vector images", async () => {
    await expect(normalizeAvatar(new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toThrow();
    await expect(normalizeAvatar(Buffer.from("not an image"))).rejects.toThrow();
    await expect(normalizeAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>'))).rejects.toThrow();
  });
  it("enforces the actual body length even without a content-length header", async () => {
    await expect(readLimitedBody(new Request("http://example.test", { method: "PUT", body: "abcdef" }), 5)).rejects.toThrow("BODY_TOO_LARGE");
  });
});
