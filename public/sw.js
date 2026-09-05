// Five-O Poker service worker — enables installability without storing private
// pages. Navigations and APIs always go to the network; only immutable public
// assets are eligible for Cache Storage.

const CACHE = "fiveo-static-v2";
const PUBLIC_ASSETS = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept navigations, personalized RSC requests, APIs, auth, or
  // realtime traffic. A cached HTML response could belong to another account.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.mode === "navigate"
  ) {
    return;
  }

  const immutableAsset =
    url.pathname.startsWith("/_next/static/") ||
    PUBLIC_ASSETS.includes(url.pathname);
  if (!immutableAsset) {
    return;
  }

  // Immutable/static assets: cache-first, then network and populate the cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

// ---- Web Push: "it's your turn" notifications ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Five-O Poker";
  const url = data.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url },
      // Collapse repeated alerts for the same game into one.
      tag: url,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
