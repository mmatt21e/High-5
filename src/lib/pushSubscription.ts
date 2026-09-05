import { isIP } from "node:net";
import { z } from "zod";

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 5;
export const MAX_PUSH_ENDPOINT_LENGTH = 2_048;

const EXACT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

function isAllowedPushHost(hostname: string): boolean {
  return (
    EXACT_PUSH_HOSTS.has(hostname) ||
    hostname.endsWith(".notify.windows.com")
  );
}

function isValidPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const unbracketedHost = hostname.replace(/^\[|\]$/g, "");
    const hasCapabilityLocation =
      url.pathname !== "/" ||
      (hostname.endsWith(".notify.windows.com") &&
        url.searchParams.has("token"));
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      hasCapabilityLocation &&
      isIP(unbracketedHost) === 0 &&
      isAllowedPushHost(hostname)
    );
  } catch {
    return false;
  }
}

function isCanonicalBase64Url(value: string, byteLength: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return (
      decoded.byteLength === byteLength &&
      decoded.toString("base64url") === value
    );
  } catch {
    return false;
  }
}

export const pushEndpointSchema = z
  .string()
  .min(1)
  .max(MAX_PUSH_ENDPOINT_LENGTH)
  .refine(isValidPushEndpoint, "Invalid push endpoint");

const p256dhSchema = z
  .string()
  .min(80)
  .max(128)
  .refine((value) => {
    if (!isCanonicalBase64Url(value, 65)) return false;
    return Buffer.from(value, "base64url")[0] === 0x04;
  }, "Invalid p256dh key");

const authSecretSchema = z
  .string()
  .min(20)
  .max(32)
  .refine(
    (value) => isCanonicalBase64Url(value, 16),
    "Invalid auth secret",
  );

export const pushSubscriptionSchema = z
  .object({
    endpoint: pushEndpointSchema,
    keys: z
      .object({ p256dh: p256dhSchema, auth: authSecretSchema })
      .strict(),
  })
  .strict();

export type ValidPushSubscription = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z
  .object({ endpoint: pushEndpointSchema })
  .strict();
