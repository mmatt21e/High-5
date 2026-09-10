// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, placeCard, viewFor } from "../../lib/game/engine";
import { cardId } from "../../lib/game/cards";
import { describeMotionChanges } from "../../lib/game/motion";
import { useGameSocket, type GameSocketState } from "../useGameSocket";

const socket = vi.hoisted(() => ({
  connected: true,
  handlers: new Map<string, (...args: unknown[]) => void>(),
  emit: vi.fn(), disconnect: vi.fn(),
  on: vi.fn(), removeAllListeners: vi.fn(),
}));
vi.mock("socket.io-client", () => ({ io: () => socket }));

let current: GameSocketState;
let root: Root;
let container: HTMLDivElement;
const fresh = () => createGame({ userId: "a", displayName: "A" }, { userId: "b", displayName: "B" }, { seed: 42 });
let game = fresh();
let confirmed = viewFor(game, 0);
let id = "";
function Harness({ code = "TEST01" }: { code?: string }) { current = useGameSocket(code); return null; }
function receive(event: string, ...args: unknown[]) { act(() => socket.handlers.get(event)?.(...args)); }
function place(row = 1) { let accepted = false; act(() => { accepted = current.place(id, row); }); return accepted; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.clearAllMocks(); socket.handlers.clear(); socket.connected = true;
  socket.on.mockImplementation((name, handler) => socket.handlers.set(name, handler));
  socket.removeAllListeners.mockImplementation(() => socket.handlers.clear());
  game = fresh(); confirmed = viewFor(game, 0); id = cardId(game.players[0].hand[0]);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  receive("connect"); receive("match:snapshot", { status: "active", gameNumber: 1 }); receive("game:view", confirmed);
  socket.emit.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("immediate card placement", () => {
  it("moves the held card into its row before any server response or elapsed time", () => {
    const original = structuredClone(confirmed);
    expect(place()).toBe(true);
    expect(current.view!.players[0].rows[1][0]).toEqual(confirmed.players[0].hand[0]);
    expect(current.view!.players[0].hand).toHaveLength(5);
    expect(current.view!.players[0].lastPlacement).toEqual({ cardId: id, row: 1 });
    expect(current.view!.placed[0]).toBe(1);
    expect(current.placing).toBe(true);
    expect(current.view!.legalRows).toEqual([]);
    expect(current.view!.players[1]).toBe(confirmed.players[1]);
    expect(current.view!.deckRemaining).toBe(confirmed.deckRemaining);
    expect(confirmed).toEqual(original);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith("game:place", { cardId: id, row: 1 });
    expect(describeMotionChanges(confirmed, current.view!).placedByYou).toEqual([id]);
  });

  it("blocks duplicate placements and other mutations until confirmation", () => {
    place();
    act(() => {
      expect(current.place(id, 2)).toBe(false);
      expect(current.discard(id)).toBe(false);
      expect(current.next()).toBe(false);
      expect(current.endMatch()).toBe(false);
      expect(current.exhibition({ token: "test", action: "restart" })).toBe(false);
    });
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it("accepts the authoritative result without moving the played card a second time", () => {
    place(); const preview = current.view!;
    act(() => vi.advanceTimersByTime(1000));
    expect(current.view).toBe(preview);
    const after = viewFor(placeCard(game, 0, id, 1), 0);
    receive("game:view", after);
    expect(current.view).toBe(after); expect(current.placing).toBe(false);
    expect(describeMotionChanges(preview, after).moved).not.toContain(id);
    act(() => vi.advanceTimersByTime(8000));
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it("restores the confirmed hand and row when the server rejects the move", () => {
    place(); receive("errorMsg", { message: "That row is already full" });
    expect(current.view).toBe(confirmed); expect(current.placing).toBe(false);
    expect(current.error).toBe("That row is already full");
    expect(place(2)).toBe(true);
  });

  it("restores on disconnect, prevents offline play, and takes fresh state on reconnect", () => {
    place(); socket.connected = false; receive("disconnect");
    expect(current.view).toBe(confirmed); expect(current.placing).toBe(false);
    expect(place()).toBe(false);
    socket.connected = true; receive("connect");
    expect(place()).toBe(false); // Wait for the join acknowledgement.
    receive("match:snapshot", { status: "active", gameNumber: 1 });
    expect(place()).toBe(false); // The old board is not actionable between join events.
    const after = viewFor(placeCard(game, 0, id, 1), 0); receive("game:view", after);
    expect(current.view).toBe(after); expect(current.sync).toBe(2);
  });

  it("requests a fresh table after a missing reply without resending the placement", () => {
    place(); act(() => vi.advanceTimersByTime(8000));
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(["game:place", "match:join"]);
    expect(current.placing).toBe(true); expect(place()).toBe(false);
    receive("game:view", confirmed);
    expect(current.view).toBe(confirmed); expect(current.placing).toBe(false);
  });

  it("cancels pending state when the match ends or the component changes rooms", () => {
    place(); receive("match:snapshot", { status: "complete", gameNumber: 1 });
    expect(current.placing).toBe(false); expect(current.view).toBe(confirmed); expect(place()).toBe(false);
    act(() => root.render(createElement(Harness, { code: "OTHER1" })));
    expect(current.view).toBeNull(); expect(current.placing).toBe(false);
    act(() => vi.advanceTimersByTime(8000));
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid rows, missing cards, opponent turns, full rows and pending tricks", () => {
    expect(place(-1)).toBe(false); expect(place(99)).toBe(false);
    act(() => expect(current.place("missing", 0)).toBe(false));
    receive("game:view", { ...confirmed, yourTurn: false }); expect(place()).toBe(false);
    const full = structuredClone(confirmed); full.players[0].rows[1] = full.players[0].hand.slice(0, 5);
    receive("game:view", full); expect(place()).toBe(false);
    receive("game:view", { ...confirmed, exhibition: { pending: { kind: "deal" } } }); expect(place()).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled(); expect(current.placing).toBe(false);
  });
});
