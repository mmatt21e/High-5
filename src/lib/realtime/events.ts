// Shared Socket.IO event contracts used by both the server and the client.

import type { GameView } from "../game/types";

export interface MatchSnapshot {
  matchId: string;
  inviteCode: string;
  status: "lobby" | "active" | "complete";
  targetWins: number;
  host: { userId: string; displayName: string };
  guest: { userId: string; displayName: string } | null;
  scoreHost: number;
  scoreGuest: number;
  gameNumber: number;
  /** Overall match winner userId, when status is "complete". */
  matchWinnerId: string | null;
  /** Whether the viewer has signalled ready for the next game. */
  youReady: boolean;
  opponentReady: boolean;
}

// Client -> Server
export interface ClientToServerEvents {
  "match:join": (payload: { code: string }) => void;
  "game:place": (payload: { column: number }) => void;
  "game:next": () => void;
}

// Server -> Client
export interface ServerToClientEvents {
  "match:snapshot": (snapshot: MatchSnapshot) => void;
  "game:view": (view: GameView | null) => void;
  "errorMsg": (payload: { message: string }) => void;
}

export const SOCKET_PATH = "/api/socket";
