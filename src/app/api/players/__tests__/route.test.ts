import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: mocks.findMany } } }));
vi.mock("@/server/playerIdentity", () => import("../../../../server/playerIdentity"));
vi.mock("@/server/requestLimits", () => import("../../../../server/requestLimits"));
import { GET } from "../route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "searcher" } });
  mocks.findMany.mockResolvedValue([{ id: "human", displayName: "Lucky Human", image: null, computerLevel: null, email: "private@example.test" }]);
});
describe("human player search", () => {
  it("excludes built-in computer identities and returns only public player fields", async () => {
    const response = await GET(new Request("http://localhost/api/players?q=Lucky"));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { not: "searcher" }, computerLevel: null, displayName: { contains: "Lucky" } } }));
    expect(await response.json()).toEqual({ players: [{ id: "human", displayName: "Lucky Human", avatar: "avatar:spade" }] });
  });
});
