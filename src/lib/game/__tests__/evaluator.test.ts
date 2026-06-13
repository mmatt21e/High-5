import { describe, it, expect } from "vitest";
import type { Card, Rank, Suit } from "../cards";
import {
  HandCategory,
  evaluateHand,
  compareHands,
} from "../evaluator";

// Compact card helper: "As" "Td" "2c" -> Card
function c(str: string): Card {
  const rankMap: Record<string, Rank> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    T: 10, J: 11, Q: 12, K: 13, A: 14,
  };
  const rank = rankMap[str[0]];
  const suit = str[1] as Suit;
  return { rank, suit };
}
const h = (...strs: string[]) => strs.map(c);

describe("evaluateHand categories", () => {
  it("detects a royal/straight flush", () => {
    expect(evaluateHand(h("Ts", "Js", "Qs", "Ks", "As")).category).toBe(
      HandCategory.StraightFlush,
    );
  });

  it("detects the wheel straight flush (A-2-3-4-5)", () => {
    const s = evaluateHand(h("Ah", "2h", "3h", "4h", "5h"));
    expect(s.category).toBe(HandCategory.StraightFlush);
    expect(s.tiebreakers).toEqual([5]); // five-high
  });

  it("detects four of a kind", () => {
    expect(evaluateHand(h("9c", "9d", "9h", "9s", "2c")).category).toBe(
      HandCategory.FourOfAKind,
    );
  });

  it("detects a full house", () => {
    expect(evaluateHand(h("Kc", "Kd", "Kh", "4s", "4c")).category).toBe(
      HandCategory.FullHouse,
    );
  });

  it("detects a flush", () => {
    expect(evaluateHand(h("2s", "5s", "9s", "Js", "Ks")).category).toBe(
      HandCategory.Flush,
    );
  });

  it("detects a straight (and the wheel)", () => {
    expect(evaluateHand(h("4c", "5d", "6h", "7s", "8c")).category).toBe(
      HandCategory.Straight,
    );
    const wheel = evaluateHand(h("Ac", "2d", "3h", "4s", "5c"));
    expect(wheel.category).toBe(HandCategory.Straight);
    expect(wheel.tiebreakers).toEqual([5]);
  });

  it("detects trips, two pair, pair, high card", () => {
    expect(evaluateHand(h("7c", "7d", "7h", "Ks", "2c")).category).toBe(
      HandCategory.ThreeOfAKind,
    );
    expect(evaluateHand(h("Jc", "Jd", "4h", "4s", "9c")).category).toBe(
      HandCategory.TwoPair,
    );
    expect(evaluateHand(h("Ac", "Ad", "7h", "4s", "2c")).category).toBe(
      HandCategory.Pair,
    );
    expect(evaluateHand(h("Ac", "Jd", "8h", "4s", "2c")).category).toBe(
      HandCategory.HighCard,
    );
  });

  it("throws on non-5-card hands", () => {
    expect(() => evaluateHand(h("Ac", "Jd"))).toThrow();
  });
});

describe("compareHands tie-breaking", () => {
  it("ranks higher category over lower", () => {
    expect(compareHands(h("2c", "2d", "2h", "5s", "6c"), h("Ac", "Kd", "Qh", "Js", "9c"))).toBeGreaterThan(0);
  });

  it("breaks pair ties by pair rank then kickers", () => {
    const aces = h("Ac", "Ad", "Kh", "Qs", "2c");
    const kings = h("Kc", "Kd", "Ah", "Qs", "2c");
    expect(compareHands(aces, kings)).toBeGreaterThan(0);
  });

  it("breaks identical-pair ties by kicker", () => {
    const hi = h("Ac", "Ad", "Kh", "Qs", "3c");
    const lo = h("Ah", "As", "Kd", "Qc", "2c");
    expect(compareHands(hi, lo)).toBeGreaterThan(0);
  });

  it("returns 0 for ranking-equivalent hands (different suits)", () => {
    const a = h("Ac", "Kd", "Qh", "Js", "9c");
    const b = h("As", "Kh", "Qd", "Jc", "9d");
    expect(compareHands(a, b)).toBe(0);
  });

  it("ranks a straight below a flush below a full house", () => {
    const straight = h("4c", "5d", "6h", "7s", "8c");
    const flush = h("2s", "5s", "9s", "Js", "Ks");
    const boat = h("Kc", "Kd", "Kh", "4s", "4c");
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
    expect(compareHands(boat, flush)).toBeGreaterThan(0);
  });
});
