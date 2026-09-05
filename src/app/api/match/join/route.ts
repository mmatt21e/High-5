import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinMatch } from "@/lib/match";
import { matchJoinPayloadSchema } from "@/lib/realtime/validation";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = matchJoinPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid invite code" },
      { status: 400 },
    );
  }
  const result = await joinMatch(parsed.data.code, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.rateLimited ? 429 : 400,
        headers:
          result.rateLimited && result.retryAfterSeconds
            ? { "Retry-After": String(result.retryAfterSeconds) }
            : undefined,
      },
    );
  }
  return NextResponse.json({ code: result.inviteCode }, { status: 200 });
}
