// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
import { EmailTokenForm } from "../AdminForms";
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
it("retains the email token through Strict Mode effect replay while removing it from the URL", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Verified" }) });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/admin/verify#test-email-token");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(EmailTokenForm, { purpose: "verify" }))));
    expect(window.location.hash).toBe("");
    expect(container.querySelector("button")?.textContent).toBe("Verify recovery email");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "test-email-token", action: "verify" });
  } finally { act(() => root.unmount()); container.remove(); }
});
