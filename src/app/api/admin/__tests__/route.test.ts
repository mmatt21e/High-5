import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  require: vi.fn(),
  limit: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  change: vi.fn(),
  consume: vi.fn(),
  owner: vi.fn(),
  send: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: mocks.set,
    delete: mocks.remove,
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { siteAdmin: { findUnique: mocks.owner } },
}));
vi.mock("@/server/requestLimits", async () => ({
  ...(await import("../../../../server/requestLimits")),
  limitRequest: mocks.limit,
}));
vi.mock("@/server/admin", async () => ({
  ...(await import("../../../../server/admin")),
  loginAdmin: mocks.login,
  requireAdmin: mocks.require,
  changeCredentials: mocks.change,
  consumeEmailToken: mocks.consume,
}));
vi.mock("@/server/adminMail", () => ({
  mailConfigured: () => false,
  sendAdminEmail: mocks.send,
}));
import { POST } from "../route";
import { AdminError } from "../../../../server/admin";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_URL", "https://games.example.test");
  mocks.limit.mockReturnValue(null);
  mocks.require.mockRejectedValue(new AdminError("Sign in", 401));
  mocks.owner.mockResolvedValue(null);
});
function request(body: unknown, origin = "https://games.example.test") {
  return new Request("https://games.example.test/api/admin", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("admin HTTP boundary", () => {
  it("rejects cross-origin writes before authentication", async () => {
    expect(
      (await POST(request({ action: "login" }, "https://other.test"))).status,
    ).toBe(403);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("rejects missing sessions for every catalog mutation", async () => {
    for (const action of [
      "saveGame",
      "deleteGame",
      "saveHome",
      "sendVerification",
    ])
      expect((await POST(request({ action }))).status).toBe(401);
  });
  it("sets an HttpOnly strict cookie and sends setup logins to the required setup page", async () => {
    mocks.login.mockResolvedValue({
      token: "test-token",
      maxAge: 900,
      needsSetup: true,
    });
    const response = await POST(
      request({ action: "login", username: "admin", password: "admin" }),
    );
    expect(await response.json()).toEqual({ redirect: "/admin/setup" });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.any(String),
      "test-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 900,
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects oversized bodies and rate-limited logins", async () => {
    expect(
      (await POST(request({ action: "login", username: "x".repeat(9000) })))
        .status,
    ).toBe(413);
    mocks.limit.mockReturnValue(new Response("limited", { status: 429 }));
    expect(
      (
        await POST(
          request({ action: "login", username: "admin", password: "admin" }),
        )
      ).status,
    ).toBe(429);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("does not expose whether a recovery email exists or send to unverified addresses", async () => {
    const unknown = await (
      await POST(request({ action: "forgot", email: "unknown@example.test" }))
    ).json();
    mocks.owner.mockResolvedValue({
      recoveryEmail: "known@example.test",
      emailVerified: false,
      needsSetup: false,
    });
    const known = await (
      await POST(request({ action: "forgot", email: "known@example.test" }))
    ).json();
    expect(known).toEqual(unknown);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
