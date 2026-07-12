import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckToggle } from "@/components/DeckToggle";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stats = await prisma.stats.findUnique({
    where: { userId: session.user.id },
  });

  const games = stats?.gamesPlayed ?? 0;
  const wins = stats?.gameWins ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gold">Your profile</h1>
        <Link href="/" className="text-sm text-white/60 underline">
          Back
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-black/15 p-4">
        <p className="text-lg font-bold">{session.user.displayName}</p>
        <p className="text-sm text-white/60">{session.user.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Big label="Win rate" value={`${winRate}%`} />
        <Big label="Win streak" value={stats?.currentStreak ?? 0} />
        <Cell label="Games played" value={games} />
        <Cell label="Game wins" value={wins} />
        <Cell label="Game losses" value={stats?.gameLosses ?? 0} />
        <Cell label="Pushes" value={stats?.gamePushes ?? 0} />
        <Cell label="Five-O sweeps" value={stats?.fiveOs ?? 0} />
        <Cell label="Best streak" value={stats?.bestStreak ?? 0} />
        <Cell label="Matches played" value={stats?.matchesPlayed ?? 0} />
        <Cell label="Match wins" value={stats?.matchWins ?? 0} />
      </div>

      <div className="panel">
        <DeckToggle />
      </div>
    </main>
  );
}

function Big({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-center">
      <div className="text-3xl font-black text-gold">{value}</div>
      <div className="text-xs text-white/70">{label}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}
