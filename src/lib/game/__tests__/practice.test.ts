import { describe, expect, it } from "vitest";
import { cardId } from "../cards";
import { evaluateGame, viewFor } from "../engine";
import { HandCategory, evaluateHand } from "../evaluator";
import {
  advancePractice, createPractice, hiddenHandHint, keptHand,
  restorePractice, savePractice, undoPractice,
  type PracticeEvent, type PracticeSession,
} from "../practice";

const events: PracticeEvent[] = [
  { type: "start" },
  { type: "place", cardId: "9h", row: 0 },
  { type: "continue" },
  { type: "place", cardId: "9d", row: 0 },
  { type: "continue" },
  { type: "discard", cardId: "2s" },
  { type: "skip" },
  { type: "place", cardId: "14s", row: 3 },
];
const through = (count: number) => events.slice(0, count).reduce(advancePractice, createPractice());
const allCards = (session: PracticeSession) => [
  ...session.game.deck,
  ...session.game.players.flatMap((player) => [...player.hand, ...player.rows.flat()]),
].map(cardId).sort();

describe("guided practice", () => {
  it("uses one unique deck, real alternating turns, and exactly one discarded card", () => {
    let session = createPractice();
    const original = allCards(session);
    expect(new Set(original).size).toBe(52);
    expect(session.game.players[0].hand.map(cardId)).toEqual(["14s", "14h", "9d", "9c", "2s", "9h"]);
    for (const event of events) {
      const before = structuredClone(session);
      const next = advancePractice(session, event);
      expect(session).toEqual(before); // The underlying mutating engine must stay behind a clone.
      session = next;
      const expected = original.filter((id) => !session.game.players[0].discardUsed || id !== "2s");
      expect(allCards(session)).toEqual(expected);
      expect(session.game.players[1].discardUsed).toBe(false);
      for (const player of session.game.players) expect(player.rows.every((row) => row.length <= 5)).toBe(true);
    }
    expect(session.step).toBe("complete");
    expect(session.game.phase).toBe("complete");
    expect(session.game.players.map((player) => player.hand.length)).toEqual([5, 5]);
    expect(session.game.result).toEqual(evaluateGame(session.game));
  });

  it("teaches a held-card pair and spends the entire discard turn without changing rows", () => {
    const pair = through(3);
    expect(pair.game.toMove).toBe(0);
    expect(pair.game.players[0].hand.at(-1)).toEqual({ rank: 4, suit: "c" });
    expect(through(4).game.players[0].rows[0].map(cardId)).toEqual(["9h", "9d"]);
    const before = through(5);
    const after = advancePractice(before, events[5]);
    expect(after.game.players[0].rows).toEqual(before.game.players[0].rows);
    expect(after.game.players[0].hand).toHaveLength(5);
    expect(after.game.players[0].discardUsed).toBe(true);
    expect(after.game.toMove).toBe(1);
    expect(advancePractice(after, events[5])).toBe(after);
  });

  it("withholds the opponent's held cards and result until a legal final placement", () => {
    for (let count = 0; count < 8; count++) {
      const view = viewFor(through(count).game, 0);
      expect(view.players[1].hand.every((slot) => slot.state === "hidden")).toBe(true);
      expect(view.result).toBeNull();
    }
    const final = through(7);
    expect(viewFor(final.game, 0).placed).toEqual([19, 20]);
    expect(viewFor(final.game, 0).legalRows).toEqual([3]);
    const completed = viewFor(through(8).game, 0);
    expect(completed.players[1].hand.every((slot) => slot.state === "card")).toBe(true);
    expect(completed.result?.hands).toHaveLength(5);
  });

  it("makes the final choice meaningful: a flush plus two pair wins, keeping a full house loses", () => {
    const final = through(7);
    expect(hiddenHandHint(final)).toBe("11h");
    expect(evaluateHand(keptHand(final, "11h")).category).toBe(HandCategory.FullHouse);
    const strongHidden = advancePractice(final, { type: "place", cardId: "11h", row: 3 });
    expect(strongHidden.game.result?.winner).toBe(1);
    const balanced = through(8);
    expect(balanced.game.result?.handWins).toEqual([3, 2]);
    expect(balanced.game.result?.winner).toBe(0);
    expect(balanced.game.result?.hands[3].scores[0].category).toBe(HandCategory.Flush);
    expect(balanced.game.result?.hands[4].scores[0].category).toBe(HandCategory.TwoPair);
    for (const card of final.game.players[0].hand) {
      expect(advancePractice(final, { type: "place", cardId: cardId(card), row: 3 }).game.phase).toBe("complete");
    }
  });

  it("rejects wrong lesson moves, out-of-order events, full rows, and cards not held", () => {
    expect(advancePractice(createPractice(), events[7]).step).toBe("welcome");
    const first = through(1);
    expect(advancePractice(first, { type: "place", cardId: "14s", row: 0 })).toBe(first);
    expect(advancePractice(first, { type: "place", cardId: "9h", row: 1 })).toBe(first);
    expect(advancePractice(first, { type: "skip" })).toBe(first);
    const final = through(7);
    expect(advancePractice(final, { type: "place", cardId: "14s", row: 0 })).toBe(final);
    expect(advancePractice(final, { type: "place", cardId: "9h", row: 3 })).toBe(final);
    expect(advancePractice(final, { type: "place", cardId: "14s", row: 3.5 })).toBe(final);
  });

  it("undo restores all intervening opponent turns, skipped turns, and concealed information", () => {
    expect(undoPractice(through(3))).toEqual(through(1));
    expect(undoPractice(through(5))).toEqual(through(3));
    expect(undoPractice(through(7))).toEqual(through(5));
    expect(undoPractice(through(8))).toEqual(through(7));
    expect(undoPractice(through(1))).toEqual(through(1));
  });

  it("resumes every checkpoint by replay, without storing the deck or opponent's cards", () => {
    for (let count = 0; count <= events.length; count++) {
      const session = through(count);
      const saved = savePractice(session);
      expect(saved).not.toContain("deck");
      expect(saved).not.toContain("players");
      expect(restorePractice(saved)).toEqual(session);
    }
  });

  it.each([
    null, "broken", "null", "x".repeat(2049),
    JSON.stringify({ version: 2, events: [] }),
    JSON.stringify({ version: 1, events: [{ type: "skip" }] }),
    JSON.stringify({ version: 1, events: [{ type: "start" }, { type: "place", cardId: "14s", row: 0 }] }),
    JSON.stringify({ version: 1, events: [null] }),
    JSON.stringify({ version: 1, events: Array(9).fill({ type: "start" }) }),
  ])("safely resets invalid or stale saved progress (%s)", (raw) => {
    expect(restorePractice(raw)).toEqual(createPractice());
  });
});
