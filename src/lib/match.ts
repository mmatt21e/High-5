import { prisma } from "@/lib/prisma";

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
  if (match.status === "complete" || match.status === "abandoned") {
    return { ok: false, error: "That game has already finished" };
  }
  // Already a participant — allow rejoin.
  if (match.hostId === userId || match.guestId === userId) {
    return { ok: true, matchId: match.id, inviteCode: match.inviteCode };
  }
  if (match.hostId === userId) {
    return { ok: false, error: "You can't join your own game" };
  }
  if (match.guestId && match.guestId !== userId) {
    return { ok: false, error: "That game is already full" };
  }
  const updated = await prisma.match.update({
    where: { id: match.id },
    data: { guestId: userId, status: "active" },
  });
  return { ok: true, matchId: updated.id, inviteCode: updated.inviteCode };
}
