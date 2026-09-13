import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AdminError, digest } from "@/server/admin";
import {
  changeMemberPassword,
  loginMember,
  MEMBER_COOKIE,
  MEMBER_SESSION_SECONDS,
  redeemMemberCode,
  requireMember,
} from "@/server/members";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  try {
    return json({
      member: await requireMember((await cookies()).get(MEMBER_COOKIE)?.value),
    });
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.message }, e.status);
    return json({ error: "Unable to check membership." }, 500);
  }
}
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
      new URL(process.env.AUTH_URL || request.url).origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return json({ error: "Invalid request origin or content type." }, 403);
  try {
    const body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(request, 8192)),
    );
    const action = z
      .enum(["login", "join", "reset", "logout", "password"])
      .parse(body.action);
    const limited = limitRequest(`members:${action}:global`, "all", {
      limit: 120,
      windowMs: 15 * 60_000,
    });
    if (limited) return limited;
    if (["login", "join", "reset"].includes(action)) {
      const key = digest(
        z.string().max(254).parse(body.email).trim().toLowerCase(),
      );
      const accountLimit = limitRequest(`members:${action}`, key, {
        limit: 12,
        windowMs: 15 * 60_000,
      });
      if (accountLimit) return accountLimit;
    }
    const jar = await cookies();
    const token = jar.get(MEMBER_COOKIE)?.value;
    if (action === "logout") {
      if (token)
        await prisma.memberSession.deleteMany({
          where: { tokenHash: digest(token) },
        });
      jar.delete(MEMBER_COOKIE);
      return json({ redirect: "/members/login" });
    }
    if (action === "login") {
      const newToken = await loginMember(body);
      if (token)
        await prisma.memberSession.deleteMany({
          where: { tokenHash: digest(token) },
        });
      jar.set(MEMBER_COOKIE, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: MEMBER_SESSION_SECONDS,
      });
      return json({ redirect: "/members" });
    }
    if (action === "password") {
      await changeMemberPassword(token, body);
      jar.delete(MEMBER_COOKIE);
      return json({ redirect: "/members/login?updated=1" });
    }
    await redeemMemberCode(body, action);
    return json({
      redirect:
        action === "join"
          ? "/members/login?created=1"
          : "/members/login?updated=1",
    });
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        { error: e.issues[0]?.message || "Check your entries." },
        400,
      );
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON." }, 400);
    if (e instanceof Error && e.message === "BODY_TOO_LARGE")
      return json({ error: "Request is too large." }, 413);
    console.error(
      "Member request failed; no credentials or request data logged.",
    );
    return json(
      { error: "Unable to complete this request. Please try again." },
      500,
    );
  }
}
