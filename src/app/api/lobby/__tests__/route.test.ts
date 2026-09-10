import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), act: vi.fn(), snapshot: vi.fn(), limit: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/lobby", () => ({ actInLobby: mocks.act, lobbySnapshot: mocks.snapshot, LobbyError: class extends Error {} }));
vi.mock("@/server/requestLimits", async () => ({ ...(await import("../../../../server/requestLimits")), limitRequest: mocks.limit }));
vi.mock("@/server/keyedCoordination", () => import("../../../../server/keyedCoordination"));
import { GET, POST } from "../route";
const send = (body: unknown) => POST(new Request("http://localhost/api/lobby", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "player" } }); mocks.limit.mockReturnValue(null);
  mocks.act.mockResolvedValue({ ok: true }); mocks.snapshot.mockResolvedValue({ own: null, posts: [], total: 0 });
});
describe("lobby HTTP boundaries", () => {
  it("requires authentication for reads and writes", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/lobby"))).status).toBe(401);
    expect((await send({ action: "auto", targetWins: 5 })).status).toBe(401);
    expect(mocks.act).not.toHaveBeenCalled(); expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each([
    { action: "auto", targetWins: 99 }, { action: "post", targetWins: 3, note: "x".repeat(161) },
    { action: "join", id: "" }, { action: "post", targetWins: 5, userId: "victim" },
    { action: "delete", id: "post" }, { action: "auto", targetWins: "5" },
  ])("rejects invalid input %j before mutation", async (body) => {
    expect((await send(body)).status).toBe(400); expect(mocks.act).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized JSON", async () => {
    expect((await POST(new Request("http://localhost/api/lobby", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await send({ note: "x".repeat(3000) })).status).toBe(400);
  });
  it("uses the session identity and trims valid public notes", async () => {
    expect((await send({ action: "post", targetWins: 3, note: " hello " })).status).toBe(200);
    expect(mocks.act).toHaveBeenCalledWith("player", { action: "post", targetWins: 3, note: "hello" });
  });
  it("validates filters and marks private snapshots as noncacheable", async () => {
    expect((await GET(new Request("http://localhost/api/lobby?targetWins=99"))).status).toBe(400);
    const response = await GET(new Request("http://localhost/api/lobby?targetWins=3"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.snapshot).toHaveBeenCalledWith("player", 3);
  });
  it("honors rate limits before reading or mutating", async () => {
    mocks.limit.mockReturnValue(new Response(null, { status: 429 }));
    expect((await send({ action: "auto", targetWins: 5 })).status).toBe(429);
    expect((await GET(new Request("http://localhost/api/lobby"))).status).toBe(429);
    expect(mocks.act).not.toHaveBeenCalled(); expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
