import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LandingPage } from "@/components/LandingPage";
import { Lobby } from "@/components/Lobby";
import { SignOutButton } from "@/components/SignOutButton";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { NotificationToggle } from "@/components/NotificationToggle";
import { PlayerChallenges } from "@/components/PlayerChallenges";
import { ComputerLobby } from "@/components/ComputerLobby";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { publicPlayer } from "@/server/playerIdentity";

export const metadata: Metadata = {
  title: "Five-O Poker | Five Hands. Three to Win.",
  description:
    "Play heads-up Five-O Poker across two phones. Build four open poker hands and one concealed hand, then win three of five at showdown.",
  alternates: { canonical: "https://edgegames.win/" },
  openGraph: {
    type: "website",
    url: "https://edgegames.win/",
    siteName: "Five-O Poker",
    title: "Five-O Poker | Five Hands. Three to Win.",
    description:
      "Play heads-up Five-O Poker across two phones. Build four open poker hands and one concealed hand, then win three of five at showdown.",
  },
  twitter: {
    card: "summary",
    title: "Five-O Poker | Five Hands. Three to Win.",
    description:
      "Build four open poker hands and one concealed hand, then win three of five at showdown.",
  },
  robots: { index: true, follow: true },
};

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) return <LandingPage />;
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
      seat === 0 ? (m.guest ? publicPlayer(m.guest).displayName : null) : m.host.displayName;
    const myScore = seat === 0 ? m.scoreHost : m.scoreGuest;
    const oppScore = seat === 0 ? m.scoreGuest : m.scoreHost;
    let turn: "yours" | "theirs" | "waiting" | "next" | "trick";
    if (!m.guest || m.status === "lobby") turn = "waiting";
    else {
      let toMove: number | null = null;
      let playing = false;
      let trickWaiting = false;
      if (m.gameState) {
        try {
          const s = JSON.parse(m.gameState) as {
            toMove: number;
            phase: string;
            exhibition?: { pending?: unknown };
          };
          toMove = s.toMove;
          playing = s.phase === "playing";
          trickWaiting = m.guest.computerLevel === "wildcard" && Boolean(s.exhibition?.pending);
        } catch {
          /* ignore */
        }
      }
      if (!playing) turn = "next";
      else turn = trickWaiting ? "trick" : toMove === seat ? "yours" : "theirs";
    }
    return {
      code: m.inviteCode,
      opponent,
      computer: Boolean(m.guest?.computerLevel),
      exhibition: m.guest?.computerLevel === "wildcard",
      avatar: (seat === 0 ? m.guest : m.host) ? publicPlayer((seat === 0 ? m.guest : m.host)!).avatar : null,
      myScore,
      oppScore,
      target: m.targetWins,
      turn,
    };
  });

  return (
    <main className="app-screen flex flex-1 flex-col">
      <header className="app-header flex items-center justify-between">
        <div>
          <h1 className="app-title text-2xl font-black">Five-O Poker</h1>
          <p className="app-subtitle text-sm">
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
                className="surface-list-item flex items-center justify-between px-3 py-2.5 active:scale-[0.99]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar avatar={g.avatar} name={g.opponent ?? "Player"} size="sm" />
                  <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    vs {g.opponent ?? "waiting…"}
                  </div>
                  <div className="subtle-text text-xs">
                    {g.exhibition ? "Exhibition · untracked" : `${g.myScore}–${g.oppScore} · ${g.computer ? "Computer match" : `code ${g.code}`}`}
                  </div>
                  </div>
                </div>
                <TurnBadge turn={g.turn} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <ComputerLobby />
      <PlayerChallenges />
      <section className="panel" aria-labelledby="invite-code-title">
        <h2 id="invite-code-title" className="mb-3 font-bold">Play using an invite code</h2>
        <Lobby />
      </section>

      <section className="panel mt-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Your stats</h2>
          <Link href="/profile" className="nav-link px-2 text-sm text-gold">
            Profile & history
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Games" value={stats?.gamesPlayed ?? 0} />
          <Stat label="Wins" value={stats?.gameWins ?? 0} />
          <Stat label="Five-Os" value={stats?.fiveOs ?? 0} />
        </div>
      </section>

      <section className="panel flex flex-col gap-4">
        <AppearanceSettings />
        <div className="section-divider border-t pt-4">
          <div className="mb-2 text-sm font-bold">Notifications</div>
          <NotificationToggle />
        </div>
      </section>

      <Link
        href="/how-to-play"
        className="nav-link mt-auto px-2 text-center text-sm"
      >
        New to Five-O? How to play →
      </Link>
    </main>
  );
}

function TurnBadge({
  turn,
}: {
  turn: "yours" | "theirs" | "waiting" | "next" | "trick";
}) {
  const map = {
    yours: { text: "Your turn", cls: "status-chip-current" },
    trick: { text: "Trick waiting", cls: "status-chip-current" },
    theirs: { text: "Their turn", cls: "" },
    waiting: { text: "Waiting", cls: "" },
    next: { text: "Next game", cls: "status-chip-success" },
  }[turn];
  return (
    <span className={`status-chip text-xs font-bold ${map.cls}`}>
      {map.text}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-cell py-3">
      <div className="text-2xl font-black text-gold">{value}</div>
      <div className="metric-label text-xs">{label}</div>
    </div>
  );
}
