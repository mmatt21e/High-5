import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InvitationError, respondToInvitation, sendInvitation } from "@/server/invitations";
import { playerSelect, publicPlayer } from "@/server/playerIdentity";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";

const sendSchema = z.object({ recipientId: z.string().min(1).max(100) }).strict();
const responseSchema = z.object({ invitationId: z.string().min(1).max(100), action: z.enum(["accept", "decline", "cancel"]) }).strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const uid = session.user.id;
  const limited = limitRequest("invitations:list", uid, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const invitations = await prisma.gameInvitation.findMany({
    where: { OR: [{ senderId: uid }, { recipientId: uid }],
      // Keep pending invitations visible and resolved ones briefly so a waiting
      // sender sees the accepted match or declined state without reloading.
      AND: [{ OR: [{ status: "pending" }, { updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }] }],
    },
    select: { id: true, senderId: true, status: true, createdAt: true,
      sender: { select: playerSelect }, recipient: { select: playerSelect },
      match: { select: { inviteCode: true, status: true } } },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }], take: 100,
  });
  return NextResponse.json({ invitations: invitations.map((invitation) => ({
    id: invitation.id, incoming: invitation.senderId !== uid, status: invitation.status,
    player: publicPlayer(invitation.senderId === uid ? invitation.recipient : invitation.sender),
    code: invitation.match?.status === "active" ? invitation.match.inviteCode : null,
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

async function mutate(request: Request, kind: "send" | "respond") {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = limitRequest(`invitations:${kind}`, session.user.id, { limit: kind === "send" ? 20 : 40, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 2048)));
    if (kind === "send") {
      const parsed = sendSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Choose a valid player." }, { status: 400 });
      const invitation = await sendInvitation(session.user.id, parsed.data.recipientId);
      return NextResponse.json({ id: invitation.id }, { status: 201 });
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid invitation action." }, { status: 400 });
    return NextResponse.json(await respondToInvitation(session.user.id, parsed.data.invitationId, parsed.data.action));
  } catch (error) {
    if (error instanceof InvitationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "BODY_TOO_LARGE")) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    // SQLite can reject a competing transaction while another acceptance wins.
    // A subsequent retry returns that same match instead of creating a new one.
    if (typeof error === "object" && error && "code" in error && ["P2002", "P2034", "P1008"].includes(String(error.code))) {
      return NextResponse.json({ error: "The invitation changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }
}

export function POST(request: Request) { return mutate(request, "send"); }
export function PATCH(request: Request) { return mutate(request, "respond"); }
