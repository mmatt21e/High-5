import { beforeEach, describe, expect, it, vi } from "vitest";

const matchStore = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../prisma", () => ({ prisma: { match: matchStore } }));

import { generateInviteCode, joinMatch } from "../match";
import { resetAccountRateLimit } from "../rateLimit";

const lobby = {
  id: "match-1",
  inviteCode: "ABCDE",
  hostId: "host",
  guestId: null,
  status: "lobby",
};

describe("joinMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAccountRateLimit("match:join", "guest-a");
  });

  it("generates new cryptographic invite codes at the longer length", async () => {
    matchStore.findUnique.mockResolvedValue(null);

    const code = await generateInviteCode();

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it.each([
    null,
    { ...lobby, guestId: "guest-b", status: "active" },
    { ...lobby, status: "complete" },
    { ...lobby, status: "abandoned" },
  ])("gives outsiders one uniform response for unavailable codes", async (value) => {
    matchStore.findUnique.mockResolvedValueOnce(value);

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: false,
      error: "That game is unavailable",
    });
    expect(matchStore.updateMany).not.toHaveBeenCalled();
  });

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
      error: "That game is unavailable",
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
      error: "That game is unavailable",
    });
  });

  it("reports a match deleted during the seat claim", async () => {
    matchStore.findUnique.mockResolvedValueOnce(lobby).mockResolvedValueOnce(null);
    matchStore.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(joinMatch("ABCDE", "guest-a")).resolves.toEqual({
      ok: false,
      error: "That game is unavailable",
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
