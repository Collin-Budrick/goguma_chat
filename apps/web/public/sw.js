const CACHE_VERSION = "v2";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const APP_SHELL_ASSETS = [
  "/",
  "/en",
  "/ko",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.all(
        APP_SHELL_ASSETS.map(async (asset) => {
          try {
            const request = new Request(asset, { cache: "reload" });
            const response = await fetch(request);
            if (response.ok) {
              await cache.put(request, response.clone());
            }
          } catch (error) {
            console.warn("[sw] Failed to precache", asset, error);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await cache.match(request, { ignoreVary: true });
    if (fallback) {
      return fallback;
    }
    throw error;
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) {
          return cached;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const fallback = await cache.match("/", { ignoreVary: true });
          if (fallback) {
            return fallback;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;

  if (
    isSameOrigin &&
    (url.pathname.startsWith("/api/") ||
      request.headers.get("accept") === "text/event-stream")
  ) {
    return;
  }
  const isStaticAsset =
    isSameOrigin &&
    (url.pathname.startsWith("/_next/static/") ||
      APP_SHELL_ASSETS.includes(url.pathname) ||
      ["style", "script", "font", "image"].includes(request.destination));

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (isSameOrigin) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
