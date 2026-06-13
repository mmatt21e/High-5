// Standard 5-card poker hand evaluation with full kicker tie-breaking.
//
// A hand is scored into a comparable tuple: [category, ...tiebreakers].
// Comparing two scores lexicographically yields the correct poker ordering.

import type { Card, Rank } from "./cards";

export enum HandCategory {
  HighCard = 1,
  Pair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
}

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.Pair]: "Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.ThreeOfAKind]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.FourOfAKind]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
};

export interface HandScore {
  category: HandCategory;
  /** Tiebreakers ordered most-significant first; compared lexicographically. */
  tiebreakers: number[];
  label: string;
}

/**
 * Detect a straight. Returns the high-card rank of the straight, or null.
 * Handles the wheel (A-2-3-4-5) where the ace plays low and the high card is 5.
 */
function straightHigh(sortedDesc: Rank[]): number | null {
  const ranks = Array.from(new Set(sortedDesc));
  if (ranks.length !== 5) return null;

  // Normal straight: consecutive descending run of 5.
  if (ranks[0] - ranks[4] === 4) return ranks[0];

  // Wheel: A,5,4,3,2 -> treat ace as low, high card is 5.
  if (
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  ) {
    return 5;
  }
  return null;
}

/** Evaluate exactly five cards into a comparable HandScore. */
export function evaluateHand(cards: Card[]): HandScore {
  if (cards.length !== 5) {
    throw new Error(`evaluateHand expects 5 cards, got ${cards.length}`);
  }

  const ranksDesc = cards.map((c) => c.rank).sort((a, b) => b - a) as Rank[];
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const high = straightHigh(ranksDesc);
  const isStraight = high !== null;

  // Group by rank -> counts, then order groups by (count desc, rank desc).
  const counts = new Map<Rank, number>();
  for (const r of ranksDesc) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // by count
    return b[0] - a[0]; // then by rank
  });
  const shape = groups.map((g) => g[1]).join(""); // e.g. "32" = full house
  const groupRanks = groups.map((g) => g[0]);

  const make = (category: HandCategory, tiebreakers: number[]): HandScore => ({
    category,
    tiebreakers,
    label: CATEGORY_LABEL[category],
  });

  if (isStraight && isFlush) return make(HandCategory.StraightFlush, [high!]);
  if (shape === "41") return make(HandCategory.FourOfAKind, groupRanks);
  if (shape === "32") return make(HandCategory.FullHouse, groupRanks);
  if (isFlush) return make(HandCategory.Flush, ranksDesc);
  if (isStraight) return make(HandCategory.Straight, [high!]);
  if (shape === "311") return make(HandCategory.ThreeOfAKind, groupRanks);
  if (shape === "221") return make(HandCategory.TwoPair, groupRanks);
  if (shape === "2111") return make(HandCategory.Pair, groupRanks);
  return make(HandCategory.HighCard, ranksDesc);
}

/**
 * Compare two hand scores.
 * Returns >0 if a beats b, <0 if b beats a, 0 if they tie exactly.
 */
export function compareScores(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Convenience: compare two raw 5-card hands. */
export function compareHands(a: Card[], b: Card[]): number {
  return compareScores(evaluateHand(a), evaluateHand(b));
}
