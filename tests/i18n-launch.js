// Run with: node tests/i18n-launch.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
const dropboxSource = fs.readFileSync(path.join(root, "dropbox.js"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((code) => [
  code,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${code}.json`), "utf8")),
]));

function makeApp(search, saved) {
  const values = new Map(saved === undefined ? [] : [["nrv_language", saved]]);
  const selectors = Array.from({ length: 2 }, () => ({
    value: "",
    addEventListener(type, handler) { this[type] = handler; },
  }));
  const alerts = [];
  let reloads = 0;
  let confirmed = true;
  const location = {
    href: `https://example.test/nrv/${search}`,
    search,
    reload() { reloads += 1; },
  };
  const window = {
    location,
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    fetch: async (file) => ({
      ok: true,
      json: async () => catalogs[path.basename(file, ".json")],
    }),
    document: {
      documentElement: {},
      querySelectorAll: (selector) => selector === "[data-language-selector]" ? selectors : [],
    },
    history: {
      state: { existing: true },
      replaceState(state, unused, href) {
        assert.deepStrictEqual(state, { existing: true });
        location.href = href;
        location.search = new URL(href).search;
      },
    },
    confirm: () => confirmed,
    alert: (message) => alerts.push(message),
  };
  vm.runInNewContext(source, { window, URLSearchParams, URL, Intl, console });
  return {
    window, values, selectors, alerts,
    get reloads() { return reloads; },
    decline() { confirmed = false; },
  };
}

async function main() {
  const cases = [
    { query: "?lang=es", saved: undefined, expected: "es", stored: "es", name: "Spanish URL is selected and saved" },
    { query: "?lang=en", saved: "es", expected: "en", stored: "en", name: "English URL overrides Spanish and is saved" },
    { query: "?lang=es", saved: "en", expected: "es", stored: "es", name: "Spanish URL overrides English and is saved" },
    { query: "", saved: "es", expected: "es", stored: "es", name: "saved language is used without a parameter" },
    { query: "?lang=fr", saved: "es", expected: "es", stored: "es", name: "invalid URL language falls back to saved language" },
    { query: "?lang=fr", saved: "fr", expected: "en", stored: "fr", name: "invalid URL and saved language fall back to English" },
    { query: "", saved: undefined, expected: "en", stored: undefined, name: "English is the default" },
  ];
  for (const test of cases) {
    const app = makeApp(test.query, test.saved);
    assert.strictEqual(await app.window.NRVI18n.init(), test.expected, test.name);
    assert.strictEqual(app.values.get("nrv_language"), test.stored, test.name);
    assert.strictEqual(app.window.document.documentElement.lang, test.expected, test.name);
    assert(app.selectors.every((selector) => selector.value === test.expected), test.name);
    console.log(`PASS  ${test.name}`);
  }

  const oauth = makeApp("?lang=es&code=abc&state=xyz&other=keep", "en");
  const pending = oauth.window.NRVI18n.init();
  oauth.window.location.search = "?code=abc&state=xyz";
  await pending;
  assert.strictEqual(oauth.window.NRVI18n.getLanguage(), "es");
  assert.strictEqual(new URL(oauth.window.location.href).searchParams.get("code"), "abc");
  assert.strictEqual(new URL(oauth.window.location.href).searchParams.get("other"), "keep");
  console.log("PASS  language is captured before Dropbox can change the URL");

  const change = makeApp("?lang=es&other=keep&state=xyz", "es");
  await change.window.NRVI18n.init();
  change.selectors[0].value = "en";
  await change.selectors[0].change();
  const url = new URL(change.window.location.href);
  assert.strictEqual(change.values.get("nrv_language"), "en");
  assert.strictEqual(url.searchParams.get("lang"), "en");
  assert.strictEqual(url.searchParams.get("other"), "keep");
  assert.strictEqual(url.searchParams.get("state"), "xyz");
  assert.strictEqual(change.reloads, 1);
  console.log("PASS  selector saves, preserves unrelated parameters, and reloads");

  const intact = makeApp("?lang=es", "en");
  const stored = new Map([
    ["return_visits_contacts", '[{"firstName":"Ana","country":"United States","notesHistory":[{"text":"Visit"}]}]'],
    ["return_visits_settings", '{"country":"United States","cities":["Lima"]}'],
    ["return_visits_agreement_version", "2026-10-30"],
    ["return_visits_dropbox", '{"refreshToken":"synthetic"}'],
  ]);
  for (const [key, value] of stored) intact.values.set(key, value);
  await intact.window.NRVI18n.init();
  intact.selectors[0].value = "en";
  await intact.selectors[0].change();
  for (const [key, value] of stored) assert.strictEqual(intact.values.get(key), value, key);
  assert.strictEqual(intact.reloads, 1);
  console.log("PASS  initialization and language switch preserve unrelated stored values");

  const cancel = makeApp("?lang=es", "es");
  await cancel.window.NRVI18n.init();
  cancel.decline();
  cancel.selectors[0].value = "en";
  await cancel.selectors[0].change();
  assert.strictEqual(cancel.values.get("nrv_language"), "es");
  assert.strictEqual(cancel.selectors[0].value, "es");
  assert.strictEqual(cancel.reloads, 0);
  console.log("PASS  cancelling a language change preserves the current choice");

  const failure = makeApp("", "en");
  await failure.window.NRVI18n.init();
  failure.window.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  failure.selectors[0].value = "es";
  await failure.selectors[0].change();
  assert.strictEqual(failure.window.NRVI18n.getLanguage(), "en");
  assert.strictEqual(failure.selectors[0].value, "en");
  assert.strictEqual(failure.reloads, 0);
  assert.strictEqual(failure.alerts.length, 1);
  console.log("PASS  storage failure is reported without reloading");

  const unavailable = makeApp("?lang=es", "en");
  unavailable.window.fetch = async (file) => {
    if (file.endsWith("es.json")) throw new Error("catalog unavailable");
    return { ok: true, json: async () => catalogs.en };
  };
  await assert.rejects(unavailable.window.NRVI18n.init(), /catalog unavailable/);
  assert.strictEqual(unavailable.values.get("nrv_language"), "es");
  assert.strictEqual(unavailable.window.document.documentElement.lang, "en");
  assert.strictEqual(typeof unavailable.selectors[0].change, "function");
  console.log("PASS  explicit choice persists and selectors remain available if a catalog fails");

  for (const oauthError of [false, true]) {
    const url = new URL(oauthError
      ? "https://example.test/nrv/?lang=es&error=access_denied&state=xyz&other=keep#part"
      : "https://example.test/nrv/?lang=es&code=abc&state=xyz&other=keep#part");
    const local = new Map([["return_visits_dropbox_pending", JSON.stringify({ verifier: "proof", state: "xyz" })]]);
    const session = new Map();
    const storage = (map) => ({
      getItem: (key) => map.get(key) || null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    });
    const location = { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search };
    const window = {
      location,
      history: { state: { existing: true }, replaceState(state, unused, href) {
        assert.deepStrictEqual(state, { existing: true });
        location.href = href;
      } },
    };
    let tokenRequest;
    const fetch = async (target, options) => {
      tokenRequest = { target, options };
      return { ok: true, json: async () => ({ refresh_token: "refresh", access_token: "access", expires_in: 3600 }) };
    };
    vm.runInNewContext(dropboxSource, {
      window, URL, URLSearchParams, localStorage: storage(local),
      sessionStorage: storage(session), fetch, console,
    });
    await window.RVDropbox.ready;
    const cleaned = new URL(location.href);
    assert.strictEqual(cleaned.searchParams.get("lang"), "es");
    assert.strictEqual(cleaned.searchParams.get("other"), "keep");
    assert.strictEqual(cleaned.hash, "#part");
    for (const key of ["code", "state", "error"]) assert.strictEqual(cleaned.searchParams.has(key), false);
    const result = JSON.parse(session.get("return_visits_dropbox_result"));
    assert.strictEqual(result.ok, !oauthError);
    assert.strictEqual(local.has("return_visits_dropbox_pending"), false);
    if (!oauthError) {
      assert.strictEqual(tokenRequest.options.body.get("code"), "abc");
      assert.strictEqual(tokenRequest.options.body.get("redirect_uri"), "https://example.test/nrv/");
      assert.strictEqual(JSON.parse(local.get("return_visits_dropbox")).refreshToken, "refresh");
    }
    console.log(`PASS  Dropbox ${oauthError ? "denial" : "success"} callback preserves unrelated parameters`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
