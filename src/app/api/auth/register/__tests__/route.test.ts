import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, create: mocks.create },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: mocks.hash },
}));

import {
  RATE_LIMITS,
  resetAccountRateLimit,
  resetGlobalRateLimit,
} from "../../../../../lib/rateLimit";
import { POST } from "../route";

function request(email: string, password = "correct-horse-battery") {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Player", email, password }),
  });
}

describe("registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGlobalRateLimit("registration");
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("password-hash");
    mocks.create.mockResolvedValue({ id: "user-1" });
  });

  it("rejects passwords whose UTF-8 representation exceeds bcrypt's limit", async () => {
    const response = await POST(request("bytes@example.com", "🔐".repeat(19)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password must be 72 UTF-8 bytes or fewer",
    });
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it("returns a conflict if another registration wins the unique-email race", async () => {
    const email = "race@example.com";
    resetAccountRateLimit("registration", email);
    mocks.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const response = await POST(request(email));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "An account with that email already exists",
    });
  });

  it("bounds expensive work when registration attempts rotate email addresses", async () => {
    for (let index = 0; index < RATE_LIMITS.registrationGlobal.limit; index++) {
      const response = await POST(request(`rotating-${index}@example.com`));
      expect(response.status).toBe(201);
    }

    const blocked = await POST(request("rotating-blocked@example.com"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.findUnique).toHaveBeenCalledTimes(
      RATE_LIMITS.registrationGlobal.limit,
    );
    expect(mocks.hash).toHaveBeenCalledTimes(
      RATE_LIMITS.registrationGlobal.limit,
    );
    expect(mocks.create).toHaveBeenCalledTimes(
      RATE_LIMITS.registrationGlobal.limit,
    );
  });
});
