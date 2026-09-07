"use client";

import { useEffect, useRef, useState } from "react";
import { cardId } from "@/lib/game/cards";
import { TRICKS, type ExhibitionAction } from "@/lib/game/exhibitionTypes";
import type { GameView } from "@/lib/game/types";
import { describePlayingCard } from "./PlayingCard";

export function ExhibitionDrawer({ view, onAction, onClose, error, readOnly = false }: {
  view: GameView; onAction: (action: ExhibitionAction) => boolean; onClose: () => void; error?: string | null; readOnly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ex = view.exhibition!;
  const hand = view.players[0].hand.flatMap(slot => slot.state === "card" ? [slot.card] : []);
  const rows = view.players[0].rows.flatMap((slots, row) => slots.filter(slot => slot.state === "card").length < 5
    ? slots.flatMap(slot => slot.state === "card" ? [{ card: slot.card, row }] : []) : []);
  const [held, setHeld] = useState(hand[0] ? cardId(hand[0]) : "");
  const [first, setFirst] = useState(rows[0] ? cardId(rows[0].card) : "");
  const [second, setSecond] = useState("");
  const [offer, setOffer] = useState(0);
  const [tab, setTab] = useState<"powers" | "log" | "rules">("powers");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function send(action: ExhibitionAction["action"], extra: Partial<ExhibitionAction> = {}) {
    onAction({ token: ex.token, action, ...extra });
  }
  const handSelect = <label>Card from your hand<select value={held} onChange={e => setHeld(e.target.value)}>
    {hand.map(card => <option key={cardId(card)} value={cardId(card)}>{describePlayingCard(card)}</option>)}
  </select></label>;
  const pending = readOnly ? null : ex.pending;
  const canUsePowers = !readOnly && view.yourTurn;
  return <dialog ref={dialog} className="wildcard-dialog" aria-labelledby="wildcard-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="wildcard-dialog-content">
      <header><div><h2 id="wildcard-title">Wildcard Edge</h2><p>House Rules · exhibition · no records</p></div><button type="button" onClick={onClose} aria-label="Close tricks and view table">×</button></header>
      <p className="wildcard-rule">Row {ex.lowRow + 1}: lowest poker hand wins. This rule applies to both players for the whole deal.</p>
      {error && <p role="alert" className="error-text">{error}</p>}
      {pending ? <section className="wildcard-prompt" aria-live="polite">
        <h3>{TRICKS[pending.kind].title}</h3>
        <p>{pending.offers ? "Choose your replacement and the held card to trade. The other offer and your old card return to the bottom of the deck." : TRICKS[pending.kind].description}</p>
        {pending.kind === "shared" && pending.power && <p><strong>This time: {pending.power === "swap" ? "row swap" : "redraw"} for both of you.</strong></p>}
        {pending.offers ? <>
          {handSelect}
          <fieldset><legend>Take one</legend>{pending.offers.map((card, index) => <label key={cardId(card)} className="wildcard-offer"><input type="radio" name="offer" checked={offer === index} onChange={() => setOffer(index)} />{describePlayingCard(card)}</label>)}</fieldset>
          <button className="btn-primary" onClick={() => send("choose", { cardId: held, offerIndex: offer })}>Make the trade</button>
        </> : pending.kind === "deal" ? <div className="wildcard-actions"><button className="btn-primary" onClick={() => send("accept")}>Accept deal</button><button onClick={() => send("decline")}>No deal</button></div>
          : <div className="wildcard-actions">
            <button className="btn-primary" onClick={() => send("allow")}>{pending.kind === "gift" ? "Take the gift" : pending.kind === "shared" ? "Bring on the chaos" : "Let it happen"}</button>
            {pending.kind === "caught" && <button onClick={() => send("challenge")}>Call the bluff · free</button>}
            {pending.kind !== "gift" && <button disabled={!ex.playFair} onClick={() => send("block")}>Play Fair! · {ex.playFair} left</button>}
          </div>}
        <p className="subtle-text">The table is paused. You can close this drawer to inspect the board, then reopen Tricks.</p>
      </section> : <>
        <nav aria-label="Exhibition drawer"><button aria-pressed={tab === "powers"} onClick={() => setTab("powers")}>Your powers</button><button aria-pressed={tab === "log"} onClick={() => setTab("log")}>Trick log</button><button aria-pressed={tab === "rules"} onClick={() => setTab("rules")}>Trick book</button></nav>
        {tab === "powers" && <section className="wildcard-powers">
          <p>{readOnly || view.phase === "complete" ? "Exhibition finished. Your records were not changed." : view.yourTurn ? "Use a power before placing your card. It does not spend your turn." : "Powers are available on your turn."}</p>
          <p><strong>Play Fair! × {ex.playFair}</strong> · Cancel an announced trick when Edge offers it.</p>
          {handSelect}
          <button disabled={!canUsePowers || !ex.redraws || !view.deckRemaining} onClick={() => send("redraw", { cardId: held })}>Lucky Draw · {ex.redraws} left</button>
          <div className="wildcard-swap-selects"><label>First row card<select value={first} onChange={e => setFirst(e.target.value)}><option value="">Choose card</option>{rows.map(({ card, row }) => <option key={cardId(card)} value={cardId(card)}>R{row + 1}: {describePlayingCard(card)}</option>)}</select></label>
            <label>Second row card<select value={second} onChange={e => setSecond(e.target.value)}><option value="">Choose card</option>{rows.filter(({ row }) => row !== rows.find(item => cardId(item.card) === first)?.row).map(({ card, row }) => <option key={cardId(card)} value={cardId(card)}>R{row + 1}: {describePlayingCard(card)}</option>)}</select></label></div>
          <button disabled={!canUsePowers || !ex.swaps || !first || !second || first === second} onClick={() => send("swap", { cardId: first, otherCardId: second })}>Your Switcheroo · {ex.swaps} left</button>
        </section>}
        {tab === "log" && <ol className="wildcard-log">{ex.log.map((entry, index) => <li key={index}>{entry}</li>)}</ol>}
        {tab === "rules" && <section className="wildcard-book"><p>Moving the Goalposts sets the low-hand row before play. The remaining tricks rotate, at most one every two Edge turns. Availability depends on the cards; blocked tricks are still spent.</p>{Object.values(TRICKS).map(trick => <p key={trick.title}><strong>{trick.title}</strong><br />{trick.description}</p>)}<p>Extra toys: one free Lucky Draw, one row swap, one Play Fair token, and fresh tricks every restart. Challenge rewards grant more redraws.</p></section>}
      </>}
      <footer><button onClick={onClose}>Back to table</button><button disabled={readOnly} onClick={() => { if (window.confirm("Restart this exhibition with a fresh deal? The current board will be replaced. Your statistics are unaffected.")) send("restart"); }}>Fresh deal</button></footer>
    </div>
  </dialog>;
}
