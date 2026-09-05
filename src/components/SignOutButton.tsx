"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { disablePushSubscription } from "@/lib/browserPush";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await disablePushSubscription(subscription);
        }
      }
    } catch {
      // Push cleanup is best effort; it must not trap someone in their session.
    }

    try {
      await signOut({ callbackUrl: "/login" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="text-sm text-white/60 underline"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
