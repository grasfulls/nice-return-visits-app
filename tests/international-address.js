// Run with: node tests/international-address.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n?/g, "\n");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));
const defaultsSection = index.slice(
  index.indexOf('id="defaults-section"'),
  index.indexOf('id="your-details-section"'),
);
assert(defaultsSection.includes('data-i18n="addressing.label">Address Format</label>'));
assert(defaultsSection.includes('data-i18n="addressing.explanation">Which country’s addressing format should NRV use?</small>'));
assert(defaultsSection.includes('data-i18n="defaults.countryLabel">Default Country</label>'));
assert(defaultsSection.includes('data-i18n="defaults.countryExplanation">Which country should NRV use for your default location and new contacts?</small>'));
assert.strictEqual(catalogs.en["addressing.label"], "Address Format");
assert.strictEqual(catalogs.en["defaults.countryLabel"], "Default Country");
assert.strictEqual(catalogs.es["addressing.label"], "Formato de dirección");
assert.strictEqual(catalogs.es["defaults.countryLabel"], "País predeterminado");
assert(source.includes('settings.country = me.country;'));
assert(source.includes('settings.addressingCountry = normalizeCountry('));
console.log("PASS  Defaults & Your Details country controls retain their functions with clarified labels");
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notStrictEqual(start, -1, `${name} exists`);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const nextClass = source.indexOf("\nclass ", start + 1);
  const endings = [nextConst, nextClass].filter((index) => index !== -1);
  return source.slice(start, endings.length ? Math.min(...endings) : source.length).trim();
};

const context = {
  DEFAULT_COUNTRIES: ["Canada", "Japan", "Mexico", "Peru", "United States"],
  DEFAULT_SETTINGS: {
    country: "United States",
    addressingCountry: "United States",
    countries: ["Canada", "Japan", "Mexico", "Peru", "United States"],
    cities: [],
    regions: [],
    areas: [],
  },
  SCHEMA_VERSION: 8,
  EPOCH_TIMESTAMP: "1970-01-01T00:00:00.000Z",
  US_STATE_ABBREVIATIONS: { california: "CA", washington: "WA" },
  selectedAddressingCountry: "United States",
  NewerDataVersionError: class NewerDataVersionError extends Error {},
  encryptValue: async (value) => value,
  decryptValue: async (value) => value,
  deriveEncryptionKey: async () => ({ key: true }),
  resolvePassphrase: async (value) => value,
  base64ToBytes: () => new Uint8Array(16),
  getContactLastActivity: () => "2026-01-01T00:00:00.000Z",
  normalizeTimeTracking: (value) => value || {},
  normalizeStreetName: (value) => value,
  appText: (key, fallback) => catalogs.en[key] || fallback,
};
const declarations = [
  "GOAL_PATHS",
  "GOAL_ITEM_KEYS",
  "GOAL_METHODS",
  "toTitleCase",
  "normalizeUsState",
  "normalizeCountry",
  "normalizeLocationState",
  "normalizeStreetForAddressing",
  "updateAddressLabels",
  "getStreetAddress",
  "getFormattedContactAddress",
  "displayCountry",
  "normalizeWorkingNeedGreater",
  "normalizeWorkingDesignation",
  "normalizeTransferredContact",
  "normalizeGoalsAndMilestones",
  "goalItemKey",
  "normalizeRegionData",
  "decryptBackup",
].map(declaration).join("\n");
vm.runInNewContext(
  `${declarations}\nthis.addressHelpers = { normalizeCountry, normalizeLocationState, getFormattedContactAddress, displayCountry, normalizeTransferredContact, normalizeRegionData, decryptBackup, updateAddressLabels };`,
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
  "contact-address-label",
  "me-address-label",
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

assert.strictEqual(normalized.settings.schemaVersion, 8);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(normalized.settings.goalsAndMilestones)),
  {
    encouragementEnabled: true,
    goals: [],
    deletedGoalIds: [],
    latestAcknowledgement: null,
  },
);
assert.strictEqual(normalized.settings.addressingCountry, "United States");
assert.strictEqual(normalized.contacts[0].country, "United States");
assert.strictEqual(normalized.contacts[0].state, "WA");
assert.strictEqual(normalized.contacts[0].city, "Seattle");
assert.deepStrictEqual(normalized.contacts[0].notesHistory, usContact.notesHistory);
assert.strictEqual(normalized.contacts[0].postalCode, "");
assert.strictEqual(normalized.contacts[0].addressingCountry, "United States");
assert.strictEqual(normalized.contacts[0].workingNeedDesignation, undefined);
assert.strictEqual(normalized.contacts[1].country, "Peru");
assert.strictEqual(normalized.contacts[1].state, "Lima");
assert.strictEqual(normalized.contacts[1].city, "Miraflores");
assert.strictEqual(normalized.contacts[1].region, "Lima");
assert.strictEqual(normalized.contacts[1].area, "Miraflores");
assert.strictEqual(normalized.contacts[1].postalCode, "15074");
assert.deepStrictEqual(normalized.contacts[1].notesHistory, peruContact.notesHistory);
assert(normalized.settings.countries.includes("Peru"));
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized.settings.workingNeedGreater)), {
  enabled: false,
  designation: "",
  country: "",
});
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
  helpers.getFormattedContactAddress(normalized.contacts[1], "Japan"),
  "〒15074, Lima, Miraflores, Lima, Miraflores, Av. Arequipa 123, Peru",
);
assert.strictEqual(
  helpers.getFormattedContactAddress(
    {
      country: "Japan",
      state: "Tokyo",
      city: "Chiyoda",
      region: "Kanda",
      area: "2-chome",
      streetAddress: "1 chome 2-ban",
      postalCode: "100-0001",
    },
    "Japan",
  ),
  "〒100-0001, Tokyo, Chiyoda, Kanda, 2-chome, 1 chome 2-ban, Japan",
);
const transferredPeruContact = helpers.normalizeTransferredContact({
  ...peruContact,
  addressingCountry: "Japan",
  workingNeedDesignation: "SW",
  areaAssignments: [{ name: "Miraflores", region: "Lima", city: "Miraflores" }],
});
assert.strictEqual(transferredPeruContact.postalCode, "15074");
assert.strictEqual(transferredPeruContact.addressingCountry, "Japan");
assert.strictEqual(transferredPeruContact.workingNeedDesignation, "SW");
console.log("PASS  formatted and transferred addresses retain locality, region, district, and postal code");
const japaneseAddress = helpers.normalizeRegionData(
  {
    schemaVersion: 5,
    country: "Peru",
    addressingCountry: "Japan",
    countries: ["Peru", "Japan"],
    cities: ["Miraflores"],
    regions: [],
    areas: [],
  },
  [peruContact],
);
assert.strictEqual(japaneseAddress.settings.addressingCountry, "Japan");
assert.strictEqual(japaneseAddress.contacts[0].country, "Peru");
assert.strictEqual(japaneseAddress.contacts[0].postalCode, "15074");
assert.strictEqual(japaneseAddress.contacts[0].streetAddress, "Av. Arequipa 123");
assert.strictEqual(japaneseAddress.contacts[0].addressingCountry, "Japan");
assert.deepStrictEqual(japaneseAddress.contacts[0].notesHistory, peruContact.notesHistory);
assert.strictEqual(helpers.normalizeCountry("jp"), "Japan");
assert.strictEqual(helpers.normalizeLocationState("Japan", "Tokyo"), "Tokyo");
assert.strictEqual(
  helpers.normalizeRegionData(
    {
      country: "Peru",
      countries: ["Peru"],
      cities: [],
      regions: [],
      areas: [],
    },
    [],
  ).settings.addressingCountry,
  "United States",
);
console.log("PASS  Country Addressing is independently persisted and changing it does not convert contacts");

const workingNeedData = helpers.normalizeRegionData(
  {
    schemaVersion: 6,
    country: "United States",
    addressingCountry: "United States",
    workingNeedGreater: {
      enabled: true,
      designation: "country",
      country: "Peru",
    },
    countries: ["United States"],
    cities: ["Seattle"],
    regions: [],
    areas: [],
  },
  [
    {
      ...usContact,
      addressingCountry: "United States",
      workingNeedDesignation: "Peru",
    },
    {
      ...usContact,
      id: 3,
      addressingCountry: "United States",
      workingNeedDesignation: "U",
    },
    {
      ...usContact,
      id: 4,
      addressingCountry: "United States",
      workingNeedDesignation: "SW",
    },
    {
      ...usContact,
      id: 5,
      addressingCountry: "United States",
    },
  ],
);
assert.strictEqual(workingNeedData.settings.workingNeedGreater.enabled, true);
assert.strictEqual(workingNeedData.settings.workingNeedGreater.country, "Peru");
assert(workingNeedData.settings.countries.includes("Peru"));
assert.deepStrictEqual(
  workingNeedData.contacts.map((contact) => contact.workingNeedDesignation),
  ["Peru", "U", "SW", undefined],
);
assert.strictEqual(
  helpers.getFormattedContactAddress(workingNeedData.contacts[0]),
  "123 Main St, Seattle, WA, United States",
  "individual address schemes remain independent of Working Need Greater",
);
assert.strictEqual(workingNeedData.contacts[0].country, "United States");
console.log("PASS  Working Need Greater configuration and per-contact markers normalize without changing home address data");

const invalidWorkingNeed = helpers.normalizeRegionData(
  {
    country: "United States",
    addressingCountry: "Japan",
    workingNeedGreater: {
      enabled: true,
      designation: "country",
      country: "",
    },
    countries: ["United States"],
    cities: [],
    regions: [],
    areas: [],
  },
  [],
);
assert.strictEqual(invalidWorkingNeed.settings.workingNeedGreater.enabled, false);
assert.strictEqual(invalidWorkingNeed.settings.addressingCountry, "Japan");

for (const [language, country, label] of [
  ["en", "Peru", "Peru"],
  ["en", "Japan", "Japan"],
  ["es", "United States", "Estados Unidos"],
  ["es", "Peru", "Perú"],
  ["es", "Japan", "Japón"],
]) {
  context.appText = (key, fallback) => catalogs[language][key] || fallback;
  assert.strictEqual(helpers.displayCountry(country), label);
  assert.strictEqual(helpers.normalizeCountry(country), country);
  console.log(`PASS  ${language} interface displays ${country} independently of the stored country`);
}

context.appText = (key, fallback) => catalogs.en[key] || fallback;
helpers.updateAddressLabels("contact", "Peru");
assert.strictEqual(elements.get("contact-state-label").textContent, "Department / Region:");
assert.strictEqual(elements.get("contact-city-label").textContent, "Locality / City (required):");
assert.strictEqual(elements.get("contact-region-label").textContent, "Province (optional):");
assert.strictEqual(elements.get("contact-area-label").textContent, "District (optional):");
assert.strictEqual(
  elements.get("contact-region-select").firstElementChild.textContent,
  "None",
);
assert.strictEqual(elements.get("contact-region-select").options[1].textContent, "Add Province");
context.appText = (key, fallback) => catalogs.es[key] || fallback;
helpers.updateAddressLabels("contact", "United States");
assert.strictEqual(elements.get("contact-state-label").textContent, "Estado / provincia:");
assert.strictEqual(elements.get("contact-city-label").textContent, "Ciudad (obligatoria):");
helpers.updateAddressLabels("contact", "Japan");
assert.strictEqual(elements.get("contact-state-label").textContent, "Prefectura:");
assert.strictEqual(elements.get("contact-city-label").textContent, "Ciudad / distrito (obligatorio):");
assert.strictEqual(elements.get("contact-address-label").textContent, "Calle / edificio:");
console.log("PASS  address terminology is localized independently of language-neutral contact data");

assert(source.includes('citySelect.disabled = !hasCountry;'));
assert(source.includes('document.getElementById("me-city").disabled = !hasCountry;'));
assert(source.includes("getFormattedContactAddress(\n      locationParts,\n      selectedContactAddressingCountry,"));
assert(source.includes("getFormattedContactAddress(contact)"));
assert(source.includes('document.getElementById("contact-postal-code")'));
assert(source.includes("contact.addressingCountry = selectedContactAddressingCountry;"));
assert(source.includes("workingNeedPrivacyDialog.showModal();"));
assert(!source.includes('alert("Privacy Reminder")'));
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
        goalsAndMilestones: {
          encouragementEnabled: false,
          goals: [{
            id: "goal-restore",
            pathId: "custom",
            pathName: "Personal plan",
            type: "target",
            status: "paused",
            pausedFromStatus: "review",
            pausedRemainingMs: 1200,
            periodEndedAt: "2026-03-01T00:00:00.000Z",
            items: [{
              id: "step-1",
              customText: "Review progress",
              completed: true,
              completedAt: "2026-02-28T00:00:00.000Z",
            }, {
              id: "step-2",
              customText: "Plan next step",
              completed: false,
            }],
          }],
          deletedGoalIds: ["removed-goal"],
        },
        country: "United States",
        addressingCountry: "Japan",
        workingNeedGreater: {
          enabled: true,
          designation: "country",
          country: "Peru",
        },
        countries: ["United States"],
        cities: ["Seattle"],
        regions: [],
        areas: [],
      },
      contacts: [
        {
          ...usContact,
          addressingCountry: "United States",
          workingNeedDesignation: "Peru",
        },
        {
          ...peruContact,
          addressingCountry: "Japan",
          workingNeedDesignation: "U",
        },
      ],
    },
    null,
  );
  assert.strictEqual(restored.settings.schemaVersion, 8);
  assert.strictEqual(
    restored.settings.goalsAndMilestones.encouragementEnabled,
    false,
  );
  assert.strictEqual(restored.settings.goalsAndMilestones.goals[0].status, "paused");
  assert.strictEqual(
    restored.settings.goalsAndMilestones.goals[0].pausedFromStatus,
    "review",
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(restored.settings.goalsAndMilestones.deletedGoalIds)),
    ["removed-goal"],
  );
  assert.strictEqual(restored.settings.addressingCountry, "Japan");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(restored.settings.workingNeedGreater)), {
    enabled: true,
    designation: "country",
    country: "Peru",
  });
  assert.strictEqual(restored.contacts[0].city, "Seattle");
  assert.strictEqual(restored.contacts[0].addressingCountry, "United States");
  assert.strictEqual(restored.contacts[0].workingNeedDesignation, "Peru");
  assert.strictEqual(restored.contacts[0].notesHistory[0].text, "Existing visit");
  assert.strictEqual(restored.contacts[1].country, "Peru");
  assert.strictEqual(restored.contacts[1].postalCode, "15074");
  assert.strictEqual(restored.contacts[1].addressingCountry, "Japan");
  assert.strictEqual(restored.contacts[1].workingNeedDesignation, "U");
  assert.strictEqual(restored.contacts[1].notesHistory[0].text, "Peru visit");
  assert.strictEqual(restored.wasLegacyPlaintext, true);
  console.log("PASS  version-1 backup restore preserves contacts and visits with or without postal codes");

  const encryptedRestore = await helpers.decryptBackup(
    {
      format: "return-visits-encrypted-backup",
      version: 1,
      encryption: {
        version: 1,
        algorithm: "AES-GCM",
        keyDerivation: "PBKDF2-SHA-256",
        iterations: 310000,
        salt: "AAAAAAAAAAAAAAAAAAAAAA==",
      },
      data: {
        settings: {
          schemaVersion: 8,
          cities: [],
          areas: [],
          regions: [],
          countries: ["Peru"],
          goalsAndMilestones: {
            encouragementEnabled: false,
            deletedGoalIds: ["removed-goal"],
            goals: [{
              id: "encrypted-goal",
              pathId: "beginMinistry",
              type: "target",
              status: "active",
              items: [
                {
                  id: "participateAspect",
                  key: "participateAspect",
                  selectedMethods: ["doorToDoor", "smpw"],
                  methodOtherText: "Community table",
                  completed: true,
                },
                { id: "startConversationDoor", key: "startConversationDoor", completed: false },
              ],
            }],
          },
        },
        contacts: [],
      },
    },
    "backup-password",
  );
  assert.strictEqual(encryptedRestore.wasLegacyPlaintext, false);
  assert.strictEqual(encryptedRestore.settings.goalsAndMilestones.goals[0].id, "encrypted-goal");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(encryptedRestore.settings.goalsAndMilestones.deletedGoalIds)),
    ["removed-goal"],
  );
  assert.strictEqual(
    encryptedRestore.settings.goalsAndMilestones.goals[0].items[0].completed,
    true,
  );
  assert.deepStrictEqual(
    JSON.parse(
      JSON.stringify(
        encryptedRestore.settings.goalsAndMilestones.goals[0].items[0]
          .selectedMethods,
      ),
    ),
    ["doorToDoor", "smpw"],
  );
  assert.strictEqual(
    encryptedRestore.settings.goalsAndMilestones.goals[0].items[0]
      .methodOtherText,
    "Community table",
  );
  console.log("PASS  encrypted backup restore preserves goal progress and removal markers");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
