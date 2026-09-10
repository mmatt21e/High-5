"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MATCH_LENGTHS, type LobbySnapshot } from "@/lib/lobby";
import { PlayerAvatar } from "./PlayerAvatar";

export function GameFinder() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const latest = useRef<LobbySnapshot | null>(null);
  const [targetWins, setTargetWins] = useState(5);
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const mutating = useRef(false);
  const revision = useRef(0);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const heartbeatAt = useRef(0);
  const awaitingMatch = useRef<string | null>(null);
  const [heartbeatError, setHeartbeatError] = useState("");

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const version = ++revision.current;
    try {
      const response = await fetch(`/api/lobby${filter ? `?targetWins=${filter}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("The lobby could not refresh. Check your connection and try again.");
      const data: LobbySnapshot = await response.json();
      if (version !== revision.current) return;
      const previous = latest.current?.own;
      latest.current = data; setSnapshot(data); setLoadError("");
      if (data.own?.code && ((previous?.status === "waiting" && data.own.id === previous.id) || data.own.id === awaitingMatch.current)) {
        awaitingMatch.current = null;
        router.push(`/play/${data.own.code}`);
      }
      if (!data.own || data.own.status !== "waiting") setHeartbeatError("");
      if (previous?.status === "waiting" && !data.own) setMessage("Your request expired or was removed. You can start another search.");
    } catch (err) { if (version === revision.current) setLoadError(err instanceof Error ? err.message : "Could not refresh the lobby."); }
  }, [filter, router]);

  useEffect(() => {
    let stopped = false;
    let ticking = false;
    const requests = revision;
    const tick = async () => {
      if (document.visibilityState !== "visible" || mutating.current || ticking) return;
      ticking = true;
      try {
        const own = latest.current?.own;
        if (own?.status === "waiting" && own.mode === "auto" && Date.now() - heartbeatAt.current >= 20_000) {
          heartbeatAt.current = Date.now();
          try {
            const response = await fetch("/api/lobby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heartbeat", id: own.id }), signal: AbortSignal.timeout(10_000) });
            if (!stopped) setHeartbeatError(response.ok ? "" : "Could not keep your search active. Refresh to check its status.");
          } catch { if (!stopped) setHeartbeatError("Connection lost. Your search will expire unless you reconnect."); }
        }
        if (!stopped) await refresh();
      } finally { ticking = false; }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 5_000);
    const visible = () => { void tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; ++requests.current; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  async function act(action: "post" | "auto" | "join" | "cancel", id?: string) {
    if (mutating.current) return;
    mutating.current = true; ++revision.current; setBusy(true); setError(""); setMessage("");
    const clearingMatch = action === "cancel" && latest.current?.own?.status === "matched";
    try {
      const response = await fetch("/api/lobby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { action, id } : { action, targetWins, note }), signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the lobby.");
      if (data.id && (action === "post" || action === "auto")) awaitingMatch.current = data.id;
      if (data.code && !clearingMatch) { router.push(`/play/${data.code}`); return; }
      if (action === "cancel") {
        latest.current = null;
        awaitingMatch.current = null;
        setMessage(clearingMatch ? "Match notice cleared. Your game is still in Your games." : "Your request was removed.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update the lobby."); }
    finally { mutating.current = false; setBusy(false); await refresh(); }
  }

  const own = snapshot?.own;
  return <section className="panel game-finder" aria-labelledby="game-finder-title">
    <div>
      <p className="lobby-eyebrow">PLAY WITH OTHERS</p>
      <h2 id="game-finder-title" className="app-title text-2xl font-black">Find a game</h2>
      <p className="supporting-text mt-1 text-sm">Pick a player below, post that you want to play, or let us find your opponent.</p>
    </div>

    {own?.status === "matched" ? <div className="surface-card p-4" role="status">
      <h3 className="font-bold">{own.code ? "Your match is ready" : "Your last lobby match has ended"}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {own.code && <Link href={`/play/${own.code}`} className="btn-primary">Open game</Link>}
        <button className="btn-outline" disabled={busy} onClick={() => void act("cancel", own.id)}>Clear notice</button>
      </div>
    </div> : own ? <div className="surface-card p-4" role="status">
      <h3 className="font-bold">{own.mode === "auto" ? "Finding your opponent…" : "Your game is posted"}</h3>
      <p className="supporting-text mt-1 text-sm">First to {own.targetWins} {own.targetWins === 1 ? "win" : "wins"}. {own.mode === "auto" ? "Keep the lobby open. We’ll start your game when a player is found." : "Anyone in the lobby can join. Your game opens here when they do."}</p>
      {own.note && <p className="mt-2 break-words text-sm">{own.note}</p>}
      <p className="subtle-text mt-2 text-xs">{own.mode === "auto" ? "Search expires after 90 seconds away from the lobby." : `Expires at ${new Date(own.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}</p>
      <button className="btn-outline mt-3" disabled={busy} onClick={() => void act("cancel", own.id)}>{busy ? "Updating…" : own.mode === "auto" ? "Cancel search" : "Remove post"}</button>
    </div> : <form className="lobby-post-form" onSubmit={(event) => { event.preventDefault(); void act("post"); }}>
      <div>
        <label htmlFor="match-length" className="form-label mb-1 block text-sm">Match length</label>
        <select id="match-length" className="field" value={targetWins} disabled={busy} onChange={(event) => setTargetWins(Number(event.target.value))}>
          {MATCH_LENGTHS.map((wins) => <option key={wins} value={wins}>First to {wins} {wins === 1 ? "win" : "wins"}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="game-note" className="form-label mb-1 block text-sm">Post a note <span className="subtle-text">(optional)</span></label>
        <input id="game-note" className="field" placeholder="Anyone up for a quick game?" maxLength={160} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-outline" disabled={busy || !snapshot}>{busy ? "Updating…" : "Post a game"}</button>
        <button type="button" className="btn-primary" disabled={busy || !snapshot} onClick={() => void act("auto")}>Auto-match</button>
      </div>
      <p className="subtle-text text-xs">Posts are visible to signed-in players for 15 minutes. Posting allows a player to join directly, including through auto-match. Auto-match finds the oldest available request for your match length.</p>
    </form>}

    <div className="section-divider border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Looking for a game {snapshot ? `(${snapshot.total})` : ""}</h3>
        <button type="button" className="nav-link px-2 text-sm" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      </div>
      <label htmlFor="game-filter" className="form-label mt-2 block text-xs">Filter match length</label>
      <select id="game-filter" className="field mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">All match lengths</option>
        {MATCH_LENGTHS.map((wins) => <option key={wins} value={wins}>First to {wins}</option>)}
      </select>
      {!snapshot && !loadError && <p className="supporting-text py-4 text-sm" role="status">Loading the lobby…</p>}
      {snapshot?.posts.length === 0 && <div className="lobby-empty">
        <p className="font-semibold">No open posts{filter ? " for this match length" : " yet"}.</p>
        <p className="supporting-text mt-1 text-sm">Post a game or start auto-match to find the next player.</p>
      </div>}
      <ul className="lobby-posts">
        {snapshot?.posts.map((post) => <li key={post.id} className="surface-list-item p-3">
          <div className="flex items-center gap-2">
            <PlayerAvatar avatar={post.player.avatar} name={post.player.displayName} size="sm" />
            <div className="min-w-0 flex-1"><p className="break-words font-semibold">{post.player.displayName}</p><p className="subtle-text text-xs">#{post.player.id.slice(-6)} · First to {post.targetWins}</p></div>
            <button className="btn-outline shrink-0" disabled={busy || own?.status === "matched"} aria-label={`Join ${post.player.displayName}'s game`} onClick={() => void act("join", post.id)}>Join</button>
          </div>
          {post.note && <p className="supporting-text mt-2 break-words text-sm">{post.note}</p>}
        </li>)}
      </ul>
      {snapshot && snapshot.total > snapshot.posts.length && <p className="subtle-text text-xs">Showing the oldest 50 posts. Filter by match length to narrow the list.</p>}
    </div>
    {message && <p className="supporting-text text-sm" role="status">{message}</p>}
    {(error || loadError || heartbeatError) && <p className="error-text text-sm" role="alert">{error || loadError || heartbeatError}</p>}
  </section>;
}
