import { describe, expect, it } from "vitest";
import { createGame, placeCard, viewFor } from "../engine";
import { cardId } from "../cards";
import { describeMotionChanges, visibleCardLocations } from "../motion";

const game = () => createGame({ userId: "a", displayName: "A" }, { userId: "b", displayName: "B" }, { seed: 42 });

describe("public animation changes", () => {
  it("tracks a placement and new draw without exposing the opponent hand", () => {
    const state = game(), seat = state.toMove;
    const before = viewFor(state, seat), played = cardId(state.players[seat].hand[0]);
    const hidden = state.players[1 - seat].hand.map(cardId);
    placeCard(state, seat, played, 0);
    const after = viewFor(state, seat), changes = describeMotionChanges(before, after);
    expect(changes.moved).toEqual([played]);
    expect(changes.turnChanged).toBe(true);
    expect(changes.removed).toEqual([]);
    expect(hidden.every(id => !visibleCardLocations(after).has(id))).toBe(true);
  });
  it("identifies both sides of a row swap", () => {
    const state = game();
    state.players[0].rows[0].push(state.players[0].hand.pop()!);
    state.players[0].rows[1].push(state.players[0].hand.pop()!);
    const before = viewFor(state, 0);
    [state.players[0].rows[0][0], state.players[0].rows[1][0]] = [state.players[0].rows[1][0], state.players[0].rows[0][0]];
    const changes = describeMotionChanges(before, viewFor(state, 0));
    expect(changes.moved).toHaveLength(2);
    expect(changes.entered).toEqual([]);
  });
  it("marks row completion and showdown once, with hidden cards entering only at reveal", () => {
    const state = game();
    for (let i = 0; i < 39; i++) {
      const player = state.players[state.toMove];
      placeCard(state, state.toMove, cardId(player.hand[0]), player.rows.findIndex(row => row.length < 5));
    }
    const before = viewFor(state, 0), player = state.players[state.toMove];
    placeCard(state, state.toMove, cardId(player.hand[0]), player.rows.findIndex(row => row.length < 5));
    const after = viewFor(state, 0), changes = describeMotionChanges(before, after);
    expect(changes.showdown).toBe(true);
    expect(changes.completedRows).toHaveLength(1);
    expect(visibleCardLocations(after).size).toBe(50);
    expect(describeMotionChanges(after, after)).toMatchObject({ entered: [], moved: [], removed: [], completedRows: [], showdown: false, turnChanged: false, trickResolved: false });
  });
});
