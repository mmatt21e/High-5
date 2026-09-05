import { beforeEach, describe, expect, it, vi } from "vitest";

const matchStore = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../prisma", () => ({ prisma: { match: matchStore } }));

import { joinMatch } from "../match";

const lobby = {
  id: "match-1",
  inviteCode: "ABCDE",
  hostId: "host",
  guestId: null,
  status: "lobby",
};

describe("joinMatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims an empty lobby seat with a conditional write", async () => {
    matchStore.findUnique.mockResolvedValueOnce(lobby);
    matchStore.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(joinMatch("abcde", "guest-a")).resolves.toEqual({
      ok: true,
      matchId: "match-1",
      inviteCode: "ABCDE",
    });
    expect(matchStore.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", guestId: null, status: "lobby" },
      data: { guestId: "guest-a", status: "active" },
    });
  });

  it("does not overwrite the winner of a concurrent seat claim", async () => {
    matchStore.findUnique
      .mockResolvedValueOnce(lobby)
      .mockResolvedValueOnce({ ...lobby, guestId: "guest-b", status: "active" });
    matchStore.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: false,
      error: "That game is already full",
    });
  });

  it("treats a duplicate request from the winning guest as idempotent", async () => {
    matchStore.findUnique
      .mockResolvedValueOnce(lobby)
      .mockResolvedValueOnce({ ...lobby, guestId: "guest-a", status: "active" });
    matchStore.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: true,
      matchId: "match-1",
      inviteCode: "ABCDE",
    });
  });

  it("cannot revive a match completed during the seat claim", async () => {
    matchStore.findUnique
      .mockResolvedValueOnce(lobby)
      .mockResolvedValueOnce({ ...lobby, status: "complete" });
    matchStore.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: false,
      error: "That game has already finished",
    });
  });

  it("reports a match deleted during the seat claim", async () => {
    matchStore.findUnique.mockResolvedValueOnce(lobby).mockResolvedValueOnce(null);
    matchStore.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: false,
      error: "No game found with that code",
    });
  });

  it("allows an existing participant to reopen a completed match", async () => {
    matchStore.findUnique.mockResolvedValueOnce({
      ...lobby,
      guestId: "guest-a",
      status: "complete",
    });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toMatchObject({
      ok: true,
      matchId: "match-1",
    });
    expect(matchStore.updateMany).not.toHaveBeenCalled();
  });
});
