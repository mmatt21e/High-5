import type { CSSProperties } from "react";
import type { Card } from "@/lib/game/cards";
import { RANK_LABEL, SUIT_LABEL } from "@/lib/game/cards";
import type { CardView } from "@/lib/game/types";
import { CARD_GEOMETRY } from "@/lib/cardAppearance";

export type CardSize = "sm" | "md" | "lg" | "hand";

const SIZE = CARD_GEOMETRY;

const SUIT_NAMES: Record<Card["suit"], string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

type PipSpot = readonly [x: number, y: number];

// Original code-native layouts follow familiar mirrored card structure. Court
// cues below are abstract geometry rather than copied commercial artwork.
const PIP_LAYOUTS: Partial<Record<Card["rank"], readonly PipSpot[]>> = {
  2: [[50, 22], [50, 78]],
  3: [[50, 20], [50, 50], [50, 80]],
  4: [[31, 22], [69, 22], [31, 78], [69, 78]],
  5: [[31, 21], [69, 21], [50, 50], [31, 79], [69, 79]],
  6: [[31, 20], [69, 20], [31, 50], [69, 50], [31, 80], [69, 80]],
  7: [[31, 18], [69, 18], [50, 35], [31, 50], [69, 50], [31, 82], [69, 82]],
  8: [[31, 17], [69, 17], [50, 33], [31, 50], [69, 50], [50, 67], [31, 83], [69, 83]],
  9: [[31, 16], [69, 16], [31, 38], [69, 38], [50, 50], [31, 62], [69, 62], [31, 84], [69, 84]],
  10: [[31, 14], [69, 14], [50, 29], [31, 39], [69, 39], [31, 61], [69, 61], [50, 71], [31, 86], [69, 86]],
};

export function describePlayingCard(card: Card): string {
  const ranks: Record<number, string> = {
    11: "Jack",
    12: "Queen",
    13: "King",
    14: "Ace",
  };
  return `${ranks[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}`;
}

export function CardFace({
  card,
  size = "md",
  decorative = false,
}: {
  card: Card;
  size?: CardSize;
  decorative?: boolean;
}) {
  const sizing = SIZE[size];
  const suit = `${SUIT_LABEL[card.suit]}\uFE0E`;
  const isCourt = card.rank >= 11 && card.rank <= 13;
  const pips = PIP_LAYOUTS[card.rank] ?? [];
  const faceKind = isCourt ? "court" : card.rank === 14 ? "ace" : "number";

  return (
    <div
      className={`${sizing.box} playing-card playing-card-face suit-${card.suit} relative overflow-hidden`}
      data-card-size={size}
      data-rank={card.rank}
      data-suit={card.suit}
      data-face-kind={faceKind}
      style={
        {
          "--card-index-top": `${sizing.indexTop}px`,
          "--card-index-rank-size": `${sizing.rankFont}px`,
          "--card-index-rank-line": `${sizing.rankLine}px`,
          "--card-index-suit-size": `${sizing.suitFont}px`,
          "--card-index-suit-line": `${sizing.suitLine}px`,
          "--card-index-gap": `${sizing.indexGap}px`,
        } as CSSProperties
      }
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : describePlayingCard(card)}
      aria-hidden={decorative || undefined}
    >
      <div aria-hidden="true" className="playing-card-index playing-card-index-top">
        <span className="playing-card-rank">{RANK_LABEL[card.rank]}</span>
        <span className="playing-card-suit">{suit}</span>
      </div>
      <div aria-hidden="true" className="playing-card-index playing-card-index-bottom">
        <span className="playing-card-rank">{RANK_LABEL[card.rank]}</span>
        <span className="playing-card-suit">{suit}</span>
      </div>

      <div aria-hidden="true" className="playing-card-pips">
        {pips.map(([x, y], index) => (
          <span
            className="playing-card-pip"
            key={`${x}-${y}-${index}`}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--pip-turn": y > 50 ? "180deg" : "0deg",
              } as CSSProperties
            }
          >
            {suit}
          </span>
        ))}
      </div>

      <div aria-hidden="true" className={`playing-card-center flex h-full items-center justify-center font-black ${sizing.pip}`}>
        {suit}
      </div>

      {isCourt && (
        <div aria-hidden="true" className="playing-card-court">
          <span className="court-crown"><i /><i /><i /></span>
          <span className="court-rank">{RANK_LABEL[card.rank]}</span>
          <span className="court-suit">{suit}</span>
          <span className="court-rule court-rule-top" />
          <span className="court-rule court-rule-bottom" />
        </div>
      )}

      <div aria-hidden="true" className="playing-card-mobile-id">
        <span>{RANK_LABEL[card.rank]}</span>
        <span>{suit}</span>
      </div>

      <div aria-hidden="true" className="playing-card-ornament">
        <i /><i /><i /><i />
      </div>
    </div>
  );
}

export function CardBack({
  size = "md",
  decorative = false,
}: {
  size?: CardSize;
  decorative?: boolean;
}) {
  const sizing = SIZE[size];
  return (
    <div
      className={`${sizing.box} playing-card playing-card-back`}
      data-card-size={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Face-down card"}
      aria-hidden={decorative || undefined}
    >
      <span aria-hidden="true" className="playing-card-back-mark">5O</span>
    </div>
  );
}

export function EmptySlot({
  size = "md",
  target = false,
}: {
  size?: CardSize;
  target?: boolean;
}) {
  const sizing = SIZE[size];
  return (
    <div
      aria-hidden="true"
      className={`${sizing.box} playing-card-slot rounded-lg border border-dashed ${
        target ? "border-gold/70 bg-gold/10" : "border-white/15 bg-black/10"
      }`}
      data-card-size={size}
    />
  );
}

export function CardSlot({
  slot,
  size = "md",
  target = false,
  decorative = false,
}: {
  slot: CardView;
  size?: CardSize;
  target?: boolean;
  decorative?: boolean;
}) {
  if (slot.state === "card") {
    return <CardFace card={slot.card} size={size} decorative={decorative} />;
  }
  if (slot.state === "hidden") {
    return <CardBack size={size} decorative={decorative} />;
  }
  return <EmptySlot size={size} target={target} />;
}

/** A five-card row fanned vertically with its next available target marked. */
export function FannedColumn({
  slots,
  size = "md",
  targetIndex = null,
  decorative = false,
}: {
  slots: CardView[];
  size?: CardSize;
  targetIndex?: number | null;
  decorative?: boolean;
}) {
  const sizing = SIZE[size];
  const overlap = sizing.hpx - sizing.peek;
  return (
    <div className="flex flex-col items-center">
      {slots.map((slot, index) => (
        <div
          key={index}
          style={{ marginTop: index === 0 ? 0 : -overlap, zIndex: index }}
          className="relative"
        >
          <CardSlot
            slot={slot}
            size={size}
            target={targetIndex === index}
            decorative={decorative}
          />
        </div>
      ))}
    </div>
  );
}
