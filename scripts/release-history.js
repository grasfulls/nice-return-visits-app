// Run with: node scripts/release-history.js --write|--check [--site <website-directory>]
const fs = require("fs");
const path = require("path");
const { canonicalVersion } = require("./version.js");

const root = path.join(__dirname, "..");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const compareVersions = (left, right) => {
  const a = left.split(".");
  const b = right.split(".");
  for (let i = 0; i < 3; i += 1) {
    if (a[i].length !== b[i].length) return a[i].length > b[i].length ? 1 : -1;
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
};
const validateHistory = (history, currentVersion) => {
  if (!Array.isArray(history) || history.length === 0) throw new Error("Release history must not be empty.");
  history.forEach((release, index) => {
    if (!release || typeof release !== "object" || typeof release.version !== "string" ||
        !versionPattern.test(release.version)) throw new Error("Invalid release version.");
    if (index && compareVersions(history[index - 1].version, release.version) <= 0) {
      throw new Error("Release history must be in newest-first order without duplicates.");
    }
    for (const language of ["en", "es"]) {
      const entry = release[language];
      if (!entry || typeof entry.title !== "string" || !entry.title.trim() ||
          !Array.isArray(entry.changes) || entry.changes.length < 1 || entry.changes.length > 5 ||
          entry.changes.some((change) => typeof change !== "string" || !change.trim())) {
        throw new Error(`Invalid ${language} notes for ${release.version}.`);
      }
    }
    if (release.en.changes.length !== release.es.changes.length) {
      throw new Error(`Release ${release.version} must have matching translations.`);
    }
  });
  if (history[0].version !== currentVersion) throw new Error("Latest release notes must match APP_VERSION.");
};
const replaceBlock = (contents, lines, indent) => {
  const start = "<!-- release-notes:start -->";
  const end = "<!-- release-notes:end -->";
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex ||
      contents.indexOf(start, startIndex + start.length) !== -1 ||
      contents.indexOf(end, endIndex + end.length) !== -1) {
    throw new Error("Expected one release notes block.");
  }
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  return contents.slice(0, startIndex + start.length) + newline +
    lines.map((line) => indent + line).join(newline) + newline + indent +
    contents.slice(endIndex);
};
const appLines = (release) => [
  `<p data-i18n="release.current.title">${escapeHtml(release.en.title)}</p>`,
  "<ul>",
  ...release.en.changes.map((change, index) =>
    `  <li data-i18n="release.current.change${index + 1}">${escapeHtml(change)}</li>`),
  "</ul>",
];
const siteLines = (history, language) => history.flatMap((release) => [
  '<section class="faq-item">',
  `  <h2>${escapeHtml(release.version)} — ${escapeHtml(release[language].title)}</h2>`,
  "  <ul>",
  ...release[language].changes.map((change) => `    <li>${escapeHtml(change)}</li>`),
  "  </ul>",
  "</section>",
]);
const catalogFor = (contents, release, language) => {
  const catalog = JSON.parse(contents);
  Object.keys(catalog).filter((key) => key.startsWith("release.current.")).forEach((key) => delete catalog[key]);
  catalog["release.current.title"] = release[language].title;
  release[language].changes.forEach((change, index) => {
    catalog[`release.current.change${index + 1}`] = change;
  });
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  return JSON.stringify(catalog, null, 2).replace(/\n/g, newline) + newline;
};
const generate = (mode, site) => {
  const history = JSON.parse(fs.readFileSync(path.join(root, "release-history.json"), "utf8"));
  const version = canonicalVersion(fs.readFileSync(path.join(root, "app.js"), "utf8"));
  validateHistory(history, version);
  const outputs = [];
  const add = (file, render) => {
    const previous = fs.readFileSync(file, "utf8");
    outputs.push({ file, previous, next: render(previous) });
  };
  add(path.join(root, "index.html"), (html) => replaceBlock(html, appLines(history[0]), "                "));
  for (const language of ["en", "es"]) {
    add(path.join(root, "locales", `${language}.json`), (contents) => catalogFor(contents, history[0], language));
    if (site) {
      const siteFile = language === "en" ? "version-history.html" : path.join("es", "version-history.html");
      add(path.join(site, siteFile), (html) => replaceBlock(html, siteLines(history, language), "    "));
    }
  }
  const changed = outputs.filter(({ previous, next }) => previous !== next);
  if (mode === "--check" && changed.length) {
    throw new Error(`Release history output is out of date: ${changed.map(({ file }) => file).join(", ")}`);
  }
  if (mode === "--write") changed.forEach(({ file, next }) => fs.writeFileSync(file, next));
  console.log(`Release notes match NRV ${version}${site ? " in the app and website" : " in the app"}.`);
};

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (!["--write", "--check"].includes(args[0]) ||
        !(args.length === 1 || (args.length === 3 && args[1] === "--site" && args[2]))) {
      throw new Error("Usage: node scripts/release-history.js --write|--check [--site <website-directory>]");
    }
    generate(args[0], args.length === 3 ? path.resolve(args[2]) : null);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateHistory, compareVersions, replaceBlock, appLines, siteLines, catalogFor };
