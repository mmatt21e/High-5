import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { INVITE_CODE_LENGTH } from "./inviteCode";
import {
  RATE_LIMITS,
  RateLimitExceededError,
  takeAccountRateLimit,
} from "./rateLimit";

// Unambiguous alphabet (no 0/O/1/I) for human-friendly invite codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function generateInviteCode(): Promise<string> {
  // Retry on the (astronomically rare) collision.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const exists = await prisma.match.findUnique({ where: { inviteCode: code } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate an invite code");
}

export async function createMatch(hostId: string, targetWins = 5) {
  const rateLimit = takeAccountRateLimit(
    "match:create",
    hostId,
    RATE_LIMITS.matchCreate,
  );
  if (!rateLimit.allowed) {
    throw new RateLimitExceededError(
      "Too many games created. Try again shortly.",
      rateLimit.retryAfterSeconds,
    );
  }

  // The lookup gives a friendly fast path; the create retry closes the race
  // if another process happens to claim the same random code first.
  for (let attempt = 0; attempt < 10; attempt++) {
    const inviteCode = await generateInviteCode();
    try {
      return await prisma.match.create({
        data: { inviteCode, hostId, targetWins, status: "lobby" },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }
  throw new Error("Could not allocate an invite code");
}

export type JoinResult =
  | { ok: true; matchId: string; inviteCode: string }
  | {
      ok: false;
      error: string;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };

const UNAVAILABLE_MATCH_ERROR = "That game is unavailable";

export async function joinMatch(code: string, userId: string): Promise<JoinResult> {
  const rateLimit = takeAccountRateLimit(
    "match:join",
    userId,
    RATE_LIMITS.matchJoin,
  );
  if (!rateLimit.allowed) {
    return {
      ok: false,
      error: "Too many join attempts. Try again shortly.",
      rateLimited: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const match = await prisma.match.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });
  if (!match) return { ok: false, error: UNAVAILABLE_MATCH_ERROR };

  // Participants may reopen an existing or completed match. This is also what
  // makes a shared invite URL safe to revisit after authentication.
  if (match.hostId === userId || match.guestId === userId) {
    return { ok: true, matchId: match.id, inviteCode: match.inviteCode };
  }
  if (match.status === "complete" || match.status === "abandoned") {
    return { ok: false, error: UNAVAILABLE_MATCH_ERROR };
  }
  if (match.guestId && match.guestId !== userId) {
    return { ok: false, error: UNAVAILABLE_MATCH_ERROR };
  }

  // Claim the empty seat conditionally. A plain update after the initial read
  // lets two simultaneous guests overwrite each other (last writer wins).
  const claim = await prisma.match.updateMany({
    where: {
      id: match.id,
      guestId: null,
      status: "lobby",
    },
    data: { guestId: userId, status: "active" },
  });
  if (claim.count === 1) {
    return { ok: true, matchId: match.id, inviteCode: match.inviteCode };
  }

  // Resolve the race deterministically. The same user may have won the claim
  // in another request; a different winner means the table is full.
  const current = await prisma.match.findUnique({ where: { id: match.id } });
  if (!current) return { ok: false, error: UNAVAILABLE_MATCH_ERROR };
  if (current.hostId === userId || current.guestId === userId) {
    return { ok: true, matchId: current.id, inviteCode: current.inviteCode };
  }
  if (current.status === "complete" || current.status === "abandoned") {
    return { ok: false, error: UNAVAILABLE_MATCH_ERROR };
  }
  return { ok: false, error: UNAVAILABLE_MATCH_ERROR };
}
