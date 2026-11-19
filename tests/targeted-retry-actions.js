// Run with: node tests/targeted-retry-actions.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n?/g, "\n");
const locales = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, `locales/${language}.json`), "utf8")),
]));

const exportStart = app.indexOf("const runExportWithRetry = async (");
const printStart = app.indexOf("const runPrintWithRetry = async (", exportStart);
const helperEnd = app.indexOf("\n\nconst LAST_BACKUP_KEY", printStart);
assert(exportStart >= 0 && printStart > exportStart && helperEnd > printStart);

async function main() {
  const exportMessages = [];
  let exportAttempts = 0;
  const exportContext = {
    askToRetry: async (message) => {
      exportMessages.push(message);
      return true;
    },
    appText: (_key, fallback) => fallback,
    console: { error() {} },
  };
  vm.runInNewContext(
    `${app.slice(exportStart, printStart)}\nthis.runExportWithRetry = runExportWithRetry;`,
    exportContext,
  );
  const backupExportCompleted = await exportContext.runExportWithRetry(
    "create backup",
    "backup.exportFailed",
    "NRV couldn’t create your backup. Your saved information was not changed.",
    async () => {
      exportAttempts += 1;
      if (exportAttempts === 1) throw new Error("temporary export error");
    },
  );
  assert.strictEqual(backupExportCompleted, true);
  assert.strictEqual(exportAttempts, 2, "Try Again repeats the export operation once");
  assert.deepStrictEqual(exportMessages, [
    "NRV couldn’t create your backup. Your saved information was not changed.",
  ]);
  exportContext.askToRetry = async () => false;
  exportAttempts = 0;
  const contactExportCompleted = await exportContext.runExportWithRetry(
    "create contact export",
    "contacts.exportFailed",
    "NRV couldn’t create the contact export. Your saved information was not changed.",
    async () => {
      exportAttempts += 1;
      throw new Error("export error");
    },
  );
  assert.strictEqual(contactExportCompleted, false);
  assert.strictEqual(exportAttempts, 1, "Close does not repeat a failed export");

  let printAttempts = 0;
  let printPromptCount = 0;
  const printContainer = {
    hidden: true,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const printContext = {
    askToRetry: async () => {
      printPromptCount += 1;
      return printPromptCount === 1;
    },
    appText: (_key, fallback) => fallback,
    console: { error() {} },
  };
  vm.runInNewContext(
    `${app.slice(printStart, helperEnd)}\nthis.runPrintWithRetry = runPrintWithRetry;`,
    printContext,
  );
  await printContext.runPrintWithRetry(printContainer, () => {
    printAttempts += 1;
    if (printAttempts === 1) throw new Error("print error");
  });
  assert.strictEqual(printAttempts, 2, "Try Again repeats only the print operation");
  assert.strictEqual(printContainer.hidden, false);
  assert.strictEqual(printContainer.attributes["aria-hidden"], "false");
  printContext.askToRetry = async () => false;
  await printContext.runPrintWithRetry(printContainer, () => {
    printAttempts += 1;
    throw new Error("print error");
  });
  assert.strictEqual(printAttempts, 3, "Close does not repeat a failed print");
  assert.strictEqual(printContainer.hidden, true);

  const setupStart = app.indexOf("  const saveWizardProgress = () => {");
  const setupEnd = app.indexOf("\n  const openSettingsSection", setupStart);
  assert(setupStart >= 0 && setupEnd > setupStart);
  let retrySetupProgress;
  let writeAttempts = 0;
  let viewChanges = 0;
  const setupError = { hidden: true, focus() { this.focused = true; } };
  const setupErrorText = { textContent: "" };
  const setupErrorCode = { hidden: false };
  const retryButton = {
    hidden: true,
    addEventListener(_event, callback) { retrySetupProgress = callback; },
  };
  const stepTwo = { hidden: true };
  const setupContext = {
    wizardStep: 1,
    wizardStepKey: "setup-step",
    document: {
      getElementById(id) {
        return {
          "setup-wizard-continue-error": setupError,
          "setup-wizard-continue-error-text": setupErrorText,
          "setup-error-code": setupErrorCode,
          "btn-retry-setup-progress": retryButton,
          "setup-wizard-step-2": stepTwo,
        }[id];
      },
    },
    localStorage: {
      setItem() {
        writeAttempts += 1;
        if (writeAttempts === 1) throw new Error("storage full");
      },
    },
    showWizardStep(step) {
      viewChanges += 1;
      setupContext.wizardStep = step;
      stepTwo.hidden = false;
    },
    appText: (_key, fallback) => fallback,
    console: { error() {} },
  };
  vm.runInNewContext(
    `${app.slice(setupStart, setupEnd)}\nthis.continueWizard = continueWizard;`,
    setupContext,
  );
  setupContext.continueWizard();
  assert.strictEqual(stepTwo.hidden, false);
  assert.strictEqual(setupError.hidden, false);
  assert.strictEqual(retryButton.hidden, false);
  assert.strictEqual(
    setupErrorText.textContent,
    "NRV couldn’t save this setup step. Your saved information was not changed.",
  );
  retrySetupProgress();
  assert.strictEqual(writeAttempts, 2);
  assert.strictEqual(viewChanges, 1, "setup retry saves the current step without restarting navigation");
  assert.strictEqual(setupError.hidden, true);

  const startSetupStart = app.indexOf("  const startSetup = async () => {");
  const startSetupEnd = app.indexOf(
    '\n  document\n    .getElementById("btn-setup-passphrase")',
    startSetupStart,
  );
  assert(startSetupStart >= 0 && startSetupEnd > startSetupStart);
  const setupWrites = [];
  let pendingWriteFailed = false;
  const installBanner = { hidden: false };
  const appContainer = {
    hidden: true,
    inert: true,
    setAttribute() {},
  };
  const defaults = { open: false, scrollIntoView() {} };
  let settingsViewOpened = false;
  let retryPromptCount = 0;
  const startSetupContext = {
    installBanner,
    installBannerKey: "install-banner",
    setupPendingKey: "setup-pending",
    wizardStepKey: "wizard-step",
    localStorage: {
      setItem(key, value) {
        setupWrites.push(["set", key, value]);
        if (key === "setup-pending" && !pendingWriteFailed) {
          pendingWriteFailed = true;
          throw new Error("storage full");
        }
      },
      removeItem(key) { setupWrites.push(["remove", key]); },
    },
    askToRetry: async (message) => {
      retryPromptCount += 1;
      assert.strictEqual(installBanner.hidden, false, "the current setup step stays visible");
      assert.strictEqual(
        message,
        "NRV couldn’t save this setup step. Your saved information was not changed.",
      );
      return true;
    },
    appText: (_key, fallback) => fallback,
    console: { error() {} },
    document: {
      getElementById(id) {
        return ({
          "app-container": appContainer,
          "setup-next-steps-notice": { hidden: true },
          "defaults-your-details-section": defaults,
          "defaults-section": { open: false },
        })[id];
      },
      body: { classList: { add() {} } },
    },
    goToView(viewId) { settingsViewOpened = viewId === "settings-view"; },
  };
  const startSetup = vm.runInNewContext(
    `${app.slice(startSetupStart, startSetupEnd)}\nstartSetup;`,
    startSetupContext,
  );
  assert.strictEqual(await startSetup(), true);
  assert.strictEqual(retryPromptCount, 1);
  assert.strictEqual(settingsViewOpened, true);
  assert.deepStrictEqual(setupWrites, [
    ["set", "install-banner", "true"],
    ["set", "setup-pending", "true"],
    ["set", "install-banner", "true"],
    ["set", "setup-pending", "true"],
    ["remove", "wizard-step"],
  ]);

  const markStart = app.indexOf("const markInstalledSetupCompleteWithRetry = async () => {");
  const markEnd = app.indexOf("\n\nconst runExportWithRetry", markStart);
  assert(markStart >= 0 && markEnd > markStart);
  let markAttempts = 0;
  const markContext = {
    markInstalledSetupComplete: () => ++markAttempts > 1,
    askToRetry: async () => true,
    appText: (_key, fallback) => fallback,
  };
  const markComplete = vm.runInNewContext(
    `${app.slice(markStart, markEnd)}\nmarkInstalledSetupCompleteWithRetry;`,
    markContext,
  );
  assert.strictEqual(await markComplete(), true);
  assert.strictEqual(markAttempts, 2, "setup completion retry repeats only its progress flag write");

  const transactionStart = app.indexOf("const replaceStoredValuesIfUnchanged = (");
  const transactionEnd = app.indexOf("\n\nconst deleteStoredValues", transactionStart);
  assert(transactionStart >= 0 && transactionEnd > transactionStart);
  const transactionContext = {
    appText: (_key, fallback) => fallback,
  };
  vm.runInNewContext(
    `${app.slice(transactionStart, transactionEnd)}\nthis.replaceStoredValuesIfUnchanged = replaceStoredValuesIfUnchanged;`,
    transactionContext,
  );
  const storedValues = {
    settings: { original: "settings" },
    contacts: { original: "contacts" },
    "encryption-meta": { original: "metadata" },
  };
  const storedValuesBeforeFailure = JSON.stringify(storedValues);
  const transactionWrites = [];
  const database = {
    transaction() {
      const transaction = {
        error: null,
        aborted: false,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          if (this.aborted) return;
          this.aborted = true;
          queueMicrotask(() => this.onabort?.());
        },
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                if (transaction.aborted) return;
                if (key === "settings") {
                  request.onerror?.();
                  return;
                }
                request.result = { value: storedValues[key] };
                request.onsuccess?.();
              });
              return request;
            },
            put(entry) { transactionWrites.push(["put", entry.key, entry.value]); },
            delete(key) { transactionWrites.push(["delete", key]); },
          };
        },
      };
      return transaction;
    },
  };
  await assert.rejects(
    transactionContext.replaceStoredValuesIfUnchanged(
      database,
      [
        ["settings", storedValues.settings],
        ["contacts", storedValues.contacts],
        ["encryption-meta", storedValues["encryption-meta"]],
      ],
      [
        ["settings", { changed: "settings" }],
        ["contacts", { changed: "contacts" }],
        ["encryption-meta", { changed: "metadata" }],
      ],
    ),
  );
  assert.strictEqual(JSON.stringify(storedValues), storedValuesBeforeFailure);
  assert.deepStrictEqual(transactionWrites, [], "a failed pre-commit read queues no replacements");

  const passphraseStart = app.indexOf(
    '  document\n    .getElementById("change-passphrase-form")\n    .addEventListener("submit", async (event) => {',
  );
  const passphraseEnd = app.indexOf("\n\n  // Helper: Calculate days", passphraseStart);
  assert(passphraseStart >= 0 && passphraseEnd > passphraseStart);
  const passphraseHandler = app.slice(passphraseStart, passphraseEnd);
  assert(passphraseHandler.indexOf("await replaceStoredValuesIfUnchanged") <
    passphraseHandler.indexOf("writeCommitted = true"));
  assert(passphraseHandler.includes("if (retryChange) changePassphraseForm.requestSubmit()"));
  assert(passphraseHandler.includes("if (writeCommitted)"));
  assert(passphraseHandler.includes(
    "NRV couldn’t complete the passphrase change. Your saved information was not changed.",
  ));
  let submitHandler;
  let retryRun;
  let commits = 0;
  const savedValues = {
    settings: { encrypted: "settings" },
    contacts: { encrypted: "contacts" },
    "encryption-meta": { original: "metadata" },
  };
  const originalSavedValues = JSON.stringify(savedValues);
  const retryMessages = [];
  const form = {
    addEventListener(_event, callback) { submitHandler = callback; },
    reset() { this.resetCount = (this.resetCount || 0) + 1; },
    requestSubmit() {
      retryRun = submitHandler({ preventDefault() {} });
    },
  };
  const passphraseElements = {
    "change-passphrase-form": form,
    "current-passphrase": { value: "old passphrase" },
    "new-passphrase": { value: "a new passphrase" },
    "confirm-new-passphrase": { value: "a new passphrase" },
    "btn-change-passphrase": { disabled: false },
    "change-passphrase-status": { textContent: "" },
    "app-container": { inert: false },
  };
  const passphraseContext = {
    document: { getElementById: (id) => passphraseElements[id] },
    cryptoMetadata: { salt: "old" },
    encryptionKey: "old-key",
    database: {},
    MIN_PASSPHRASE_LENGTH: 12,
    ENCRYPTION_META_KEY: "encryption-meta",
    resolvePassphrase: async (value) => value,
    deriveEncryptionKey: async (value) => `key:${value}`,
    readStoredValue: async (_database, key) => savedValues[key],
    decryptValue: async (value) => value.encrypted || value,
    createCryptoMetadata: () => ({ salt: "new" }),
    withRecoveryCode: async (metadata) => ({ metadata, recoveryCode: "new-code" }),
    encryptValue: async (value) => ({ encrypted: value }),
    replaceStoredValuesIfUnchanged: async () => {
      commits += 1;
      if (commits === 1) throw new Error("storage transaction failed");
      savedValues.settings = { encrypted: "settings" };
      savedValues.contacts = { encrypted: "contacts" };
      savedValues["encryption-meta"] = { salt: "new" };
    },
    updatePassphraseSection() {},
    showRecoveryCodeDialog: async () => {},
    askToRetry: async (message) => {
      retryMessages.push(message);
      assert.strictEqual(
        JSON.stringify(savedValues),
        originalSavedValues,
        "the failed passphrase attempt leaves stored values intact before retry",
      );
      return true;
    },
    appText: (_key, fallback) => fallback,
    console: { error() {} },
  };
  vm.runInNewContext(passphraseHandler, passphraseContext);
  await submitHandler({ preventDefault() {} });
  assert(retryRun, "Try Again resubmits the existing passphrase-change form");
  await retryRun;
  assert.strictEqual(commits, 2, "the passphrase operation is retried once");
  assert.strictEqual(retryMessages.length, 1);
  assert.strictEqual(
    retryMessages[0],
    "NRV couldn’t complete the passphrase change. Your saved information was not changed.",
  );
  assert.strictEqual(form.resetCount, 1, "only the successful passphrase change resets the form");
  passphraseElements["current-passphrase"].value = "a new passphrase";
  passphraseElements["new-passphrase"].value = "another new passphrase";
  passphraseElements["confirm-new-passphrase"].value = "another new passphrase";
  passphraseContext.showRecoveryCodeDialog = async () => {
    throw new Error("confirmation could not open");
  };
  await submitHandler({ preventDefault() {} });
  assert.strictEqual(commits, 3);
  assert.strictEqual(
    retryMessages.length,
    1,
    "a post-commit display failure is not retried as a passphrase change",
  );
  assert.strictEqual(
    passphraseElements["change-passphrase-status"].textContent,
    "NRV changed the passphrase, but couldn’t finish the confirmation. The new passphrase is active.",
  );
  assert(!passphraseElements["change-passphrase-status"].textContent.includes(
    "saved information was not changed",
  ));

  assert(app.includes(
    'await runExportWithRetry(\n      "create backup",\n      "backup.exportFailed"',
  ));
  assert(app.includes('const createInstallTransferBackup = async () => {'));
  assert(app.includes(
    '"install.preserve.backupFailed",\n      "NRV couldn’t create your backup. Your saved information was not changed."',
  ));
  assert((app.match(/"contacts\.exportFailed",\n\s+"NRV couldn’t create the contact export/g) || []).length === 2);
  assert(app.includes("await runPrintWithRetry(printContainer, () => window.print())"));

  assert.strictEqual(
    locales.en["security.changeFailed"],
    "NRV couldn’t complete the passphrase change. Your saved information was not changed.",
  );
  assert.strictEqual(
    locales.en["setup.saveProgressFailed"],
    "NRV couldn’t save this setup step. Your saved information was not changed.",
  );
  assert.strictEqual(
    locales.en["backup.exportFailed"],
    "NRV couldn’t create your backup. Your saved information was not changed.",
  );
  assert.strictEqual(
    locales.en["install.preserve.backupFailed"],
    "NRV couldn’t create your backup. Your saved information was not changed.",
  );
  assert.strictEqual(
    locales.en["contacts.exportFailed"],
    "NRV couldn’t create the contact export. Your saved information was not changed.",
  );
  assert.strictEqual(
    locales.en["print.openFailed"],
    "NRV couldn’t open the print window. Try again.",
  );
  assert.strictEqual(locales.en["common.tryAgain"], "Try Again");
  assert.strictEqual(locales.en["common.close"], "Close");
  assert(locales.es["security.changeFailed"].includes("información guardada no se modificó"));
  assert(locales.es["setup.saveProgressFailed"].includes("información guardada no se modificó"));
  assert(locales.es["backup.exportFailed"].includes("información guardada no se modificó"));
  assert(locales.es["install.preserve.backupFailed"].includes("información guardada no se modificó"));
  assert(locales.es["contacts.exportFailed"].includes("información guardada no se modificó"));
  assert(locales.es["print.openFailed"].includes("ventana de impresión"));
  assert.strictEqual(locales.es["common.tryAgain"], "Intentar de nuevo");
  assert.strictEqual(locales.es["common.close"], "Cerrar");
  console.log("PASS  targeted retries repeat only passphrase, setup-save, export, or print operations");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
