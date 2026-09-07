import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isComputerLevel } from "@/lib/computer";
import { RateLimitExceededError } from "@/lib/rateLimit";
import { createComputerMatch } from "@/server/computerMatches";
import { readLimitedBody } from "@/server/requestLimits";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let level: unknown;
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 1024)));
    level = data && typeof data === "object" && "level" in data ? data.level : null;
  } catch {
    return NextResponse.json({ error: "Choose a computer opponent." }, { status: 400 });
  }
  if (!isComputerLevel(level)) return NextResponse.json({ error: "Choose a computer opponent." }, { status: 400 });
  try {
    const match = await createComputerMatch(session.user.id, level);
    return NextResponse.json({ code: match.inviteCode }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitExceededError) return NextResponse.json({ error: error.message }, {
      status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) },
    });
    throw error;
  }
}
