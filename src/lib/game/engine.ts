// Five-O Poker engine: a pure, deterministic state machine.
//
// Rules implemented:
//  - Two players, one shared shuffled 52-card deck.
//  - Each player builds 5 hands (columns) of 5 cards => 50 cards dealt total.
//  - Players alternate one card at a time. On your turn the engine deals you
//    the top card; you choose ANY of your hands that still has room (fewer than
//    5 cards) to place it in. Placement is the only decision.
//  - The 4th card placed into each hand is face-down (hidden from the opponent
//    until showdown); all other cards are face-up.
//  - At showdown, each hand is compared head-to-head with the opponent's hand
//    in the same position; winning 3+ hands wins the game. All five is a
//    "Five-O".

import { type Card, buildDeck, shuffle, seededRng } from "./cards";
import { compareScores, evaluateHand } from "./evaluator";
import {
  CARDS_PER_HAND,
  CARDS_TOTAL,
  FACE_DOWN_INDEX,
  type GameResult,
  type GameState,
  type GameView,
  type PlayerIndex,
  type PlayerState,
  type PlayerView,
  type CardView,
  NUM_COLUMNS,
} from "./types";

export interface NewGameOptions {
  seed?: number;
  /** Which player places the first card of the game. Default 0. */
  firstLead?: PlayerIndex;
}

function emptyColumns(): Card[][] {
  return Array.from({ length: NUM_COLUMNS }, () => []);
}

/** Total cards a player has placed so far (across all five hands). */
function placedCount(state: GameState, player: PlayerIndex): number {
  return state.players[player].columns.reduce((n, c) => n + c.length, 0);
}

export function createGame(
  playerA: { userId: string; displayName: string },
  playerB: { userId: string; displayName: string },
  opts: NewGameOptions = {},
): GameState {
  const rng = opts.seed !== undefined ? seededRng(opts.seed) : Math.random;
  const firstLead = opts.firstLead ?? 0;
  const deck = shuffle(buildDeck(), rng);

  const players: [PlayerState, PlayerState] = [
    { userId: playerA.userId, displayName: playerA.displayName, columns: emptyColumns() },
    { userId: playerB.userId, displayName: playerB.displayName, columns: emptyColumns() },
  ];

  const state: GameState = {
    deck,
    players,
    toMove: firstLead,
    pending: null,
    phase: "playing",
    result: null,
  };

  drawForCurrent(state);
  return state;
}

/** Deal the top card from the deck to the player to move. */
function drawForCurrent(state: GameState): void {
  if (state.phase !== "playing") return;
  if (state.pending) return;
  const card = state.deck.pop();
  if (!card) throw new Error("Deck exhausted unexpectedly");
  state.pending = card;
}

/** Hands the player to move may legally place into — any that still has room. */
export function legalColumns(state: GameState): number[] {
  if (state.phase !== "playing") return [];
  const cols = state.players[state.toMove].columns;
  const out: number[] = [];
  for (let i = 0; i < NUM_COLUMNS; i++) {
    if (cols[i].length < CARDS_PER_HAND) out.push(i);
  }
  return out;
}

export class IllegalMoveError extends Error {}

/**
 * Place the pending card into `column` for the player to move and advance the
 * turn. Mutates and returns the same state object.
 */
export function placeCard(
  state: GameState,
  player: PlayerIndex,
  column: number,
): GameState {
  if (state.phase !== "playing") throw new IllegalMoveError("Game is not in progress");
  if (player !== state.toMove) throw new IllegalMoveError("Not your turn");
  if (!state.pending) throw new IllegalMoveError("No card to place");
  if (column < 0 || column >= NUM_COLUMNS) {
    throw new IllegalMoveError("No such hand");
  }
  if (state.players[player].columns[column].length >= CARDS_PER_HAND) {
    throw new IllegalMoveError("That hand is already full");
  }

  state.players[player].columns[column].push(state.pending);
  state.pending = null;

  advanceTurn(state);
  return state;
}

function advanceTurn(state: GameState): void {
  if (
    placedCount(state, 0) === CARDS_TOTAL &&
    placedCount(state, 1) === CARDS_TOTAL
  ) {
    finishGame(state);
    return;
  }
  state.toMove = (1 - state.toMove) as PlayerIndex;
  drawForCurrent(state);
}

function finishGame(state: GameState): void {
  state.phase = "complete";
  state.pending = null;
  state.result = evaluateGame(state);
}

/** Compare all five hands and determine the overall winner. */
export function evaluateGame(state: GameState): GameResult {
  const columns: GameResult["columns"] = [];
  const columnWins: [number, number] = [0, 0];

  for (let i = 0; i < NUM_COLUMNS; i++) {
    const handA = state.players[0].columns[i];
    const handB = state.players[1].columns[i];
    const scoreA = evaluateHand(handA);
    const scoreB = evaluateHand(handB);
    const cmp = compareScores(scoreA, scoreB);
    let winner: PlayerIndex | null = null;
    if (cmp > 0) {
      winner = 0;
      columnWins[0]++;
    } else if (cmp < 0) {
      winner = 1;
      columnWins[1]++;
    }
    columns.push({ column: i, winner, scores: [scoreA, scoreB] });
  }

  let winner: PlayerIndex | null = null;
  if (columnWins[0] > columnWins[1]) winner = 0;
  else if (columnWins[1] > columnWins[0]) winner = 1;

  const isFiveO = winner !== null && columnWins[winner] === NUM_COLUMNS;
  return { columns, columnWins, winner, isFiveO };
}

// ----- Redaction: build the per-player view -----

function viewColumn(
  column: Card[],
  isOpponent: boolean,
  revealAll: boolean,
): CardView[] {
  const slots: CardView[] = [];
  for (let i = 0; i < CARDS_PER_HAND; i++) {
    if (i >= column.length) {
      slots.push({ state: "empty" });
      continue;
    }
    const hide = isOpponent && !revealAll && i === FACE_DOWN_INDEX;
    slots.push(hide ? { state: "hidden" } : { state: "card", card: column[i] });
  }
  return slots;
}

function viewPlayer(
  player: PlayerState,
  isOpponent: boolean,
  revealAll: boolean,
): PlayerView {
  return {
    userId: player.userId,
    displayName: player.displayName,
    columns: player.columns.map((c) => viewColumn(c, isOpponent, revealAll)),
  };
}

/** Produce the redacted game view for a given seat. */
export function viewFor(state: GameState, you: PlayerIndex): GameView {
  const revealAll = state.phase === "complete";
  const yourTurn = state.phase === "playing" && state.toMove === you;
  const players: [PlayerView, PlayerView] = [
    viewPlayer(state.players[0], you !== 0, revealAll),
    viewPlayer(state.players[1], you !== 1, revealAll),
  ];
  return {
    placed: [placedCount(state, 0), placedCount(state, 1)],
    total: CARDS_TOTAL,
    phase: state.phase,
    toMove: state.toMove,
    you,
    yourTurn,
    pending: yourTurn ? state.pending : null,
    legalColumns: yourTurn ? legalColumns(state) : [],
    players,
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
