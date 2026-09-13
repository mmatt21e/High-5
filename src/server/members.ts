import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { fitsBcryptPasswordLimit } from "../lib/password";
import { AdminError, credentialsSchema, digest } from "./admin";

export const MEMBER_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-edge-member" : "edge-member";
export const MEMBER_SESSION_SECONDS = 8 * 60 * 60;
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{48}$/, "Enter a valid invitation or reset code.");
const nameSchema = z.string().trim().min(1).max(80);
const dummyHash = bcrypt.hashSync("unused-member-comparison", 12);

export async function getMember(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.memberSession.findUnique({
    where: { tokenHash: digest(token) },
    include: { member: true },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.member.active ||
    session.version !== session.member.version
  )
    return null;
  return {
    id: session.member.id,
    email: session.member.email,
    displayName: session.member.displayName,
  };
}

export async function requireMember(token?: string) {
  const member = await getMember(token);
  if (!member)
    throw new AdminError(
      "Sign in with an active member account to continue.",
      401,
    );
  return member;
}

export async function loginMember(input: unknown) {
  const data = z
    .object({
      email: emailSchema,
      password: z.string().min(1).max(100).refine(fitsBcryptPasswordLimit),
    })
    .parse(input);
  const member = await prisma.memberAccount.findUnique({
    where: { email: data.email },
  });
  const valid = await bcrypt.compare(
    data.password,
    member?.passwordHash ?? dummyHash,
  );
  if (!member || !valid || !member.active)
    throw new AdminError(
      "Email or password is incorrect, or access is inactive.",
      401,
    );
  const token = randomBytes(32).toString("hex");
  await prisma.memberSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.memberSession.create({
    data: {
      tokenHash: digest(token),
      memberId: member.id,
      version: member.version,
      expiresAt: new Date(Date.now() + MEMBER_SESSION_SECONDS * 1000),
    },
  });
  return token;
}

// Conditional consumption and account creation are atomic: failed signup never burns a code.
export async function redeemMemberCode(
  input: unknown,
  purpose: "join" | "reset",
) {
  const data = z
    .object({
      code: codeSchema,
      email: emailSchema,
      password: credentialsSchema.shape.password,
      displayName: purpose === "join" ? nameSchema : nameSchema.optional(),
    })
    .parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const invite = await tx.memberInvite.findUnique({
        where: { codeHash: digest(data.code) },
      });
      if (
        !invite ||
        invite.purpose !== purpose ||
        invite.claimedAt ||
        invite.revokedAt ||
        invite.expiresAt <= now ||
        (invite.email && invite.email !== data.email)
      )
        throw new AdminError(
          "This code is invalid, expired, already used, or belongs to a different email.",
        );
      const used = await tx.memberInvite.updateMany({
        where: {
          id: invite.id,
          claimedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { claimedAt: now },
      });
      if (used.count !== 1)
        throw new AdminError("This code is no longer available.");
      if (purpose === "join") {
        const member = await tx.memberAccount.create({
          data: {
            email: data.email,
            displayName: data.displayName!,
            passwordHash,
          },
        });
        await tx.memberInvite.update({
          where: { id: invite.id },
          data: { memberId: member.id },
        });
      } else {
        const changed = await tx.memberAccount.updateMany({
          where: { id: invite.memberId ?? "", email: data.email, active: true },
          data: { passwordHash, version: { increment: 1 } },
        });
        if (!changed.count)
          throw new AdminError(
            "This reset code is unavailable. Contact the site owner.",
          );
        await tx.memberSession.deleteMany({
          where: { memberId: invite.memberId! },
        });
        await tx.memberInvite.updateMany({
          where: {
            memberId: invite.memberId!,
            purpose: "reset",
            claimedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AdminError(
        "Unable to create this account. Try signing in or contact the site owner.",
        409,
      );
    throw error;
  }
}

export async function changeMemberPassword(
  token: string | undefined,
  input: unknown,
) {
  const member = await requireMember(token);
  const data = z
    .object({
      currentPassword: z.string().max(100),
      password: credentialsSchema.shape.password,
    })
    .parse(input);
  const saved = await prisma.memberAccount.findUniqueOrThrow({
    where: { id: member.id },
  });
  if (!(await bcrypt.compare(data.currentPassword, saved.passwordHash)))
    throw new AdminError("Current password is incorrect.", 403);
  const passwordHash = await bcrypt.hash(data.password, 12);
  await prisma.$transaction(async (tx) => {
    const session = await tx.memberSession.findUnique({
      where: { tokenHash: digest(token!) },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.version !== saved.version
    )
      throw new AdminError("Sign in again.", 401);
    const changed = await tx.memberAccount.updateMany({
      where: { id: saved.id, version: saved.version, active: true },
      data: { passwordHash, version: { increment: 1 } },
    });
    if (!changed.count)
      throw new AdminError("Account changed. Sign in again.", 409);
    await tx.memberSession.deleteMany({ where: { memberId: saved.id } });
    await tx.memberInvite.updateMany({
      where: {
        memberId: saved.id,
        purpose: "reset",
        claimedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  });
}

// Revalidate the owner session within the same write transaction as every management action.
export async function manageMembers(token: string | undefined, input: unknown) {
  const data = z
    .object({
      action: z.enum([
        "invite",
        "revokeInvite",
        "updateMember",
        "revokeSessions",
        "resetMember",
      ]),
      id: z.string().min(1).max(80).optional(),
      label: z.string().trim().min(1).max(80).optional(),
      email: z.union([emailSchema, z.literal("")]).optional(),
      days: z.coerce.number().int().min(1).max(30).default(7),
      active: z.boolean().optional(),
      displayName: nameSchema.optional(),
    })
    .parse(input);
  return prisma.$transaction(async (tx) => {
    const session =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await tx.adminSession.findUnique({
            where: { tokenHash: digest(token) },
            include: { admin: true },
          })
        : null;
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.version !== session.admin.version
    )
      throw new AdminError("Sign in as the site owner.", 401);
    if (session.admin.needsSetup)
      throw new AdminError("Complete owner setup first.", 403);
    const now = new Date();
    if (data.action === "invite" || data.action === "resetMember") {
      const member =
        data.action === "resetMember"
          ? await tx.memberAccount.findUnique({ where: { id: data.id ?? "" } })
          : null;
      if (data.action === "resetMember" && !member?.active)
        throw new AdminError("Select an active member first.");
      if (member)
        await tx.memberInvite.updateMany({
          where: {
            memberId: member.id,
            purpose: "reset",
            claimedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      const code = randomBytes(24).toString("hex");
      const expiresAt = new Date(
        Date.now() + (member ? 60 * 60_000 : data.days * 86400_000),
      );
      await tx.memberInvite.create({
        data: {
          codeHash: digest(code),
          label: member
            ? `Reset for ${member.displayName}`
            : data.label || "Member invitation",
          email: member?.email || data.email || null,
          memberId: member?.id,
          purpose: member ? "reset" : "join",
          expiresAt,
        },
      });
      return {
        code,
        expiresAt: expiresAt.toISOString(),
        path: member ? "/members/reset" : "/members/join",
        message: member
          ? "Reset code created. Share it privately; it expires in one hour."
          : "Invitation created. Copy the code now and share it privately. It can be used once.",
        refresh: true,
      };
    }
    if (!data.id) throw new AdminError("Choose a member or invitation.");
    if (data.action === "revokeInvite") {
      const changed = await tx.memberInvite.updateMany({
        where: { id: data.id, claimedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (!changed.count)
        throw new AdminError("This invitation is already used or revoked.");
    } else {
      const changed = await tx.memberAccount.updateMany({
        where: { id: data.id },
        data: {
          ...(data.action === "updateMember"
            ? { displayName: data.displayName, active: data.active }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new AdminError("Member not found.", 404);
      await tx.memberSession.deleteMany({ where: { memberId: data.id } });
      await tx.memberInvite.updateMany({
        where: {
          memberId: data.id,
          purpose: "reset",
          claimedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }
    return { message: "Saved.", refresh: true };
  });
}
