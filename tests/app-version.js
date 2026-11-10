// Run with: node tests/app-version.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const i18n = require("../i18n.js");
const release = require("../scripts/version.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
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
this.api = { APP_VERSION, parseAppVersion, compareAppVersions, fetchDeployedAppVersion, publicVersionHistoryUrl };`, context);
const api = context.api;
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));
for (const language of ["en", "es"]) i18n._setCatalog(language, catalogs[language]);

async function main() {
  assert.strictEqual(api.APP_VERSION, "0.9.52");
  assert.strictEqual(
    api.publicVersionHistoryUrl(api.APP_VERSION, "en"),
    "https://nicereturnvisits.org/version-history.html#version-0-9-52",
  );
  assert.strictEqual(
    api.publicVersionHistoryUrl(api.APP_VERSION, "es"),
    "https://nicereturnvisits.org/es/version-history.html#version-0-9-52",
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
    assert(updatedLink.href.endsWith(`${page}#version-0-9-52`));
    assert(updatedDialogShown);
  }
  for (const invalid of ["1.0", "1.2.3.4", "01.2.3", "1.-1.0", "1.2.3-beta", "1.2.3\n", "", null, 123]) {
    assert.throws(() => api.parseAppVersion(invalid));
  }
  for (const [left, right, expected] of [
    ["0.9.0", "0.9.0", 0], ["1.0.0", "0.99.99", 1],
    ["1.10.0", "1.9.99", 1], ["1.0.10", "1.0.2", 1],
    ["0.9.0", "0.10.0", -1], ["0.9.5", "0.9.51", -1],
    ["0.9.51", "0.9.52", -1], ["0.9.53", "0.9.6", -1],
    ["0.9.6", "0.10.0", -1], ["99999999999999999999.0.0", "9.0.0", 1],
  ]) assert.strictEqual(api.compareAppVersions(left, right), expected);
  assert.throws(() => api.compareAppVersions("1.0.0", "1.01.0"));
  console.log("PASS  strict numeric MAJOR.MINOR.PATCH validation and comparison");

  const version = release.canonicalVersion(source);
  assert.strictEqual(version, api.APP_VERSION);
  assert.throws(() => release.canonicalVersion(`${source}\nconst APP_VERSION = "1.0.0";`));
  assert.throws(() => release.metadataFor("0.09.0"));
  const metadata = fs.readFileSync(path.join(root, "version.json"), "utf8");
  release.checkMetadata(metadata, version);
  assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('id="app-version-badge"'));
  assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('<a id="app-version-badge"'));
  assert(source.includes("versionBadge.textContent = `v${APP_VERSION}`"));
  assert(source.includes("updatePublicVersionLink(versionBadge)"));
  assert(source.includes('updatePublicVersionLink(document.getElementById("app-updated-whats-new"))'));
  assert(fs.readFileSync(path.join(root, "styles.css"), "utf8").includes("#app-version-badge:focus-visible"));
  assert.throws(() => release.checkMetadata('{"version":"1.0.0"}', version));
  assert.throws(() => release.checkMetadata("not json", version));
  assert.throws(() => release.checkMetadata('{"version":"0.9.0","extra":true}', version));
  execFileSync(process.execPath, [path.join(root, "scripts", "version.js"), "--check"]);
  console.log("PASS  generated deployment metadata matches canonical version");

  response = { ok: true, json: async () => ({ version: "0.10.0" }) };
  assert.strictEqual(await api.fetchDeployedAppVersion(), "0.10.0");
  assert.strictEqual(fetchOptions.cache, "no-store");
  assert.strictEqual(new URL(requestedUrl).pathname, "/nrv/version.json");
  assert(new URL(requestedUrl).searchParams.has("check"));
  for (const bad of [null, [], {}, { version: "1.0" }, { version: 1 }, { version: "0.9.0", extra: true }]) {
    response = { ok: true, json: async () => bad };
    await assert.rejects(api.fetchDeployedAppVersion());
  }
  response = { ok: false, status: 404 };
  await assert.rejects(api.fetchDeployedAppVersion());
  response = { ok: true, json: async () => { throw new SyntaxError("bad JSON"); } };
  await assert.rejects(api.fetchDeployedAppVersion());
  response = new Error("offline");
  await assert.rejects(api.fetchDeployedAppVersion());
  console.log("PASS  fresh deployment lookup rejects invalid metadata and network failures");

  const handlerMatch = /\.getElementById\("btn-check-updates"\)\s*\.addEventListener\("click", async/.exec(source);
  const handlerButton = handlerMatch ? handlerMatch.index : -1;
  const handlerStart = source.lastIndexOf("  document", handlerButton);
  const handlerEnd = source.indexOf("  new MutationObserver(updateHeaderTitle)", handlerStart);
  assert(handlerStart >= 0 && handlerEnd > handlerStart);
  let handler;
  const button = { disabled: false };
  const status = { textContent: "" };
  let dialogs = 0;
  let reloads = 0;
  let updateCalls = 0;
  let deployed = "0.9.52";
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
  const handlerContext = {
    document: { getElementById(id) {
      if (id === "btn-check-updates") return { addEventListener(event, callback) { handler = callback; } };
      if (id === "app-no-update-dialog") return { showModal() { dialogs += 1; } };
      throw new Error(`Unexpected element ${id}`);
    } },
    navigator: { onLine: true, serviceWorker: { getRegistration: async () => registration } },
    window: { setTimeout, clearTimeout },
    localStorage: { removeItem() {} },
    APP_UPDATE_PENDING_KEY: "pending",
    APP_VERSION: api.APP_VERSION,
    appUpdateStatus: status,
    get appUpdateAvailable() { return available; },
    getAppRefreshBlockMessage: () => block,
    revealAppRefreshBlock() {},
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
    fetchDeployedAppVersion: async () => {
      if (editDuringLookup) block = "new unsaved edit";
      if (deployed instanceof Error) throw deployed;
      return deployed;
    },
    compareAppVersions: api.compareAppVersions,
    reloadAfterUpdate: () => { reloads += 1; },
    console: { error() {} },
  };
  vm.runInNewContext(source.slice(handlerStart, handlerEnd), handlerContext);
  const check = async () => { button.disabled = false; status.textContent = ""; await handler({ currentTarget: button }); };
  i18n._setCurrent("en");
  await check();
  assert.strictEqual(dialogs, 1);
  assert.strictEqual(status.textContent, catalogs.en["update.latest"]);
  deployed = "0.10.0";
  await check();
  assert(status.textContent.includes("0.10.0"));
  assert.strictEqual(dialogs, 1);
  assert.strictEqual(reloads, 0);
  deployed = "0.8.9";
  await check();
  assert(status.textContent.includes("older"));
  deployed = new Error("invalid metadata");
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.versionCheckFailed"]);
  assert(!button.disabled);
  deployed = "0.9.52";
  worker = { state: "activated" };
  await check();
  assert.strictEqual(reloads, 1, "same version does not suppress worker update");
  worker = null;
  available = true;
  await check();
  assert.strictEqual(reloads, 2, "previously activated update still refreshes");
  editDuringLookup = true;
  await check();
  assert.strictEqual(status.textContent, "new unsaved edit");
  assert.strictEqual(reloads, 2, "edits made during the lookup block refresh");
  editDuringLookup = false;
  available = false;
  block = "unsaved";
  const callsBeforeBlock = updateCalls;
  await check();
  assert.strictEqual(status.textContent, "unsaved");
  assert.strictEqual(updateCalls, callsBeforeBlock);
  block = "";
  handlerContext.navigator.onLine = false;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.offline"]);
  handlerContext.navigator.onLine = true;
  updateError = true;
  await check();
  assert.strictEqual(status.textContent, catalogs.en["update.versionCheckFailed"]);
  assert.strictEqual(dialogs, 1);
  assert.strictEqual(reloads, 2);
  console.log("PASS  update states, failure handling and unsaved-edit safeguard");

  for (const language of ["en", "es"]) {
    i18n._setCurrent(language);
    for (const key of ["update.currentVersion", "update.versionMismatch", "update.versionNotReady", "app.versionLinkLabel", "update.done"]) {
      const text = i18n.t(key, { version: "0.9.0", deployed: "0.8.0", current: "0.9.0" });
      assert(!text.includes("{"), `${language} ${key} interpolates`);
      assert(text.includes("0.9.0") || text.includes("0.8.0"));
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
    assert.strictEqual(versionLabel.textContent, i18n.t("update.currentVersion", { version: api.APP_VERSION }));
    assert(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('id="app-current-version"'));
    assert.strictEqual(i18n.t("update.versionCheckFailed"), catalogs[language]["update.versionCheckFailed"]);
  }
  console.log("PASS  version and update text is localized in English and Spanish");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
