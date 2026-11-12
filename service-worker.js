const BUILD_REVISION = "sha256:7f64c474c245c657e36f15904a449c10a2ed42be2287b0a1f87cccb2f4010569";
const CACHE_NAME = `return-visits-shell-${BUILD_REVISION.slice(7)}`;
const RELEASE_VERSION = "0.9.062";
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
  "./service-worker.js",
];
const releaseUrl = (path) => {
  const url = new URL(path, self.registration.scope);
  url.searchParams.set("nrv-release", RELEASE_VERSION);
  return url.href;
};
const shellUrls = APP_SHELL.map(releaseUrl);
const network = async (request) => {
  let timer;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  try {
    return await Promise.race([
      fetch(request, { cache: "no-cache", ...(controller ? { signal: controller.signal } : {}) }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new Error("The app resource request timed out."));
        }, 3000);
      }),
    ]);
  } finally { clearTimeout(timer); }
};
const validate = async (response, url) => {
  if (!response.ok) throw new Error("An app resource is unavailable.");
  const release = response.headers.get("X-NRV-Release");
  if (release && release !== RELEASE_VERSION) throw new Error("An app resource belongs to another release.");
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/") || /\/(?:index\.html|app\.js|service-worker\.js)$/.test(pathname)) {
    const body = await response.clone().text();
    const revision = pathname.endsWith("/app.js")
      ? body.match(/^const APP_BUILD_REVISION = "([^"]+)";/m)?.[1]
      : pathname.endsWith("/service-worker.js")
        ? body.match(/^const BUILD_REVISION = "([^"]+)";/m)?.[1]
        : body.match(/name="nrv-build-revision" content="([^"]+)"/)?.[1];
    if (revision !== BUILD_REVISION) throw new Error("An app resource revision does not match.");
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(shellUrls.map(async (url) => {
      const fetched = await network(url);
      const response = new Response(await fetched.arrayBuffer(), {
        status: fetched.status,
        statusText: fetched.statusText,
        headers: fetched.headers,
      });
      await validate(response, url);
      return [url, response];
    }))
      .then(async (resources) => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(resources.map(([url, response]) => cache.put(url, response)));
      })
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
    (requestUrl.pathname.endsWith("/service-worker.js") && !requestUrl.searchParams.has("nrv-release")) ||
    !requestUrl.pathname.startsWith(new URL(self.registration.scope).pathname)
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const requestedRelease = requestUrl.searchParams.get("nrv-release");
      const knownResource = shellUrls.includes(requestUrl.href);
      const cachedResponse = knownResource ? await cache.match(event.request) : null;
      if (cachedResponse) return cachedResponse;
      try {
        const response = await network(event.request);
        if (!response.ok) {
          if (event.request.mode === "navigate") {
            return await cache.match(releaseUrl("./index.html")) || response;
          }
          return response;
        }
        if (knownResource && requestedRelease === RELEASE_VERSION) {
          await validate(response, requestUrl);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        if (event.request.mode === "navigate") {
          const appShell = await cache.match(releaseUrl("./index.html"));
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
