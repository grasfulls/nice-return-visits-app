// Run with: node tests/agreement-version.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(
    fs.readFileSync(
      path.join(root, "locales", `${language}.json`),
      "utf8",
    ),
  ),
]));
const start = app.indexOf("const USER_AGREEMENT_VERSION =");
const end = app.indexOf("\nconst createUnlockPrompt =", start);
assert(start >= 0 && end > start, "agreement version and gate exist");
const agreementSource = app.slice(start, end);

function makeAgreement(acceptedVersion) {
  const elements = new Map();
  for (const id of [
    "unlock-screen",
    "agreement-panel",
    "unlock-content",
    "user-agreement-checkbox",
    "btn-accept-agreement",
    "agreement-error",
  ]) {
    elements.set(id, {
      hidden: id === "unlock-screen" || id === "unlock-content",
      checked: false,
      disabled: false,
      textContent: "",
      listeners: {},
      addEventListener(event, callback) {
        this.listeners[event] = callback;
      },
    });
  }
  const values = new Map(
    acceptedVersion === null
      ? []
      : [["return_visits_agreement_version", acceptedVersion]],
  );
  const context = {
    document: { getElementById: (id) => elements.get(id) },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    appText: (key, fallback) => fallback,
    console: { error() {} },
    Promise,
  };
  vm.runInNewContext(
    `${agreementSource}\nthis.requireUserAgreement = requireUserAgreement;`,
    context,
  );
  return { context, elements, values };
}

async function main() {
  assert(
    agreementSource.includes('const USER_AGREEMENT_VERSION = "2026-11-05"'),
    "agreement version matches the November 5, 2026 Privacy Notice",
  );

  const prior = makeAgreement("2026-10-30");
  let completed = false;
  const pending = prior.context.requireUserAgreement().then(() => {
    completed = true;
  });
  const panel = prior.elements.get("agreement-panel");
  const checkbox = prior.elements.get("user-agreement-checkbox");
  const button = prior.elements.get("btn-accept-agreement");
  assert.strictEqual(panel.hidden, false, "prior acceptance shows the updated agreement");
  assert.strictEqual(button.disabled, true, "confirmation requires a checked box");
  assert.strictEqual(completed, false, "prior acceptance does not unlock the app");
  checkbox.checked = true;
  checkbox.listeners.change();
  assert.strictEqual(button.disabled, false, "checking enables confirmation");
  button.listeners.click();
  await pending;
  assert.strictEqual(completed, true, "updated acknowledgment completes the gate");
  assert.strictEqual(
    prior.values.get("return_visits_agreement_version"),
    "2026-11-05",
    "updated version is saved after confirmation",
  );
  assert.strictEqual(panel.hidden, true, "updated agreement hides after confirmation");
  assert.strictEqual(
    prior.elements.get("unlock-content").hidden,
    false,
    "confirmation reveals the unlock content",
  );

  const current = makeAgreement("2026-11-05");
  await current.context.requireUserAgreement();
  assert.strictEqual(
    current.elements.get("agreement-panel").hidden,
    true,
    "current acceptance does not prompt again",
  );

  const normalized = (text) => text.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const checkboxHtml = html.match(
    /<span data-i18n="agreement\.checkbox">([\s\S]*?)<\/span>/,
  );
  assert(checkboxHtml, "English fallback checkbox is present");
  assert.strictEqual(
    normalized(checkboxHtml[1]),
    catalogs.en["agreement.checkbox"],
    "English fallback checkbox matches its localized message",
  );
  for (const [language, catalog] of Object.entries(catalogs)) {
    assert(
      /agree to the Terms of Use and acknowledge the Privacy & Data Notice/i.test(
        catalog["agreement.checkbox"],
      ) ||
        /acepto los Términos de uso y reconozco el Aviso de privacidad y datos/i.test(
          catalog["agreement.checkbox"],
        ),
      `${language}: checkbox distinguishes agreement from acknowledgment`,
    );
    assert(
      !/agree to both notices|acepta ambos avisos/i.test(
        catalog["agreement.intro"],
      ),
      `${language}: intro no longer says users agree to both notices`,
    );
  }

  console.log("PASS  prior agreement version prompts for updated acknowledgment");
  console.log("PASS  updated agreement is saved and current users are not prompted again");
  console.log("PASS  English and Spanish wording distinguishes agreement and acknowledgment");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
