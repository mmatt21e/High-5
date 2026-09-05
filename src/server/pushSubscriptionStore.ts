import type { ValidPushSubscription } from "../lib/pushSubscription";
import { MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "../lib/pushSubscription";
import { KeyedSerialQueue } from "./keyedCoordination";

interface StoredPushSubscription {
  userId: string;
}

export interface PushSubscriptionClient {
  pushSubscription: {
    findUnique(args: {
      where: { endpoint: string };
    }): Promise<StoredPushSubscription | null>;
    count(args: { where: { userId: string } }): Promise<number>;
    create(args: {
      data: {
        userId: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      };
    }): Promise<unknown>;
    updateMany(args: {
      where: { endpoint: string; userId: string };
      data: { p256dh: string; auth: string };
    }): Promise<{ count: number }>;
  };
}

export type StorePushSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: "endpoint-owned" | "subscription-limit" };

const globalForPushMutations = globalThis as typeof globalThis & {
  high5PushSubscriptionMutations?: KeyedSerialQueue<string>;
};

const pushMutations =
  globalForPushMutations.high5PushSubscriptionMutations ??
  new KeyedSerialQueue<string>();
globalForPushMutations.high5PushSubscriptionMutations = pushMutations;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function updateOwnedEndpoint(
  client: PushSubscriptionClient,
  userId: string,
  subscription: ValidPushSubscription,
): Promise<boolean> {
  const result = await client.pushSubscription.updateMany({
    where: { endpoint: subscription.endpoint, userId },
    data: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
  return result.count === 1;
}

/** Store a subscription without ever transferring its endpoint to another user. */
export async function storePushSubscription(
  client: PushSubscriptionClient,
  userId: string,
  subscription: ValidPushSubscription,
): Promise<StorePushSubscriptionResult> {
  return pushMutations.run(userId, async () => {
    const existing = await client.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });
    if (existing) {
      if (existing.userId !== userId) {
        return { ok: false, reason: "endpoint-owned" };
      }
      if (await updateOwnedEndpoint(client, userId, subscription)) {
        return { ok: true };
      }
    }

    const count = await client.pushSubscription.count({ where: { userId } });
    if (count >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
      return { ok: false, reason: "subscription-limit" };
    }

    try {
      await client.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });
      return { ok: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      // Another request may have inserted this endpoint after our first read.
      const winner = await client.pushSubscription.findUnique({
        where: { endpoint: subscription.endpoint },
      });
      if (!winner) throw error;
      if (winner.userId !== userId) {
        return { ok: false, reason: "endpoint-owned" };
      }
      if (!(await updateOwnedEndpoint(client, userId, subscription))) {
        throw error;
      }
      return { ok: true };
    }
  });
}
