import { Prisma, type GameRequest } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { generateInviteCode } from "../lib/match";
import { KeyedSerialQueue } from "./keyedCoordination";
import { playerSelect, publicPlayer } from "./playerIdentity";

const queue = new KeyedSerialQueue<string>();
const AUTO_TTL = 90_000;
const POST_TTL = 15 * 60_000;
export class LobbyError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export type LobbyAction =
  | { action: "post" | "auto"; targetWins: number; note?: string }
  | { action: "join" | "cancel" | "heartbeat"; id: string };

const include = { user: { select: playerSelect }, match: { select: { inviteCode: true, status: true } } } as const;
export async function lobbySnapshot(userId: string, targetWins?: number) {
  const now = new Date();
  const where = { status: "waiting", mode: "post", expiresAt: { gt: now }, userId: { not: userId }, ...(targetWins ? { targetWins } : {}) };
  const [own, posts, total] = await prisma.$transaction([
    prisma.gameRequest.findUnique({ where: { userId }, include }),
    prisma.gameRequest.findMany({ where, include, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 }),
    prisma.gameRequest.count({ where }),
  ]);
  const serialize = (row: NonNullable<typeof own>, owner: boolean) => ({
    id: row.id, mode: row.mode, status: row.status, targetWins: row.targetWins,
    note: row.note, expiresAt: row.expiresAt.toISOString(), player: publicPlayer(row.user),
    code: owner && row.match?.status === "active" ? row.match.inviteCode : null,
  });
  return {
    own: own && (own.status === "matched" || own.expiresAt > now) ? serialize(own, true) : null,
    posts: posts.map((row) => serialize(row, false)), total,
  };
}

async function pair(tx: Prisma.TransactionClient, host: GameRequest, guest: GameRequest, code: string, now: Date) {
  const claim = await tx.gameRequest.updateMany({
    where: { id: { in: [host.id, guest.id] }, status: "waiting", expiresAt: { gt: now } },
    data: { status: "matched" },
  });
  if (claim.count !== 2) throw new LobbyError("That game was just taken. Refresh to find another.");
  const match = await tx.match.create({ data: { hostId: host.userId, guestId: guest.userId, targetWins: host.targetWins, inviteCode: code, status: "active" } });
  await tx.gameRequest.updateMany({ where: { id: { in: [host.id, guest.id] } }, data: { matchId: match.id } });
  return { code: match.inviteCode };
}

export async function actInLobby(userId: string, action: LobbyAction) {
  // The application supports one replica. The bounded queue avoids SQLite writer
  // contention; conditional claims and the transaction remain the safety boundary.
  return queue.run("lobby", async () => {
    const code = ["post", "auto", "join"].includes(action.action) ? await generateInviteCode() : "";
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.findUnique({ where: { id: userId }, select: { computerLevel: true } });
      if (!user || user.computerLevel) throw new LobbyError("Player unavailable.", 403);
      const own = await tx.gameRequest.findUnique({ where: { userId }, include: { match: true } });
      if (action.action === "cancel" || action.action === "heartbeat") {
        if (!own || own.id !== action.id) throw new LobbyError("This request is no longer current.");
        if (action.action === "cancel") {
          // Clearing a matched notification never deletes or abandons its game.
          await tx.gameRequest.delete({ where: { id: own.id } });
          return { ok: true, ...(own.match?.status === "active" ? { code: own.match.inviteCode } : {}) };
        }
        if (own.status === "waiting" && own.mode === "auto" && own.expiresAt > now) {
          await tx.gameRequest.update({ where: { id: own.id }, data: { expiresAt: new Date(now.getTime() + AUTO_TTL) } });
        }
        return { ok: true };
      }

      if (action.action === "join") {
        const post = await tx.gameRequest.findUnique({ where: { id: action.id }, include: { match: true } });
        if (!post || post.userId === userId) throw new LobbyError("Choose another player's post.");
        if (post.status === "matched" && post.match?.guestId === userId) return { code: post.match.inviteCode };
        if (post.mode !== "post" || post.status !== "waiting" || post.expiresAt <= now) throw new LobbyError("That game is no longer available.");
        if (own?.status === "matched" && own.match?.status === "active") throw new LobbyError("Open or clear your previous match before joining another.");
        if (own) await tx.gameRequest.delete({ where: { id: own.id } });
        const guest = await tx.gameRequest.create({ data: { userId, mode: "post", targetWins: post.targetWins, expiresAt: new Date(now.getTime() + POST_TTL) } });
        return pair(tx, post, guest, code, now);
      }

      if (action.action !== "post" && action.action !== "auto") throw new LobbyError("Invalid lobby action.", 400);
      if (own?.status === "matched" && own.match?.status === "active") return { code: own.match.inviteCode };
      if (own?.status === "waiting" && own.expiresAt > now) return { ok: true, id: own.id }; // retry is idempotent
      if (own) await tx.gameRequest.delete({ where: { id: own.id } });
      const request = await tx.gameRequest.create({ data: {
        userId, mode: action.action, targetWins: action.targetWins, note: action.action === "post" ? action.note ?? "" : "",
        expiresAt: new Date(now.getTime() + (action.action === "auto" ? AUTO_TTL : POST_TTL)),
      } });
      // A public post consents to any signed-in opponent, including auto-match.
      // A new post also wakes the oldest compatible player already in the queue.
      const candidate = await tx.gameRequest.findFirst({
        where: { userId: { not: userId }, status: "waiting", targetWins: action.targetWins, expiresAt: { gt: now }, ...(action.action === "post" ? { mode: "auto" } : {}) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return candidate ? pair(tx, candidate, request, code, now) : { ok: true, id: request.id };
    });
  });
}
