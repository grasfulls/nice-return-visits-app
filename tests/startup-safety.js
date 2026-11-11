// Run with: node tests/startup-safety.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const revision = `sha256:${"a".repeat(64)}`;
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

const initStart = app.indexOf("const initializeAppData = async () => {");
const initEnd = app.indexOf("const showStorageError =", initStart);
assert(initStart >= 0 && initEnd > initStart);
const initSource = app.slice(initStart, initEnd);

const runInitializeAppData = async ({
  settings,
  contacts,
  metadata = null,
  language = "en",
}) => {
  const values = new Map([
    ["settings", settings],
    ["contacts", contacts],
    ...(metadata ? [["encryption-meta", metadata]] : []),
    ["backup-export", { savedAt: "2026-11-10", checksum: "preserve-me" }],
  ]);
  const writes = [];
  const removedLocalKeys = [];
  let promptCalls = 0;
  let submitHandler;
  let resolvePassphrase = async (value) => {
    if (value !== "correct passphrase") throw new Error("incorrect");
    return value;
  };
  const prompt = {
    screen: {},
    passphraseInput: { value: "wrong passphrase", focus() {}, select() {} },
    confirmInput: { value: "" },
    submitButton: { disabled: false },
    errorMessage: { textContent: "" },
  };
  const unlockForm = {
    addEventListener(_type, handler) {
      submitHandler = handler;
    },
  };
  const nodes = new Map([
    ["unlock-screen", { hidden: false }],
    ["unlock-form", unlockForm],
    ["initial-backup-file-input", { files: [], addEventListener() {} }],
    ["btn-initial-restore", { addEventListener() {} }],
  ]);
  class NewerDataVersionError extends Error {
    constructor() {
      super("Unsupported newer schema.");
      this.name = "NewerDataVersionError";
    }
  }
  const database = {};
  const context = {
    DEFAULT_SETTINGS: { schemaVersion: 10, cities: [], areas: [] },
    SCHEMA_VERSION: 10,
    ENCRYPTION_META_KEY: "encryption-meta",
    INSTALLED_SETUP_COMPLETE_KEY: "installed-setup",
    isSupportedEncryptionMetadata: (value) =>
      value?.version === 1 &&
      value.algorithm === "AES-GCM" &&
      value.keyDerivation === "PBKDF2-SHA-256" &&
      Number.isInteger(value.iterations) &&
      value.salt === "valid",
    NewerDataVersionError,
    openAppDatabase: async () => database,
    readStoredKeys: async () => [...values.keys()],
    readStoredValue: async (_database, key) => values.get(key),
    writeStoredValues: async (_database, entries) => {
      writes.push(entries);
      entries.forEach(([key, value]) => values.set(key, value));
    },
    normalizeRegionData(sourceSettings, sourceContacts) {
      if ((Number(sourceSettings.schemaVersion) || 1) > 10) {
        throw new NewerDataVersionError();
      }
      return {
        settings: { ...sourceSettings, schemaVersion: 10 },
        contacts: sourceContacts,
      };
    },
    parseLegacyValue: () => undefined,
    createUnlockPrompt(hasEncryption) {
      promptCalls += 1;
      assert.strictEqual(hasEncryption, true);
      return prompt;
    },
    dismissUnlockScreen() {},
    resolvePassphrase: (...args) => resolvePassphrase(...args),
    deriveEncryptionKey: async () => "key",
    decryptValue: async (value) => value.plaintext,
    encryptValue: async (value) => value,
    appText: (_key, fallback) => fallback,
    localStorage: {
      getItem: () => null,
      removeItem: (key) => removedLocalKeys.push(key),
    },
    document: { getElementById: (id) => nodes.get(id) },
    console: { error() {} },
    Promise,
    JSON,
    Number,
    Array,
  };
  vm.runInNewContext(`${initSource}\nthis.initializeAppData = initializeAppData;`, context);
  const pending = context.initializeAppData();
  return {
    values,
    writes,
    removedLocalKeys,
    get promptCalls() { return promptCalls; },
    get submitHandler() { return submitHandler; },
    prompt,
    set resolvePassphrase(handler) { resolvePassphrase = handler; },
    pending,
  };
};

class FakeMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { peer: this.port1 };
  }
}

const extractGate = () => {
  const script = html.match(/<script id="nrv-build-gate">([\s\S]*?)<\/script>/);
  assert(script, "index.html includes the pre-initialization build gate");
  return script[1]
    .replace("const WORKER_TRANSITION_TIMEOUT_MS = 60000;", "const WORKER_TRANSITION_TIMEOUT_MS = 10;")
    .replace("const WORKER_REPLY_TIMEOUT_MS = 3000;", "const WORKER_REPLY_TIMEOUT_MS = 5;")
    .replace("window.setTimeout(resolve, 250)", "window.setTimeout(resolve, 1)")
    .replace(
      "window.NRVBuildGate.start();",
      "window.NRVBuildGate.ready = window.NRVBuildGate.start();",
    );
};

const runBuildGate = async ({
  pageRevision = revision,
  appRevision = revision,
  workerSourceRevision = revision,
  metadataRevision = revision,
  workerRevision = revision,
  reloadTarget = null,
  url = "https://example.test/app/",
  language = "en",
}) => {
  const appSource =
    `const APP_VERSION = "0.9.059";\nconst APP_BUILD_REVISION = "${appRevision}";`;
  const workerSource = `const BUILD_REVISION = "${workerSourceRevision}";`;
  const dropboxSource = "window.__dropboxLoaded = true;";
  const mergeSource = "window.__mergeLoaded = true;";
  const metadata = JSON.stringify({
    version: "0.9.059",
    revision: metadataRevision,
  });
  const appendedScripts = [];
  const replacedUrls = [];
  let reloads = 0;
  let languagePreferenceWrites = 0;
  const sessionValues = new Map(
    reloadTarget ? [["nrv-startup-reload-target", reloadTarget]] : [],
  );
  const windowListeners = new Map();
  const elements = new Map([
    ["startup-recovery-screen", { hidden: false }],
    ["startup-recovery-title", { textContent: "" }],
    ["startup-recovery-message", { textContent: "" }],
    ["startup-recovery-code", { textContent: "", hidden: true }],
    ["startup-recovery-continue", {
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
  const activeWorker = {
    state: "activated",
    postMessage(_message, ports) {
      setTimeout(() => {
        ports[0].peer.onmessage({ data: { revision: workerRevision } });
      }, 0);
    },
  };
  const registration = {
    active: activeWorker,
    async update() {},
  };
  const serviceWorker = {
    controller: activeWorker,
    async register() { return registration; },
  };
  const window = {
    nrvI18nReady: Promise.resolve(),
    NRVI18n: {
      t: (key, _vars, fallback) => catalogs[language][key] || fallback,
      async persistPendingLanguagePreference() { languagePreferenceWrites += 1; },
    },
    location: {
      href: url,
      search: new URL(url).search,
      replace(value) { replacedUrls.push(value); },
      reload() {
        reloads += 1;
        (windowListeners.get("pagehide") || []).forEach((handler) => handler());
      },
    },
    history: { replaceState() {} },
    setTimeout,
    clearTimeout,
    addEventListener(type, handler) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(handler);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, handler) {
      windowListeners.set(
        type,
        (windowListeners.get(type) || []).filter((item) => item !== handler),
      );
    },
    sessionStorage: {
      getItem: (key) => sessionValues.get(key) || null,
      setItem: (key, value) => sessionValues.set(key, value),
      removeItem: (key) => sessionValues.delete(key),
    },
  };
  const document = {
    baseURI: "https://example.test/app/",
    documentElement: { lang: language, classList: { remove() {} } },
    querySelector: () => ({ content: pageRevision }),
    getElementById: (id) => elements.get(id),
    createElement: () => ({ textContent: "" }),
    body: {
      appendChild(script) { appendedScripts.push(script.textContent); },
    },
  };
  const context = {
    window,
    document,
    navigator: { onLine: true, serviceWorker },
    MessageChannel: FakeMessageChannel,
    URL,
    URLSearchParams,
    Date,
    Promise,
    console: { error() {} },
    fetch: async (input) => {
      const requestUrl = new URL(input);
      const body = requestUrl.pathname.endsWith("/version.json")
        ? metadata
        : requestUrl.pathname.endsWith("/app.js")
          ? appSource
          : requestUrl.pathname.endsWith("/service-worker.js")
            ? workerSource
            : requestUrl.pathname.endsWith("/dropbox.js")
              ? dropboxSource
              : mergeSource;
      return { ok: true, status: 200, text: async () => body };
    },
  };
  vm.runInNewContext(extractGate(), context);
  await window.NRVBuildGate.ready;
  return {
    appendedScripts,
    replacedUrls,
    elements,
    window,
    sessionValues,
    get reloads() { return reloads; },
    get languagePreferenceWrites() { return languagePreferenceWrites; },
  };
};

async function main() {
  const settings = {
    schemaVersion: 10,
    country: "Peru",
    cities: [{ name: "Lima", country: "Peru" }],
    regions: [{ name: "North", country: "Peru" }],
    areas: [{ name: "Central", country: "Peru" }],
    goalsAndMilestones: { goals: [{ id: "goal-1", items: [{ completed: true }] }] },
    visits: [{ date: "2026-11-09", note: "Keep unchanged" }],
  };
  const contacts = [{
    id: 17,
    firstName: "Ana",
    visits: [{ date: "2026-11-09", note: "Keep this visit" }],
  }];
  const noPassphrase = await runInitializeAppData({
    settings: structuredClone(settings),
    contacts: structuredClone(contacts),
  });
  const opened = await noPassphrase.pending;
  assert.strictEqual(opened.encryptionKey, null);
  assert.strictEqual(opened.metadata, null);
  assert.strictEqual(opened.settings.schemaVersion, 10);
  assert.deepStrictEqual(noPassphrase.writes, []);
  assert.strictEqual(noPassphrase.promptCalls, 0);
  assert.deepStrictEqual(noPassphrase.removedLocalKeys, []);
  assert.deepStrictEqual(noPassphrase.values.get("settings"), settings);
  assert.deepStrictEqual(noPassphrase.values.get("contacts"), contacts);
  assert.deepStrictEqual(noPassphrase.values.get("backup-export"), {
    savedAt: "2026-11-10",
    checksum: "preserve-me",
  });
  console.log("PASS schema-10 no-passphrase startup opens without writes, encryption, or confirmation prompt");

  const missingEncryptionMetadata = await runInitializeAppData({
    settings: { version: 1, iv: "preserve-me", ciphertext: "preserve-me" },
    contacts: [],
  });
  await assert.rejects(missingEncryptionMetadata.pending, /encryption metadata is missing/i);
  assert.deepStrictEqual(missingEncryptionMetadata.writes, []);
  assert.strictEqual(missingEncryptionMetadata.promptCalls, 0);
  assert.deepStrictEqual(
    missingEncryptionMetadata.values.get("settings"),
    { version: 1, iv: "preserve-me", ciphertext: "preserve-me" },
  );
  console.log("PASS encrypted-looking records without metadata are protected without prompting or writing");

  const malformedEncryptionMetadata = await runInitializeAppData({
    settings: { ...settings },
    contacts: [],
    metadata: { version: 99 },
  });
  await assert.rejects(malformedEncryptionMetadata.pending, /metadata is invalid or unsupported/i);
  assert.deepStrictEqual(malformedEncryptionMetadata.writes, []);
  assert.strictEqual(malformedEncryptionMetadata.promptCalls, 0);
  console.log("PASS malformed encryption metadata cannot trigger a false unlock prompt");

  const legacy = await runInitializeAppData({
    settings: { schemaVersion: 9, cities: [], areas: [] },
    contacts: [],
  });
  await legacy.pending;
  assert.strictEqual(legacy.writes.length, 1, "older supported schemas still migrate");
  console.log("PASS supported legacy data migration remains available");

  const future = await runInitializeAppData({
    settings: { ...settings, schemaVersion: 11 },
    contacts,
  });
  await assert.rejects(future.pending, /NewerDataVersionError/);
  assert.deepStrictEqual(future.writes, []);
  assert.strictEqual(future.promptCalls, 0);
  console.log("PASS unsupported future-schema data remains unchanged without passphrase setup");

  const encryptedSettings = { schemaVersion: 10, cities: [], areas: [] };
  const encryptedContacts = [{ id: 18, firstName: "Protected" }];
  const encrypted = await runInitializeAppData({
    settings: { plaintext: encryptedSettings },
    contacts: { plaintext: encryptedContacts },
    metadata: {
      version: 1,
      algorithm: "AES-GCM",
      keyDerivation: "PBKDF2-SHA-256",
      iterations: 310000,
      salt: "valid",
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(encrypted.promptCalls, 1);
  assert.strictEqual(encrypted.prompt.passphraseInput.value, "wrong passphrase");
  const unlockPending = encrypted.pending;
  await encrypted.submitHandler({ preventDefault() {} });
  assert.match(encrypted.prompt.errorMessage.textContent, /incorrect/i);
  assert.deepStrictEqual(encrypted.writes, []);
  encrypted.prompt.passphraseInput.value = "correct passphrase";
  await encrypted.submitHandler({ preventDefault() {} });
  const unlocked = await unlockPending;
  assert.strictEqual(unlocked.metadata.algorithm, "AES-GCM");
  assert.deepStrictEqual(encrypted.writes, [], "current encrypted schema is not rewritten on unlock");
  console.log("PASS genuine passphrase data still requires the correct passphrase without rewriting schema-10 records");

  assert(/id="unlock-screen"\s+hidden/.test(html));
  assert(initSource.includes("if (!metadataPresent)"));
  assert(initSource.includes("const prompt = createUnlockPrompt(true)"));
  assert(!initSource.includes("createCryptoMetadata"));
  assert(app.includes('document.getElementById("change-passphrase-form")'));
  console.log("PASS first-time passphrase creation is no longer a startup fallback");

  const continueStart = app.indexOf("const continueWizard = () => {");
  const continueEnd = app.indexOf("\n  const openSettingsSection", continueStart);
  assert(continueStart >= 0 && continueEnd > continueStart);
  const continueSource = app.slice(continueStart, continueEnd);
  const runContinueWizard = ({ failToAdvance = false } = {}) => {
    const writes = [];
    let focused = false;
    const errorMessage = {
      hidden: true,
      focus() { focused = true; },
    };
    const stepTwo = { hidden: true };
    const context = {
      wizardStep: 1,
      wizardStepKey: "setup-wizard-step",
      document: {
        getElementById(id) {
          return id === "setup-wizard-continue-error" ? errorMessage : stepTwo;
        },
      },
      localStorage: {
        setItem: (key, value) => writes.push([key, value]),
      },
      showWizardStep(step) {
        context.wizardStep = step;
        if (!failToAdvance) stepTwo.hidden = false;
      },
      console: { error() {} },
    };
    vm.runInNewContext(
      `${continueSource}\nthis.runContinueWizard = continueWizard;`,
      context,
    );
    context.runContinueWizard();
    return { writes, errorMessage, stepTwo, get focused() { return focused; } };
  };
  const continued = runContinueWizard();
  assert.strictEqual(continued.stepTwo.hidden, false);
  assert.deepStrictEqual(continued.writes, [["setup-wizard-step", "2"]]);
  assert.strictEqual(continued.errorMessage.hidden, true);
  const failedContinue = runContinueWizard({ failToAdvance: true });
  assert.deepStrictEqual(failedContinue.writes, [], "failed advancement does not save setup progress");
  assert.strictEqual(failedContinue.errorMessage.hidden, false);
  assert.strictEqual(failedContinue.focused, true);
  const continueFailureMarkup = html.match(
    /<p id="setup-wizard-continue-error"[^>]*>([\s\S]*?)<\/p>/,
  )?.[0];
  assert(continueFailureMarkup?.includes('role="alert"'));
  assert(continueFailureMarkup?.includes('data-i18n="setup.continueFailureCode"'));
  for (const language of ["en", "es"]) {
    assert(catalogs[language]["setup.continueFailure"].includes("NRV"));
    assert(catalogs[language]["setup.continueFailureCode"].includes("NRV-A01"));
  }
  console.log("PASS setup Continue advances, and failed advancement shows NRV-A01 without saving progress");

  const consistent = await runBuildGate({ language: "en" });
  assert.strictEqual(consistent.appendedScripts.length, 3);
  assert.strictEqual(consistent.appendedScripts[0], "window.__dropboxLoaded = true;");
  assert.strictEqual(consistent.appendedScripts[1], "window.__mergeLoaded = true;");
  assert(consistent.appendedScripts[2].includes(`const APP_BUILD_REVISION = "${revision}"`));
  assert.strictEqual(consistent.elements.get("startup-recovery-screen").hidden, true);
  assert.strictEqual(consistent.replacedUrls.length, 0);
  assert.strictEqual(consistent.languagePreferenceWrites, 1);
  consistent.window.NRVBuildGate.showFutureSchema();
  await consistent.elements.get("startup-recovery-retry").handler();
  assert.strictEqual(consistent.reloads, 1);
  assert.strictEqual(consistent.appendedScripts.length, 3, "retry reloads instead of executing app.js twice");
  console.log("PASS app executes only after page, app, service worker, metadata, and active worker revisions agree");

  const mixed = await runBuildGate({
    pageRevision: revision,
    appRevision: `sha256:${"b".repeat(64)}`,
    workerSourceRevision: `sha256:${"b".repeat(64)}`,
    metadataRevision: `sha256:${"b".repeat(64)}`,
    workerRevision: `sha256:${"b".repeat(64)}`,
    language: "es",
  });
  assert.strictEqual(mixed.appendedScripts.length, 0);
  assert.strictEqual(mixed.replacedUrls.length, 0);
  assert.strictEqual(mixed.languagePreferenceWrites, 0);
  assert.strictEqual(mixed.reloads, 1);
  assert.strictEqual(
    mixed.sessionValues.get("nrv-startup-reload-target"),
    `sha256:${"b".repeat(64)}`,
  );
  assert.strictEqual(mixed.elements.get("startup-recovery-code").hidden, true);
  console.log("PASS a coherent updated worker triggers one guarded reload before app startup");

  const guarded = await runBuildGate({
    pageRevision: `sha256:${"b".repeat(64)}`,
    appRevision: `sha256:${"b".repeat(64)}`,
    workerSourceRevision: `sha256:${"b".repeat(64)}`,
    metadataRevision: `sha256:${"b".repeat(64)}`,
    reloadTarget: revision,
  });
  assert.strictEqual(guarded.appendedScripts.length, 0);
  assert.strictEqual(guarded.elements.get("startup-recovery-screen").hidden, false);
  assert.strictEqual(guarded.languagePreferenceWrites, 0);
  assert.strictEqual(
    guarded.elements.get("startup-recovery-code").textContent,
    "Error code: NRV-V12",
  );
  guarded.window.NRVBuildGate.showFutureSchema();
  assert.strictEqual(
    guarded.elements.get("startup-recovery-message").textContent,
    catalogs.en["startup.futureData"],
  );
  console.log("PASS verification retries stay behind the gate and future-schema errors use a dedicated safe screen");

  for (const language of ["en", "es"]) {
    const translated = await runBuildGate({
      pageRevision: revision,
      appRevision: revision,
      workerSourceRevision: revision,
      metadataRevision: `sha256:${"b".repeat(64)}`,
      workerRevision: revision,
      language,
    });
    assert.strictEqual(
      translated.elements.get("startup-recovery-code").textContent,
      `${catalogs[language]["startup.errorCode"]}: NRV-V10`,
    );
    assert(catalogs[language]["startup.futureData"]);
  }
  console.log("PASS English and Spanish recovery messages are available");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
