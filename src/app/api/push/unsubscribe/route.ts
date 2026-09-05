import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pushUnsubscribeSchema } from "@/lib/pushSubscription";
import { RATE_LIMITS, takeAccountRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rateLimit = takeAccountRateLimit(
    "push:unsubscribe",
    session.user.id,
    RATE_LIMITS.pushUnsubscribe,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many subscription requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
