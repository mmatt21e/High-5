import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fitsBcryptPasswordLimit } from "../lib/password";

export const ADMIN_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-edge-admin" : "edge-admin";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9_.-]+$/)
    .refine((v) => v !== "admin", "Choose a username other than admin."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .refine(fitsBcryptPasswordLimit, "Use at most 72 UTF-8 bytes."),
  recoveryEmail: z.string().trim().toLowerCase().email().max(254),
});
export const gameSchema = z
  .object({
    id: z.string().max(80).optional(),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(400),
    category: z.string().trim().min(1).max(40),
    href: z
      .string()
      .max(300)
      .refine(
        (v) =>
          v === "" ||
          /^\/[a-zA-Z0-9/_-]*$/.test(v) ||
          (() => {
            try {
              const u = new URL(v);
              return u.protocol === "https:" && !u.username && !u.password;
            } catch {
              return false;
            }
          })(),
        "Use a local path or an HTTPS URL.",
      ),
    status: z.enum(["draft", "coming-soon", "live"]),
    sortOrder: z.number().int().min(0).max(999),
  })
  .refine(
    (v) => v.status !== "live" || v.href.length > 0,
    "Live games need a play link.",
  );

export async function getAdmin(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: digest(token) },
    include: { admin: true },
  });
  return session &&
    session.expiresAt > new Date() &&
    session.version === session.admin.version
    ? session.admin
    : null;
}

export async function requireAdmin(token?: string, allowSetup = false) {
  const admin = await getAdmin(token);
  if (!admin) throw new AdminError("Sign in to continue.", 401);
  if (admin.needsSetup && !allowSetup)
    throw new AdminError(
      "Change your username and password before continuing.",
      403,
    );
  return admin;
}

export async function loginAdmin(
  username: string,
  password: string,
  setupKey: string,
) {
  let admin = await prisma.siteAdmin.findUnique({ where: { id: "owner" } });
  if (!admin || admin.needsSetup) {
    const key = process.env.ADMIN_SETUP_KEY ?? "";
    if (
      (process.env.NODE_ENV === "production" && key.length < 32) ||
      (key &&
        !timingSafeEqual(
          Buffer.from(digest(key)),
          Buffer.from(digest(setupKey)),
        ))
    ) {
      throw new AdminError(
        "Initial setup requires the private setup key configured by the site owner.",
        403,
      );
    }
    if (username !== "admin" || password !== "admin")
      throw new AdminError("Invalid username or password.", 401);
    if (!admin)
      admin = await prisma.siteAdmin.upsert({
        where: { id: "owner" },
        update: {},
        create: {
          id: "owner",
          username: "admin",
          passwordHash: await bcrypt.hash("admin", 12),
        },
      });
  }
  if (
    admin.username !== username ||
    !(await bcrypt.compare(password, admin.passwordHash))
  )
    throw new AdminError("Invalid username or password.", 401);
  const token = randomBytes(32).toString("hex");
  const maxAge = admin.needsSetup ? 15 * 60 : 8 * 60 * 60;
  await prisma.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.adminSession.create({
    data: {
      tokenHash: digest(token),
      adminId: admin.id,
      version: admin.version,
      expiresAt: new Date(Date.now() + maxAge * 1000),
    },
  });
  return { token, maxAge, needsSetup: admin.needsSetup };
}

export async function changeCredentials(
  token: string | undefined,
  input: unknown,
  currentPassword: string,
) {
  const admin = await requireAdmin(token, true);
  const data = credentialsSchema.parse(input);
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash)))
    throw new AdminError("Current password is incorrect.", 403);
  if (await bcrypt.compare(data.password, admin.passwordHash))
    throw new AdminError("Choose a different password.");
  const passwordHash = await bcrypt.hash(data.password, 12);
  await prisma.$transaction(async (tx) => {
    const changed = await tx.siteAdmin.updateMany({
      where: { id: admin.id, version: admin.version },
      data: {
        username: data.username,
        passwordHash,
        recoveryEmail: data.recoveryEmail,
        emailVerified:
          admin.emailVerified && admin.recoveryEmail === data.recoveryEmail,
        needsSetup: false,
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new AdminError("Account changed. Sign in again.", 409);
    await tx.adminSession.deleteMany({ where: { adminId: admin.id } });
    await tx.adminToken.deleteMany({ where: { adminId: admin.id } });
  });
}

export async function createEmailToken(
  admin: NonNullable<Awaited<ReturnType<typeof getAdmin>>>,
  purpose: "verify" | "reset",
) {
  if (!admin.recoveryEmail)
    throw new AdminError("Set your recovery email first.");
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction(async (tx) => {
    await tx.adminToken.deleteMany({
      where: {
        OR: [{ adminId: admin.id, purpose }, { expiresAt: { lt: new Date() } }],
      },
    });
    await tx.adminToken.create({
      data: {
        tokenHash: digest(token),
        adminId: admin.id,
        purpose,
        email: admin.recoveryEmail!,
        version: admin.version,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  });
  return token;
}

export async function consumeEmailToken(
  token: string,
  purpose: "verify" | "reset",
  password?: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AdminError("This link is invalid or expired.");
  const newPassword =
    purpose === "reset"
      ? credentialsSchema.shape.password.parse(password)
      : undefined;
  const passwordHash = newPassword
    ? await bcrypt.hash(newPassword, 12)
    : undefined;
  return prisma.$transaction(async (tx) => {
    const saved = await tx.adminToken.findUnique({
      where: { tokenHash: digest(token) },
      include: { admin: true },
    });
    if (
      !saved ||
      saved.purpose !== purpose ||
      saved.expiresAt <= new Date() ||
      saved.version !== saved.admin.version ||
      saved.email !== saved.admin.recoveryEmail ||
      saved.admin.needsSetup ||
      (purpose === "reset" && !saved.admin.emailVerified)
    )
      throw new AdminError("This link is invalid or expired.");
    const used = await tx.adminToken.deleteMany({
      where: { tokenHash: saved.tokenHash },
    });
    if (!used.count) throw new AdminError("This link has already been used.");
    if (purpose === "verify") {
      await tx.siteAdmin.update({
        where: { id: saved.adminId },
        data: { emailVerified: true },
      });
    } else {
      await tx.siteAdmin.update({
        where: { id: saved.adminId },
        data: { passwordHash, version: { increment: 1 } },
      });
      await tx.adminSession.deleteMany({ where: { adminId: saved.adminId } });
      await tx.adminToken.deleteMany({ where: { adminId: saved.adminId } });
    }
  });
}
