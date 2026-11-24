// Run with: node tests/startup-verification.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const revision = `sha256:${"a".repeat(64)}`;
const otherRevision = `sha256:${"b".repeat(64)}`;
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));
const codes = Array.from({ length: 20 }, (_, index) =>
  `NRV-V${String(index + 1).padStart(2, "0")}`,
);

class FakeMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { peer: this.port1, close() {} };
  }
}

const gateSource = () => {
  const script = html.match(/<script id="nrv-build-gate">([\s\S]*?)<\/script>/);
  assert(script, "index.html includes the startup verification gate");
  return script[1]
    .replace("const WORKER_TRANSITION_TIMEOUT_MS = 60000;", "const WORKER_TRANSITION_TIMEOUT_MS = 50;")
    .replace("const WORKER_REPLY_TIMEOUT_MS = 1500;", "const WORKER_REPLY_TIMEOUT_MS = 10;")
    .replace("const FETCH_TIMEOUT_MS = 3000;", "const FETCH_TIMEOUT_MS = 20;")
    .replace("const CACHE_READ_TIMEOUT_MS = 500;", "const CACHE_READ_TIMEOUT_MS = 5;")
    .replace("const UPDATE_TIMEOUT_MS = 5000;", "const UPDATE_TIMEOUT_MS = 20;")
    .replace("              1000,", "              10,")
    .replace(/              7500,/g, "              50,")
    .replace("window.NRVBuildGate.start();", "window.NRVBuildGate.ready = window.NRVBuildGate.start();");
};

const runGate = async (options = {}) => {
  const appVersion = options.appVersion || "0.9.059";
  const pageRevision = options.pageRevision || revision;
  const metadataRevision = options.metadataRevision || revision;
  const appRevision = options.appRevision || revision;
  const workerSourceRevision = options.workerSourceRevision || pageRevision;
  const metadataText = options.metadataText ??
    JSON.stringify({
      version: options.metadataVersion || "0.9.059",
      revision: metadataRevision,
    });
  const bodies = new Map([
    ["/app/version.json", metadataText],
    ["/app/app.js", `const APP_VERSION = "${appVersion}";\nconst APP_BUILD_REVISION = "${appRevision}";`],
    ["/app/service-worker.js", `const BUILD_REVISION = "${workerSourceRevision}";`],
    ["/app/dropbox.js", "window.__dropboxLoaded = true;"],
    ["/app/merge.js", "window.__mergeLoaded = true;"],
  ]);
  const elements = new Map([
    ["startup-recovery-screen", { hidden: false }],
    ["startup-recovery-title", { textContent: "" }],
    ["startup-recovery-message", { textContent: "" }],
    ["startup-recovery-instruction", { textContent: "", hidden: true }],
    ["startup-recovery-code", { textContent: "", hidden: true }],
    ["startup-recovery-read-more", { textContent: "", hidden: true, href: "" }],
    ["startup-recovery-continue", {
      textContent: "",
      hidden: true,
      disabled: false,
      addEventListener(_type, handler) { this.handler = handler; },
    }],
    ["startup-recovery-retry", {
      hidden: true,
      disabled: false,
      addEventListener(_type, handler) { this.handler = handler; },
    }],
  ]);
  const events = [];
  const messages = [];
  let messageText = "";
  Object.defineProperty(elements.get("startup-recovery-message"), "textContent", {
    get: () => messageText,
    set: (value) => { messageText = value; messages.push(value); },
  });
  const appendedScripts = [];
  const sessionValues = new Map(options.sessionValues || []);
  const sessionStorage = {
    getItem: (key) => sessionValues.get(key) || null,
    setItem: (key, value) => sessionValues.set(key, value),
    removeItem: (key) => sessionValues.delete(key),
  };
  const windowListeners = new Map();
  let fallbackFailed = false;
  let languageReady = !options.languageReady;
  const languagePromise = Promise.resolve(options.languageReady).then(() => { languageReady = true; });
  const window = {
    location: {
      search: options.language === "es" ? "?lang=es" : "",
      reload() {
        events.push("reload");
        (windowListeners.get("pagehide") || []).forEach((handler) => handler());
      },
    },
    nrvI18nReady: languagePromise,
    nrvI18nError: options.languageError || null,
    NRVI18n: {
      t: (key, _vars, fallback) =>
        (languageReady && catalogs[options.language || "en"][key]) || fallback,
      async persistPendingLanguagePreference() {
        options.languagePreferenceWrites = (options.languagePreferenceWrites || 0) + 1;
      },
    },
    matchMedia: () => {
      if (options.matchMediaThrows) throw new Error("display mode unavailable");
      return { matches: options.installed === true };
    },
    setTimeout,
    clearTimeout,
    sessionStorage,
    addEventListener(type, handler) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(handler);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, handler) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter((item) => item !== handler));
    },
    NRVStartupFallback: {
      assetUrl: (path) => path,
      isSpanish: () => options.language === "es",
      gateStarted() {},
      resume() {},
      show() {
        fallbackFailed = true;
        elements.get("startup-recovery-code").textContent = "Error code: NRV-S01";
        elements.get("startup-recovery-code").hidden = false;
        elements.get("startup-recovery-screen").hidden = false;
      },
      extend() {},
      disarm() {},
      hasFailed: () => fallbackFailed,
    },
  };
  const activeWorker = {
    state: "activated",
    addEventListener() {},
    postMessage(_message, ports) {
      if (options.activeSendFailure) throw new Error("message rejected");
      if (options.activeNoReply) return;
      setTimeout(() => {
        ports[0].peer.onmessage({
          data: options.activeMalformed
            ? {}
            : { revision: options.activeRevision || revision },
        });
      }, options.workerReplyDelay || 0);
    },
  };
  const controllerWorker = {
    state: "activated",
    addEventListener() {},
    postMessage(_message, ports) {
      if (options.controllerNoReply) return;
      setTimeout(() => {
        ports[0].peer.onmessage({
          data: options.controllerMalformed
            ? {}
            : { revision: options.controllerRevision || revision },
        });
      }, 0);
    },
  };
  const serviceWorkerListeners = new Map();
  const registrationListeners = new Map();
  let updateCount = 0;
  const waitingWorker = options.waitingRevision ? {
    state: "installed",
    addEventListener() {},
    postMessage(_message, ports) {
      setTimeout(() => {
        if (options.activateWhileQueryingWaiting) {
          options.activeRevision = pageRevision;
          options.controllerRevision = pageRevision;
          registration.waiting = null;
        }
        ports[0].peer.onmessage({ data: { revision: options.waitingRevision } });
      }, 0);
    },
  } : null;
  const registration = {
    active: options.noActive ? null : activeWorker,
    installing: null,
    waiting: waitingWorker,
    addEventListener(type, handler) {
      const listeners = registrationListeners.get(type) || [];
      listeners.push(handler);
      registrationListeners.set(type, listeners);
    },
    removeEventListener(type, handler) {
      registrationListeners.set(type, (registrationListeners.get(type) || []).filter((item) => item !== handler));
    },
    async update() {
      events.push("update");
      updateCount += 1;
      if (options.updateReject) throw new Error("update rejected");
      if (options.updateHangs) return new Promise(() => {});
      if (options.delayedActivation &&
          (!options.activationOnAttempt || updateCount === options.activationOnAttempt)) {
        const installing = {
          state: "installing",
          addEventListener(_type, handler) { this.stateHandler = handler; },
        };
        this.installing = installing;
        (registrationListeners.get("updatefound") || []).forEach((handler) => handler());
        setTimeout(() => {
          installing.state = "activated";
          if (options.activationRevision) {
            options.activeRevision = options.activationRevision;
            options.controllerRevision = options.activationRevision;
          }
          this.installing = null;
          this.active = activeWorker;
          navigator.serviceWorker.controller = controllerWorker;
          installing.stateHandler?.();
          (serviceWorkerListeners.get("controllerchange") || []).forEach((handler) => handler());
        }, options.delayedActivation);
      }
      if (options.delayedController) {
        navigator.serviceWorker.controller = null;
        setTimeout(() => {
          navigator.serviceWorker.controller = controllerWorker;
          (serviceWorkerListeners.get("controllerchange") || []).forEach((handler) => handler());
        }, options.delayedController);
      }
    },
  };
  const navigator = {
    onLine: options.online !== false,
    standalone: options.installed === true,
    ...(options.serviceWorkerUnavailable
      ? {}
      : {
        serviceWorker: {
          controller: options.noController ? null : controllerWorker,
          addEventListener(type, handler) {
            const listeners = serviceWorkerListeners.get(type) || [];
            listeners.push(handler);
            serviceWorkerListeners.set(type, listeners);
          },
          removeEventListener(type, handler) {
            serviceWorkerListeners.set(type, (serviceWorkerListeners.get(type) || []).filter((item) => item !== handler));
          },
          async getRegistration() {
            if (options.registrationLookupHangs) return new Promise(() => {});
            return options.noRegistration ? null : registration;
          },
          async register() {
            events.push("register");
            if (options.registrationReject) throw new Error("registration rejected");
            if (options.registrationHangs) return new Promise(() => {});
            return registration;
          },
        },
      }),
  };
  const document = {
    baseURI: "https://example.test/app/",
    documentElement: {
      lang: options.language || "en",
      classList: { remove() {} },
    },
    querySelector: () => ({ content: pageRevision }),
    getElementById: (id) => elements.get(id),
    createElement: () => ({ textContent: "", tagName: "SCRIPT" }),
    body: {
      appendChild(script) {
        assert.strictEqual(elements.get("startup-recovery-screen").hidden, false);
        events.push("launch");
        appendedScripts.push(script.textContent);
      },
    },
  };
  let fetchCount = 0;
  const context = {
    window,
    document,
    navigator,
    MessageChannel: FakeMessageChannel,
    URL,
    URLSearchParams,
    AbortController,
    Date,
    caches: options.localCache
      ? {
        async match(request) {
          if (options.cacheLookupHangs) return new Promise(() => {});
          const body = bodies.get(new URL(request).pathname);
          return body === undefined ? undefined : { ok: true, text: async () => body };
        },
      }
      : undefined,
    Promise,
    Set,
    Error,
    console: { error() {} },
    fetch: async (input) => {
      fetchCount += 1;
      const requestUrl = new URL(input);
      events.push(`fetch:${requestUrl.pathname}`);
      if (requestUrl.pathname === options.fetchFailurePath) throw new Error("network unavailable");
      if (requestUrl.pathname === options.fetchTimeoutPath) return new Promise(() => {});
      const status = requestUrl.pathname === options.httpFailurePath ? 503 : 200;
      return {
        ok: status === 200,
        status,
        text: async () => {
          if (requestUrl.pathname === options.textFailurePath) throw new Error("response body unavailable");
          if (requestUrl.pathname === options.nonTextPath) return null;
          return bodies.get(requestUrl.pathname);
        },
      };
    },
  };
  vm.runInNewContext(gateSource(), context);
  const startedAt = Date.now();
  await window.NRVBuildGate.ready;
  const codeText = elements.get("startup-recovery-code").textContent;
  return {
    appendedScripts,
    elements,
    events,
    messages,
    fetchCount,
    sessionValues,
    window,
    resolveWorkerMismatch() {
      options.activeRevision = pageRevision;
      options.controllerRevision = pageRevision;
    },
    duration: Date.now() - startedAt,
    languagePreferenceWrites: options.languagePreferenceWrites || 0,
    code: codeText.split(": ").at(-1),
  };
};

const expectFailure = async (code, options = {}, retryable = true) => {
  const result = await runGate(options);
  assert.strictEqual(result.appendedScripts.length, 0, `${code} must keep app startup blocked`);
  assert.strictEqual(result.code, code);
  assert.strictEqual(result.elements.get("startup-recovery-code").hidden, false);
  assert.strictEqual(result.elements.get("startup-recovery-retry").hidden, !retryable);
  assert.strictEqual(result.elements.get("startup-recovery-continue").hidden, true);
  await result.elements.get("startup-recovery-continue").handler();
  assert.strictEqual(result.appendedScripts.length, 0, `${code} cannot be bypassed by OK`);
  assert.strictEqual(
    result.elements.get("startup-recovery-message").textContent,
    catalogs[options.language || "en"][`startup.verify.${code}`],
  );
  assert.strictEqual(result.languagePreferenceWrites, 0, "language preference waits for successful verification");
  return result;
};

async function main() {
  const source = gateSource();
  for (const code of codes) assert(source.includes(`"${code}"`), `gate keeps ${code} assigned`);
  const unsupportedInstalled = await expectFailure("NRV-V01", {
    installed: true,
    serviceWorkerUnavailable: true,
  }, false);
  assert.strictEqual(unsupportedInstalled.fetchCount, 0);
  const browserWithoutWorker = await runGate({ serviceWorkerUnavailable: true });
  assert.strictEqual(browserWithoutWorker.appendedScripts.length, 3);
  console.log("PASS installed apps require Service Worker support; browser mode verifies assets directly");

  const delayedUpdate = await runGate({
    updateHangs: true,
    localCache: true,
  });
  assert.strictEqual(delayedUpdate.appendedScripts.length, 0);
  assert.strictEqual(delayedUpdate.elements.get("startup-recovery-message").textContent,
    catalogs.en["startup.updateUnavailable"]);
  await delayedUpdate.elements.get("startup-recovery-continue").handler();
  assert.strictEqual(delayedUpdate.appendedScripts.length, 3);
  assert(delayedUpdate.duration < 1000, "a stalled check reaches the bounded safe continuation");
  assert(delayedUpdate.events.includes("register") && delayedUpdate.events.includes("update"));
  const pendingLanguage = await runGate({
    localCache: true,
    languageReady: new Promise(() => {}),
  });
  assert.strictEqual(pendingLanguage.appendedScripts.length, 0);
  assert.strictEqual(pendingLanguage.code, "NRV-S01");
  const updateReject = await runGate({ registrationReject: true, localCache: true });
  assert.strictEqual(updateReject.appendedScripts.length, 0);
  assert.strictEqual(updateReject.elements.get("startup-recovery-continue").textContent, catalogs.en["common.ok"]);
  assert.strictEqual(updateReject.elements.get("startup-recovery-retry").textContent, catalogs.en["startup.retry"]);
  assert.strictEqual(
    updateReject.elements.get("startup-recovery-message").textContent,
    catalogs.en["startup.updateUnavailable"],
  );
  await updateReject.elements.get("startup-recovery-continue").handler();
  assert.strictEqual(updateReject.appendedScripts.length, 3);
  const spanishUpdateFailure = await runGate({
    registrationReject: true,
    localCache: true,
    language: "es",
  });
  assert.strictEqual(
    spanishUpdateFailure.elements.get("startup-recovery-message").textContent,
    catalogs.es["startup.updateUnavailable"],
  );
  assert.strictEqual(spanishUpdateFailure.elements.get("startup-recovery-code").hidden, true);
  assert.strictEqual(spanishUpdateFailure.elements.get("startup-recovery-continue").textContent, catalogs.es["common.ok"]);
  const metadataUnavailable = await runGate({ metadataText: "not JSON", localCache: true });
  assert.strictEqual(metadataUnavailable.elements.get("startup-recovery-code").hidden, true);
  assert.strictEqual(
    metadataUnavailable.elements.get("startup-recovery-message").textContent,
    catalogs.en["startup.updateUnavailable"],
  );
  console.log("PASS completed online failures offer verified safe continuation");

  const normal = await runGate({ localCache: true });
  assert(normal.events.indexOf("update") < normal.events.indexOf("launch"));
  assert.strictEqual(normal.appendedScripts.length, 3);
  assert.strictEqual(normal.elements.get("startup-recovery-code").hidden, true);

  const slower = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    delayedActivation: 35,
    activationRevision: revision,
  });
  assert(slower.messages.includes("Checking for updates…"));
  assert(slower.messages.includes("Please wait just a little longer…"));
  assert.strictEqual(slower.appendedScripts.length, 3);
  assert.strictEqual(slower.elements.get("startup-recovery-code").hidden, true);
  assert(!slower.events.includes("reload"), "the older worker must not be reloaded into");

  const automaticRetry = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    delayedActivation: 10,
    activationOnAttempt: 2,
    activationRevision: revision,
  });
  assert.strictEqual(automaticRetry.events.filter((event) => event === "update").length, 2);
  assert.strictEqual(automaticRetry.appendedScripts.length, 3);
  assert.strictEqual(automaticRetry.elements.get("startup-recovery-code").hidden, true);
  assert(!automaticRetry.events.includes("reload"));
  console.log("PASS automatic startup waits for a slower update and retries an older worker without V12");

  for (const [marker, expectedMarker] of [
    [null, revision],
    [revision, `${revision}:waiting`],
  ]) {
    const waiting = await runGate({
      activeRevision: otherRevision,
      controllerRevision: otherRevision,
      waitingRevision: revision,
      sessionValues: marker ? [["nrv-startup-reload-target", marker]] : [],
    });
    assert.strictEqual(waiting.events.filter((event) => event === "reload").length, 1);
    assert.strictEqual(waiting.sessionValues.get("nrv-startup-reload-target"), expectedMarker);
    assert.strictEqual(waiting.appendedScripts.length, 0);
    assert.strictEqual(waiting.elements.get("startup-recovery-code").hidden, true);
  }
  const stuckWaiting = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    waitingRevision: revision,
    sessionValues: [["nrv-startup-reload-target", `${revision}:waiting`]],
  });
  assert.strictEqual(stuckWaiting.code, "NRV-V12");
  assert(!stuckWaiting.events.includes("reload"), "waiting-worker recovery must not reload indefinitely");
  assert.strictEqual(stuckWaiting.appendedScripts.length, 0, "an unresolved worker cannot open saved information");
  const activationDuringQuery = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    waitingRevision: revision,
    activateWhileQueryingWaiting: true,
  });
  assert.strictEqual(activationDuringQuery.appendedScripts.length, 3,
    "activation while querying a waiting worker must be rechecked");
  assert.strictEqual(activationDuringQuery.elements.get("startup-recovery-code").hidden, true);
  const unexpectedWaiting = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    waitingRevision: otherRevision,
  });
  assert.strictEqual(unexpectedWaiting.code, "NRV-V12");
  assert(!unexpectedWaiting.events.includes("reload"), "a worker that differs from deployment metadata is not trusted");
  console.log("PASS a verified waiting worker gets bounded handoff attempts before V12");

  const delayedActivation = await runGate({
    noActive: true,
    noController: true,
    delayedActivation: 10,
  });
  assert.strictEqual(delayedActivation.appendedScripts.length, 3);
  const delayedController = await runGate({
    noController: true,
    delayedController: 10,
  });
  assert.strictEqual(delayedController.appendedScripts.length, 3);
  const delayedUpdateActivation = await runGate({
    noActive: true,
    noController: true,
    delayedActivation: 10,
    metadataRevision: otherRevision,
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
  });
  assert.strictEqual(delayedUpdateActivation.events.filter((event) => event === "reload").length, 1);
  assert.strictEqual(delayedUpdateActivation.appendedScripts.length, 0);
  console.log("PASS actual worker activation and controller transitions finish before app launch");

  const newWorker = await runGate({
    metadataRevision: otherRevision,
    appRevision: otherRevision,
    workerSourceRevision: otherRevision,
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
  });
  assert.strictEqual(newWorker.events.filter((event) => event === "reload").length, 1);
  assert.strictEqual(newWorker.appendedScripts.length, 0);
  assert.strictEqual(newWorker.sessionValues.get("nrv-startup-reload-target"), otherRevision);
  assert.strictEqual(newWorker.elements.get("startup-recovery-code").hidden, true);
  const reloadLoop = await runGate({
    metadataRevision: otherRevision,
    appRevision: otherRevision,
    workerSourceRevision: otherRevision,
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    sessionValues: [["nrv-startup-reload-target", otherRevision]],
  });
  assert.strictEqual(reloadLoop.events.filter((event) => event === "reload").length, 0);
  assert.strictEqual(reloadLoop.code, "NRV-V12");
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-title").textContent,
    "NRV is keeping your information safe");
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-message").textContent,
    "NRV could not open safely.");
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-instruction").textContent,
    "Please select Check for Updates.");
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-instruction").hidden, false);
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-retry").textContent, "Check for Updates");
  assert.strictEqual(reloadLoop.elements.get("startup-recovery-retry").className, "nrv-v12-retry");
  assert(html.indexOf('id="startup-recovery-message"') < html.indexOf('id="startup-recovery-instruction"'));
  assert(html.indexOf('id="startup-recovery-instruction"') < html.indexOf('id="startup-recovery-retry"'));
  assert(html.indexOf('id="startup-recovery-retry"') < html.indexOf('id="startup-recovery-code"'));
  assert(html.indexOf('id="startup-recovery-code"') < html.indexOf('id="startup-recovery-read-more"'));
  const spanishV12 = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    language: "es",
  });
  assert.strictEqual(spanishV12.elements.get("startup-recovery-message").textContent,
    catalogs.es["startup.verify.NRV-V12"]);
  assert.strictEqual(spanishV12.elements.get("startup-recovery-instruction").textContent,
    catalogs.es["startup.instructionV12"]);
  assert(spanishV12.elements.get("startup-recovery-read-more").href.startsWith("./help-es.html"));
  const updatesBeforeFailedRetry = reloadLoop.events.filter((event) => event === "update").length;
  await reloadLoop.elements.get("startup-recovery-retry").handler();
  assert.strictEqual(reloadLoop.events.filter((event) => event === "update").length,
    updatesBeforeFailedRetry + 1, "V12 retry checks again before reopening");
  assert.strictEqual(reloadLoop.events.filter((event) => event === "reload").length, 1,
    "a deliberate retry permits another guarded reload into the verified update");
  assert.strictEqual(reloadLoop.appendedScripts.length, 0,
    "the retry cannot open an unresolved mismatch");

  const recoveredV12 = await runGate({
    activeRevision: otherRevision,
    controllerRevision: otherRevision,
    sessionValues: [["nrv-startup-reload-target", otherRevision]],
  });
  assert.strictEqual(recoveredV12.code, "NRV-V12");
  const updatesBeforeRecovery = recoveredV12.events.filter((event) => event === "update").length;
  recoveredV12.resolveWorkerMismatch();
  await recoveredV12.elements.get("startup-recovery-retry").handler();
  assert.strictEqual(recoveredV12.events.filter((event) => event === "update").length,
    updatesBeforeRecovery + 1, "V12 recovery action checks for updates before re-verifying");
  assert.strictEqual(recoveredV12.appendedScripts.length, 3,
    "resolved V12 proceeds through normal verification and app startup");
  console.log("PASS updated worker causes one controlled reload and the marker prevents loops");

  await expectFailure("NRV-V02", {
    registrationReject: true,
    noActive: true,
    noController: true,
    installed: true,
  });
  await expectFailure("NRV-V03", {
    updateReject: true,
    noActive: true,
    noController: true,
    installed: true,
  });
  await expectFailure("NRV-V16", {
    registrationHangs: true,
    noActive: true,
    noController: true,
    installed: true,
  });
  await expectFailure("NRV-V17", {
    updateHangs: true,
    noActive: true,
    noController: true,
    installed: true,
  });
  await expectFailure("NRV-V04", { noActive: true, noController: true, installed: true });
  await expectFailure("NRV-V05", { noController: true, installed: true });
  await expectFailure("NRV-V06", { activeNoReply: true });
  await expectFailure("NRV-V07", { activeMalformed: true });
  await expectFailure("NRV-V18", { activeSendFailure: true });
  console.log("PASS worker setup, activation, controller, query, rejection, and timeout failures have their assigned codes");

  await expectFailure("NRV-V08", { fetchFailurePath: "/app/app.js" });
  await expectFailure("NRV-V08", { httpFailurePath: "/app/app.js" });
  await expectFailure("NRV-V19", { textFailurePath: "/app/app.js" });
  await expectFailure("NRV-V19", { nonTextPath: "/app/app.js" });
  await expectFailure("NRV-V20", { fetchTimeoutPath: "/app/app.js" });
  for (const options of [
    { fetchFailurePath: "/app/app.js" },
    { httpFailurePath: "/app/app.js" },
    { fetchTimeoutPath: "/app/app.js" },
  ]) {
    const cached = await runGate({ ...options, localCache: true });
    assert.strictEqual(cached.appendedScripts.length, 3);
  }
  await expectFailure("NRV-V09", { appVersion: "invalid" });
  await expectFailure("NRV-V09", { appRevision: "invalid" });
  await expectFailure("NRV-V09", { pageRevision: "invalid" });
  await expectFailure("NRV-V10", {
    metadataRevision: otherRevision,
    activeRevision: revision,
    controllerRevision: revision,
  });
  await expectFailure("NRV-V11", { appRevision: otherRevision });
  await expectFailure("NRV-V11", { workerSourceRevision: otherRevision });
  await expectFailure("NRV-V12", { activeRevision: otherRevision });
  await expectFailure("NRV-V13", { controllerRevision: otherRevision });
  await expectFailure("NRV-V14", { metadataVersion: "0.9.058" });
  await expectFailure("NRV-V15", {
    matchMediaThrows: true,
    serviceWorkerUnavailable: true,
  });
  const spanishUnexpected = await expectFailure("NRV-V15", {
    matchMediaThrows: true,
    language: "es",
    languageError: new Error("Spanish catalog unavailable"),
    serviceWorkerUnavailable: true,
  });
  assert.strictEqual(
    spanishUnexpected.elements.get("startup-recovery-message").textContent,
    catalogs.es["startup.verify.NRV-V15"],
  );
  console.log("PASS asset, metadata, worker, and unexpected failures map to the specified NRV-V codes");

  const offline = await runGate({ online: false, localCache: true });
  assert.strictEqual(offline.fetchCount, 0, "offline startup does not attempt network requests");
  assert.strictEqual(offline.appendedScripts.length, 0);
  assert.strictEqual(offline.elements.get("startup-recovery-code").hidden, true);
  assert.strictEqual(offline.elements.get("startup-recovery-continue").hidden, false);
  assert.strictEqual(offline.elements.get("startup-recovery-message").textContent, catalogs.en["startup.offlineReady"]);
  await offline.elements.get("startup-recovery-continue").handler();
  assert.strictEqual(offline.appendedScripts.length, 3);
  const offlineWithoutLanguageCatalog = await runGate({
    online: false,
    localCache: true,
    languageError: new Error("catalog unavailable"),
  });
  assert.strictEqual(offlineWithoutLanguageCatalog.elements.get("startup-recovery-code").hidden, true);
  assert.strictEqual(offlineWithoutLanguageCatalog.elements.get("startup-recovery-continue").hidden, false);
  await offlineWithoutLanguageCatalog.elements.get("startup-recovery-continue").handler();
  assert.strictEqual(offlineWithoutLanguageCatalog.appendedScripts.length, 0);
  assert.strictEqual(offlineWithoutLanguageCatalog.elements.get("startup-recovery-code").textContent,
    "Error code: NRV-S01");
  await expectFailure("NRV-V11", {
    online: false,
    localCache: true,
    appRevision: otherRevision,
  });
  const spanishFailure = await expectFailure("NRV-V02", {
    registrationReject: true,
    noActive: true,
    noController: true,
    installed: true,
    language: "es",
  });
  assert.strictEqual(
    spanishFailure.elements.get("startup-recovery-code").textContent,
    "Código de error: NRV-V02",
  );
  const spanishOffline = await runGate({ online: false, localCache: true, language: "es" });
  assert.strictEqual(spanishOffline.elements.get("startup-recovery-message").textContent, catalogs.es["startup.offlineReady"]);
  assert.strictEqual(
    spanishOffline.elements.get("startup-recovery-continue").textContent,
    catalogs.es["common.ok"],
  );
  const delayedSpanishOffline = await runGate({
    online: false,
    localCache: true,
    language: "es",
    languageReady: new Promise((resolve) => setTimeout(resolve, 30)),
  });
  assert.strictEqual(
    delayedSpanishOffline.elements.get("startup-recovery-continue").textContent,
    catalogs.es["common.ok"],
    "offline continuation must wait for the selected language before showing its label",
  );
  for (const language of ["en", "es"]) {
    for (const code of codes) assert(catalogs[language][`startup.verify.${code}`]);
    assert(catalogs[language]["startup.errorCode"]);
  }
  console.log("PASS offline continuation requires valid local checks; offline and diagnostic wording is bilingual");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
