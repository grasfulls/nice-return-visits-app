// Run with: node tests/international-address.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notStrictEqual(start, -1, `${name} exists`);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const nextClass = source.indexOf("\nclass ", start + 1);
  const endings = [nextConst, nextClass].filter((index) => index !== -1);
  return source.slice(start, endings.length ? Math.min(...endings) : source.length).trim();
};

const context = {
  DEFAULT_COUNTRIES: ["Canada", "Mexico", "Peru", "United States"],
  DEFAULT_SETTINGS: {
    country: "United States",
    countries: ["Canada", "Mexico", "Peru", "United States"],
    cities: [],
    regions: [],
    areas: [],
  },
  SCHEMA_VERSION: 5,
  US_STATE_ABBREVIATIONS: { california: "CA", washington: "WA" },
  NewerDataVersionError: class NewerDataVersionError extends Error {},
  encryptValue: async (value) => value,
  getContactLastActivity: () => "2026-01-01T00:00:00.000Z",
  normalizeTimeTracking: (value) => value || {},
  normalizeStreetName: (value) => value,
  appText: (key, fallback) => catalogs.en[key] || fallback,
};
const declarations = [
  "toTitleCase",
  "normalizeUsState",
  "normalizeCountry",
  "normalizeLocationState",
  "updateAddressLabels",
  "getStreetAddress",
  "getFormattedContactAddress",
  "displayCountry",
  "normalizeTransferredContact",
  "normalizeRegionData",
  "decryptBackup",
].map(declaration).join("\n");
vm.runInNewContext(
  `${declarations}\nthis.addressHelpers = { normalizeCountry, getFormattedContactAddress, displayCountry, normalizeTransferredContact, normalizeRegionData, decryptBackup, updateAddressLabels };`,
  context,
);
const helpers = context.addressHelpers;
assert.strictEqual(
  helpers.normalizeRegionData({
    schemaVersion: 5, country: "United States", defaultCity: "", cities: ["Seattle"],
    regions: [], areas: [],
  }, []).settings.defaultCity,
  "",
  "an intentionally cleared default city remains empty",
);
const elements = new Map();
const addElement = (id, value = "") => {
  const element = { textContent: value, placeholder: value };
  elements.set(id, element);
  return element;
};
[
  "contact-state-label",
  "contact-city-label",
  "contact-region-label",
  "contact-area-label",
  "contact-new-region-label",
  "contact-new-area-label",
  "contact-region-hint",
  "contact-area-hint",
  "contact-state",
  "contact-city-select",
  "input-new-contact-region",
  "input-new-contact-area",
  "btn-save-new-contact-region",
  "btn-save-new-contact-area",
].forEach((id) => addElement(id, id));
for (const id of ["contact-region-select", "contact-area-select"]) {
  const select = addElement(id);
  select.firstElementChild = { textContent: "" };
  select.options = [
    { value: "", textContent: "" },
    { value: "__ADD_NEW__", textContent: "" },
  ];
}
context.document = { getElementById: (id) => elements.get(id) || null };

const usContact = {
  id: 1,
  firstName: "Jane",
  lastName: "Doe",
  country: "United States",
  state: "WA",
  city: "Seattle",
  streetAddress: "123 Main St",
  address: "123 Main St, Seattle, WA, United States",
  notesHistory: [{ text: "Existing visit", date: "2026-01-01" }],
};
const peruContact = {
  id: 2,
  firstName: "Ana",
  lastName: "Rojas",
  country: "Perú",
  state: "Lima",
  city: "Miraflores",
  region: "Lima",
  area: "Miraflores",
  streetAddress: "Av. Arequipa 123",
  postalCode: "15074",
  notesHistory: [{ text: "Peru visit", date: "2026-02-01" }],
};
const normalized = helpers.normalizeRegionData(
  {
    schemaVersion: 4,
    country: "United States",
    countries: ["United States"],
    cities: ["Seattle"],
    regions: [],
    areas: [],
  },
  [usContact, peruContact],
);

assert.strictEqual(normalized.settings.schemaVersion, 5);
assert.strictEqual(normalized.contacts[0].country, "United States");
assert.strictEqual(normalized.contacts[0].state, "WA");
assert.strictEqual(normalized.contacts[0].city, "Seattle");
assert.deepStrictEqual(normalized.contacts[0].notesHistory, usContact.notesHistory);
assert.strictEqual(normalized.contacts[0].postalCode, "");
assert.strictEqual(normalized.contacts[1].country, "Peru");
assert.strictEqual(normalized.contacts[1].state, "Lima");
assert.strictEqual(normalized.contacts[1].city, "Miraflores");
assert.strictEqual(normalized.contacts[1].region, "Lima");
assert.strictEqual(normalized.contacts[1].area, "Miraflores");
assert.strictEqual(normalized.contacts[1].postalCode, "15074");
assert.deepStrictEqual(normalized.contacts[1].notesHistory, peruContact.notesHistory);
assert(normalized.settings.countries.includes("Peru"));
console.log("PASS  normalization preserves US contacts and adds Peru postal data without deriving country from language");

assert.strictEqual(
  helpers.getFormattedContactAddress(normalized.contacts[0]),
  "123 Main St, Seattle, WA, United States",
);
assert.strictEqual(
  helpers.getFormattedContactAddress(normalized.contacts[1]),
  "Av. Arequipa 123, Miraflores, Lima, Miraflores, Lima, 15074, Peru",
);
assert.strictEqual(
  helpers.normalizeTransferredContact({
    ...peruContact,
    areaAssignments: [{ name: "Miraflores", region: "Lima", city: "Miraflores" }],
  }).postalCode,
  "15074",
);
console.log("PASS  formatted and transferred addresses retain locality, region, district, and postal code");

for (const [language, country, label] of [
  ["en", "Peru", "Peru"],
  ["es", "United States", "Estados Unidos"],
  ["es", "Peru", "Perú"],
]) {
  context.appText = (key, fallback) => catalogs[language][key] || fallback;
  assert.strictEqual(helpers.displayCountry(country), label);
  assert.strictEqual(helpers.normalizeCountry(country), country);
  console.log(`PASS  ${language} interface displays ${country} independently of the stored country`);
}

context.appText = (key, fallback) => catalogs.en[key] || fallback;
helpers.updateAddressLabels("contact", "Peru");
assert.strictEqual(elements.get("contact-state-label").textContent, "Department / Region:");
assert.strictEqual(elements.get("contact-city-label").textContent, "Locality / City (optional):");
assert.strictEqual(elements.get("contact-region-label").textContent, "Province (optional):");
assert.strictEqual(elements.get("contact-area-label").textContent, "District (optional):");
assert.strictEqual(
  elements.get("contact-region-select").firstElementChild.textContent,
  "Choose a province (optional)",
);
assert.strictEqual(elements.get("contact-region-select").options[1].textContent, "Add Province");
context.appText = (key, fallback) => catalogs.es[key] || fallback;
helpers.updateAddressLabels("contact", "United States");
assert.strictEqual(elements.get("contact-state-label").textContent, "Estado / provincia:");
assert.strictEqual(elements.get("contact-city-label").textContent, "Ciudad (opcional):");
console.log("PASS  address terminology follows country and interface language without changing stored values");

assert(source.includes('citySelect.disabled = !hasCountry;'));
assert(source.includes('document.getElementById("me-city").disabled = !hasCountry;'));
assert(source.includes("const cityQuery = getFormattedContactAddress(locationParts);"));
assert(source.includes("getFormattedContactAddress(contact)"));
assert(source.includes("contact.postalCode = postalCode;"));
assert(source.includes('"contact-address",'));
assert(source.includes('data-contact-action="edit"'));
assert(!source.includes('onclick="editContact(${contact.id})"'));
console.log("PASS  locality is not gated by state and address fields flow through editing, search, and maps");

(async () => {
  const restored = await helpers.decryptBackup(
    {
      format: "return-visits-backup",
      version: 1,
      settings: {
        schemaVersion: 4,
        country: "United States",
        countries: ["United States"],
        cities: ["Seattle"],
        regions: [],
        areas: [],
      },
      contacts: [usContact, peruContact],
    },
    null,
  );
  assert.strictEqual(restored.settings.schemaVersion, 5);
  assert.strictEqual(restored.contacts[0].city, "Seattle");
  assert.strictEqual(restored.contacts[0].notesHistory[0].text, "Existing visit");
  assert.strictEqual(restored.contacts[1].country, "Peru");
  assert.strictEqual(restored.contacts[1].postalCode, "15074");
  assert.strictEqual(restored.contacts[1].notesHistory[0].text, "Peru visit");
  assert.strictEqual(restored.wasLegacyPlaintext, true);
  console.log("PASS  version-1 backup restore preserves contacts and visits with or without postal codes");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
