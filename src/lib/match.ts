import { prisma } from "./prisma";

// Unambiguous alphabet (no 0/O/1/I) for human-friendly invite codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
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
  const inviteCode = await generateInviteCode();
  return prisma.match.create({
    data: { inviteCode, hostId, targetWins, status: "lobby" },
  });
}

export type JoinResult =
  | { ok: true; matchId: string; inviteCode: string }
  | { ok: false; error: string };

export async function joinMatch(code: string, userId: string): Promise<JoinResult> {
  const match = await prisma.match.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });
  if (!match) return { ok: false, error: "No game found with that code" };

  // Participants may reopen an existing or completed match. This is also what
  // makes a shared invite URL safe to revisit after authentication.
  if (match.hostId === userId || match.guestId === userId) {
    return { ok: true, matchId: match.id, inviteCode: match.inviteCode };
  }
  if (match.status === "complete" || match.status === "abandoned") {
    return { ok: false, error: "That game has already finished" };
  }
  if (match.guestId && match.guestId !== userId) {
    return { ok: false, error: "That game is already full" };
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
  if (!current) return { ok: false, error: "No game found with that code" };
  if (current.hostId === userId || current.guestId === userId) {
    return { ok: true, matchId: current.id, inviteCode: current.inviteCode };
  }
  if (current.status === "complete" || current.status === "abandoned") {
    return { ok: false, error: "That game has already finished" };
  }
  return { ok: false, error: "That game is already full" };
}
