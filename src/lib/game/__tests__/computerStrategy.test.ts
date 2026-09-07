import { describe, expect, it } from "vitest";
import { COMPUTER_LEVELS, COMPUTER_OPPONENTS, isComputerLevel } from "../../computer";
import { buildDeck, cardId, seededRng, type Card } from "../cards";
import { createGame, discardCard, placeCard, viewFor } from "../engine";
import { chooseComputerMove } from "../computerStrategy";
import type { CardView, GameView } from "../types";

describe("named computer opponents", () => {
  it("keeps stable difficulty keys separate from playful, descriptive names", () => {
    expect(COMPUTER_LEVELS.map((level) => COMPUTER_OPPONENTS[level].name)).toEqual(["Lucky Guppy", "Sneaky Stacker", "The Cardfather"]);
    for (const input of [null, undefined, "expert", "__proto__", {}, 1]) expect(isComputerLevel(input)).toBe(false);
  });

  it.each(COMPUTER_LEVELS)("%s completes seeded games legally in either seat without mutating its input", (level) => {
    for (let seed = 1; seed <= 4; seed++) {
      const state = createGame({ userId: "a", displayName: "A" }, { userId: "b", displayName: "B" }, { seed, firstLead: seed % 2 ? 0 : 1 });
      const rng = seededRng(seed + 100);
      let turns = 0;
      while (state.phase === "playing") {
        const seat = state.toMove;
        const view = viewFor(state, seat);
        const before = JSON.stringify(view);
        const move = chooseComputerMove(view, level, rng)!;
        expect(JSON.stringify(view)).toBe(before);
        expect(state.players[seat].hand.map(cardId)).toContain(move.cardId);
        if (move.kind === "discard") {
          expect(view.canDiscard).toBe(true);
          discardCard(state, seat, move.cardId);
        } else {
          expect(view.legalRows).toContain(move.row);
          placeCard(state, seat, move.cardId, move.row);
        }
        expect(++turns).toBeLessThanOrEqual(42);
      }
      expect(state.result?.hands).toHaveLength(5);
      expect(state.players.flatMap((player) => player.rows).every((row) => row.length === 5)).toBe(true);
      expect(chooseComputerMove(viewFor(state, 1), level, rng)).toBeNull();
    }
  }, 30_000);

  it.each(COMPUTER_LEVELS)("%s cannot use hidden hand identities or actual future draws", (level) => {
    const state = createGame({ userId: "a", displayName: "A" }, { userId: "b", displayName: "B" }, { seed: 81, firstLead: 1 });
    const changed = structuredClone(state);
    [changed.deck[0], changed.players[0].hand[0]] = [changed.players[0].hand[0], changed.deck[0]];
    changed.deck.reverse();
    expect(viewFor(changed, 1)).toEqual(viewFor(state, 1));
    expect(chooseComputerMove(viewFor(changed, 1), level, seededRng(12))).toEqual(chooseComputerMove(viewFor(state, 1), level, seededRng(12)));
    expect(chooseComputerMove(viewFor(state, 0), level)).toBeNull();
  });

  it("The Cardfather completes a winning flush while preserving a full house", () => {
    const asViews = (cards: Card[]): CardView[] => cards.map((card) => ({ state: "card", card }));
    const flush: Card[] = [{ rank: 2, suit: "h" }, { rank: 5, suit: "h" }, { rank: 9, suit: "h" }, { rank: 11, suit: "h" }];
    const hand: Card[] = [{ rank: 13, suit: "h" }, { rank: 7, suit: "c" }, { rank: 7, suit: "d" }, { rank: 7, suit: "s" }, { rank: 14, suit: "c" }, { rank: 14, suit: "d" }];
    const opponent: Card[] = [{ rank: 13, suit: "c" }, { rank: 13, suit: "d" }, { rank: 3, suit: "s" }, { rank: 6, suit: "s" }, { rank: 8, suit: "s" }];
    const taken = new Set([...flush, ...hand, ...opponent].map(cardId));
    const rest = buildDeck().filter((card) => !taken.has(cardId(card)));
    const rows = Array.from({ length: 6 }, (_, index) => asViews(rest.slice(index * 5, index * 5 + 5)));
    const view: GameView = { phase: "playing", toMove: 1, you: 1, yourTurn: true, legalRows: [0], canDiscard: true,
      placed: [20, 19], total: 20, deckRemaining: 1, result: null,
      players: [{ displayName: "Human", rows: [asViews(opponent), ...rows.slice(0, 3)], hand: Array.from({ length: 5 }, () => ({ state: "hidden" })) },
        { displayName: "The Cardfather", rows: [[...asViews(flush), { state: "empty" }], ...rows.slice(3)], hand: asViews(hand) }] };
    expect(chooseComputerMove(view, "hard", seededRng(321))).toEqual({ kind: "place", cardId: "13h", row: 0 });
  });
});
