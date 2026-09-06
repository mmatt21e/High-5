import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppearanceSettings } from "@/components/AppearanceSettings";

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
    <main className="app-screen flex flex-1 flex-col">
      <header className="app-header flex items-center justify-between">
        <h1 className="app-title text-2xl font-black">Your profile</h1>
        <Link href="/" className="nav-link px-2 text-sm">
          Back
        </Link>
      </header>

      <div className="surface-card p-4">
        <p className="text-lg font-bold">{session.user.displayName}</p>
        <p className="subtle-text text-sm">{session.user.email}</p>
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
        <AppearanceSettings />
      </div>
    </main>
  );
}

function Big({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-cell stat-cell-featured p-4 text-center">
      <div className="text-3xl font-black text-gold">{value}</div>
      <div className="metric-label text-xs">{label}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-cell p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="metric-label text-xs">{label}</div>
    </div>
  );
}
