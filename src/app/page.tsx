import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edge Games | Good company. Great games.",
  description:
    "Pull up a seat at Edge Games. Play Five-O Poker with a friend or the computer, with more games to come.",
  alternates: { canonical: "https://edgegames.win/" },
  openGraph: {
    type: "website",
    url: "https://edgegames.win/",
    siteName: "Edge Games",
    title: "Edge Games | Good company. Great games.",
  },
  twitter: {
    card: "summary",
    title: "Edge Games | Good company. Great games.",
  },
  robots: { index: true, follow: true },
};

export default async function HomePage() {
  const [session, home, games] = await Promise.all([
    auth(),
    prisma.siteContent.findUnique({ where: { id: "home" } }),
    prisma.catalogGame.findMany({
      where: { status: { in: ["live", "coming-soon"] } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);
  return (
    <div className="collection-page collection-home">
      <a href="#games" className="landing-skip-link">
        Skip to games
      </a>
      <header className="collection-header">
        <Link href="/" className="collection-brand">
          <span aria-hidden="true">
            E<span className="brand-dot">.</span>
          </span>{" "}
          Edge Games
        </Link>
        <nav aria-label="Main navigation">
          <a href="#games">Games</a>
          <a href="#members">Members</a>
          <a href="#tools">Tools &amp; apps</a>
          <Link
            href={session?.user ? "/lobby" : "/login"}
            className="home-account-link"
          >
            {session?.user ? "My game lobby" : "Game sign in"}
          </Link>
        </nav>
      </header>
      <main>
        <section className="home-intro" aria-labelledby="home-heading">
          <div>
            <p className="collection-kicker">
              GAMES, TOOLS &amp; YOUR MEMBER SPACE
            </p>
            <h1 id="home-heading">
              {home?.headline || "Good company. Great games."}
            </h1>
            <p className="collection-intro">
              {home?.intro ||
                "Pull up a seat. Start with Five-O Poker, and come back for more games as the collection grows."}
            </p>
          </div>
          <nav className="home-directory" aria-label="Explore Edge Games">
            <a href="#games">
              <span className="home-directory-icon" aria-hidden="true">
                ♠
              </span>
              <span>
                <strong>Browse games</strong>
                <small>Choose a game and start playing</small>
              </span>
              <span aria-hidden="true">↓</span>
            </a>
            <Link href="/members">
              <span className="home-directory-icon" aria-hidden="true">
                ◇
              </span>
              <span>
                <strong>Members area</strong>
                <small>Sign in to private games and tools</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <a href="#tools">
              <span className="home-directory-icon" aria-hidden="true">
                ＋
              </span>
              <span>
                <strong>Tools &amp; apps</strong>
                <small>Explore companion apps from Edge</small>
              </span>
              <span aria-hidden="true">↓</span>
            </a>
          </nav>
        </section>
        <section
          id="games"
          className="collection-games"
          aria-labelledby="games-heading"
        >
          <div className="collection-section-heading">
            <div>
              <p className="collection-kicker">OPEN TO EVERYONE</p>
              <h2 id="games-heading">Games</h2>
            </div>
            <span>
              {games.filter((g) => g.status === "live").length} ready to play
            </span>
          </div>
          <div className="collection-grid">
            {games.map((game, index) => (
              <article
                className={`collection-game ${game.status === "coming-soon" ? "collection-soon" : ""}`}
                key={game.id}
              >
                <div className="collection-game-top">
                  <span className="collection-game-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="collection-badge">
                    {game.status === "live" ? "PLAY NOW" : "COMING SOON"}
                  </span>
                </div>
                <div className="collection-game-symbol" aria-hidden="true">
                  {game.id === "five-o"
                    ? "♠"
                    : game.status === "live"
                      ? "✦"
                      : "+"}
                </div>
                <p className="collection-game-category">{game.category}</p>
                <h3>{game.title}</h3>
                <p>{game.description}</p>
                <div className="home-game-actions">
                  {game.status === "live" && (
                    <a href={game.href} className="collection-cta">
                      Play {game.title} <span aria-hidden="true">→</span>
                    </a>
                  )}
                  {game.id === "five-o" && (
                    <>
                      <Link href="/practice" className="home-secondary-link">
                        Try guided practice — no account needed
                      </Link>
                      <Link
                        href="/games/five-o"
                        className="home-secondary-link"
                      >
                        About Five-O &amp; how to play
                      </Link>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="home-section-help">
            {games.length
              ? "New games will appear here as the collection grows."
              : "No games are listed yet. Check back soon."}
          </p>
        </section>
        <section
          id="members"
          className="home-area home-members"
          aria-labelledby="members-heading"
        >
          <div>
            <p className="collection-kicker">INVITATION ONLY</p>
            <h2 id="members-heading">Members area</h2>
            <p>
              Access the private collection of games and tools with your member
              account.
            </p>
            <p className="home-section-help">
              Member accounts are separate from public game accounts.
            </p>
          </div>
          <div className="home-area-actions">
            <Link href="/members" className="collection-cta">
              Enter members area <span aria-hidden="true">→</span>
            </Link>
            <Link href="/members/join" className="home-secondary-link">
              Use an invitation code
            </Link>
            <Link href="/members/login" className="home-secondary-link">
              Member sign in
            </Link>
          </div>
        </section>
        <section
          id="tools"
          className="home-area"
          aria-labelledby="tools-heading"
        >
          <div>
            <p className="collection-kicker">COMPANION APPS</p>
            <h2 id="tools-heading">Tools &amp; apps</h2>
            <h3 className="home-tool-name">BankrollEdge</h3>
            <p>
              Track your poker sessions, sports bets, and bankroll in your
              browser or on your phone.
            </p>
            <p className="home-section-help">
              Separate website · bankrolledge.com
            </p>
          </div>
          <a
            href="https://bankrolledge.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="collection-cta"
          >
            Open BankrollEdge <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
        <section
          id="account"
          className="home-area home-game-account"
          aria-labelledby="account-heading"
        >
          <div>
            <p className="collection-kicker">PUBLIC GAME ACCOUNT</p>
            <h2 id="account-heading">
              {session?.user
                ? "Ready for your next game?"
                : "Sign in or create a game account"}
            </h2>
            <p>
              {session?.user
                ? "Return to the lobby to find a player or continue playing."
                : "Use your game account to enter the lobby and play with other people."}
            </p>
          </div>
          <div className="home-area-actions">
            <Link
              href={session?.user ? "/lobby" : "/login"}
              className="collection-cta"
            >
              {session?.user ? "Open my game lobby" : "Game sign in"}
              <span aria-hidden="true">→</span>
            </Link>
            {!session?.user && (
              <Link href="/register" className="home-secondary-link">
                Create a game account
              </Link>
            )}
          </div>
        </section>
      </main>
      <footer className="collection-footer">
        <Link href="/" className="collection-brand">
          Edge Games<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Footer navigation">
          <a href="#games">Games</a>
          <Link href="/members">Members area</Link>
          <a href="#tools">Tools &amp; apps</a>
          <Link href="/admin">Site admin</Link>
        </nav>
      </footer>
    </div>
  );
}
