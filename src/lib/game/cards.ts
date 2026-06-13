// Card primitives for Five-O Poker. A single standard 52-card deck is shared
// between both players, so cards are globally unique within a game.

export const SUITS = ["c", "d", "h", "s"] as const;
export type Suit = (typeof SUITS)[number]; // clubs, diamonds, hearts, spades

// Rank values: 2..14 (14 = Ace). Stored numerically to make comparison trivial.
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LABEL: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const SUIT_LABEL: Record<Suit, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** Stable string id for a card, e.g. "14s" for the ace of spades. */
export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/** Build a fresh, ordered 52-card deck. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle. Accepts an injectable random source so the engine can
 * be tested deterministically.
 */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deterministic mulberry32 PRNG. Seeding the deck server-side means a game can
 * be replayed/audited from its seed without storing every card.
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
