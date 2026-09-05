"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  INVITE_CODE_LENGTH,
  LEGACY_INVITE_CODE_LENGTH,
  isSupportedInviteCodeLength,
} from "@/lib/inviteCode";

export function Lobby() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  async function createGame() {
    setError(null);
    setBusy("create");
    const res = await fetch("/api/match", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not create game");
    router.push(`/play/${data.code}`);
  }

  async function joinGame(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("join");
    const res = await fetch("/api/match/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not join game");
    router.push(`/play/${data.code}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={createGame}
        disabled={busy !== null}
        className="btn-primary py-4 text-lg"
      >
        {busy === "create" ? "Creating…" : "Create a game"}
      </button>

      <div className="flex items-center gap-3 text-xs text-white/40">
        <span className="h-px flex-1 bg-white/15" />
        OR
        <span className="h-px flex-1 bg-white/15" />
      </div>

      <form
        onSubmit={joinGame}
        className="flex flex-col gap-3"
        aria-describedby={error ? "lobby-error" : undefined}
      >
        <label htmlFor="invite-code" className="text-center text-sm font-semibold text-white/80">
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter invite code"
          autoComplete="off"
          inputMode="text"
          pattern={`(?:[A-HJ-NP-Z2-9]{${LEGACY_INVITE_CODE_LENGTH}}|[A-HJ-NP-Z2-9]{${INVITE_CODE_LENGTH}})`}
          minLength={LEGACY_INVITE_CODE_LENGTH}
          maxLength={INVITE_CODE_LENGTH}
          aria-invalid={Boolean(error)}
          className="field py-4 text-center text-2xl font-bold tracking-[0.3em] placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
        />
        <button
          type="submit"
          disabled={
            busy !== null || !isSupportedInviteCodeLength(code.trim().length)
          }
          className="btn-outline"
        >
          {busy === "join" ? "Joining…" : "Join game"}
        </button>
      </form>

      {error && (
        <p id="lobby-error" role="alert" className="text-center text-sm text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
