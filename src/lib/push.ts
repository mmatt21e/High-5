import webpush from "web-push";
import { prisma } from "./prisma";
import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  pushSubscriptionSchema,
} from "./pushSubscription";

let configured = false;
export const PUSH_SEND_CONCURRENCY = 3;
export const PUSH_SEND_TIMEOUT_MS = 10_000;

/** Configure web-push with the VAPID keys (once). Returns false if unset. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await work(item);
      }
    },
  );
  await Promise.all(workers);
}

/** Send a Web Push notification to all of a user's subscribed devices. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return; // notifications are optional
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  });
  await runWithConcurrency(subs, PUSH_SEND_CONCURRENCY, async (subscription) => {
    const parsed = pushSubscriptionSchema.safeParse({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    });
    if (!parsed.success) {
      // Old or manually inserted rows must not become arbitrary network
      // destinations just because they already reached the database.
      await prisma.pushSubscription
        .deleteMany({ where: { id: subscription.id, userId } })
        .catch(() => {});
      return;
    }

    try {
      await webpush.sendNotification(parsed.data, JSON.stringify(payload), {
        timeout: PUSH_SEND_TIMEOUT_MS,
        TTL: 60,
      });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the subscription is gone — clean it up.
      if (code === 404 || code === 410) {
        await prisma.pushSubscription
          .deleteMany({ where: { id: subscription.id, userId } })
          .catch(() => {});
      }
    }
  });
}
