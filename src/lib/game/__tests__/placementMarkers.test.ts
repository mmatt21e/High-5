import { describe, expect, it } from "vitest";
import { cardId } from "../cards";
import { createGame, discardCard, placeCard, viewFor } from "../engine";
import type { GameState } from "../types";

const newGame = () => createGame(
  { userId: "a", displayName: "Alice" },
  { userId: "b", displayName: "Bob" },
  { seed: 42 },
);

describe("last board placement", () => {
  it("tracks each seat independently and replaces only that player's marker", () => {
    const game = newGame();
    const first = cardId(game.players[0].hand[0]);
    placeCard(game, 0, first, 2);
    const second = cardId(game.players[1].hand[0]);
    placeCard(game, 1, second, 0);
    expect(viewFor(game, 1).players.map(p => p.lastPlacement)).toEqual([
      { row: 2, cardId: first }, { row: 0, cardId: second },
    ]);
    const third = cardId(game.players[0].hand[0]);
    placeCard(game, 0, third, 1);
    expect(viewFor(game, 0).players.map(p => p.lastPlacement)).toEqual([
      { row: 1, cardId: third }, { row: 0, cardId: second },
    ]);
  });

  it("survives saved-state restoration and a discard without exposing hidden cards", () => {
    const game = newGame();
    const first = cardId(game.players[0].hand[0]);
    placeCard(game, 0, first, 0);
    placeCard(game, 1, cardId(game.players[1].hand[0]), 1);
    discardCard(game, 0, cardId(game.players[0].hand[0]));
    const restored = JSON.parse(JSON.stringify(game)) as GameState;
    const opponentView = viewFor(restored, 1);
    expect(opponentView.players[0].lastPlacement).toEqual({ row: 0, cardId: first });
    expect(opponentView.players[0].hand.every(c => c.state === "hidden")).toBe(true);
    expect(opponentView.players[0].rows[0][0]).toMatchObject({ state: "card" });
    // A view is detached from the authoritative placement object.
    opponentView.players[0].lastPlacement!.row = 3;
    expect(restored.players[0].lastPlacement!.row).toBe(0);
  });

  it("does not move the marker for a rejected move and starts fresh for new/legacy games", () => {
    const game = newGame();
    expect(viewFor(game, 0).players.map(p => p.lastPlacement)).toEqual([null, null]);
    placeCard(game, 0, cardId(game.players[0].hand[0]), 0);
    const marker = game.players[0].lastPlacement;
    expect(() => placeCard(game, 0, cardId(game.players[0].hand[0]), 1)).toThrow();
    expect(game.players[0].lastPlacement).toEqual(marker);
    delete game.players[0].lastPlacement;
    expect(viewFor(game, 0).players[0].lastPlacement).toBeNull();
    expect(viewFor(newGame(), 1).players.every(p => p.lastPlacement === null)).toBe(true);
  });
});
