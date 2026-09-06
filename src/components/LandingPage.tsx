import Link from "next/link";
import { FannedColumn } from "@/components/PlayingCard";
import type { CardView } from "@/lib/game/types";

const OPEN_HANDS: CardView[][] = [
  [
    { state: "card", card: { rank: 14, suit: "s" } },
    { state: "card", card: { rank: 14, suit: "h" } },
    { state: "card", card: { rank: 9, suit: "d" } },
    { state: "card", card: { rank: 9, suit: "c" } },
    { state: "card", card: { rank: 5, suit: "s" } },
  ],
  [
    { state: "card", card: { rank: 13, suit: "h" } },
    { state: "card", card: { rank: 12, suit: "h" } },
    { state: "card", card: { rank: 11, suit: "h" } },
    { state: "card", card: { rank: 10, suit: "h" } },
    { state: "card", card: { rank: 9, suit: "h" } },
  ],
  [
    { state: "card", card: { rank: 8, suit: "d" } },
    { state: "card", card: { rank: 8, suit: "s" } },
    { state: "card", card: { rank: 8, suit: "c" } },
    { state: "card", card: { rank: 2, suit: "h" } },
    { state: "card", card: { rank: 2, suit: "d" } },
  ],
  [
    { state: "card", card: { rank: 7, suit: "s" } },
    { state: "card", card: { rank: 6, suit: "d" } },
    { state: "card", card: { rank: 5, suit: "c" } },
    { state: "card", card: { rank: 4, suit: "h" } },
    { state: "card", card: { rank: 3, suit: "d" } },
  ],
];

const HIDDEN_HAND: CardView[] = Array.from({ length: 5 }, () => ({
  state: "hidden",
}));

export function LandingPage() {
  return (
    <div className="landing-page flex flex-1 flex-col">
      <a href="#landing-content" className="landing-skip-link">
        Skip to content
      </a>

      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label="Five-O Poker home">
          <span className="landing-brand-mark" aria-hidden="true">5O</span>
          <span>Five-O Poker</span>
        </Link>
        <Link href="/login" className="landing-sign-in">
          Sign in
        </Link>
      </header>

      <main id="landing-content" className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <p className="landing-eyebrow">Heads-up poker across two screens</p>
          <h1 id="landing-title" className="landing-title">
            <span>Build five hands.</span>
            <span>Win three.</span>
            <span className="landing-title-accent">Call Five-O.</span>
          </h1>
          <p className="landing-lede">
            Draw one card, place one card, and shape four open poker hands while
            protecting a fifth that stays concealed until showdown.
          </p>
          <div className="landing-actions">
            <Link href="/register" className="btn-primary landing-primary-action">
              Create an account
            </Link>
            <Link href="/how-to-play" className="btn-outline landing-secondary-action">
              How to play
            </Link>
          </div>
        </section>

        <figure className="landing-table" aria-labelledby="landing-table-caption">
          <div className="landing-table-label" aria-hidden="true">
            Five-hand showdown
          </div>
          <div className="landing-hands" aria-hidden="true">
            {OPEN_HANDS.map((hand, index) => (
              <div className="landing-hand" key={index}>
                <FannedColumn slots={hand} size="sm" decorative />
                <span>{index + 1}</span>
              </div>
            ))}
            <div className="landing-hand landing-hand-hidden">
              <FannedColumn slots={HIDDEN_HAND} size="sm" decorative />
              <span>Hidden</span>
            </div>
          </div>
          <figcaption id="landing-table-caption">
            Four hands are built in the open. Your held cards become the hidden
            fifth hand.
          </figcaption>
        </figure>

        <section className="landing-rules" aria-labelledby="landing-rules-title">
          <div className="landing-section-heading">
            <h2 id="landing-rules-title">Poker hands, built one card at a time.</h2>
            <p>
              You see every card your opponent places—but never the five they
              are saving for the final reveal.
            </p>
          </div>

          <ol className="landing-moves">
            <li>
              <strong>Draw</strong>
              <span>Start with five concealed cards. Draw to six on your turn.</span>
            </li>
            <li>
              <strong>Place</strong>
              <span>
                Commit one held card to an open hand, or use your one discard
                for the game.
              </span>
            </li>
            <li>
              <strong>Showdown</strong>
              <span>
                Compare each matching hand. Win at least three of the five to
                take the game.
              </span>
            </li>
          </ol>

          <div className="landing-score-rule" aria-label="Game and match win conditions">
            <div>
              <strong>3 of 5</strong>
              <span>hands wins the game</span>
            </div>
            <div aria-hidden="true" className="landing-score-divider" />
            <div>
              <strong>5 games</strong>
              <span>wins the match</span>
            </div>
          </div>
        </section>

        <section className="landing-invite" aria-labelledby="landing-invite-title">
          <div className="landing-invite-mark" aria-hidden="true">
            <span className="suit-s">♠</span><span className="suit-h">♥</span>
            <span className="suit-d">♦</span><span className="suit-c">♣</span>
          </div>
          <h2 id="landing-invite-title">Bring one opponent.</h2>
          <p>
            Create a match and share its invite code. Each player uses their own
            phone, turns update live, and unfinished games wait in the lobby.
          </p>
          <p className="landing-customize-note">
            Your interface, table, deck, and suit colors can be chosen on each
            device.
          </p>
        </section>

        <section className="landing-final-cta" aria-labelledby="landing-cta-title">
          <h2 id="landing-cta-title">Deal the first hand.</h2>
          <p>Create an account, invite a player, and start building.</p>
          <Link href="/register" className="btn-primary w-full">
            Create an account
          </Link>
          <Link href="/login" className="nav-link mt-2 w-full text-sm">
            Already play? Sign in
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <span>Five-O Poker</span>
        <Link href="/how-to-play">Rules &amp; card options</Link>
      </footer>
    </div>
  );
}
