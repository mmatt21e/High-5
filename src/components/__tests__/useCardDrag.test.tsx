// @vitest-environment jsdom
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCardDrag } from "../useCardDrag";

const place = vi.fn();
const select = vi.fn();
let container: HTMLDivElement;
let root: Root;
let hit: Element | null;
let revision = {};

function Harness({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const { drag, cardHandlers } = useCardDrag({ root: ref, enabled, revision, legalRows: [0, 2],
    onSelect: () => { select(); setSelected(true); }, onPlace: place });
  return createElement("div", { ref },
    createElement("button", { ...cardHandlers("As"), "data-card": true,
      onClick: () => { select(); setSelected(value => !value); } }, "Ace"),
    createElement("button", { "data-drop-row": selected ? 0 : undefined, "data-row": 0 }, "Row 1"),
    createElement("button", { "data-drop-row": selected ? 1 : undefined, "data-row": 1 }, "Full row"),
    createElement("button", { "data-drop-row": selected ? 2 : undefined, "data-row": 2 }, "Row 3"),
    createElement("output", null, drag ? `${drag.id}:${drag.row}` : "idle"));
}

function render(enabled = true) { act(() => root.render(createElement(Harness, { enabled }))); }
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, isPrimary: true, pointerType: "mouse", ...extra })
    .map(([key, value]) => [key, { value }])));
  act(() => container.querySelector("button")!.dispatchEvent(event));
}
function row(index: number) { return container.querySelector(`[data-row="${index}"]`); }
function click(detail = 1) {
  act(() => container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })));
}
function start() {
  pointer("pointerdown", 20, 200);
  pointer("pointermove", 20, 170);
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hit });
  place.mockReset(); select.mockReset(); hit = null; revision = {};
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("card drag placement", () => {
  it.each(["mouse", "touch", "pen"])("places exactly once using %s and suppresses the trailing click", pointerType => {
    pointer("pointerdown", 20, 200, { pointerType });
    pointer("pointermove", 20, 170, { pointerType });
    hit = row(2);
    pointer("pointermove", 20, 100, { pointerType });
    expect(container.querySelector("output")!.textContent).toBe("As:2");
    pointer("pointerup", 20, 100, { pointerType });
    pointer("pointerup", 20, 100, { pointerType });
    click();
    expect(place).toHaveBeenCalledExactlyOnceWith("As", 2);
    expect(select).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output")!.textContent).toBe("idle");
  });

  it("keeps a small pointer movement as an ordinary tap", () => {
    pointer("pointerdown", 20, 200); pointer("pointermove", 23, 202); pointer("pointerup", 23, 202); click();
    expect(place).not.toHaveBeenCalled(); expect(select).toHaveBeenCalledTimes(1);
  });

  it("uses the release location even without a final move event", () => {
    start(); hit = row(0); pointer("pointermove", 20, 100);
    hit = row(2); pointer("pointerup", 20, 80);
    expect(place).toHaveBeenCalledExactlyOnceWith("As", 2);
  });

  it.each(["full", "opponent", "outside"])("rejects a drop on %s", target => {
    start();
    hit = target === "full" ? row(1) : target === "opponent" ? document.createElement("button") : null;
    if (target === "opponent") (hit as HTMLElement).dataset.dropRow = "0";
    pointer("pointerup", 20, 100);
    expect(place).not.toHaveBeenCalled();
    expect(container.querySelector("output")!.textContent).toBe("idle");
  });

  it.each(["escape", "cancel", "capture", "blur", "resize", "disabled", "revision"])("cancels safely on %s", reason => {
    start(); hit = row(0);
    if (reason === "escape") act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    if (reason === "cancel") pointer("pointercancel", 20, 100);
    if (reason === "capture") pointer("lostpointercapture", 20, 100);
    if (reason === "blur" || reason === "resize") act(() => window.dispatchEvent(new Event(reason)));
    if (reason === "disabled") render(false);
    if (reason === "revision") { revision = {}; render(); }
    pointer("pointerup", 20, 100);
    expect(place).not.toHaveBeenCalled();
    expect(container.querySelector("output")!.textContent).toBe("idle");
    click(0); // Keyboard selection remains usable after cancellation.
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("ignores nonprimary pointers, right clicks, and disabled starts", () => {
    pointer("pointerdown", 20, 200, { isPrimary: false }); pointer("pointermove", 20, 100);
    pointer("pointerdown", 20, 200, { button: 2 }); pointer("pointermove", 20, 100);
    render(false); start(); hit = row(0); pointer("pointerup", 20, 100);
    expect(select).not.toHaveBeenCalled(); expect(place).not.toHaveBeenCalled();
  });

  it("ignores another finger during an active drag", () => {
    start(); hit = row(0);
    pointer("pointerup", 20, 100, { pointerId: 2 });
    expect(place).not.toHaveBeenCalled();
    pointer("pointerup", 20, 100);
    expect(place).toHaveBeenCalledExactlyOnceWith("As", 0);
  });
});
