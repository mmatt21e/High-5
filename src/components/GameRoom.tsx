"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useGameSocket } from "./useGameSocket";
import { useTableMotion } from "./useTableMotion";
import { AppearanceSettings } from "./AppearanceSettings";
import { NotificationToggle } from "./NotificationToggle";
import { ExhibitionDrawer } from "./ExhibitionDrawer";
import type { ExhibitionAction } from "@/lib/game/exhibitionTypes";
import { PlayerAvatar } from "./PlayerAvatar";
import {
  CardSlot,
  describePlayingCard,
} from "./PlayingCard";
import { cardId } from "@/lib/game/cards";
import { COMPUTER_OPPONENTS, type ComputerLevel } from "@/lib/computer";
import type { CardView, GameView, PlayerIndex } from "@/lib/game/types";
import type { MatchSnapshot } from "@/lib/realtime/events";

export function GameRoom({ code }: { code: string }) {
  const { snapshot, view, error, connected, sync, animationKey, place, discard, next, endMatch, exhibition } =
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
      <Table
        animationKey={animationKey}
        connected={connected}
        sync={sync}
        snapshot={snapshot}
        view={view}
        error={error}
        onPlace={place}
        onDiscard={discard}
        onNext={next}
        onEndMatch={endMatch}
        onExhibition={exhibition}
      />
    </>
  );
}

function SocketNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="socket-notice error-text border-b border-current bg-black/45 px-4 py-2 text-center text-sm">
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
  animationKey,
  connected,
  sync,
  snapshot,
  view,
  error,
  onPlace,
  onDiscard,
  onNext,
  onEndMatch,
  onExhibition,
}: {
  animationKey: string;
  connected: boolean;
  sync: number;
  snapshot: MatchSnapshot;
  view: GameView;
  error?: string | null;
  onPlace: (cardId: string, row: number) => boolean;
  onDiscard: (cardId: string) => boolean;
  onNext: () => boolean;
  onEndMatch: () => boolean;
  onExhibition: (action: ExhibitionAction) => boolean;
}) {
  const you = view.you;
  const opp = (1 - you) as PlayerIndex;
  const myBoard = view.players[you];
  const oppBoard = view.players[opp];
  const myScore = you === 0 ? snapshot.scoreHost : snapshot.scoreGuest;
  const oppScore = you === 0 ? snapshot.scoreGuest : snapshot.scoreHost;
  const gameOver = view.phase === "complete";
  const matchOver = snapshot.status === "complete";
  const motionRef = useTableMotion(view, animationKey, sync, connected);

  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tricksOpen, setTricksOpen] = useState(false);
  useEffect(() => { setTricksOpen(snapshot.status !== "complete" && Boolean(view.exhibition?.pending)); }, [view.exhibition?.token, view.exhibition?.pending, snapshot.status]);
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
  const showResults = gameOver || matchOver;
  const shellState = gameOver ? " game-table-results" : matchOver ? " game-table-ended" : "";
  let statusLabel = view.yourTurn ? "Your turn" : `${oppBoard.displayName}'s turn`;
  let progressLabel = `${view.placed[you]}/${view.total} placed`;
  if (!view.yourTurn && snapshot.computerLevel) statusLabel = "Computer thinking…";
  if (view.exhibition?.pending) statusLabel = "Trick waiting · open Tricks";
  if (view.exhibition) progressLabel = `Untracked · ${view.placed[you]}/${view.total}`;
  if (matchOver) {
    statusLabel = "Match ended";
    progressLabel = "Game ended before showdown";
  }
  if (gameOver) {
    statusLabel = "Showdown";
    progressLabel = "All five hands revealed";
  }

  const body = (
    <main ref={motionRef} className={`game-table-active${shellState}`} aria-label="Five-O game table">
      <SideRail yourScore={myScore} opponentScore={oppScore} opponentName={oppBoard.displayName}
        target={snapshot.targetWins} remaining={view.deckRemaining} onSettings={openSettings}
        canDiscard={!showResults && view.yourTurn && view.canDiscard && selected !== null}
        discardUsed={view.yourTurn && !view.canDiscard} showResults={showResults}
        exhibition={Boolean(view.exhibition)} trickPending={Boolean(view.exhibition?.pending)} onTricks={() => setTricksOpen(true)}
        onDiscard={() => { if (selected && onDiscard(selected)) setSelected(null); }} />
      <TopBar
        code={snapshot.inviteCode}
        computerLevel={snapshot.computerLevel}
        gameNumber={snapshot.gameNumber}
      />
      <div className="table-player-section table-opponent-section">
        <PlayerBar name={oppBoard.displayName} avatar={(opp === 0 ? snapshot.host : snapshot.guest)?.avatar} active={!showResults && !view.yourTurn} />
        <AlignedBoard board={oppBoard} view={view} seat={opp} results={gameOver} />
      </div>
      {error ? (
        <div className="table-status table-status-error" role="alert" aria-atomic="true">
          {error}
        </div>
      ) : (
        <div className="table-status" role="status" aria-live="polite" aria-atomic="true">
          <span className="table-turn-label">{statusLabel}</span>
          <span className="table-progress">{progressLabel}</span>
        </div>
      )}
      <div className="table-player-section table-self-section">
        <PlayerBar
          name={myBoard.displayName}
          avatar={(you === 0 ? snapshot.host : snapshot.guest)?.avatar}
          you
          active={!showResults && view.yourTurn}
        />
        <AlignedBoard
          board={myBoard}
          view={view}
          seat={you}
          results={gameOver}
          legalRows={!showResults && view.yourTurn && selected ? view.legalRows : []}
          onRow={tapRow}
        />
      </div>
      {showResults ? (
        <div className="table-result-dock">
          {matchOver ? (
            <MatchOver snapshot={snapshot} you={you} />
          ) : (
            <GameOver view={view} you={you} snapshot={snapshot} onNext={onNext} />
          )}
        </div>
      ) : (
        <div className="game-hand-dock">
          <YourHand
            hand={myBoard.hand}
            selected={selected}
            yourTurn={view.yourTurn}
            onSelect={(id) => setSelected((current) => current === id ? null : id)}
          />
        </div>
      )}
    </main>
  );

  return (
    <>
      {body}
      {tricksOpen && view.exhibition && <ExhibitionDrawer key={view.exhibition.token} view={view} onAction={onExhibition} onClose={() => setTricksOpen(false)} error={error} readOnly={snapshot.status === "complete"} />}
      {settingsOpen && (
        <SettingsModal
          onClose={closeSettings}
          onEndMatch={onEndMatch}
          matchOver={matchOver}
          exhibition={Boolean(view.exhibition)}
        />
      )}
    </>
  );
}

function TopBar({ code, computerLevel, gameNumber }: { code: string; computerLevel?: ComputerLevel | null; gameNumber: number }) {
  return (
    <header className="game-topbar">
      <strong>FIVE-O</strong>
      <span title={computerLevel ? COMPUTER_OPPONENTS[computerLevel].name : code}>
        {computerLevel ? `Computer · ${COMPUTER_OPPONENTS[computerLevel].skill}` : code} · Game {gameNumber}
      </span>
    </header>
  );
}

function SideRail({ yourScore, opponentScore, opponentName, target, remaining, onSettings, canDiscard, discardUsed, showResults, onDiscard, exhibition, trickPending, onTricks }: {
  yourScore: number; opponentScore: number; opponentName: string; target: number;
  remaining: number; onSettings: () => void; canDiscard: boolean; discardUsed: boolean;
  showResults: boolean; onDiscard: () => void;
  exhibition: boolean; trickPending: boolean; onTricks: () => void;
}) {
  return (
    <aside className="game-side-rail" aria-label="Game controls and match score">
      <Link href="/" className="rail-control" aria-label="Leave game for lobby" title="Back to lobby">←<small>Lobby</small></Link>
      {exhibition ? <><span className="rail-target">Exhibition<br />Untracked</span><button className={`rail-control rail-tricks${trickPending ? " rail-tricks-pending" : ""}`} onClick={onTricks}>Tricks{trickPending && <small>Respond</small>}</button></> : <>
        <div className="rail-score" aria-label={`You: ${yourScore} of ${target} wins`}><span>You</span><strong>{yourScore}</strong></div>
        <div className="rail-score" aria-label={`${opponentName}: ${opponentScore} of ${target} wins`}><span>Opp.</span><strong>{opponentScore}</strong></div>
        <span className="rail-target">First<br />to {target}</span>
      </>}
      <div className="rail-score rail-deck" aria-label={`Draw deck: ${remaining} cards remaining`}><span>Deck</span><strong>{remaining}</strong></div>
      {!showResults && <button type="button" className="rail-control rail-discard" disabled={!canDiscard} onClick={onDiscard}
        aria-label={discardUsed ? "Discard already used this game" : "Discard selected card, once per game"}
        title="Discard once per game">Discard</button>}
      <button type="button" className="rail-control" onClick={onSettings} aria-label="Settings">☰<small>Settings</small></button>
    </aside>
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
  exhibition = false,
}: {
  onClose: () => void;
  onEndMatch: () => boolean;
  matchOver: boolean;
  exhibition?: boolean;
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
                  exhibition ? "End this exhibition? Your statistics are unaffected." : "End this match for both players? This can't be undone.",
                )
              ) {
                if (onEndMatch()) onClose();
              }
            }}
            className="tap-target error-text mt-2 w-full rounded-xl border border-current px-3 text-sm font-bold"
          >
            {exhibition ? "End exhibition" : "End match"}
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerBar({ name, avatar, you = false, active = false }: {
  name: string;
  avatar?: string;
  you?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`table-player${active ? " table-player-active" : ""}`}
      aria-label={`${name}${you ? ", you" : ", opponent"}${active ? ". Current turn" : ""}.`}
    >
      <PlayerAvatar avatar={avatar} name={name} size="sm" />
      <div className="table-player-name">
        <strong title={name}>{name}</strong>
        <span>{you ? "You" : "Opponent"}</span>
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

function rowOutcome(winner: PlayerIndex | null | undefined, seat: PlayerIndex): string {
  if (winner === undefined) return "";
  if (winner === null) return "Tied";
  return winner === seat ? "Won" : "Lost";
}

/** Both seats share identical row geometry; only the local board is interactive. */
function AlignedBoard({ board, view, seat, results, legalRows = [], onRow }: {
  board: GameView["players"][0];
  view: GameView;
  seat: PlayerIndex;
  results: boolean;
  legalRows?: number[];
  onRow?: (row: number) => void;
}) {
  const isYou = seat === view.you;
  const rows = results ? [...board.rows, board.hand] : board.rows;
  const ownerLabel = isYou ? "Your" : `${board.displayName}'s`;

  return (
    <section
      className="table-board"
      data-seat={seat}
      aria-label={`${ownerLabel} ${results ? "revealed hands" : "board"}`}
    >
      {rows.map((cards, rowIndex) => {
        const slots = padTo5(cards);
        const count = slots.filter((slot) => slot.state !== "empty").length;
        const complete = count === 5;
        const playable = legalRows.includes(rowIndex);
        const handResult = results ? view.result?.hands[rowIndex] : undefined;
        const outcome = rowOutcome(handResult?.winner, seat);
        const label = handResult?.scores[seat].label;
        const name = rowIndex === 4 ? "Hand" : `Row ${rowIndex + 1}`;
        const lowRow = view.exhibition?.lowRow === rowIndex;
        const latest = board.lastPlacement?.row === rowIndex ? board.lastPlacement.cardId : null;
        const latestCard = slots.find((slot) => cvId(slot) === latest);
        const completionLabel = complete ? "Complete." : `${count} of 5 cards.`;
        const latestLabel = latestCard?.state === "card"
          ? `Last played: ${describePlayingCard(latestCard.card)}.`
          : "";
        const resultLabel = handResult ? `${outcome}. ${label}.` : "";
        const accessible = [
          `${name}: ${describeCardViews(slots)}.`,
          completionLabel,
          lowRow ? "Lowest poker hand wins this row." : "",
          latestLabel,
          resultLabel,
          playable ? "Place selected card here." : "",
        ].filter(Boolean).join(" ");
        const rowStatus = results ? outcome || "Complete" : "Complete";
        const className = [
          "table-row",
          complete && "table-row-finished",
          playable && "table-row-playable",
          outcome === "Won" && "table-row-won",
        ].filter(Boolean).join(" ");

        const content = (
          <>
            <span className="table-row-heading">
              <span title={lowRow ? `${name}: lowest poker hand wins` : name}>{lowRow ? `${rowIndex + 1} LOW` : name}</span>
              {complete && <span className="table-row-check" aria-hidden="true">✓</span>}
            </span>
            <span className="board-row-cards" aria-hidden="true">
              {slots.map((slot, index) => {
                const isLatest = Boolean(latest && cvId(slot) === latest);
                return (
                  <span key={cvId(slot) || `slot-${index}`} data-motion-card={cvId(slot) || undefined} data-slot-state={slot.state} style={{ "--slot-index": index } as CSSProperties} className={`board-card${isLatest ? " board-card-last" : ""}`}>
                    <CardSlot slot={slot} size="sm" target={playable && index === count} decorative table />
                    {isLatest && <span className="board-card-last-label">Last</span>}
                  </span>
                );
              })}
            </span>
            <span className={complete ? "table-row-complete" : "table-row-count"}>{complete ? rowStatus : `${count}/5`}</span>
            {results && <span className="table-row-result" title={label}>{label || "—"}</span>}
          </>
        );

        return isYou && !results ? (
          <button
            key={rowIndex}
            data-row={rowIndex}
            type="button"
            className={className}
            disabled={!playable}
            onClick={() => onRow?.(rowIndex)}
            aria-label={accessible}
          >
            {content}
          </button>
        ) : (
          <div key={rowIndex} data-row={rowIndex} role="group" className={className} aria-label={accessible}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

/** Selection never changes the private hand dock's geometry. */
function YourHand({ hand, selected, yourTurn, onSelect }: {
  hand: CardView[];
  selected: string | null;
  yourTurn: boolean;
  onSelect: (id: string) => void;
}) {
  const selectionHelp = selected ? "Tap a highlighted row to place" : "Select a card to play";
  const instruction = yourTurn ? selectionHelp : "Waiting for your turn";

  return (
    <div className="game-hand-panel">
      <div className="game-hand-heading">
        <strong>Your hand <span className="hand-private-label">· private</span></strong>
        <span className="game-hand-instruction" role="status" aria-live="polite" aria-atomic="true">
          {instruction}
        </span>
      </div>
      <div className="game-hand-content">
        <div className="game-hand-cards" aria-label="Your cards" role="group">
          {hand.map((cv, i) => {
            const id = cvId(cv);
            const isSelected = selected === id;
            const action = isSelected ? "Deselect" : "Select";
            const cardLabel = cv.state === "card" ? `${action} ${describePlayingCard(cv.card)}` : "Unavailable card";
            return (
              <button
                key={id || i}
                data-motion-card={id || undefined}
                type="button"
                disabled={!yourTurn || cv.state !== "card"}
                onClick={() => id && onSelect(id)}
                aria-label={cardLabel}
                aria-pressed={isSelected}
                className={`hand-select-card${isSelected ? " hand-select-card-selected" : ""}`}
              >
                <CardSlot slot={cv} size="hand" decorative table />
              </button>
            );
          })}
        </div>
      </div>
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
    <div className="table-result-summary">
      <div className={`text-lg font-black ${tie ? "" : won ? "text-gold" : "error-text"}`}>
        {headline}
      </div>
      <div className="supporting-text text-xs">
        {view.exhibition ? "Untracked · hands" : "Hands won"} — you {result.handWins[you]} · opponent{" "}
        {result.handWins[(1 - you) as PlayerIndex]}
      </div>
      <button
        onClick={onNext}
        disabled={snapshot.youReady}
        className="btn-primary table-result-action"
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
  const decided = snapshot.matchWinner !== null && snapshot.matchWinner !== undefined;
  const yourScore = you === 0 ? snapshot.scoreHost : snapshot.scoreGuest;
  const opponentScore = you === 0 ? snapshot.scoreGuest : snapshot.scoreHost;
  const headline = snapshot.exhibition ? "Exhibition ended" : won ? "You win the match!" : decided ? "Opponent wins the match" : "Match ended";
  return (
    <div className="table-result-summary">
      <div className={`text-2xl font-black ${won ? "text-gold" : decided ? "error-text" : ""}`}>
        {headline}
      </div>
      <div className="supporting-text text-sm">
        {snapshot.exhibition ? "Untracked — your record is unchanged." : `Final score — you ${yourScore} · opponent ${opponentScore}`}
      </div>
      <Link href="/" className="btn-primary table-result-action">
        Back to lobby
      </Link>
    </div>
  );
}
