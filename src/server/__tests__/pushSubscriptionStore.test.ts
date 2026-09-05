import { describe, expect, it } from "vitest";
import type { ValidPushSubscription } from "../../lib/pushSubscription";
import {
  storePushSubscription,
  type PushSubscriptionClient,
} from "../pushSubscriptionStore";

const p256dh = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x31),
]).toString("base64url");
const auth = Buffer.alloc(16, 0x42).toString("base64url");

function subscription(token: string): ValidPushSubscription {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${token}`,
    keys: { p256dh, auth },
  };
}

interface Row {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function createStore(initial: Row[] = []) {
  const rows = [...initial];
  const client: PushSubscriptionClient = {
    pushSubscription: {
      async findUnique({ where }) {
        return rows.find((row) => row.endpoint === where.endpoint) ?? null;
      },
      async count({ where }) {
        return rows.filter((row) => row.userId === where.userId).length;
      },
      async create({ data }) {
        if (rows.some((row) => row.endpoint === data.endpoint)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        rows.push(data);
        return data;
      },
      async updateMany({ where, data }) {
        const row = rows.find(
          (candidate) =>
            candidate.endpoint === where.endpoint &&
            candidate.userId === where.userId,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { client, rows };
}

describe("storePushSubscription", () => {
  it("updates keys for the same owner without reassigning the endpoint", async () => {
    const sub = subscription("owned");
    const store = createStore([
      { userId: "user-a", endpoint: sub.endpoint, p256dh: "old", auth: "old" },
    ]);

    await expect(
      storePushSubscription(store.client, "user-a", sub),
    ).resolves.toEqual({ ok: true });
    expect(store.rows).toEqual([
      { userId: "user-a", endpoint: sub.endpoint, p256dh, auth },
    ]);
  });

  it("never transfers an endpoint that belongs to another account", async () => {
    const sub = subscription("other-owner");
    const original = {
      userId: "user-a",
      endpoint: sub.endpoint,
      p256dh: "original-key",
      auth: "original-auth",
    };
    const store = createStore([original]);

    await expect(
      storePushSubscription(store.client, "user-b", sub),
    ).resolves.toEqual({ ok: false, reason: "endpoint-owned" });
    expect(store.rows).toEqual([original]);
  });

  it("serializes same-user writes so concurrent requests cannot exceed the cap", async () => {
    const store = createStore();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        storePushSubscription(store.client, "user-cap", subscription(`d${index}`)),
      ),
    );

    expect(store.rows).toHaveLength(5);
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(results).toContainEqual({
      ok: false,
      reason: "subscription-limit",
    });
  });

  it("reconciles a unique race without adopting another user's endpoint", async () => {
    const sub = subscription("race");
    let reads = 0;
    const client: PushSubscriptionClient = {
      pushSubscription: {
        async findUnique() {
          reads += 1;
          return reads === 1 ? null : { userId: "winner" };
        },
        async count() {
          return 0;
        },
        async create() {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        },
        async updateMany() {
          return { count: 0 };
        },
      },
    };

    await expect(storePushSubscription(client, "loser", sub)).resolves.toEqual({
      ok: false,
      reason: "endpoint-owned",
    });
  });
});
