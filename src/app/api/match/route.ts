import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createMatch } from "@/lib/match";
import { RateLimitExceededError } from "@/lib/rateLimit";

// Create a new match; the caller becomes the host.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    const match = await createMatch(session.user.id);
    return NextResponse.json({ code: match.inviteCode }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    throw error;
  }
}
