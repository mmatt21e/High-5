import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/computerMatches", () => ({ createComputerMatch: mocks.create }));
vi.mock("@/lib/computer", () => import("../../../../../lib/computer"));
vi.mock("@/lib/rateLimit", () => import("../../../../../lib/rateLimit"));
vi.mock("@/server/requestLimits", () => import("../../../../../server/requestLimits"));
import { POST } from "../route";
import { RateLimitExceededError } from "../../../../../lib/rateLimit";

const request = (body: string) => new Request("http://localhost/api/match/computer", { method: "POST", body });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "human" } });
  mocks.create.mockResolvedValue({ inviteCode: "ABCDEFGH" });
});
describe("computer-match API", () => {
  it("requires authentication before reading a request or creating a match", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request('{"level":"easy"}'))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["easy", "medium", "hard"])("creates the selected %s opponent for the authenticated user only", async (level) => {
    const response = await POST(request(JSON.stringify({ level, hostId: "someone-else", guestId: "other", targetWins: 1 })));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ code: "ABCDEFGH" });
    expect(mocks.create).toHaveBeenCalledWith("human", level);
  });
  it.each(["null", "[]", "{}", "not-json", '{"level":"expert"}', '{"level":"__proto__"}', " ".repeat(1025)])("rejects invalid or oversized input %#", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves the shared match-creation rate limit response", async () => {
    mocks.create.mockRejectedValue(new RateLimitExceededError("Too many games", 45));
    const response = await POST(request('{"level":"easy"}'));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
  });
});
