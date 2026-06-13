"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_PATH } from "@/lib/realtime/events";
import type {
  ClientToServerEvents,
  MatchSnapshot,
  ServerToClientEvents,
} from "@/lib/realtime/events";
import type { GameView } from "@/lib/game/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface GameSocketState {
  snapshot: MatchSnapshot | null;
  view: GameView | null;
  error: string | null;
  connected: boolean;
  place: (column: number) => void;
  next: () => void;
}

export function useGameSocket(code: string): GameSocketState {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<ClientSocket | null>(null);

  useEffect(() => {
    const socket: ClientSocket = io({
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      socket.emit("match:join", { code });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setError("Could not connect"));
    socket.on("match:snapshot", (s) => setSnapshot(s));
    socket.on("game:view", (v) => setView(v));
    socket.on("errorMsg", ({ message }) => setError(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  const place = useCallback((column: number) => {
    socketRef.current?.emit("game:place", { column });
  }, []);
  const next = useCallback(() => {
    socketRef.current?.emit("game:next");
  }, []);

  return { snapshot, view, error, connected, place, next };
}
