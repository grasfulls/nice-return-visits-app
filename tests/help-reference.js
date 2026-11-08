// Run with: NRV_WEBSITE_PATH=<website directory> node tests/help-reference.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const app = path.join(__dirname, "..");
const site = process.env.NRV_WEBSITE_PATH;

function inspect(file, requiredIds) {
  const html = fs.readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.strictEqual(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
  for (const id of requiredIds) assert(ids.includes(id), `${file}: missing #${id}`);
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, "&");
    if (/^(?:https?:|mailto:)/.test(href)) continue;
    const [target, fragment] = href.split("#");
    const name = target.split("?")[0];
    const targetFile = name && name !== "./"
      ? path.resolve(path.dirname(file), name)
      : file;
    assert(fs.existsSync(targetFile), `${file}: missing ${href}`);
    if (fragment && targetFile.endsWith(".html")) {
      const targetHtml = targetFile === file ? html : fs.readFileSync(targetFile, "utf8");
      assert(targetHtml.includes(`id="${fragment}"`), `${file}: missing ${href}`);
    }
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
      assert(fs.existsSync(path.resolve(path.dirname(file), match[1])), `${file}: missing image ${match[1]}`);
    }
  }
  assert(!/>[^<]*grasfulls\.github/i.test(html), `${file}: visible hosting address`);
  return ids;
}

const common = [
  "install-guide", "add-and-organize-contacts", "find-contacts-and-record-visits",
  "time-in-service", "print-contacts", "passphrase-optional", "recovery-code",
  "backup", "cloud-backup", "sync", "consolidate", "remove-data", "troubleshooting",
];
for (const [language, filename] of [["en", "help.html"], ["es", "help-es.html"]]) {
  inspect(path.join(app, filename), common);
  if (site) {
    const websiteFile = language === "en" ? path.join(site, "help.html") : path.join(site, "es", "help.html");
    inspect(websiteFile, common);
    const appHtml = fs.readFileSync(path.join(app, filename), "utf8").replace(/\r\n/g, "\n");
    const websiteHtml = fs.readFileSync(websiteFile, "utf8").replace(/\r\n/g, "\n");
    let main = appHtml.split("<main>")[1].split("</main>")[0];
    if (language === "en") {
      main = main.replace(/\s*<p class="screen-only">.*?<\/p>/, "");
      main = main.replaceAll("./docs/", "assets/docs/");
      main = main.replaceAll(
        "https://nicereturnvisits.org/assets/docs/",
        "assets/docs/",
      );
      main = main.replace('<h3 id="remove-data">', '<span id="stop-using-the-app-and-remove-its-saved-data"></span>\n      <h3 id="remove-data">');
    } else {
      main = main.replaceAll("./docs/", "../assets/docs/");
      main = main.replaceAll(
        "https://nicereturnvisits.org/assets/docs/",
        "../assets/docs/",
      );
      main = main.replace('href="./privacy.html"', 'href="privacy.html"').replace('href="./terms.html"', 'href="terms.html"');
    }
    main = main.replaceAll(
      `href="./index.html?lang=${language}&amp;install=1"`,
      `href="https://nicereturnvisits.org/app/?lang=${language}&amp;install=1"`,
    );
    if (language === "en") {
      main = main.replaceAll(
        'href="./index.html?lang=en"',
        'href="https://nicereturnvisits.org/app/?lang=en"',
      );
    }
    assert(websiteHtml.includes(main.trim()), `${language}: website and app reference content differ`);
    const images = ["install-browser-en.png", "install-browser-es.png"];
    for (const name of images) {
      assert(fs.readFileSync(path.join(app, "docs", name)).equals(fs.readFileSync(path.join(site, "assets", "docs", name))), `${name}: published copy differs`);
    }
  }
  console.log(`PASS  ${language} Help anchors and local links`);
}
const publishedPdfs = [
  {
    name: "NRV-Setup-User-Guide.pdf",
    url: "https://nicereturnvisits.org/assets/docs/NRV-Setup-User-Guide.pdf",
    page: "help.html",
  },
  {
    name: "NRV-Setup-User-Guide-es.pdf",
    url: "https://nicereturnvisits.org/assets/docs/NRV-Setup-User-Guide-es.pdf",
    page: "help-es.html",
  },
  {
    name: "NRV-Privacy-Notice.pdf",
    url: "https://nicereturnvisits.org/assets/docs/NRV-Privacy-Notice.pdf",
    page: "privacy.html",
  },
];
for (const { name, url, page } of publishedPdfs) {
  const html = fs.readFileSync(path.join(app, page), "utf8");
  assert(html.includes(`href="${url}"`), `${page}: link to authoritative ${name}`);
  assert(
    !fs.existsSync(path.join(app, "docs", name)),
    `${name}: no duplicate PDF in the app repository`,
  );
  if (site) {
    const websitePdf = path.join(site, "assets", "docs", name);
    assert(fs.existsSync(websitePdf), `${name}: authoritative website PDF exists`);
    assert(
      fs.readFileSync(websitePdf).subarray(0, 5).equals(Buffer.from("%PDF-")),
      `${name}: website copy has a PDF signature`,
    );
  }
}
console.log("PASS  published PDFs link to the website and are not duplicated in the app");
if (!site) console.log("SKIP  website Help (set NRV_WEBSITE_PATH)");
