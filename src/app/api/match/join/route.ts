import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { joinMatch } from "@/lib/match";

const schema = z.object({ code: z.string().trim().min(3).max(8) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid code" }, { status: 400 });
  }
  const result = await joinMatch(parsed.data.code, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ code: result.inviteCode }, { status: 200 });
}
