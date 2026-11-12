// Run with: node tests/service-worker-offline.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const base = "https://example.test/app/";
const version = require("../scripts/version.js").canonicalVersion(
  fs.readFileSync(path.join(root, "app.js"), "utf8"),
);
const revision = source.match(/^const BUILD_REVISION = "([^"]+)";/m)[1];
const releaseUrl = (file) => {
  const url = new URL(file, base);
  url.searchParams.set("nrv-release", version);
  return url.href;
};
const entries = new Map();
const handlers = {};
const deleted = [];
const requests = [];
let offline = false;
let wrongRelease = false;
let wrongRevision = false;
let writes = 0;
let limitConnections = false;
let occupied = 0;
let consumed = 0;
const queued = [];
const key = (request) => typeof request === "string" ? request : request.url;
const cache = {
  async put(request, response) {
    writes += 1;
    entries.set(key(request), response.clone());
  },
  async match(request) { return entries.get(key(request))?.clone(); },
};
const self = {
  registration: { scope: base },
  location: { origin: new URL(base).origin },
  addEventListener(type, handler) { handlers[type] = handler; },
  async skipWaiting() {},
  clients: { async claim() {} },
};
vm.runInNewContext(source, {
  self, URL, Response, setTimeout, clearTimeout, AbortController,
  caches: {
    async open(name) {
      assert.strictEqual(name, `return-visits-shell-${revision.slice(7)}`);
      return cache;
    },
    async keys() { return ["return-visits-shell-old", "unrelated-cache"]; },
    async delete(name) { deleted.push(name); },
  },
  async fetch(request, options) {
    requests.push(key(request));
    assert.strictEqual(options.cache, "no-cache");
    if (offline) throw new Error("offline");
    const url = new URL(key(request));
    const relative = url.pathname.slice("/app/".length) || "index.html";
    let bytes = fs.readFileSync(path.join(root, relative));
    if (wrongRevision && relative === "app.js") {
      bytes = Buffer.from(bytes.toString().replace(revision, `sha256:${"a".repeat(64)}`));
    }
    if (limitConnections && occupied >= 6) {
      await new Promise((resolve, reject) => {
        const resume = () => { options.signal?.removeEventListener("abort", abort); resolve(); };
        const abort = () => { queued.splice(queued.indexOf(resume), 1); reject(new Error("connection deadline")); };
        queued.push(resume);
        options.signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (limitConnections) occupied += 1;
    const response = new Response(bytes, {
      headers: { "X-NRV-Release": wrongRelease ? "0.9.059" : version },
    });
    if (limitConnections) {
      const read = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const body = await read();
        occupied -= 1;
        consumed += 1;
        queued.shift()?.();
        return body;
      };
    }
    return response;
  },
});
const install = async () => {
  let pending;
  handlers.install({ waitUntil(value) { pending = value; } });
  await pending;
};
const request = async (file, mode = "cors") => {
  let pending;
  handlers.fetch({
    request: { url: new URL(file, base).href, method: "GET", mode },
    respondWith(value) { pending = value; },
  });
  return pending;
};

async function main() {
  wrongRelease = true;
  await assert.rejects(install(), /another release/);
  assert.strictEqual(writes, 0, "a wrong release must not populate the revision cache");
  wrongRelease = false;
  wrongRevision = true;
  await assert.rejects(install(), /revision/);
  assert.strictEqual(writes, 0, "a wrong app revision must not populate the revision cache");
  wrongRevision = false;
  limitConnections = true;
  await install();
  limitConnections = false;
  assert.strictEqual(occupied, 0, "precache must consume bodies before waiting for all response headers");
  assert.strictEqual(consumed, entries.size, "every required body must be consumed");
  for (const [url, response] of entries) {
    const relative = new URL(url).pathname.slice("/app/".length) || "index.html";
    assert(Buffer.from(await response.clone().arrayBuffer()).equals(fs.readFileSync(path.join(root, relative))),
      `cached bytes must be preserved: ${relative}`);
  }
  console.log("PASS six-connection precaching drains every body promptly and preserves exact bytes");
  assert(requests.every((url) => new URL(url).searchParams.get("nrv-release") === version));
  assert([...entries.keys()].every((url) => new URL(url).searchParams.get("nrv-release") === version));
  console.log("PASS precaching rejects wrong release/revision and stores only release-specific resources");

  let activation;
  handlers.activate({ waitUntil(value) { activation = value; } });
  await activation;
  assert.deepStrictEqual(deleted, ["return-visits-shell-old"]);
  offline = true;
  for (const file of [
    "app.js", "i18n.js", "nrv-dialog.js", "styles.css", "merge.js", "dropbox.js",
    "service-worker.js", "help.html", "help-es.html",
    "docs/install-browser-en.png", "docs/install-browser-es.png",
  ]) {
    const response = await request(releaseUrl(file));
    assert(response.ok && (await response.arrayBuffer()).byteLength > 0, file);
  }
  for (const language of ["en", "es"]) {
    const response = await request(releaseUrl(`locales/${language}.json`));
    assert((await response.json())["backup.everything"]);
    for (const suffix of [`?lang=${language}`, `?lang=${language}&install=1`]) {
      const shell = await request(suffix, "navigate");
      assert((await shell.text()).includes(`src="i18n.js?nrv-release=${version}"`));
    }
  }
  console.log("PASS both languages, installation queries and required app assets work offline");

  const before = writes;
  offline = false;
  await request("app.js?nrv-release=0.9.059");
  await request("app.js");
  assert.strictEqual(writes, before, "ordinary/other-release responses cannot pollute the revision cache");
  for (const file of ["version.json", "version.json?check=unique", "service-worker.js"]) {
    assert.strictEqual(await request(file), undefined, `${file} bypasses the worker cache`);
  }
  assert.strictEqual(await request("https://example.test/site/"), undefined);
  assert(!entries.has(new URL("version.json", base).href));
  console.log("PASS metadata/worker updates bypass caching and unrelated releases and /site stay isolated");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
