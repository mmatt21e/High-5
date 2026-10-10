import { beforeEach, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("../../lib/prisma", () => ({ prisma: { adminSession: { findUnique: find } } }));
import { sportsLabAdminSession } from "../sportsLabAuthorization";
beforeEach(() => { find.mockReset(); });
it("uses only the existing administrator hash, expiry, version and completed setup", async () => {
  const hash = "a".repeat(64), expiresAt = new Date(Date.now() + 60000);
  expect(await sportsLabAdminSession("invalid")).toBeNull(); expect(find).not.toHaveBeenCalled();
  for (const fixture of [null, { expiresAt: new Date(0), version: 1, admin: { version: 1, needsSetup: false } }, { expiresAt, version: 1, admin: { version: 2, needsSetup: false } }, { expiresAt, version: 1, admin: { version: 1, needsSetup: true } }]) {
    find.mockResolvedValue(fixture); expect(await sportsLabAdminSession(hash)).toBeNull();
  }
  find.mockResolvedValue({ expiresAt, version: 1, admin: { version: 1, needsSetup: false } });
  expect(await sportsLabAdminSession(hash)).toEqual({ expiresAt: expiresAt.getTime() });
  expect(find).toHaveBeenLastCalledWith({ where: { tokenHash: hash }, include: { admin: true } });
});
