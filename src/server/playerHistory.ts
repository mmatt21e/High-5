import { prisma } from "../lib/prisma";
import { publicPlayer, playerSelect } from "./playerIdentity";
import type { PublicPlayer } from "../lib/avatars";

export interface OpponentRecord {
  player: PublicPlayer;
  games: number;
  wins: number;
  losses: number;
  pushes: number;
  matches: number;
  matchWins: number;
  matchLosses: number;
}

type RawRecord = { id: string; displayName: string; image: string | null; computerLevel: string | null } &
  Record<"games" | "wins" | "losses" | "pushes" | "matches" | "matchWins" | "matchLosses", bigint | number | null>;

/** Aggregate persisted completions in SQL, without loading board snapshots or
 * counting a manually ended/unfinished match as a match loss. */
export async function opponentRecords(userId: string): Promise<OpponentRecord[]> {
  const rows = await prisma.$queryRaw<RawRecord[]>`
    WITH perMatch AS (
      SELECT m.id,
        CASE WHEN m.hostId = ${userId} THEN m.guestId ELSE m.hostId END AS opponentId,
        CASE WHEN m.hostId = ${userId} THEN 0 ELSE 1 END AS seat,
        m.status, m.winnerId,
        COUNT(g.id) AS games,
        SUM(CASE WHEN g.winnerSeat = (CASE WHEN m.hostId = ${userId} THEN 0 ELSE 1 END) THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN g.winnerSeat = (CASE WHEN m.hostId = ${userId} THEN 1 ELSE 0 END) THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN g.id IS NOT NULL AND g.winnerSeat IS NULL THEN 1 ELSE 0 END) AS pushes
      FROM "Match" m LEFT JOIN "Game" g ON g.matchId = m.id
      WHERE (m.hostId = ${userId} OR m.guestId = ${userId}) AND m.guestId IS NOT NULL
      GROUP BY m.id
    )
    SELECT u.id, u.displayName, u.image, u.computerLevel,
      SUM(p.games) AS games, SUM(p.wins) AS wins, SUM(p.losses) AS losses, SUM(p.pushes) AS pushes,
      SUM(CASE WHEN p.status = 'complete' AND p.winnerId IN (${userId}, p.opponentId) THEN 1 ELSE 0 END) AS matches,
      SUM(CASE WHEN p.status = 'complete' AND p.winnerId = ${userId} THEN 1 ELSE 0 END) AS matchWins,
      SUM(CASE WHEN p.status = 'complete' AND p.winnerId = p.opponentId THEN 1 ELSE 0 END) AS matchLosses
    FROM perMatch p JOIN "User" u ON u.id = p.opponentId
    GROUP BY u.id ORDER BY SUM(p.games) DESC, u.displayName ASC, u.id ASC
  `;
  return rows.map((row) => ({
    player: publicPlayer(row), games: Number(row.games ?? 0), wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0), pushes: Number(row.pushes ?? 0),
    matches: Number(row.matches ?? 0), matchWins: Number(row.matchWins ?? 0), matchLosses: Number(row.matchLosses ?? 0),
  }));
}

export const HISTORY_PAGE_SIZE = 20;
export async function recentGames(userId: string, opponentId: string | undefined, page: number) {
  const where = { match: {
    OR: [{ hostId: userId, ...(opponentId ? { guestId: opponentId } : {}) },
      { guestId: userId, ...(opponentId ? { hostId: opponentId } : {}) }],
  } };
  const [total, games] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * HISTORY_PAGE_SIZE, take: HISTORY_PAGE_SIZE,
      select: { id: true, gameNumber: true, winnerSeat: true, isFiveO: true, createdAt: true,
        match: { select: { inviteCode: true, hostId: true, host: { select: playerSelect }, guest: { select: playerSelect } } } },
    }),
  ]);
  return { total, games: games.map((game) => {
    const seat = game.match.hostId === userId ? 0 : 1;
    const opponent = seat === 0 ? game.match.guest : game.match.host;
    return { id: game.id, number: game.gameNumber, date: game.createdAt, isFiveO: game.isFiveO,
      code: game.match.inviteCode, opponent: opponent ? publicPlayer(opponent) : null,
      outcome: game.winnerSeat === null ? "Push" : game.winnerSeat === seat ? "Win" : "Loss" };
  }) };
}
