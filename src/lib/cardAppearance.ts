import type { Card } from "./game/cards";

/**
 * Fixed recognition geometry shared by every deck treatment. The explicit
 * horizontal rank + suit line stays inside every fan peek. Center artwork
 * starts below this protected strip, at every card size and in every deck.
 */
export const CARD_GEOMETRY = {
  sm: {
    box: "h-[62px] w-[44px]",
    hpx: 62,
    peek: 26,
    indexTop: 3,
    rankFont: 14,
    rankLine: 16,
    suitFont: 10,
    suitLine: 12,
    indexGap: 0,
    pip: "text-xl",
  },
  md: {
    box: "h-20 w-14",
    hpx: 80,
    peek: 32,
    indexTop: 3,
    rankFont: 17,
    rankLine: 19,
    suitFont: 12,
    suitLine: 14,
    indexGap: 1,
    pip: "text-3xl",
  },
  lg: {
    box: "h-[88px] w-[62px]",
    hpx: 88,
    peek: 36,
    indexTop: 3,
    rankFont: 19,
    rankLine: 21,
    suitFont: 13,
    suitLine: 15,
    indexGap: 1,
    pip: "text-[38px]",
  },
  hand: {
    box: "game-hand-card",
    hpx: 82,
    peek: 34,
    indexTop: 3,
    rankFont: 14,
    rankLine: 16,
    suitFont: 12,
    suitLine: 14,
    indexGap: 1,
    pip: "text-[clamp(25px,9vw,37px)]",
  },
} as const;

/** One numeric or court example for every suit in the live settings preview. */
export const APPEARANCE_PREVIEW_CARDS: readonly Card[] = [
  { rank: 14, suit: "s" },
  { rank: 12, suit: "h" },
  { rank: 9, suit: "d" },
  { rank: 5, suit: "c" },
] as const;
