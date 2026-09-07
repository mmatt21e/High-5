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
import { AppearanceSettings } from "./AppearanceSettings";
import { NotificationToggle } from "./NotificationToggle";
import { PlayerAvatar } from "./PlayerAvatar";
import {
  CardSlot,
  CardBack,
  FannedColumn,
  describePlayingCard,
  type CardSize,
} from "./PlayingCard";
import { cardId } from "@/lib/game/cards";
import type { CardView, GameView, PlayerIndex } from "@/lib/game/types";
import type { MatchSnapshot } from "@/lib/realtime/events";

export function GameRoom({ code }: { code: string }) {
  const { snapshot, view, error, connected, place, discard, next, endMatch } =
    useGameSocket(code);

  if (error && !snapshot) {
    return (
      <Centered>
        <p className="error-text text-lg font-semibold">{error}</p>
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
        <p className="supporting-text mt-4">
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
          <p className="supporting-text mt-4">Dealing the cards…</p>
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
    <div role="alert" className="error-text border-b border-current bg-black/45 px-4 py-2 text-center text-sm">
      {message}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-screen flex flex-1 flex-col items-center justify-center text-center">
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
    <main className="app-screen flex flex-1 flex-col items-center justify-center text-center">
      <div className="supporting-text flex items-center gap-3">
        <Spinner />
        <span className="font-semibold">Waiting for your opponent…</span>
      </div>
      <p className="subtle-text text-sm">Share this code to invite a player</p>
      <div className="panel max-w-full border-gold/40 px-4 py-6 sm:px-8">
        <div className="font-mono text-3xl font-black tracking-[0.2em] text-gold sm:text-5xl sm:tracking-[0.35em]">
          {snapshot.inviteCode}
        </div>
      </div>
      <button onClick={share} className="btn-primary w-full max-w-xs">
        {copied ? "Copied to clipboard!" : "Share invite"}
      </button>
      <Link href="/" className="nav-link px-2 text-sm">
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
        <PlayerBar name={oppBoard.displayName} avatar={(opp === 0 ? snapshot.host : snapshot.guest)?.avatar} score={oppScore} target={snapshot.targetWins} />
        <ResultBoard board={oppBoard} view={view} seat={opp} size="sm" />
        <div className="my-1">
          {matchOver ? (
            <MatchOver snapshot={snapshot} you={you} />
          ) : (
            <GameOver view={view} you={you} snapshot={snapshot} onNext={onNext} />
          )}
        </div>
        <ResultBoard board={myBoard} view={view} seat={you} size="sm" />
        <PlayerBar name={myBoard.displayName} avatar={(you === 0 ? snapshot.host : snapshot.guest)?.avatar} score={myScore} target={snapshot.targetWins} gold you />
      </main>
    );
  } else {
    body = (
    <main className="game-table-active" aria-label="Five-O game table">
      <TopBar code={snapshot.inviteCode} onSettings={openSettings} />

      <MatchHud
        view={view}
        opponentName={oppBoard.displayName}
        opponentAvatar={(opp === 0 ? snapshot.host : snapshot.guest)?.avatar}
        opponentScore={oppScore}
        yourName={myBoard.displayName}
        yourAvatar={(you === 0 ? snapshot.host : snapshot.guest)?.avatar}
        yourScore={myScore}
        target={snapshot.targetWins}
        selected={selected !== null}
      />

      <div className="game-board-scroll" aria-label="Scrollable playing area">
        <section className="game-board-section" aria-labelledby="opponent-layout-title">
          <h2 id="opponent-layout-title" className="game-board-label">
            {oppBoard.displayName}&apos;s layout
          </h2>
          <HandsRow board={oppBoard} size="sm" />
        </section>

        <DrawDeck remaining={view.deckRemaining} />

        <section className="game-board-section" aria-labelledby="your-rows-title">
          <h2 id="your-rows-title" className="game-board-label">
            Your four rows
          </h2>
          <RowsBoard
            board={myBoard}
            size="md"
            legalRows={view.yourTurn && selected ? view.legalRows : []}
            onRow={tapRow}
          />
        </section>
      </div>

      <div className="game-hand-dock">
        <YourHand
          hand={myBoard.hand}
          selected={selected}
          yourTurn={view.yourTurn}
          canDiscard={view.canDiscard}
          legalRows={view.yourTurn && selected ? view.legalRows : []}
          onSelect={(id) => setSelected((current) => (current === id ? null : id))}
          onRow={tapRow}
          onDiscard={() => {
            if (selected && onDiscard(selected)) setSelected(null);
          }}
        />
      </div>
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
    <div className="game-topbar supporting-text flex items-center justify-between text-xs">
      <Link href="/" className="tap-target -ml-2 rounded-lg px-2 active:text-white">
        ← Leave
      </Link>
      <span className="font-mono tracking-[0.25em]">{code}</span>
      <button
        type="button"
        onClick={onSettings}
        className="tap-target -mr-2 rounded-lg px-2 active:text-white"
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
    const previousOverflow = document.body.style.overflow;
    if (!dialog) return;
    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
        className="settings-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="settings-dialog panel w-full max-w-sm overflow-y-auto overscroll-contain"
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
            className="tap-target min-w-11 rounded-lg text-lg text-white/60"
          >
            ✕
          </button>
        </div>
        <AppearanceSettings />
        <div className="section-divider mt-4 border-t pt-4">
          <div className="mb-2 text-sm font-bold">Notifications</div>
          <NotificationToggle />
        </div>
        <a
          href="/how-to-play"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link mt-4 w-full px-2 text-center text-sm"
        >
          How to play (opens in a new tab)
        </a>
        <p className="surface-card subtle-text mt-4 px-3 py-2 text-center text-[11px]">
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
            className="tap-target error-text mt-2 w-full rounded-xl border border-current px-3 text-sm font-bold"
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
  avatar,
  score,
  target,
  gold = false,
  you = false,
}: {
  name: string;
  avatar?: string;
  score: number;
  target: number;
  gold?: boolean;
  you?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <PlayerAvatar avatar={avatar} name={name} size="sm" />
      <span className={`min-w-0 truncate text-sm font-semibold ${gold ? "text-gold" : ""}`}>
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
        <span className="subtle-text text-xs tabular-nums">
          {score}/{target}
        </span>
      </div>
    </div>
  );
}

function MatchHud({
  view,
  opponentName,
  opponentAvatar,
  opponentScore,
  yourName,
  yourAvatar,
  yourScore,
  target,
  selected,
}: {
  view: GameView;
  opponentName: string;
  opponentAvatar?: string;
  opponentScore: number;
  yourName: string;
  yourAvatar?: string;
  yourScore: number;
  target: number;
  selected: boolean;
}) {
  const turnLabel = view.yourTurn ? "Your turn" : `${opponentName}'s turn`;
  const instruction = view.yourTurn
    ? selected
      ? "Choose row or discard"
      : "Choose a card"
    : "Waiting";

  return (
    <div
      className="game-hud"
      role="status"
      aria-live="polite"
      aria-label={`${turnLabel}. Match score: ${opponentName} ${opponentScore} of ${target}; you ${yourScore} of ${target}. ${view.placed[view.you]} of ${view.total} cards placed. ${instruction}.`}
    >
      <div className="game-hud-player">
        <PlayerAvatar avatar={opponentAvatar} name={opponentName} size="sm" />
        <div className="subtle-text truncate text-[10px] font-bold uppercase tracking-wide">
          {opponentName}
        </div>
        <div className="text-base font-black tabular-nums">
          {opponentScore}<span className="text-[10px] font-semibold text-white/45">/{target}</span>
        </div>
      </div>
      <div className="game-hud-turn">
        <div className="text-xs font-black text-gold">{turnLabel}</div>
        <div className="supporting-text mt-0.5 text-[9px] leading-tight">
          {view.placed[view.you]}/{view.total} placed · {instruction}
        </div>
      </div>
      <div className="game-hud-player">
        <PlayerAvatar avatar={yourAvatar} name={yourName} size="sm" />
        <div className="truncate text-[10px] font-bold uppercase tracking-wide text-gold">
          {yourName} · you
        </div>
        <div className="text-base font-black tabular-nums text-gold">
          {yourScore}<span className="text-[10px] font-semibold text-white/45">/{target}</span>
        </div>
      </div>
    </div>
  );
}

function describeCardViews(cards: CardView[]): string {
  const visible = cards.flatMap((card) =>
    card.state === "card" ? [describePlayingCard(card.card)] : [],
  );
  const empty = cards.filter((card) => card.state === "empty").length;
  const hidden = cards.filter((card) => card.state === "hidden").length;
  const parts = visible.length > 0 ? visible : ["no face-up cards"];
  if (hidden > 0) parts.push(`${hidden} face-down ${hidden === 1 ? "card" : "cards"}`);
  if (empty > 0) parts.push(`${empty} empty ${empty === 1 ? "slot" : "slots"}`);
  return parts.join(", ");
}

function DrawDeck({ remaining }: { remaining: number }) {
  return (
    <div className="draw-deck" role="group" aria-label={`Draw deck: ${remaining} cards remaining`}>
      <div className={`draw-deck-stack ${remaining === 0 ? "draw-deck-empty" : ""}`} aria-hidden="true">
        {remaining > 0 ? <><span className="deck-layer deck-layer-bottom" /><span className="deck-layer deck-layer-middle" /><CardBack size="sm" decorative /></> : <span>Empty</span>}
      </div>
      <div><p className="text-xs font-semibold">Draw deck</p>
        <p className="supporting-text text-xs" role="status" aria-live="polite"><strong className="text-gold tabular-nums">{remaining}</strong> {remaining === 1 ? "card" : "cards"} left</p>
        <p className="subtle-text text-[10px]">Drawn automatically on your turn</p>
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
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Opponent rows">
      {board.rows.map((row, i) => (
        <div
          key={i}
          className="flex flex-col items-center rounded-lg p-1"
          role="group"
          aria-label={`Opponent row ${i + 1}: ${describeCardViews(row)}`}
        >
          <span className="card-row-label">Row {i + 1}</span>
          <FannedColumn slots={row} size={size} decorative well />
        </div>
      ))}
      <div
        className="flex flex-col items-center rounded-lg p-1"
        role="group"
        aria-label={`Opponent hidden hand: ${concealedCount} face-down ${concealedCount === 1 ? "card" : "cards"}`}
      >
        <span className="card-row-label">Hand</span>
        <FannedColumn slots={backs} size={size} decorative well />
        <span className="subtle-text mt-0.5 text-[8px] uppercase tracking-wide">
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
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Your placement rows">
      {board.rows.map((row, i) => {
        const playable = legalRows.includes(i);
        const target = playable ? row.findIndex((s) => s.state === "empty") : null;
        const contents = describeCardViews(row);
        return (
          <button
            key={i}
            type="button"
            disabled={!playable}
            onClick={() => onRow(i)}
            aria-label={
              playable
                ? `Row ${i + 1}: ${contents}. Place selected card here.`
                : `Row ${i + 1}: ${contents}. No placement action available.`
            }
            className={`flex flex-col items-center rounded-lg p-1 transition ${
              playable
                ? "target-glow bg-gold/10 ring-2 ring-gold/80 active:scale-95"
                : ""
            }`}
          >
            <span className="card-row-label">Row {i + 1}</span>
            <FannedColumn slots={row} size={size} targetIndex={target} decorative well />
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
  legalRows,
  onSelect,
  onRow,
  onDiscard,
}: {
  hand: CardView[];
  selected: string | null;
  yourTurn: boolean;
  canDiscard: boolean;
  legalRows: number[];
  onSelect: (id: string) => void;
  onRow: (row: number) => void;
  onDiscard: () => void;
}) {
  return (
    <div className="game-hand-panel">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
          Your hidden hand
        </span>
        <button
          onClick={onDiscard}
          disabled={!yourTurn || !canDiscard || !selected}
          className="tap-target error-text rounded-lg border border-current px-3 text-xs font-bold disabled:opacity-40"
        >
          Discard{canDiscard ? "" : " ✓"}
        </button>
      </div>
      <div
        className="game-hand-cards"
        aria-label="Your cards"
        role="group"
      >
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
                  ? `${isSel ? "Deselect" : "Select"} ${describePlayingCard(cv.card)}`
                  : "Unavailable card"
              }
              aria-pressed={isSel}
              className={`shrink-0 rounded-lg transition ${isSel ? "-translate-y-1" : ""} ${
                yourTurn ? "active:scale-95" : "hand-card-waiting"
              }`}
            >
              <div className={isSel ? "rounded-lg ring-2 ring-gold" : ""}>
                <CardSlot slot={cv} size="hand" decorative />
              </div>
            </button>
          );
        })}
      </div>
      {selected && legalRows.length > 0 && (
        <div
          className="mt-2 grid grid-cols-4 gap-1.5 border-t border-white/10 pt-2"
          role="group"
          aria-label="Place selected card"
        >
          {Array.from({ length: 4 }, (_, row) => {
            const legal = legalRows.includes(row);
            return (
              <button
                key={row}
                type="button"
                className={`tap-target rounded-lg border px-1 text-xs font-black ${
                  legal
                    ? "border-gold/70 bg-gold/15 text-gold active:scale-95"
                    : "border-white/10 text-white/30"
                }`}
                disabled={!legal}
                onClick={() => onRow(row)}
                aria-label={
                  legal
                    ? `Place selected card in row ${row + 1}`
                    : `Row ${row + 1} is full; no placement action available`
                }
              >
                Row {row + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
        const outcome = !hr
          ? "Result unavailable"
          : hr.winner === null
            ? "Tied"
            : won
              ? "Won"
              : "Lost";
        return (
          <div
            key={i}
            role="group"
            aria-label={`${isHand ? "Hidden hand" : `Row ${i + 1}`}: ${outcome}. ${label || "No hand label"}. ${describeCardViews(slots)}`}
            className={`result-hand flex flex-col items-center rounded-lg p-1 ${
              won ? "result-hand-won" : "result-hand-not-won"
            }`}
          >
            <span className="card-row-label">{isHand ? "Hand" : `Row ${i + 1}`}</span>
            <FannedColumn slots={padTo5(slots)} size={size} decorative well />
            <span
              className={`mt-0.5 text-[9px] leading-tight ${
                won ? "success-text" : "supporting-text"
              }`}
            >
              {isHand ? "Hand · " : ""}{outcome} · {label}
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
      <div className={`text-lg font-black ${tie ? "" : won ? "text-gold" : "error-text"}`}>
        {headline}
      </div>
      <div className="supporting-text text-xs">
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
      <div className={`text-2xl font-black ${won ? "text-gold" : "error-text"}`}>
        {won ? "🏆 You win the match!" : "Match over"}
      </div>
      <div className="supporting-text text-sm">
        Final score {snapshot.scoreHost} – {snapshot.scoreGuest}
      </div>
      <Link href="/" className="btn-primary mt-2 w-full max-w-xs">
        Back to lobby
      </Link>
    </div>
  );
}
