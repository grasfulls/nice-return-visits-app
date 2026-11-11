const BUILD_REVISION = "sha256:67f1459a2672ecda3c1c6562e14599baff546e9564a46c072d671b40a1a6197b";
const CACHE_NAME = `return-visits-shell-${BUILD_REVISION.slice(7)}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./help.html",
  "./help-es.html",
  "./docs/install-browser-en.png",
  "./docs/install-browser-es.png",
  "./privacy.html",
  "./terms.html",
  "./styles.css",
  "./app.js",
  "./dropbox.js",
  "./merge.js",
  "./i18n.js",
  "./nrv-dialog.js",
  "./locales/en.json",
  "./locales/es.json",
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
  const versionUrl = new URL("version.json", self.registration.scope);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname === versionUrl.pathname ||
    !requestUrl.pathname.startsWith(new URL(self.registration.scope).pathname)
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (!response.ok) {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || response;
        }
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "nrv-get-revision") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ revision: BUILD_REVISION });
  }
});
