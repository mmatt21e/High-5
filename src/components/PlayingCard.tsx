import type { Card } from "@/lib/game/cards";
import { RANK_LABEL, SUIT_LABEL } from "@/lib/game/cards";
import type { CardView } from "@/lib/game/types";

const sizes = {
  sm: "h-12 w-9 text-sm",
  md: "h-16 w-12 text-lg",
  lg: "h-20 w-14 text-xl",
} as const;

export function CardFace({
  card,
  size = "md",
  dim = false,
}: {
  card: Card;
  size?: keyof typeof sizes;
  dim?: boolean;
}) {
  const red = card.suit === "h" || card.suit === "d";
  return (
    <div
      className={`${sizes[size]} flex flex-col items-center justify-center rounded-md border border-black/10 bg-card font-bold leading-none shadow ${
        dim ? "opacity-60" : ""
      }`}
    >
      <span className={red ? "text-red-600" : "text-neutral-900"}>
        {RANK_LABEL[card.rank]}
      </span>
      <span className={red ? "text-red-600" : "text-neutral-900"}>
        {SUIT_LABEL[card.suit]}
      </span>
    </div>
  );
}

export function CardBack({ size = "md" }: { size?: keyof typeof sizes }) {
  return (
    <div
      className={`${sizes[size]} flex items-center justify-center rounded-md border border-black/30 bg-gradient-to-br from-rose-800 to-rose-950 shadow`}
    >
      <span className="text-lg text-rose-300/70">★</span>
    </div>
  );
}

export function EmptySlot({ size = "md" }: { size?: keyof typeof sizes }) {
  return (
    <div
      className={`${sizes[size]} rounded-md border border-dashed border-white/20 bg-black/10`}
    />
  );
}

export function CardSlot({
  slot,
  size = "md",
}: {
  slot: CardView;
  size?: keyof typeof sizes;
}) {
  if (slot.state === "card") return <CardFace card={slot.card} size={size} />;
  if (slot.state === "hidden") return <CardBack size={size} />;
  return <EmptySlot size={size} />;
}
