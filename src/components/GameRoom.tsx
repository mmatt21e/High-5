"use client";

import { useState } from "react";
import Link from "next/link";
import { useGameSocket } from "./useGameSocket";
import { CardSlot, CardFace } from "./PlayingCard";
import type { GameView, PlayerIndex } from "@/lib/game/types";
import type { CardView } from "@/lib/game/types";
import type { MatchSnapshot } from "@/lib/realtime/events";

export function GameRoom({ code }: { code: string }) {
  const { snapshot, view, error, connected, place, next } = useGameSocket(code);

  if (error) {
    return (
      <Centered>
        <p className="text-rose-400">{error}</p>
        <Link href="/" className="mt-4 text-gold underline">
          Back to lobby
        </Link>
      </Centered>
    );
  }

  if (!snapshot) {
    return <Centered>{connected ? "Joining game…" : "Connecting…"}</Centered>;
  }

  // Waiting for the opponent to join.
  if (!snapshot.guest || snapshot.status === "lobby") {
    return <WaitingRoom snapshot={snapshot} />;
  }

  if (!view) {
    return <Centered>Setting up the table…</Centered>;
  }

  return (
    <Table snapshot={snapshot} view={view} onPlace={place} onNext={next} />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6 text-center text-white/80">
      {children}
    </main>
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
      <h1 className="text-xl font-bold">Waiting for your opponent…</h1>
      <p className="text-sm text-white/60">Share this code to invite a player</p>
      <div className="rounded-2xl border border-gold/40 bg-black/20 px-8 py-6">
        <div className="text-5xl font-black tracking-[0.4em] text-gold">
          {snapshot.inviteCode}
        </div>
      </div>
      <button
        onClick={share}
        className="rounded-xl bg-gold px-6 py-3 font-bold text-felt-900"
      >
        {copied ? "Copied!" : "Share invite"}
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
  const gameOver = view.phase === "complete";
  const matchOver = snapshot.status === "complete";
  const result = view.result;

  return (
    <main className="flex flex-1 flex-col gap-2 p-3">
      {/* Opponent header */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{oppBoard.displayName}</span>
        <ScoreBadge mine={oppScore} target={snapshot.targetWins} />
      </div>

      {/* Opponent board */}
      <BoardGrid
        board={oppBoard.columns}
        size="sm"
        result={result ? result.columns.map((c) => c.winner === opp) : null}
        labels={result ? result.columns.map((c) => c.scores[opp].label) : null}
      />

      {/* Center status */}
      <div className="my-1 rounded-xl bg-black/25 px-3 py-2 text-center">
        {matchOver ? (
          <MatchOver snapshot={snapshot} you={you} />
        ) : gameOver ? (
          <GameOver result={result} you={you} onNext={onNext} snapshot={snapshot} />
        ) : (
          <TurnStatus view={view} oppName={oppBoard.displayName} />
        )}
      </div>

      {/* Your board */}
      <BoardGrid
        board={myBoard.columns}
        size="md"
        interactive={view.yourTurn ? view.legalColumns : null}
        onColumn={onPlace}
        result={result ? result.columns.map((c) => c.winner === you) : null}
        labels={result ? result.columns.map((c) => c.scores[you].label) : null}
      />

      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-gold">
          {myBoard.displayName} (you)
        </span>
        <ScoreBadge mine={myScore} target={snapshot.targetWins} highlight />
      </div>
    </main>
  );
}

function ScoreBadge({
  mine,
  target,
  highlight = false,
}: {
  mine: number;
  target: number;
  highlight?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-0.5 text-xs font-bold ${
        highlight ? "bg-gold text-felt-900" : "bg-white/10 text-white"
      }`}
    >
      {mine} / {target}
    </span>
  );
}

function TurnStatus({ view, oppName }: { view: GameView; oppName: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="text-left">
        <div className="text-xs text-white/50">Round {view.round + 1} of 5</div>
        <div className="text-sm font-semibold">
          {view.yourTurn ? "Your turn — tap a column" : `${oppName} is playing…`}
        </div>
      </div>
      {view.yourTurn && view.pending && (
        <div className="animate-pulse">
          <CardFace card={view.pending} size="md" />
        </div>
      )}
    </div>
  );
}

function GameOver({
  result,
  you,
  onNext,
  snapshot,
}: {
  result: GameView["result"];
  you: PlayerIndex;
  onNext: () => void;
  snapshot: MatchSnapshot;
}) {
  if (!result) return null;
  const won = result.winner === you;
  const tie = result.winner === null;
  const headline = tie
    ? "Game tied"
    : won
      ? result.isFiveO
        ? "FIVE-O! You swept all 5!"
        : "You won the game!"
      : "You lost the game";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`text-base font-black ${
          tie ? "text-white" : won ? "text-gold" : "text-rose-400"
        }`}
      >
        {headline}
      </div>
      <div className="text-xs text-white/60">
        Columns won — you {result.columnWins[you]} ·{" "}
        {result.columnWins[(1 - you) as PlayerIndex]} opponent
      </div>
      <button
        onClick={onNext}
        disabled={snapshot.youReady}
        className="mt-1 rounded-lg bg-gold px-5 py-2 text-sm font-bold text-felt-900 disabled:opacity-50"
      >
        {snapshot.youReady
          ? snapshot.opponentReady
            ? "Starting…"
            : "Waiting for opponent…"
          : "Next game"}
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
    <div className="flex flex-col items-center gap-2 py-1">
      <div
        className={`text-lg font-black ${won ? "text-gold" : "text-rose-400"}`}
      >
        {won ? "🏆 You win the match!" : "Match over"}
      </div>
      <div className="text-xs text-white/60">
        Final score {snapshot.scoreHost} – {snapshot.scoreGuest}
      </div>
      <Link
        href="/"
        className="mt-1 rounded-lg bg-gold px-5 py-2 text-sm font-bold text-felt-900"
      >
        Back to lobby
      </Link>
    </div>
  );
}

function BoardGrid({
  board,
  size,
  interactive = null,
  onColumn,
  result = null,
  labels = null,
}: {
  board: CardView[][];
  size: "sm" | "md";
  interactive?: number[] | null;
  onColumn?: (col: number) => void;
  result?: boolean[] | null;
  labels?: string[] | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {board.map((col, i) => {
        const playable = interactive?.includes(i) ?? false;
        const wonCol = result?.[i] ?? false;
        return (
          <button
            key={i}
            type="button"
            disabled={!playable}
            onClick={() => playable && onColumn?.(i)}
            className={`flex flex-col items-center gap-1 rounded-lg p-1 transition ${
              playable
                ? "bg-gold/15 ring-2 ring-gold active:scale-95"
                : result
                  ? wonCol
                    ? "ring-1 ring-emerald-400/70"
                    : "ring-1 ring-white/5"
                  : ""
            }`}
          >
            {col.map((slot, r) => (
              <CardSlot key={r} slot={slot} size={size} />
            ))}
            {labels && (
              <span className="mt-0.5 text-center text-[9px] leading-tight text-white/70">
                {labels[i]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
