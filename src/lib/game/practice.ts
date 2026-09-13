import { buildDeck, cardId, seededRng, shuffle, type Card } from "./cards";
import { chooseComputerMove } from "./computerStrategy";
import { createGame, discardCard, placeCard, viewFor } from "./engine";
import { compareScores, evaluateHand } from "./evaluator";
import type { GameState } from "./types";

export const PRACTICE_STORAGE_KEY = "fiveo-guided-practice-v1";
export type PracticeStep = "welcome" | "place" | "placed" | "pair" | "paired" | "discard" | "discarded" | "finish" | "complete";
export type PracticeEvent =
  | { type: "start" | "continue" | "skip" }
  | { type: "place"; cardId: string; row: number }
  | { type: "discard"; cardId: string };

export interface PracticeSession {
  step: PracticeStep;
  game: GameState;
  events: PracticeEvent[];
}

/** A teaching deal, followed exclusively by ordinary engine moves. No match or account is created. */
export function createPractice(): PracticeSession {
  const deck = buildDeck();
  const take = (ids: string[]) => ids.map((id) => deck.find((card) => cardId(card) === id)!);
  const mine = take(["14s", "14h", "9d", "9c", "2s", "9h"]);
  const theirs = take(["13s", "13h", "8d", "8c", "3s"]);
  // The sixth held card is the first automatic draw. The deck's top is its end.
  const nextDraws = take(["7s", "4c", "6c", "2d", "5d", "12h", "11c"]);
  const reserved = new Set([...mine, ...theirs, ...nextDraws].map(cardId));
  const game = createGame(
    { userId: "practice-you", displayName: "You" },
    { userId: "practice-opponent", displayName: "Practice opponent" },
    { seed: 5 },
  );
  game.players[0].hand = mine;
  game.players[1].hand = theirs;
  game.deck = [...shuffle(deck.filter((card) => !reserved.has(cardId(card))), seededRng(505)), ...nextDraws.reverse()];
  return { step: "welcome", game, events: [] };
}

function autoMove(game: GameState) {
  // Only the redacted view reaches the bot. A fixed RNG keeps lesson replay stable.
  const move = chooseComputerMove(viewFor(game, game.toMove), "medium", () => 0.5);
  if (!move) throw new Error("Practice could not advance a legal turn");
  if (move.kind === "place") placeCard(game, game.toMove, move.cardId, move.row);
  else discardCard(game, game.toMove, move.cardId);
}

/** Invalid or out-of-order actions are harmless, including repeated taps. */
export function advancePractice(session: PracticeSession, event: PracticeEvent): PracticeSession {
  const { step } = session;
  let next: PracticeStep;
  if (event.type === "start" && step === "welcome") next = "place";
  else if (event.type === "continue" && step === "placed") next = "pair";
  else if (event.type === "continue" && step === "paired") next = "discard";
  else if (event.type === "skip" && step === "discarded") next = "finish";
  else if (event.type === "discard" && step === "discard" && event.cardId === "2s") next = "discarded";
  else if (event.type === "place" && step === "place" && event.cardId === "9h" && event.row === 0) next = "placed";
  else if (event.type === "place" && step === "pair" && event.cardId === "9d" && event.row === 0) next = "paired";
  else if (event.type === "place" && step === "finish") {
    if (!viewFor(session.game, 0).legalRows.includes(event.row)
      || !session.game.players[0].hand.some((card) => cardId(card) === event.cardId)) return session;
    next = "complete";
  } else return session;

  const game = structuredClone(session.game);
  if (event.type === "place") placeCard(game, 0, event.cardId, event.row);
  if (event.type === "discard") discardCard(game, 0, event.cardId);
  if (event.type === "continue") autoMove(game);
  if (event.type === "skip") {
    // Finish the middle turns, preserving the player's earlier choices. The
    // final placement is left to the player; no concealed cards are revealed.
    for (let turns = 0; turns < 40; turns++) {
      const view = viewFor(game, 0);
      if (view.yourTurn && view.placed[0] === 19) break;
      autoMove(game);
    }
  }
  if (next === "complete" && game.phase !== "complete") autoMove(game);
  return { step: next, game, events: [...session.events, event] };
}

export function undoPractice(session: PracticeSession): PracticeSession {
  const lastMove = session.events.findLastIndex((event) => event.type === "place" || event.type === "discard");
  if (lastMove < 0) return session;
  return session.events.slice(0, lastMove).reduce(advancePractice, createPractice());
}

export function savePractice(session: PracticeSession): string {
  return JSON.stringify({ version: 1, events: session.events });
}

function isEvent(value: unknown): value is PracticeEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "start" || value.type === "continue" || value.type === "skip") return true;
  if (!((value.type === "place" || value.type === "discard") && "cardId" in value && typeof value.cardId === "string")) return false;
  return value.type === "discard" || ("row" in value && Number.isInteger(value.row));
}

/** Replay a short, versioned action log instead of trusting stored game state. */
export function restorePractice(raw: string | null): PracticeSession {
  const fresh = createPractice();
  if (!raw || raw.length > 2048) return fresh;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("events" in saved) || !Array.isArray(saved.events) || saved.events.length > 8) return fresh;
    let session = fresh;
    for (const event of saved.events) {
      if (!isEvent(event)) return fresh;
      const next = advancePractice(session, event);
      if (next === session) return fresh;
      session = next;
    }
    return session;
  } catch {
    return fresh;
  }
}

export function keptHand(session: PracticeSession, selected: string): Card[] {
  return session.game.players[0].hand.filter((card) => cardId(card) !== selected);
}

/** This hint optimizes only the hidden hand, not the whole game. */
export function hiddenHandHint(session: PracticeSession): string | null {
  if (session.step !== "finish") return null;
  const best = session.game.players[0].hand.reduce((best, card) =>
    compareScores(evaluateHand(keptHand(session, cardId(card))), evaluateHand(keptHand(session, cardId(best)))) > 0 ? card : best);
  return cardId(best);
}
