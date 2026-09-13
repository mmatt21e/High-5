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
import { resolve } from "node:path";
const fixture = vi.hoisted(() => ({
  memberCookie: "",
  adminCookie: "",
  path: `${process.cwd().replaceAll("\\", "/")}/prisma/members-${process.pid}-${Date.now()}.db`,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({
      value: name.includes("admin")
        ? fixture.adminCookie
        : fixture.memberCookie,
    }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock("@/lib/prisma", async () => import("../../lib/prisma"));
vi.mock("@/server/admin", async () => import("../admin"));
vi.mock("@/server/members", async () => import("../members"));
vi.mock("@/server/requestLimits", async () => import("../requestLimits"));
vi.mock("../../lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasources: { db: { url: `file:${fixture.path}?connection_limit=1` } },
    }),
  };
});
import { prisma } from "../../lib/prisma";
import { changeCredentials, digest, getAdmin, loginAdmin } from "../admin";
import {
  changeMemberPassword,
  getMember,
  loginMember,
  manageMembers,
  redeemMemberCode,
} from "../members";
import { GET, POST } from "../../app/api/members/route";
import { POST as MANAGE } from "../../app/api/admin/members/route";
import { resetAccountRateLimit } from "../../lib/rateLimit";
const account = {
  email: "member@example.test",
  displayName: "Invited member",
  password: "long-member-password-123",
};
const owner = {
  username: "owner",
  password: "owner-password-12345",
  recoveryEmail: "owner@example.test",
};
let ownerToken = "";
beforeAll(async () => {
  for (const name of readdirSync(resolve("prisma/migrations"))
    .filter((n) => /^\d/.test(n))
    .sort()) {
    for (const sql of readFileSync(
      resolve("prisma/migrations", name, "migration.sql"),
      "utf8",
    )
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await prisma.$executeRawUnsafe(sql);
  }
  const first = await loginAdmin("admin", "admin", "");
  await changeCredentials(first.token, owner, "admin");
  ownerToken = (await loginAdmin(owner.username, owner.password, "")).token;
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("AUTH_URL", "https://games.example.test");
  fixture.memberCookie = "";
  fixture.adminCookie = ownerToken;
  await prisma.memberSession.deleteMany();
  await prisma.memberInvite.deleteMany();
  await prisma.memberAccount.deleteMany();
  for (const action of ["login", "join", "reset"])
    resetAccountRateLimit(`members:${action}`, digest(account.email));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-shm", "-wal"])
    rmSync(fixture.path + suffix, { force: true });
});
const request = (body: unknown, origin = "https://games.example.test") =>
  new Request("https://games.example.test/api/members", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function invite(extra = {}) {
  return manageMembers(ownerToken, {
    action: "invite",
    label: "Test invitation",
    ...extra,
  });
}
async function enrolled() {
  const issued = await invite();
  await redeemMemberCode({ ...account, code: issued.code }, "join");
  return loginMember(account);
}

describe("invite-only membership in SQLite", () => {
  it("requires a configured owner for every management operation", async () => {
    await expect(
      manageMembers(undefined, { action: "invite" }),
    ).rejects.toMatchObject({ status: 401 });
    const bootstrap = await prisma.siteAdmin.update({
      where: { id: "owner" },
      data: { needsSetup: true },
    });
    await expect(
      manageMembers(ownerToken, { action: "invite" }),
    ).rejects.toMatchObject({ status: 403 });
    await prisma.siteAdmin.update({
      where: { id: bootstrap.id },
      data: { needsSetup: false },
    });
    fixture.adminCookie = "";
    expect((await MANAGE(request({ action: "invite" }))).status).toBe(401);
    expect(await prisma.memberInvite.count()).toBe(0);
  });
  it("hashes codes, consumes once, and keeps public and owner roles separate", async () => {
    const issued = await invite({ email: account.email });
    const stored = await prisma.memberInvite.findFirstOrThrow();
    expect(stored.codeHash).toBe(digest(issued.code!));
    expect(JSON.stringify(stored)).not.toContain(issued.code);
    await redeemMemberCode({ ...account, code: issued.code }, "join");
    const token = await loginMember(account);
    expect(await getMember(token)).toEqual(
      expect.objectContaining({ displayName: account.displayName }),
    );
    expect(await getMember(ownerToken)).toBeNull();
    expect(await getAdmin(token)).toBeNull();
    expect(await prisma.user.count()).toBe(0);
    expect((await prisma.memberSession.findFirstOrThrow()).tokenHash).toBe(
      digest(token),
    );
    await expect(
      redeemMemberCode(
        { ...account, email: "second@example.test", code: issued.code },
        "join",
      ),
    ).rejects.toThrow();
    expect(await prisma.memberAccount.count()).toBe(1);
  });
  it("rejects wrong-email, expired, revoked and invented invitations", async () => {
    const issued = await invite({ email: account.email });
    await expect(
      redeemMemberCode(
        { ...account, email: "wrong@example.test", code: issued.code },
        "join",
      ),
    ).rejects.toThrow();
    expect((await prisma.memberInvite.findFirstOrThrow()).claimedAt).toBeNull();
    await prisma.memberInvite.updateMany({ data: { expiresAt: new Date(0) } });
    await expect(
      redeemMemberCode({ ...account, code: issued.code }, "join"),
    ).rejects.toThrow();
    const next = await invite();
    const saved = await prisma.memberInvite.findUniqueOrThrow({
      where: { codeHash: digest(next.code!) },
    });
    await manageMembers(ownerToken, { action: "revokeInvite", id: saved.id });
    await expect(
      redeemMemberCode({ ...account, code: next.code }, "join"),
    ).rejects.toThrow();
    await expect(
      redeemMemberCode({ ...account, code: "a".repeat(48) }, "join"),
    ).rejects.toThrow();
  });
  it("rolls back code consumption when email is already registered", async () => {
    await enrolled();
    const issued = await invite();
    await expect(
      redeemMemberCode({ ...account, code: issued.code }, "join"),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await prisma.memberInvite.findUniqueOrThrow({
          where: { codeHash: digest(issued.code!) },
        })
      ).claimedAt,
    ).toBeNull();
    await redeemMemberCode(
      { ...account, email: "another@example.test", code: issued.code },
      "join",
    );
  });
  it("allows only one winner when an invitation is redeemed concurrently", async () => {
    const issued = await invite();
    const results = await Promise.allSettled([
      redeemMemberCode({ ...account, code: issued.code }, "join"),
      redeemMemberCode(
        { ...account, email: "race@example.test", code: issued.code },
        "join",
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.memberAccount.count()).toBe(1);
  });
  it("suspends access immediately and never resurrects old sessions on restore", async () => {
    const token = await enrolled();
    const member = (await getMember(token))!;
    const reset = await manageMembers(ownerToken, {
      action: "resetMember",
      id: member.id,
    });
    await manageMembers(ownerToken, {
      action: "updateMember",
      id: member.id,
      active: false,
      displayName: "Updated member",
    });
    expect(await getMember(token)).toBeNull();
    await expect(loginMember(account)).rejects.toMatchObject({ status: 401 });
    await manageMembers(ownerToken, {
      action: "updateMember",
      id: member.id,
      active: true,
    });
    expect(await getMember(token)).toBeNull();
    await expect(
      redeemMemberCode({ ...account, code: reset.code }, "reset"),
    ).rejects.toThrow();
    expect(await getMember(await loginMember(account))).toEqual(
      expect.objectContaining({ displayName: "Updated member" }),
    );
  });
  it("expires sessions and supports owner-forced sign out", async () => {
    let token = await enrolled();
    const id = (await getMember(token))!.id;
    await prisma.memberSession.updateMany({ data: { expiresAt: new Date(0) } });
    expect(await getMember(token)).toBeNull();
    token = await loginMember(account);
    await manageMembers(ownerToken, { action: "revokeSessions", id });
    expect(await getMember(token)).toBeNull();
  });
  it("resets only the bound member, invalidating sessions and previous reset codes", async () => {
    const token = await enrolled();
    const id = (await getMember(token))!.id;
    const older = await manageMembers(ownerToken, {
      action: "resetMember",
      id,
    });
    const issued = await manageMembers(ownerToken, {
      action: "resetMember",
      id,
    });
    await expect(
      redeemMemberCode({ ...account, code: older.code }, "reset"),
    ).rejects.toThrow();
    await expect(
      redeemMemberCode({ ...account, code: issued.code }, "join"),
    ).rejects.toThrow();
    const password = "updated-member-password";
    await redeemMemberCode(
      { ...account, password, code: issued.code },
      "reset",
    );
    expect(await getMember(token)).toBeNull();
    await expect(loginMember(account)).rejects.toThrow();
    expect(
      await getMember(await loginMember({ ...account, password })),
    ).not.toBeNull();
    await expect(
      redeemMemberCode({ ...account, password, code: issued.code }, "reset"),
    ).rejects.toThrow();
  });
  it("requires the current password and clears all sessions on password changes", async () => {
    const token = await enrolled();
    await expect(
      changeMemberPassword(token, {
        currentPassword: "wrong",
        password: "replacement-password",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await changeMemberPassword(token, {
      currentPassword: account.password,
      password: "replacement-password",
    });
    expect(await getMember(token)).toBeNull();
    await expect(loginMember(account)).rejects.toThrow();
  });
  it("protects API access and rejects cross-origin writes without changing data", async () => {
    expect((await GET()).status).toBe(401);
    expect(
      (
        await POST(
          request(
            { action: "join", ...account, code: "a".repeat(48) },
            "https://other.example.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await MANAGE(
          request({ action: "invite" }, "https://other.example.test"),
        )
      ).status,
    ).toBe(403);
    fixture.memberCookie = await enrolled();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Object.keys((await response.json()).member).sort()).toEqual([
      "displayName",
      "email",
      "id",
    ]);
    fixture.adminCookie = fixture.memberCookie;
    expect((await MANAGE(request({ action: "invite" }))).status).toBe(401);
    expect((await POST(request({ action: "logout" }))).status).toBe(200);
    expect(await getMember(fixture.memberCookie)).toBeNull();
  });
  it("validates passwords and bounds login retries and request sizes", async () => {
    const issued = await invite();
    await expect(
      redeemMemberCode(
        { ...account, password: "short", code: issued.code },
        "join",
      ),
    ).rejects.toThrow();
    await expect(
      redeemMemberCode(
        { ...account, password: "🔐".repeat(30), code: issued.code },
        "join",
      ),
    ).rejects.toThrow();
    expect(
      (
        await POST(
          request({ action: "login", ...account, extra: "x".repeat(8192) }),
        )
      ).status,
    ).toBe(413);
    for (let i = 0; i < 12; i++)
      expect(
        (
          await POST(
            request({ action: "login", ...account, password: "wrong" }),
          )
        ).status,
      ).toBe(401);
    expect((await POST(request({ action: "login", ...account }))).status).toBe(
      429,
    );
  });
});
