// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuidedPractice } from "../GuidedPractice";
import { PRACTICE_STORAGE_KEY } from "../../lib/game/practice";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<StrictMode><GuidedPractice /></StrictMode>));
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) =>
    (element.getAttribute("aria-label") || element.textContent || "").startsWith(label));
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function toFinalTurn() {
  await click("Start guided practice");
  await click("Select 9 of hearts");
  await click("Row 1,");
  await click("Continue to your next turn");
  await click("Select 9 of diamonds");
  await click("Row 1,");
  await click("Continue to your next turn");
  await click("Select 2 of spades");
  await click("Discard selected card");
  await click("Skip ahead to the final turn");
}

it("completes the guest lesson using actual cards, offers an alternative ending, and makes no API requests", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await render();
  expect(container.textContent).toContain("No account needed");
  await toFinalTurn();
  expect(document.activeElement?.textContent).toBe("One card. Two hands to consider.");
  await click("Select Ace of spades");
  expect(container.textContent).toContain("Row 4: Flush");
  expect(container.textContent).toContain("Hidden fifth hand: Two Pair");
  await click("Row 4,");
  expect(container.textContent).toContain("You win this practice game");
  expect(container.querySelectorAll("article")).toHaveLength(5);
  expect(container.querySelector('a[href="/lobby"]')).not.toBeNull();
  await click("Try a different final card");
  expect(container.querySelectorAll("article")).toHaveLength(0);
  await click("Select Jack of hearts");
  expect(container.textContent).toContain("Hidden fifth hand: Full House");
  await click("Row 4,");
  expect(container.textContent).toContain("The practice opponent wins");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("gives gentle correction, toggles hints, and undoes a move together with the opponent's turn", async () => {
  await render();
  await click("Start guided practice");
  await click("Row 1,");
  expect(container.textContent).toContain("Select a card from your hand first");
  await click("Select Ace of spades");
  await click("Row 1,");
  expect(container.textContent).toContain("Other moves are legal in a regular game");
  expect(button("Select Ace of spades").getAttribute("aria-pressed")).toBe("true");
  await click("Show hint");
  expect(button("Hide hint").getAttribute("aria-expanded")).toBe("true");
  await click("Select 9 of hearts");
  await click("Row 1,");
  await click("Continue to your next turn");
  await click("Undo last move");
  expect(container.textContent).toContain("Draw one. Place one.");
  expect(button("Row 1,").getAttribute("aria-label")).toContain("0 of 5 cards");
});

it("resumes after remount, clears progress on restart, and tolerates unavailable storage", async () => {
  await render();
  await toFinalTurn();
  expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toContain('"skip"');
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(container.textContent).toContain("One card. Two hands to consider.");
  await click("Restart lesson");
  expect(container.textContent).toContain("Learn by playing a few turns");
  expect(JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)!).events).toEqual([]);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  await click("Start guided practice");
  expect(container.textContent).toContain("Progress lasts while this page is open");
  await click("Select 9 of hearts");
  await click("Row 1,");
  expect(container.textContent).toContain("Your first card is on the table");
});
