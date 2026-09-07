import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { playerSelect, publicPlayer } from "@/server/playerIdentity";
import { limitRequest } from "@/server/requestLimits";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = limitRequest("players:search", session.user.id, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 40) {
    return NextResponse.json({ error: "Enter 2–40 characters of a player's name." }, { status: 400 });
  }
  const players = await prisma.user.findMany({
    where: { id: { not: session.user.id }, computerLevel: null, displayName: { contains: query } },
    select: playerSelect,
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 20,
  });
  return NextResponse.json({ players: players.map(publicPlayer) }, { headers: { "Cache-Control": "private, no-store" } });
}
