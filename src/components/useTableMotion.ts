"use client";

import { useLayoutEffect, useRef } from "react";
import type { GameView } from "@/lib/game/types";
import { describeMotionChanges } from "@/lib/game/motion";
import { useMotionPreference } from "./MotionProvider";

type CardPosition = { rect: DOMRect; element: HTMLElement; hand: boolean; copy?: HTMLElement };
type Frame = { view: GameView; key: string; sync: number; cards: Map<string, CardPosition> };

// Resolve container-relative sizing while the source is still in its card fan.
function copyAppearance(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of style) copies[index].style.setProperty(property, style.getPropertyValue(property));
    copies[index].removeAttribute("id");
  });
  return copy;
}

export function useTableMotion(view: GameView, gameKey: string, sync: number, connected: boolean) {
  const root = useRef<HTMLElement>(null);
  const previous = useRef<Frame | null>(null);
  const cancel = useRef<() => void>(() => {});
  const { effective } = useMotionPreference();

  useLayoutEffect(() => {
    cancel.current();
    const table = root.current;
    if (!table) return;
    const cards = new Map<string, CardPosition>();
    table.querySelectorAll<HTMLElement>("[data-motion-card]").forEach(owner => {
      const element = owner.querySelector<HTMLElement>(".playing-card-face");
      if (!element || !owner.dataset.motionCard) return;
      const hand = owner.classList.contains("hand-select-card");
      cards.set(owner.dataset.motionCard, { rect: element.getBoundingClientRect(), element, hand,
        copy: hand && effective === "full" ? copyAppearance(element) : undefined });
    });
    const before = previous.current;
    previous.current = { view, key: gameKey, sync, cards };
    if (!connected || effective === "off" || document.hidden || typeof Element.prototype.animate !== "function") return;

    // A reconnect is a fresh baseline; do not replay the moves missed offline.
    const resuming = before && before.sync !== sync;
    let freshDeal = Boolean(before && before.key !== gameKey);
    if ((!before || before.view === view) && view.phase === "playing" && view.placed.every(count => count === 0)) {
      try {
        const key = `fiveo-dealt:${gameKey}`;
        freshDeal = sessionStorage.getItem(key) !== "yes";
        sessionStorage.setItem(key, "yes");
      } catch { freshDeal = false; }
    }
    if (resuming || (!before && !freshDeal)) return;
    if (freshDeal) {
      try { sessionStorage.setItem(`fiveo-dealt:${gameKey}`, "yes"); } catch { /* A deal can still animate without storage. */ }
    }
    const cleanups: Array<() => void> = [];
    const animations: Animation[] = [];
    const layer = document.createElement("div");
    layer.className = "table-motion-layer";
    layer.setAttribute("aria-hidden", "true");
    table.append(layer);
    const stop = () => { animations.forEach(animation => animation.cancel()); cleanups.forEach(clean => clean()); layer.remove(); };
    cancel.current = stop;
    const run = (element: HTMLElement, frames: Keyframe[], duration: number, id: string, delay = 0) => {
      const animation = element.animate(frames, { duration, delay, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
      animation.id = id;
      animations.push(animation);
      return animation;
    };
    const fade = (element: HTMLElement | null, id: string, delay = 0) => {
      if (element) run(element, [{ opacity: .35 }, { opacity: 1 }], effective === "reduced" ? 120 : 240, id, delay);
    };
    const deck = table.querySelector<HTMLElement>(".rail-deck")?.getBoundingClientRect();
    const travel = (card: CardPosition, from: DOMRect, id: string, delay = 0, removed = false) => {
      if (effective === "reduced") { if (!removed) fade(card.element, id); return; }
      const to = removed && deck ? deck : card.rect;
      if (!to.width || !to.height || !from.width || !from.height) return;
      const ghost = document.createElement("div");
      ghost.className = "table-motion-card";
      ghost.dataset.motionEffect = id;
      Object.assign(ghost.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.width}px`, height: `${to.height}px` });
      const copy = removed && card.copy ? card.copy : copyAppearance(card.element);
      Object.assign(copy.style, { position: "absolute", inset: "0", margin: "0", width: "100%", height: "100%", minWidth: "0", transform: "none", opacity: "1", visibility: "visible" });
      ghost.append(copy); layer.append(ghost);
      const saved = card.element.style.visibility;
      if (!removed) card.element.style.visibility = "hidden";
      const restore = () => { if (!removed) card.element.style.visibility = saved; ghost.remove(); };
      cleanups.push(restore);
      const animation = run(ghost, [
        { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 1 },
        { transform: "translate(0, 0) scale(1)", opacity: removed ? 0 : 1 },
      ], 280, id, delay);
      animation.finished.then(restore, () => {});
    };

    if (freshDeal) {
      cards.forEach(card => { if (card.hand && deck) travel(card, deck, "deal", [...cards.values()].filter(c => c.hand).indexOf(card) * 45); });
    } else if (before) {
      const change = describeMotionChanges(before.view, view);
      const moved = new Set(change.moved), entered = new Set(change.entered);
      cards.forEach((card, id) => {
        const old = before.cards.get(id);
        if (change.showdown && !old) {
          if (effective === "reduced") fade(card.element, "reveal");
          else run(card.element, [{ transform: "perspective(600px) rotateY(90deg)", opacity: 0 }, { transform: "perspective(600px) rotateY(0)", opacity: 1 }], 320, "reveal", 100);
        } else if (moved.has(id) && old) travel(card, old.rect, "card-move");
        else if (entered.has(id) && deck) travel(card, deck, card.hand ? "draw" : "opponent-play");
        else if (old && !change.showdown && (Math.abs(old.rect.x - card.rect.x) > 1 || Math.abs(old.rect.y - card.rect.y) > 1)) travel(card, old.rect, "hand-settle");
      });
      if (!change.showdown) change.removed.forEach(id => {
        const card = before.cards.get(id);
        if (card?.hand && card.copy && deck) travel(card, card.rect, "discard", 0, true);
      });
      change.completedRows.forEach(key => {
        const [seat, row] = key.split(":");
        const element = table.querySelector<HTMLElement>(`[data-seat="${seat}"] [data-row="${row}"]`);
        fade(element?.querySelector(".table-row-check") ?? null, "row-complete");
        if (element && effective === "full") run(element, [{ boxShadow: "inset 0 0 0 2px var(--color-gold)" }, { boxShadow: "inset 0 0 0 0px transparent" }], 550, "row-complete");
      });
      if (change.turnChanged) fade(table.querySelector(".table-player-active"), "turn");
      if (change.showdown) {
        table.querySelectorAll<HTMLElement>(".table-row-won").forEach((row, index) => fade(row, "winning-row", effective === "full" ? 380 + index * 65 : 0));
        fade(table.querySelector(".table-result-dock"), "showdown", effective === "full" ? 650 : 0);
        if (view.result?.winner === view.you && effective === "full") {
          for (let i = 0; i < 12; i++) {
            const spark = document.createElement("span"); spark.className = "table-win-spark";
            spark.style.left = `${18 + i * 6}%`; spark.style.top = "45%"; layer.append(spark);
            run(spark, [{ transform: "translateY(0) rotate(0)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: `translateY(${55 + i % 3 * 16}px) rotate(${i * 37}deg)`, opacity: 0 }], 650, "win", 600 + i * 20);
          }
        }
      }
      if (change.trickResolved) {
        const log = view.exhibition?.log.at(-1) ?? "";
        const stamp = document.createElement("span"); stamp.className = "table-trick-stamp";
        stamp.textContent = log.includes("Play Fair!") ? "Play Fair!" : log.startsWith("Caught red-handed") ? "Caught!" : log.startsWith("Edge was bluffing") ? "Bluff!" : "Trick played";
        const status = table.querySelector(".table-status")?.getBoundingClientRect();
        if (status) { stamp.style.left = `${status.x + status.width / 2}px`; stamp.style.top = `${status.y}px`; }
        layer.append(stamp);
        run(stamp, effective === "full" ? [{ opacity: 0, transform: "translateX(-50%) scale(.85)" }, { opacity: 1, transform: "translateX(-50%) scale(1)", offset: .2 }, { opacity: 1, offset: .8 }, { opacity: 0, transform: "translateX(-50%) scale(1)" }] : [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], 850, "trick");
      }
    }
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => { if (cancel.current === stop) stop(); });
    return stop;
  }, [view, gameKey, sync, effective, connected]);

  useLayoutEffect(() => {
    const reset = () => { cancel.current(); previous.current = null; };
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", reset);
    return () => { cancel.current(); window.removeEventListener("resize", reset); document.removeEventListener("visibilitychange", reset); };
  }, []);
  return root;
}
