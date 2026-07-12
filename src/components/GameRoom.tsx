"use client";

import { useState } from "react";
import Link from "next/link";
import { useGameSocket } from "./useGameSocket";
import { CardFace, FannedColumn, type CardSize } from "./PlayingCard";
import type { CardView, GameView, PlayerIndex } from "@/lib/game/types";
import type { MatchSnapshot } from "@/lib/realtime/events";

export function GameRoom({ code }: { code: string }) {
  const { snapshot, view, error, connected, place, next } = useGameSocket(code);

  if (error) {
    return (
      <Centered>
        <p className="text-lg font-semibold text-rose-300">{error}</p>
        <Link href="/" className="btn-primary mt-6">
          Back to lobby
        </Link>
      </Centered>
    );
  }

  if (!snapshot) {
    return (
      <Centered>
        <Spinner />
        <p className="mt-4 text-white/70">
          {connected ? "Joining game…" : "Connecting…"}
        </p>
      </Centered>
    );
  }

  if (!snapshot.guest || snapshot.status === "lobby") {
    return <WaitingRoom snapshot={snapshot} />;
  }

  if (!view) {
    return (
      <Centered>
        <Spinner />
        <p className="mt-4 text-white/70">Shuffling the deck…</p>
      </Centered>
    );
  }

  return <Table snapshot={snapshot} view={view} onPlace={place} onNext={next} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}

function Spinner() {
  return (
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-gold" />
  );
}

function WaitingRoom({ snapshot }: { snapshot: MatchSnapshot }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/play/${snapshot.inviteCode}`;
    const data = {
      title: "Five-O Poker",
      text: `Join my Five-O Poker game! Code: ${snapshot.inviteCode}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await navigator.clipboard.writeText(`${data.text} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex items-center gap-3 text-white/70">
        <Spinner />
        <span className="font-semibold">Waiting for your opponent…</span>
      </div>
      <p className="text-sm text-white/60">Share this code to invite a player</p>
      <div className="panel border-gold/40 px-8 py-6">
        <div className="text-5xl font-black tracking-[0.35em] text-gold">
          {snapshot.inviteCode}
        </div>
      </div>
      <button onClick={share} className="btn-primary w-full max-w-xs">
        {copied ? "Copied to clipboard!" : "Share invite"}
      </button>
      <Link href="/" className="text-sm text-white/60 underline">
        Cancel
      </Link>
    </main>
  );
}

function Table({
  snapshot,
  view,
  onPlace,
  onNext,
}: {
  snapshot: MatchSnapshot;
  view: GameView;
  onPlace: (col: number) => void;
  onNext: () => void;
}) {
  const you = view.you;
  const opp = (1 - you) as PlayerIndex;
  const myBoard = view.players[you];
  const oppBoard = view.players[opp];
  const myScore = you === 0 ? snapshot.scoreHost : snapshot.scoreGuest;
  const oppScore = you === 0 ? snapshot.scoreGuest : snapshot.scoreHost;
  const result = view.result;
  const gameOver = view.phase === "complete";
  const matchOver = snapshot.status === "complete";

  const wins = (seat: PlayerIndex) =>
    result ? result.columns.map((c) => c.winner === seat) : null;
  const labels = (seat: PlayerIndex) =>
    result ? result.columns.map((c) => c.scores[seat].label) : null;

  return (
    <main className="flex flex-1 flex-col justify-center gap-3 p-3">
      {/* Top group: opponent */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-white/50">
          <Link href="/" className="rounded px-1 py-0.5 active:text-white">
            ← Leave
          </Link>
          <span className="font-mono tracking-[0.25em]">
            {snapshot.inviteCode}
          </span>
          <Link
            href="/how-to-play"
            className="rounded px-1 py-0.5 active:text-white"
          >
            Rules
          </Link>
        </div>
        <PlayerBar
          name={oppBoard.displayName}
          score={oppScore}
          target={snapshot.targetWins}
        />
        <Board board={oppBoard.columns} size="sm" wins={wins(opp)} labels={labels(opp)} />
      </div>

      {/* Center: turn banner or end-of-game panel, between the two boards */}
      <div className="w-full">
        {matchOver ? (
          <MatchOver snapshot={snapshot} you={you} />
        ) : gameOver ? (
          <GameOver view={view} you={you} snapshot={snapshot} onNext={onNext} />
        ) : (
          <TurnBanner view={view} oppName={oppBoard.displayName} />
        )}
      </div>

      {/* Bottom group: your board */}
      <div className="flex flex-col gap-2">
        <Board
          board={myBoard.columns}
          size="md"
          interactive={view.yourTurn ? view.legalColumns : null}
          onColumn={onPlace}
          wins={wins(you)}
          labels={labels(you)}
        />
        <PlayerBar
          name={myBoard.displayName}
          score={myScore}
          target={snapshot.targetWins}
          gold
          you
        />
      </div>
    </main>
  );
}

function PlayerBar({
  name,
  score,
  target,
  gold = false,
  you = false,
}: {
  name: string;
  score: number;
  target: number;
  gold?: boolean;
  you?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className={`text-sm font-semibold ${gold ? "text-gold" : "text-white"}`}>
        {name}
        {you && <span className="ml-1 text-white/40">(you)</span>}
      </span>
      <div className="flex items-center gap-2">
        <ScorePips score={score} target={target} gold={gold} />
        <span className="text-xs tabular-nums text-white/50">
          {score}/{target}
        </span>
      </div>
    </div>
  );
}

function ScorePips({
  score,
  target,
  gold,
}: {
  score: number;
  target: number;
  gold: boolean;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: target }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < score ? (gold ? "bg-gold" : "bg-white") : "bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}

function TurnBanner({ view, oppName }: { view: GameView; oppName: string }) {
  const yours = view.yourTurn;
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${
        yours ? "bg-gold text-felt-900" : "bg-black/30 text-white"
      }`}
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
          Round {view.round + 1} of 5
        </div>
        <div className="text-base font-black">
          {yours ? "Your turn" : `${oppName}’s turn`}
        </div>
        <div className="text-[11px] opacity-70">
          {yours ? "Tap a highlighted column" : "Waiting…"}
        </div>
      </div>
      {yours && view.pending && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase">Place</span>
          <CardFace card={view.pending} size="md" />
        </div>
      )}
    </div>
  );
}

function GameOver({
  view,
  you,
  snapshot,
  onNext,
}: {
  view: GameView;
  you: PlayerIndex;
  snapshot: MatchSnapshot;
  onNext: () => void;
}) {
  const result = view.result;
  if (!result) return null;
  const won = result.winner === you;
  const tie = result.winner === null;
  const headline = tie
    ? "Game tied"
    : won
      ? result.isFiveO
        ? "FIVE-O! Clean sweep!"
        : "You won the game!"
      : "Opponent won the game";
  return (
    <div className="panel flex flex-col items-center gap-2 py-3">
      <div
        className={`text-lg font-black ${
          tie ? "text-white" : won ? "text-gold" : "text-rose-300"
        }`}
      >
        {headline}
      </div>
      <div className="text-xs text-white/60">
        Hands won — you {result.columnWins[you]} · opponent{" "}
        {result.columnWins[(1 - you) as PlayerIndex]}
      </div>
      <button
        onClick={onNext}
        disabled={snapshot.youReady}
        className="btn-primary mt-1 w-full max-w-xs"
      >
        {snapshot.youReady
          ? snapshot.opponentReady
            ? "Starting…"
            : "Waiting for opponent…"
          : "Next game →"}
      </button>
    </div>
  );
}

function MatchOver({
  snapshot,
  you,
}: {
  snapshot: MatchSnapshot;
  you: PlayerIndex;
}) {
  const myId = you === 0 ? snapshot.host.userId : snapshot.guest?.userId;
  const won = snapshot.matchWinnerId === myId;
  return (
    <div className="panel flex flex-col items-center gap-2 py-4">
      <div className={`text-2xl font-black ${won ? "text-gold" : "text-rose-300"}`}>
        {won ? "🏆 You win the match!" : "Match over"}
      </div>
      <div className="text-sm text-white/60">
        Final score {snapshot.scoreHost} – {snapshot.scoreGuest}
      </div>
      <Link href="/" className="btn-primary mt-2 w-full max-w-xs">
        Back to lobby
      </Link>
    </div>
  );
}

function firstEmpty(col: CardView[]): number {
  return col.findIndex((s) => s.state === "empty");
}

function Board({
  board,
  size,
  interactive = null,
  onColumn,
  wins = null,
  labels = null,
}: {
  board: CardView[][];
  size: CardSize;
  interactive?: number[] | null;
  onColumn?: (col: number) => void;
  wins?: boolean[] | null;
  labels?: string[] | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {board.map((col, i) => {
        const playable = interactive?.includes(i) ?? false;
        const won = wins?.[i] ?? false;
        const showResult = wins != null;
        return (
          <button
            key={i}
            type="button"
            disabled={!playable}
            onClick={() => playable && onColumn?.(i)}
            className={`flex flex-col items-center rounded-lg p-1 transition ${
              playable
                ? "target-glow bg-gold/10 ring-2 ring-gold/80 active:scale-95"
                : showResult
                  ? won
                    ? "bg-emerald-400/5 ring-2 ring-emerald-400/70"
                    : "opacity-60"
                  : ""
            }`}
          >
            <FannedColumn
              slots={col}
              size={size}
              targetIndex={playable ? firstEmpty(col) : null}
            />
            {labels && (
              <span
                className={`mt-1 text-center text-[9px] leading-tight ${
                  won ? "text-emerald-300" : "text-white/55"
                }`}
              >
                {labels[i]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
