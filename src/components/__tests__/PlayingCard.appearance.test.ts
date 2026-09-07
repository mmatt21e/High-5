import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_PREVIEW_CARDS,
  CARD_GEOMETRY,
} from "../../lib/cardAppearance";
import { CARD_DECKS } from "../../lib/appearance";

describe("mobile playing-card appearance", () => {
  it("keeps the complete rank and suit inside every visible fan peek", () => {
    for (const [size, geometry] of Object.entries(CARD_GEOMETRY)) {
      const indexBottom =
        geometry.indexTop +
        Math.max(geometry.rankLine, geometry.suitLine);

      expect(indexBottom, `${size} index bottom`).toBeLessThanOrEqual(
        geometry.peek - 2,
      );
      expect(geometry.rankFont, `${size} rank font`).toBeGreaterThanOrEqual(14);
      expect(geometry.suitFont, `${size} suit font`).toBeGreaterThanOrEqual(10);
      expect(geometry.hpx - geometry.peek, `${size} overlap`).toBeGreaterThan(0);
    }
  });

  it("protects the upper index from deck-specific scaling or opacity", () => {
    const css = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain('[data-card-deck] .playing-card-index-top');
    expect(css).toMatch(
      /\[data-card-deck\] \.playing-card-index-top\s*\{[^}]*transform:\s*none/s,
    );

    const minimalBlock = css.match(
      /\[data-card-deck="4"\] \.playing-card-index-top\s*\{([^}]*)\}/s,
    );
    expect(minimalBlock?.[1]).not.toMatch(/opacity:\s*(?:0|\.[0-9])/);
  });

  it("previews every suit, a court, a number, an ace, and a card back", () => {
    expect(APPEARANCE_PREVIEW_CARDS.map(({ suit }) => suit).sort()).toEqual([
      "c",
      "d",
      "h",
      "s",
    ]);
    expect(APPEARANCE_PREVIEW_CARDS.some(({ rank }) => rank === 14)).toBe(true);
    expect(APPEARANCE_PREVIEW_CARDS.some(({ rank }) => rank >= 11 && rank <= 13)).toBe(true);
    expect(APPEARANCE_PREVIEW_CARDS.some(({ rank }) => rank >= 2 && rank <= 10)).toBe(true);

    const settingsSource = readFileSync(
      new URL("../AppearanceSettings.tsx", import.meta.url),
      "utf8",
    );
    expect(settingsSource).toContain("<CardBack");
    expect(settingsSource).toContain("data-preview-deck");
    expect(CARD_DECKS).toHaveLength(10);

    const howToSource = readFileSync(
      new URL("../../app/how-to-play/page.tsx", import.meta.url),
      "utf8",
    );
    expect(howToSource).toContain("<details");
    expect(howToSource).toContain("<AppearanceSettings showHeading={false}");
  });

  it("keeps the 320px settings path bounded and synchronized before reveal", () => {
    const css = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.settings-dialog\s*\{[^}]*100dvh/s);
    expect(css).toContain(
      "grid-template-columns: repeat(5, minmax(0, 1fr))",
    );
    expect(css).toMatch(
      /\.appearance-preview-cards \.playing-card\s*\{[^}]*width:\s*100%[^}]*aspect-ratio:\s*5 \/ 7/s,
    );
    expect(css).toContain('[data-appearance-ready="true"] .appearance-settings');

    const providerSource = readFileSync(
      new URL("../AppearanceProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(providerSource).toContain("parseAppearanceAttributes");
    expect(providerSource).toContain("appearanceReady");
  });

  it("keeps appearance-only code free of requests and socket operations", () => {
    const sources = [
      new URL("../../lib/appearance.ts", import.meta.url),
      new URL("../AppearanceProvider.tsx", import.meta.url),
      new URL("../AppearanceSettings.tsx", import.meta.url),
      new URL("../PlayingCard.tsx", import.meta.url),
    ].map((file) => readFileSync(file, "utf8"));

    for (const source of sources) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/\bWebSocket\b|\bsocket\.(?:emit|on)\s*\(/);
    }
  });
});
