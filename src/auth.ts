import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
  email: z.string().email(),
  password: z.string().min(1),
});

// Google is optional — only register it when credentials are configured.
const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
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
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.displayName,
        image: user.image,
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
    jwt: async ({ token, user }) => {
      if (user?.id) token.uid = user.id;
      // Keep displayName fresh on the token.
      if (token.uid) {
        const db = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { displayName: true },
        });
        if (db) token.displayName = db.displayName;
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
