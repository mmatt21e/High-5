import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicPlayer, playerSelect } from "@/server/playerIdentity";
import { fitsBcryptPasswordLimit } from "@/lib/password";
import {
  RATE_LIMITS,
  resetAccountRateLimit,
  takeAccountRateLimit,
} from "@/lib/rateLimit";

// Make `id` and `displayName` available on the session/JWT.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      displayName: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).refine(fitsBcryptPasswordLimit),
});

// Google is optional — only register it when credentials are configured.
const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}
providers.push(
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;
      const normalizedEmail = email.toLowerCase();
      const rateLimit = takeAccountRateLimit(
        "credentials",
        normalizedEmail,
        RATE_LIMITS.credentials,
      );
      if (!rateLimit.allowed) return null;
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (!user?.passwordHash || user.computerLevel) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      resetAccountRateLimit("credentials", normalizedEmail);
      return {
        id: user.id,
        email: user.email,
        name: user.displayName,
        image: publicPlayer(user).avatar,
      };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    signIn: async ({ user }) => {
      if (!user.email) return true;
      const existing = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { computerLevel: true } });
      return !existing?.computerLevel;
    },
    jwt: async ({ token, user }) => {
      if (user?.id) token.uid = user.id;
      // Keep displayName fresh on the token.
      if (token.uid) {
        const db = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: playerSelect,
        });
        if (db) {
          if (db.computerLevel) return null;
          token.displayName = db.displayName;
          token.picture = publicPlayer(db).avatar;
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token.uid) session.user.id = token.uid as string;
      session.user.displayName =
        (token.displayName as string) || session.user.name || "Player";
      return session;
    },
  },
  events: {
    // OAuth users are created by the adapter without a displayName or stats
    // row — backfill both here.
    createUser: async ({ user }) => {
      if (!user.id) return;
      const fallback =
        user.name || user.email?.split("@")[0] || "Player";
      await prisma.user.update({
        where: { id: user.id },
        data: { displayName: fallback },
      });
      await prisma.stats.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
    },
  },
});
