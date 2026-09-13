"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CardFace, CardSlot, FannedColumn, describePlayingCard } from "./PlayingCard";
import { cardId, RANK_LABEL, type Card } from "../lib/game/cards";
import { viewFor } from "../lib/game/engine";
import { evaluateHand } from "../lib/game/evaluator";
import type { CardView, HandResult } from "../lib/game/types";
import {
  PRACTICE_STORAGE_KEY, advancePractice, createPractice, hiddenHandHint,
  keptHand, restorePractice, savePractice, undoPractice,
  type PracticeEvent, type PracticeSession, type PracticeStep,
} from "../lib/game/practice";
import styles from "./GuidedPractice.module.css";

const LESSON: Record<PracticeStep, { number: number; title: string; text: string; hint?: string }> = {
  welcome: { number: 0, title: "Learn by playing a few turns", text: "Build four open rows while keeping a fifth hand hidden. Win at least three of those five hands to win the game. We’ll walk through the key decisions together." },
  place: { number: 1, title: "Draw one. Place one.", text: "You start with five hidden cards. Your turn automatically draws a sixth: the 9 of hearts. Select it, then tap Row 1 to place it face up.", hint: "Tap the 9 of hearts in your hand, then Row 1. You’ll keep the other five cards hidden." },
  placed: { number: 1, title: "Your first card is on the table", text: "The 9 of hearts is now visible to both players. You kept five cards hidden. Next, the opponent takes a turn and you automatically draw again." },
  pair: { number: 2, title: "Build a pair. Keep your options.", text: "You drew the 4 of clubs. You can play any held card, not just the new one. Select the 9 of diamonds and place it in Row 1 to make a pair.", hint: "Two cards of the same rank make a pair. Keep your two aces hidden for now; your held cards will also score at the end." },
  paired: { number: 2, title: "A pair of nines, with room to grow", text: "Row 1 now has two nines and three open spaces. Each row holds five cards. The two aces you kept could strengthen your hidden fifth hand." },
  discard: { number: 3, title: "Use your one discard", text: "Once per game, you can discard instead of placing a card. For this lesson, select the 2 of spades, then tap Discard selected card.", hint: "A discard uses your whole turn. It doesn’t fill a row or give you an immediate replacement. You draw again on your next turn." },
  discarded: { number: 3, title: "Discard used. Turn over.", text: "You still hold five hidden cards, and your rows didn’t change. That was your one discard for this game. We’ll play the middle turns for both sides and leave the final choice to you." },
  finish: { number: 4, title: "One card. Two hands to consider.", text: "We played ahead to your last open space. Select any card to preview the row it completes and the five cards you’ll keep. Then place it in Row 4 to reveal the result." },
  complete: { number: 4, title: "Five hands decide the game", text: "Each row competes with the opponent’s matching row. Your five held cards become the hidden fifth hand. You need at least three hand wins; tied hands count for neither player." },
};

function Cards({ cards }: { cards: Card[] }) {
  return <div className={styles.cardStrip}>{cards.map((card) => <CardFace key={cardId(card)} card={card} size="sm" />)}</div>;
}

function comparisonText(hand: HandResult): string {
  if (hand.winner === null) return "All scoring ranks match. Neither player wins this hand.";
  const winner = hand.scores[hand.winner];
  const loser = hand.scores[1 - hand.winner];
  if (winner.category !== loser.category) return `${winner.label} beats ${loser.label.toLowerCase()}.`;
  const index = winner.tiebreakers.findIndex((rank, i) => rank !== loser.tiebreakers[i]);
  const rankName = (rank: number) => RANK_LABEL[rank as Card["rank"]];
  return `Both have ${winner.label.toLowerCase()}. The first scoring difference is ${rankName(winner.tiebreakers[index])} over ${rankName(loser.tiebreakers[index])}; higher ranks break the tie.`;
}

function Showdown({ session, onTryAgain }: { session: PracticeSession; onTryAgain: () => void }) {
  const result = session.game.result!;
  return <section className={styles.showdown} aria-label="Five-hand results">
    <div className={styles.result}>
      <p className={styles.eyebrow}>Practice complete</p>
      <h3>{result.winner === 0 ? "You win this practice game" : result.winner === 1 ? "The practice opponent wins" : "This game is a push"}</h3>
      <p>You won {result.handWins[0]} hands. Opponent won {result.handWins[1]}.</p>
      <p className={styles.muted}>{result.winner === 0
        ? "Every hand counts once, regardless of how strong it is. You balanced your open rows with the five cards you kept."
        : "A strong hidden hand counts as just one hand win. Try a different final card to see how it changes both hands."}</p>
    </div>
    <div className={styles.completionActions}>
      <Link className="btn-primary" href="/lobby">Play a regular game</Link>
      <button className="btn-outline" onClick={onTryAgain}>Try a different final card</button>
    </div>
    {result.hands.map((hand) => <article className={`${styles.handResult} ${hand.kind === "hand" ? styles.hiddenResult : ""}`} key={hand.index}>
      <div className={styles.sectionHeading}>
        <h3>{hand.kind === "hand" ? "Hidden fifth hand" : `Row ${hand.index + 1}`}</h3>
        <span className={hand.winner === 0 ? styles.won : styles.muted}>{hand.winner === null ? "Tied" : hand.winner === 0 ? "You win" : "Opponent wins"}</span>
      </div>
      {([0, 1] as const).map((seat) => <div key={seat}>
        <p className={styles.handLabel}>{seat === 0 ? "You" : "Opponent"} · {hand.scores[seat].label}</p>
        <Cards cards={hand.kind === "hand" ? session.game.players[seat].hand : session.game.players[seat].rows[hand.index]} />
      </div>)}
      <p className={styles.muted}>{comparisonText(hand)}</p>
    </article>)}
  </section>;
}

export function GuidedPractice() {
  const [session, setSession] = useState(createPractice);
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showHint, setShowHint] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<PracticeStep>("welcome");

  useEffect(() => {
    try { setSession(restorePractice(localStorage.getItem(PRACTICE_STORAGE_KEY))); }
    catch { setCanSave(false); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(PRACTICE_STORAGE_KEY, savePractice(session)); setCanSave(true); }
    catch { setCanSave(false); }
  }, [ready, session]);

  useEffect(() => {
    if (ready && previousStep.current !== session.step) heading.current?.focus();
    previousStep.current = session.step;
  }, [ready, session.step]);

  const lesson = LESSON[session.step];
  const view = viewFor(session.game, 0);
  const mine = session.game.players[0];
  const canPlace = ["place", "pair", "finish"].includes(session.step);
  const canSelect = canPlace || session.step === "discard";
  const selectedCard = mine.hand.find((card) => cardId(card) === selected);
  const canUndo = session.events.some((event) => event.type === "place" || event.type === "discard");
  const finalRow = view.legalRows[0];
  const preview = session.step === "finish" && selectedCard ? keptHand(session, selected!) : null;

  function replace(next: PracticeSession) {
    setSession(next);
    setSelected(null);
    setFeedback("");
    setShowHint(false);
  }

  function advance(event: PracticeEvent) {
    const next = advancePractice(session, event);
    if (next === session) {
      setFeedback(session.step === "discard"
        ? "For this lesson, select the 2 of spades and use Discard selected card."
        : `Other moves are legal in a regular game. For this lesson, place the ${session.step === "pair" ? "9 of diamonds" : "9 of hearts"} in Row 1.`);
      return;
    }
    replace(next);
  }

  function place(row: number) {
    if (!selected) { setFeedback("Select a card from your hand first, then choose a row."); return; }
    advance({ type: "place", cardId: selected, row });
  }

  const hintId = hiddenHandHint(session);
  const hintCard = mine.hand.find((card) => cardId(card) === hintId);

  return <main className={`app-screen ${styles.practice}`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Five-O Poker</p><h1>Guided practice</h1></div>
      <Link href="/games/five-o" className="nav-link">Exit practice</Link>
    </header>
    <p className={styles.reassurance}>No account needed · No effect on your record</p>

    {!ready ? <p role="status">Loading your practice…</p> : <>
      <section className={styles.coach} aria-labelledby="practice-instruction">
        <div className={styles.progress} aria-label={lesson.number ? `Lesson ${lesson.number} of 4` : "Four short lessons"}>
          {[1, 2, 3, 4].map((number) => <span key={number} data-reached={number <= lesson.number} />)}
        </div>
        <p className={styles.eyebrow}>{lesson.number ? `Lesson ${lesson.number} of 4` : "Your first game, with a little help"}</p>
        <h2 id="practice-instruction" tabIndex={-1} ref={heading}>{lesson.title}</h2>
        <p>{lesson.text}</p>
        {session.step === "welcome" && <button className="btn-primary" onClick={() => advance({ type: "start" })}>Start guided practice</button>}
        {(session.step === "placed" || session.step === "paired") && <button className="btn-primary" onClick={() => advance({ type: "continue" })}>Continue to your next turn</button>}
        {session.step === "discarded" && <button className="btn-primary" onClick={() => advance({ type: "skip" })}>Skip ahead to the final turn</button>}
        {(lesson.hint || session.step === "finish") && <>
          <button className={styles.textButton} aria-expanded={showHint} aria-controls="practice-hint" onClick={() => setShowHint(!showHint)}>{showHint ? "Hide hint" : "Show hint"}</button>
          {showHint && <p id="practice-hint" className={styles.hint}>{session.step === "finish" && hintCard && hintId
            ? `Row 4 has four spades. Playing the Ace of spades completes a flush and leaves two pair in your hidden hand. Playing the ${describePlayingCard(hintCard)} keeps a ${evaluateHand(keptHand(session, hintId)).label.toLowerCase()}, but leaves Row 4 weaker. Consider both hands.`
            : lesson.hint}</p>}
        </>}
      </section>

      {session.step !== "complete" ? <>
        {session.step !== "welcome" && <section className={styles.table} aria-label="Your four open rows">
          <div className={styles.sectionHeading}><h2>Your open rows</h2><span>{view.placed[0]} / 20 cards</span></div>
          <div className={styles.rows}>
            {view.players[0].rows.map((slots, row) => <button key={row} className={styles.row}
              disabled={!canPlace || !view.legalRows.includes(row)}
              data-target={canPlace && view.legalRows.includes(row)}
              aria-label={`Row ${row + 1}, ${mine.rows[row].length} of 5 cards${mine.rows[row].length ? `: ${mine.rows[row].map(describePlayingCard).join(", ")}` : ""}${canPlace && view.legalRows.includes(row) ? ". Place selected card here" : ""}`}
              onClick={() => place(row)}>
              <span>Row {row + 1}</span><FannedColumn slots={slots} size="sm" decorative well />
            </button>)}
          </div>
        </section>}

        <section className={styles.held} aria-labelledby="practice-hand-title">
          <div className={styles.sectionHeading}><h2 id="practice-hand-title">Your hidden hand</h2><span>{session.step === "welcome" ? 5 : mine.hand.length} cards</span></div>
          <p className={styles.muted}>{canSelect ? "Select a card, then choose what to do with it." : "Only you can see these cards until showdown."}</p>
          <div className={styles.heldCards}>
            {(session.step === "welcome" ? mine.hand.slice(0, 5) : mine.hand).map((card) => <button key={cardId(card)}
              className={styles.cardButton} disabled={!canSelect} aria-pressed={selected === cardId(card)}
              aria-label={`Select ${describePlayingCard(card)}`} onClick={() => { setSelected(cardId(card)); setFeedback(""); }}>
              <CardFace card={card} size="sm" decorative table />
              {session.step === "place" && cardId(card) === "9h" && <span className={styles.newCard}>New</span>}
            </button>)}
          </div>
          {canSelect && <p className={styles.selection} role="status">{selectedCard ? `Selected: ${describePlayingCard(selectedCard)}` : "No card selected"}</p>}
          {preview && selectedCard && <div className={styles.preview} aria-live="polite">
            <p><strong>Row {finalRow + 1}:</strong> {evaluateHand([...mine.rows[finalRow], selectedCard]).label}</p>
            <p><strong>Hidden fifth hand:</strong> {evaluateHand(preview).label}</p>
            <p className={styles.muted}>These five stay in your hand:</p><Cards cards={preview} />
          </div>}
          {session.step === "discard" && <button className="btn-outline" disabled={!selected} onClick={() => advance({ type: "discard", cardId: selected! })}>Discard selected card</button>}
          {mine.discardUsed && <p className={styles.muted}>Discard used · 0 remaining</p>}
          <p className={styles.feedback} role="status">{feedback}</p>
        </section>

        {session.step !== "welcome" && <details className={styles.opponent}>
          <summary>View opponent’s rows · {view.placed[1]} / 20 cards</summary>
          <div className={styles.rows}>{view.players[1].rows.map((slots, row) => <div className={styles.row} key={row}>
            <span>Row {row + 1}</span><FannedColumn slots={slots} size="sm" well />
          </div>)}</div>
          <p className={styles.muted}>Opponent’s hidden fifth hand</p>
          <div className={styles.cardStrip}>{view.players[1].hand.slice(0, 5).map((slot: CardView, index) => <CardSlot key={index} slot={slot} size="sm" />)}</div>
        </details>}
      </> : <Showdown session={session} onTryAgain={() => replace(undoPractice(session))} />}

      <footer className={styles.footer}>
        <div className={styles.tools}>
          {session.step !== "complete" && <button className={styles.textButton} disabled={!canUndo} onClick={() => replace(undoPractice(session))}>Undo last move</button>}
          <button className={styles.textButton} disabled={session.step === "welcome"} onClick={() => replace(createPractice())}>Restart lesson</button>
          <Link href="/how-to-play" className="nav-link">Read the rules</Link>
        </div>
        <p className={styles.muted}>{canSave ? "Progress saved on this device." : "Progress lasts while this page is open."}</p>
      </footer>
    </>}
  </main>;
}
