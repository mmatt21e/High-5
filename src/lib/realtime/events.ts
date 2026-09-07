// Shared Socket.IO event contracts used by both the server and the client.

import type { GameView, PlayerIndex } from "../game/types";

export interface MatchSnapshot {
  matchId: string;
  inviteCode: string;
  status: "lobby" | "active" | "complete";
  targetWins: number;
  host: { displayName: string; avatar?: string };
  guest: { displayName: string; avatar?: string } | null;
  scoreHost: number;
  scoreGuest: number;
  gameNumber: number;
  /** Overall match winner seat, when status is "complete". */
  matchWinner: PlayerIndex | null;
  /** Whether the viewer has signalled ready for the next game. */
  youReady: boolean;
  opponentReady: boolean;
}

// Client -> Server
export interface ClientToServerEvents {
  "match:join": (payload: { code: string }) => void;
  /** Place a held card (by card id, e.g. "14s") into a row (0..3). */
  "game:place": (payload: { cardId: string; row: number }) => void;
  /** Discard a held card (allowed once per game). */
  "game:discard": (payload: { cardId: string }) => void;
  "game:next": () => void;
  /** Voluntarily end the whole match. */
  "match:end": () => void;
}

// Server -> Client
export interface ServerToClientEvents {
  "match:snapshot": (snapshot: MatchSnapshot) => void;
  "game:view": (view: GameView | null) => void;
  "errorMsg": (payload: { message: string }) => void;
}

export const SOCKET_PATH = "/api/socket";
