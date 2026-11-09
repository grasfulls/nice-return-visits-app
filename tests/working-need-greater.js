// Run with: node tests/working-need-greater.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const locales = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(
    fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"),
  ),
]));

for (const id of [
  "settings-working-need-enabled",
  "settings-working-need-designation",
  "settings-working-need-country",
  "contact-addressing-country",
]) {
  assert(html.includes(`id="${id}"`), `Settings includes ${id}`);
}
for (const designation of ["country", "unassigned", "seldomWorked"]) {
  assert(html.includes(`value="${designation}"`));
}
assert(html.includes('id="working-need-privacy-dialog"'));
assert(source.includes("contact.addressingCountry = selectedContactAddressingCountry;"));
assert(source.includes("contactAddressingCountrySelect.addEventListener(\"change\""));
assert(html.includes("Privacy and personal-data requirements vary by country."));
assert(html.includes("<strong data-i18n=\"workingNeed.privacyControl\">NRV provides the controls.</strong>"));
assert(html.includes("<strong data-i18n=\"workingNeed.privacyChoice\">You determine what is appropriate to collect.</strong>"));
assert(!source.includes('alert("Privacy Reminder")'));
assert.deepStrictEqual(
  Object.keys(locales.en).sort(),
  Object.keys(locales.es).sort(),
  "English and Spanish catalogs have matching keys",
);
console.log("PASS  Working Need Greater controls, accessible reminder, and both locale catalogs");

class MockElement {
  constructor(value = "") {
    this.value = value;
    this.checked = false;
    this.textContent = "";
    this.listeners = new Map();
    this.isOpen = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((item) => item !== listener),
    );
  }

  dispatch(type) {
    const results = [...(this.listeners.get(type) || [])].map((listener) =>
      listener(),
    );
    return results.at(-1);
  }

  showModal() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
    this.dispatch("close");
  }
}

const elements = new Map();
const getElement = (id) => {
  if (!elements.has(id)) elements.set(id, new MockElement());
  return elements.get(id);
};
const persistence = { saves: [], failure: false, errors: [] };
const context = {
  document: { getElementById: getElement },
  workingNeedCountrySelect: getElement("settings-working-need-country"),
  settings: {
    workingNeedGreater: { enabled: false, designation: "", country: "" },
  },
  normalizeCountry: (country) => String(country || "").trim(),
  normalizeWorkingNeedGreater: (value) => ({
    enabled:
      value.enabled === true &&
      Boolean(value.designation) &&
      (value.designation !== "country" || Boolean(value.country)),
    designation: value.designation,
    country: value.country,
  }),
  appText: (key, fallback) => fallback,
  saveSettings: async () => {
    if (persistence.failure) throw new Error("storage unavailable");
    persistence.saves.push(JSON.parse(JSON.stringify(context.settings)));
  },
  showStorageError: async (action, error) => {
    persistence.errors.push([action, error.message]);
  },
};
const start = source.indexOf(
  "  const workingNeedEnabledInput = document.getElementById(",
);
const end = source.indexOf(
  '  document\n    .getElementById("settings-address-country")',
  start,
);
assert(start >= 0 && end > start, "Working Need Greater settings handler exists");
vm.runInNewContext(source.slice(start, end), context);

const enabled = getElement("settings-working-need-enabled");
const designation = getElement("settings-working-need-designation");
const country = getElement("settings-working-need-country");
const reminder = getElement("working-need-privacy-dialog");

async function main() {
  designation.value = "unassigned";
  designation.dispatch("change");
  await Promise.resolve();
  assert.strictEqual(context.settings.workingNeedGreater.enabled, false);
  assert.strictEqual(context.settings.workingNeedGreater.designation, "unassigned");
  assert.strictEqual(persistence.saves.length, 1);

  enabled.checked = true;
  const cancelledActivation = enabled.dispatch("change");
  assert.strictEqual(reminder.isOpen, true);
  getElement("working-need-privacy-cancel").dispatch("click");
  await cancelledActivation;
  assert.strictEqual(context.settings.workingNeedGreater.enabled, false);
  assert.strictEqual(enabled.checked, false);

  enabled.checked = true;
  const acceptedActivation = enabled.dispatch("change");
  getElement("working-need-privacy-continue").dispatch("click");
  await acceptedActivation;
  assert.strictEqual(context.settings.workingNeedGreater.enabled, true);
  assert.strictEqual(context.settings.workingNeedGreater.designation, "unassigned");
  assert.strictEqual(persistence.saves.at(-1).workingNeedGreater.enabled, true);

  enabled.checked = false;
  await enabled.dispatch("change");
  assert.strictEqual(context.settings.workingNeedGreater.enabled, false);
  assert.strictEqual(context.settings.workingNeedGreater.designation, "unassigned");

  designation.value = "country";
  await designation.dispatch("change");
  enabled.checked = true;
  await enabled.dispatch("change");
  assert.strictEqual(enabled.checked, false);
  assert.strictEqual(context.settings.workingNeedGreater.enabled, false);
  assert(
    getElement("working-need-status").textContent.includes("Choose a working country"),
  );

  country.value = "Peru";
  await country.dispatch("change");
  enabled.checked = true;
  const countryActivation = enabled.dispatch("change");
  assert.strictEqual(reminder.isOpen, true);
  getElement("working-need-privacy-continue").dispatch("click");
  await countryActivation;
  assert.strictEqual(context.settings.workingNeedGreater.enabled, true);
  assert.strictEqual(context.settings.workingNeedGreater.country, "Peru");

  persistence.failure = true;
  designation.value = "seldomWorked";
  await designation.dispatch("change");
  assert.strictEqual(context.settings.workingNeedGreater.designation, "country");
  assert.strictEqual(designation.value, "country");
  assert.strictEqual(persistence.errors.length, 1);
  console.log("PASS  Off/On transitions, designation validation, privacy cancellation, and persistence rollback");

  const { mergeData } = require(path.join(root, "merge.js"));
  const localContact = {
    id: 8,
    firstName: "A",
    lastName: "",
    addressingCountry: "United States",
    workingNeedDesignation: "Peru",
    updatedAt: "2026-03-02T00:00:00.000Z",
  };
  const remoteContact = {
    ...localContact,
    workingNeedDesignation: "U",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const merged = mergeData(
    {
      settings: {
        workingNeedGreater: {
          enabled: true,
          designation: "country",
          country: "Peru",
        },
      },
      contacts: [localContact],
    },
    {
      settings: {
        workingNeedGreater: {
          enabled: false,
          designation: "seldomWorked",
          country: "",
        },
      },
      contacts: [remoteContact],
    },
    { localDirty: true },
  );
  assert.deepStrictEqual(
    merged.settings.workingNeedGreater,
    {
      enabled: true,
      designation: "country",
      country: "Peru",
    },
  );
  assert.strictEqual(merged.contacts[0].addressingCountry, "United States");
  assert.strictEqual(merged.contacts[0].workingNeedDesignation, "Peru");
  console.log("PASS  Dropbox-style merge retains selected Working Need Greater settings and contact associations");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
