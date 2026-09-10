"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

type Drag = { id: string; x: number; y: number; width: number; height: number; row: number | null };
type Gesture = { id: string; pointerId: number; x: number; y: number; width: number; height: number; source: HTMLButtonElement; dragging: boolean };

/** Pointer capture keeps mouse, pen, and touch on the same placement path. */
export function useCardDrag({ root, enabled, revision, legalRows, onSelect, onPlace }: {
  root: RefObject<HTMLElement | null>;
  enabled: boolean;
  revision: unknown;
  legalRows: number[];
  onSelect: (id: string) => void;
  onPlace: (id: string, row: number) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  const cancel = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.source.hasPointerCapture(current.pointerId)) current.source.releasePointerCapture(current.pointerId);
    setDrag(null);
  }, []);

  useEffect(() => {
    cancel();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [enabled, revision, cancel]);

  function targetRow(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-row]");
    if (!row || !root.current?.contains(row)) return null;
    const index = Number(row.dataset.dropRow);
    return legalRows.includes(index) ? index : null;
  }

  return {
    drag,
    cardHandlers: (id: string) => ({
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (!enabled || !id || !event.isPrimary || event.button !== 0 || gesture.current) return;
        suppressClick.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        gesture.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
          width: rect.width, height: rect.height, source: event.currentTarget, dragging: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || event.pointerId !== current.pointerId || !enabled) return;
        if (!current.dragging && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8) return;
        if (!current.dragging) {
          current.dragging = true;
          suppressClick.current = true;
          onSelect(current.id);
        }
        event.preventDefault();
        setDrag({ id: current.id, x: event.clientX, y: event.clientY, width: current.width,
          height: current.height, row: targetRow(event.clientX, event.clientY) });
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || event.pointerId !== current.pointerId) return;
        const row = enabled && current.dragging ? targetRow(event.clientX, event.clientY) : null;
        cancel();
        if (row !== null) onPlace(current.id, row);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onClickCapture(event: React.MouseEvent<HTMLButtonElement>) {
        // Captured pointerup can synthesize a click on the original card.
        // Keyboard activation (detail 0) must still work after a cancelled drag.
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
        suppressClick.current = false;
      },
      onDragStart(event: React.DragEvent<HTMLButtonElement>) { event.preventDefault(); },
    }),
  };
}
