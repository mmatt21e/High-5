"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AVATARS, AVATAR_MAX_UPLOAD_BYTES, type PublicPlayer } from "@/lib/avatars";
import { PlayerAvatar } from "./PlayerAvatar";

export function AvatarSettings({ player: initialPlayer }: { player: PublicPlayer }) {
  const [player, setPlayer] = useState(initialPlayer);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function save(body: string | File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PUT", body,
        headers: { "Content-Type": typeof body === "string" ? "application/json" : body.type || "application/octet-stream" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your avatar.");
      setPlayer(data.player); setMessage("Avatar saved."); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save your avatar."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <section aria-labelledby="avatar-heading" className="avatar-settings">
      <div className="flex items-center gap-3">
        <PlayerAvatar avatar={player.avatar} name={player.displayName} size="lg" />
        <div className="min-w-0">
          <h2 id="avatar-heading" className="font-bold">Your avatar</h2>
          <p className="supporting-text text-sm">Choose a character or upload your own.</p>
        </div>
      </div>
      <div className="avatar-choices" role="group" aria-label="Choose an avatar">
        {AVATARS.map((avatar) => (
          <button key={avatar.id} type="button" disabled={busy}
            aria-pressed={player.avatar === `avatar:${avatar.id}`} aria-label={`Use ${avatar.label} avatar`}
            onClick={() => save(JSON.stringify({ preset: avatar.id }))}>
            <PlayerAvatar avatar={`avatar:${avatar.id}`} name={avatar.label} />
            <span>{avatar.label}</span>
          </button>
        ))}
      </div>
      <label htmlFor="avatar-upload" className="form-label text-sm">Upload an image</label>
      <input ref={input} id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        aria-describedby="avatar-upload-help" className="field w-full text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
            setError("Choose an image smaller than 2 MB."); event.target.value = ""; return;
          }
          void save(file);
        }} />
      <p id="avatar-upload-help" className="subtle-text text-xs">JPEG, PNG or WebP · up to 2 MB / 16 megapixels. Cropped to a square and saved to your account.</p>
      <p role="status" className="supporting-text text-sm">{busy ? "Saving avatar…" : message}</p>
      {error && <p role="alert" className="error-text text-sm">{error}</p>}
    </section>
  );
}
