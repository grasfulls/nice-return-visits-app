// Run with: node tests/install-preservation.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const hasInformationStart = app.indexOf(
  "const hasMeaningfulUserInformation =",
);
const hasInformationEnd = app.indexOf(
  "\n\nconst inspectStoredUserInformation",
  hasInformationStart,
);
assert(hasInformationStart >= 0 && hasInformationEnd > hasInformationStart);
const hasInformationCode = app.slice(hasInformationStart, hasInformationEnd);
const helperContext = {
  DEFAULT_SETTINGS: { country: "United States", regions: [] },
  normalizeRegionData: (settings, contacts) => ({ settings, contacts }),
};
const hasInformation = vm.runInNewContext(
  `${hasInformationCode}\nhasMeaningfulUserInformation;`,
  helperContext,
);
assert.strictEqual(
  hasInformation(helperContext.DEFAULT_SETTINGS, []),
  false,
);
assert.strictEqual(
  hasInformation({ ...helperContext.DEFAULT_SETTINGS, timeTracking: { enabled: true } }, []),
  true,
);
assert.strictEqual(
  hasInformation(helperContext.DEFAULT_SETTINGS, [{ id: "contact-1" }]),
  true,
);
console.log("PASS  contacts and personalized settings trigger preservation; defaults do not");

const inspectStart = app.indexOf(
  "const inspectStoredUserInformation = async () => {",
);
const inspectEnd = app.indexOf("\n\nlet initialStoredInformation", inspectStart);
assert(inspectStart >= 0 && inspectEnd > inspectStart);
const inspectCode = app.slice(inspectStart, inspectEnd);
async function inspect(values) {
  let closed = false;
  const context = {
    DEFAULT_SETTINGS: helperContext.DEFAULT_SETTINGS,
    ENCRYPTION_META_KEY: "encryption-meta",
    openAppDatabase: async () => ({ close() { closed = true; } }),
    readStoredValue: async (_database, key) => values[key],
    parseLegacyValue: () => undefined,
    normalizeRegionData: (settings, contacts) => ({ settings, contacts }),
    hasMeaningfulUserInformation: hasInformation,
  };
  const check = vm.runInNewContext(
    `${inspectCode}\ninspectStoredUserInformation;`,
    context,
  );
  const result = await check();
  assert(closed, "the inspection database should always close");
  return result.hasPotentialInformation;
}

async function main() {
  assert.strictEqual(await inspect({}), false);
  assert.strictEqual(
    await inspect({
      settings: { ...helperContext.DEFAULT_SETTINGS, goalsAndMilestones: { goals: [{ id: "goal-1" }] } },
      contacts: [],
    }),
    true,
  );
  assert.strictEqual(
    await inspect({
      "encryption-meta": { salt: "test" },
      settings: { ciphertext: "encrypted" },
      contacts: { ciphertext: "encrypted" },
    }),
    true,
  );

  const transferStart = app.indexOf("const preservationScreen =");
  const transferEnd = app.indexOf("\n\n  const downloadContactsSubset", transferStart);
  assert(transferStart >= 0 && transferEnd > transferStart);
  const transferCode = app.slice(transferStart, transferEnd);
  assert(transferCode.includes('transferPurpose: "installation"'));
  assert(app.includes('{ transferPurpose: options.transferPurpose }'));
  assert(transferCode.includes("markBackupDone()"));
  const continuationStart = transferCode.indexOf("const continueInstallation =");
  const continuationEnd = transferCode.indexOf("const cancelInstallation =", continuationStart);
  assert(continuationStart >= 0 && continuationEnd > continuationStart);
  const continuationCode = transferCode.slice(continuationStart, continuationEnd);
  assert(continuationCode.indexOf("readSavedInstallRoute()") < continuationCode.indexOf("closePreservationScreen()"));
  assert(continuationCode.includes("launchInstall({ route: savedRoute })"));
  assert(continuationCode.includes("showLaunchChoice({"));
  assert(transferCode.includes('sessionStorage.removeItem(INSTALL_ROUTE_KEY)'));
  assert(transferCode.includes("const cancelInstallation ="));
  const browserPreviewDeclaration = app.indexOf("let browserPreview = false;");
  const setupInitializer = app.indexOf("const initializeInstallSetup = async () => {");
  assert(browserPreviewDeclaration >= 0 && browserPreviewDeclaration < setupInitializer);
  assert(app.includes(
    'if (document.readyState === "loading") {\n  document.addEventListener("DOMContentLoaded", initializeInstallSetup, {\n    once: true,\n  });\n} else {\n  initializeInstallSetup();\n}',
  ));
  assert(app.includes("if (transferPending && browserPreview)"));
  assert(transferCode.includes('document.getElementById("btn-preservation-save").disabled = false'));
  assert(!transferCode.includes("deleteDatabase"));
  assert(!transferCode.includes("eraseAllData"));
  assert(app.includes("installButton.onclick = () => window.nrvBeginBrowserInstall({"));
  assert(app.includes("settingsInstallButton.addEventListener(\"click\", () =>\n        window.nrvBeginBrowserInstall({"));
  assert(app.includes("sessionStorage.setItem(INSTALL_TRANSFER_PENDING_KEY, \"true\")"));
  assert(app.includes("sessionStorage.removeItem(INSTALL_TRANSFER_PENDING_KEY)"));
  assert(transferCode.includes("if (!hasInformation && !confirmNoData)"));
  assert(transferCode.includes('"btn-preservation-skip"'));
  assert(html.includes('id="install-preservation-screen"'));
  assert(html.includes('id="btn-preservation-skip"'));
  assert(html.includes('id="btn-preservation-cancel"'));
  assert(html.includes('id="btn-preservation-download"'));
  assert(html.includes('id="install-preservation-saved"'));
  assert(html.includes('id="btn-preservation-continue"'));
  assert(html.includes('data-i18n="install.preserve.choice"'));
  assert(html.includes('data-i18n="contacts.keepUsingBrowser">Keep using browser</button>'));
  assert(!html.includes(">Got it</button>"));
  assert(app.includes('localStorage.setItem(LAUNCH_MODE_KEY, "browser")'));
  assert(app.includes("settingsInstallButton.hidden = isInstalledApp()"));
  const restoreStart = app.indexOf("const restoreBackupObject = async (backup) => {");
  const restoreEnd = app.indexOf("\n\n  const restoreBackupFile", restoreStart);
  assert(restoreStart >= 0 && restoreEnd > restoreStart);
  const restoreCode = app.slice(restoreStart, restoreEnd);
  assert(restoreCode.indexOf("await writeStoredValues(database") < restoreCode.indexOf('backup.installTransferRestored'));
  assert(restoreCode.includes('backup.transferPurpose === "installation"'));
  assert(app.includes('if (backup.transferPurpose === "installation")'));
  const dismissStart = app.indexOf('.getElementById("btn-copy-notice-dismiss")');
  const dismissEnd = app.indexOf("\n\n  const updateWorkingNeedFilterOptions", dismissStart);
  assert(dismissStart >= 0 && dismissEnd > dismissStart);
  const dismissCode = app.slice(dismissStart, dismissEnd);
  assert(dismissCode.includes('localStorage.setItem(LAUNCH_MODE_KEY, "browser")'));
  assert(!dismissCode.includes("deleteDatabase"));
  assert(!dismissCode.includes("eraseAllData"));
  assert(transferCode.includes("Your browser information has not changed"));

  const english = JSON.parse(fs.readFileSync(path.join(root, "locales", "en.json"), "utf8"));
  const spanish = JSON.parse(fs.readFileSync(path.join(root, "locales", "es.json"), "utf8"));
  for (const language of ["en", "es"]) {
    const catalog = language === "en" ? english : spanish;
    i18n._setCatalog(language, catalog);
    i18n._setCurrent(language);
    for (const key of [
      "launch.recommend",
      "launch.tagline",
      "launch.browserButton",
      "launch.storageNote",
      "contacts.browserCopy",
      "contacts.keepUsingBrowser",
      "install.preserve.choice",
      "install.preserve.save",
      "install.preserve.skip",
      "install.preserve.cancel",
      "install.preserve.download",
      "install.preserve.saved",
      "install.preserve.restoreNote",
      "install.preserve.continue",
      "backup.installTransferRestored",
      "backup.installTransferRestoredNoRecovery",
      "install.appleWhy",
      "install.handoff.apple",
    ]) {
      assert.notStrictEqual(i18n.t(key), key, `${language}: ${key}`);
    }
    assert(i18n.t("launch.recommend").includes(
      language === "en" ? "organized" : "organizadas",
    ));
  }
  assert(english["contacts.keepUsingBrowser"].toLowerCase().includes("keep using browser"));
  assert(spanish["contacts.keepUsingBrowser"].toLowerCase().includes("navegador"));
  assert(english["install.preserve.choice"].includes("Do you want to keep it"));
  assert(spanish["install.preserve.choice"].includes("¿Quieres conservarla"));
  assert(english["install.preserve.skip"].startsWith("No"));
  assert(spanish["install.preserve.skip"].startsWith("No"));
  assert(english["install.preserve.restoreNote"].includes("no restore is needed"));
  assert(spanish["install.preserve.restoreNote"].includes("no es necesario restaurarla"));
  assert(english["contacts.browserCopy"].includes("make backups"));
  assert(spanish["contacts.browserCopy"].includes("copias de seguridad"));
  console.log("PASS  install handoff offers save, skip, cancel, download and restore guidance in English and Spanish");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
