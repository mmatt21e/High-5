"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicPlayer } from "@/lib/avatars";
import { PlayerAvatar } from "./PlayerAvatar";

interface Invitation {
  id: string; incoming: boolean; status: string; player: PublicPlayer; code: string | null;
}

export function PlayerChallenges() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [searched, setSearched] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  const invitationsRequest = useRef(0);

  const refreshInvitations = useCallback(async () => {
    const id = ++invitationsRequest.current;
    try {
      const response = await fetch("/api/invitations", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not refresh invitations.");
      const data = await response.json();
      if (id !== invitationsRequest.current) return;
      setInvitations(data.invitations); setLoadError("");
    } catch { if (id === invitationsRequest.current) setLoadError("Invitations could not refresh. Check your connection or refresh the page."); }
  }, []);

  useEffect(() => {
    void refreshInvitations();
    const refresh = () => { if (document.visibilityState === "visible") void refreshInvitations(); };
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshInvitations]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const id = ++requestId.current;
    setBusy("search"); setError(""); setMessage(""); setSearched(false);
    try {
      const response = await fetch(`/api/players?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error || "Could not search players.");
      setPlayers(data.players); setSearched(true);
    } catch (error) { if (id === requestId.current) setError(error instanceof Error ? error.message : "Could not search players."); }
    finally { if (id === requestId.current) setBusy(null); }
  }

  async function invite(player: PublicPlayer) {
    setBusy(player.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: player.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send invitation.");
      setMessage(`Invitation sent to ${player.displayName}. Your game will appear below when they accept.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not send invitation."); }
    finally { await refreshInvitations(); setBusy(null); }
  }

  async function respond(invitation: Invitation, action: "accept" | "decline" | "cancel") {
    setBusy(invitation.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId: invitation.id, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not answer invitation.");
      if (data.code) { router.push(`/play/${data.code}`); return; }
      setMessage(action === "decline" ? "Invitation declined." : "Invitation cancelled.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not answer invitation."); }
    finally { await refreshInvitations(); setBusy(null); }
  }

  return (
    <section className="panel player-challenges" aria-labelledby="find-player-title">
      <h2 id="find-player-title" className="font-bold">Play someone you know</h2>
      <p className="supporting-text text-sm">Search by username (their player name). They can accept your invitation from their lobby.</p>
      <form onSubmit={search} className="player-search">
        <label htmlFor="player-query" className="form-label text-sm">Player name</label>
        <div className="flex gap-2">
          <input id="player-query" className="field min-w-0 flex-1" value={query} minLength={2} maxLength={40} required
            autoComplete="off" placeholder="Search for a player"
            onChange={(event) => { setQuery(event.target.value); requestId.current++; setSearched(false); setPlayers([]); if (busy === "search") setBusy(null); }} />
          <button className="btn-outline" disabled={busy !== null || query.trim().length < 2}>{busy === "search" ? "Searching…" : "Search"}</button>
        </div>
      </form>
      {searched && players.length === 0 && <p role="status" className="supporting-text text-sm">No players found. Try another name.</p>}
      {players.length > 0 && <ul className="player-list" aria-label="Player search results">
        {players.map((player) => {
          const pending = invitations.find((invitation) => invitation.player.id === player.id && invitation.status === "pending");
          return <li key={player.id}>
            <PlayerAvatar avatar={player.avatar} name={player.displayName} />
            <div className="player-list-name"><strong>{player.displayName}</strong><span className="subtle-text">Player #{player.id.slice(-6)}</span></div>
            <button className="btn-outline text-sm" disabled={busy !== null || !!pending} onClick={() => invite(player)}>
              {pending ? pending.incoming ? "Invited you" : "Invited" : busy === player.id ? "Sending…" : "Invite"}
            </button>
          </li>;
        })}
      </ul>}
      {players.length === 20 && <p className="subtle-text text-xs">Showing 20 players. Use more of the name to narrow your search.</p>}
      <p role="status" className="supporting-text text-sm">{message}</p>
      {error && <p role="alert" className="error-text text-sm">{error}</p>}
      <div className="section-divider border-t pt-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">Invitations</h3>
          <button type="button" className="nav-link text-xs" onClick={() => void refreshInvitations()}>Refresh</button></div>
        {loadError && <p role="status" className="error-text text-sm">{loadError}</p>}
        {invitations.length === 0 && !loadError && <p className="subtle-text text-sm">No invitations yet.</p>}
        <ul className="player-list" aria-label="Game invitations">
          {invitations.map((invitation) => <li key={invitation.id} className="invitation-item">
            <PlayerAvatar avatar={invitation.player.avatar} name={invitation.player.displayName} />
            <div className="player-list-name"><strong>{invitation.player.displayName}</strong>
              <span className="subtle-text">{invitation.status === "pending" ? invitation.incoming ? "Invited you to play" : "Waiting for acceptance" : invitation.status === "accepted" ? invitation.code ? "Ready to play" : "Match ended" : invitation.status === "declined" ? "Invitation declined" : "Invitation cancelled"}</span>
            </div>
            <div className="invitation-actions">
              {invitation.status === "pending" && (invitation.incoming ? <>
                <button disabled={busy !== null} className="btn-primary text-sm" onClick={() => respond(invitation, "accept")}>Accept</button>
                <button disabled={busy !== null} className="btn-outline text-sm" onClick={() => respond(invitation, "decline")}>Decline</button>
              </> : <button disabled={busy !== null} className="btn-outline text-sm" onClick={() => respond(invitation, "cancel")}>Cancel</button>)}
              {invitation.code && <Link className="btn-primary text-sm" href={`/play/${invitation.code}`}>Play</Link>}
            </div>
          </li>)}
        </ul>
      </div>
    </section>
  );
}
