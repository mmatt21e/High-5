/**
 * Device-local appearance preferences. These values affect presentation only;
 * they are deliberately kept out of game state and realtime messages.
 */

export const APPEARANCE_VERSION = 1 as const;
export const APPEARANCE_STORAGE_KEY = "fiveo-appearance:v1";
export const LEGACY_SUIT_PALETTE_STORAGE_KEY = "fiveo-deck";

export interface InterfaceTokens {
  titleFont: string;
  bodyFont: string;
  panelSurface: string;
  panelBorder: string;
  panelShadow: string;
  panelRadius: string;
  controlRadius: string;
  headingTracking: string;
  density: string;
}

export interface CardDeckTokens {
  face: string;
  edge: string;
  back: string;
  ink: string;
  red: string;
  typography: string;
  layout: string;
  cornerScale: string;
  motif: string;
}

export interface TableThemeTokens {
  feltHighlight: string;
  felt: string;
  feltShadow: string;
  rail: string;
  accent: string;
  foreground: string;
  muted: string;
  texture: string;
}

export interface SuitInkTokens {
  spades: string;
  hearts: string;
  diamonds: string;
  clubs: string;
}

export interface SuitPaletteTokens {
  light: SuitInkTokens;
  dark: SuitInkTokens;
}

export const INTERFACE_STYLES = [
  {
    id: "A",
    name: "Classic Cardroom",
    description: "Familiar green felt, brass accents, and a traditional card-table feel.",
    tokens: {
      titleFont: 'Georgia, "Times New Roman", serif',
      bodyFont: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      panelSurface: "rgba(5, 18, 12, 0.76)",
      panelBorder: "rgba(232, 196, 106, 0.24)",
      panelShadow: "0 12px 28px rgba(0, 0, 0, 0.22)",
      panelRadius: "0.75rem",
      controlRadius: "0.7rem",
      headingTracking: "0.01em",
      density: "comfortable",
    },
  },
  {
    id: "B",
    name: "Modern Tournament",
    description: "A crisp, compact interface inspired by live tournament displays.",
    tokens: {
      titleFont: 'Arial Narrow, "Roboto Condensed", ui-sans-serif, system-ui, sans-serif',
      bodyFont: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      panelSurface: "rgba(2, 10, 17, 0.88)",
      panelBorder: "rgba(255, 255, 255, 0.2)",
      panelShadow: "0 8px 18px rgba(0, 0, 0, 0.34)",
      panelRadius: "0.3rem",
      controlRadius: "0.28rem",
      headingTracking: "0.075em",
      density: "compact",
    },
  },
  {
    id: "C",
    name: "Quiet Premium",
    description: "A restrained, low-distraction interface with an editorial finish.",
    tokens: {
      titleFont: 'Iowan Old Style, Baskerville, Georgia, "Times New Roman", serif',
      bodyFont: 'Avenir Next, Avenir, ui-sans-serif, system-ui, sans-serif',
      panelSurface: "rgba(16, 16, 15, 0.66)",
      panelBorder: "rgba(239, 226, 199, 0.18)",
      panelShadow: "0 1px 0 rgba(255, 255, 255, 0.05)",
      panelRadius: "0.18rem",
      controlRadius: "0.18rem",
      headingTracking: "0.025em",
      density: "spacious",
    },
  },
] as const;

export const CARD_DECKS = [
  { id: "1", name: "Classic Jumbo Index", description: "Large traditional corner indexes for quick mobile reading.", tokens: { face: "#fffdf7", edge: "#c8c1b4", back: "#741f2b", ink: "#111827", red: "#9f1239", typography: "traditional-serif", layout: "jumbo-hero", cornerScale: "1", motif: "linen-check" } },
  { id: "2", name: "Authentic Pip & Court", description: "Traditional pip layouts and familiar court-card structure.", tokens: { face: "#fffaf0", edge: "#bcb39f", back: "#173b64", ink: "#111827", red: "#9f1239", typography: "traditional-serif", layout: "pip-and-court", cornerScale: "0.82", motif: "crosshatch" } },
  { id: "3", name: "Four-Color Tournament", description: "Competition-style suit separation with bold indexes.", tokens: { face: "#ffffff", edge: "#b7bec6", back: "#123c70", ink: "#111827", red: "#9f1239", typography: "condensed-sans", layout: "tournament-band", cornerScale: "1.08", motif: "diagonal-stripe" } },
  { id: "4", name: "Minimal Mobile", description: "Clean faces with only the information needed during play.", tokens: { face: "#f9fbfc", edge: "#d0d5da", back: "#303a43", ink: "#111827", red: "#9f1239", typography: "modern-sans", layout: "minimal-center", cornerScale: "0.9", motif: "single-line" } },
  { id: "5", name: "Mobile Index-First", description: "Extra-prominent rank and suit indexes for narrow screens.", tokens: { face: "#fffef2", edge: "#c9c6ad", back: "#285744", ink: "#111827", red: "#9f1239", typography: "heavy-sans", layout: "index-first", cornerScale: "1.28", motif: "five-grid" } },
  { id: "6", name: "Bridge Compact Jumbo", description: "Compact proportions paired with oversized indexes.", tokens: { face: "#fffdf8", edge: "#bbb5aa", back: "#582241", ink: "#111827", red: "#9f1239", typography: "narrow-serif", layout: "bridge-jumbo", cornerScale: "1.12", motif: "micro-weave" } },
  { id: "7", name: "Magnum Accessibility", description: "Maximum contrast and exceptionally large card identifiers.", tokens: { face: "#ffffff", edge: "#111827", back: "#111827", ink: "#111827", red: "#9f1239", typography: "maximum-sans", layout: "magnum-center", cornerScale: "1.42", motif: "contrast-block" } },
  { id: "8", name: "Night Deck", description: "Dark card stock with luminous high-contrast markings.", tokens: { face: "#071014", edge: "#66838a", back: "#061f25", ink: "#f8fafc", red: "#ff9caf", typography: "luminous-sans", layout: "night-hero", cornerScale: "1.08", motif: "luminous-diamond" } },
  { id: "9", name: "Retro Pixel", description: "Crisp pixel-era card marks with strong shape recognition.", tokens: { face: "#fff8dc", edge: "#111827", back: "#17365d", ink: "#111827", red: "#9f1239", typography: "pixel-mono", layout: "pixel-center", cornerScale: "1.04", motif: "pixel-checker" } },
  { id: "10", name: "Art Deco Casino", description: "Geometric casino ornament with traditional card hierarchy.", tokens: { face: "#fff8e8", edge: "#9b7736", back: "#142f2b", ink: "#111827", red: "#9f1239", typography: "deco-narrow", layout: "deco-frame", cornerScale: "0.96", motif: "sunburst" } },
] as const;

export const TABLE_THEMES = [
  { id: "classic-green", name: "Classic Green", themeColor: "#0a2a1a", tokens: { feltHighlight: "#185f39", felt: "#0e3a24", feltShadow: "#061a10", rail: "#4b2a1d", accent: "#e8c46a", foreground: "#f4f6f5", muted: "#b7c2bc", texture: "woven-felt" } },
  { id: "midnight-navy", name: "Midnight Navy", themeColor: "#0b1828", tokens: { feltHighlight: "#183c5a", felt: "#102b44", feltShadow: "#07131f", rail: "#111c2a", accent: "#f4c95d", foreground: "#f5f8fb", muted: "#b8c4ce", texture: "navy-radial" } },
  { id: "burgundy-club", name: "Burgundy Club", themeColor: "#321319", tokens: { feltHighlight: "#6c2935", felt: "#4a1c26", feltShadow: "#210b10", rail: "#241619", accent: "#e3b45b", foreground: "#fff8f3", muted: "#cdbab5", texture: "club-felt" } },
  { id: "oled-night", name: "OLED Night", themeColor: "#000000", tokens: { feltHighlight: "#111817", felt: "#030505", feltShadow: "#000000", rail: "#0b0d0d", accent: "#d9ff57", foreground: "#ffffff", muted: "#c0c8c5", texture: "oled-flat" } },
  { id: "warm-walnut", name: "Warm Walnut Home Game", themeColor: "#302118", tokens: { feltHighlight: "#594332", felt: "#3e2b20", feltShadow: "#21150f", rail: "#6e4225", accent: "#e5bb76", foreground: "#fff9f0", muted: "#d0c0ae", texture: "wood-grain" } },
  { id: "retro-90s", name: "Retro 90s", themeColor: "#10273a", tokens: { feltHighlight: "#15556b", felt: "#12374c", feltShadow: "#091a28", rail: "#452c5d", accent: "#52e0db", foreground: "#f7fdff", muted: "#b2ccd2", texture: "pixel-grid" } },
] as const;

export const SUIT_PALETTES = [
  { id: "two", name: "Traditional 2-color", tokens: { light: { spades: "#111827", hearts: "#9f1239", diamonds: "#9f1239", clubs: "#111827" }, dark: { spades: "#f8fafc", hearts: "#ff9caf", diamonds: "#ff9caf", clubs: "#f8fafc" } } },
  { id: "four", name: "Accessible 4-color", tokens: { light: { spades: "#111827", hearts: "#9f1239", diamonds: "#0047ab", clubs: "#00642e" }, dark: { spades: "#f8fafc", hearts: "#ff9caf", diamonds: "#7ec8ff", clubs: "#7ee29a" } } },
] as const;

export type InterfaceStyle = (typeof INTERFACE_STYLES)[number]["id"];
export type CardDeck = (typeof CARD_DECKS)[number]["id"];
export type TableTheme = (typeof TABLE_THEMES)[number]["id"];
export type SuitPalette = (typeof SUIT_PALETTES)[number]["id"];

export interface AppearancePreferences {
  version: typeof APPEARANCE_VERSION;
  interfaceStyle: InterfaceStyle;
  cardDeck: CardDeck;
  tableTheme: TableTheme;
  suitPalette: SuitPalette;
}

export interface AppearanceAttributeSource {
  interfaceStyle?: unknown;
  cardDeck?: unknown;
  tableTheme?: unknown;
  suitPalette?: unknown;
}

export interface ResolvedAppearanceTokens {
  interface: InterfaceTokens;
  cardDeck: CardDeckTokens;
  table: TableThemeTokens;
  palette: SuitPaletteTokens;
}

/** New-player defaults: Interface A, Deck 1, Classic Green, four-color suits. */
export const DEFAULT_APPEARANCE: AppearancePreferences = Object.freeze({
  version: APPEARANCE_VERSION,
  interfaceStyle: "A",
  cardDeck: "1",
  tableTheme: "classic-green",
  suitPalette: "four",
});

export const APPEARANCE_COMBINATION_COUNT =
  INTERFACE_STYLES.length *
  CARD_DECKS.length *
  TABLE_THEMES.length *
  SUIT_PALETTES.length;

const INTERFACE_STYLE_IDS = new Set<string>(INTERFACE_STYLES.map(({ id }) => id));
const CARD_DECK_IDS = new Set<string>(CARD_DECKS.map(({ id }) => id));
const TABLE_THEME_IDS = new Set<string>(TABLE_THEMES.map(({ id }) => id));
const SUIT_PALETTE_IDS = new Set<string>(SUIT_PALETTES.map(({ id }) => id));

function isInterfaceStyle(value: unknown): value is InterfaceStyle {
  return typeof value === "string" && INTERFACE_STYLE_IDS.has(value);
}

function isCardDeck(value: unknown): value is CardDeck {
  return typeof value === "string" && CARD_DECK_IDS.has(value);
}

function isTableTheme(value: unknown): value is TableTheme {
  return typeof value === "string" && TABLE_THEME_IDS.has(value);
}

export function isSuitPalette(value: unknown): value is SuitPalette {
  return typeof value === "string" && SUIT_PALETTE_IDS.has(value);
}

export function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === APPEARANCE_VERSION &&
    isInterfaceStyle(candidate.interfaceStyle) &&
    isCardDeck(candidate.cardDeck) &&
    isTableTheme(candidate.tableTheme) &&
    isSuitPalette(candidate.suitPalette)
  );
}

/**
 * Read the pre-paint root attributes through the same independent validation
 * used for storage. This lets hydrated controls adopt the already-visible
 * appearance instead of briefly reporting the server default.
 */
export function parseAppearanceAttributes(
  attributes: AppearanceAttributeSource,
): AppearancePreferences {
  return {
    version: APPEARANCE_VERSION,
    interfaceStyle: isInterfaceStyle(attributes.interfaceStyle)
      ? attributes.interfaceStyle
      : DEFAULT_APPEARANCE.interfaceStyle,
    cardDeck: isCardDeck(attributes.cardDeck)
      ? attributes.cardDeck
      : DEFAULT_APPEARANCE.cardDeck,
    tableTheme: isTableTheme(attributes.tableTheme)
      ? attributes.tableTheme
      : DEFAULT_APPEARANCE.tableTheme,
    suitPalette: isSuitPalette(attributes.suitPalette)
      ? attributes.suitPalette
      : DEFAULT_APPEARANCE.suitPalette,
  };
}

/**
 * Resolve one validated preference record into the four independent semantic
 * token groups. CSS uses the same registry ids as root data selectors, while
 * this function gives tests and future non-DOM renderers a complete contract.
 */
export function resolveAppearanceTokens(
  preferences: AppearancePreferences,
): ResolvedAppearanceTokens {
  const normalized = isAppearancePreferences(preferences)
    ? preferences
    : DEFAULT_APPEARANCE;
  const interfaceStyle =
    INTERFACE_STYLES.find(({ id }) => id === normalized.interfaceStyle) ??
    INTERFACE_STYLES[0];
  const cardDeck =
    CARD_DECKS.find(({ id }) => id === normalized.cardDeck) ?? CARD_DECKS[0];
  const table =
    TABLE_THEMES.find(({ id }) => id === normalized.tableTheme) ??
    TABLE_THEMES[0];
  const palette =
    SUIT_PALETTES.find(({ id }) => id === normalized.suitPalette) ??
    SUIT_PALETTES[0];

  return {
    interface: { ...interfaceStyle.tokens },
    cardDeck: { ...cardDeck.tokens },
    table: { ...table.tokens },
    palette: {
      light: { ...palette.tokens.light },
      dark: { ...palette.tokens.dark },
    },
  };
}

/** Pure preference update; invalid or tampered patches leave state untouched. */
export function updateAppearancePreferences(
  current: AppearancePreferences,
  update: Partial<Omit<AppearancePreferences, "version">>,
): AppearancePreferences {
  const candidate: AppearancePreferences = { ...current, ...update };
  return isAppearancePreferences(candidate) ? candidate : current;
}

/** Pure reset helper returns a mutable copy of the documented A–1 default. */
export function resetAppearancePreferences(): AppearancePreferences {
  return { ...DEFAULT_APPEARANCE };
}

/**
 * Parse a stored value without trusting it. A valid legacy `fiveo-deck` value
 * is used only when no valid v1 record exists, preserving existing devices.
 */
export function parseStoredAppearance(
  stored: string | null,
  legacySuitPalette: string | null = null,
): AppearancePreferences {
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        const candidate = parsed as Record<string, unknown>;
        if (candidate.version === APPEARANCE_VERSION) {
          return {
            version: APPEARANCE_VERSION,
            interfaceStyle: isInterfaceStyle(candidate.interfaceStyle)
              ? candidate.interfaceStyle
              : DEFAULT_APPEARANCE.interfaceStyle,
            cardDeck: isCardDeck(candidate.cardDeck)
              ? candidate.cardDeck
              : DEFAULT_APPEARANCE.cardDeck,
            tableTheme: isTableTheme(candidate.tableTheme)
              ? candidate.tableTheme
              : DEFAULT_APPEARANCE.tableTheme,
            suitPalette: isSuitPalette(candidate.suitPalette)
              ? candidate.suitPalette
              : isSuitPalette(legacySuitPalette)
                ? legacySuitPalette
                : DEFAULT_APPEARANCE.suitPalette,
          };
        }
      }
    } catch {
      // Malformed local data falls through to known-safe defaults.
    }
  }

  return {
    ...DEFAULT_APPEARANCE,
    suitPalette: isSuitPalette(legacySuitPalette)
      ? legacySuitPalette
      : DEFAULT_APPEARANCE.suitPalette,
  };
}

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function persistAppearance(
  storage: AppearanceStorage,
  preferences: AppearancePreferences,
): void {
  if (!isAppearancePreferences(preferences)) return;
  storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences));
  // Keep the old key synchronized while older clients may still read it.
  storage.setItem(LEGACY_SUIT_PALETTE_STORAGE_KEY, preferences.suitPalette);
}

/** Reads, validates, and writes the result to v1, completing legacy migration. */
export function loadAndMigrateAppearance(
  storage: AppearanceStorage,
): AppearancePreferences {
  const preferences = parseStoredAppearance(
    storage.getItem(APPEARANCE_STORAGE_KEY),
    storage.getItem(LEGACY_SUIT_PALETTE_STORAGE_KEY),
  );
  persistAppearance(storage, preferences);
  return preferences;
}

/**
 * Storage can be denied or throw in privacy-restricted browsers. Loading is
 * therefore fail-safe and still preserves a readable in-memory A–1 interface.
 */
export function loadAppearanceSafely(
  storage: AppearanceStorage | null | undefined,
): AppearancePreferences {
  if (!storage) return resetAppearancePreferences();
  try {
    const preferences = parseStoredAppearance(
      storage.getItem(APPEARANCE_STORAGE_KEY),
      storage.getItem(LEGACY_SUIT_PALETTE_STORAGE_KEY),
    );
    try {
      persistAppearance(storage, preferences);
    } catch {
      // A readable preference can still be used when writes are denied.
    }
    return preferences;
  } catch {
    return resetAppearancePreferences();
  }
}

export function getTableThemeColor(theme: TableTheme): string {
  return (
    TABLE_THEMES.find(({ id }) => id === theme) ??
    TABLE_THEMES[0]
  ).themeColor;
}

/**
 * Inline bootstrap used by the root layout. It validates storage before
 * applying data attributes, preventing a wrong-theme flash on returning visits.
 */
export function getAppearanceBootScript(): string {
  const config = JSON.stringify({
    storageKey: APPEARANCE_STORAGE_KEY,
    legacyKey: LEGACY_SUIT_PALETTE_STORAGE_KEY,
    defaults: DEFAULT_APPEARANCE,
    interfaces: INTERFACE_STYLES.map(({ id }) => id),
    decks: CARD_DECKS.map(({ id }) => id),
    themes: TABLE_THEMES.map(({ id, themeColor }) => [id, themeColor]),
    palettes: SUIT_PALETTES.map(({ id }) => id),
  }).replace(/</g, "\\u003c");

  return `(function(){try{var c=${config},r=localStorage.getItem(c.storageKey),l=localStorage.getItem(c.legacyKey),p=Object.assign({},c.defaults,c.palettes.includes(l)?{suitPalette:l}:{});if(r){try{var x=JSON.parse(r);if(x&&x.version===1){p={version:1,interfaceStyle:c.interfaces.includes(x.interfaceStyle)?x.interfaceStyle:c.defaults.interfaceStyle,cardDeck:c.decks.includes(x.cardDeck)?x.cardDeck:c.defaults.cardDeck,tableTheme:c.themes.some(function(t){return t[0]===x.tableTheme})?x.tableTheme:c.defaults.tableTheme,suitPalette:c.palettes.includes(x.suitPalette)?x.suitPalette:p.suitPalette}}}catch(e){}}var h=document.documentElement;h.setAttribute('data-interface-style',p.interfaceStyle);h.setAttribute('data-card-deck',p.cardDeck);h.setAttribute('data-table-theme',p.tableTheme);h.setAttribute('data-suit-palette',p.suitPalette);h.setAttribute('data-deck',p.suitPalette);h.setAttribute('data-appearance-booted','true');var m=document.querySelector('meta[name="theme-color"]'),t=c.themes.find(function(y){return y[0]===p.tableTheme});if(m&&t)m.setAttribute('content',t[1]);localStorage.setItem(c.storageKey,JSON.stringify(p));localStorage.setItem(c.legacyKey,p.suitPalette)}catch(e){}})();`;
}
