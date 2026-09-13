import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../admin", () => ({ ADMIN_COOKIE: "edge-admin", getAdmin: vi.fn() }));
import { getAdmin } from "../admin";
import { proxyCodex, rewriteCodexAsset } from "../codexProxy";

const admin = vi.mocked(getAdmin);
const upstream = vi.fn();
function request(path = "/api/state", init: RequestInit = {}) {
  return new Request("https://edgegames.win/admin/codex" + path, {
    ...init, headers: { cookie: "edge-admin=admin-session; tower_session=dashboard-session; player=private", ...init.headers },
  });
}
beforeEach(() => {
  vi.stubEnv("CODEX_DASHBOARD_URL", "http://192.168.1.50:8098");
  vi.stubEnv("AUTH_URL", "https://edgegames.win");
  vi.stubGlobal("fetch", upstream);
  admin.mockResolvedValue({ needsSetup: false } as Awaited<ReturnType<typeof getAdmin>>);
  upstream.mockResolvedValue(Response.json({ ok: true }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); vi.useRealTimers(); });
describe("Codex admin boundary", () => {
  it("denies APIs and assets without an administrator; sends the document to login", async () => {
    admin.mockResolvedValue(null);
    for (const path of ["/api/state", "/api/events", "/app.js"]) expect((await proxyCodex(request(path))).status).toBe(401);
    const page = await proxyCodex(request("/"));
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/admin");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects incomplete setup and cross-origin mutations before contacting Codex", async () => {
    admin.mockResolvedValueOnce({ needsSetup: true } as Awaited<ReturnType<typeof getAdmin>>);
    expect((await proxyCodex(request())).status).toBe(401);
    for (const origin of ["https://attacker.example", "null", ""]) {
      expect((await proxyCodex(request("/api/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }))).status).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards only the Codex cookie and CSRF token, scopes the secure login cookie", async () => {
    upstream.mockResolvedValueOnce(Response.json({ ok: true }, { headers: { "set-cookie": "tower_session=abc; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800" } }));
    const response = await proxyCodex(request("/api/login", { method: "POST", headers: { origin: "https://edgegames.win", "content-type": "application/json", "x-csrf-token": "csrf", authorization: "must-not-forward" }, body: "{}" }));
    const [url, options] = upstream.mock.calls[0];
    expect(url.href).toBe("http://192.168.1.50:8098/api/login");
    expect(options.headers.get("cookie")).toBe("tower_session=dashboard-session");
    expect(options.headers.get("origin")).toBe("http://192.168.1.50:8098");
    expect(options.headers.get("x-csrf-token")).toBe("csrf");
    expect(options.headers.has("authorization")).toBe(false);
    expect(response.headers.get("set-cookie")).toContain("Path=/admin/codex;");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("retains dashboard authentication and rejects unknown paths and oversized requests", async () => {
    upstream.mockResolvedValueOnce(Response.json({ error: "Sign in" }, { status: 401 }));
    expect((await proxyCodex(request())).status).toBe(401);
    expect((await proxyCodex(request("//other-host"))).status).toBe(404);
    expect((await proxyCodex(request("/api/login", { method: "POST", headers: { origin: "https://edgegames.win", "content-type": "application/json" }, body: "x".repeat(1024 * 1024 + 1) }))).status).toBe(413);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("rewrites dashboard assets, fetch, event stream, and export URLs", () => {
    expect(rewriteCodexAsset("/", '<a href="/"><script src="/app.js"></script>')).toBe('<a href="/admin/codex/"><script src="/admin/codex/app.js"></script>');
    expect(rewriteCodexAsset("/app.js", "fetch('/api/state');new EventSource('/api/events');location.href=`/api/threads/${id}/export`;")).toBe("fetch('/admin/codex/api/state');new EventSource('/admin/codex/api/events');location.href=`/admin/codex/api/threads/${id}/export`;");
  });
  it("streams immediately and aborts upstream when the admin session is revoked", async () => {
    vi.useFakeTimers();
    upstream.mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: {}\n\n")); } }), { headers: { "content-type": "text/event-stream" } }));
    const response = await proxyCodex(request("/api/events"));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: {}\n\n");
    admin.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(15000);
    expect(upstream.mock.calls[0][1].signal.aborted).toBe(true);
    await reader.cancel();
  });
});
