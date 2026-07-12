import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Lobby } from "@/components/Lobby";
import { SignOutButton } from "@/components/SignOutButton";
import { DeckToggle } from "@/components/DeckToggle";
import { NotificationToggle } from "@/components/NotificationToggle";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const uid = session.user.id;

  const [stats, activeMatches] = await Promise.all([
    prisma.stats.findUnique({ where: { userId: uid } }),
    prisma.match.findMany({
      where: {
        status: { in: ["lobby", "active"] },
        OR: [{ hostId: uid }, { guestId: uid }],
      },
      include: { host: true, guest: true },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  const games = activeMatches.map((m) => {
    const seat = m.hostId === uid ? 0 : 1;
    const opponent =
      seat === 0 ? m.guest?.displayName ?? null : m.host.displayName;
    const myScore = seat === 0 ? m.scoreHost : m.scoreGuest;
    const oppScore = seat === 0 ? m.scoreGuest : m.scoreHost;
    let turn: "yours" | "theirs" | "waiting" | "next";
    if (!m.guest || m.status === "lobby") turn = "waiting";
    else {
      let toMove: number | null = null;
      let playing = false;
      if (m.gameState) {
        try {
          const s = JSON.parse(m.gameState) as {
            toMove: number;
            phase: string;
          };
          toMove = s.toMove;
          playing = s.phase === "playing";
        } catch {
          /* ignore */
        }
      }
      if (!playing) turn = "next";
      else turn = toMove === seat ? "yours" : "theirs";
    }
    return {
      code: m.inviteCode,
      opponent,
      myScore,
      oppScore,
      target: m.targetWins,
      turn,
    };
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

      {games.length > 0 && (
        <section className="panel">
          <h2 className="mb-3 font-bold">Your games</h2>
          <div className="flex flex-col gap-2">
            {games.map((g) => (
              <Link
                key={g.code}
                href={`/play/${g.code}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 active:scale-[0.99]"
              >
                <div>
                  <div className="text-sm font-semibold">
                    vs {g.opponent ?? "waiting…"}
                  </div>
                  <div className="text-xs text-white/50">
                    {g.myScore}–{g.oppScore} · code {g.code}
                  </div>
                </div>
                <TurnBadge turn={g.turn} />
              </Link>
            ))}
          </div>
        </section>
      )}

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

      <section className="panel flex flex-col gap-4">
        <DeckToggle />
        <div className="border-t border-white/10 pt-4">
          <div className="mb-2 text-sm font-bold">Notifications</div>
          <NotificationToggle />
        </div>
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

function TurnBadge({
  turn,
}: {
  turn: "yours" | "theirs" | "waiting" | "next";
}) {
  const map = {
    yours: { text: "Your turn", cls: "bg-gold text-felt-900" },
    theirs: { text: "Their turn", cls: "bg-white/10 text-white/70" },
    waiting: { text: "Waiting", cls: "bg-white/10 text-white/70" },
    next: { text: "Next game", cls: "bg-emerald-400/20 text-emerald-200" },
  }[turn];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${map.cls}`}>
      {map.text}
    </span>
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
