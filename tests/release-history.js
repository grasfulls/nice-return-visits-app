// Run with: node tests/release-history.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const i18n = require("../i18n.js");
const generator = require("../scripts/release-history.js");
const { canonicalVersion } = require("../scripts/version.js");

const root = path.join(__dirname, "..");
const history = JSON.parse(fs.readFileSync(path.join(root, "release-history.json"), "utf8"));
const version = canonicalVersion(fs.readFileSync(path.join(root, "app.js"), "utf8"));
generator.validateHistory(history, version);
assert.strictEqual(history[0].version, version);
assert.strictEqual(history[0].version, "0.9.53");
assert(!/important/i.test(history[0].en.title));
assert(!/important/i.test(history[0].es.title));
assert.throws(() => generator.validateHistory([], version));
assert.throws(() => generator.validateHistory(history, "1.0.0"));
assert.throws(() => generator.validateHistory([history[0], history[0]], version));
assert.throws(() => generator.validateHistory([{ ...history[0], version: "01.2.3" }], "01.2.3"));
assert.throws(() => generator.validateHistory([{ ...history[0], es: { title: "x", changes: [] } }], version));
assert.throws(() => generator.validateHistory([{ ...history[0], es: { title: "x", changes: ["x", "y", "z"] } }], version));
assert(generator.compareVersions("1.10.0", "1.9.9") > 0);
assert(generator.compareVersions("0.9.0", "1.0.0") < 0);
assert(generator.compareVersions("0.9.5", "0.9.51") < 0);
assert(generator.compareVersions("0.9.52", "0.9.53") < 0);
assert(generator.compareVersions("0.9.53", "0.9.6") < 0);
const older = { ...history[0], version: "0.8.0" };
const ordered = [history[0], older];
generator.validateHistory(ordered, version);
assert.throws(() => generator.validateHistory([older, history[0]], "0.8.0"));
const enSite = generator.siteLines(ordered, "en").join("\n");
assert(enSite.indexOf(version) < enSite.indexOf("0.8.0"));
assert(enSite.includes(`id="version-${version.replace(/\./g, "-")}"`));
assert(!generator.appLines(history[0]).join("\n").includes("0.8.0"));
assert(generator.siteLines([{ ...history[0], en: { title: "Test", changes: ["<test> & B"] } }], "en")
  .join("\n").includes("&lt;test&gt; &amp; B"));
assert.throws(() => generator.replaceBlock("no markers", [], ""));
execFileSync(process.execPath, [path.join(root, "scripts", "release-history.js"), "--check"]);

for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  i18n._setCatalog(language, catalog);
  i18n._setCurrent(language);
  assert.strictEqual(i18n.t("release.current.title"), history[0][language].title);
  history[0][language].changes.forEach((text, index) => {
    assert.strictEqual(i18n.t(`release.current.change${index + 1}`), text);
  });
  assert.notStrictEqual(i18n.t("update.whatsNew"), "update.whatsNew");
}

const site = process.env.NRV_WEBSITE_PATH;
if (site) {
  execFileSync(process.execPath, [path.join(root, "scripts", "release-history.js"), "--check", "--site", site]);
  for (const language of ["en", "es"]) {
    const page = fs.readFileSync(path.join(site, language === "en" ? "" : "es", "version-history.html"), "utf8");
    for (const line of generator.siteLines(history, language)) assert(page.includes(line));
    assert(page.includes('<body class="site-shell">'));
    assert(page.includes('<header class="site-header">'));
    assert(page.includes('<main class="site-main content">'));
    assert(page.includes("assets/css/styles.css"));
    assert(page.includes("assets/js/language-menu.js"));
    assert(page.includes(language === "en" ? "es/version-history.html" : "../version-history.html"));
    assert(page.includes(language === "en" ? '<h1>What\'s New</h1>' : "<h1>Novedades</h1>"));
    assert(page.includes(`id="version-${version.replace(/\./g, "-")}"`));
    const home = fs.readFileSync(path.join(site, language === "en" ? "" : "es", "index.html"), "utf8");
    assert(home.includes('href="version-history.html"'));
    assert(home.includes(language === "en" ? ">What's New</a>" : ">Novedades</a>"));
  }
  console.log("PASS  website pages match shared notes and existing layout/language links");
} else {
  console.log("SKIP  website consistency (set NRV_WEBSITE_PATH to the website repository)");
}
console.log("PASS  version matching, newest-first history, generated app notes, and translations");
