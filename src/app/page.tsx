import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Lobby } from "@/components/Lobby";
import { SignOutButton } from "@/components/SignOutButton";
import { DeckToggle } from "@/components/DeckToggle";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stats = await prisma.stats.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gold">Five-O Poker</h1>
          <p className="text-sm text-white/70">
            Hi, {session.user.displayName}
          </p>
        </div>
        <SignOutButton />
      </header>

      <Lobby />

      <section className="panel mt-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Your stats</h2>
          <Link href="/profile" className="text-sm text-gold underline">
            Details
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Games" value={stats?.gamesPlayed ?? 0} />
          <Stat label="Wins" value={stats?.gameWins ?? 0} />
          <Stat label="Five-Os" value={stats?.fiveOs ?? 0} />
        </div>
      </section>

      <section className="panel">
        <DeckToggle />
      </section>

      <Link
        href="/how-to-play"
        className="mt-auto text-center text-sm text-white/60 underline"
      >
        New to Five-O? How to play →
      </Link>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/5 py-3">
      <div className="text-2xl font-black text-gold">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}
