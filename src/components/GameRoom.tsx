"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useGameSocket } from "./useGameSocket";
import { DeckToggle } from "./DeckToggle";
import { NotificationToggle } from "./NotificationToggle";
import { CardSlot, FannedColumn, type CardSize } from "./PlayingCard";
import { cardId } from "@/lib/game/cards";
import type { Card } from "@/lib/game/cards";
import type { CardView, GameView, PlayerIndex } from "@/lib/game/types";
import type { MatchSnapshot } from "@/lib/realtime/events";

export function GameRoom({ code }: { code: string }) {
  const { snapshot, view, error, connected, place, discard, next, endMatch } =
    useGameSocket(code);

  if (error && !snapshot) {
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
  if (snapshot.status === "complete" && !view) {
    return (
      <>
        {error && <SocketNotice message={error} />}
        <Centered>
          <p className="text-lg font-semibold">This match has ended.</p>
          <Link href="/" className="btn-primary mt-6">
            Back to lobby
          </Link>
        </Centered>
      </>
    );
  }
  if (!snapshot.guest || snapshot.status === "lobby") {
    return (
      <>
        {error && <SocketNotice message={error} />}
        <WaitingRoom snapshot={snapshot} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        {error && <SocketNotice message={error} />}
        <Centered>
          <Spinner />
          <p className="mt-4 text-white/70">Dealing the cards…</p>
        </Centered>
      </>
    );
  }

  return (
    <>
      {error && <SocketNotice message={error} />}
      <Table
        snapshot={snapshot}
        view={view}
        onPlace={place}
        onDiscard={discard}
        onNext={next}
        onEndMatch={endMatch}
      />
    </>
  );
}

function SocketNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="bg-rose-950 px-4 py-2 text-center text-sm text-rose-100">
      {message}
    </div>
  );
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
    <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-gold" />
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
        /* fall through */
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
      <div className="panel max-w-full border-gold/40 px-4 py-6 sm:px-8">
        <div className="font-mono text-3xl font-black tracking-[0.2em] text-gold sm:text-5xl sm:tracking-[0.35em]">
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

function cvId(cv: CardView): string {
  return cv.state === "card" ? cardId(cv.card) : "";
}

function Table({
  snapshot,
  view,
  onPlace,
  onDiscard,
  onNext,
  onEndMatch,
}: {
  snapshot: MatchSnapshot;
  view: GameView;
  onPlace: (cardId: string, row: number) => boolean;
  onDiscard: (cardId: string) => boolean;
  onNext: () => boolean;
  onEndMatch: () => boolean;
}) {
  const you = view.you;
  const opp = (1 - you) as PlayerIndex;
  const myBoard = view.players[you];
  const oppBoard = view.players[opp];
  const myScore = you === 0 ? snapshot.scoreHost : snapshot.scoreGuest;
  const oppScore = you === 0 ? snapshot.scoreGuest : snapshot.scoreHost;
  const gameOver = view.phase === "complete";
  const matchOver = snapshot.status === "complete";

  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Drop any selection whose card is no longer in hand (after a move / new turn).
  useEffect(() => {
    const ids = new Set(myBoard.hand.map(cvId));
    if (selected && !ids.has(selected)) setSelected(null);
    if (!view.yourTurn && selected) setSelected(null);
  }, [view, myBoard.hand, selected]);

  function tapRow(rowIndex: number) {
    if (!view.yourTurn || !selected) return;
    if (!view.legalRows.includes(rowIndex)) return;
    if (onPlace(selected, rowIndex)) setSelected(null);
  }

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  let body: ReactNode;

  if (gameOver || matchOver) {
    body = (
      <main className="flex flex-1 flex-col gap-2 p-3">
        <TopBar code={snapshot.inviteCode} onSettings={openSettings} />
        <PlayerBar name={oppBoard.displayName} score={oppScore} target={snapshot.targetWins} />
        <ResultBoard board={oppBoard} view={view} seat={opp} size="sm" />
        <div className="my-1">
          {matchOver ? (
            <MatchOver snapshot={snapshot} you={you} />
          ) : (
            <GameOver view={view} you={you} snapshot={snapshot} onNext={onNext} />
          )}
        </div>
        <ResultBoard board={myBoard} view={view} seat={you} size="sm" />
        <PlayerBar name={myBoard.displayName} score={myScore} target={snapshot.targetWins} gold you />
      </main>
    );
  } else {
    body = (
    <main className="flex flex-1 flex-col gap-2 p-3">
      <TopBar code={snapshot.inviteCode} onSettings={openSettings} />

      {/* Opponent: 4 face-up hands + concealed hand (hidden) */}
      <PlayerBar name={oppBoard.displayName} score={oppScore} target={snapshot.targetWins} />
      <HandsRow board={oppBoard} size="sm" />

      {/* Turn banner */}
      <TurnBanner view={view} oppName={oppBoard.displayName} selected={selected !== null} />

      {/* Your four rows — drop targets when a card is selected */}
      <RowsBoard
        board={myBoard}
        size="md"
        legalRows={view.yourTurn && selected ? view.legalRows : []}
        onRow={tapRow}
      />

      {/* Your hand — select a card to place or discard */}
      <YourHand
        hand={myBoard.hand}
        selected={selected}
        yourTurn={view.yourTurn}
        canDiscard={view.canDiscard}
        onSelect={(id) => setSelected((s) => (s === id ? null : id))}
        onDiscard={() => {
          if (selected) {
            if (onDiscard(selected)) setSelected(null);
          }
        }}
      />

      <PlayerBar name={myBoard.displayName} score={myScore} target={snapshot.targetWins} gold you />
    </main>
    );
  }

  return (
    <>
      {body}
      {settingsOpen && (
        <SettingsModal
          onClose={closeSettings}
          onEndMatch={onEndMatch}
          matchOver={matchOver}
        />
      )}
    </>
  );
}

function TopBar({ code, onSettings }: { code: string; onSettings: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-white/50">
      <Link href="/" className="rounded px-1 py-0.5 active:text-white">
        ← Leave
      </Link>
      <span className="font-mono tracking-[0.25em]">{code}</span>
      <button
        type="button"
        onClick={onSettings}
        className="rounded px-1 py-0.5 active:text-white"
      >
        ⚙ Settings
      </button>
    </div>
  );
}

/**
 * In-game settings overlay. It is a pure client-side modal — opening or closing
 * it never navigates away, so the live socket connection and the server-side
 * game state are untouched and the session is preserved.
 */
function SettingsModal({
  onClose,
  onEndMatch,
  matchOver,
}: {
  onClose: () => void;
  onEndMatch: () => boolean;
  matchOver: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog) return;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    (focusable()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="panel w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-black text-gold">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="px-1 text-lg text-white/60"
          >
            ✕
          </button>
        </div>
        <DeckToggle />
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-2 text-sm font-bold">Notifications</div>
          <NotificationToggle />
        </div>
        <a
          href="/how-to-play"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block text-center text-sm text-white/70 underline"
        >
          How to play (opens in a new tab)
        </a>
        <p className="mt-4 rounded-lg bg-black/20 px-3 py-2 text-center text-[11px] text-white/50">
          Your game is saved automatically — close the app and come back
          anytime to continue.
        </p>
        <button onClick={onClose} className="btn-primary mt-3 w-full">
          Resume game
        </button>
        {!matchOver && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  "End this match for both players? This can't be undone.",
                )
              ) {
                if (onEndMatch()) onClose();
              }
            }}
            className="mt-2 w-full rounded-xl border border-rose-400/40 py-2 text-sm font-bold text-rose-200"
          >
            End match
          </button>
        )}
      </div>
    </div>
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
        <span className="text-xs tabular-nums text-white/50">
          {score}/{target}
        </span>
      </div>
    </div>
  );
}

/** Opponent's four face-up hands plus their concealed hand (as card backs). */
function HandsRow({ board, size }: { board: GameView["players"][0]; size: CardSize }) {
  const concealedCount = Math.min(board.hand.length, 5);
  const backs: CardView[] = Array.from({ length: 5 }, (_, i) =>
    i < concealedCount ? { state: "hidden" } : { state: "empty" },
  );
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {board.rows.map((row, i) => (
        <div key={i} className="flex flex-col items-center rounded-lg p-1">
          <FannedColumn slots={row} size={size} />
        </div>
      ))}
      <div className="flex flex-col items-center rounded-lg border border-white/10 bg-black/20 p-1">
        <FannedColumn slots={backs} size={size} />
        <span className="mt-0.5 text-[8px] uppercase tracking-wide text-white/45">
          hidden
        </span>
      </div>
    </div>
  );
}

/** Your four rows as tappable drop targets. */
function RowsBoard({
  board,
  size,
  legalRows,
  onRow,
}: {
  board: GameView["players"][0];
  size: CardSize;
  legalRows: number[];
  onRow: (row: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {board.rows.map((row, i) => {
        const playable = legalRows.includes(i);
        const target = playable ? row.findIndex((s) => s.state === "empty") : null;
        return (
          <button
            key={i}
            type="button"
            disabled={!playable}
            onClick={() => onRow(i)}
            aria-label={
              playable
                ? `Place selected card in hand ${i + 1}`
                : `Hand ${i + 1} is not available`
            }
            className={`flex flex-col items-center rounded-lg p-1 transition ${
              playable
                ? "target-glow bg-gold/10 ring-2 ring-gold/80 active:scale-95"
                : ""
            }`}
          >
            <FannedColumn slots={row} size={size} targetIndex={target} />
          </button>
        );
      })}
    </div>
  );
}

/** Your concealed hand: tap a card to select, then place it or discard it. */
function YourHand({
  hand,
  selected,
  yourTurn,
  canDiscard,
  onSelect,
  onDiscard,
}: {
  hand: CardView[];
  selected: string | null;
  yourTurn: boolean;
  canDiscard: boolean;
  onSelect: (id: string) => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
          Your hidden hand
        </span>
        <button
          onClick={onDiscard}
          disabled={!yourTurn || !canDiscard || !selected}
          className="rounded-md border border-rose-400/40 px-2 py-1 text-[11px] font-bold text-rose-200 disabled:opacity-40"
        >
          Discard{canDiscard ? "" : " ✓"}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {hand.map((cv, i) => {
          const id = cvId(cv);
          const isSel = selected === id;
          return (
            <button
              key={id || i}
              type="button"
              disabled={!yourTurn || cv.state !== "card"}
              onClick={() => id && onSelect(id)}
              aria-label={
                cv.state === "card"
                  ? `${isSel ? "Deselect" : "Select"} ${describeCard(cv.card)}`
                  : "Unavailable card"
              }
              aria-pressed={isSel}
              className={`transition ${isSel ? "-translate-y-2" : ""} ${
                yourTurn ? "active:scale-95" : "opacity-90"
              }`}
            >
              <div className={isSel ? "rounded-lg ring-2 ring-gold" : ""}>
                <CardSlot slot={cv} size="lg" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TurnBanner({
  view,
  oppName,
  selected,
}: {
  view: GameView;
  oppName: string;
  selected: boolean;
}) {
  const yours = view.yourTurn;
  const hint = yours
    ? selected
      ? "Tap a highlighted hand to place — or Discard"
      : "Tap a card in your hand to pick it"
    : "Waiting…";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between rounded-xl px-4 py-2 ${
        yours ? "bg-gold text-felt-900" : "bg-black/30 text-white"
      }`}
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
          {view.placed[view.you]} / {view.total} placed
        </div>
        <div className="text-base font-black">
          {yours ? "Your turn" : `${oppName}’s turn`}
        </div>
      </div>
      <div className="max-w-[55%] text-right text-[11px] opacity-80">{hint}</div>
    </div>
  );
}

function describeCard(card: Card): string {
  const ranks: Record<number, string> = {
    11: "Jack",
    12: "Queen",
    13: "King",
    14: "Ace",
  };
  const suits: Record<Card["suit"], string> = {
    s: "spades",
    h: "hearts",
    d: "diamonds",
    c: "clubs",
  };
  return `${ranks[card.rank] ?? card.rank} of ${suits[card.suit]}`;
}

/** Showdown board: 4 rows + the (revealed) concealed hand, with win highlights. */
function ResultBoard({
  board,
  view,
  seat,
  size,
}: {
  board: GameView["players"][0];
  view: GameView;
  seat: PlayerIndex;
  size: CardSize;
}) {
  const result = view.result;
  const cols: CardView[][] = [...board.rows, board.hand];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cols.map((slots, i) => {
        const hr = result?.hands[i];
        const won = hr?.winner === seat;
        const label = hr?.scores[seat].label ?? "";
        const isHand = i === 4;
        return (
          <div
            key={i}
            className={`flex flex-col items-center rounded-lg p-1 ${
              won ? "bg-emerald-400/5 ring-2 ring-emerald-400/70" : "opacity-70"
            }`}
          >
            <FannedColumn slots={padTo5(slots)} size={size} />
            <span
              className={`mt-0.5 text-[9px] leading-tight ${
                won ? "text-emerald-300" : "text-white/55"
              }`}
            >
              {isHand ? "★ " : ""}
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function padTo5(slots: CardView[]): CardView[] {
  const out = slots.slice(0, 5);
  while (out.length < 5) out.push({ state: "empty" });
  return out;
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
  onNext: () => boolean;
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
      <div className={`text-lg font-black ${tie ? "text-white" : won ? "text-gold" : "text-rose-300"}`}>
        {headline}
      </div>
      <div className="text-xs text-white/60">
        Hands won — you {result.handWins[you]} · opponent{" "}
        {result.handWins[(1 - you) as PlayerIndex]}
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

function MatchOver({ snapshot, you }: { snapshot: MatchSnapshot; you: PlayerIndex }) {
  const won = snapshot.matchWinner === you;
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
