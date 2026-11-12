// Run with: node tests/app-deployment-path.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"),
);
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(
  path.join(root, "service-worker.js"),
  "utf8",
);
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
const dropbox = fs.readFileSync(path.join(root, "dropbox.js"), "utf8");
const stylesheet = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const manifestAssets = [
  ...manifest.icons.map((icon) => icon.src),
];
const shellBlock = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\n\];/);
assert(shellBlock, "service-worker cache list exists");
assert(
  /fetch\(request,\s*\{\s*cache:\s*["']no-cache["']/.test(
    serviceWorker,
  ),
  "service-worker network-first requests revalidate cached assets",
);
const shellAssets = [...shellBlock[1].matchAll(/"([^"]+)"/g)].map(
  (match) => match[1],
);

for (const basePath of ["/nice-return-visits-app/", "/app/"]) {
  const appUrl = new URL(basePath, "https://nicereturnvisits.org");
  const manifestUrl = new URL("./manifest.webmanifest", appUrl);
  const resolveFromManifest = (relative) => new URL(relative, manifestUrl).href;
  assert.strictEqual(resolveFromManifest(manifest.start_url), appUrl.href);
  assert.strictEqual(resolveFromManifest(manifest.scope), appUrl.href);
  assert.strictEqual(resolveFromManifest(manifest.id), appUrl.href);
  for (const asset of manifestAssets) {
    assert(
      new URL(asset, manifestUrl).pathname.startsWith(basePath),
      `${basePath}: manifest asset stays in app scope: ${asset}`,
    );
  }

  const serviceWorkerUrl = new URL("./service-worker.js", appUrl);
  assert.strictEqual(serviceWorkerUrl.pathname, `${basePath}service-worker.js`);
  assert(
    /serviceWorker\.register\s*\(\s*["']\.\/service-worker\.js["']/.test(index),
    "service worker registers from a relative app path",
  );
  assert(
    !/url\(\s*["']?\//.test(stylesheet),
    "stylesheet assets do not escape the app base path",
  );
  for (const asset of shellAssets) {
    const url = new URL(asset, serviceWorkerUrl);
    assert(
      url.pathname.startsWith(basePath),
      `${basePath}: cached resource stays in app scope: ${asset}`,
    );
    assert(!asset.startsWith("/"), `${asset} is base-relative`);
    assert(!asset.split("/").includes(".."), `${asset} does not leave app scope`);
  }

  assert(index.includes('href="./manifest.webmanifest"'));
  assert(index.includes('src="./service-worker.js"') ||
    index.includes('"./service-worker.js"'));
  assert(
    i18n.includes('"locales/en.json"') && i18n.includes('"locales/es.json"'),
    "locale resources resolve relative to the app page",
  );
  assert(
    dropbox.includes("window.location.pathname.replace(/[^/]*$/, \"\")"),
    "Dropbox OAuth redirect URI is derived from the app base path",
  );
  for (const match of index.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#|data:)/i.test(target)) continue;
    assert(
      new URL(target, appUrl).pathname.startsWith(basePath),
      `${basePath}: page asset/navigation stays in app scope: ${target}`,
    );
  }
  console.log(`PASS  manifest, service worker, resources and OAuth paths at ${basePath}`);
}

for (const language of ["en", "es"]) {
  const launch = new URL("/app/", "https://nicereturnvisits.org");
  launch.searchParams.set("lang", language);
  assert.strictEqual(launch.searchParams.get("lang"), language);
  launch.searchParams.set("install", "1");
  assert.strictEqual(launch.searchParams.get("install"), "1");
  console.log(`PASS  /app/ preserves ${language} and installation query parameters`);
}

const initializeStart = app.indexOf("const initializeApp = async () => {");
const initializeEnd = app.indexOf("  await requireUserAgreement();", initializeStart);
assert(initializeStart >= 0 && initializeEnd > initializeStart);
const installRouting = `${app.slice(initializeStart, initializeEnd)}
};
this.initializeApp = initializeApp;`;

async function routeInstallQuery() {
  const location = {
    href: "https://nicereturnvisits.org/app/?lang=es&install=1",
  };
  let launchChoiceShown = 0;
  let installGuideShown = 0;
  const context = {
    URL,
    window: {
      location,
      history: {
        replaceState(_state, _title, url) {
          location.href = url.href;
        },
      },
    },
    isInstalledApp: () => false,
    localStorage: { getItem: () => null },
    LAUNCH_MODE_KEY: "launch-mode",
    showLaunchChoice() { launchChoiceShown += 1; },
    showBrowserInstallGuide() { installGuideShown += 1; },
    console,
  };
  require("vm").runInNewContext(installRouting, context);
  await context.initializeApp();
  const finalUrl = new URL(location.href);
  assert.strictEqual(finalUrl.pathname, "/app/");
  assert.strictEqual(finalUrl.searchParams.get("lang"), "es");
  assert.strictEqual(finalUrl.searchParams.has("install"), false);
  assert.strictEqual(launchChoiceShown, 1);
  assert.strictEqual(installGuideShown, 0, "direct install offers the native prompt before manual guidance");
}

routeInstallQuery()
  .then(() => console.log("PASS  /app/ install routing retains language and app path"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
