import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  parse: vi.fn(),
  takeRateLimit: vi.fn(),
  store: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/pushSubscription", () => ({
  pushSubscriptionSchema: { safeParse: mocks.parse },
}));
vi.mock("@/lib/rateLimit", () => ({
  RATE_LIMITS: { pushSubscribe: { limit: 1, windowMs: 1 } },
  takeAccountRateLimit: mocks.takeRateLimit,
}));
vi.mock("@/server/pushSubscriptionStore", () => ({
  storePushSubscription: mocks.store,
}));

import { POST } from "../route";

const userId = "push-route-user";
const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
  keys: {
    p256dh: Buffer.concat([
      Buffer.from([0x04]),
      Buffer.alloc(64, 0x2a),
    ]).toString("base64url"),
    auth: Buffer.alloc(16, 0x17).toString("base64url"),
  },
};

function request() {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validSubscription),
  });
}

describe("push subscribe route conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId } });
    mocks.parse.mockReturnValue({ success: true, data: validSubscription });
    mocks.takeRateLimit.mockReturnValue({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
  });

  it.each([
    ["endpoint-owned", "That push subscription belongs to another account"],
    [
      "subscription-limit",
      "This account already has the maximum number of devices",
    ],
  ] as const)("returns the stable %s conflict reason", async (reason, error) => {
    mocks.store.mockResolvedValue({ ok: false, reason });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error, reason });
  });
});
