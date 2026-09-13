// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstallGameButton, InstallGameProvider } from "../InstallGame";

let container: HTMLDivElement;
let root: Root;
let modes: Map<string, MediaQueryList>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  modes = new Map();
  vi.stubGlobal("matchMedia", (query: string) => {
    if (!modes.has(query)) modes.set(query, Object.assign(new EventTarget(), { matches: false, media: query }) as MediaQueryList);
    return modes.get(query)!;
  });
  // jsdom does not implement the native modal methods; browser QA covers focus
  // trapping and Escape while these shims exercise the installation lifecycle.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(buttons = true) {
  await act(async () => root.render(
    <StrictMode><InstallGameProvider>{buttons && <InstallGameButton />}</InstallGameProvider></StrictMode>,
  ));
}

function button() {
  return container.querySelector<HTMLButtonElement>("button.btn-outline");
}

function offer(outcome: "accepted" | "dismissed", failure = false) {
  const prompt = failure ? vi.fn().mockRejectedValue(new Error("Unavailable")) : vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => window.dispatchEvent(event));
  return { prompt, event };
}

it("retains the native prompt when navigating from the collection to a game, without showing it automatically", async () => {
  await render(false);
  const { prompt, event } = offer("accepted");
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  await render();
  await act(async () => button()!.click());
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(button()).toBeNull();
});

it("does not reuse a dismissed prompt and can accept a later browser offer", async () => {
  await render();
  const first = offer("dismissed");
  await act(async () => button()!.click());
  expect(button()).not.toBeNull();
  await act(async () => button()!.click());
  expect(first.prompt).toHaveBeenCalledTimes(1);
  expect(container.querySelector("dialog")!.open).toBe(true);
  const second = offer("accepted");
  await act(async () => button()!.click());
  expect(second.prompt).toHaveBeenCalledTimes(1);
  expect(container.querySelector("dialog")!.open).toBe(false);
  expect(button()).toBeNull();
});

it("falls back to instructions if the native prompt fails", async () => {
  await render();
  offer("dismissed", true);
  await act(async () => button()!.click());
  expect(container.querySelector("dialog")!.open).toBe(true);
  expect(button()?.disabled).toBe(false);
});

it("hides all install controls after installation through the browser menu", async () => {
  await render();
  await act(async () => button()!.click());
  act(() => window.dispatchEvent(new Event("appinstalled")));
  expect(button()).toBeNull();
  expect(container.querySelector("dialog")!.open).toBe(false);
});

it("hides the button in an installed window and reacts to display-mode changes", async () => {
  const mode = window.matchMedia("(display-mode: standalone)");
  Object.assign(mode, { matches: true });
  await render();
  expect(button()).toBeNull();
  act(() => { Object.assign(mode, { matches: false }); mode.dispatchEvent(new Event("change")); });
  expect(button()).not.toBeNull();
});

it("recognizes Apple's standalone flag", async () => {
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: true });
  await render();
  expect(button()).toBeNull();
});

it.each([
  ["iPhone", 5],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15", 5],
])("shows Apple home-screen steps on iPhone and desktop-mode iPad (%s)", async (userAgent, maxTouchPoints) => {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
  await render();
  await act(async () => button()!.click());
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain("Safari");
  expect(dialog.textContent).toContain("Share");
  expect(dialog.textContent).toContain("Add to Home Screen");
  expect(dialog.textContent).toContain("Open as Web App");
  expect(dialog.textContent).not.toContain("Install app");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close install instructions"]')!.click());
  expect(dialog.open).toBe(false);
});

it("gives Android menu steps when a native prompt is unavailable", async () => {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 15)", maxTouchPoints: 5 });
  await render();
  await act(async () => button()!.click());
  const dialog = container.querySelector("dialog")!;
  expect(dialog.textContent).toContain("Chrome");
  expect(dialog.textContent).toContain("Install app");
  expect(dialog.textContent).toContain("Add to Home screen");
  expect(dialog.textContent).not.toContain("Safari");
});
