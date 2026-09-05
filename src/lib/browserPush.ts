export type ExistingSubscriptionSync = "enabled" | "removed" | "rejected";

export const PUSH_CLEANUP_TIMEOUT_MS = 1_500;

export interface DisablePushSubscriptionResult {
  serverRemoved: boolean;
  browserRemoved: boolean;
}

/**
 * Re-register a browser subscription for the current session before trusting
 * local PushManager state. Only the stable endpoint-owned conflict proves that
 * this browser capability belongs to another account. Other 409 responses,
 * including the per-account device cap, must preserve local state.
 */
export async function synchronizeExistingPushSubscription(
  subscription: PushSubscription,
  request: typeof fetch = fetch,
): Promise<ExistingSubscriptionSync> {
  const response = await request("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  if (response.ok) return "enabled";
  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => null);
    const reason =
      typeof body === "object" && body !== null && "reason" in body
        ? body.reason
        : null;
    if (reason === "endpoint-owned") {
      await subscription.unsubscribe().catch(() => false);
      return "removed";
    }
  }
  return "rejected";
}

/** Always remove the local capability, even when server cleanup fails. */
export async function disablePushSubscription(
  subscription: PushSubscription,
  request: typeof fetch = fetch,
  timeoutMs = PUSH_CLEANUP_TIMEOUT_MS,
): Promise<DisablePushSubscriptionResult> {
  let serverRemoved = false;
  let browserRemoved = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: controller.signal,
    });
    serverRemoved = response.ok;
  } catch {
    // The browser-side unsubscribe below is the privacy-critical fallback.
  } finally {
    clearTimeout(timeout);
    browserRemoved = await subscription.unsubscribe().catch(() => false);
  }
  return { serverRemoved, browserRemoved };
}
