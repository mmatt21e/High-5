import { describe, expect, it } from "vitest";
import { buildDeck, cardId, seededRng } from "../cards";
import { createGame, discardCard, evaluateGame, placeCard, viewFor } from "../engine";
import { chooseWildcardMove, exhibitionAction, finishWildcardTurn, prepareWildcardTurn, startExhibition } from "../exhibition";
import { TRICKS, type ExhibitionAction, type Trick } from "../exhibitionTypes";
import type { GameState } from "../types";
import { exhibitionPayloadSchema } from "../../realtime/validation";

function fixture(seed = 42) {
  const game = createGame({ userId: "human", displayName: "Human" }, { userId: "bot", displayName: "Wildcard Edge" }, { seed, firstLead: 0 });
  startExhibition(game, `test-${seed}`, seededRng(seed));
  for (let i = 0; i < 9; i++) {
    const seat = game.toMove, player = game.players[seat];
    const count = player.rows.flat().length;
    placeCard(game, seat, cardId(player.hand[0]), count % 4);
  }
  return game;
}
function act(game: GameState, action: ExhibitionAction["action"], extra: Partial<ExhibitionAction> = {}) {
  exhibitionAction(game, 0, { token: viewFor(game, 0).exhibition!.token, action, ...extra });
}
function conserve(game: GameState) {
  const cards = [...game.deck, ...game.players.flatMap(p => [...p.hand, ...p.rows.flat()]), ...(game.exhibition?.pending?.offers ?? [])].map(cardId);
  expect(new Set(cards).size).toBe(cards.length);
  expect(cards.length).toBe(52 - game.players.filter(p => p.discardUsed).length);
  expect(game.players.every(p => p.rows.every(row => row.length <= 5))).toBe(true);
}

describe("Wildcard exhibition", () => {
  it.each(Object.keys(TRICKS) as Trick[])("resolves %s without duplicating or destroying cards", (kind) => {
    const game = fixture();
    const beforeRows = JSON.stringify(game.players[1].rows);
    const beforeMarker = game.players[1].lastPlacement;
    const beforeAces = game.deck.filter(card => card.rank === 14).length;
    const beforeHand = game.players[0].hand.map(cardId);
    game.exhibition!.pending = { kind, cheating: true, power: "redraw" };
    if (kind === "deal") {
      act(game, "accept"); conserve(game);
      expect(viewFor(game, 0).exhibition!.pending!.offers).toHaveLength(2);
      const chosen = cardId(game.exhibition!.pending!.offers![1]);
      act(game, "choose", { cardId: cardId(game.players[0].hand[0]), offerIndex: 1 });
      expect(game.players[0].hand.map(cardId)).toContain(chosen);
      expect(game.deck.map(cardId)).toContain(beforeHand[0]);
    } else act(game, "allow");
    conserve(game);
    expect(game.exhibition!.pending).toBeNull();
    expect(game.exhibition!.tricksUsed).toBe(1);
    if (kind === "switcheroo" || kind === "deal") expect(JSON.stringify(game.players[1].rows)).not.toBe(beforeRows);
    if (kind === "sleeve" || kind === "caught") expect(game.deck.filter(card => card.rank === 14)).toHaveLength(beforeAces - 1);
    if (kind === "rethink") {
      expect(game.players[1].lastPlacement!.row).not.toBe(beforeMarker!.row);
      expect(game.players[1].lastPlacement!.cardId).toBe(beforeMarker!.cardId);
    }
    if (kind === "marked" || kind === "gift" || kind === "shared") expect(game.exhibition!.redraws).toBe(2);
  });

  it("stages an announcement before touching cards, redacts the bluff and future order, and rejects stale responses", () => {
    const game = fixture(); game.exhibition!.remaining = ["caught"];
    const board = JSON.stringify([game.players, game.deck]);
    expect(prepareWildcardTurn(game, () => 0)).toBe(true);
    expect(JSON.stringify([game.players, game.deck])).toBe(board);
    const view = viewFor(game, 0), serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"cheating"');
    expect(serialized).not.toContain('"remaining"');
    expect(view.players[1].hand.every(c => c.state === "hidden")).toBe(true);
    const token = view.exhibition!.token;
    act(game, "block");
    expect(game.exhibition!.playFair).toBe(0);
    expect(JSON.stringify([game.players, game.deck])).toBe(board);
    expect(() => exhibitionAction(game, 0, { token, action: "allow" })).toThrow("table changed");
  });

  it.each([true, false])("resolves a free challenge when cheating is %s", cheating => {
    const game = fixture(); game.exhibition!.pending = { kind: "caught", cheating };
    const hand = JSON.stringify(game.players[1].hand);
    act(game, "challenge");
    expect(game.exhibition!.redraws).toBe(cheating ? 2 : 1);
    expect(JSON.stringify(game.players[1].hand) === hand).toBe(cheating);
    conserve(game);
  });

  it("changes the concealed-hand decision only during an announced peek", () => {
    const game = fixture(); game.exhibition!.pending = { kind: "marked" };
    act(game, "allow");
    expect(game.exhibition!.peekNext).toBe(true);
    const move = chooseWildcardMove(game, () => 0.5)!;
    expect(game.players[1].hand.map(cardId)).toContain(move.cardId);
    finishWildcardTurn(game);
    expect(game.exhibition!.peekNext).toBe(false);
    expect(game.exhibition!.redraws).toBe(2);
  });

  it("uses the actual peeked hand to choose which high card it can afford to play", () => {
    const cards = (ids: string[]) => ids.map(id => buildDeck().find(card => cardId(card) === id)!);
    const game = createGame({ userId: "h", displayName: "H" }, { userId: "b", displayName: "B" }, { seed: 42, firstLead: 1 });
    game.players[1].hand = cards(["14s", "14h", "13s", "13h", "12d", "2c"]);
    function opponent(ids: string[]) {
      game.players[0].hand = cards(ids);
      const held = new Set(game.players.flatMap(p => p.hand).map(cardId));
      game.deck = buildDeck().filter(card => !held.has(cardId(card)));
    }
    startExhibition(game, "peek-test");
    opponent(["3s", "4h", "6s", "8h", "9d"]);
    const standard = chooseWildcardMove(game, () => 0.5);
    game.exhibition!.peekNext = true;
    expect(chooseWildcardMove(game, () => 0.5)!.cardId).toBe("14s");
    opponent(["14c", "14d", "11c", "9c", "3c"]);
    expect(chooseWildcardMove(game, () => 0.5)!.cardId).toBe("13s");
    finishWildcardTurn(game);
    expect(chooseWildcardMove(game, () => 0.5)).toEqual(standard);
    conserve(game);
  });

  it("offers a shared swap and lets the human use both free powers without spending a turn", () => {
    const game = fixture(); game.exhibition!.pending = { kind: "shared", power: "swap" };
    act(game, "allow");
    expect(game.exhibition!.swaps).toBe(2);
    const bot = chooseWildcardMove(game, () => 0.5)!;
    if (bot.kind === "place") placeCard(game, 1, bot.cardId, bot.row);
    else discardCard(game, 1, bot.cardId);
    const counts = game.players.map(p => p.rows.flat().length);
    act(game, "redraw", { cardId: cardId(game.players[0].hand[0]) });
    act(game, "swap", { cardId: cardId(game.players[0].rows[0][0]), otherCardId: cardId(game.players[0].rows[1][0]) });
    expect(game.toMove).toBe(0);
    expect(game.players.map(p => p.rows.flat().length)).toEqual(counts);
    conserve(game);
  });

  it("rejects invalid trades, ranked powers, off-turn use, bot-seat use, and move bypasses without mutation", () => {
    const game = fixture(); game.exhibition!.pending = { kind: "deal" }; act(game, "accept");
    const before = JSON.stringify(game);
    expect(() => act(game, "choose", { cardId: "99s", offerIndex: 9 })).toThrow();
    expect(() => placeCard(game, 1, cardId(game.players[1].hand[0]), 0)).toThrow("Resolve");
    expect(() => discardCard(game, 1, cardId(game.players[1].hand[0]))).toThrow("Resolve");
    expect(JSON.stringify(game)).toBe(before);
    expect(() => exhibitionAction(game, 1, { token: viewFor(game, 0).exhibition!.token, action: "allow" })).toThrow();
    game.exhibition!.pending = null;
    expect(() => act(game, "redraw", { cardId: cardId(game.players[0].hand[0]) })).toThrow("your turn");
    delete game.exhibition;
    expect(() => act(game, "allow")).toThrow();
    expect(exhibitionPayloadSchema.safeParse({ token: "x", action: "choose", offerIndex: -1 }).success).toBe(false);
    expect(exhibitionPayloadSchema.safeParse({ token: "x", action: "allow", cheating: false }).success).toBe(false);
  });

  it("completes seeded games with the full rotating trick set, bounded prompts, low-row scoring and conserved cards", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed);
      const game = createGame({ userId: "h", displayName: "H" }, { userId: "b", displayName: "B" }, { seed });
      startExhibition(game, String(seed), rng);
      let actions = 0;
      while (game.phase === "playing" && actions++ < 90) {
        if (game.toMove === 1) {
          prepareWildcardTurn(game, rng);
          const pending = game.exhibition!.pending;
          if (pending) {
            seen.add(pending.kind);
            if (pending.kind === "deal") {
              act(game, "accept");
              // Reconnect in the middle of choosing: offers and response token persist.
              const restored = JSON.parse(JSON.stringify(game)) as GameState;
              expect(viewFor(restored, 0)).toEqual(viewFor(game, 0));
              act(game, "choose", { cardId: cardId(game.players[0].hand[0]), offerIndex: 0 });
            } else act(game, "allow");
          }
          const move = chooseWildcardMove(game, rng)!;
          if (move.kind === "place") placeCard(game, 1, move.cardId, move.row);
          else discardCard(game, 1, move.cardId);
          finishWildcardTurn(game);
        } else {
          const p = game.players[0];
          placeCard(game, 0, cardId(p.hand[0]), viewFor(game, 0).legalRows[0]);
        }
        conserve(game);
      }
      expect(game.phase).toBe("complete");
      expect(game.exhibition!.tricksUsed).toBeLessThanOrEqual(8);
      const low = game.exhibition!.lowRow, result = game.result!;
      const standard = structuredClone(game); delete standard.exhibition;
      const normal = evaluateGame(standard);
      expect(result.hands[low].winner).toBe(normal.hands[low].winner === null ? null : 1 - normal.hands[low].winner!);
      for (let row = 0; row < 5; row++) if (row !== low) expect(result.hands[row]).toEqual(normal.hands[row]);
    }
    expect([...seen].sort()).toEqual(Object.keys(TRICKS).sort());
  });
});
