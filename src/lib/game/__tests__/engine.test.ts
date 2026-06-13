import { describe, it, expect } from "vitest";
import {
  createGame,
  placeCard,
  legalColumns,
  viewFor,
  seatOf,
  IllegalMoveError,
} from "../engine";
import { NUM_COLUMNS, NUM_ROUNDS, FACE_DOWN_ROUND } from "../types";
import type { GameState } from "../types";

const A = { userId: "a", displayName: "Alice" };
const B = { userId: "b", displayName: "Bob" };

/** Drive a full game to completion, always placing in the lowest legal column. */
function playOut(state: GameState): GameState {
  let guard = 0;
  while (state.phase === "playing") {
    if (guard++ > 200) throw new Error("game did not terminate");
    const col = legalColumns(state)[0];
    placeCard(state, state.toMove, col);
  }
  return state;
}

describe("createGame", () => {
  it("starts in round 0 with a pending card for the first mover", () => {
    const g = createGame(A, B, { seed: 1 });
    expect(g.round).toBe(0);
    expect(g.phase).toBe("playing");
    expect(g.pending).not.toBeNull();
    expect(g.deck.length).toBe(52 - 1); // one drawn as pending
  });

  it("is deterministic for a given seed", () => {
    const g1 = playOut(createGame(A, B, { seed: 42 }));
    const g2 = playOut(createGame(A, B, { seed: 42 }));
    expect(g1.result).toEqual(g2.result);
  });
});

describe("turn and placement rules", () => {
  it("rejects a move from the wrong player", () => {
    const g = createGame(A, B, { seed: 5 });
    const wrong = (1 - g.toMove) as 0 | 1;
    expect(() => placeCard(g, wrong, legalColumns(g)[0])).toThrow(IllegalMoveError);
  });

  it("rejects placing twice in the same column in one round", () => {
    const g = createGame(A, B, { seed: 5 });
    const first = g.toMove;
    const col = legalColumns(g)[0];
    placeCard(g, first, col);
    // After the opponent moves it is `first` again; the same column is no
    // longer legal because it already holds this round's card.
    placeCard(g, g.toMove, legalColumns(g)[0]);
    expect(legalColumns(g)).not.toContain(col);
  });

  it("keeps all columns equal in length at every round boundary", () => {
    const g = createGame(A, B, { seed: 7 });
    let lastRound = g.round;
    while (g.phase === "playing") {
      placeCard(g, g.toMove, legalColumns(g)[0]);
      if (g.round !== lastRound) {
        for (const p of g.players) {
          const lengths = p.columns.map((c) => c.length);
          expect(new Set(lengths).size).toBe(1);
          expect(lengths[0]).toBe(g.round);
        }
        lastRound = g.round;
      }
    }
  });

  it("alternates the lead each round", () => {
    const g = createGame(A, B, { seed: 9, firstLead: 0 });
    expect(g.toMove).toBe(0); // round 0 lead
    // play round 0 to completion (10 placements)
    for (let i = 0; i < 10; i++) placeCard(g, g.toMove, legalColumns(g)[0]);
    expect(g.round).toBe(1);
    expect(g.toMove).toBe(1); // round 1 lead flips
  });
});

describe("completion and scoring", () => {
  it("deals exactly 50 cards and fills every hand", () => {
    const g = playOut(createGame(A, B, { seed: 3 }));
    expect(g.phase).toBe("complete");
    expect(g.round).toBe(NUM_ROUNDS);
    for (const p of g.players) {
      expect(p.columns).toHaveLength(NUM_COLUMNS);
      for (const col of p.columns) expect(col).toHaveLength(5);
    }
    // 50 placed + 2 untouched (one was pending and got placed) => 2 remain.
    expect(g.deck.length).toBe(2);
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
    // Play until both players have at least 4 cards in column 0.
    while (g.phase === "playing" && g.round <= FACE_DOWN_ROUND) {
      placeCard(g, g.toMove, legalColumns(g)[0]);
    }
    const view = viewFor(g, 0);
    const opponentCol0 = view.players[1].columns[0];
    // index FACE_DOWN_ROUND should be hidden for the opponent's board mid-game
    expect(opponentCol0[FACE_DOWN_ROUND].state).toBe("hidden");
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

  it("only exposes the pending card and legal columns to the player to move", () => {
    const g = createGame(A, B, { seed: 8 });
    const mover = g.toMove;
    const moverView = viewFor(g, mover);
    const otherView = viewFor(g, (1 - mover) as 0 | 1);
    expect(moverView.pending).not.toBeNull();
    expect(moverView.legalColumns.length).toBeGreaterThan(0);
    expect(otherView.pending).toBeNull();
    expect(otherView.legalColumns).toEqual([]);
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
