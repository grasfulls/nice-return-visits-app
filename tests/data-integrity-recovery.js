// Run with: node tests/data-integrity-recovery.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

class NewerDataVersionError extends Error {
  constructor() {
    super("Unsupported future data version.");
    this.name = "NewerDataVersionError";
  }
}

const futureFormatContext = {
  NewerDataVersionError,
  isFutureDataFormatVersion: (version) =>
    Number.isInteger(version) && version > 1,
  PLAIN_CONTACT_FORMAT: "return-visits-contact",
  PLAIN_CONTACTS_FORMAT: "return-visits-contacts",
  ENCRYPTED_CONTACTS_FORMAT: "return-visits-encrypted-contacts",
};
const backupStart = app.indexOf("const decryptBackup = async (backup, passphrase) => {");
const backupEnd = app.indexOf("const encryptStoredValue", backupStart);
assert(backupStart >= 0 && backupEnd > backupStart);
const singleContactStart = app.indexOf("const decryptContactTransfer = async (transfer, passphrase) => {");
const singleContactEnd = app.indexOf("const normalizeTransferredContact", singleContactStart);
assert(singleContactStart >= 0 && singleContactEnd > singleContactStart);
const contactsStart = app.indexOf("const decryptContactsTransfer = async (transfer, passphrase) => {");
const contactsEnd = app.indexOf("const getContactLastActivity", contactsStart);
assert(contactsStart >= 0 && contactsEnd > contactsStart);
vm.runInNewContext(
  [
    app.slice(backupStart, backupEnd),
    app.slice(singleContactStart, singleContactEnd),
    app.slice(contactsStart, contactsEnd),
    "this.decryptBackup = decryptBackup;",
    "this.decryptContactTransfer = decryptContactTransfer;",
    "this.decryptContactsTransfer = decryptContactsTransfer;",
  ].join("\n"),
  futureFormatContext,
);

const helperStart = app.indexOf("const commitAndRefreshUi = async (commit, refreshUi) => {");
const helperEnd = app.indexOf("const replaceStoredValuesIfUnchanged", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart);
const helperContext = {};
vm.runInNewContext(
  `${app.slice(helperStart, helperEnd)}\nthis.commitAndRefreshUi = commitAndRefreshUi;`,
  helperContext,
);

async function main() {
  const futureFormatOperations = [
    () => futureFormatContext.decryptBackup({
      format: "return-visits-backup",
      version: 2,
    }, null),
    () => futureFormatContext.decryptBackup({
      format: "return-visits-encrypted-backup",
      version: 1,
      encryption: { version: 2 },
    }, "a sufficiently long passphrase"),
    () => futureFormatContext.decryptContactTransfer({
      format: "return-visits-contact",
      version: 2,
    }, null),
    () => futureFormatContext.decryptContactTransfer({
      format: "return-visits-encrypted-contact",
      version: 1,
      encryption: { version: 2 },
    }, "a sufficiently long passphrase"),
    () => futureFormatContext.decryptContactsTransfer({
      format: "return-visits-contacts",
      version: 2,
    }, null),
    () => futureFormatContext.decryptContactsTransfer({
      format: "return-visits-encrypted-contacts",
      version: 1,
      encryption: { version: 2 },
    }, "a sufficiently long passphrase"),
  ];
  for (const operation of futureFormatOperations) {
    await assert.rejects(operation(), (error) =>
      error.name === "NewerDataVersionError");
  }

  const saved = new Map([
    ["settings", { marker: "original-settings" }],
    ["contacts", [{ marker: "original-contact" }]],
  ]);
  let writeCalls = 0;
  let refreshCalls = 0;
  const writeTransaction = async (entries, fail = false) => {
    const pending = new Map(entries);
    if (fail) throw new Error("transaction aborted");
    pending.forEach((value, key) => saved.set(key, value));
  };
  await assert.rejects(
    helperContext.commitAndRefreshUi(
      async () => {
        writeCalls += 1;
        await writeTransaction([
          ["settings", { marker: "partial-settings" }],
          ["contacts", [{ marker: "partial-contact" }]],
        ], true);
      },
      async () => { refreshCalls += 1; },
    ),
    /transaction aborted/,
  );
  assert.strictEqual(writeCalls, 1);
  assert.strictEqual(refreshCalls, 0);
  assert.strictEqual(saved.get("settings").marker, "original-settings");
  assert.strictEqual(saved.get("contacts")[0].marker, "original-contact");

  const committed = await helperContext.commitAndRefreshUi(
    async () => {
      writeCalls += 1;
      await writeTransaction([
        ["settings", { marker: "committed-settings" }],
        ["contacts", [{ marker: "committed-contact" }]],
      ]);
    },
    async () => {
      refreshCalls += 1;
      throw new Error("render failed");
    },
  );
  assert.strictEqual(committed.committed, true);
  assert.match(committed.uiError.message, /render failed/);
  assert.strictEqual(writeCalls, 2, "the failed screen update does not repeat the committed write");
  assert.strictEqual(saved.get("settings").marker, "committed-settings");
  assert.strictEqual(saved.get("contacts")[0].marker, "committed-contact");

  const importStart = app.indexOf('contactFileInput.addEventListener("change", async () => {');
  const importEnd = app.indexOf("const restorePassphraseDialog", importStart);
  const importFlow = app.slice(importStart, importEnd);
  assert(importFlow.includes("commitAndRefreshUi("));
  assert(importFlow.includes("showCommittedDataRecovery(outcome.uiError)"));
  assert(importFlow.includes("if (writeCommitted)"));

  const restoreStart = app.indexOf("const restoreBackupObject = async (backup) => {");
  const restoreEnd = app.indexOf("const restoreBackupFile", restoreStart);
  const restoreFlow = app.slice(restoreStart, restoreEnd);
  assert(restoreFlow.includes("commitAndRefreshUi("));
  assert(restoreFlow.includes("showCommittedDataRecovery(outcome.uiError)"));

  const mergeStart = app.indexOf("const mergeFromCloud = async (remote) => {");
  const mergeEnd = app.indexOf("// A copy that this device", mergeStart);
  const mergeFlow = app.slice(mergeStart, mergeEnd);
  assert(mergeFlow.includes("commitAndRefreshUi("));
  assert(mergeFlow.includes("showCommittedDataRecovery(outcome.uiError)"));
  assert(app.includes('reportRestoreError(error, "dropbox")'));
  assert(app.includes('showStartupRecovery("startup.futureData.dropbox")'));
  const remoteReadStart = app.indexOf("const readRemoteForMerge = async (remote) => {");
  const remoteReadEnd = app.indexOf("const mergeFromCloud", remoteReadStart);
  assert(remoteReadStart >= 0 && remoteReadEnd > remoteReadStart);
  assert(app.slice(remoteReadStart, remoteReadEnd).includes("isFutureDataFormatVersion(backup.version)"));
  assert(catalogs.en["dropbox.mergeFailed"].includes("saved information was not changed"));
  assert(catalogs.es["dropbox.mergeFailed"].includes("No se modificó tu información guardada"));

  const recoveryStart = app.indexOf("const showCommittedDataRecovery = async (error) => {");
  const recoveryEnd = app.indexOf('contactFileInput.addEventListener("change"', recoveryStart);
  const recoveryFlow = app.slice(recoveryStart, recoveryEnd);
  assert(recoveryFlow.includes('goToView("contacts-view")'));
  assert(!recoveryFlow.includes("restoreBackupObject("));
  assert(!recoveryFlow.includes("writeStoredValues("));

  const unlockStart = app.indexOf("!Array.isArray(settings.cities)");
  const unlockEnd = app.indexOf("const sourceSchemaVersion", unlockStart);
  assert(unlockStart >= 0 && unlockEnd > unlockStart);
  assert(app.slice(unlockStart, unlockEnd).includes("InvalidEncryptedStructureError"));
  assert(app.slice(unlockStart, unlockEnd).includes("Array.isArray(contacts)"));
  assert.match(html, /id="btn-initial-restore"[^>]*data-i18n="unlock\.restore\.button"/);

  assert.strictEqual(
    catalogs.en["startup.futureData"],
    "This information uses a format this copy of NRV can’t open safely. NRV stopped before changing your saved information.",
  );
  assert.strictEqual(
    catalogs.en["startup.futureData.dropbox"],
    "The Dropbox copy uses a format this copy of NRV can’t open safely. NRV stopped before changing your saved information.",
  );
  assert(catalogs.es["startup.futureData"].includes("formato") &&
    catalogs.es["startup.futureData"].includes("información guardada"));
  assert(catalogs.es["startup.futureData.dropbox"].includes("copia de Dropbox"));
  assert(catalogs.en["unlock.invalidStructure"].includes("usable form"));
  assert(catalogs.es["unlock.invalidStructure"].includes("forma utilizable"));
  assert.strictEqual(catalogs.en["unlock.restore.button"], "Restore from Backup");
  assert.strictEqual(catalogs.es["unlock.restore.button"], "Restaurar desde una copia de seguridad");
  for (const language of ["en", "es"]) {
    assert(catalogs[language]["data.savedUiFailure"].includes("saved") ||
      catalogs[language]["data.savedUiFailure"].includes("guardó"));
    assert(!/unchanged|not changed|no se modificó|sin cambios/i.test(
      catalogs[language]["data.savedUiFailure"],
    ));
    assert(catalogs[language]["data.savedUiFailureAction"].includes("Contacts") ||
      catalogs[language]["data.savedUiFailureAction"].includes("Contactos"));
  }

  console.log("PASS pre-commit failures preserve saved values; post-commit UI failures report committed data without repeating writes");
  console.log("PASS higher backup/contact format versions are rejected before decrypting or writing");
  console.log("PASS import, backup restore, and Dropbox merge use the commit boundary and direct Contacts recovery");
  console.log("PASS invalid decrypted structure and English/Spanish recovery wording/actions are aligned");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
