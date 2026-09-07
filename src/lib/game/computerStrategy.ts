import { buildDeck, cardId, shuffle, type Card } from "./cards";
import { compareHands, evaluateHand } from "./evaluator";
import type { CardView, GameView } from "./types";
import type { ComputerLevel } from "../computer";

export type ComputerMove =
  | { kind: "place"; cardId: string; row: number }
  | { kind: "discard"; cardId: string };

const revealed = (cards: CardView[]): Card[] => cards.flatMap((slot) => slot.state === "card" ? [slot.card] : []);

/** A cheap combination-building estimate, not a claim about poker odds. */
function potential(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const counts = new Map<number, number>();
  const suits = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }
  const groups = [...counts.values()].sort((a, b) => b - a);
  let value = cards.reduce((total, card) => total + card.rank / 50, 0);
  for (const count of groups) value += [0, 0, 4, 12, 32][count] ?? 32;
  if (groups[0] === 3 && groups[1] === 2) value += 14;
  if (groups[0] === 2 && groups[1] === 2) value += 2;
  if (suits.size === 1) value += cards.length * cards.length * 0.65;
  if (counts.size === cards.length) {
    const ranks = [...counts.keys()];
    if (counts.has(14)) ranks.push(1);
    let straight = 0;
    for (let low = 1; low <= 10; low++) {
      straight = Math.max(straight, ranks.filter((rank) => rank >= low && rank < low + 5).length);
    }
    if (straight === cards.length) value += straight * straight * 0.45;
  }
  if (cards.length === 5) {
    const score = evaluateHand(cards);
    value = [0, 0, 6, 10, 16, 22, 28, 38, 48, 60][score.category] + score.tiebreakers[0] / 15;
  }
  return value;
}

type Sample = { mine: Card[]; theirs: Card[] };
function equity(mine: Card[], theirs: Card[], samples: Sample[]): number {
  let wins = 0;
  for (const sample of samples) {
    const a = mine.concat(sample.mine.slice(0, 5 - mine.length));
    const b = theirs.concat(sample.theirs.slice(0, 5 - theirs.length));
    const comparison = compareHands(a, b);
    wins += comparison > 0 ? 1 : comparison === 0 ? 0.5 : 0;
  }
  return wins / samples.length;
}

/**
 * The strategy accepts ONLY the same redacted view a human in this seat gets.
 * It has no database, GameState, opponent hand, seed or future deck access.
 * Hard samples hypothetical completions from unseen cards, not actual draws.
 * Work is bounded: 64 samples and at most 24 placements + 6 discards per turn.
 */
export function chooseComputerMove(view: GameView, level: ComputerLevel, rng: () => number = Math.random): ComputerMove | null {
  if (view.phase !== "playing" || !view.yourTurn || view.legalRows.length === 0) return null;
  const own = view.players[view.you];
  const other = view.players[1 - view.you];
  const hand = revealed(own.hand);
  if (hand.length !== 6) throw new Error("Computer requires its six-card turn view");
  const rows = own.rows.map(revealed);
  const opponents = other.rows.map(revealed);
  // The middle opponent occasionally experiments, leaving room for the most
  // consistent level to be a distinct step up rather than only a slower one.
  if (level === "easy" || (level === "medium" && rng() < 0.12)) {
    return { kind: "place", cardId: cardId(hand[Math.floor(rng() * hand.length)]),
      row: view.legalRows[Math.floor(rng() * view.legalRows.length)] };
  }

  // Exclude all visible cards, including the computer's entire current hand.
  // Unknown cards may include prior concealed discards: their identities are
  // not available in GameView and must never be read from private game state.
  const known = new Set([...hand, ...rows.flat(), ...opponents.flat()].map(cardId));
  const unseen = buildDeck().filter((card) => !known.has(cardId(card)));
  const samples: Sample[] = level === "hard" ? Array.from({ length: 64 }, () => {
    const pool = shuffle(unseen, rng);
    // Fill from opposite ends: unknown slots remain disjoint even with a
    // small late-game pool, and the opponent samples stay fixed per candidate.
    return { mine: pool, theirs: [...pool].reverse() };
  }) : [];
  const baseline = rows.map((row, index) => level === "hard"
    ? equity(row, opponents[index], samples) : potential(row));

  let best: ComputerMove | null = null;
  let bestValue = -Infinity;
  // Stable ordering avoids making the strongest level randomly miss an exact
  // late-game win. Randomness is confined to unseen-card estimates.
  for (const card of hand) {
    const kept = hand.filter((item) => cardId(item) !== cardId(card));
    const heldValue = level === "hard"
      ? equity(kept, [], samples) * 0.3 + potential(kept) * 0.028
      : potential(kept) * 0.35;
    for (const row of view.legalRows) {
      const placed = rows[row].concat(card);
      const value = level === "hard"
        ? equity(placed, opponents[row], samples) - baseline[row] + heldValue
          + (potential(placed) - potential(rows[row])) * 0.08
        : potential(placed) - baseline[row] + heldValue;
      if (value > bestValue) { bestValue = value; best = { kind: "place", cardId: cardId(card), row }; }
    }
    // A discard keeps the rows unchanged and costs a turn; only the strongest
    // opponent considers it when every placement is sufficiently damaging.
    if (level === "hard" && view.canDiscard && heldValue - 0.18 > bestValue) {
      bestValue = heldValue - 0.18;
      best = { kind: "discard", cardId: cardId(card) };
    }
  }
  return best;
}
