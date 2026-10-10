import { prisma } from "../lib/prisma";

/** Same SiteAdmin expiry/version/setup boundary as getAdmin; no member fallback. */
export async function sportsLabAdminSession(tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash }, include: { admin: true } });
  return session && session.expiresAt > new Date() && session.version === session.admin.version && !session.admin.needsSetup
    ? { expiresAt: session.expiresAt.getTime() } : null;
}
