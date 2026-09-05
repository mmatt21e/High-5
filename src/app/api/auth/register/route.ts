import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fitsBcryptPasswordLimit } from "../../../../lib/password";
import {
  RATE_LIMITS,
  takeAccountRateLimit,
  takeGlobalRateLimit,
} from "../../../../lib/rateLimit";

const schema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(20),
  email: z.string().trim().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100)
    .refine(
      fitsBcryptPasswordLimit,
      "Password must be 72 UTF-8 bytes or fewer",
    ),
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { displayName, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const globalRateLimit = takeGlobalRateLimit(
    "registration",
    RATE_LIMITS.registrationGlobal,
  );
  if (!globalRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(globalRateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const emailRateLimit = takeAccountRateLimit(
    "registration",
    email,
    RATE_LIMITS.registration,
  );
  if (!emailRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(emailRateLimit.retryAfterSeconds) },
      },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        stats: { create: {} },
      },
    });
  } catch (error) {
    // The pre-check is for a friendly fast path; this handles a concurrent
    // registration that wins the unique-email race.
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
