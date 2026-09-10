import type { PublicPlayer } from "./avatars";

export const MATCH_LENGTHS = [1, 3, 5] as const;
export interface LobbyRequest {
  id: string;
  mode: "post" | "auto";
  status: "waiting" | "matched";
  targetWins: number;
  note: string;
  expiresAt: string;
  player: PublicPlayer;
  code: string | null;
}
export interface LobbySnapshot {
  own: LobbyRequest | null;
  posts: LobbyRequest[];
  total: number;
}
