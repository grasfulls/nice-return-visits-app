// Run with: node tests/service-worker-chromium.js (CHROME_PATH may select standard Chromium).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "version.json")));
const chrome = process.env.CHROME_PATH || [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
].find(file => file && fs.existsSync(file));
assert(chrome, "Set CHROME_PATH to a standard Chromium executable; Electron is not supported");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nrv-worker-test-"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const requests = [];
const events = [];
let browser, socket, nextId = 0;
const pending = new Map();
const types = {
  ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".html": "text/html",
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const record = { url: request.url, start: Date.now(), worker: request.headers["service-worker"] };
  requests.push(record);
  response.on("finish", () => { record.finished = Date.now(); });
  let bytes, type;
  if (url.pathname === "/control.html") {
    bytes = Buffer.from("<!doctype html><title>Worker control</title>");
    type = "text/html";
  } else if (url.pathname === "/control/worker.js") {
    bytes = Buffer.from('self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));');
    type = "application/javascript";
  } else {
    if (!url.pathname.startsWith("/app/")) { response.writeHead(404).end(); return; }
    const file = url.pathname.slice(5) || "index.html";
    const fullPath = path.resolve(root, file);
    if (!fullPath.startsWith(root + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      response.writeHead(404).end(); return;
    }
    bytes = fs.readFileSync(fullPath);
    type = types[path.extname(file)] || "application/octet-stream";
  }
  record.bytes = bytes.length;
  response.writeHead(200, {
    "Content-Type": type, "Content-Length": bytes.length,
    "Cache-Control": "no-store", "X-NRV-Release": metadata.version,
  });
  response.end(bytes);
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline: ${method}`)); }, 25000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function navigate(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 100; i++) {
    await delay(100);
    const ready = await evaluate(`location.href===${JSON.stringify(url)} && document.readyState!=="loading"`);
    if (ready) return;
  }
  throw new Error("Page navigation did not finish");
}
async function waitFor(expression, description) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(description);
}
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.strictEqual((await fetch(origin + "/control.html")).status, 200);
  browser = spawn(chrome, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { stdio: "ignore" });
  let launchError;
  browser.on("error", error => { launchError = error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile) && !launchError; i++) await delay(100);
  if (launchError) throw launchError;
  assert(fs.existsSync(portFile), "Chromium did not expose its isolated debugging endpoint");
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
    } else if (message.method === "Target.attachedToTarget") {
      send("Network.enable", {}, message.params.sessionId).catch(error => events.push({ error: error.message }));
    } else events.push(message);
  });
  const identity = await send("Browser.getVersion");
  assert(/^(Chrome|HeadlessChrome|Edg)\//.test(identity.product), identity.product);
  console.log(`Standard Chromium: ${identity.product}`);
  await send("Page.enable"); await send("Runtime.enable"); await send("ServiceWorker.enable");
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await navigate(origin + "/control.html");
  assert.deepStrictEqual(await evaluate(`(async()=>({registrations:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys()}))()`),
    { registrations: 0, caches: [] });
  await evaluate(`navigator.serviceWorker.register("/control/worker.js").then(()=>true)`);
  await waitFor(`navigator.serviceWorker.getRegistration("/control/").then(r=>r?.active?.state==="activated")`, "Independent control did not activate");
  console.log("PASS independent minimal Service Worker control");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: 'Object.defineProperty(navigator,"standalone",{value:true});',
  });
  await navigate(origin + "/app/");
  await waitFor(`!document.getElementById("startup-recovery-screen").hidden ? false : !document.getElementById("unlock-screen").hidden`,
    "NRV did not reach its operational agreement screen");
  await delay(11000);
  assert(await evaluate(`document.getElementById("startup-recovery-screen").hidden && !window.NRVStartupFallback.hasFailed()`),
    "Operational readiness must cancel the watchdog");
  assert.strictEqual(await evaluate(`document.querySelector('meta[name="nrv-build-revision"]').content`), metadata.revision);
  const worker = await evaluate(`navigator.serviceWorker.getRegistration("/app/").then(r=>({state:r.active?.state,url:r.active?.scriptURL,controller:navigator.serviceWorker.controller?.scriptURL}))`);
  assert.strictEqual(worker.state, "activated");
  assert.strictEqual(worker.controller, origin + "/app/service-worker.js");
  assert(requests.some(r => r.url === "/app/service-worker.js" && r.worker === "script"));
  const shell = JSON.parse(fs.readFileSync(path.join(root, "service-worker.js"), "utf8")
    .match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const cached = await evaluate(`(async()=>{
    const cache=await caches.open(${JSON.stringify("return-visits-shell-" + metadata.revision.slice(7))});
    const rows=[];
    for(const request of await cache.keys()){
      const response=await cache.match(request);
      rows.push({url:request.url,bytes:Array.from(new Uint8Array(await response.arrayBuffer()))});
    }
    return rows;
  })()`);
  assert.strictEqual(cached.length, shell.length);
  for (const file of shell) {
    const url = new URL(file, origin + "/app/");
    url.searchParams.set("nrv-release", metadata.version);
    const entry = cached.find(row => row.url === url.href);
    assert(entry, `Required cache resource absent: ${file}`);
    const local = fs.readFileSync(path.join(root, url.pathname.slice(5) || "index.html"));
    assert(Buffer.from(entry.bytes).equals(local), `Wrong cached bytes: ${file}`);
    assert(requests.some(r => r.url === url.pathname + url.search && r.finished - r.start < 3000),
      `Fixture did not complete resource under existing deadline: ${file}`);
  }
  const starts = new Map();
  let completed = 0, maxMs = 0;
  for (const event of events) {
    const p = event.params || {};
    const key = event.sessionId + ":" + p.requestId;
    if (event.method === "Network.requestWillBeSent" && p.request.url.startsWith(origin + "/app/")) starts.set(key, p.timestamp);
    if (event.method === "Network.loadingFinished" && starts.has(key)) {
      const ms = (p.timestamp - starts.get(key)) * 1000;
      assert(ms < 3000, `Browser precache completion exceeded deadline: ${ms}ms`);
      completed += 1; maxMs = Math.max(maxMs, ms);
    }
    assert(event.method !== "ServiceWorker.workerErrorReported", JSON.stringify(event));
    assert(event.method !== "Network.loadingFailed" || !starts.has(key), JSON.stringify(event));
  }
  assert(completed >= shell.length, "Missing browser completion evidence for precache resources");
  console.log(`PASS ${shell.length} exact release-qualified cache entries; browser completion maximum ${maxMs.toFixed(1)}ms`);
  console.log("PASS NRV worker installed/activated and normal startup reached the visible operational agreement");
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  assert(await evaluate(`(async()=>{
    for(const file of ["app.js","locales/en.json","locales/es.json"]){
      const response=await fetch("./"+file+"?nrv-release=${metadata.version}");
      if(!response.ok || !(await response.arrayBuffer()).byteLength)return false;
    }
    return true;
  })()`), "Required cached resources must remain available offline");
  console.log("PASS controlled offline application and bilingual catalogs remain available");
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) {
    await send("Browser.close").catch(() => {});
    await delay(500); socket.close();
  }
  if (browser && browser.exitCode === null) browser.kill();
  server.closeAllConnections(); server.close();
  for (const item of pending.values()) clearTimeout(item.timer);
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(profile, { recursive: true }); break; }
    catch (error) {
      if (i === 19) { console.error(`Unable to remove isolated test profile ${profile}: ${error.message}`); process.exitCode = 1; }
      await delay(200);
    }
  }
});
