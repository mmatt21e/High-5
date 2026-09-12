import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import bcrypt from "bcryptjs";
const fixture = vi.hoisted(() => ({
  cookie: "",
  path: `${process.cwd().replaceAll("\\", "/")}/prisma/admin-${process.pid}-${Date.now()}.db`,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: fixture.cookie }), set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/lib/prisma", async () => import("../../lib/prisma"));
vi.mock("@/server/admin", async () => import("../admin"));
vi.mock("@/server/requestLimits", async () => import("../requestLimits"));
vi.mock("@/server/adminMail", () => ({ mailConfigured: () => false, sendAdminEmail: vi.fn() }));
vi.mock("../../lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasources: { db: { url: `file:${fixture.path}?connection_limit=1` } },
    }),
  };
});
import { prisma } from "../../lib/prisma";
import { POST } from "../../app/api/admin/route";
import {
  changeCredentials,
  consumeEmailToken,
  createEmailToken,
  credentialsSchema,
  digest,
  gameSchema,
  getAdmin,
  loginAdmin,
  requireAdmin,
} from "../admin";
beforeAll(async () => {
  const directory = resolve("prisma/migrations");
  for (const name of readdirSync(directory)
    .filter((name) => /^\d/.test(name))
    .sort()) {
    for (const sql of readFileSync(
      resolve(directory, name, "migration.sql"),
      "utf8",
    )
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await prisma.$executeRawUnsafe(sql);
  }
}, 30_000);
beforeEach(async () => {
  vi.unstubAllEnvs();
  await prisma.adminToken.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.siteAdmin.deleteMany();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
  if (resolve(dirname(fixture.path)) !== resolve("prisma"))
    throw new Error("Unexpected fixture path");
  for (const suffix of ["", "-journal", "-shm", "-wal"])
    rmSync(fixture.path + suffix, { force: true });
});
const account = {
  username: "owner",
  password: "a-test-password-123",
  recoveryEmail: "owner@example.test",
};
async function configured() {
  const first = await loginAdmin("admin", "admin", "");
  await changeCredentials(first.token, account, "admin");
  const session = await loginAdmin(account.username, account.password, "");
  return { session, admin: (await getAdmin(session.token))! };
}
describe("admin account lifecycle in SQLite", () => {
  it("saves and removes catalog listings through the protected API without altering game data", async () => {
    vi.stubEnv("AUTH_URL", "https://games.example.test");
    const request = (body: unknown) => POST(new Request("https://games.example.test/api/admin", { method: "POST", headers: { origin: "https://games.example.test", "content-type": "application/json" }, body: JSON.stringify(body) }));
    fixture.cookie = (await loginAdmin("admin", "admin", "")).token;
    expect((await request({ action: "saveHome", headline: "Blocked", intro: "Blocked" })).status).toBe(403);
    await changeCredentials(fixture.cookie, account, "admin");
    fixture.cookie = (await loginAdmin(account.username, account.password, "")).token;
    expect((await request({ action: "saveHome", headline: "Play together", intro: "Choose a game." })).status).toBe(200);
    expect((await prisma.siteContent.findUniqueOrThrow({ where: { id: "home" } })).headline).toBe("Play together");
    const draft = { action: "saveGame", title: "Test puzzle", description: "Preview", category: "Puzzle", status: "draft", href: "", sortOrder: 3 };
    expect((await request(draft)).status).toBe(200);
    const saved = await prisma.catalogGame.findFirstOrThrow({ where: { title: "Test puzzle" } });
    expect((await request({ ...draft, id: saved.id, status: "live" })).status).toBe(400);
    expect((await request({ ...draft, id: saved.id, status: "live", href: "https://example.test/puzzle" })).status).toBe(200);
    expect((await prisma.catalogGame.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe("live");
    expect((await request({ action: "deleteGame", id: saved.id })).status).toBe(200);
    expect(await prisma.catalogGame.findUnique({ where: { id: saved.id } })).toBeNull();
    expect(await prisma.catalogGame.findUnique({ where: { id: "five-o" } })).not.toBeNull();
    await prisma.adminSession.deleteMany();
    expect((await request({ action: "saveHome", headline: "Revoked", intro: "Revoked" })).status).toBe(401);
  });
  it("requires a private setup key in production and does not create an account on rejection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(loginAdmin("admin", "admin", "")).rejects.toThrow(
      "private setup key",
    );
    vi.stubEnv("ADMIN_SETUP_KEY", "x".repeat(32));
    await expect(loginAdmin("admin", "admin", "wrong")).rejects.toThrow(
      "private setup key",
    );
    expect(await prisma.siteAdmin.count()).toBe(0);
    const first = await loginAdmin("admin", "admin", "x".repeat(32));
    expect(first.needsSetup).toBe(true);
  });
  it("blocks management until both defaults change and revokes every bootstrap session", async () => {
    const first = await loginAdmin("admin", "admin", "");
    const second = await loginAdmin("admin", "admin", "");
    await expect(requireAdmin(first.token)).rejects.toThrow(
      "Change your username",
    );
    expect((await requireAdmin(first.token, true)).needsSetup).toBe(true);
    await expect(
      changeCredentials(
        first.token,
        { ...account, username: "admin" },
        "admin",
      ),
    ).rejects.toThrow();
    await expect(
      changeCredentials(
        first.token,
        { ...account, password: "admin" },
        "admin",
      ),
    ).rejects.toThrow();
    await changeCredentials(first.token, account, "admin");
    expect(await getAdmin(first.token)).toBeNull();
    expect(await getAdmin(second.token)).toBeNull();
    await expect(loginAdmin("admin", "admin", "")).rejects.toThrow("Invalid");
    expect(
      (
        await getAdmin(
          (await loginAdmin(account.username, account.password, "")).token,
        )
      )?.needsSetup,
    ).toBe(false);
  });
  it("stores only hashes, enforces expiry and session version revocation", async () => {
    const { session } = await configured();
    const stored = await prisma.adminSession.findFirstOrThrow();
    expect(stored.tokenHash).toBe(digest(session.token));
    expect(stored.tokenHash).not.toBe(session.token);
    await prisma.adminSession.update({
      where: { tokenHash: stored.tokenHash },
      data: { expiresAt: new Date(0) },
    });
    expect(await getAdmin(session.token)).toBeNull();
    const fresh = await loginAdmin(account.username, account.password, "");
    await prisma.siteAdmin.update({
      where: { id: "owner" },
      data: { version: { increment: 1 } },
    });
    expect(await getAdmin(fresh.token)).toBeNull();
  });
  it("requires email verification; tokens are bound to purpose, address, version and expiry", async () => {
    const { admin } = await configured();
    const token = await createEmailToken(admin, "verify");
    await expect(
      consumeEmailToken(token, "reset", "another-test-password"),
    ).rejects.toThrow("invalid or expired");
    await prisma.adminToken.update({
      where: { tokenHash: digest(token) },
      data: { expiresAt: new Date(0) },
    });
    await expect(consumeEmailToken(token, "verify")).rejects.toThrow(
      "invalid or expired",
    );
    const newToken = await createEmailToken(admin, "verify");
    await consumeEmailToken(newToken, "verify");
    await expect(consumeEmailToken(newToken, "verify")).rejects.toThrow();
    expect((await prisma.siteAdmin.findFirstOrThrow()).emailVerified).toBe(
      true,
    );
  });
  it("resets only once and revokes sessions and all other links", async () => {
    const { session, admin } = await configured();
    await consumeEmailToken(await createEmailToken(admin, "verify"), "verify");
    const verified = (await getAdmin(session.token))!;
    const token = await createEmailToken(verified, "reset");
    await consumeEmailToken(token, "reset", "replacement-password-456");
    expect(await getAdmin(session.token)).toBeNull();
    expect(await prisma.adminToken.count()).toBe(0);
    await expect(
      consumeEmailToken(token, "reset", "replacement-password-789"),
    ).rejects.toThrow();
    expect(
      await bcrypt.compare(
        "replacement-password-456",
        (await prisma.siteAdmin.findFirstOrThrow()).passwordHash,
      ),
    ).toBe(true);
  });
  it("requires the current password and reverifies a changed recovery address", async () => {
    const { session, admin } = await configured();
    await consumeEmailToken(await createEmailToken(admin, "verify"), "verify");
    await expect(
      changeCredentials(
        session.token,
        { ...account, password: "changed-password-456" },
        "wrong",
      ),
    ).rejects.toThrow("Current password");
    const oldLink = await createEmailToken(
      (await getAdmin(session.token))!,
      "reset",
    );
    await changeCredentials(
      session.token,
      {
        ...account,
        password: "changed-password-456",
        recoveryEmail: "new@example.test",
      },
      account.password,
    );
    expect((await prisma.siteAdmin.findFirstOrThrow()).emailVerified).toBe(
      false,
    );
    await expect(
      consumeEmailToken(oldLink, "reset", "another-password-789"),
    ).rejects.toThrow();
  });
  it("rejects unsafe game links, missing live destinations, and bcrypt truncation", () => {
    const game = {
      title: "Next game",
      description: "A new game",
      category: "Puzzle",
      status: "live",
      href: "/games/puzzle",
      sortOrder: 1,
    };
    expect(gameSchema.safeParse(game).success).toBe(true);
    for (const href of [
      "",
      "javascript:alert(1)",
      "//evil.test",
      "/\\evil.test",
      "https://user:pass@example.test",
    ])
      expect(gameSchema.safeParse({ ...game, href }).success).toBe(false);
    expect(
      credentialsSchema.safeParse({ ...account, password: "😀".repeat(20) })
        .success,
    ).toBe(false);
  });
});
