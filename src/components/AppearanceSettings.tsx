"use client";

import { useId } from "react";
import { APPEARANCE_PREVIEW_CARDS } from "@/lib/cardAppearance";
import {
  CARD_DECKS,
  DEFAULT_APPEARANCE,
  INTERFACE_STYLES,
  SUIT_PALETTES,
  TABLE_THEMES,
  type AppearancePreferences,
} from "@/lib/appearance";
import { useAppearance } from "./AppearanceProvider";
import { CardBack, CardFace } from "./PlayingCard";

type AppearanceKey = keyof Omit<AppearancePreferences, "version">;

export function AppearanceSettings({
  showHeading = true,
}: {
  showHeading?: boolean;
}) {
  const { appearance, ready, updateAppearance, resetAppearance } = useAppearance();
  const baseId = useId();
  const selectedDeck =
    CARD_DECKS.find(({ id }) => id === appearance.cardDeck) ?? CARD_DECKS[0];
  const isDefault =
    appearance.interfaceStyle === DEFAULT_APPEARANCE.interfaceStyle &&
    appearance.cardDeck === DEFAULT_APPEARANCE.cardDeck &&
    appearance.tableTheme === DEFAULT_APPEARANCE.tableTheme &&
    appearance.suitPalette === DEFAULT_APPEARANCE.suitPalette;

  const select = (key: AppearanceKey) =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      // The provider validates every update at runtime as well; this assertion
      // narrows the value selected from the registry-backed native control.
      updateAppearance({ [key]: event.target.value } as Partial<
        Omit<AppearancePreferences, "version">
      >);
    };

  return (
    <section
      aria-busy={!ready}
      aria-label={showHeading ? undefined : "Appearance customization"}
      aria-labelledby={showHeading ? `${baseId}-title` : undefined}
      className="appearance-settings"
    >
      {showHeading && (
        <div className="mb-3">
          <h2 id={`${baseId}-title`} className="text-base font-black text-gold">
            Appearance
          </h2>
          <p className="mt-0.5 text-xs text-white/55">
            Saved on this device. Your opponent keeps their own choices.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        <AppearanceSelect
          id={`${baseId}-interface`}
          label="Interface"
          value={appearance.interfaceStyle}
          onChange={select("interfaceStyle")}
          options={INTERFACE_STYLES.map((option) => ({
            value: option.id,
            label: `${option.id} — ${option.name}`,
          }))}
        />
        <DeckPreview deck={selectedDeck} />
        <AppearanceSelect
          id={`${baseId}-deck`}
          label="Playing cards"
          value={appearance.cardDeck}
          onChange={select("cardDeck")}
          options={CARD_DECKS.map((option) => ({
            value: option.id,
            label: `${option.id} — ${option.name}`,
          }))}
        />
        <AppearanceSelect
          id={`${baseId}-table`}
          label="Table"
          value={appearance.tableTheme}
          onChange={select("tableTheme")}
          options={TABLE_THEMES.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
        />
        <AppearanceSelect
          id={`${baseId}-suits`}
          label="Suit colors"
          value={appearance.suitPalette}
          onChange={select("suitPalette")}
          options={SUIT_PALETTES.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <SuitPreview palette={appearance.suitPalette} />
        <button
          type="button"
          className="tap-target appearance-reset px-3 text-sm font-bold disabled:opacity-40"
          disabled={isDefault}
          onClick={resetAppearance}
        >
          Reset to A–1
        </button>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Selected {appearance.interfaceStyle}, deck {appearance.cardDeck},{" "}
        {TABLE_THEMES.find(({ id }) => id === appearance.tableTheme)?.name},{" "}
        {SUIT_PALETTES.find(({ id }) => id === appearance.suitPalette)?.name}.
      </p>
    </section>
  );
}

function DeckPreview({ deck }: { deck: (typeof CARD_DECKS)[number] }) {
  return (
    <figure className="appearance-deck-preview" data-preview-deck={deck.id}>
      <figcaption className="appearance-preview-copy">
        <strong>
          Deck {deck.id}: {deck.name}
        </strong>
        <span>{deck.description}</span>
      </figcaption>
      <div
        className="appearance-preview-cards"
        data-preview-suits="s,h,d,c"
        role="img"
        aria-label={`${deck.name} preview: ace of spades, queen of hearts, nine of diamonds, five of clubs, and a face-down card`}
      >
        {APPEARANCE_PREVIEW_CARDS.map((card) => (
          <CardFace card={card} decorative key={`${card.rank}-${card.suit}`} size="sm" />
        ))}
        <CardBack decorative size="sm" />
      </div>
    </figure>
  );
}

function AppearanceSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="form-label mb-1 block text-xs font-bold">
        {label}
      </label>
      <select id={id} className="field py-2" value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SuitPreview({ palette }: { palette: AppearancePreferences["suitPalette"] }) {
  const suits = [
    { glyph: "♠︎", className: "suit-s" },
    { glyph: "♥︎", className: "suit-h" },
    { glyph: "♦︎", className: "suit-d" },
    { glyph: "♣︎", className: "suit-c" },
  ];
  return (
    <span
      aria-label={palette === "four" ? "Four-color suit preview" : "Two-color suit preview"}
      className="appearance-suit-preview flex min-h-11 items-center gap-1 px-2"
      role="img"
    >
      {suits.map((suit) => (
        <span
          aria-hidden="true"
          className={`${suit.className} text-lg font-black`}
          key={suit.glyph}
        >
          {suit.glyph}
        </span>
      ))}
    </span>
  );
}
