import type { Card } from "./cards";
import type { HandScore } from "./evaluator";

export const NUM_COLUMNS = 5;
export const CARDS_PER_HAND = 5;
export const NUM_ROUNDS = 5;
/** Zero-based round index whose card is dealt face-down (the 4th card). */
export const FACE_DOWN_ROUND = 3;

export type PlayerIndex = 0 | 1;

export interface PlayerState {
  userId: string;
  displayName: string;
  /** Five columns, each holding up to five cards in placement order. */
  columns: Card[][];
}

export type GamePhase = "playing" | "complete";

export interface GameState {
  /** Remaining deck; the card at the end of the array is the "top". */
  deck: Card[];
  players: [PlayerState, PlayerState];
  /** Current round, 0-based (0..4). Equals NUM_ROUNDS when complete. */
  round: number;
  /** Number of cards each player has placed in the current round. */
  placedThisRound: [number, number];
  /** Which player is to act next. */
  toMove: PlayerIndex;
  /** The card dealt to the player to move, awaiting placement. */
  pending: Card | null;
  phase: GamePhase;
  result: GameResult | null;
}

export interface ColumnResult {
  column: number;
  winner: PlayerIndex | null; // null = tied column
  scores: [HandScore, HandScore];
}

export interface GameResult {
  columns: ColumnResult[];
  columnWins: [number, number];
  /** Overall game winner, or null for a push (equal column wins). */
  winner: PlayerIndex | null;
  /** True when the winner took all five columns. */
  isFiveO: boolean;
}

// ----- Redacted client-facing views -----

/** A card slot as seen by a particular player: revealed, hidden, or empty. */
export type CardView =
  | { state: "card"; card: Card }
  | { state: "hidden" } // face-down opponent card, not yet revealed
  | { state: "empty" };

export interface PlayerView {
  userId: string;
  displayName: string;
  columns: CardView[][];
}

export interface GameView {
  round: number; // 0-based, NUM_ROUNDS when complete
  phase: GamePhase;
  toMove: PlayerIndex;
  /** Your seat at this table. */
  you: PlayerIndex;
  /** Whether it is your turn to place a card. */
  yourTurn: boolean;
  /** The card you have drawn and must place (only present on your turn). */
  pending: Card | null;
  /** Columns in your board that can legally receive the pending card. */
  legalColumns: number[];
  players: [PlayerView, PlayerView];
  deckRemaining: number;
  result: GameResult | null;
}
