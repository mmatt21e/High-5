import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { AvatarSettings } from "@/components/AvatarSettings";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { playerSelect, publicPlayer } from "@/server/playerIdentity";
import { HISTORY_PAGE_SIZE, opponentRecords, recentGames } from "@/server/playerHistory";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ opponent?: string; page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const opponentId = typeof params.opponent === "string" ? params.opponent : undefined;
  const pageNumber = Number(params.page ?? 1);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 10_000) : 1;
  const [stats, user, records, history] = await Promise.all([
    prisma.stats.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: playerSelect }),
    opponentRecords(session.user.id),
    recentGames(session.user.id, opponentId, page),
  ]);
  if (!user) redirect("/login");
  const selectedRecord = records.find((record) => record.player.id === opponentId);
  // Lifetime counters survive an opponent deleting their account; head-to-head
  // rows below only describe opponents that still exist.
  const completedMatches = stats?.matchesPlayed ?? 0;
  const matchLosses = completedMatches - (stats?.matchWins ?? 0);
  const historyLink = (nextPage: number) => `/profile?${new URLSearchParams({ ...(opponentId ? { opponent: opponentId } : {}), page: String(nextPage) })}#game-history`;

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
        <p className="text-lg font-bold">{user.displayName}</p>
        <p className="subtle-text text-sm">{session.user.email}</p>
        <p className="subtle-text mt-1 text-xs">Your searchable player name · Player #{user.id.slice(-6)}</p>
      </div>

      <h2 className="font-bold">Overall record</h2>
      <div className="grid grid-cols-2 gap-3">
        <Big label="Win rate" value={`${winRate}%`} />
        <Big label="Win streak" value={stats?.currentStreak ?? 0} />
        <Cell label="Games played" value={games} />
        <Cell label="Game wins" value={wins} />
        <Cell label="Game losses" value={stats?.gameLosses ?? 0} />
        <Cell label="Pushes" value={stats?.gamePushes ?? 0} />
        <Cell label="Five-O sweeps" value={stats?.fiveOs ?? 0} />
        <Cell label="Best streak" value={stats?.bestStreak ?? 0} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Completed matches" value={completedMatches} />
        <Cell label="Match wins" value={stats?.matchWins ?? 0} />
        <Cell label="Match losses" value={matchLosses} />
      </div>
      <p className="subtle-text text-xs">A game scores five hands. A match is first to five game wins. Pushes are tied games; unfinished matches do not count as wins or losses.</p>

      <section className="panel" aria-labelledby="opponents-heading">
        <h2 id="opponents-heading" className="font-bold">Head-to-head records</h2>
        {records.length === 0 ? <p className="supporting-text mt-2 text-sm">Play someone to start your head-to-head history.</p> : (
          <div className="history-table-scroll">
            <table className="history-table">
              <caption className="subtle-text">Wins / losses / pushes in games; wins / losses in completed matches.</caption>
              <thead><tr><th scope="col">Opponent</th><th scope="col">Games<br />W / L / P</th><th scope="col">Matches<br />W / L</th></tr></thead>
              <tbody>{records.map((record) => <tr key={record.player.id}>
                <th scope="row"><Link href={`/profile?opponent=${encodeURIComponent(record.player.id)}#game-history`} className="history-opponent">
                  <PlayerAvatar avatar={record.player.avatar} name={record.player.displayName} size="sm" />
                  <span>{record.player.displayName}<small className="subtle-text">#{record.player.id.slice(-6)}</small></span>
                </Link></th>
                <td>{record.wins} / {record.losses} / {record.pushes}</td>
                <td>{record.matchWins} / {record.matchLosses}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section id="game-history" className="panel" aria-labelledby="history-heading">
        <h2 id="history-heading" className="font-bold">Game history</h2>
        <form action="/profile#game-history" className="my-3">
          <label htmlFor="history-opponent" className="form-label text-sm">Filter by opponent</label>
          <div className="mt-1 flex gap-2">
            <select name="opponent" id="history-opponent" defaultValue={opponentId ?? ""} className="field min-w-0 flex-1">
              <option value="">All opponents</option>
              {records.map((record) => <option key={record.player.id} value={record.player.id}>{record.player.displayName} · #{record.player.id.slice(-6)}</option>)}
            </select>
            <button className="btn-outline">View</button>
          </div>
        </form>
        {selectedRecord && <p className="mb-3 text-sm">Against {selectedRecord.player.displayName}: {selectedRecord.wins} wins, {selectedRecord.losses} losses, {selectedRecord.pushes} pushes.</p>}
        <ul className="game-history-list">
          {history.games.map((game) => <li key={game.id}>
            <PlayerAvatar avatar={game.opponent?.avatar} name={game.opponent?.displayName ?? "Former player"} size="sm" />
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">vs {game.opponent?.displayName ?? "Former player"}</p>
              <p className="subtle-text text-xs"><time dateTime={game.date.toISOString()}>{game.date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</time> · Game {game.number}{game.isFiveO ? " · Five-O sweep" : ""}</p>
            </div>
            <span className={`text-sm font-bold ${game.outcome === "Win" ? "success-text" : game.outcome === "Loss" ? "error-text" : "supporting-text"}`}>{game.outcome}</span>
          </li>)}
        </ul>
        {history.games.length === 0 && <p className="supporting-text text-sm">No completed games{selectedRecord ? " against this player" : " on this page"} yet.</p>}
        <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Game history pages">
          {page > 1 ? <Link className="nav-link" href={historyLink(page - 1)}>← Newer</Link> : <span />}
          <span className="subtle-text">{history.total} completed {history.total === 1 ? "game" : "games"}</span>
          {page * HISTORY_PAGE_SIZE < history.total ? <Link className="nav-link" href={historyLink(page + 1)}>Older →</Link> : <span />}
        </nav>
      </section>

      <div className="panel"><AvatarSettings player={publicPlayer(user)} /></div>

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
