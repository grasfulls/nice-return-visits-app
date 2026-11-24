// Run with: node tests/app-version.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const i18n = require("../i18n.js");
const release = require("../scripts/version.js");
const buildRevision = require("../scripts/build-revision.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n?/g, "\n");
const start = source.indexOf('const APP_VERSION = "');
const end = source.indexOf("const guardDetailsFocusScroll =", start);
assert(start >= 0 && end > start);
let response;
let fetchOptions;
let requestedUrl;
const context = {
  window: { NRVI18n: i18n },
  document: { baseURI: "https://example.test/nrv/" },
  crypto: { getRandomValues: (array) => { array.set([1, 2, 3, 4]); return array; } },
  fetch: async (url, options) => {
    requestedUrl = url;
    fetchOptions = options;
    if (response instanceof Error) throw response;
    return response;
  },
  URL, Uint32Array,
};
vm.runInNewContext(`${source.slice(start, end)}
this.api = { APP_VERSION, APP_BUILD_REVISION, parseAppVersion, parseAppBuildRevision, compareAppVersions, fetchDeployedAppMetadata, publicVersionHistoryUrl };`, context);
const api = context.api;
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));
for (const language of ["en", "es"]) i18n._setCatalog(language, catalogs[language]);

async function main() {
  assert.strictEqual(api.APP_VERSION, "0.9.067");
  assert(/^sha256:[a-f0-9]{64}$/.test(api.APP_BUILD_REVISION));
  assert.strictEqual(
    api.publicVersionHistoryUrl(api.APP_VERSION, "en"),
    "https://nicereturnvisits.org/version-history.html#version-0-9-067",
  );
  assert.strictEqual(
    api.publicVersionHistoryUrl(api.APP_VERSION, "es"),
    "https://nicereturnvisits.org/es/version-history.html#version-0-9-067",
  );
  const updatedMessage = { textContent: "" };
  const updatedLink = { href: "" };
  let updatedDialogShown = false;
  const noticeStart = source.indexOf("const showJustUpdatedNotice =");
  const noticeEnd = source.indexOf('\ndocument\n  .getElementById("btn-ok-updated")', noticeStart);
  assert(noticeStart >= 0 && noticeEnd > noticeStart);
  const showUpdatedNotice = vm.runInNewContext(
    `${source.slice(noticeStart, noticeEnd)}\nshowJustUpdatedNotice;`,
    {
      APP_VERSION: api.APP_VERSION,
      APP_JUST_UPDATED_KEY: "updated",
      sessionStorage: { getItem: () => "1", removeItem() {} },
      window: { NRVI18n: i18n, setTimeout: (callback) => callback() },
      document: {
        getElementById(id) {
          if (id === "app-updated-message") return updatedMessage;
          if (id === "app-updated-whats-new") return updatedLink;
          if (id === "app-updated-dialog") return { showModal() { updatedDialogShown = true; } };
          throw new Error(`Unexpected element ${id}`);
        },
        querySelector: () => null,
      },
      appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
      updatePublicVersionLink: (link) => {
        link.href = api.publicVersionHistoryUrl(api.APP_VERSION, i18n.getLanguage());
      },
    },
  );
  for (const [language, page] of [
    ["en", "version-history.html"],
    ["es", "es/version-history.html"],
  ]) {
    i18n._setCurrent(language);
    updatedDialogShown = false;
    showUpdatedNotice();
    assert(updatedMessage.textContent.includes(api.APP_VERSION), updatedMessage.textContent);
    assert(updatedLink.href.endsWith(`${page}#version-0-9-067`));
    assert(updatedDialogShown);
  }
  for (const invalid of ["1.0", "1.2.3.4", "01.2.3", "1.-1.0", "1.2.3-beta", "1.2.3\n", "", null, 123]) {
    assert.throws(() => api.parseAppVersion(invalid));
  }
  assert.deepStrictEqual(Array.from(api.parseAppVersion("0.9.060")), ["0", "9", "060"]);
  assert.deepStrictEqual(Array.from(api.parseAppVersion("0.9.061")), ["0", "9", "061"]);
  for (const invalid of [
    "1.0.0",
    "sha256:xyz",
    `sha256:${"A".repeat(64)}`,
    `sha256:${"a".repeat(64)}\n`,
    null,
  ]) {
    assert.throws(() => api.parseAppBuildRevision(invalid));
  }
  for (const [left, right, expected] of [
    ["0.9.0", "0.9.0", 0], ["1.0.0", "0.99.99", 1],
    ["1.10.0", "1.9.99", 1], ["1.0.10", "1.0.2", 1],
    ["0.9.0", "0.10.0", -1], ["0.9.5", "0.9.51", -1],
    ["0.9.51", "0.9.52", -1], ["0.9.52", "0.9.53", -1],
    ["0.9.53", "0.9.54", -1], ["0.9.54", "0.9.55", -1],
    ["0.9.55", "0.9.56", -1],
    ["0.9.56", "0.9.57", -1],
    ["0.9.57", "0.9.058", -1],
    ["0.9.058", "0.9.059", -1],
    ["0.9.059", "0.9.060", -1],
    ["0.9.060", "0.9.061", -1],
    ["0.9.061", "0.9.6", -1],
    ["0.9.059", "0.9.6", -1],
    ["0.9.058", "0.9.6", -1],
    ["0.9.53", "0.9.6", -1],
    ["0.9.6", "0.10.0", -1], ["99999999999999999999.0.0", "9.0.0", 1],
  ]) assert.strictEqual(api.compareAppVersions(left, right), expected);
  assert.throws(() => api.compareAppVersions("1.0.0", "1.01.0"));
  console.log("PASS  strict numeric MAJOR.MINOR.PATCH validation and comparison");

  const version = release.canonicalVersion(source);
  assert.strictEqual(version, api.APP_VERSION);
  assert.throws(() => release.canonicalVersion(`${source}\nconst APP_VERSION = "1.0.0";`));
  assert.throws(() => release.metadataFor("0.09.0"));
  const metadata = fs.readFileSync(path.join(root, "version.json"), "utf8");
  release.checkMetadata(metadata, version, api.APP_BUILD_REVISION);
  assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('id="app-version-badge"'));
  assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('<a id="app-version-badge"'));
  assert(source.includes('versionLabel.textContent = `v${APP_VERSION}`'));
  assert(source.includes("updatePublicVersionLink(versionBadge)"));
  assert(source.includes('updatePublicVersionLink(document.getElementById("app-updated-whats-new"))'));
  assert(fs.readFileSync(path.join(root, "styles.css"), "utf8").includes("#app-version-badge:focus-visible"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert(html.includes('id="app-version-label"'));
  assert(html.includes('id="app-version-update-indicator"'));
  assert(css.includes("left: 56px;"));
  assert(css.includes("position: absolute;"));
  assert(css.includes(".app-header-logo"));
  assert(css.includes("left: 4px;"));
  assert(css.includes("left: 56px;"));
  assert(css.includes("min-width: 44px;"));
  assert(html.includes('<h1 id="app-title" tabindex="-1">NRV - Contacts</h1>'));
  assert(html.includes('id="sync-status"'));
  assert(html.includes('id="filters-bar"'));
  assert(css.includes("right: 8px;"));
  assert(css.includes("@media (max-width: 380px)"));
  const titleStart = html.indexOf('<h1 id="app-title"');
  const badgeStart = html.indexOf('<a id="app-version-badge"');
  const syncStart = html.indexOf('id="sync-status"');
  const filterStart = html.indexOf('id="filters-bar"');
  assert(titleStart < badgeStart && badgeStart < syncStart && syncStart < filterStart);

  const headerStart = source.indexOf("  const updateHeaderTitle = () => {");
  const headerEnd = source.indexOf("\n\n  const setupNextStepsDialog", headerStart);
  assert(headerStart >= 0 && headerEnd > headerStart);
  const headerNodes = new Map([
    ["contact-modal", { style: { display: "none" } }],
    ["app-title", { textContent: "", setAttribute() {} }],
    ["app-version-badge", { textContent: "", href: "", ariaLabel: "", setAttribute(_name, value) { this.ariaLabel = value; } }],
    ["app-version-label", { textContent: "" }],
    ["app-version-update-indicator", { hidden: true }],
    ["modal-title", { textContent: "Contact" }],
  ]);
  const renderHeader = (updateAvailable, language = "en") => {
    i18n._setCurrent(language);
    vm.runInNewContext(
      `${source.slice(headerStart, headerEnd)}\nupdateHeaderTitle();`,
      {
        APP_VERSION: api.APP_VERSION,
        appUpdateAvailable: updateAvailable,
        currentViewId: "contacts-view",
        document: {
          body: { classList: { contains: () => false } },
          getElementById(id) { return headerNodes.get(id); },
        },
        appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
        updatePublicVersionLink: (link) => {
          link.href = api.publicVersionHistoryUrl(api.APP_VERSION, i18n.getLanguage());
        },
      },
    );
    return headerNodes;
  };
  assert.strictEqual(renderHeader(false).get("app-version-update-indicator").hidden, true);
  assert(!headerNodes.get("app-version-badge").ariaLabel.toLowerCase().includes("update is ready"));
  renderHeader(true, "en");
  assert.strictEqual(headerNodes.get("app-version-update-indicator").hidden, false);
  assert(headerNodes.get("app-version-badge").ariaLabel.includes("An update is ready"));
  renderHeader(true, "es");
  assert(headerNodes.get("app-version-badge").ariaLabel.includes("Hay una actualización disponible"));
  assert(headerNodes.get("app-version-badge").href.endsWith("#version-0-9-067"));
  assert.throws(() => release.checkMetadata('{"version":"1.0.0"}', version, api.APP_BUILD_REVISION));
  assert.throws(() => release.checkMetadata("not json", version));
  assert.throws(() => release.checkMetadata('{"version":"0.9.0","revision":"invalid"}', version, api.APP_BUILD_REVISION));
  assert.throws(() => release.checkMetadata(release.metadataFor(version, `sha256:${"a".repeat(64)}`), version, api.APP_BUILD_REVISION));
  assert.strictEqual(buildRevision.checkBuildFiles(), api.APP_BUILD_REVISION);
  assert.strictEqual(JSON.parse(metadata).version, api.APP_VERSION);
  assert.strictEqual(
    fs.readFileSync(path.join(root, "index.html"), "utf8")
      .match(/<meta name="nrv-build-revision" content="([^"]+)" \/>/)?.[1],
    api.APP_BUILD_REVISION,
  );
  assert(fs.readFileSync(path.join(root, "service-worker.js"), "utf8").includes("return-visits-shell-${BUILD_REVISION.slice(7)}"));
  execFileSync(process.execPath, [path.join(root, "scripts", "version.js"), "--check"]);
  console.log("PASS  generated metadata and service-worker cache use the internal asset revision");

  response = { ok: true, json: async () => ({ version: "0.10.0", revision: api.APP_BUILD_REVISION }) };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(await api.fetchDeployedAppMetadata())),
    { version: "0.10.0", revision: api.APP_BUILD_REVISION },
  );
  assert.strictEqual(fetchOptions.cache, "no-store");
  assert.strictEqual(new URL(requestedUrl).pathname, "/nrv/version.json");
  assert(new URL(requestedUrl).searchParams.has("check"));
  for (const bad of [
    null,
    [],
    {},
    { version: "1.0", revision: api.APP_BUILD_REVISION },
    { version: 1, revision: api.APP_BUILD_REVISION },
    { version: "0.9.0", revision: "invalid" },
    { version: "0.9.0", revision: api.APP_BUILD_REVISION, extra: true },
  ]) {
    response = { ok: true, json: async () => bad };
    await assert.rejects(api.fetchDeployedAppMetadata());
  }
  response = { ok: false, status: 404 };
  await assert.rejects(api.fetchDeployedAppMetadata());
  response = { ok: true, json: async () => { throw new SyntaxError("bad JSON"); } };
  await assert.rejects(api.fetchDeployedAppMetadata());
  response = new Error("offline");
  await assert.rejects(api.fetchDeployedAppMetadata());
  console.log("PASS  fresh deployment lookup rejects invalid metadata and network failures");

  const handlerMatch = /\.getElementById\("btn-check-updates"\)\s*\.addEventListener\("click", async/.exec(source);
  const handlerButton = handlerMatch ? handlerMatch.index : -1;
  const handlerStart = source.lastIndexOf("  document", handlerButton);
  const handlerEnd = source.indexOf("  new MutationObserver(updateHeaderTitle)", handlerStart);
  assert(handlerStart >= 0 && handlerEnd > handlerStart);
  let handler;
  const backupRestoreAction = { hidden: true };
  const button = { disabled: false };
  const status = { textContent: "" };
  let dialogs = 0;
  let reloads = 0;
  let updateCalls = 0;
  const cachedRevision = `sha256:${"a".repeat(64)}`;
  const updatedRevision = `sha256:${"b".repeat(64)}`;
  let deployed = { version: api.APP_VERSION, revision: cachedRevision };
  let worker = null;
  let available = false;
  let block = "";
  let updateError = false;
  let editDuringLookup = false;
  const registration = {
    update: async () => { updateCalls += 1; if (updateError) throw new Error("worker failure"); },
    get installing() { return worker; },
    waiting: null,
  };
  const removedLocalStorageKeys = [];
  const handlerContext = {
    document: { getElementById(id) {
      if (id === "btn-check-updates") return { addEventListener(event, callback) { handler = callback; } };
      if (id === "btn-open-backup-restore") return backupRestoreAction;
      if (id === "app-no-update-dialog") return { showModal() { dialogs += 1; } };
      if (id === "btn-get-app-update") return { hidden: true, addEventListener() {} };
      if (id === "app-current-version") return { textContent: "" };
      if (id === "app-running-version") return { textContent: "" };
      if (id === "app-update-status") return status;
      if (id === "app-whats-new-title") return { textContent: "" };
      if (id === "app-whats-new-list") return { replaceChildren() {} };
      if (id === "app-update-notice") return { hidden: true };
      throw new Error(`Unexpected element ${id}`);
    } },
    navigator: { onLine: true, serviceWorker: { getRegistration: async () => registration } },
    window: { setTimeout, clearTimeout },
    localStorage: { removeItem(key) { removedLocalStorageKeys.push(key); } },
    APP_UPDATE_PENDING_KEY: "pending",
    APP_VERSION: api.APP_VERSION,
    APP_BUILD_REVISION: cachedRevision,
    appUpdateStatus: status,
    get appUpdateAvailable() { return available; },
    getAppRefreshBlockMessage: () => block,
    revealAppRefreshBlock() {},
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
    fetchDeployedAppMetadata: async () => {
      if (editDuringLookup) block = "new unsaved edit";
      if (deployed instanceof Error) throw deployed;
      return deployed;
    },
    compareAppVersions: api.compareAppVersions,
    reloadAfterUpdate: () => { reloads += 1; },
    renderAppWhatsNew: () => {},
    console: { error() {} },
  };
  vm.runInNewContext(source.slice(handlerStart, handlerEnd), handlerContext);
  const check = async () => { button.disabled = false; status.textContent = ""; await handler({ currentTarget: button }); };
  i18n._setCurrent("en");
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.latest"]);
  deployed = { version: "0.10.0", revision: updatedRevision };
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.notReady"]);
  assert.strictEqual(reloads, 0);
  deployed = { version: "0.8.9", revision: updatedRevision };
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.latest"]);
  deployed = new Error("invalid metadata");
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.checkUnable"]);
  assert(!button.disabled);
  deployed = { version: api.APP_VERSION, revision: updatedRevision };
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.notReady"]);
  assert.strictEqual(reloads, 0);
  deployed = { version: api.APP_VERSION, revision: updatedRevision };
  worker = { state: "activated" };
  await check();
  assert.strictEqual(api.APP_VERSION, "0.9.067");
  assert.strictEqual(reloads, 0, "a changed internal revision is offered through Get Update");
  assert.deepStrictEqual(removedLocalStorageKeys, []);
  worker = null;
  available = true;
  deployed = { version: api.APP_VERSION, revision: cachedRevision };
  await check();
  assert.strictEqual(reloads, 0, "the verified update remains pending until Get Update");
  editDuringLookup = true;
  await check();
  assert.strictEqual(status.textContent, "new unsaved edit");
  assert.strictEqual(reloads, 0, "edits made during the lookup block prevent the update");
  editDuringLookup = false;
  available = false;
  block = "unsaved";
  const callsBeforeBlock = updateCalls;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.unsavedEdits"]);
  assert.strictEqual(updateCalls, callsBeforeBlock);
  block = "";
  delete handlerContext.navigator.serviceWorker;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.checkUnable"]);
  assert.strictEqual(backupRestoreAction.hidden, true);
  handlerContext.navigator.serviceWorker = { getRegistration: async () => registration };
  handlerContext.navigator.onLine = false;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.offline"]);
  assert.strictEqual(backupRestoreAction.hidden, true);
  handlerContext.navigator.onLine = true;
  updateError = true;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.checkUnable"]);
  assert.strictEqual(reloads, 0);

  const sectionStart = source.indexOf("  const openSettingsSection = async (sectionId) => {");
  const sectionEnd = source.indexOf('\n  document\n    .getElementById("btn-setup-wizard-next")', sectionStart);
  assert(sectionStart >= 0 && sectionEnd > sectionStart);
  let openBackupRestore;
  let targetSection;
  let settingsView = "";
  const backupSectionParent = { matches: (selector) => selector === "details.settings-section" };
  targetSection = {
    parentElement: backupSectionParent,
    open: false,
    scrollIntoView(options) { this.scrollOptions = options; },
  };
  const routeContext = {
    document: {
      getElementById(id) {
        if (id === "btn-open-backup-restore") {
          return { addEventListener(event, callback) { openBackupRestore = callback; } };
        }
        if (id === "settings-view") return { classList: { contains: () => false } };
        if (id === "backup-section") return targetSection;
        throw new Error(`Unexpected route element ${id}`);
      },
    },
    goToView(viewId) { settingsView = viewId; },
  };
  vm.runInNewContext(source.slice(sectionStart, sectionEnd), routeContext);
  await openBackupRestore();
  assert.strictEqual(settingsView, "settings-view");
  assert.strictEqual(targetSection.open, true);
  assert.strictEqual(targetSection.scrollOptions.block, "start");
  console.log("PASS  update states, failure handling and unsaved-edit safeguard");

  for (const language of ["en", "es"]) {
    i18n._setCurrent(language);
    for (const key of ["update.currentVersion", "update.notReady", "update.versionCheckFailed", "update.unsupported", "update.openBackupRestore", "app.versionLinkLabel", "update.done"]) {
      const text = i18n.t(key, { version: "0.9.0" });
      assert(!text.includes("{"), `${language} ${key} interpolates`);
      if (!catalogs[language][key].includes("{")) {
        assert.strictEqual(text, catalogs[language][key]);
      }
    }
    const versionLabel = { textContent: "" };
    const labelStart = source.indexOf('  document.getElementById("app-current-version").textContent = appText(');
    const labelEnd = source.indexOf("\n  );", labelStart);
    assert(labelStart >= 0 && labelEnd > labelStart);
    vm.runInNewContext(source.slice(labelStart, labelEnd + 5), {
      document: { getElementById: () => versionLabel },
      APP_VERSION: api.APP_VERSION,
      appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
    });
    assert.strictEqual(versionLabel.textContent, i18n.t("update.currentNotAvailable"));
    assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('id="app-current-version"'));
    assert.strictEqual(i18n.t("update.versionCheckFailed"), catalogs[language]["update.versionCheckFailed"]);
  }
  assert.strictEqual(
    catalogs.en["update.notReady"],
    "An update isn’t ready yet. Please try again later.",
  );
  assert.strictEqual(
    catalogs.en["update.unsupported"],
    "This browser can’t check for NRV updates. Before using NRV in another browser, make a backup of your saved information.",
  );
  assert.strictEqual(catalogs.en["update.openBackupRestore"], "Open Backup/Restore");
  assert.strictEqual(
    catalogs.es["update.notReady"],
    "Una actualización aún no está lista. Vuelve a intentarlo más tarde.",
  );
  assert.strictEqual(
    catalogs.es["update.unsupported"],
    "Este navegador no puede buscar actualizaciones de NRV. Antes de usar NRV en otro navegador, haz una copia de seguridad de tu información guardada.",
  );
  assert.strictEqual(catalogs.es["update.openBackupRestore"], "Abrir Copia de seguridad/restauración");
  console.log("PASS  version and update text is localized in English and Spanish");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
