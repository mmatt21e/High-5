import { cardId, shuffle, type Card } from "./cards";
import { IllegalMoveError, viewFor } from "./engine";
import { chooseComputerMove, type ComputerMove } from "./computerStrategy";
import { compareHands } from "./evaluator";
import { TRICKS, type ExhibitionAction, type Trick } from "./exhibitionTypes";
import type { GameState, PlayerIndex } from "./types";

export function startExhibition(state: GameState, sessionId: string, rng: () => number = Math.random) {
  const lowRow = Math.floor(rng() * 4);
  state.exhibition = {
    sessionId, revision: 0, botTurns: 0, preparedTurn: -1,
    remaining: shuffle(Object.keys(TRICKS) as Trick[], rng), lowRow,
    playFair: 1, redraws: 1, swaps: 1, peekNext: false, tricksUsed: 0, pending: null,
    log: [`Moving the Goalposts: Row ${lowRow + 1} is LOW HAND WINS for both players. Declared before play.`,
      "Wildcard Edge: The rules are more of a suggestion. Your records are safe here."],
  };
}

function log(state: GameState, message: string) {
  state.exhibition!.log = [...state.exhibition!.log, message].slice(-24);
}
function lowestIndex(cards: Card[]) {
  return cards.reduce((best, card, index) => card.rank < cards[best].rank ? index : best, 0);
}
function rowPairs(state: GameState, seat: PlayerIndex) {
  return state.players[seat].rows.flatMap((cards, row) => cards.length > 0 && cards.length < 5 ? [{ row, cards }] : []);
}
function swapRows(state: GameState, seat: PlayerIndex): boolean {
  const rows = rowPairs(state, seat);
  if (rows.length < 2) return false;
  const a = rows[0], b = rows[rows.length - 1];
  [a.cards[0], b.cards[0]] = [b.cards[0], a.cards[0]];
  syncMarker(state, seat);
  return true;
}
function syncMarker(state: GameState, seat: PlayerIndex) {
  const player = state.players[seat];
  if (!player.lastPlacement) return;
  const row = player.rows.findIndex(cards => cards.some(card => cardId(card) === player.lastPlacement!.cardId));
  player.lastPlacement = row < 0 ? null : { ...player.lastPlacement, row };
}
function redraw(state: GameState, seat: PlayerIndex, index: number) {
  if (!state.deck.length) throw new IllegalMoveError("No cards remain to redraw");
  const hand = state.players[seat].hand;
  const replacement = state.deck.pop()!;
  state.deck.unshift(hand[index]);
  hand[index] = replacement;
}
function sleeve(state: GameState): boolean {
  const ace = state.deck.findIndex(card => card.rank === 14);
  if (ace < 0) return false;
  const hand = state.players[1].hand, index = lowestIndex(hand);
  [hand[index], state.deck[ace]] = [state.deck[ace], hand[index]];
  return true;
}
function canRethink(state: GameState) {
  const p = state.players[1], last = p.lastPlacement;
  return Boolean(last && p.rows[last.row].some(card => cardId(card) === last.cardId)
    && p.rows.some((cards, row) => row !== last.row && cards.length < 5));
}
function rethink(state: GameState) {
  const p = state.players[1], last = p.lastPlacement!;
  const index = p.rows[last.row].findIndex(card => cardId(card) === last.cardId);
  const row = p.rows.findIndex((cards, row) => row !== last.row && cards.length < 5);
  p.rows[row].push(...p.rows[last.row].splice(index, 1));
  syncMarker(state, 1);
}
function eligible(state: GameState, kind: Trick) {
  if (kind === "switcheroo") return rowPairs(state, 1).length >= 2;
  if (kind === "sleeve" || kind === "caught") return state.deck.some(card => card.rank === 14);
  if (kind === "rethink") return canRethink(state);
  if (kind === "deal") return state.deck.length >= 2 && rowPairs(state, 1).length >= 2;
  if (kind === "shared") return state.deck.length > 0;
  return true;
}

/** Stage a trick BEFORE it changes any card. A human decision survives reconnect. */
export function prepareWildcardTurn(state: GameState, rng: () => number = Math.random): boolean {
  const ex = state.exhibition;
  if (!ex || state.phase !== "playing" || state.toMove !== 1 || ex.pending || ex.preparedTurn === ex.botTurns) return false;
  ex.preparedTurn = ex.botTurns;
  // Breathing room between tricks; blocked/declined tricks are still consumed.
  if (ex.botTurns % 2 !== 0) return false;
  const index = ex.remaining.findIndex(kind => eligible(state, kind));
  if (index < 0) return false;
  const [kind] = ex.remaining.splice(index, 1);
  ex.pending = { kind,
    ...(kind === "caught" ? { cheating: rng() < 0.65 } : {}),
    ...(kind === "shared" ? { power: rowPairs(state, 1).length >= 2 && rng() < 0.5 ? "swap" as const : "redraw" as const } : {}),
  };
  ex.revision++;
  return true;
}

function applyTrick(state: GameState) {
  const ex = state.exhibition!, p = ex.pending!;
  if (p.kind === "switcheroo") swapRows(state, 1);
  if (p.kind === "sleeve") sleeve(state);
  if (p.kind === "marked") { ex.peekNext = true; ex.redraws++; }
  if (p.kind === "rethink") rethink(state);
  if (p.kind === "caught" && p.cheating) sleeve(state);
  if (p.kind === "gift") ex.redraws++;
  if (p.kind === "shared") {
    if (p.power === "swap") { ex.swaps++; swapRows(state, 1); }
    else { ex.redraws++; redraw(state, 1, lowestIndex(state.players[1].hand)); }
  }
  ex.tricksUsed++;
  log(state, `${TRICKS[p.kind].title}: ${p.kind === "caught" ? p.cheating ? "A real ace slipped into Edge's hand." : "Just a bluff. No cards changed." : TRICKS[p.kind].description}`);
  if (p.kind === "shared") log(state, `Shared power: ${p.power}. Yours is ready in the Tricks drawer.`);
}

/** Validate first, then mutate; manager wraps this with save/rollback and a queue. */
export function exhibitionAction(state: GameState, seat: PlayerIndex, input: ExhibitionAction) {
  const ex = state.exhibition;
  if (!ex || seat !== 0) throw new IllegalMoveError("Exhibition powers are only for the human at Wildcard Edge's table");
  if (input.token !== `${ex.sessionId}:${ex.revision}`) throw new IllegalMoveError("The table changed. Use the current trick controls.");
  if (state.phase !== "playing") throw new IllegalMoveError("The exhibition has finished");
  const pending = ex.pending;
  if (pending) {
    if (pending.offers) {
      if (input.action !== "choose" || !Number.isInteger(input.offerIndex) || input.offerIndex! < 0 || input.offerIndex! >= pending.offers.length) throw new IllegalMoveError("Choose one offered card and one held card to trade");
      const hand = state.players[0].hand, index = hand.findIndex(card => cardId(card) === input.cardId);
      if (index < 0) throw new IllegalMoveError("Choose a card from your hand");
      const replacement = pending.offers[input.offerIndex!];
      state.deck.unshift(hand[index], ...pending.offers.filter((_, i) => i !== input.offerIndex));
      hand[index] = replacement;
      swapRows(state, 1);
      ex.tricksUsed++;
      log(state, `Deal with the Devil: you took ${cardId(replacement)}. Edge swapped two row cards.`);
    } else if (pending.kind === "deal") {
      if (input.action === "accept") {
        pending.offers = [state.deck.pop()!, state.deck.pop()!];
        ex.revision++;
        return;
      }
      if (input.action !== "decline") throw new IllegalMoveError("Accept or decline the deal");
      log(state, "Deal declined. Edge: A suspiciously sensible decision.");
    } else if (input.action === "block") {
      if (!ex.playFair) throw new IllegalMoveError("Your Play Fair token has been used");
      ex.playFair--;
      log(state, `${TRICKS[pending.kind].title} cancelled with Play Fair! Edge: Fine. This once.`);
    } else if (input.action === "challenge" && pending.kind === "caught") {
      if (pending.cheating) { ex.redraws++; log(state, "Caught red-handed! The ace trick is cancelled; you earned a redraw."); }
      else { redraw(state, 1, lowestIndex(state.players[1].hand)); log(state, "Edge was bluffing! Your wrong call gives Edge one redraw. Nice try."); }
    } else if (input.action === "allow") applyTrick(state);
    else throw new IllegalMoveError("Choose a response to this trick");
    ex.pending = null;
    ex.revision++;
    return;
  }
  if (state.toMove !== 0) throw new IllegalMoveError("Use your powers on your turn");
  if (input.action === "redraw") {
    const index = state.players[0].hand.findIndex(card => cardId(card) === input.cardId);
    if (!ex.redraws || index < 0 || !state.deck.length) throw new IllegalMoveError("Select a held card and an available redraw");
    redraw(state, 0, index); ex.redraws--;
    log(state, "Lucky Draw: you replaced a held card without spending your turn.");
  } else if (input.action === "swap") {
    if (!ex.swaps || input.cardId === input.otherCardId) throw new IllegalMoveError("Choose two different cards in unfinished rows");
    const rows = rowPairs(state, 0);
    const a = rows.find(row => row.cards.some(card => cardId(card) === input.cardId));
    const b = rows.find(row => row.cards.some(card => cardId(card) === input.otherCardId));
    if (!a || !b || a.row === b.row) throw new IllegalMoveError("Choose cards from two different unfinished rows");
    const ai = a.cards.findIndex(card => cardId(card) === input.cardId), bi = b.cards.findIndex(card => cardId(card) === input.otherCardId);
    [a.cards[ai], b.cards[bi]] = [b.cards[bi], a.cards[ai]];
    syncMarker(state, 0); ex.swaps--;
    log(state, "Your Switcheroo: two row cards swapped. Edge: That looks familiar.");
  } else throw new IllegalMoveError("That power is not available now");
  ex.revision++;
}

/** Peeking is confined to the explicitly announced exhibition move. */
export function chooseWildcardMove(state: GameState, rng: () => number = Math.random): ComputerMove | null {
  const base = chooseComputerMove(viewFor(state, 1), "medium", rng);
  if (!base || !state.exhibition?.peekNext || base.kind !== "place") return base;
  const hand = state.players[1].hand, opponent = state.players[0].hand;
  // Spend the highest card we can while retaining a hand that beats the peeked hand.
  const candidates = hand.filter(card => compareHands(hand.filter(other => other !== card), opponent) > 0).sort((a, b) => b.rank - a.rank);
  return candidates.length ? { ...base, cardId: cardId(candidates[0]) } : base;
}

export function finishWildcardTurn(state: GameState) {
  if (!state.exhibition) return;
  state.exhibition.botTurns++;
  state.exhibition.peekNext = false;
}
