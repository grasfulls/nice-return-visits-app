const CACHE_NAME = "return-visits-shell-v131";
const APP_SHELL = [
  "./",
  "./index.html",
  "./help.html",
  "./privacy.html",
  "./terms.html",
  "./docs/Nice-Return-Visits-Setup-User-Guide.pdf",
  "./docs/Nice-Return-Visits-Privacy-Notice.pdf",
  "./styles.css",
  "./app.js",
  "./dropbox.js",
  "./merge.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png?v=2",
  "./icons/icon-192.png?v=2",
  "./icons/icon-512.png?v=2",
  "./icons/header-watermark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("return-visits-shell-") &&
                cacheName !== CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    !requestUrl.pathname.startsWith(new URL(self.registration.scope).pathname)
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === "navigate") {
          const appShell = await caches.match("./index.html");
          if (appShell) return appShell;
        }
        return Response.error();
      }
    })(),
  );
});
