import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APPEARANCE_COMBINATION_COUNT,
  APPEARANCE_STORAGE_KEY,
  CARD_DECKS,
  DEFAULT_APPEARANCE,
  INTERFACE_STYLES,
  LEGACY_SUIT_PALETTE_STORAGE_KEY,
  SUIT_PALETTES,
  TABLE_THEMES,
  getAppearanceBootScript,
  isAppearancePreferences,
  loadAppearanceSafely,
  loadAndMigrateAppearance,
  parseAppearanceAttributes,
  parseStoredAppearance,
  persistAppearance,
  resetAppearancePreferences,
  resolveAppearanceTokens,
  updateAppearancePreferences,
  type AppearancePreferences,
  type AppearanceStorage,
} from "../appearance";

function memoryStorage(initial: Record<string, string> = {}): AppearanceStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("appearance preferences", () => {
  it("defines the exact A–1 Classic Green default and retains four-color suits", () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      version: 1,
      interfaceStyle: "A",
      cardDeck: "1",
      tableTheme: "classic-green",
      suitPalette: "four",
    });
  });

  it("publishes three interfaces, ten decks, six tables, and two palettes", () => {
    expect(INTERFACE_STYLES.map(({ id }) => id)).toEqual(["A", "B", "C"]);
    expect(CARD_DECKS.map(({ id }) => id)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    ]);
    expect(CARD_DECKS.map(({ name }) => name)).toEqual([
      "Classic Jumbo Index",
      "Authentic Pip & Court",
      "Four-Color Tournament",
      "Minimal Mobile",
      "Mobile Index-First",
      "Bridge Compact Jumbo",
      "Magnum Accessibility",
      "Night Deck",
      "Retro Pixel",
      "Art Deco Casino",
    ]);
    expect(TABLE_THEMES).toHaveLength(6);
    expect(TABLE_THEMES.map(({ id }) => id)).toEqual([
      "classic-green",
      "midnight-navy",
      "burgundy-club",
      "oled-night",
      "warm-walnut",
      "retro-90s",
    ]);
    expect(TABLE_THEMES.map(({ name }) => name)).toEqual([
      "Classic Green",
      "Midnight Navy",
      "Burgundy Club",
      "OLED Night",
      "Warm Walnut Home Game",
      "Retro 90s",
    ]);
    expect(SUIT_PALETTES.map(({ id }) => id)).toEqual(["two", "four"]);
    expect(APPEARANCE_COMBINATION_COUNT).toBe(360);
  });

  it("ships a production CSS selector for every registered appearance id", () => {
    const css = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    for (const { id } of INTERFACE_STYLES) {
      expect(css).toContain(`[data-interface-style="${id}"]`);
    }
    for (const { id } of CARD_DECKS) {
      expect(css).toContain(`[data-card-deck="${id}"]`);
    }
    for (const { id } of TABLE_THEMES) {
      expect(css).toContain(`[data-table-theme="${id}"]`);
    }
    for (const { id } of SUIT_PALETTES) {
      expect(css).toContain(`[data-suit-palette="${id}"]`);
    }
  });

  it("accepts every one of the 360 registry combinations", () => {
    const combinations: AppearancePreferences[] = [];
    for (const interfaceStyle of INTERFACE_STYLES) {
      for (const cardDeck of CARD_DECKS) {
        for (const tableTheme of TABLE_THEMES) {
          for (const suitPalette of SUIT_PALETTES) {
            const value: AppearancePreferences = {
              version: 1,
              interfaceStyle: interfaceStyle.id,
              cardDeck: cardDeck.id,
              tableTheme: tableTheme.id,
              suitPalette: suitPalette.id,
            };
            expect(isAppearancePreferences(value)).toBe(true);
            expect(parseStoredAppearance(JSON.stringify(value))).toEqual(value);
            combinations.push(value);
          }
        }
      }
    }
    expect(combinations).toHaveLength(360);
  });

  it("resolves complete orthogonal token groups for all 360 combinations", () => {
    let resolvedCount = 0;
    const expectComplete = (value: unknown): void => {
      if (typeof value === "string") {
        expect(value.trim().length).toBeGreaterThan(0);
        return;
      }
      expect(value).toBeTypeOf("object");
      for (const child of Object.values(value as Record<string, unknown>)) {
        expectComplete(child);
      }
    };

    for (const interfaceStyle of INTERFACE_STYLES) {
      for (const cardDeck of CARD_DECKS) {
        for (const tableTheme of TABLE_THEMES) {
          for (const suitPalette of SUIT_PALETTES) {
            const tokens = resolveAppearanceTokens({
              version: 1,
              interfaceStyle: interfaceStyle.id,
              cardDeck: cardDeck.id,
              tableTheme: tableTheme.id,
              suitPalette: suitPalette.id,
            });
            expect(Object.keys(tokens)).toEqual([
              "interface",
              "cardDeck",
              "table",
              "palette",
            ]);
            expectComplete(tokens);
            resolvedCount += 1;
          }
        }
      }
    }

    expect(resolvedCount).toBe(APPEARANCE_COMBINATION_COUNT);
  });

  it("updates and resets preferences without mutating the input", () => {
    const initial = { ...DEFAULT_APPEARANCE };
    const updated = updateAppearancePreferences(initial, {
      interfaceStyle: "C",
      cardDeck: "10",
      tableTheme: "warm-walnut",
      suitPalette: "two",
    });
    expect(updated).toEqual({
      version: 1,
      interfaceStyle: "C",
      cardDeck: "10",
      tableTheme: "warm-walnut",
      suitPalette: "two",
    });
    expect(initial).toEqual(DEFAULT_APPEARANCE);

    const rejected = updateAppearancePreferences(updated, {
      cardDeck: "tampered",
    } as never);
    expect(rejected).toBe(updated);

    const reset = resetAppearancePreferences();
    expect(reset).toEqual(DEFAULT_APPEARANCE);
    expect(reset).not.toBe(DEFAULT_APPEARANCE);
  });

  it("changes each appearance axis without changing the other three", () => {
    const anchor: AppearancePreferences = {
      version: 1,
      interfaceStyle: "C",
      cardDeck: "10",
      tableTheme: "warm-walnut",
      suitPalette: "two",
    };
    const axes = {
      interfaceStyle: INTERFACE_STYLES.map(({ id }) => id),
      cardDeck: CARD_DECKS.map(({ id }) => id),
      tableTheme: TABLE_THEMES.map(({ id }) => id),
      suitPalette: SUIT_PALETTES.map(({ id }) => id),
    } as const;

    for (const [axis, values] of Object.entries(axes)) {
      for (const value of values) {
        const updated = updateAppearancePreferences(anchor, { [axis]: value });
        expect(updated[axis as keyof AppearancePreferences]).toBe(value);
        for (const otherAxis of Object.keys(axes)) {
          if (otherAxis !== axis) {
            expect(updated[otherAxis as keyof AppearancePreferences]).toBe(
              anchor[otherAxis as keyof AppearancePreferences],
            );
          }
        }
      }
    }
  });

  it("falls back safely when storage reads fail and preserves reads when writes fail", () => {
    const deniedRead: AppearanceStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    expect(loadAppearanceSafely(deniedRead)).toEqual(DEFAULT_APPEARANCE);
    expect(loadAppearanceSafely(null)).toEqual(DEFAULT_APPEARANCE);

    const chosen: AppearancePreferences = {
      version: 1,
      interfaceStyle: "B",
      cardDeck: "8",
      tableTheme: "oled-night",
      suitPalette: "four",
    };
    const deniedWrite: AppearanceStorage = {
      getItem: (key) =>
        key === APPEARANCE_STORAGE_KEY ? JSON.stringify(chosen) : null,
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadAppearanceSafely(deniedWrite)).toEqual(chosen);
  });

  it("keeps every suit at 6:1 or better on light and Night card stock", () => {
    for (const deck of CARD_DECKS) {
      for (const palette of SUIT_PALETTES) {
        const ink = deck.id === "8" ? palette.tokens.dark : palette.tokens.light;
        for (const suitColor of Object.values(ink)) {
          expect(contrastRatio(suitColor, deck.tokens.face)).toBeGreaterThanOrEqual(6);
        }
      }
    }

    const oled = TABLE_THEMES.find(({ id }) => id === "oled-night");
    expect(oled).toBeDefined();
    expect(contrastRatio(oled!.tokens.foreground, oled!.tokens.felt)).toBeGreaterThanOrEqual(6);
    expect(contrastRatio(oled!.tokens.muted, oled!.tokens.felt)).toBeGreaterThanOrEqual(6);
    expect(contrastRatio(oled!.tokens.accent, oled!.tokens.felt)).toBeGreaterThanOrEqual(6);
  });

  it("rejects malformed, unversioned, and out-of-registry records", () => {
    expect(parseStoredAppearance("not json")).toEqual(DEFAULT_APPEARANCE);
    expect(parseStoredAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, version: 2 }))).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(
      parseStoredAppearance(
        JSON.stringify({
          ...DEFAULT_APPEARANCE,
          interfaceStyle: "C",
          cardDeck: "11",
          tableTheme: "midnight-navy",
        }),
      ),
    ).toEqual({
      ...DEFAULT_APPEARANCE,
      interfaceStyle: "C",
      cardDeck: "1",
      tableTheme: "midnight-navy",
    });
    expect(isAppearancePreferences(null)).toBe(false);
  });

  it("migrates either valid legacy palette while keeping A–1 and Classic Green", () => {
    for (const legacy of ["two", "four"]) {
      const storage = memoryStorage({ [LEGACY_SUIT_PALETTE_STORAGE_KEY]: legacy });
      const migrated = loadAndMigrateAppearance(storage);
      expect(migrated).toEqual({ ...DEFAULT_APPEARANCE, suitPalette: legacy });
      expect(JSON.parse(storage.values.get(APPEARANCE_STORAGE_KEY) ?? "null")).toEqual(migrated);
      expect(storage.values.get(LEGACY_SUIT_PALETTE_STORAGE_KEY)).toBe(legacy);
    }
  });

  it("prefers a valid versioned record over the legacy palette", () => {
    const chosen: AppearancePreferences = {
      version: 1,
      interfaceStyle: "C",
      cardDeck: "9",
      tableTheme: "oled-night",
      suitPalette: "four",
    };
    expect(parseStoredAppearance(JSON.stringify(chosen), "two")).toEqual(chosen);
  });

  it("uses a valid legacy palette when the versioned record is corrupt", () => {
    expect(parseStoredAppearance("{broken", "two")).toEqual({
      ...DEFAULT_APPEARANCE,
      suitPalette: "two",
    });
    expect(parseStoredAppearance(null, "sepia")).toEqual(DEFAULT_APPEARANCE);
  });

  it("persists only validated records and synchronizes the legacy key", () => {
    const storage = memoryStorage();
    const chosen: AppearancePreferences = {
      version: 1,
      interfaceStyle: "B",
      cardDeck: "6",
      tableTheme: "midnight-navy",
      suitPalette: "two",
    };
    persistAppearance(storage, chosen);
    expect(storage.values.get(APPEARANCE_STORAGE_KEY)).toBe(JSON.stringify(chosen));
    expect(storage.values.get(LEGACY_SUIT_PALETTE_STORAGE_KEY)).toBe("two");
  });

  it("boots all four validated root attributes before paint", () => {
    const script = getAppearanceBootScript();
    expect(script).toContain("data-interface-style");
    expect(script).toContain("data-card-deck");
    expect(script).toContain("data-table-theme");
    expect(script).toContain("data-suit-palette");
    expect(script).toContain('meta[name="theme-color"]');
    expect(script).toContain("data-appearance-booted");
  });

  it("hydrates controls from independently validated pre-paint attributes", () => {
    expect(
      parseAppearanceAttributes({
        interfaceStyle: "B",
        cardDeck: "8",
        tableTheme: "oled-night",
        suitPalette: "two",
      }),
    ).toEqual({
      version: 1,
      interfaceStyle: "B",
      cardDeck: "8",
      tableTheme: "oled-night",
      suitPalette: "two",
    });

    expect(
      parseAppearanceAttributes({
        interfaceStyle: "C",
        cardDeck: "unknown",
        tableTheme: "retro-90s",
        suitPalette: "invalid",
      }),
    ).toEqual({
      ...DEFAULT_APPEARANCE,
      interfaceStyle: "C",
      tableTheme: "retro-90s",
    });
  });

  it("applies independent boot fallbacks and migrates the legacy palette", () => {
    const storage = memoryStorage({
      [APPEARANCE_STORAGE_KEY]: JSON.stringify({
        version: 1,
        interfaceStyle: "C",
        cardDeck: "tampered",
        tableTheme: "midnight-navy",
        suitPalette: "invalid",
      }),
      [LEGACY_SUIT_PALETTE_STORAGE_KEY]: "two",
    });
    const attributes = new Map<string, string>();
    let themeColor = "";
    const documentStub = {
      documentElement: {
        setAttribute: (name: string, value: string) => void attributes.set(name, value),
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? { setAttribute: (_name: string, value: string) => void (themeColor = value) }
          : null,
    };

    const boot = new Function("document", "localStorage", getAppearanceBootScript());
    boot(documentStub, storage);

    expect(Object.fromEntries(attributes)).toMatchObject({
      "data-interface-style": "C",
      "data-card-deck": "1",
      "data-table-theme": "midnight-navy",
      "data-suit-palette": "two",
      "data-deck": "two",
    });
    expect(themeColor).toBe("#0b1828");
    expect(JSON.parse(storage.values.get(APPEARANCE_STORAGE_KEY) ?? "null")).toMatchObject({
      interfaceStyle: "C",
      cardDeck: "1",
      tableTheme: "midnight-navy",
      suitPalette: "two",
    });
  });
});

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
