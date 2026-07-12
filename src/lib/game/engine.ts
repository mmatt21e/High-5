// Five-O Poker engine: a pure, deterministic state machine.
//
// Rules implemented:
//  - Two players, one shared shuffled 52-card deck.
//  - Each player builds 4 face-up rows (5 cards each) that the opponent can see,
//    and holds a concealed 5-card hand the opponent cannot see. Those five hands
//    (4 rows + the concealed hand) are what get scored.
//  - Each player is dealt a concealed hand of 5 cards to start.
//  - On your turn: draw one card into your hand (now holding 6), then either
//      * place one held card (the drawn card or a starting card) into one of your
//        four rows that still has room, or
//      * discard one held card (allowed once per game).
//    Either way you keep 5 cards concealed.
//  - The board is complete when both players have filled all four rows (20 cards
//    each). Whatever 5 cards remain in hand are revealed as the concealed hand.
//  - At showdown each row and the concealed hand are compared head-to-head with
//    the opponent's; winning 3+ of the five wins the game. All five is a "Five-O".

import { type Card, buildDeck, cardId, shuffle, seededRng } from "./cards";
import { compareScores, evaluateHand } from "./evaluator";
import {
  CARDS_PER_HAND,
  HAND_SIZE,
  NUM_ROWS,
  ROW_SLOTS_TOTAL,
  type GameResult,
  type GameState,
  type GameView,
  type HandResult,
  type PlayerIndex,
  type PlayerState,
  type PlayerView,
  type CardView,
} from "./types";

export interface NewGameOptions {
  seed?: number;
  /** Which player places the first card of the game. Default 0. */
  firstLead?: PlayerIndex;
}

function emptyRows(): Card[][] {
  return Array.from({ length: NUM_ROWS }, () => []);
}

/** Total cards a player has placed into rows so far. */
function rowCount(state: GameState, player: PlayerIndex): number {
  return state.players[player].rows.reduce((n, r) => n + r.length, 0);
}

/** A player is done once all four of their rows are full. */
function isDone(state: GameState, player: PlayerIndex): boolean {
  return rowCount(state, player) === ROW_SLOTS_TOTAL;
}

export function createGame(
  playerA: { userId: string; displayName: string },
  playerB: { userId: string; displayName: string },
  opts: NewGameOptions = {},
): GameState {
  const rng = opts.seed !== undefined ? seededRng(opts.seed) : Math.random;
  const firstLead = opts.firstLead ?? 0;
  const deck = shuffle(buildDeck(), rng);

  const draw5 = (): Card[] => Array.from({ length: HAND_SIZE }, () => deck.pop()!);
  const players: [PlayerState, PlayerState] = [
    { userId: playerA.userId, displayName: playerA.displayName, rows: emptyRows(), hand: draw5(), discardUsed: false },
    { userId: playerB.userId, displayName: playerB.displayName, rows: emptyRows(), hand: draw5(), discardUsed: false },
  ];

  const state: GameState = {
    deck,
    players,
    toMove: firstLead,
    phase: "playing",
    result: null,
  };

  drawForMover(state);
  return state;
}

/** Deal one card into the hand of the player to move (start of their turn). */
function drawForMover(state: GameState): void {
  if (state.phase !== "playing") return;
  if (state.deck.length === 0) return; // exact-fit safety; never expected
  state.players[state.toMove].hand.push(state.deck.pop()!);
}

/** Rows the player to move may legally place into — any that still has room. */
export function legalRows(state: GameState): number[] {
  if (state.phase !== "playing") return [];
  const rows = state.players[state.toMove].rows;
  const out: number[] = [];
  for (let i = 0; i < NUM_ROWS; i++) {
    if (rows[i].length < CARDS_PER_HAND) out.push(i);
  }
  return out;
}

export class IllegalMoveError extends Error {}

function handIndexOf(player: PlayerState, id: string): number {
  return player.hand.findIndex((c) => cardId(c) === id);
}

/**
 * Place a held card (identified by its card id, e.g. "14s") into `row` and
 * advance the turn. Mutates and returns the same state object.
 */
export function placeCard(
  state: GameState,
  player: PlayerIndex,
  id: string,
  row: number,
): GameState {
  if (state.phase !== "playing") throw new IllegalMoveError("Game is not in progress");
  if (player !== state.toMove) throw new IllegalMoveError("Not your turn");
  if (row < 0 || row >= NUM_ROWS) throw new IllegalMoveError("No such row");

  const p = state.players[player];
  if (p.rows[row].length >= CARDS_PER_HAND) {
    throw new IllegalMoveError("That row is already full");
  }
  const idx = handIndexOf(p, id);
  if (idx < 0) throw new IllegalMoveError("You are not holding that card");

  const [card] = p.hand.splice(idx, 1);
  p.rows[row].push(card);
  advanceTurn(state);
  return state;
}

/**
 * Discard a held card (allowed once per game) instead of placing it, then
 * advance the turn.
 */
export function discardCard(
  state: GameState,
  player: PlayerIndex,
  id: string,
): GameState {
  if (state.phase !== "playing") throw new IllegalMoveError("Game is not in progress");
  if (player !== state.toMove) throw new IllegalMoveError("Not your turn");

  const p = state.players[player];
  if (p.discardUsed) throw new IllegalMoveError("You have already used your discard");
  const idx = handIndexOf(p, id);
  if (idx < 0) throw new IllegalMoveError("You are not holding that card");

  p.hand.splice(idx, 1);
  p.discardUsed = true;
  advanceTurn(state);
  return state;
}

function advanceTurn(state: GameState): void {
  if (isDone(state, 0) && isDone(state, 1)) {
    finishGame(state);
    return;
  }
  const other = (1 - state.toMove) as PlayerIndex;
  // Switch to the other player unless they are already done, in which case the
  // current player keeps going until they finish too.
  if (!isDone(state, other)) state.toMove = other;
  drawForMover(state);
}

function finishGame(state: GameState): void {
  state.phase = "complete";
  state.result = evaluateGame(state);
}

/** Compare all five hands (four rows + the concealed hand). */
export function evaluateGame(state: GameState): GameResult {
  const hands: HandResult[] = [];
  const handWins: [number, number] = [0, 0];

  const compareAt = (
    index: number,
    kind: HandResult["kind"],
    a: Card[],
    b: Card[],
  ) => {
    const scoreA = evaluateHand(a);
    const scoreB = evaluateHand(b);
    const c = compareScores(scoreA, scoreB);
    let winner: PlayerIndex | null = null;
    if (c > 0) {
      winner = 0;
      handWins[0]++;
    } else if (c < 0) {
      winner = 1;
      handWins[1]++;
    }
    hands.push({ index, kind, winner, scores: [scoreA, scoreB] });
  };

  for (let i = 0; i < NUM_ROWS; i++) {
    compareAt(i, "row", state.players[0].rows[i], state.players[1].rows[i]);
  }
  compareAt(NUM_ROWS, "hand", state.players[0].hand, state.players[1].hand);

  let winner: PlayerIndex | null = null;
  if (handWins[0] > handWins[1]) winner = 0;
  else if (handWins[1] > handWins[0]) winner = 1;

  const isFiveO = winner !== null && handWins[winner] === hands.length;
  return { hands, handWins, winner, isFiveO };
}

// ----- Redaction: build the per-player view -----

function rowsView(rows: Card[][]): CardView[][] {
  return rows.map((row) => {
    const slots: CardView[] = [];
    for (let i = 0; i < CARDS_PER_HAND; i++) {
      slots.push(i < row.length ? { state: "card", card: row[i] } : { state: "empty" });
    }
    return slots;
  });
}

function handView(hand: Card[], reveal: boolean): CardView[] {
  return hand.map((c) => (reveal ? { state: "card", card: c } : { state: "hidden" }));
}

function viewPlayer(
  player: PlayerState,
  isSelf: boolean,
  revealAll: boolean,
): PlayerView {
  return {
    userId: player.userId,
    displayName: player.displayName,
    rows: rowsView(player.rows),
    hand: handView(player.hand, isSelf || revealAll),
  };
}

/** Produce the redacted game view for a given seat. */
export function viewFor(state: GameState, you: PlayerIndex): GameView {
  const revealAll = state.phase === "complete";
  const yourTurn = state.phase === "playing" && state.toMove === you;
  const players: [PlayerView, PlayerView] = [
    viewPlayer(state.players[0], you === 0, revealAll),
    viewPlayer(state.players[1], you === 1, revealAll),
  ];
  return {
    phase: state.phase,
    toMove: state.toMove,
    you,
    yourTurn,
    players,
    legalRows: yourTurn ? legalRows(state) : [],
    canDiscard: yourTurn && !state.players[you].discardUsed,
    placed: [rowCount(state, 0), rowCount(state, 1)],
    total: ROW_SLOTS_TOTAL,
    deckRemaining: state.deck.length,
    result: state.result,
  };
}

/** Index of a player's seat by userId, or -1 if not seated. */
export function seatOf(state: GameState, userId: string): PlayerIndex | -1 {
  if (state.players[0].userId === userId) return 0;
  if (state.players[1].userId === userId) return 1;
  return -1;
}
