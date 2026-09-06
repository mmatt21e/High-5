"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  LEGACY_SUIT_PALETTE_STORAGE_KEY,
  getTableThemeColor,
  loadAppearanceSafely,
  parseAppearanceAttributes,
  persistAppearance,
  resetAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferences,
} from "@/lib/appearance";

type AppearanceUpdate = Partial<Omit<AppearancePreferences, "version">>;

interface AppearanceContextValue {
  appearance: AppearancePreferences;
  ready: boolean;
  updateAppearance: (update: AppearanceUpdate) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function applyAppearance(preferences: AppearancePreferences): void {
  const root = document.documentElement;
  root.dataset.interfaceStyle = preferences.interfaceStyle;
  root.dataset.cardDeck = preferences.cardDeck;
  root.dataset.tableTheme = preferences.tableTheme;
  root.dataset.suitPalette = preferences.suitPalette;
  // Retain the original attribute for old selectors and cached clients.
  root.dataset.deck = preferences.suitPalette;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", getTableThemeColor(preferences.tableTheme));
}

function persistSafely(preferences: AppearancePreferences): void {
  try {
    persistAppearance(window.localStorage, preferences);
  } catch {
    // Appearance remains usable for this visit when storage is unavailable.
  }
}

function getBrowserStorageSafely(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearancePreferences>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const rootAppearance = parseAppearanceAttributes({
      interfaceStyle: root.dataset.interfaceStyle,
      cardDeck: root.dataset.cardDeck,
      tableTheme: root.dataset.tableTheme,
      suitPalette: root.dataset.suitPalette,
    });
    const loaded = loadAppearanceSafely(getBrowserStorageSafely());
    // The boot script is the first-paint authority. Fall back to the freshly
    // loaded record only when that script did not complete (for example when
    // storage access was denied before it could mark the root).
    const initial = root.dataset.appearanceBooted === "true"
      ? rootAppearance
      : loaded;
    setAppearance(initial);
    applyAppearance(initial);
    persistSafely(initial);
    setReady(true);

    const synchronize = (event: StorageEvent) => {
      if (
        event.key !== APPEARANCE_STORAGE_KEY &&
        event.key !== LEGACY_SUIT_PALETTE_STORAGE_KEY
      ) {
        return;
      }
      const next = loadAppearanceSafely(getBrowserStorageSafely());
      setAppearance(next);
      applyAppearance(next);
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useLayoutEffect(() => {
    if (ready) document.documentElement.dataset.appearanceReady = "true";
  }, [ready]);

  const updateAppearance = useCallback((update: AppearanceUpdate) => {
    setAppearance((current) => {
      const next = updateAppearancePreferences(current, update);
      if (next === current) return current;
      applyAppearance(next);
      persistSafely(next);
      return next;
    });
  }, []);

  const resetAppearance = useCallback(() => {
    const next = resetAppearancePreferences();
    setAppearance(next);
    applyAppearance(next);
    persistSafely(next);
  }, []);

  const value = useMemo(
    () => ({ appearance, ready, updateAppearance, resetAppearance }),
    [appearance, ready, resetAppearance, updateAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return context;
}
