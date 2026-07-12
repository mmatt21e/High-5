import type { Card } from "@/lib/game/cards";
import { RANK_LABEL, SUIT_LABEL } from "@/lib/game/cards";
import type { CardView } from "@/lib/game/types";

export type CardSize = "sm" | "md" | "lg";

// Per-size geometry. `hpx`/`peek` drive the fanned overlap; the rest are the
// corner rank, corner suit, and center pip font sizes. Suit colour comes from
// the `.suit-*` classes (see globals.css) which honour the deck-colour theme.
const SIZE = {
  sm: { box: "h-[62px] w-[44px]", hpx: 62, peek: 26, rank: "text-[13px]", suit: "text-[10px]", pip: "text-lg" },
  md: { box: "h-20 w-14", hpx: 80, peek: 32, rank: "text-base", suit: "text-xs", pip: "text-2xl" },
  lg: { box: "h-[88px] w-[62px]", hpx: 88, peek: 34, rank: "text-xl", suit: "text-sm", pip: "text-4xl" },
} as const;

export function CardFace({ card, size = "md" }: { card: Card; size?: CardSize }) {
  const s = SIZE[size];
  return (
    <div
      className={`${s.box} suit-${card.suit} relative overflow-hidden rounded-lg border border-black/15 bg-card shadow-sm`}
    >
      {/* Corner index — stays visible when cards are fanned. */}
      <div className="absolute left-1 top-0.5 flex flex-col items-center font-black leading-[0.9]">
        <span className={s.rank}>{RANK_LABEL[card.rank]}</span>
        <span className={s.suit}>{SUIT_LABEL[card.suit]}</span>
      </div>
      {/* Large center pip — shown on whichever card is fully visible. */}
      <div className={`flex h-full items-end justify-center pb-[8%] font-black ${s.pip}`}>
        {SUIT_LABEL[card.suit]}
      </div>
    </div>
  );
}

export function CardBack({ size = "md" }: { size?: CardSize }) {
  const s = SIZE[size];
  return (
    <div
      className={`${s.box} flex items-center justify-center rounded-lg border border-black/30 bg-gradient-to-br from-rose-800 to-rose-950 shadow-sm`}
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
      className={`${s.box} rounded-lg border border-dashed ${
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
 * A single hand: card slots fanned vertically so a full hand fits in a fraction
 * of the height while every card's corner index stays readable. `targetIndex`
 * marks the next empty slot to receive a card (when playable).
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
  const overlap = s.hpx - s.peek;
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
