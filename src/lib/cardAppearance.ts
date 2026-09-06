import type { Card } from "./game/cards";

/**
 * Fixed recognition geometry shared by every deck treatment. The explicit
 * line boxes keep the complete rank + suit index inside every fan peek.
 */
export const CARD_GEOMETRY = {
  sm: {
    box: "h-[62px] w-[44px]",
    hpx: 62,
    peek: 26,
    indexTop: 2,
    rankFont: 14,
    rankLine: 13,
    suitFont: 10,
    suitLine: 9,
    indexGap: 0,
    pip: "text-xl",
  },
  md: {
    box: "h-20 w-14",
    hpx: 80,
    peek: 32,
    indexTop: 2,
    rankFont: 17,
    rankLine: 15,
    suitFont: 12,
    suitLine: 10,
    indexGap: 1,
    pip: "text-3xl",
  },
  lg: {
    box: "h-[88px] w-[62px]",
    hpx: 88,
    peek: 36,
    indexTop: 2,
    rankFont: 19,
    rankLine: 17,
    suitFont: 13,
    suitLine: 11,
    indexGap: 1,
    pip: "text-[38px]",
  },
  hand: {
    box: "game-hand-card",
    hpx: 82,
    peek: 34,
    indexTop: 2,
    rankFont: 17,
    rankLine: 15,
    suitFont: 12,
    suitLine: 10,
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
