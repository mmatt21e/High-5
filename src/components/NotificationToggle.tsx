"use client";

import { useEffect, useState } from "react";

type State =
  | "unsupported"
  | "default"
  | "denied"
  | "subscribing"
  | "enabled";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Lets the player enable "it's your turn" push notifications on this device. */
export function NotificationToggle() {
  const [state, setState] = useState<State>("default");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    // Reflect an existing subscription as "enabled".
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub && Notification.permission === "granted") setState("enabled");
      })
      .catch(() => {});
  }, []);

  async function enable() {
    try {
      setState("subscribing");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setState("enabled");
    } catch {
      setState("default");
    }
  }

  if (state === "unsupported") {
    return (
      <p className="text-xs text-white/45">
        Turn notifications aren’t supported on this device.
      </p>
    );
  }
  if (state === "enabled") {
    return (
      <div className="text-sm font-semibold text-emerald-300">
        🔔 Turn alerts are on for this device
      </div>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-xs text-white/45">
        Notifications are blocked — enable them in your browser settings to get
        turn alerts.
      </p>
    );
  }
  return (
    <button
      onClick={enable}
      disabled={state === "subscribing"}
      className="btn-ghost w-full text-sm"
    >
      {state === "subscribing" ? "Enabling…" : "🔔 Enable turn notifications"}
    </button>
  );
}
