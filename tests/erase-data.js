// Run with: node tests/erase-data.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const clearStart = app.indexOf("const clearNrvWorkingState =");
const clearEnd = app.indexOf("\nconst runStartFreshFlow =", clearStart);
const flowEnd = app.indexOf("\nlet appUpdateAvailable =", clearEnd);
assert(clearStart >= 0 && clearEnd > clearStart && flowEnd > clearEnd);

for (const language of ["en", "es"]) {
  i18n._setCatalog(
    language,
    JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
  );
}

const source = `${app.slice(clearStart, flowEnd)}
this.clearNrvWorkingState = clearNrvWorkingState;
this.runStartFreshFlow = runStartFreshFlow;`;

const makeStorage = (entries = []) => {
  const values = new Map(entries);
  return {
    values,
    get length() { return values.size; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
};

const createHarness = (
  language = "en",
  deleteOutcomes = [],
  { verificationError = false, retainDatabaseData = false } = {},
) => {
  i18n._setCurrent(language);
  const localStorage = makeStorage([
    ["return_visits_settings", "old settings"],
    ["nrv_installed_setup_completed", "true"],
    ["return_visits_setup_pending", "true"],
    ["encryption-meta", "old passphrase metadata"],
    ["return_visits_dropbox", JSON.stringify({ refreshToken: "local-only-token" })],
    ["return_visits_cloud_dirty", "1"],
    ["return_visits_cloud_reconnect_decision_required", "1"],
  ]);
  const sessionStorage = makeStorage([
    ["nrv_install_transfer_pending", "true"],
    ["return_visits_dropbox_result", "old connection result"],
  ]);
  const idbState = new Map([
    ["settings", { country: "Old setting" }],
    ["contacts", [{ name: "Old contact", notes: ["Old visit"] }]],
    ["encryption-meta", { salt: "old metadata" }],
  ]);
  const localBackups = [{ name: "nrv-recovery.json", content: "protected local backup" }];
  const remoteBackups = [{ name: "latest.json", content: "protected Dropbox backup" }];
  const db = { closed: false, close() { this.closed = true; } };
  const indexedDB = {
    deletes: 0,
    opens: 0,
    deleteDatabase(name) {
      assert.strictEqual(name, "return-visits-app");
      this.deletes += 1;
      const request = {};
      const outcome = deleteOutcomes.length ? deleteOutcomes.shift() : "success";
      queueMicrotask(() => {
        if (outcome === "blocked") request.onblocked();
        else if (outcome === "error") {
          request.error = new Error("simulated delete error");
          request.onerror();
        } else {
          if (!retainDatabaseData) idbState.clear();
          request.onsuccess();
        }
      });
      return request;
    },
    open(name, version) {
      assert.strictEqual(name, "return-visits-app");
      assert.strictEqual(version, 1);
      this.opens += 1;
      const request = {};
      queueMicrotask(() => {
        if (verificationError) {
          request.error = new Error("simulated verification failure");
          request.onerror();
          return;
        }
        let stores = ["appData"];
        request.result = {
          createObjectStore(name) { stores.push(name); },
          objectStoreNames: { contains(name) { return stores.includes(name); } },
          transaction(storeName) {
            assert.strictEqual(storeName, "appData");
            return {
              objectStore() {
                return {
                  getAllKeys() {
                    const keysRequest = {};
                    queueMicrotask(() => {
                      keysRequest.result = [...idbState.keys()];
                      keysRequest.onsuccess();
                    });
                    return keysRequest;
                  },
                };
              },
            };
          },
          close() {},
        };
        request.onsuccess();
      });
      return request;
    },
  };
  const dropbox = {
    isConnected: () => Boolean(localStorage.getItem("return_visits_dropbox")),
    remoteBackupReads: 0,
    fileDeletes: 0,
    list: async () => { dropbox.remoteBackupReads += 1; return remoteBackups; },
    remove: async () => { dropbox.fileDeletes += 1; },
  };
  const context = {
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    api: {
      clear: (overrides = {}) => context.clearNrvWorkingState({
        database: db,
        indexedDB,
        localStorage,
        sessionStorage,
        dropbox,
        ...overrides,
      }),
      run: (options) => context.runStartFreshFlow(options),
    },
    db,
    dropbox,
    idbState,
    indexedDB,
    localStorage,
    sessionStorage,
    localBackups,
    remoteBackups,
  };
};

const testConfirmationsAndCancel = async () => {
  for (const [cancelAt, expectedCalls] of [[0, 1], [1, 2]]) {
    const harness = createHarness("en");
    const beforeLocal = [...harness.localStorage.values];
    const beforeSession = [...harness.sessionStorage.values];
    const beforeIdb = [...harness.idbState];
    let eraseCalls = 0;
    const messages = [];
    const destinations = [];
    const result = await harness.api.run({
      dropboxConnected: false,
      askForConfirmation: async (message) => {
        messages.push(message);
        return messages.length - 1 !== cancelAt;
      },
      erase: async () => { eraseCalls += 1; },
      showMessage: async () => assert.fail("Cancelled reset must not show success."),
      redirect: (url) => destinations.push(url),
    });
    assert.strictEqual(result, "cancelled");
    assert.strictEqual(messages.length, expectedCalls);
    assert.strictEqual(eraseCalls, 0);
    assert.deepStrictEqual([...harness.localStorage.values], beforeLocal);
    assert.deepStrictEqual([...harness.sessionStorage.values], beforeSession);
    assert.deepStrictEqual([...harness.idbState], beforeIdb);
    assert.deepStrictEqual(harness.localBackups, [{ name: "nrv-recovery.json", content: "protected local backup" }]);
    assert.deepStrictEqual(harness.remoteBackups, [{ name: "latest.json", content: "protected Dropbox backup" }]);
    assert.deepStrictEqual(destinations, []);
  }
  console.log("PASS opening and cancelling either confirmation leaves app state and backups untouched");
};

const testBackupAndDropboxMessages = async () => {
  for (const language of ["en", "es"]) {
    const harness = createHarness(language);
    const messages = [];
    await harness.api.run({
      dropboxConnected: false,
      askForConfirmation: async (message) => {
        messages.push(message);
        return false;
      },
      erase: async () => assert.fail("Cancelled confirmation must not erase."),
      showMessage: async () => {},
      redirect: () => assert.fail("Cancelled confirmation must not redirect."),
    });
    const reminder = messages[0];
    for (const phrase of language === "en"
      ? ["working copy", "current backup", "recovery copy", "normal backup/synchronization", "not erased"]
      : ["copia de trabajo", "copia de seguridad actual", "copia de recuperación", "copias de seguridad y sincronización", "no se borran"]) {
      assert(reminder.toLowerCase().includes(phrase.toLowerCase()), `${language}: ${phrase}`);
    }
    assert(!reminder.includes(language === "en" ? "Using Dropbox?" : "¿Usas Dropbox?"));

    const connectedMessages = [];
    await harness.api.run({
      dropboxConnected: true,
      askForConfirmation: async (message) => {
        connectedMessages.push(message);
        return false;
      },
      erase: async () => assert.fail("Cancelled Dropbox reminder must not erase."),
      showMessage: async () => {},
      redirect: () => assert.fail("Cancelled Dropbox reminder must not redirect."),
    });
    const combined = connectedMessages[0];
    for (const phrase of language === "en"
      ? ["Using Dropbox?", "disconnect it", "will not delete", "outside NRV’s active Dropbox", "deliberate choice", "not automatically restore"]
      : ["¿Usas Dropbox?", "se desconectará", "no se eliminarán", "fuera del área activa", "decisión deliberada", "no restaurará automáticamente"]) {
      assert(combined.toLowerCase().includes(phrase.toLowerCase()), `${language}: ${phrase}`);
    }
    assert.strictEqual(connectedMessages.length, 1);
  }
  console.log("PASS backup reminder is clear and Dropbox guidance appears only when applicable in both languages");
};

const testVerifiedEraseAndRedirect = async () => {
  const harness = createHarness("en");
  const localFilesBefore = JSON.stringify(harness.localBackups);
  const remoteFilesBefore = JSON.stringify(harness.remoteBackups);
  const messages = [];
  const redirects = [];
  const confirms = [];
  const result = await harness.api.run({
    dropboxConnected: true,
    askForConfirmation: async (message) => { confirms.push(message); return true; },
    erase: () => harness.api.clear(),
    showMessage: async (message) => { messages.push(message); },
    redirect: (url) => redirects.push(url),
  });
  assert.strictEqual(result, "complete");
  assert.strictEqual(harness.db.closed, true);
  assert.strictEqual(harness.indexedDB.deletes, 1);
  assert.strictEqual(harness.indexedDB.opens, 1);
  assert.strictEqual(harness.idbState.size, 0);
  assert.strictEqual(harness.localStorage.length, 0);
  assert.strictEqual(harness.sessionStorage.length, 0);
  assert.strictEqual(harness.dropbox.isConnected(), false);
  assert.strictEqual(harness.dropbox.remoteBackupReads, 0);
  assert.deepStrictEqual(harness.localBackups, JSON.parse(localFilesBefore));
  assert.deepStrictEqual(harness.remoteBackups, JSON.parse(remoteFilesBefore));
  assert.strictEqual(harness.dropbox.fileDeletes, 0);
  assert.deepStrictEqual(messages, ["NRV has been cleared. You’ll now return to the Nice Return Visits website to begin again."]);
  assert.deepStrictEqual(redirects, ["https://nicereturnvisits.org/"]);
  assert.strictEqual(confirms.length, 2);
  console.log("PASS verified reset clears IDB/local/session/Dropbox state, preserves backups, confirms, then redirects to site");
};

const testFailedVerificationAndRetry = async () => {
  const failedHarness = createHarness("en", [], { verificationError: true });
  await assert.rejects(failedHarness.api.clear(), /simulated verification failure/);
  assert.strictEqual(failedHarness.localStorage.length, 0);
  assert.strictEqual(failedHarness.sessionStorage.length, 0);

  const staleHarness = createHarness("en", [], { retainDatabaseData: true });
  await assert.rejects(staleHarness.api.clear(), /working information remains/);
  assert(staleHarness.idbState.size > 0);

  const cancelledHarness = createHarness("en");
  let attempts = 0;
  const messages = [];
  const redirects = [];
  const result = await cancelledHarness.api.run({
    dropboxConnected: false,
    askForConfirmation: async (message) => {
      messages.push(message);
      return messages.length < 3;
    },
    erase: async () => {
      attempts += 1;
      throw new Error("verification failed");
    },
    showMessage: async () => assert.fail("Failed reset must not show success."),
    redirect: (url) => redirects.push(url),
  });
  assert.strictEqual(result, "failed");
  assert.strictEqual(attempts, 1);
  assert(messages[2].includes("not been reported as fresh"));
  assert(messages[2].includes("partially cleared"));
  assert.deepStrictEqual(redirects, []);

  const retryHarness = createHarness("es");
  let retryCount = 0;
  let completedMessage = "";
  const retryRedirects = [];
  const retryResult = await retryHarness.api.run({
    dropboxConnected: false,
    askForConfirmation: async () => true,
    erase: async () => {
      retryCount += 1;
      if (retryCount === 1) throw new Error("simulated blocked database");
      return retryHarness.api.clear();
    },
    showMessage: async (message) => { completedMessage = message; },
    redirect: (url) => retryRedirects.push(url),
  });
  assert.strictEqual(retryResult, "complete");
  assert.strictEqual(retryCount, 2);
  assert(completedMessage.includes("volverás al sitio web"));
  assert.deepStrictEqual(retryRedirects, ["https://nicereturnvisits.org/"]);
  console.log("PASS failed verification never reports success or redirects; user can cancel or retry");
};

const testDropboxReconnectRequiresChoice = () => {
  const reconnectStart = app.indexOf("const finishDropboxReturn =");
  const reconnectEnd = app.indexOf("\n  refreshCloudUi();", reconnectStart);
  const backupStart = app.indexOf("const runCloudBackup =");
  const backupEnd = app.indexOf("\n  const autoCloudBackup", backupStart);
  assert(reconnectStart >= 0 && reconnectEnd > reconnectStart);
  assert(backupStart >= 0 && backupEnd > backupStart);
  const reconnectFlow = app.slice(reconnectStart, reconnectEnd);
  const automaticBackupFlow = app.slice(backupStart, backupEnd);
  assert(reconnectFlow.includes('localStorage.setItem(CLOUD_RECONNECT_DECISION_KEY, "1")'));
  assert(reconnectFlow.includes("const existing = (await dropbox.list())"));
  assert(reconnectFlow.includes('NRVDialogs.confirm('));
  assert(reconnectFlow.includes('"dropbox.chooseExistingConfirm"'));
  assert(reconnectFlow.includes("setCloudStatus(\n            appText(\"dropbox.connectedPaused\""));
  assert(reconnectFlow.indexOf("dropbox.list()") < reconnectFlow.indexOf("NRVDialogs.confirm("));
  assert(automaticBackupFlow.includes('localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1"'));
  assert(automaticBackupFlow.includes("!userInitiated"));
  console.log("PASS reconnecting Dropbox requires an explicit existing-backup choice before restore or sync");
};

(async () => {
  await testConfirmationsAndCancel();
  await testBackupAndDropboxMessages();
  await testVerifiedEraseAndRedirect();
  await testFailedVerificationAndRetry();
  testDropboxReconnectRequiresChoice();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});