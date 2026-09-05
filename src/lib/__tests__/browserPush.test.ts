import { describe, expect, it, vi } from "vitest";
import {
  disablePushSubscription,
  synchronizeExistingPushSubscription,
} from "../browserPush";

function subscription(unsubscribe = vi.fn().mockResolvedValue(true)) {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/device",
    unsubscribe,
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/device",
      keys: { p256dh: "key", auth: "auth" },
    }),
  } as unknown as PushSubscription;
}

describe("synchronizeExistingPushSubscription", () => {
  it("only reports enabled after the server accepts the current subscription", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const sub = subscription();

    await expect(
      synchronizeExistingPushSubscription(sub, request),
    ).resolves.toBe("enabled");
    expect(request).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(sub.unsubscribe).not.toHaveBeenCalled();
  });

  it("removes a local endpoint when the signed-in account cannot own it", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json(
        { reason: "endpoint-owned" },
        { status: 409 },
      ),
    );
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const sub = subscription(unsubscribe);

    await expect(
      synchronizeExistingPushSubscription(sub, request),
    ).resolves.toBe("removed");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("preserves local state when the account has reached its device cap", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json(
        { reason: "subscription-limit" },
        { status: 409 },
      ),
    );
    const unsubscribe = vi.fn().mockResolvedValue(true);

    await expect(
      synchronizeExistingPushSubscription(subscription(unsubscribe), request),
    ).resolves.toBe("rejected");
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("does not destroy local state for a legacy or malformed conflict", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    const unsubscribe = vi.fn().mockResolvedValue(true);

    await expect(
      synchronizeExistingPushSubscription(subscription(unsubscribe), request),
    ).resolves.toBe("rejected");
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("does not claim enabled or destroy local state after a transient failure", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const unsubscribe = vi.fn().mockResolvedValue(true);

    await expect(
      synchronizeExistingPushSubscription(subscription(unsubscribe), request),
    ).resolves.toBe("rejected");
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});

describe("disablePushSubscription", () => {
  it("unsubscribes locally even when the API request fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const unsubscribe = vi.fn().mockResolvedValue(true);

    await expect(
      disablePushSubscription(subscription(unsubscribe), request),
    ).resolves.toEqual({ serverRemoved: false, browserRemoved: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("reports both cleanup results when the server accepts the removal", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const unsubscribe = vi.fn().mockResolvedValue(true);

    await expect(
      disablePushSubscription(subscription(unsubscribe), request),
    ).resolves.toEqual({ serverRemoved: true, browserRemoved: true });
  });

  it("aborts stalled server cleanup and still unsubscribes locally", async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ) as unknown as typeof fetch;
      const unsubscribe = vi.fn().mockResolvedValue(true);

      const result = disablePushSubscription(
        subscription(unsubscribe),
        request,
        50,
      );
      await vi.advanceTimersByTimeAsync(50);

      await expect(result).resolves.toEqual({
        serverRemoved: false,
        browserRemoved: true,
      });
      expect(request).toHaveBeenCalledWith(
        "/api/push/unsubscribe",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
