// Run with: node tests/service-worker-offline.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const base = "https://example.test/app/";
const entries = new Map();
const deletedCaches = [];
const handlers = {};
const normalize = (url) => new URL(typeof url === "string" ? url : url.url, base).href;
const cache = {
  async addAll(paths) {
    for (const relativePath of paths) {
      const file = relativePath === "./" ? "index.html" : relativePath.split("?")[0];
      entries.set(normalize(relativePath), {
        body: fs.readFileSync(path.join(root, file), "utf8"),
      });
    }
  },
};
const caches = {
  async open(name) { cache.name = name; return cache; },
  async match(request) { return entries.get(normalize(request)); },
  async keys() { return ["return-visits-shell-v195", "return-visits-shell-v196", "return-visits-shell-v199", "return-visits-shell-v200", "return-visits-shell-v202", "return-visits-shell-v203", "unrelated-cache"]; },
  async delete(name) { deletedCaches.push(name); return true; },
};
const self = {
  registration: { scope: base },
  location: { origin: new URL(base).origin },
  addEventListener(type, handler) { handlers[type] = handler; },
  async skipWaiting() {},
  clients: { async claim() {} },
};
vm.runInNewContext(source, {
  URL, self, caches,
  fetch: async () => { throw new Error("offline"); },
  Response: { error: () => ({ error: true }) },
});

async function main() {
  const revision = source.match(/^const BUILD_REVISION = "([^"]+)";$/m)?.[1];
  assert(revision && /^sha256:[a-f0-9]{64}$/.test(revision));
  assert(source.includes("return-visits-shell-${BUILD_REVISION.slice(7)}"));
  assert(app.includes(`const APP_BUILD_REVISION = "${revision}";`));
  assert(source.includes(`const BUILD_REVISION = "${revision}";`));
  console.log("PASS  service-worker cache key uses the generated asset revision");
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });
  await installation;
  assert.strictEqual(cache.name, `return-visits-shell-${revision.slice(7)}`);
  const cachedIndex = entries.get(normalize("./index.html")).body;
  assert(!cachedIndex.includes('id="btn-contacts-backup"'));
  assert(!cachedIndex.includes('id="btn-contacts-restore"'));
  assert(cachedIndex.includes('id="btn-export-backup"'));
  assert(cachedIndex.includes('id="btn-restore-backup"'));
  assert(!source.includes("NRV-Privacy-Notice.pdf"));
  assert(!entries.has(normalize("./docs/NRV-Privacy-Notice.pdf")));
  console.log("PASS  service-worker installation does not require the removed local PDF");
  let activation;
  handlers.activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepStrictEqual(deletedCaches, ["return-visits-shell-v195", "return-visits-shell-v196", "return-visits-shell-v199", "return-visits-shell-v200", "return-visits-shell-v202", "return-visits-shell-v203"]);
  console.log("PASS  service-worker update removes previous shell caches");
  async function offline(relativePath, mode = "cors") {
    let response;
    handlers.fetch({
      request: { url: normalize(relativePath), method: "GET", mode },
      respondWith(promise) { response = promise; },
    });
    assert(response, `service worker handled ${relativePath}`);
    return response;
  }
  for (const lang of ["en", "es"]) {
    const response = await offline(`./locales/${lang}.json`);
    const catalog = JSON.parse(response.body);
    assert(catalog["contacts.add"]);
    assert(catalog["backup.everything"]);
    assert(catalog["backup.restoreSelected"]);
    assert(catalog["goals.path.beginMinistry"]);
    console.log(`PASS  ${lang} catalog is available offline`);
    const shell = await offline(`./?lang=${lang}`, "navigate");
    assert(shell.body.includes('src="i18n.js"'));
    console.log(`PASS  ${lang} query launch falls back to the offline app shell`);
    const installShell = await offline(`./?lang=${lang}&install=1`, "navigate");
    assert(installShell.body.includes('src="i18n.js"'));
    console.log(`PASS  ${lang} install query falls back to the offline app shell`);
  }
  for (const file of ["./app.js", "./i18n.js", "./styles.css", "./help.html", "./help-es.html"]) {
    assert((await offline(file)).body.length > 0);
    console.log(`PASS  ${file} is available offline`);
  }
  assert((await offline("./merge.js")).body.includes("mergeGoalsAndMilestones"));
  console.log("PASS  Goals merge logic is cached for offline operation");
  assert((await offline("./nrv-dialog.js")).body.length > 0);
  console.log("PASS  ./nrv-dialog.js is available offline");
  for (const file of ["./docs/install-browser-en.png", "./docs/install-browser-es.png"]) {
    assert((await offline(file)).body.length > 0);
    console.log(`PASS  ${file} is available offline`);
  }
  for (const file of ["./version.json", "./version.json?check=unique"]) {
    let intercepted = false;
    handlers.fetch({
      request: { url: normalize(file), method: "GET", mode: "cors" },
      respondWith() { intercepted = true; },
    });
    assert(!intercepted, "deployment version must not use a cached fallback");
  }
  assert(!entries.has(normalize("./version.json")));
  let outOfScope = false;
  handlers.fetch({
    request: { url: "https://example.test/", method: "GET", mode: "navigate" },
    respondWith() { outOfScope = true; },
  });
  assert(!outOfScope, "the /app/ worker does not intercept requests outside its scope");
  console.log("PASS  deployment version bypasses service-worker caching");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
