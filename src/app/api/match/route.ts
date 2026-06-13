import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createMatch } from "@/lib/match";

// Create a new match; the caller becomes the host.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const match = await createMatch(session.user.id);
  return NextResponse.json({ code: match.inviteCode }, { status: 201 });
}
