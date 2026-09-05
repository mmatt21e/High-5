import type { Card } from "./cards";
import type { HandScore } from "./evaluator";

export const NUM_ROWS = 4; // face-up rows both players can see
export const CARDS_PER_HAND = 5;
export const HAND_SIZE = 5; // the concealed hand you hold
/** Row slots to fill before the board is complete (4 rows x 5 cards). */
export const ROW_SLOTS_TOTAL = NUM_ROWS * CARDS_PER_HAND;
/** Number of scored poker hands: the 4 rows plus the concealed hand. */
export const NUM_HANDS = NUM_ROWS + 1;

export type PlayerIndex = 0 | 1;

export interface PlayerState {
  userId: string;
  displayName: string;
  /** The four face-up rows, each holding up to five cards. */
  rows: Card[][];
  /** Concealed held cards (5 normally, 6 for the mover after drawing). */
  hand: Card[];
  /** Whether this player has used their one-time discard. */
  discardUsed: boolean;
}

export type GamePhase = "playing" | "complete";

export interface GameState {
  /** Remaining deck; the card at the end of the array is the "top". */
  deck: Card[];
  players: [PlayerState, PlayerState];
  /** Which player is to act next. */
  toMove: PlayerIndex;
  phase: GamePhase;
  result: GameResult | null;
}

export interface HandResult {
  /** 0..3 = the face-up rows; NUM_ROWS (4) = the concealed hand. */
  index: number;
  kind: "row" | "hand";
  winner: PlayerIndex | null; // null = tied
  scores: [HandScore, HandScore];
}

export interface GameResult {
  hands: HandResult[]; // length NUM_HANDS (5)
  handWins: [number, number];
  /** Overall winner, or null for a push (equal hand wins). */
  winner: PlayerIndex | null;
  /** True when the winner took all five hands. */
  isFiveO: boolean;
}

// ----- Redacted client-facing views -----

/** A card slot as seen by a particular player: revealed, hidden, or empty. */
export type CardView =
  | { state: "card"; card: Card }
  | { state: "hidden" } // concealed opponent card, not yet revealed
  | { state: "empty" };

export interface PlayerView {
  displayName: string;
  /** Four face-up rows, five slots each. */
  rows: CardView[][];
  /** Concealed hand: your own cards (revealed) or the opponent's (hidden). */
  hand: CardView[];
}

export interface GameView {
  phase: GamePhase;
  toMove: PlayerIndex;
  /** Your seat at this table. */
  you: PlayerIndex;
  /** Whether it is your turn to act. */
  yourTurn: boolean;
  players: [PlayerView, PlayerView];
  /** Rows (0..3) that can still receive a card, when it is your turn. */
  legalRows: number[];
  /** Whether you may still use your one-time discard this game. */
  canDiscard: boolean;
  /** Row cards placed by each seat (0..ROW_SLOTS_TOTAL). */
  placed: [number, number];
  /** Row cards each player places in total (ROW_SLOTS_TOTAL). */
  total: number;
  deckRemaining: number;
  result: GameResult | null;
}
