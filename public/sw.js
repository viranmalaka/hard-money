// Hard Money Service Worker - Local-first PWA Shell & Push Notifications
const CACHE_VERSION = "hardmoney-v4";
const PRECACHE_ASSETS = [
  "/offline",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.png",
];

// Install Event: Precache app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Use individual puts so a failure on one dynamic page doesn't abort precaching
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: "no-cache" });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch {
          // ignore precache misses during testing or offline builds
        }
      }
    })
  );
});

// Activate Event: Cleanup old caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message Event: Support instant update activation
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch Event: Offline shell caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore API requests, HMR sockets & hot updates
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("webpack-hmr") ||
    url.pathname.includes("hot-update") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Navigation & HTML document requests: Network-First with Cache fallback, then /offline
  const isHtmlRequest =
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html"));

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
          if (cachedResponse) {
            return cachedResponse;
          }
          const offlineFallback = await caches.match("/offline");
          if (offlineFallback) {
            return offlineFallback;
          }
          return new Response("You are currently offline.", {
            headers: { "Content-Type": "text/html" },
          });
        })
    );
    return;
  }

  // Static assets: Cache-First or Stale-While-Revalidate with ignoreSearch
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(async (cached) => {
      const cachedResponse = cached || (await caches.match(url.pathname, { ignoreSearch: true }));
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Event: Handle incoming push notification messages
self.addEventListener("push", (event) => {
  let data = {
    title: "Hard Money Reminder",
    body: "Don't forget to track your daily transactions!",
    url: "/transactions",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/transactions",
    },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Event: Focus or open app to target URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/transactions";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
