// Run with: node tests/update-prompt.js
// Reproduces the physical-iPad loop where NRV showed the current version yet
// kept offering the same update, and proves the prompt is now gated on the
// generated build revision instead of service-worker object identity.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const swSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

const PAGE_REVISION = `sha256:${"a".repeat(64)}`;
const NEW_REVISION = `sha256:${"b".repeat(64)}`;

// --- The service worker answers revision queries with its build revision. ---
const swListeners = {};
const swContext = {
  self: {
    addEventListener: (type, handler) => { swListeners[type] = handler; },
    registration: { scope: "https://example.test/app/" },
    location: { origin: "https://example.test" },
    skipWaiting() {},
    clients: { claim() {} },
  },
  caches: { open: async () => ({}), keys: async () => [] },
  URL,
  Response: class {},
  fetch: async () => ({}),
};
vm.runInNewContext(swSource, swContext);
assert(typeof swListeners.message === "function", "service worker handles messages");
let swReply = null;
swListeners.message({
  data: { type: "nrv-get-revision" },
  ports: [{ postMessage: (data) => { swReply = data; } }],
});
const swRevision = swSource.match(/^const BUILD_REVISION = "([^"]+)";/m)[1];
assert.strictEqual(swReply.revision, swRevision);
swReply = null;
swListeners.message({ data: { type: "other" }, ports: [{ postMessage: (data) => { swReply = data; } }] });
assert.strictEqual(swReply, null, "unrelated messages are ignored");
console.log("PASS  the service worker reports its generated build revision on request");

// --- Extract the registration bootstrap from index.html. ---
const bootStart = index.lastIndexOf('if ("serviceWorker" in navigator) {');
const bootEnd = index.indexOf("</script>", bootStart);
assert(bootStart >= 0 && bootEnd > bootStart);
const bootstrap = index.slice(bootStart, bootEnd);
assert(!bootstrap.includes("previousWorker"),
  "worker object identity is no longer compared");

const makeWorker = (revision, state = "activated") => ({
  revision,
  state,
  listeners: {},
  addEventListener(type, handler) { this.listeners[type] = handler; },
  postMessage(message, transfer) {
    if (message && message.type === "nrv-get-revision" && transfer?.[0]) {
      const port = transfer[0];
      queueMicrotask(() => port._reply({ revision: this.revision }));
    }
  },
});
const silentWorker = () => {
  const worker = makeWorker(null);
  worker.postMessage = () => {}; // an old worker without the handler
  return worker;
};
const runBootstrap = async (registration) => {
  let loadHandler = null;
  let events = 0;
  const timers = [];
  const bootContext = {
    APP_BUILD_REVISION: PAGE_REVISION,
    navigator: {
      onLine: false,
      serviceWorker: { register: async () => registration },
    },
    document: {
      dispatchEvent: (event) => {
        assert.strictEqual(event.type, "app-update-available");
        events += 1;
      },
    },
    Event: class { constructor(type) { this.type = type; } },
    MessageChannel: class {
      constructor() {
        this.port1 = {};
        this.port2 = { _reply: (data) => this.port1.onmessage?.({ data }) };
      }
    },
    window: {
      addEventListener: (type, handler) => {
        if (type === "load") loadHandler = handler;
      },
      setTimeout: (callback, delay) => { timers.push(callback); return timers.length; },
      clearTimeout: () => {},
    },
    console: { error() {} },
  };
  vm.runInNewContext(bootstrap, bootContext);
  loadHandler();
  // Allow the async registration flow and revision replies to settle.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  return {
    get events() { return events; },
    fireTimeouts: async () => {
      timers.splice(0).forEach((callback) => callback());
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    },
    registration,
  };
};
const registrationWith = (active) => ({
  active,
  installing: null,
  waiting: null,
  listeners: {},
  addEventListener(type, handler) { this.listeners[type] = handler; },
  update: async () => {},
});

async function main() {
  // The exact iPad sequence: the page already runs the active revision, so
  // no prompt may appear no matter how wrapper identities compare.
  let run = await runBootstrap(registrationWith(makeWorker(PAGE_REVISION)));
  assert.strictEqual(run.events, 0, "matching revisions never prompt");

  // Reloading repeatedly still never prompts.
  run = await runBootstrap(registrationWith(makeWorker(PAGE_REVISION)));
  assert.strictEqual(run.events, 0, "the prompt does not return after reload");

  // A genuinely newer build (same displayed version, new revision) prompts once.
  run = await runBootstrap(registrationWith(makeWorker(NEW_REVISION)));
  assert.strictEqual(run.events, 1, "a different active revision prompts once");

  // A new worker that activates after load prompts only for a new revision.
  let registration = registrationWith(makeWorker(PAGE_REVISION));
  let installing = makeWorker(NEW_REVISION, "installing");
  run = await runBootstrap(registration);
  registration.installing = installing;
  registration.listeners.updatefound();
  installing.state = "activated";
  installing.listeners.statechange();
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.strictEqual(run.events, 1, "an update that activates later prompts");

  registration = registrationWith(makeWorker(PAGE_REVISION));
  installing = makeWorker(PAGE_REVISION, "installing");
  run = await runBootstrap(registration);
  registration.installing = installing;
  registration.listeners.updatefound();
  installing.state = "activated";
  installing.listeners.statechange();
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.strictEqual(run.events, 0, "re-activating the same revision stays silent");

  // An old worker that cannot answer is treated as no update (timeout path).
  run = await runBootstrap(registrationWith(silentWorker()));
  await run.fireTimeouts();
  assert.strictEqual(run.events, 0, "a silent worker never loops the prompt");

  // Later only dismisses the session prompt; update state is not corrupted.
  const laterHandler = appSource.match(
    /\.getElementById\("btn-later-app-update"\)\s*\.addEventListener\("click", \(\) => \{\s*appUpdatePromptDismissed = true;/,
  );
  assert(laterHandler, "Later sets only the session dismissal flag");
  assert(appSource.includes('localStorage.removeItem(APP_UPDATE_PENDING_KEY)'),
    "a fresh load clears stale pending state");
  assert(!appSource.includes("appUpdatePromptDismissed = true;\n  try {\n    localStorage"),
    "Later never writes persistent state");
  console.log("PASS  the update prompt appears once per new revision and never loops");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
