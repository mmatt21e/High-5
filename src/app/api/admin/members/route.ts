import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, AdminError, requireAdmin } from "@/server/admin";
import { manageMembers } from "@/server/members";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
      new URL(process.env.AUTH_URL || request.url).origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return json({ error: "Invalid request origin or content type." }, 403);
  try {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    await requireAdmin(token);
    const limited = limitRequest("admin:members", "owner", {
      limit: 60,
      windowMs: 15 * 60_000,
    });
    if (limited) return limited;
    const body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(request, 8192)),
    );
    return json(await manageMembers(token, body));
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
    console.error("Membership management failed; no request data logged.");
    return json({ error: "Unable to save. Please try again." }, 500);
  }
}
