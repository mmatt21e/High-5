"use client";

import { useEffect, useState } from "react";

type Deck = "two" | "four";

const SUITS: { s: "s" | "h" | "d" | "c"; label: string }[] = [
  { s: "s", label: "♠" },
  { s: "h", label: "♥" },
  { s: "d", label: "♦" },
  { s: "c", label: "♣" },
];

// Explicit swatch colours so each preview shows its own scheme regardless of
// the globally-applied deck theme.
const SWATCH: Record<Deck, Record<"s" | "h" | "d" | "c", string>> = {
  two: { s: "#141414", h: "#c62828", d: "#c62828", c: "#141414" },
  four: { s: "#141414", h: "#c62828", d: "#1565c0", c: "#2e7d32" },
};

/** Lets the player choose a two-colour or four-colour deck (saved per device). */
export function DeckToggle() {
  const [deck, setDeck] = useState<Deck>("four");

  useEffect(() => {
    const saved = (localStorage.getItem("fiveo-deck") as Deck) || "four";
    setDeck(saved);
  }, []);

  function choose(d: Deck) {
    setDeck(d);
    try {
      localStorage.setItem("fiveo-deck", d);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-deck", d);
  }

  return (
    <div>
      <div className="mb-2 text-sm font-bold">Card deck</div>
      <div className="grid grid-cols-2 gap-2">
        {(["two", "four"] as Deck[]).map((d) => (
          <button
            key={d}
            onClick={() => choose(d)}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
              deck === d
                ? "border-gold bg-gold/15"
                : "border-white/15 bg-black/20"
            }`}
          >
            <span className="text-xs font-semibold">
              {d === "two" ? "2-color" : "4-color"}
            </span>
            {/* Sample swatch previewing this scheme's suit colours. */}
            <span className="flex gap-1 rounded bg-card px-1.5 py-0.5">
              {SUITS.map((x) => (
                <span
                  key={x.s}
                  className="text-sm font-black"
                  style={{ color: SWATCH[d][x.s] }}
                >
                  {x.label}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
