// Run with: node tests/startup-handoff.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const bootstrapStart = html.indexOf("window.NRVStartupFallback = (function () {");
const bootstrap = html.slice(bootstrapStart, html.indexOf("</script>", bootstrapStart));
const applicationStart = app.indexOf("const startApplication = async () => {");
const application = app.slice(applicationStart, app.indexOf('\nif (document.readyState === "loading")', applicationStart));
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

function fixture(language = "en") {
  const timers = new Map();
  const listeners = new Map();
  const nodes = new Map();
  let reloads = 0;
  let nextTimer = 0;
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: "", disabled: false,
      getClientRects: () => [{}],
      addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); },
    });
    return nodes.get(id);
  };
  const window = {
    location: { search: `?lang=${language}`, reload() { reloads += 1; } },
    localStorage: {
      getItem: () => null,
      setItem() { throw new Error("The early fallback must not write storage."); },
      clear() { throw new Error("Storage must not be cleared."); },
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
    nrvI18nReady: Promise.resolve(),
    nrvInstallSetupReady: Promise.resolve(),
  };
  const document = {
    documentElement: { classList: { remove() {} } },
    getElementById: element,
  };
  const context = {
    window, document, navigator: { onLine: false },
    console: { error() {} },
    NewerDataVersionError: class extends Error {},
    initializeApp: async () => {},
  };
  vm.createContext(context);
  vm.runInContext(bootstrap, context);
  const fallback = window.NRVStartupFallback;
  return {
    window, document, nodes, element, context, fallback, listeners, timers,
    get reloads() { return reloads; },
    fire(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    code: () => element("startup-recovery-code").textContent,
  };
}
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

async function main() {
  assert(bootstrapStart < html.indexOf('<script src="nrv-dialog.js'));
  assert(html.indexOf("nrv-startup-critical") < html.indexOf('href="styles.css'));
  assert(!html.slice(0, bootstrapStart).includes('rel="stylesheet" href="styles.css"'));
  assert.match(html, /#startup-recovery-screen:not\(\[hidden\]\)[\s\S]*?visibility: visible !important/);
  assert(!bootstrap.includes("?.") && !bootstrap.includes("=>"),
    "the earliest bootstrap uses conservative syntax");
  assert(!html.includes("NRVStartupFallback?.gateFinished()"));
  assert(app.includes("window.NRVStartupFallback?.beginData();"));
  assert(app.includes("window.NRVStartupFallback?.operational(successor);"));

  for (const language of ["en", "es"]) {
    const early = fixture(language);
    early.fire(8000);
    assert(early.code().endsWith("NRV-S01"));
    assert.strictEqual(early.element("startup-recovery-title").textContent,
      catalogs[language]["startup.earlyFailureTitle"]);
    assert(early.element("startup-recovery-message").textContent.includes(
      catalogs[language]["startup.earlyFailureSafety"]));
    assert(early.element("startup-recovery-message").textContent.includes(
      catalogs[language]["startup.earlyFailureAction"]));
    early.fallback.operational(early.element("app-container"));
    assert.strictEqual(early.element("startup-recovery-screen").hidden, false);
    assert.throws(() => early.fallback.beginData(), /blocked/);
    early.fire(10000);
    assert(early.code().endsWith("NRV-S01"), "failure remains latched until deliberate recovery");
    early.listeners.get("startup-recovery-retry:click")({ stopImmediatePropagation() {} });
    assert.strictEqual(early.reloads, 1, "retry genuinely restarts without consulting the latched gate");

    const late = fixture(language);
    late.fallback.beginData();
    late.fire(10000);
    assert(late.code().endsWith("NRV-S02"));
    assert.strictEqual(late.element("startup-recovery-title").textContent,
      catalogs[language]["startup.lateFailureTitle"]);
    assert.strictEqual(late.element("startup-recovery-message").textContent,
      catalogs[language]["startup.lateFailureAction"]);
    assert(!late.element("startup-recovery-message").textContent.includes(
      catalogs[language]["startup.earlyFailureSafety"]));
    assert.strictEqual(late.fallback.operational(late.element("app-container")), false);
    assert.strictEqual(late.element("startup-recovery-screen").hidden, false);
  }
  console.log("PASS exact bilingual S01/S02 conditions, truthful wording and persistent recovery");

  for (const failure of ["script", "exception", "rejection", "handler"]) {
    const test = fixture();
    if (failure === "rejection") test.listeners.get("unhandledrejection")({});
    else test.listeners.get("error")({ target: failure === "script" ? { tagName: "SCRIPT" } : {} });
    assert(test.code().endsWith("NRV-S01"), failure);
  }
  const ignoredMap = fixture();
  ignoredMap.listeners.get("error")({ target: { id: "leaflet-script" } });
  assert(!ignoredMap.fallback.hasFailed(), "optional Leaflet failure is not a startup failure");

  const ready = fixture();
  ready.fallback.beginData();
  assert(ready.timers.size > 0);
  assert(ready.fallback.operational(ready.element("app-container")));
  assert.strictEqual(ready.timers.size, 0);
  assert.strictEqual(ready.element("startup-recovery-screen").hidden, true);
  ready.fire(10000);
  assert(!ready.fallback.hasFailed());
  ready.fallback.resume();
  assert(ready.timers.size > 0, "resuming after an interactive prompt restores the watchdog");
  ready.fallback.beginData();
  ready.fire(10000);
  assert(ready.code().endsWith("NRV-S02"));
  console.log("PASS resource, runtime and binding failures reach fallback; only visible readiness cancels watchdog");

  for (const mode of ["reject", "hang", "success"]) {
    const test = fixture();
    test.context.initializeApp = () => {
      test.fallback.beginData();
      if (mode === "reject") return Promise.reject(new Error("initialization failed"));
      if (mode === "hang") return new Promise(() => {});
      return Promise.resolve();
    };
    vm.runInContext(`${application}\nwindow.applicationStarted = startApplication();`, test.context);
    await settle();
    if (mode === "hang") test.fire(10000);
    if (mode === "success") {
      assert.strictEqual(test.element("startup-recovery-screen").hidden, true);
      assert.strictEqual(test.timers.size, 0);
    } else {
      assert(test.code().endsWith("NRV-S02"), mode);
      assert.strictEqual(test.element("startup-recovery-screen").hidden, false);
    }
  }
  console.log("PASS actual application startup rejects/hangs visibly after script execution and acknowledges success");
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { fixture, bootstrap, main };
