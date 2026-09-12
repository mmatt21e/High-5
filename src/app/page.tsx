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
    <div className="collection-page">
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
          <a href="#games">The games</a>
          <Link href={session?.user ? "/lobby" : "/login"}>
            {session?.user ? "Your lobby" : "Sign in"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main>
        <section className="collection-hero">
          <div className="collection-hero-copy">
            <p className="collection-kicker">A SEAT AT THE TABLE</p>
            <h1>{home?.headline || "Good company. Great games."}</h1>
            <p className="collection-intro">
              {home?.intro ||
                "Pull up a seat. Start with Five-O Poker, and come back for more games as the collection grows."}
            </p>
            <a href="#games" className="collection-cta">
              Find your next game <span aria-hidden="true">↓</span>
            </a>
            <p className="collection-footnote">
              In your browser. On your phone or computer.
            </p>
          </div>
          <div
            className="collection-art"
            role="img"
            aria-label="Five playing cards arranged on a green poker table"
          >
            <span className="table-caption">MAKE YOUR NEXT MOVE.</span>
            <div className="collection-cards">
              {["10", "J", "Q", "K", "A"].map((rank, i) => (
                <div
                  key={rank}
                  className={`collection-card collection-card-${i}`}
                >
                  <b>
                    {rank}
                    <small>♠</small>
                  </b>
                  <span>♠</span>
                  <b>
                    {rank}
                    <small>♠</small>
                  </b>
                </div>
              ))}
            </div>
            <span className="table-stamp">
              FIVE HANDS.
              <br />
              THREE TO WIN.
            </span>
          </div>
        </section>
        <section
          id="games"
          className="collection-games"
          aria-labelledby="games-heading"
        >
          <div className="collection-section-heading">
            <div>
              <p className="collection-kicker">THE COLLECTION</p>
              <h2 id="games-heading">Pick a game. Pull up a seat.</h2>
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
                {game.status === "live" && (
                  <a href={game.href} className="collection-game-link">
                    Play {game.title} <span aria-hidden="true">↗</span>
                  </a>
                )}
                {game.id === "five-o" && (
                  <Link href="/games/five-o" className="collection-rules-link">
                    Get to know Five-O
                  </Link>
                )}
              </article>
            ))}
            <article className="collection-next">
              <span aria-hidden="true">＋</span>
              <h3>More games on the way.</h3>
              <p>
                The collection is just getting started. Come back to see what’s
                next.
              </p>
            </article>
          </div>
        </section>
        <section className="collection-note">
          <span aria-hidden="true">♣</span>
          <div>
            <h2>
              A little competition.
              <br />A good reason to get together.
            </h2>
            <p>
              Challenge a friend to Five-O, find another player in the lobby, or
              take on the computer at your own pace.
            </p>
          </div>
          <Link
            href={session?.user ? "/lobby" : "/register"}
            className="collection-cta"
          >
            {session?.user ? "Open the lobby" : "Join the table"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <footer className="collection-footer">
        <Link href="/" className="collection-brand">
          Edge Games<span className="brand-dot">.</span>
        </Link>
        <span>One more game?</span>
        <Link href="/admin">Admin</Link>
      </footer>
    </div>
  );
}
