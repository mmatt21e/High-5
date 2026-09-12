import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { limitRequest, readLimitedBody } from "@/server/requestLimits";
import {
  ADMIN_COOKIE,
  AdminError,
  changeCredentials,
  consumeEmailToken,
  createEmailToken,
  digest,
  gameSchema,
  loginAdmin,
  requireAdmin,
} from "@/server/admin";
import { mailConfigured, sendAdminEmail } from "@/server/adminMail";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  // No forwarded-header trust: validate the browser's origin against the configured site.
  const expected = new URL(process.env.AUTH_URL || request.url).origin;
  if (
    request.headers.get("origin") !== expected ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return json({ error: "Invalid request origin or content type." }, 403);
  try {
    const body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(request, 8192)),
    );
    const action = z
      .enum([
        "login",
        "logout",
        "credentials",
        "saveHome",
        "saveGame",
        "deleteGame",
        "sendVerification",
        "verify",
        "forgot",
        "reset",
      ])
      .parse(body.action);
    const limited = limitRequest(`admin:${action}`, "owner", {
      limit:
        action === "forgot" || action === "sendVerification"
          ? 3
          : action === "login"
            ? 12
            : 30,
      windowMs: 15 * 60_000,
    });
    if (limited) return limited;
    const jar = await cookies();
    const token = jar.get(ADMIN_COOKIE)?.value;
    if (action === "login") {
      const input = z
        .object({
          username: z.string().trim().toLowerCase().max(40),
          password: z.string().max(100),
          setupKey: z.string().max(256).default(""),
        })
        .parse(body);
      const session = await loginAdmin(
        input.username,
        input.password,
        input.setupKey,
      );
      jar.set(ADMIN_COOKIE, session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: session.maxAge,
      });
      return json({ redirect: session.needsSetup ? "/admin/setup" : "/admin" });
    }
    if (action === "logout") {
      if (token)
        await prisma.adminSession.deleteMany({
          where: { tokenHash: digest(token) },
        });
      jar.delete(ADMIN_COOKIE);
      return json({ redirect: "/admin/login" });
    }
    if (action === "forgot") {
      const email = z
        .string()
        .trim()
        .toLowerCase()
        .email()
        .max(254)
        .parse(body.email);
      const admin = await prisma.siteAdmin.findUnique({
        where: { id: "owner" },
      });
      if (
        admin &&
        !admin.needsSetup &&
        admin.emailVerified &&
        admin.recoveryEmail === email &&
        mailConfigured()
      ) {
        const resetToken = await createEmailToken(admin, "reset");
        try {
          await sendAdminEmail(email, admin.username, resetToken, "reset");
        } catch {
          await prisma.adminToken.deleteMany({
            where: { tokenHash: digest(resetToken) },
          });
          console.error(
            "Admin recovery email delivery failed. Check SMTP configuration.",
          );
        }
      }
      return json({
        message:
          "If this is your verified recovery email and delivery is available, a reset link will arrive shortly.",
      });
    }
    if (action === "reset" || action === "verify") {
      await consumeEmailToken(
        z.string().max(64).parse(body.token),
        action,
        body.password,
      );
      return json({
        redirect:
          action === "reset" ? "/admin/login?reset=1" : "/admin?verified=1",
      });
    }
    if (action === "credentials") {
      await changeCredentials(
        token,
        body,
        z.string().max(100).parse(body.currentPassword),
      );
      jar.delete(ADMIN_COOKIE);
      return json({ redirect: "/admin/login?updated=1" });
    }
    const admin = await requireAdmin(token);
    if (action === "sendVerification") {
      if (!mailConfigured())
        throw new AdminError(
          "Email delivery is not configured on the server.",
          503,
        );
      const verification = await createEmailToken(admin, "verify");
      try {
        await sendAdminEmail(
          admin.recoveryEmail!,
          admin.username,
          verification,
          "verify",
        );
      } catch (error) {
        await prisma.adminToken.deleteMany({
          where: { tokenHash: digest(verification) },
        });
        throw error;
      }
      return json({
        message:
          "Verification email sent. Open the link to enable password recovery.",
      });
    }
    // Revalidate the session inside the write transaction to reject revoked sessions.
    await prisma.$transaction(async (tx) => {
      const current = await tx.adminSession.findUnique({
        where: { tokenHash: digest(token!) },
        include: { admin: true },
      });
      if (
        !current ||
        current.expiresAt <= new Date() ||
        current.version !== current.admin.version ||
        current.admin.needsSetup
      )
        throw new AdminError("Sign in again.", 401);
      if (action === "saveHome") {
        const data = z
          .object({
            headline: z.string().trim().min(1).max(120),
            intro: z.string().trim().min(1).max(500),
          })
          .parse(body);
        await tx.siteContent.upsert({
          where: { id: "home" },
          update: data,
          create: data,
        });
      } else if (action === "saveGame") {
        const { id, ...data } = gameSchema.parse(body);
        if (id) await tx.catalogGame.update({ where: { id }, data });
        else await tx.catalogGame.create({ data });
      } else if (action === "deleteGame") {
        const id = z.string().min(1).max(80).parse(body.id);
        await tx.catalogGame.delete({ where: { id } });
      }
    });
    return json({ message: "Saved.", refresh: true });
  } catch (error) {
    if (error instanceof AdminError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Check your entries." },
        400,
      );
    if (error instanceof SyntaxError)
      return json({ error: "Invalid JSON." }, 400);
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      return json({ error: "Request is too large." }, 413);
    console.error(
      "Admin request failed; no credentials or request data logged.",
    );
    return json({ error: "Unable to save. Refresh and try again." }, 500);
  }
}
