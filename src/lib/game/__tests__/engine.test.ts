import { describe, it, expect } from "vitest";
import {
  createGame,
  placeCard,
  discardCard,
  legalRows,
  viewFor,
  seatOf,
  evaluateGame,
  IllegalMoveError,
} from "../engine";
import { cardId } from "../cards";
import type { Card, Rank, Suit } from "../cards";
import { NUM_ROWS, ROW_SLOTS_TOTAL, NUM_HANDS } from "../types";
import type { GameState, PlayerIndex } from "../types";

const A = { userId: "a", displayName: "Alice" };
const B = { userId: "b", displayName: "Bob" };

const topCard = (s: GameState) => cardId(s.players[s.toMove].hand[0]);

function cards(...values: string[]): Card[] {
  const ranks: Record<string, Rank> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  return values.map((value) => ({
    rank: ranks[value[0]],
    suit: value[1] as Suit,
  }));
}

function scoringState(
  playerAHands: [Card[], Card[], Card[], Card[], Card[]],
  playerBHands: [Card[], Card[], Card[], Card[], Card[]],
): GameState {
  const state = createGame(A, B, { seed: 1 });
  state.players[0].rows = playerAHands.slice(0, 4) as Card[][];
  state.players[0].hand = playerAHands[4];
  state.players[1].rows = playerBHands.slice(0, 4) as Card[][];
  state.players[1].hand = playerBHands[4];
  state.phase = "complete";
  state.result = null;
  state.deck = [];
  return state;
}

/** Drive a full game to completion, always placing the first held card in the
 * lowest legal row (never discarding). */
function playOut(state: GameState): GameState {
  let guard = 0;
  while (state.phase === "playing") {
    if (guard++ > 500) throw new Error("game did not terminate");
    placeCard(state, state.toMove, topCard(state), legalRows(state)[0]);
  }
  return state;
}

describe("createGame", () => {
  it("deals a concealed hand of 5 and draws for the first mover", () => {
    const g = createGame(A, B, { seed: 1, firstLead: 0 });
    expect(g.phase).toBe("playing");
    expect(g.toMove).toBe(0);
    expect(g.players[0].hand).toHaveLength(6); // 5 dealt + 1 drawn
    expect(g.players[1].hand).toHaveLength(5);
    expect(g.deck.length).toBe(52 - 11);
  });

  it("is deterministic for a given seed", () => {
    const g1 = playOut(createGame(A, B, { seed: 42 }));
    const g2 = playOut(createGame(A, B, { seed: 42 }));
    expect(g1.result).toEqual(g2.result);
  });
});

describe("placing and discarding", () => {
  it("rejects a move from the wrong player", () => {
    const g = createGame(A, B, { seed: 5, firstLead: 0 });
    expect(() => placeCard(g, 1, topCard(g), 0)).toThrow(IllegalMoveError);
  });

  it("rejects placing a card you are not holding", () => {
    const g = createGame(A, B, { seed: 5 });
    expect(() => placeCard(g, g.toMove, "2x", 0)).toThrow(IllegalMoveError);
  });

  it("moves a held card into a row and alternates turns", () => {
    const g = createGame(A, B, { seed: 5, firstLead: 0 });
    const card = topCard(g);
    placeCard(g, 0, card, 0);
    expect(g.players[0].rows[0]).toHaveLength(1);
    expect(g.players[0].hand).toHaveLength(5);
    expect(g.toMove).toBe(1);
  });

  it("allows exactly one discard per game", () => {
    const g = createGame(A, B, { seed: 5, firstLead: 0 });
    discardCard(g, 0, topCard(g));
    expect(g.players[0].discardUsed).toBe(true);
    expect(g.players[0].hand).toHaveLength(5);
    expect(g.toMove).toBe(1);
    // Player 1 acts, back to player 0.
    placeCard(g, 1, topCard(g), 0);
    expect(g.toMove).toBe(0);
    expect(() => discardCard(g, 0, topCard(g))).toThrow(IllegalMoveError);
  });

  it("rejects placing into a full row", () => {
    const g = createGame(A, B, { seed: 5 });
    while (
      g.phase === "playing" &&
      (g.players[0].rows[0].length < 5 || g.players[1].rows[0].length < 5)
    ) {
      const legal = legalRows(g);
      placeCard(g, g.toMove, topCard(g), legal.includes(0) ? 0 : legal[0]);
    }
    expect(g.players[0].rows[0]).toHaveLength(5);
    expect(legalRows(g)).not.toContain(0);
    expect(() => placeCard(g, g.toMove, topCard(g), 0)).toThrow(IllegalMoveError);
  });
});

describe("completion and scoring", () => {
  it("requires three hand wins even when one player leads after tied hands", () => {
    const state = scoringState(
      [
        cards("Ac", "Ad", "Kh", "Qs", "2c"),
        cards("4c", "5d", "6h", "7s", "8c"),
        cards("Ac", "Jd", "8h", "4s", "2c"),
        cards("Ac", "Kd", "Qh", "Js", "9c"),
        cards("7c", "7d", "Ah", "Ks", "2c"),
      ],
      [
        cards("Kc", "Kd", "Ah", "Qh", "2d"),
        cards("9c", "9d", "Ah", "Ks", "2c"),
        cards("3c", "3d", "7h", "5s", "2d"),
        cards("As", "Kh", "Qd", "Jc", "9d"),
        cards("7h", "7s", "Ad", "Kc", "2d"),
      ],
    );

    const result = evaluateGame(state);

    expect(result.handWins).toEqual([2, 1]);
    expect(result.winner).toBeNull();
    expect(result.isFiveO).toBe(false);
  });

  it("declares a winner once a player wins three hands", () => {
    const state = scoringState(
      [
        cards("Ac", "Ad", "Kh", "Qs", "2c"),
        cards("4c", "5d", "6h", "7s", "8c"),
        cards("Tc", "Td", "Ah", "Ks", "2c"),
        cards("Ac", "Kd", "Qh", "Js", "9c"),
        cards("7c", "7d", "Ah", "Ks", "2c"),
      ],
      [
        cards("Kc", "Kd", "Ah", "Qh", "2d"),
        cards("9c", "9d", "Ah", "Ks", "2c"),
        cards("3c", "3d", "7h", "5s", "2d"),
        cards("As", "Kh", "Qd", "Jc", "9d"),
        cards("7h", "7s", "Ad", "Kc", "2d"),
      ],
    );

    const result = evaluateGame(state);

    expect(result.handWins).toEqual([3, 0]);
    expect(result.winner).toBe(0);
  });

  it("fills all four rows, keeps a 5-card concealed hand, scores five hands", () => {
    const g = playOut(createGame(A, B, { seed: 3 }));
    expect(g.phase).toBe("complete");
    for (const p of g.players) {
      expect(p.rows).toHaveLength(NUM_ROWS);
      for (const row of p.rows) expect(row).toHaveLength(5);
      const rowCards = p.rows.reduce((n, r) => n + r.length, 0);
      expect(rowCards).toBe(ROW_SLOTS_TOTAL);
      expect(p.hand).toHaveLength(5);
    }
    const r = g.result!;
    expect(r.hands).toHaveLength(NUM_HANDS);
    const ties = r.hands.filter((h) => h.winner === null).length;
    expect(r.handWins[0] + r.handWins[1] + ties).toBe(NUM_HANDS);
    if (r.winner !== null) {
      expect(r.handWins[r.winner]).toBeGreaterThanOrEqual(3);
    }
    // 40 row cards + 10 concealed = 50 dealt into play; 2 unused.
    expect(g.deck.length).toBe(2);
  });

  it("scores the concealed hand as the 5th hand", () => {
    const g = playOut(createGame(A, B, { seed: 11 }));
    const last = g.result!.hands[NUM_ROWS];
    expect(last.kind).toBe("hand");
    expect(last.index).toBe(NUM_ROWS);
  });

  it("never puts a duplicate card into play", () => {
    const g = playOut(createGame(A, B, { seed: 21 }));
    const ids = new Set<string>();
    const add = (c: { rank: number; suit: string }) => {
      const id = `${c.rank}${c.suit}`;
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    };
    for (const p of g.players) {
      for (const row of p.rows) row.forEach(add);
      p.hand.forEach(add);
    }
    expect(ids.size).toBe(50);
  });
});

describe("viewFor redaction", () => {
  it("hides the opponent's concealed hand but shows your own", () => {
    const g = createGame(A, B, { seed: 15 });
    const view = viewFor(g, 0);
    for (const slot of view.players[1].hand) expect(slot.state).toBe("hidden");
    for (const slot of view.players[0].hand) expect(slot.state).toBe("card");
  });

  it("reveals both concealed hands at showdown", () => {
    const g = playOut(createGame(A, B, { seed: 15 }));
    const view = viewFor(g, 0);
    for (const player of view.players) {
      for (const slot of player.hand) expect(slot.state).toBe("card");
    }
  });

  it("exposes legal rows and discard only to the player to move", () => {
    const g = createGame(A, B, { seed: 8 });
    const mover = g.toMove;
    const mv = viewFor(g, mover);
    const ov = viewFor(g, (1 - mover) as PlayerIndex);
    expect(mv.yourTurn).toBe(true);
    expect(mv.legalRows.length).toBeGreaterThan(0);
    expect(mv.canDiscard).toBe(true);
    expect(ov.legalRows).toEqual([]);
    expect(ov.canDiscard).toBe(false);
  });

  it("reports placement progress out of the total", () => {
    const g = createGame(A, B, { seed: 8, firstLead: 0 });
    placeCard(g, 0, topCard(g), legalRows(g)[0]);
    const view = viewFor(g, 0);
    expect(view.total).toBe(ROW_SLOTS_TOTAL);
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
