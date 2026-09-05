import { createHash } from "node:crypto";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
  windowMs: number;
}

/**
 * Small, process-local rolling-window limiter for account-scoped actions.
 * Calls are synchronous, so checks and increments cannot interleave in one
 * Node process. A shared datastore is still required before multi-replica use.
 */
export class RollingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxBuckets = 10_000,
  ) {}

  take(key: string, policy: RateLimitPolicy): RateLimitResult {
    if (
      !key ||
      !Number.isSafeInteger(policy.limit) ||
      policy.limit < 1 ||
      !Number.isSafeInteger(policy.windowMs) ||
      policy.windowMs < 1
    ) {
      throw new Error("Invalid rate-limit configuration");
    }

    const now = this.now();
    const cutoff = now - policy.windowMs;
    const timestamps = (this.buckets.get(key)?.timestamps ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );

    this.operations += 1;
    if (this.operations % 128 === 0) this.prune(now);

    if (timestamps.length >= policy.limit) {
      this.setBucket(key, { timestamps, windowMs: policy.windowMs });
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((timestamps[0] + policy.windowMs - now) / 1_000),
        ),
      };
    }

    timestamps.push(now);
    this.setBucket(key, { timestamps, windowMs: policy.windowMs });
    return {
      allowed: true,
      remaining: policy.limit - timestamps.length,
      retryAfterSeconds: 0,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private setBucket(key: string, bucket: Bucket): void {
    // Refresh insertion order so eviction targets the least recently used key.
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    while (this.buckets.size > this.maxBuckets) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const cutoff = now - bucket.windowMs;
      if (!bucket.timestamps.some((timestamp) => timestamp > cutoff)) {
        this.buckets.delete(key);
      }
    }
  }
}

export const RATE_LIMITS = {
  credentials: { limit: 12, windowMs: 15 * 60_000 },
  registration: { limit: 5, windowMs: 60 * 60_000 },
  // This process-wide backstop bounds bcrypt and account-creation work even
  // when an attacker rotates email addresses. Internet-facing deployments
  // still need a shared edge/IP limiter because this state is per process.
  registrationGlobal: { limit: 30, windowMs: 60_000 },
  matchCreate: { limit: 10, windowMs: 60_000 },
  matchJoin: { limit: 30, windowMs: 60_000 },
  pushSubscribe: { limit: 12, windowMs: 60_000 },
  pushUnsubscribe: { limit: 20, windowMs: 60_000 },
  realtimeActions: { limit: 30, windowMs: 10_000 },
} as const satisfies Record<string, RateLimitPolicy>;

const globalForRateLimit = globalThis as typeof globalThis & {
  high5RateLimiter?: RollingWindowRateLimiter;
};

const sharedRateLimiter =
  globalForRateLimit.high5RateLimiter ?? new RollingWindowRateLimiter();
globalForRateLimit.high5RateLimiter = sharedRateLimiter;

function accountKey(scope: string, accountId: string): string {
  const identityHash = createHash("sha256").update(accountId).digest("base64url");
  return `${scope}:${identityHash}`;
}

export function takeAccountRateLimit(
  scope: string,
  accountId: string,
  policy: RateLimitPolicy,
): RateLimitResult {
  return sharedRateLimiter.take(accountKey(scope, accountId), policy);
}

export function resetAccountRateLimit(scope: string, accountId: string): void {
  sharedRateLimiter.reset(accountKey(scope, accountId));
}

function globalKey(scope: string): string {
  return `global:${scope}`;
}

/**
 * Apply a process-wide backstop for expensive unauthenticated work. This is a
 * safety ceiling, not a replacement for a shared edge or source-address limit.
 */
export function takeGlobalRateLimit(
  scope: string,
  policy: RateLimitPolicy,
): RateLimitResult {
  return sharedRateLimiter.take(globalKey(scope), policy);
}

export function resetGlobalRateLimit(scope: string): void {
  sharedRateLimiter.reset(globalKey(scope));
}

export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}
