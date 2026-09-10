"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_PATH } from "../lib/realtime/events";
import type {
  ClientToServerEvents,
  MatchSnapshot,
  ServerToClientEvents,
} from "@/lib/realtime/events";
import type { GameView } from "@/lib/game/types";
import type { ExhibitionAction } from "@/lib/game/exhibitionTypes";
import { previewPlacement } from "../lib/game/optimisticPlacement";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface GameSocketState {
  snapshot: MatchSnapshot | null;
  view: GameView | null;
  error: string | null;
  connected: boolean;
  sync: number;
  animationKey: string;
  placing: boolean;
  place: (cardId: string, row: number) => boolean;
  discard: (cardId: string) => boolean;
  next: () => boolean;
  endMatch: () => boolean;
  exhibition: (action: ExhibitionAction) => boolean;
}

export function useGameSocket(code: string): GameSocketState {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sync, setSync] = useState(0);
  const [animationKey, setAnimationKey] = useState(code);
  const [placing, setPlacing] = useState(false);
  const confirmedView = useRef<GameView | null>(null);
  const pendingPlacement = useRef(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMatch = useRef(false);
  const socketRef = useRef<ClientSocket | null>(null);
  const joinedRef = useRef(false);
  const settlePlacement = useCallback((restore = false) => {
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = null;
    if (restore && pendingPlacement.current) setView(confirmedView.current);
    pendingPlacement.current = false;
    setPlacing(false);
  }, []);

  useEffect(() => {
    settlePlacement();
    confirmedView.current = null;
    activeMatch.current = false;
    setSnapshot(null);
    setView(null);
    setError(null);
    setConnected(false);

    const socket: ClientSocket = io({
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    let firstView = true;
    let latestSnapshot: MatchSnapshot | null = null;

    socket.on("connect", () => {
      firstView = true;
      setConnected(true);
      joinedRef.current = false;
      setError(null);
      socket.emit("match:join", { code });
    });
    socket.on("disconnect", () => {
      settlePlacement(true);
      setConnected(false);
      joinedRef.current = false;
      setError("Connection lost. Reconnecting…");
    });
    socket.on("connect_error", () => setError("Could not connect"));
    socket.on("match:snapshot", (s) => {
      latestSnapshot = s;
      activeMatch.current = s.status === "active";
      if (!activeMatch.current) settlePlacement(true);
      setSnapshot(s);
      setError(null);
    });
    socket.on("game:view", (v) => {
      joinedRef.current = latestSnapshot !== null;
      confirmedView.current = v;
      settlePlacement();
      if (latestSnapshot) setAnimationKey(`${code}:${latestSnapshot.gameNumber}`);
      if (firstView) { setSync(current => current + 1); firstView = false; }
      setView(v);
      setError(null);
    });
    socket.on("errorMsg", ({ message }) => {
      settlePlacement(true);
      setError(message);
    });

    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      confirmationTimer.current = null;
      pendingPlacement.current = false;
      activeMatch.current = false;
      confirmedView.current = null;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      joinedRef.current = false;
    };
  }, [code, settlePlacement]);

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
    if (pendingPlacement.current || !activeMatch.current) return false;
    const preview = previewPlacement(confirmedView.current, cardId, row);
    if (!preview) return false;
    return send((socket) => {
      pendingPlacement.current = true;
      setPlacing(true);
      setView(preview);
      // A missing reply requests current state, never retransmits the move.
      confirmationTimer.current = setTimeout(() => {
        if (!pendingPlacement.current || socketRef.current !== socket) return;
        setError("Waiting for confirmation. Refreshing the table…");
        socket.emit("match:join", { code });
      }, 8000);
      socket.emit("game:place", { cardId, row });
    });
  }, [send, code]);
  const discard = useCallback((cardId: string) => {
    if (pendingPlacement.current) return false;
    return send((socket) => socket.emit("game:discard", { cardId }));
  }, [send]);
  const next = useCallback(() => {
    if (pendingPlacement.current) return false;
    return send((socket) => socket.emit("game:next"));
  }, [send]);
  const endMatch = useCallback(() => {
    if (pendingPlacement.current) return false;
    return send((socket) => socket.emit("match:end"));
  }, [send]);

  const exhibition = useCallback((action: ExhibitionAction) => {
    if (pendingPlacement.current) return false;
    return send((socket) => socket.emit("game:exhibition", action));
  }, [send]);
  return { snapshot, view, error, connected, sync, animationKey, placing, place, discard, next, endMatch, exhibition };
}
