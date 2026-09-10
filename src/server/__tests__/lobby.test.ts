import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";

const fixture = vi.hoisted(() => ({ path: `${process.cwd().replaceAll("\\", "/")}/prisma/lobby-${process.pid}-${Date.now()}.db` }));
vi.mock("../../lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: `file:${fixture.path}?connection_limit=1` } } }) };
});
import { prisma } from "../../lib/prisma";
import { actInLobby, lobbySnapshot } from "../lobby";

beforeAll(async () => {
  const directory = resolve("prisma/migrations");
  for (const name of readdirSync(directory).filter((name) => /^\d/.test(name)).sort()) {
    for (const sql of readFileSync(resolve(directory, name, "migration.sql"), "utf8").split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(sql);
  }
}, 30_000);
beforeEach(async () => {
  await prisma.gameRequest.deleteMany(); await prisma.match.deleteMany(); await prisma.user.deleteMany();
  await prisma.user.createMany({ data: ["alice", "bob", "carol", "dave"].map((id) => ({ id, displayName: id, email: `${id}@example.test` })) });
});
afterAll(async () => {
  await prisma.$disconnect();
  if (resolve(dirname(fixture.path)) !== resolve("prisma")) throw new Error("Unexpected fixture path");
  for (const suffix of ["", "-journal", "-shm", "-wal"]) rmSync(fixture.path + suffix, { force: true });
});
const post = (user: string, targetWins = 5) => actInLobby(user, { action: "post", targetWins, note: "Let's play" });
const auto = (user: string, targetWins = 5) => actInLobby(user, { action: "auto", targetWins });
const request = (userId: string) => prisma.gameRequest.findUniqueOrThrow({ where: { userId } });
const expire = async (user: string) => prisma.gameRequest.update({ where: { userId: user }, data: { expiresAt: new Date(0) } });

describe("persistent game lobby on SQLite", () => {
  it("publishes one post per player without private account data or invite codes", async () => {
    await post("alice"); await post("alice");
    expect(await prisma.gameRequest.count()).toBe(1);
    const view = await lobbySnapshot("bob");
    expect(view.total).toBe(1); expect(view.posts[0].note).toBe("Let's play");
    expect(JSON.stringify(view)).not.toContain("email"); expect(view.posts[0].code).toBeNull();
    expect((await lobbySnapshot("alice")).posts).toHaveLength(0);
  });
  it("reserves two seats once, survives reconnect, and supports join retries", async () => {
    await post("alice", 3);
    const id = (await request("alice")).id;
    const joined = await actInLobby("bob", { action: "join", id });
    expect(await actInLobby("bob", { action: "join", id })).toEqual(joined);
    await prisma.$disconnect();
    expect((await lobbySnapshot("alice")).own?.code).toEqual((joined as { code: string }).code);
    const match = await prisma.match.findFirstOrThrow();
    expect(match).toMatchObject({ hostId: "alice", guestId: "bob", targetWins: 3, status: "active" });
    expect(await prisma.match.count()).toBe(1);
    expect((await lobbySnapshot("carol")).posts).toHaveLength(0);
    await expect(actInLobby("carol", { action: "join", id })).rejects.toThrow("no longer available");
  });
  it("only allows one winner when two players join simultaneously", async () => {
    await post("alice"); const id = (await request("alice")).id;
    const results = await Promise.allSettled([actInLobby("bob", { action: "join", id }), actInLobby("carol", { action: "join", id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.match.count()).toBe(1); expect(await prisma.gameRequest.count()).toBe(2);
  });
  it("pairs two concurrent automatic searches without self-matching or duplicate matches", async () => {
    await Promise.all([auto("alice"), auto("bob"), auto("alice"), auto("bob")]);
    expect(await prisma.match.count()).toBe(1);
    expect(await prisma.gameRequest.count({ where: { status: "waiting" } })).toBe(0);
  });
  it("finds the oldest compatible public post and leaves different lengths available", async () => {
    await post("alice", 1); await post("bob", 3); await post("carol", 3);
    await prisma.gameRequest.update({ where: { userId: "bob" }, data: { createdAt: new Date(1) } });
    await auto("dave", 3);
    expect(await prisma.match.findFirst()).toMatchObject({ hostId: "bob", guestId: "dave", targetWins: 3 });
    expect((await lobbySnapshot("dave", 1)).posts.map((p) => p.player.id)).toEqual(["alice"]);
  });
  it("matches a newly posted game with an already waiting auto player", async () => {
    await auto("alice", 1); expect((await lobbySnapshot("bob")).posts).toHaveLength(0);
    await post("bob", 1);
    expect(await prisma.match.findFirst()).toMatchObject({ hostId: "alice", guestId: "bob", targetWins: 1 });
  });
  it("rejects self-joins and cancelling or renewing someone else's request", async () => {
    await post("alice"); const id = (await request("alice")).id;
    await expect(actInLobby("alice", { action: "join", id })).rejects.toThrow("another player");
    await expect(actInLobby("bob", { action: "cancel", id })).rejects.toThrow("no longer current");
    await expect(actInLobby("bob", { action: "heartbeat", id })).rejects.toThrow("no longer current");
    expect(await prisma.gameRequest.count()).toBe(1);
  });
  it("hides and rejects expired posts, and never revives expired searches by heartbeat", async () => {
    await post("alice"); const id = (await request("alice")).id; await expire("alice");
    expect((await lobbySnapshot("bob")).posts).toHaveLength(0);
    await expect(actInLobby("bob", { action: "join", id })).rejects.toThrow("no longer available");
    await auto("bob"); const bob = await request("bob"); await expire("bob");
    await actInLobby("bob", { action: "heartbeat", id: bob.id });
    expect((await request("bob")).expiresAt.getTime()).toBe(0);
    await auto("carol"); expect(await prisma.match.count()).toBe(0);
  });
  it("renews a live auto search, but does not extend public posts", async () => {
    await auto("alice"); const original = await request("alice");
    await prisma.gameRequest.update({ where: { userId: "alice" }, data: { expiresAt: new Date(Date.now() + 1000) } });
    await actInLobby("alice", { action: "heartbeat", id: original.id });
    expect((await request("alice")).expiresAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    await post("bob", 1); const bob = await request("bob");
    await actInLobby("bob", { action: "heartbeat", id: bob.id });
    expect((await request("bob")).expiresAt).toEqual(bob.expiresAt);
  });
  it("protects a replacement post from stale cancellation and removes a cancelled search", async () => {
    await auto("alice"); const old = await request("alice");
    await actInLobby("alice", { action: "cancel", id: old.id });
    await post("alice"); const current = await request("alice");
    expect(current.id).not.toBe(old.id);
    await expect(actInLobby("alice", { action: "cancel", id: old.id })).rejects.toThrow("no longer current");
    await actInLobby("alice", { action: "cancel", id: current.id });
    await auto("bob"); expect(await prisma.match.count()).toBe(0);
  });
  it("reconciles cancel versus match without deleting the reserved game", async () => {
    await auto("alice"); const id = (await request("alice")).id;
    await auto("bob");
    const result = await actInLobby("alice", { action: "cancel", id });
    expect(result).toHaveProperty("code"); expect(await prisma.match.count()).toBe(1);
    expect((await lobbySnapshot("alice")).own).toBeNull();
  });
  it("consumes the joining player's other post and blocks another lobby match until cleared", async () => {
    await post("alice"); await post("bob"); await post("carol");
    await actInLobby("bob", { action: "join", id: (await request("alice")).id });
    expect((await lobbySnapshot("dave")).posts.map((p) => p.player.id)).toEqual(["carol"]);
    await expect(actInLobby("bob", { action: "join", id: (await request("carol")).id })).rejects.toThrow("previous match");
    await auto("bob"); expect(await prisma.match.count()).toBe(1);
  });
  it("rejects computer identities and missing accounts", async () => {
    await prisma.user.update({ where: { id: "alice" }, data: { computerLevel: "easy" } });
    await expect(post("alice")).rejects.toThrow("unavailable");
    await expect(post("missing")).rejects.toThrow("unavailable");
  });
  it("rolls back both request claims when match creation fails", async () => {
    await post("alice");
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_lobby_match BEFORE INSERT ON Match BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    try { await expect(auto("bob")).rejects.toThrow(); }
    finally { await prisma.$executeRawUnsafe("DROP TRIGGER fail_lobby_match"); }
    expect((await request("alice")).status).toBe("waiting");
    expect(await prisma.gameRequest.count()).toBe(1); expect(await prisma.match.count()).toBe(0);
  });
});
