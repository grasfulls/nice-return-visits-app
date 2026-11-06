// Run with: node tests/setup-navigation.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

assert(!html.includes('id="btn-setup-finish"'));
assert.match(html, /class="inline-icon-link" id="btn-setup-contacts" data-i18n="setup\.continueToContacts"/);
assert(!/body\.install-setup-in-progress\s+#bottom-nav\s*\{\s*display:\s*none/.test(css));
assert.strictEqual(
  `${catalogs.en["setup.continueInstructions"]} ${catalogs.en["setup.continueToContacts"]}${catalogs.en["setup.continuePunctuation"]}`,
  "now or as needed. When you're ready, continue to Contacts.",
);
assert.strictEqual(
  `${catalogs.es["setup.continueInstructions"]} ${catalogs.es["setup.continueToContacts"]}${catalogs.es["setup.continuePunctuation"]}`,
  "ahora o cuando lo necesites. Cuando estés listo, continúa a Contactos.",
);

const start = app.indexOf("  const goToView =");
const end = app.indexOf("  const startSetup =", start);
const handler = app.match(/document\s*\.getElementById\("btn-setup-contacts"\)\s*\.addEventListener\("click",\s*\(\) => goToView\("contacts-view"\)\);/);
assert(start >= 0 && end > start && handler, "setup link uses the normal navigation helper");
let clicked = false;
let listener;
const context = {
  document: {
    querySelectorAll: () => [{ title: "contacts", click: () => { clicked = true; } }],
    getElementById: () => ({ addEventListener: (event, callback) => {
      assert.strictEqual(event, "click");
      listener = callback;
    } }),
  },
};
vm.runInNewContext(`${app.slice(start, end)}\n${handler[0]}`, context);
listener();
assert(clicked, "setup link invokes the Contacts navigation button");
console.log("PASS  localized setup text, visible navigation, and shared Contacts navigation");
