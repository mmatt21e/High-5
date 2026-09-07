"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMPUTER_LEVELS, COMPUTER_OPPONENTS, type ComputerLevel } from "@/lib/computer";
import { PlayerAvatar } from "./PlayerAvatar";

export function ComputerLobby() {
  const router = useRouter();
  const [level, setLevel] = useState<ComputerLevel>("easy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/match/computer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.code !== "string") throw new Error(data.error ?? "Could not start the game. Please try again.");
      router.push(`/play/${data.code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect. Please try again.");
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="computer-title">
      <h2 id="computer-title" className="font-bold">Play the computer</h2>
      <p className="supporting-text mt-1 text-sm">No waiting for another player. Pick your opponent and deal.</p>
      <form onSubmit={start} className="mt-4 flex flex-col gap-3">
        <fieldset disabled={busy} className="min-w-0">
          <legend className="form-label mb-2 text-sm">Choose your challenge</legend>
          <div className="flex flex-col gap-2">
            {COMPUTER_LEVELS.map((key) => {
              const opponent = COMPUTER_OPPONENTS[key];
              return <label key={key} className="surface-list-item flex cursor-pointer items-center gap-3 p-3">
                <input type="radio" name="computer-level" value={key} checked={level === key} onChange={() => setLevel(key)} className="h-4 w-4 shrink-0 accent-[var(--color-gold)]" />
                <PlayerAvatar avatar={opponent.avatar} name={opponent.name} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{opponent.name}</span>
                  <span className="subtle-text block text-xs">{opponent.skill} · {opponent.description}</span>
                </span>
              </label>;
            })}
          </div>
        </fieldset>
        {level === "wildcard" && <p className="surface-card p-3 text-sm" role="status"><strong>House Rules exhibition — results never count.</strong> Edge can peek, swap cards, bargain, and cheat. You get a Play Fair token, a redraw, and a row swap. One row is low-hand-wins, announced before play. Every trick waits for your response.</p>}
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Setting the table…" : `Play ${COMPUTER_OPPONENTS[level].name}`}</button>
        <p className="subtle-text text-xs">{level === "wildcard" ? "Saved so you can resume. No wins, losses, streaks, or head-to-head records. Restart whenever you like." : "Same rules, no peeking at your hidden cards. Results count in your overall record and against each named computer opponent."}</p>
        {error && <p role="alert" className="error-text text-sm">{error}</p>}
      </form>
    </section>
  );
}
