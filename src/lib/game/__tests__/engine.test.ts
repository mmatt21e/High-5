import { describe, it, expect } from "vitest";
import {
  createGame,
  placeCard,
  legalColumns,
  viewFor,
  seatOf,
  IllegalMoveError,
} from "../engine";
import { NUM_COLUMNS, CARDS_TOTAL, FACE_DOWN_INDEX } from "../types";
import type { GameState, PlayerIndex } from "../types";

const A = { userId: "a", displayName: "Alice" };
const B = { userId: "b", displayName: "Bob" };

/** Drive a full game to completion, always placing in the lowest legal hand. */
function playOut(state: GameState): GameState {
  let guard = 0;
  while (state.phase === "playing") {
    if (guard++ > 200) throw new Error("game did not terminate");
    placeCard(state, state.toMove, legalColumns(state)[0]);
  }
  return state;
}

describe("createGame", () => {
  it("starts with a pending card for the first mover", () => {
    const g = createGame(A, B, { seed: 1, firstLead: 0 });
    expect(g.phase).toBe("playing");
    expect(g.toMove).toBe(0);
    expect(g.pending).not.toBeNull();
    expect(g.deck.length).toBe(52 - 1); // one drawn as pending
  });

  it("is deterministic for a given seed", () => {
    const g1 = playOut(createGame(A, B, { seed: 42 }));
    const g2 = playOut(createGame(A, B, { seed: 42 }));
    expect(g1.result).toEqual(g2.result);
  });
});

describe("free placement rules", () => {
  it("rejects a move from the wrong player", () => {
    const g = createGame(A, B, { seed: 5 });
    const wrong = (1 - g.toMove) as PlayerIndex;
    expect(() => placeCard(g, wrong, legalColumns(g)[0])).toThrow(IllegalMoveError);
  });

  it("strictly alternates turns", () => {
    const g = createGame(A, B, { seed: 9, firstLead: 0 });
    expect(g.toMove).toBe(0);
    placeCard(g, 0, legalColumns(g)[0]);
    expect(g.toMove).toBe(1);
    placeCard(g, 1, legalColumns(g)[0]);
    expect(g.toMove).toBe(0);
  });

  it("allows stacking multiple cards into the same hand (uneven columns)", () => {
    const g = createGame(A, B, { seed: 7 });
    const me = g.toMove;
    placeCard(g, me, 0); // me -> hand 0
    placeCard(g, g.toMove, 0); // opponent -> their hand 0
    placeCard(g, me, 0); // me -> hand 0 again
    expect(g.players[me].columns[0].length).toBe(2);
    expect(g.players[me].columns[1].length).toBe(0);
  });

  it("rejects placing into a full hand", () => {
    const g = createGame(A, B, { seed: 5 });
    // Fill hand 0 for both players by preferring hand 0 whenever legal.
    while (
      g.phase === "playing" &&
      (g.players[0].columns[0].length < 5 || g.players[1].columns[0].length < 5)
    ) {
      const legal = legalColumns(g);
      placeCard(g, g.toMove, legal.includes(0) ? 0 : legal[0]);
    }
    expect(g.players[0].columns[0].length).toBe(5);
    expect(legalColumns(g)).not.toContain(0);
    expect(() => placeCard(g, g.toMove, 0)).toThrow(IllegalMoveError);
  });
});

describe("completion and scoring", () => {
  it("deals exactly 50 cards and fills every hand", () => {
    const g = playOut(createGame(A, B, { seed: 3 }));
    expect(g.phase).toBe("complete");
    for (const p of g.players) {
      expect(p.columns).toHaveLength(NUM_COLUMNS);
      for (const col of p.columns) expect(col).toHaveLength(5);
      const total = p.columns.reduce((n, c) => n + c.length, 0);
      expect(total).toBe(CARDS_TOTAL);
    }
    expect(g.deck.length).toBe(2); // 50 dealt, 2 unused
  });

  it("produces a result with column wins summing correctly", () => {
    const g = playOut(createGame(A, B, { seed: 11 }));
    const r = g.result!;
    expect(r.columns).toHaveLength(5);
    const ties = r.columns.filter((c) => c.winner === null).length;
    expect(r.columnWins[0] + r.columnWins[1] + ties).toBe(5);
    if (r.winner !== null) {
      expect(r.columnWins[r.winner]).toBeGreaterThan(r.columnWins[1 - r.winner]);
    }
  });

  it("never deals a duplicate card across the whole table", () => {
    const g = playOut(createGame(A, B, { seed: 21 }));
    const ids = new Set<string>();
    for (const p of g.players) {
      for (const col of p.columns) {
        for (const card of col) {
          const id = `${card.rank}${card.suit}`;
          expect(ids.has(id)).toBe(false);
          ids.add(id);
        }
      }
    }
    expect(ids.size).toBe(50);
  });
});

describe("viewFor redaction", () => {
  it("hides the opponent's face-down (4th) card until showdown", () => {
    const g = createGame(A, B, { seed: 15 });
    // Fill opponent (seat 1) hand 0 to at least 4 cards by preferring hand 0.
    while (g.phase === "playing" && g.players[1].columns[0].length < 4) {
      const legal = legalColumns(g);
      placeCard(g, g.toMove, legal.includes(0) ? 0 : legal[0]);
    }
    const view = viewFor(g, 0);
    expect(view.players[1].columns[0][FACE_DOWN_INDEX].state).toBe("hidden");
  });

  it("reveals everything at showdown", () => {
    const g = playOut(createGame(A, B, { seed: 15 }));
    const view = viewFor(g, 0);
    for (const player of view.players) {
      for (const col of player.columns) {
        for (const slot of col) expect(slot.state).toBe("card");
      }
    }
  });

  it("only exposes the pending card and legal hands to the player to move", () => {
    const g = createGame(A, B, { seed: 8 });
    const mover = g.toMove;
    const moverView = viewFor(g, mover);
    const otherView = viewFor(g, (1 - mover) as PlayerIndex);
    expect(moverView.pending).not.toBeNull();
    expect(moverView.legalColumns.length).toBeGreaterThan(0);
    expect(otherView.pending).toBeNull();
    expect(otherView.legalColumns).toEqual([]);
  });

  it("reports placement progress out of the total", () => {
    const g = createGame(A, B, { seed: 8, firstLead: 0 });
    placeCard(g, 0, legalColumns(g)[0]);
    const view = viewFor(g, 0);
    expect(view.total).toBe(CARDS_TOTAL);
    expect(view.placed[0]).toBe(1);
  });
});

describe("seatOf", () => {
  it("maps user ids to seats", () => {
    const g = createGame(A, B, { seed: 1 });
    expect(seatOf(g, "a")).toBe(0);
    expect(seatOf(g, "b")).toBe(1);
    expect(seatOf(g, "z")).toBe(-1);
  });
});
