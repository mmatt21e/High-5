import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

vi.mock("../prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import {
  PUSH_SEND_CONCURRENCY,
  PUSH_SEND_TIMEOUT_MS,
  sendPushToUser,
} from "../push";

const p256dh = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x51),
]).toString("base64url");
const auth = Buffer.alloc(16, 0x61).toString("base64url");

function row(index: number) {
  return {
    id: `sub-${index}`,
    userId: "user-1",
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${index}`,
    p256dh,
    auth,
    createdAt: new Date(index),
  };
}

describe("sendPushToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("bounds database reads, network concurrency, and socket timeouts", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.findMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => row(i)));
    mocks.sendNotification.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {};
    });

    await sendPushToUser("user-1", {
      title: "Your turn",
      body: "Play now",
      url: "/play/ABCDEFGH",
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(maxActive).toBe(PUSH_SEND_CONCURRENCY);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(5);
    expect(mocks.sendNotification.mock.calls[0]?.[2]).toMatchObject({
      timeout: PUSH_SEND_TIMEOUT_MS,
      TTL: 60,
    });
  });

  it("revalidates stored destinations and removes an unsafe row without sending", async () => {
    mocks.findMany.mockResolvedValue([
      { ...row(1), endpoint: "https://attacker.example/collect" },
    ]);

    await sendPushToUser("user-1", {
      title: "Your turn",
      body: "Play now",
      url: "/play/ABCDEFGH",
    });

    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "sub-1", userId: "user-1" },
    });
  });

  it("removes a provider-expired endpoint after a 410 response", async () => {
    mocks.findMany.mockResolvedValue([row(2)]);
    mocks.sendNotification.mockRejectedValue(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );

    await sendPushToUser("user-1", {
      title: "Your turn",
      body: "Play now",
      url: "/play/ABCDEFGH",
    });

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "sub-2", userId: "user-1" },
    });
  });
});
