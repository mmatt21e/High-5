import Link from "next/link";
import { FannedColumn } from "@/components/PlayingCard";
import type { CardView } from "@/lib/game/types";

export const metadata = { title: "How to Play · Five-O Poker" };

const exampleHand: CardView[] = [
  { state: "card", card: { rank: 14, suit: "s" } },
  { state: "card", card: { rank: 14, suit: "h" } },
  { state: "card", card: { rank: 9, suit: "d" } },
  { state: "hidden" },
  { state: "card", card: { rank: 9, suit: "c" } },
];

export default function HowToPlayPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gold">How to play</h1>
        <Link href="/" className="text-sm text-white/60 underline">
          Back
        </Link>
      </header>

      <Step n={1} title="Build five hands at once">
        You and your opponent each build <b>5 poker hands</b> side by side. Every
        hand ends up with 5 cards.
        <div className="mt-3 flex items-end gap-2">
          <FannedColumn slots={exampleHand} size="md" />
          <span className="pb-1 text-xs text-white/60">
            One hand: two pair, aces & nines
          </span>
        </div>
      </Step>

      <Step n={2} title="Take turns placing cards">
        On your turn you’re dealt one card from a shared deck. You choose{" "}
        <b>which hand to add it to</b> — that’s the whole game. Each round, every
        hand gets exactly one new card.
      </Step>

      <Step n={3} title="Your 4th card is hidden">
        Cards 1–3 and 5 are face-up for both players to see. Your{" "}
        <b>4th card is face-down</b> (shown as{" "}
        <span className="text-rose-300">★</span>) and stays secret until the
        showdown — it’s the only hidden information in the game.
      </Step>

      <Step n={4} title="Win 3 of 5 hands">
        At the showdown all cards flip up. Each of your hands is compared to your
        opponent’s hand in the <b>same position</b>. Win <b>3 or more</b> of the
        5 to win the game. Win <b>all five</b> for a{" "}
        <span className="font-bold text-gold">Five-O</span>.
      </Step>

      <Step n={5} title="First to 5 wins the match">
        Keep playing games — the first player to 5 game wins takes the match. It
        all feeds your lifetime stats.
      </Step>

      <div className="panel">
        <h2 className="mb-2 font-bold text-gold">Hand rankings (high to low)</h2>
        <ol className="grid grid-cols-1 gap-1 text-sm text-white/80">
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
              <span className="w-4 text-white/40">{i + 1}.</span>
              {h}
            </li>
          ))}
        </ol>
      </div>

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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold font-black text-felt-900">
        {n}
      </div>
      <div>
        <h2 className="font-bold">{title}</h2>
        <div className="mt-1 text-sm leading-relaxed text-white/75">{children}</div>
      </div>
    </section>
  );
}
