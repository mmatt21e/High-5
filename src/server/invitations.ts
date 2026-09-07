import { prisma } from "../lib/prisma";
import { generateInviteCode } from "../lib/match";

export class InvitationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function sendInvitation(senderId: string, recipientId: string) {
  if (senderId === recipientId) throw new InvitationError("Choose another player to invite.");
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) throw new InvitationError("That player is unavailable.", 404);
  const pendingKey = JSON.stringify([senderId, recipientId].sort());
  // Both directions share one unique key. Concurrent sends cannot create two
  // invitations for the same pair; resolved invitations retain their history.
  const invitation = await prisma.gameInvitation.upsert({
    where: { pendingKey },
    create: { senderId, recipientId, pendingKey },
    update: {},
  });
  if (invitation.senderId !== senderId) {
    throw new InvitationError("This player already invited you. Accept their invitation below.", 409);
  }
  return invitation;
}

export async function respondToInvitation(userId: string, invitationId: string, action: "accept" | "decline" | "cancel") {
  // Authorization, conditional claim and match creation commit together.
  // A failed create leaves the invitation pending; retries cannot add matches.
  const code = action === "accept" ? await generateInviteCode() : null;
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.gameInvitation.findUnique({
      where: { id: invitationId }, include: { match: { select: { inviteCode: true } } },
    });
    if (!invitation || (action === "cancel" ? invitation.senderId : invitation.recipientId) !== userId) {
      throw new InvitationError("Invitation not found.", 404);
    }
    if (action === "accept" && invitation.status === "accepted" && invitation.match) {
      return { code: invitation.match.inviteCode };
    }
    if (invitation.status !== "pending") throw new InvitationError("This invitation has already been answered.", 409);
    const claimed = await tx.gameInvitation.updateMany({
      where: { id: invitation.id, status: "pending" },
      data: { status: action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled", pendingKey: null },
    });
    if (claimed.count !== 1) throw new InvitationError("This invitation has already been answered.", 409);
    if (action !== "accept") return { ok: true };
    const match = await tx.match.create({
      data: { hostId: invitation.senderId, guestId: invitation.recipientId, inviteCode: code!, status: "active" },
    });
    await tx.gameInvitation.update({ where: { id: invitation.id }, data: { matchId: match.id } });
    return { code: match.inviteCode };
  });
}
