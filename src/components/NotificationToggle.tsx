"use client";

import { useEffect, useState } from "react";
import {
  disablePushSubscription,
  synchronizeExistingPushSubscription,
} from "@/lib/browserPush";

type State =
  | "unsupported"
  | "checking"
  | "default"
  | "denied"
  | "subscribing"
  | "disabling"
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
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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

    async function synchronizeExistingSubscription() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || Notification.permission !== "granted") {
          if (!cancelled) setState("default");
          return;
        }
        const result = await synchronizeExistingPushSubscription(sub);
        if (cancelled) return;
        if (result === "enabled") {
          setState("enabled");
        } else {
          setState("default");
          if (result === "removed") {
            setError(
              "This device’s previous alert subscription belonged to another account.",
            );
          }
        }
      } catch {
        // Do not claim the device is enabled unless the server confirms it.
        if (!cancelled) setState("default");
      }
    }

    void synchronizeExistingSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (
      state === "checking" ||
      state === "subscribing" ||
      state === "disabling"
    ) {
      return;
    }
    let createdSubscription: PushSubscription | null = null;
    try {
      setError(null);
      setState("subscribing");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        const existingResult = await synchronizeExistingPushSubscription(sub);
        if (existingResult === "enabled") {
          setState("enabled");
          return;
        }
        if (existingResult === "rejected") {
          throw new Error("Existing subscription was rejected");
        }
        // An endpoint owned by a previous account has now been invalidated in
        // this browser. Subscribe again to obtain a capability for this user.
        sub = null;
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        createdSubscription = sub;
      }
      const result = await synchronizeExistingPushSubscription(sub);
      if (result !== "enabled") {
        if (createdSubscription && result !== "removed") {
          await createdSubscription.unsubscribe().catch(() => false);
        }
        throw new Error("Subscription was rejected");
      }
      setState("enabled");
    } catch {
      setState("default");
      setError("Turn alerts could not be enabled. Please try again.");
    }
  }

  async function disable() {
    try {
      setError(null);
      setState("disabling");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState("default");
        return;
      }
      const result = await disablePushSubscription(sub);
      const disabled = result.serverRemoved || result.browserRemoved;
      setState(disabled ? "default" : "enabled");
      if (!result.serverRemoved) {
        setError(
          disabled
            ? "Alerts are off on this device; the stale server record cannot deliver here."
            : "Turn alerts could not be disabled. Please try again.",
        );
      }
    } catch {
      setState("enabled");
      setError("Turn alerts could not be disabled. Please try again.");
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
      <div className="flex flex-col gap-2">
        <button onClick={disable} className="btn-ghost w-full text-sm">
          Turn off alerts for this device
        </button>
        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}
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
    <div>
      <button
        onClick={enable}
        disabled={
          state === "checking" ||
          state === "subscribing" ||
          state === "disabling"
        }
        className="btn-ghost w-full text-sm"
      >
        {state === "checking"
          ? "Checking turn notifications…"
          : state === "subscribing"
          ? "Enabling…"
          : state === "disabling"
            ? "Turning off…"
            : "🔔 Enable turn notifications"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
