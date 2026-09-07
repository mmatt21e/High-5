import Link from "next/link";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { FannedColumn } from "@/components/PlayingCard";
import type { CardView } from "@/lib/game/types";

export const metadata = { title: "How to Play · Five-O Poker" };

const exampleHand: CardView[] = [
  { state: "card", card: { rank: 14, suit: "s" } },
  { state: "card", card: { rank: 14, suit: "h" } },
  { state: "card", card: { rank: 9, suit: "d" } },
  { state: "card", card: { rank: 9, suit: "c" } },
  { state: "card", card: { rank: 5, suit: "s" } },
];

export default function HowToPlayPage() {
  return (
    <main className="app-screen flex flex-1 flex-col">
      <header className="app-header flex items-center justify-between">
        <h1 className="app-title text-2xl font-black">How to play</h1>
        <Link href="/" className="nav-link px-2 text-sm">
          Back
        </Link>
      </header>

      <section className="panel">
        <h2 className="mb-2 font-bold">Choose your opponent</h2>
        <p className="supporting-text text-sm">Invite a player by name or code, or choose Play the computer in the lobby. Start with Analyst Edge, challenge House Edge, or take on Counter Edge. These three follow the same rules and cannot see your hidden cards. Their results count in your overall and head-to-head records.</p>
        <p className="supporting-text mt-3 text-sm"><strong>Wildcard Edge: House Rules exhibition.</strong> This fourth opponent can cheat, peek, swap cards, and offer deals. Results never affect statistics or history. One row is low-hand-wins, announced before play. Every trick waits for your response: allow it, use Play Fair!, call a suspicious bluff, or accept/decline a deal. Open Tricks for your redraw and row-swap powers, the trick log, and the full rulebook. Fresh deal restarts whenever you like; the current board saves so you can resume.</p>
      </section>

      <Step n={1} title="Five hands: 4 shown, 1 hidden">
        You build <b>four rows</b> your opponent can see, plus a{" "}
        <b>concealed hand</b> only you can see. Those five poker hands are what
        get scored.
        <div className="mt-3 flex items-end gap-2">
          <FannedColumn slots={exampleHand} size="md" />
          <span className="subtle-text pb-1 text-xs">
            A hand: two pair, aces &amp; nines
          </span>
        </div>
      </Step>

      <Step n={2} title="Start with five hidden cards">
        Each player is dealt a <b>concealed hand of 5 cards</b> to begin. Your
        opponent can’t see them.
      </Step>

      <Step n={3} title="Draw one, place one">
        On your turn you <b>draw a card</b> (now holding six). Then place{" "}
        <b>one card</b> — the drawn card or a held one — into one of your four
        rows. You always keep five cards concealed.
      </Step>

      <Step n={4} title="One discard per game">
        Once per game, instead of placing, you may <b>discard</b> a card you
        don’t want — great for ditching a card that would spoil a hand.
      </Step>

      <Step n={5} title="Your concealed hand is your 5th hand">
        When both players have filled all four rows, everything is revealed. Your
        held 5 cards become your <b>fifth hand</b>. Each hand is compared to your
        opponent’s in the same spot — win <b>3 of 5</b> to win the game, all five
        for a <span className="font-bold text-gold">Five-O</span>.
      </Step>

      <Step n={6} title="First to 5 wins the match">
        Keep playing games — the first player to 5 game wins takes the match, and
        it all feeds your lifetime stats.
      </Step>

      <div className="panel">
        <h2 className="app-title mb-2 font-bold">Hand rankings (high to low)</h2>
        <ol className="supporting-text grid grid-cols-1 gap-1 text-sm">
          {[
            "Straight flush",
            "Four of a kind",
            "Full house",
            "Flush",
            "Straight",
            "Three of a kind",
            "Two pair",
            "Pair",
            "High card",
          ].map((h, i) => (
            <li key={h} className="flex gap-2">
              <span className="subtle-text w-4">{i + 1}.</span>
              {h}
            </li>
          ))}
        </ol>
      </div>

      <details className="panel public-appearance-disclosure">
        <summary className="tap-target flex cursor-pointer items-center font-bold text-gold">
          Customize interface &amp; playing cards
        </summary>
        <p className="supporting-text mb-4 mt-1 text-xs leading-relaxed">
          Preview and choose any interface, deck, table, and suit palette before
          signing in. Choices stay on this device.
        </p>
        <AppearanceSettings showHeading={false} />
      </details>

      <Link href="/" className="btn-primary">
        Got it — let’s play
      </Link>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <div className="step-marker">
        {n}
      </div>
      <div>
        <h2 className="font-bold">{title}</h2>
        <div className="supporting-text mt-1 text-sm leading-relaxed">{children}</div>
      </div>
    </section>
  );
}
