import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { actInLobby, lobbySnapshot, LobbyError } from "@/server/lobby";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";
import { QueueCapacityExceededError } from "@/server/keyedCoordination";

const length = z.union([z.literal(1), z.literal(3), z.literal(5)]);
const schema = z.union([
  z.object({ action: z.enum(["post", "auto"]), targetWins: length, note: z.string().trim().max(160).optional() }).strict(),
  z.object({ action: z.enum(["join", "cancel", "heartbeat"]), id: z.string().min(1).max(100) }).strict(),
]);
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = limitRequest("lobby:list", session.user.id, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const filter = new URL(request.url).searchParams.get("targetWins");
  if (filter !== null && !length.safeParse(Number(filter)).success) return NextResponse.json({ error: "Invalid match length." }, { status: 400 });
  return NextResponse.json(await lobbySnapshot(session.user.id, filter ? Number(filter) : undefined), { headers });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = limitRequest("lobby:action", session.user.id, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const body = schema.safeParse(JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 2048))));
    if (!body.success) return NextResponse.json({ error: "Choose a valid lobby action, match length, and note (up to 160 characters)." }, { status: 400 });
    return NextResponse.json(await actInLobby(session.user.id, body.data), { headers });
  } catch (error) {
    if (error instanceof LobbyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "BODY_TOO_LARGE")) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    if (error instanceof QueueCapacityExceededError || (typeof error === "object" && error && "code" in error && ["P2002", "P2034", "P1008"].includes(String(error.code)))) return NextResponse.json({ error: "The lobby is busy. Please try again." }, { status: 409 });
    throw error;
  }
}
