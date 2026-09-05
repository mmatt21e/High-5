import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  fitsBcryptPasswordLimit,
} from "../password";
import {
  pushEndpointSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from "../pushSubscription";
import { RollingWindowRateLimiter } from "../rateLimit";

const validP256dh = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x2a),
]).toString("base64url");
const validAuth = Buffer.alloc(16, 0x17).toString("base64url");

describe("bcrypt password boundaries", () => {
  it("measures the UTF-8 representation instead of JavaScript characters", () => {
    expect(fitsBcryptPasswordLimit("a".repeat(BCRYPT_MAX_PASSWORD_BYTES))).toBe(
      true,
    );
    expect(
      fitsBcryptPasswordLimit("a".repeat(BCRYPT_MAX_PASSWORD_BYTES + 1)),
    ).toBe(false);
    expect(fitsBcryptPasswordLimit("🔐".repeat(18))).toBe(true);
    expect(fitsBcryptPasswordLimit("🔐".repeat(19))).toBe(false);
  });
});

describe("push subscription validation", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/device-token",
    "https://updates.push.services.mozilla.com/wpush/v2/device-token",
    "https://web.push.apple.com/Q/device-token",
    "https://db3.notify.windows.com/w/?token=device-token",
    "https://cloud.notify.windows.com/?token=device-token",
  ])("accepts a bounded browser push endpoint: %s", (endpoint) => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint,
        keys: { p256dh: validP256dh, auth: validAuth },
      }).success,
    ).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/token",
    "https://user:secret@fcm.googleapis.com/fcm/send/token",
    "https://fcm.googleapis.com:8443/fcm/send/token",
    "https://127.0.0.1/push/token",
    "https://[::1]/push/token",
    "https://push.attacker.example/push/token",
    "https://notify.windows.com.attacker.example/push/token",
    "https://fcm.googleapis.com/",
    "https://fcm.googleapis.com/fcm/send/token#fragment",
  ])("rejects a dangerous push destination: %s", (endpoint) => {
    expect(pushEndpointSchema.safeParse(endpoint).success).toBe(false);
  });

  it("requires canonical, correctly sized browser encryption keys", () => {
    const base = {
      endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
      keys: { p256dh: validP256dh, auth: validAuth },
    };
    expect(pushSubscriptionSchema.safeParse(base).success).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({
        ...base,
        keys: { ...base.keys, p256dh: Buffer.alloc(65).toString("base64url") },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        ...base,
        keys: { ...base.keys, auth: `${validAuth}=` },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...base, extra: true }).success,
    ).toBe(false);
    expect(
      pushUnsubscribeSchema.safeParse({
        endpoint: base.endpoint,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("rolling account rate limiting", () => {
  it("blocks only after the allowance and reports the rolling retry delay", () => {
    let now = 1_000;
    const limiter = new RollingWindowRateLimiter(() => now);
    const policy = { limit: 2, windowMs: 10_000 };

    expect(limiter.take("player", policy)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    now = 2_000;
    expect(limiter.take("player", policy)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    now = 3_000;
    expect(limiter.take("player", policy)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 8,
    });

    now = 11_001;
    expect(limiter.take("player", policy).allowed).toBe(true);
  });

  it("keeps identities isolated and supports a successful-login reset", () => {
    const limiter = new RollingWindowRateLimiter(() => 500);
    const policy = { limit: 1, windowMs: 10_000 };
    expect(limiter.take("player-a", policy).allowed).toBe(true);
    expect(limiter.take("player-a", policy).allowed).toBe(false);
    expect(limiter.take("player-b", policy).allowed).toBe(true);
    limiter.reset("player-a");
    expect(limiter.take("player-a", policy).allowed).toBe(true);
  });
});

describe("authentication provider boundaries", () => {
  it("does not opt into dangerous OAuth email account linking", () => {
    const source = readFileSync(
      new URL("../../auth.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("allowDangerousEmailAccountLinking");
  });

  it("uses cryptographic randomness for newly issued invite codes", () => {
    const source = readFileSync(new URL("../match.ts", import.meta.url), "utf8");
    expect(source).toContain("randomInt");
    expect(source).not.toContain("Math.random");
  });

  it("checks authenticated realtime actions before dispatch and rejects foreign browser origins", () => {
    const source = readFileSync(
      new URL("../../../server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("runThrottledSocketAction");
    expect(source).toContain("RATE_LIMITS.realtimeActions");
    expect(source).toContain("allowRequest");
    expect(source).toContain("parsedOrigin.origin === new URL(authUrl).origin");
    expect(source).toContain("if (!origin) return true");
    expect(source).toContain('dev ? "127.0.0.1" : "0.0.0.0"');
    expect(source).toContain("httpServer.listen(port, hostname");
    expect(source).toContain("randomBytes(32)");

    const socketAuthSource = readFileSync(
      new URL("../../server/socketAuth.ts", import.meta.url),
      "utf8",
    );
    expect(socketAuthSource).toContain(
      '(process.env.AUTH_URL ?? "").startsWith("https://")',
    );
    expect(socketAuthSource).not.toContain(
      'process.env.NODE_ENV === "production"',
    );
  });
});
