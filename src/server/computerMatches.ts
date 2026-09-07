import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { generateInviteCode } from "../lib/match";
import { COMPUTER_OPPONENTS, computerPlayerId, isComputerLevel, type ComputerLevel } from "../lib/computer";
import { RATE_LIMITS, RateLimitExceededError, takeAccountRateLimit } from "../lib/rateLimit";

export async function createComputerMatch(hostId: string, level: ComputerLevel) {
  if (!isComputerLevel(level)) throw new Error("Unknown computer opponent");
  const rate = takeAccountRateLimit("match:create", hostId, RATE_LIMITS.matchCreate);
  if (!rate.allowed) throw new RateLimitExceededError("Too many games created. Try again shortly.", rate.retryAfterSeconds);
  const host = await prisma.user.findUnique({ where: { id: hostId }, select: { computerLevel: true } });
  if (!host || host.computerLevel) throw new Error("A human player must start the match");
  const opponent = COMPUTER_OPPONENTS[level];
  const inviteCode = await generateInviteCode();
  // Provision an unloginable account and reserve both seats atomically. One
  // identity per level keeps head-to-head records stable across new matches.
  return prisma.$transaction(async (tx) => {
    const computer = await tx.user.upsert({
      where: { computerLevel: level },
      create: { id: computerPlayerId(level), computerLevel: level,
        email: `${randomUUID()}@computer.invalid`, displayName: opponent.name, image: opponent.avatar },
      update: { displayName: opponent.name },
    });
    return tx.match.create({ data: { inviteCode, hostId, guestId: computer.id, status: "active" } });
  });
}
