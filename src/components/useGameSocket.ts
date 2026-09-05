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
  place: (cardId: string, row: number) => boolean;
  discard: (cardId: string) => boolean;
  next: () => boolean;
  endMatch: () => boolean;
}

export function useGameSocket(code: string): GameSocketState {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<ClientSocket | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    setSnapshot(null);
    setView(null);
    setError(null);
    setConnected(false);

    const socket: ClientSocket = io({
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      joinedRef.current = false;
      setError(null);
      socket.emit("match:join", { code });
    });
    socket.on("disconnect", () => {
      setConnected(false);
      joinedRef.current = false;
      setError("Connection lost. Reconnecting…");
    });
    socket.on("connect_error", () => setError("Could not connect"));
    socket.on("match:snapshot", (s) => {
      joinedRef.current = true;
      setSnapshot(s);
      setError(null);
    });
    socket.on("game:view", (v) => {
      setView(v);
      setError(null);
    });
    socket.on("errorMsg", ({ message }) => setError(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joinedRef.current = false;
    };
  }, [code]);

  const send = useCallback((emit: (socket: ClientSocket) => void): boolean => {
    const socket = socketRef.current;
    if (!socket?.connected || !joinedRef.current) {
      setError("Rejoining the match. Wait a moment before acting.");
      return false;
    }
    setError(null);
    emit(socket);
    return true;
  }, []);

  const place = useCallback((cardId: string, row: number) => {
    return send((socket) => socket.emit("game:place", { cardId, row }));
  }, [send]);
  const discard = useCallback((cardId: string) => {
    return send((socket) => socket.emit("game:discard", { cardId }));
  }, [send]);
  const next = useCallback(() => {
    return send((socket) => socket.emit("game:next"));
  }, [send]);
  const endMatch = useCallback(() => {
    return send((socket) => socket.emit("match:end"));
  }, [send]);

  return { snapshot, view, error, connected, place, discard, next, endMatch };
}
