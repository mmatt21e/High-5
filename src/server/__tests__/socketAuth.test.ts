import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

import { userIdFromCookie } from "../socketAuth";

const originalAuthUrl = process.env.AUTH_URL;
const originalAuthSecret = process.env.AUTH_SECRET;

afterEach(() => {
  vi.clearAllMocks();
  if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalAuthUrl;
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
});

describe("Socket.IO session cookie decoding", () => {
  it.each([
    {
      authUrl: "http://localhost:3105",
      cookieName: "authjs.session-token",
      secureCookie: false,
    },
    {
      authUrl: "https://five-o.example",
      cookieName: "__Secure-authjs.session-token",
      secureCookie: true,
    },
  ])(
    "matches Auth.js cookie naming for $authUrl",
    async ({ authUrl, cookieName, secureCookie }) => {
      process.env.AUTH_URL = authUrl;
      process.env.AUTH_SECRET = "test-secret";
      mocks.getToken.mockResolvedValue({ uid: "player-1" });

      await expect(userIdFromCookie(`${cookieName}=token`)).resolves.toBe(
        "player-1",
      );
      expect(mocks.getToken).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName,
          salt: cookieName,
          secureCookie,
          secret: "test-secret",
        }),
      );
    },
  );

  it("fails closed when the token cannot be decoded", async () => {
    process.env.AUTH_URL = "https://five-o.example";
    mocks.getToken.mockRejectedValue(new Error("invalid token"));

    await expect(
      userIdFromCookie("__Secure-authjs.session-token=bad"),
    ).resolves.toBeNull();
    await expect(userIdFromCookie(undefined)).resolves.toBeNull();
  });

  it("never admits a built-in computer identity as an interactive socket", async () => {
    for (const level of ["easy", "medium", "hard"]) {
      mocks.getToken.mockResolvedValue({ uid: `fiveo-computer-${level}` });
      await expect(userIdFromCookie("authjs.session-token=token")).resolves.toBeNull();
    }
  });
});
