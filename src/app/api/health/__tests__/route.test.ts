import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindFirst: vi.fn(),
  matchFindFirst: vi.fn(),
  gameFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: { findFirst: mocks.userFindFirst },
    match: { findFirst: mocks.matchFindFirst },
    game: { findFirst: mocks.gameFindFirst },
  },
}));

import { GET } from "../route";

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ready only after the required application-table queries succeed", async () => {
    mocks.userFindFirst.mockReturnValue("user-query");
    mocks.matchFindFirst.mockReturnValue("match-query");
    mocks.gameFindFirst.mockReturnValue("game-query");
    mocks.transaction.mockResolvedValue([null, null, null]);

    const response = await GET();

    expect(mocks.userFindFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(mocks.matchFindFirst).toHaveBeenCalledWith({
      select: { id: true, gameSeed: true },
    });
    expect(mocks.gameFindFirst).toHaveBeenCalledWith({
      select: { id: true, seed: true },
    });
    expect(mocks.transaction).toHaveBeenCalledWith([
      "user-query",
      "match-query",
      "game-query",
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns a generic unavailable response when the database is not ready", async () => {
    const error = new Error("database unavailable");
    mocks.transaction.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith("Health check failed", error);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    consoleError.mockRestore();
  });
});
