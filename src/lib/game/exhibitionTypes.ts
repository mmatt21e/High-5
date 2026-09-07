import type { Card } from "./cards";

export const TRICKS = {
  switcheroo: { title: "The Switcheroo", description: "Edge swaps two cards between its unfinished rows." },
  sleeve: { title: "Ace Up the Sleeve", description: "Edge trades its lowest held card for an ace from the remaining deck." },
  marked: { title: "Marked Cards", description: "Edge peeks at your hand for this move. You receive a redraw in return." },
  rethink: { title: "Second Thoughts", description: "Edge moves its last card to another unfinished row." },
  caught: { title: "Caught Cheating?", description: "A suspicious sleeve! Challenge for free: catch a real cheat to cancel it and earn a redraw. A wrong call gives Edge a redraw." },
  deal: { title: "Deal with the Devil", description: "Accept to see two deck cards and trade a held card for one. Edge gets a row swap in return. Decline for no cost." },
  shared: { title: "Shared Chaos", description: "You both receive the same power: a redraw or a swap between unfinished rows." },
  gift: { title: "Lucky Break", description: "A gift for you: one extra redraw. No strings, for once." },
} as const;
export type Trick = keyof typeof TRICKS;
export interface ExhibitionPending {
  kind: Trick;
  /** Server-only bluff outcome; never serialized into a client view. */
  cheating?: boolean;
  power?: "redraw" | "swap";
  offers?: Card[];
}
export interface ExhibitionState {
  sessionId: string;
  revision: number;
  botTurns: number;
  preparedTurn: number;
  remaining: Trick[];
  lowRow: number;
  playFair: number;
  redraws: number;
  swaps: number;
  peekNext: boolean;
  tricksUsed: number;
  log: string[];
  pending: ExhibitionPending | null;
}
export interface ExhibitionView {
  token: string;
  lowRow: number;
  playFair: number;
  redraws: number;
  swaps: number;
  tricksUsed: number;
  log: string[];
  pending: { kind: Trick; power?: "redraw" | "swap"; offers?: Card[] } | null;
}
export interface ExhibitionAction {
  token: string;
  action: "allow" | "block" | "challenge" | "accept" | "decline" | "choose" | "redraw" | "swap" | "restart";
  cardId?: string;
  otherCardId?: string;
  offerIndex?: number;
}
