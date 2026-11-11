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

function makeApp(search, saved, values = new Map(saved === undefined ? [] : [["nrv_language", saved]])) {
  const alerts = [];
  const location = {
    href: `https://example.test/app/${search}`,
    search,
  };
  const window = {
    location,
    setTimeout,
    clearTimeout,
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
      querySelectorAll: () => [],
    },
    history: {
      state: { existing: true },
      replaceState(state, unused, href) {
        assert.deepStrictEqual(state, { existing: true });
        location.href = href;
        location.search = new URL(href).search;
      },
    },
    NRVDialogs: { alert: (message) => alerts.push(message) },
  };
  vm.runInNewContext(source, { window, URLSearchParams, URL, Intl, console });
  return { window, values, alerts };
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
    console.log(`PASS  ${test.name}`);
  }

  for (const language of ["en", "es"]) {
    const launch = makeApp(`?lang=${language}`, language === "en" ? "es" : "en");
    await launch.window.NRVI18n.init();
    const reopen = makeApp("", undefined, launch.values);
    assert.strictEqual(await reopen.window.NRVI18n.init(), language);
    assert.strictEqual(reopen.window.document.documentElement.lang, language);
    console.log(`PASS  ${language} launch persists when reopened without a language parameter`);
  }

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(html.includes('id="setup-language"'), "setup offers a language preference");
  assert(!html.includes('id="settings-language"'), "Settings has no app language selector");
  assert(html.includes('id="setup-address-country"'), "setup offers Country Addressing");
  assert(html.includes('id="settings-address-country"'), "Settings offers Country Addressing");
  assert(!source.includes("data-language-selector"));
  console.log("PASS  language and Country Addressing preferences are separate in setup and Settings");

  const selectable = makeApp("", "en");
  await selectable.window.NRVI18n.init();
  selectable.window.NRVI18n.setLanguage("es");
  assert.strictEqual(selectable.values.get("nrv_language"), "es");
  assert.throws(() => selectable.window.NRVI18n.setLanguage("fr"), /Unsupported language/);
  console.log("PASS  language preference saves independently and rejects unsupported languages");

  const deferred = makeApp("?lang=es", "en");
  await deferred.window.NRVI18n.init({ deferExplicitSave: true });
  assert.strictEqual(deferred.values.get("nrv_language"), "en");
  await deferred.window.NRVI18n.persistPendingLanguagePreference();
  assert.strictEqual(deferred.values.get("nrv_language"), "es");
  console.log("PASS  startup can defer a URL language preference until after verification");

  const websiteLink = html.match(/<a\s+href="([^"]+)"\s+data-i18n="([^"]+)"\s+data-i18n-attr="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)
    .find((link) => link.includes('data-i18n="launch.websiteLink"'));
  assert(websiteLink, "setup screen has a translated website link");
  const linkParts = websiteLink.match(/href="([^"]+)"\s+data-i18n="([^"]+)"\s+data-i18n-attr="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
  for (const [language, text, url] of [
    ["en", "← Back to NRV website", "https://nicereturnvisits.org/index.html"],
    ["es", "← Volver al sitio web de NRV", "https://nicereturnvisits.org/es/index.html"],
  ]) {
    const app = makeApp(`?lang=${language}`, undefined);
    const link = {
      dataset: { i18n: linkParts[2], i18nAttr: linkParts[3] },
      textContent: linkParts[4],
      href: linkParts[1],
      setAttribute(name, value) { this[name] = value; },
    };
    app.window.document.querySelectorAll = (selector) =>
      selector === "[data-i18n]" || selector === "[data-i18n-attr]" ? [link] : [];
    await app.window.NRVI18n.init();
    assert.strictEqual(link.textContent, text);
    assert.strictEqual(link.href, url);
    console.log(`PASS  ${language} setup link uses the correct text and website route`);
  }

  const oauth = makeApp("?lang=es&code=abc&state=xyz&other=keep", "en");
  const pending = oauth.window.NRVI18n.init();
  oauth.window.location.search = "?code=abc&state=xyz";
  await pending;
  assert.strictEqual(oauth.window.NRVI18n.getLanguage(), "es");
  assert.strictEqual(new URL(oauth.window.location.href).searchParams.get("code"), "abc");
  assert.strictEqual(new URL(oauth.window.location.href).searchParams.get("other"), "keep");
  console.log("PASS  language is captured before Dropbox can change the URL");

  for (const [language, country] of [["en", "Spain"], ["es", "United States"]]) {
    const intact = makeApp(`?lang=${language}`, undefined);
    const stored = new Map([
      ["return_visits_contacts", JSON.stringify([{ firstName: "Ana", country, notesHistory: [{ text: "Visit" }] }])],
      ["return_visits_settings", JSON.stringify({ country, cities: ["Lima"] })],
      ["return_visits_agreement_version", "2026-10-30"],
      ["return_visits_dropbox", '{"refreshToken":"synthetic"}'],
    ]);
    for (const [key, value] of stored) intact.values.set(key, value);
    assert.strictEqual(await intact.window.NRVI18n.init(), language);
    for (const [key, value] of stored) assert.strictEqual(intact.values.get(key), value, key);
    const reopen = makeApp("", undefined, intact.values);
    assert.strictEqual(await reopen.window.NRVI18n.init(), language);
    for (const [key, value] of stored) assert.strictEqual(intact.values.get(key), value, key);
  }
  console.log("PASS  launch and reopen preserve stored data and do not derive language from country");

  const failure = makeApp("?lang=es", "en");
  failure.window.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  assert.strictEqual(await failure.window.NRVI18n.init(), "es");
  assert.strictEqual(failure.values.get("nrv_language"), "en");
  assert.strictEqual(failure.alerts.length, 1);
  assert.strictEqual(failure.alerts[0], catalogs.es["language.saveError"]);
  console.log("PASS  storage failure is reported while the selected language is used");

  const unavailable = makeApp("?lang=es", "en");
  unavailable.window.fetch = async (file) => {
    if (file.endsWith("es.json")) throw new Error("catalog unavailable");
    return { ok: true, json: async () => catalogs.en };
  };
  await assert.rejects(unavailable.window.NRVI18n.init(), /catalog unavailable/);
  assert.strictEqual(unavailable.values.get("nrv_language"), "es");
  assert.strictEqual(unavailable.window.document.documentElement.lang, "en");
  console.log("PASS  explicit choice persists if a catalog fails");

  for (const oauthError of [false, true]) {
    const url = new URL(oauthError
      ? "https://example.test/app/?lang=es&error=access_denied&state=xyz&other=keep#part"
      : "https://example.test/app/?lang=es&code=abc&state=xyz&other=keep#part");
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
      assert.strictEqual(tokenRequest.options.body.get("redirect_uri"), "https://example.test/app/");
      assert.strictEqual(JSON.parse(local.get("return_visits_dropbox")).refreshToken, "refresh");
    }
    console.log(`PASS  Dropbox ${oauthError ? "denial" : "success"} callback preserves unrelated parameters`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
