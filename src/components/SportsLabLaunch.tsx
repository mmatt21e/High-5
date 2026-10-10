"use client";
import { useState } from "react";

export function SportsLabLaunch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function launch() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/sports-lab/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok || typeof result.redirect !== "string") throw new Error(result.error || "Unable to open Sports Lab.");
      const destination = new URL(result.redirect);
      if (destination.protocol !== "https:" || destination.pathname !== "/__edgegames/launch") throw new Error("Invalid Sports Lab destination.");
      window.location.assign(destination.href);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to open Sports Lab."); setBusy(false); }
  }
  return <><button type="button" className="btn-primary" onClick={launch} disabled={busy}>{busy ? "Opening Sports Lab…" : "Open Sports Lab securely"}</button>{error && <p role="alert" className="admin-error">{error}</p>}</>;
}
