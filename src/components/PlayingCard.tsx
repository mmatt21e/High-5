import type { Card } from "@/lib/game/cards";
import { RANK_LABEL, SUIT_LABEL } from "@/lib/game/cards";
import type { CardView } from "@/lib/game/types";

export type CardSize = "sm" | "md" | "lg";

// Per-size geometry. `peek` is how many px of a card show when it is fanned
// under the next one — enough to read the corner index.
const SIZE = {
  sm: { box: "h-14 w-10", hpx: 56, corner: "text-[10px]", pip: "text-lg", peek: 20 },
  md: { box: "h-16 w-12", hpx: 64, corner: "text-xs", pip: "text-2xl", peek: 24 },
  lg: { box: "h-24 w-16", hpx: 96, corner: "text-sm", pip: "text-4xl", peek: 34 },
} as const;

function suitColor(suit: Card["suit"]) {
  return suit === "h" || suit === "d" ? "text-red-600" : "text-neutral-900";
}

export function CardFace({ card, size = "md" }: { card: Card; size?: CardSize }) {
  const s = SIZE[size];
  const color = suitColor(card.suit);
  return (
    <div
      className={`${s.box} relative overflow-hidden rounded-md border border-black/10 bg-card shadow-sm`}
    >
      {/* Corner index — stays visible when cards are fanned. */}
      <div
        className={`absolute left-1 top-0.5 flex flex-col items-center font-bold leading-none ${s.corner} ${color}`}
      >
        <span>{RANK_LABEL[card.rank]}</span>
        <span>{SUIT_LABEL[card.suit]}</span>
      </div>
      {/* Center pip — shown on whichever card is fully visible (the top one). */}
      <div className={`flex h-full items-center justify-center ${s.pip} ${color}`}>
        {SUIT_LABEL[card.suit]}
      </div>
    </div>
  );
}

export function CardBack({ size = "md" }: { size?: CardSize }) {
  const s = SIZE[size];
  return (
    <div
      className={`${s.box} flex items-center justify-center rounded-md border border-black/30 bg-gradient-to-br from-rose-800 to-rose-950 shadow-sm`}
    >
      <span className="text-rose-300/60">★</span>
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
  const s = SIZE[size];
  return (
    <div
      className={`${s.box} rounded-md border border-dashed ${
        target ? "border-gold/70 bg-gold/10" : "border-white/15 bg-black/10"
      }`}
    />
  );
}

export function CardSlot({
  slot,
  size = "md",
  target = false,
}: {
  slot: CardView;
  size?: CardSize;
  target?: boolean;
}) {
  if (slot.state === "card") return <CardFace card={slot.card} size={size} />;
  if (slot.state === "hidden") return <CardBack size={size} />;
  return <EmptySlot size={size} target={target} />;
}

/**
 * A single hand: five card slots fanned vertically so a full column fits in a
 * fraction of the height while every card's corner index stays readable.
 * `targetIndex` marks the next empty slot to receive a card (when playable).
 */
export function FannedColumn({
  slots,
  size = "md",
  targetIndex = null,
}: {
  slots: CardView[];
  size?: CardSize;
  targetIndex?: number | null;
}) {
  const s = SIZE[size];
  const overlap = s.hpx - s.peek; // px each fanned card slides under the next
  return (
    <div className="flex flex-col items-center">
      {slots.map((slot, i) => (
        <div
          key={i}
          style={{ marginTop: i === 0 ? 0 : -overlap, zIndex: i }}
          className="relative"
        >
          <CardSlot slot={slot} size={size} target={targetIndex === i} />
        </div>
      ))}
    </div>
  );
}
