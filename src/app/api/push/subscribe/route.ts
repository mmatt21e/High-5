import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pushSubscriptionSchema } from "@/lib/pushSubscription";
import { RATE_LIMITS, takeAccountRateLimit } from "@/lib/rateLimit";
import { storePushSubscription } from "@/server/pushSubscriptionStore";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const rateLimit = takeAccountRateLimit(
    "push:subscribe",
    session.user.id,
    RATE_LIMITS.pushSubscribe,
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

  const stored = await storePushSubscription(prisma, session.user.id, parsed.data);
  if (!stored.ok) {
    const error =
      stored.reason === "endpoint-owned"
        ? "That push subscription belongs to another account"
        : "This account already has the maximum number of devices";
    return NextResponse.json(
      { error, reason: stored.reason },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
