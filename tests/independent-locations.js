// Run with: node tests/independent-locations.js
// Protects the settled requirement that Cities, Regions, and Areas are three
// independent reusable lists scoped by Country: no City -> Region,
// City -> Area, or Region -> Area dependency, and one country's entries are
// never offered for another country's contacts.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const merge = require("../merge.js");

const root = path.join(__dirname, "..");
// vm-created arrays have a different realm's prototype, so rebuild both sides
// in this realm before deep comparison.
const sameList = (actual, expected, message) =>
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(expected)),
    message,
  );
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

// --- No City/Region prerequisites anywhere; the lists are country-scoped. ---
assert(!source.includes("Choose a city before adding a region"));
assert(!source.includes("Choose a city before adding an area"));
assert(index.includes('id="setting-location-country"'), "settings lists have a country selector");
assert(!index.includes("setting-region-city"), "no per-region city selector");
assert(!index.includes("setting-area-city"), "no per-area city selector");
assert(source.includes("locationNamesFor(settings.regions, contactCountry())"),
  "contact region options come from the contact country's list");
assert(source.includes("locationNamesFor(settings.areas, contactCountry())"),
  "contact area options come from the contact country's list");
assert(source.includes("locationNamesFor(settings.cities, contactCountry())"),
  "contact city options come from the contact country's list");
console.log("PASS  Regions and Areas need no City, and all three lists are offered per Country");

// --- Extract normalizeRegionData with its real dependencies. ---
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notStrictEqual(start, -1, `${name} exists`);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const nextClass = source.indexOf("\nclass ", start + 1);
  const endings = [nextConst, nextClass].filter((position) => position !== -1);
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
  SCHEMA_VERSION: 10,
  US_STATE_ABBREVIATIONS: { california: "CA", washington: "WA" },
  NewerDataVersionError: class NewerDataVersionError extends Error {},
  getContactLastActivity: () => "2026-01-01T00:00:00.000Z",
  normalizeTimeTracking: (value) => value || {},
  normalizeStreetName: (value) => value,
  appText: (key, fallback) => fallback,
};
vm.runInNewContext(
  [
    "GOAL_PATHS",
    "GOAL_ITEM_KEYS",
    "GOAL_METHODS",
    "toTitleCase",
    "normalizeUsState",
    "normalizeCountry",
    "normalizeLocationState",
    "normalizeStreetForAddressing",
    "getStreetAddress",
    "normalizeWorkingNeedGreater",
    "normalizeWorkingDesignation",
    "normalizeGoalsAndMilestones",
    "goalItemKey",
    "normalizeRegionData",
  ].map(declaration).join("\n") +
    "\nthis.normalizeRegionData = normalizeRegionData;",
  context,
);
const normalize = context.normalizeRegionData;
const US = "United States";
const JP = "Japan";
const baseSettings = (overrides) => ({
  schemaVersion: 9,
  country: US,
  addressingCountry: US,
  countries: [US, JP],
  state: "CA",
  defaultCity: "Auburn",
  cities: [],
  regions: [],
  areas: [],
  ...overrides,
});
const contactIn = (id, country, city, region, area) => ({
  id,
  firstName: `First${id}`,
  lastName: "Test",
  country,
  city,
  region,
  area,
  streetAddress: "",
  postalCode: "",
});
const entries = (list, country) =>
  list.filter((item) => item.country === country).map((item) => item.name);

// --- Country-scoped lists: contacts attach entries to their own country. ---
const scoped = normalize(
  baseSettings({
    cities: [
      { name: "Auburn", country: US },
      { name: "Lincoln", country: US },
      { name: "Chiyoda", country: JP },
    ],
    regions: [
      { name: "North", country: US },
      { name: "Kanda", country: JP },
    ],
    areas: [
      { name: "Old Town", country: US },
      { name: "2-chome", country: JP },
    ],
  }),
  [
    contactIn(1, US, "Auburn", "North", "Old Town"),
    contactIn(2, US, "Lincoln", "North", "Old Town"),
    contactIn(3, JP, "Chiyoda", "Kanda", "2-chome"),
  ],
);
sameList(entries(scoped.settings.regions, US), ["North"]);
sameList(entries(scoped.settings.regions, JP), ["Kanda"]);
sameList(entries(scoped.settings.areas, US), ["Old Town"]);
sameList(entries(scoped.settings.areas, JP), ["2-chome"]);
sameList(entries(scoped.settings.cities, JP), ["Chiyoda"]);
assert.strictEqual(scoped.contacts[0].region, "North");
assert.strictEqual(scoped.contacts[1].region, "North",
  "the same Region serves contacts in different Cities of one country");
assert.strictEqual(scoped.contacts[1].area, "Old Town",
  "the same Area serves contacts in different Cities of one country");
assert.strictEqual(scoped.contacts[2].region, "Kanda");
assert.strictEqual(
  normalize(scoped.settings, scoped.contacts).contacts[2].region,
  "Kanda",
  "a Japan contact never falls back to United States entries",
);
console.log("PASS  each country keeps its own independent City, Region and Area lists");

// --- v0.9.56 flat string lists migrate by contact evidence, else Default Country. ---
const fromFlat = normalize(
  baseSettings({
    cities: ["Auburn", "Chiyoda"],
    regions: ["North", "Kanda", "Orphan Region"],
    areas: ["Old Town", "Orphan Area"],
  }),
  [
    contactIn(4, US, "Auburn", "North", "Old Town"),
    contactIn(5, JP, "Chiyoda", "Kanda", ""),
  ],
);
sameList(entries(fromFlat.settings.regions, US), ["North", "Orphan Region"],
  "an unprovable entry goes to the Default Country, never discarded");
sameList(entries(fromFlat.settings.regions, JP), ["Kanda"]);
sameList(entries(fromFlat.settings.areas, US), ["Old Town", "Orphan Area"]);
sameList(entries(fromFlat.settings.cities, JP), ["Chiyoda"]);
assert.strictEqual(fromFlat.contacts[1].region, "Kanda");
console.log("PASS  v0.9.56 flat lists migrate by contact country with Option A fallback");

// --- Older {name, city} pairs and legacy strings migrate without loss. ---
const fromPairs = normalize(
  baseSettings({
    cities: ["Auburn", "Lincoln"],
    regions: [
      { name: "North", city: "Auburn" },
      { name: "North", city: "Lincoln" },
      { name: "South", city: "Auburn" },
    ],
    areas: [{ name: "Old Town", region: "North" }, "old town"],
  }),
  [contactIn(6, US, "Auburn", "North", "Old Town")],
);
sameList(entries(fromPairs.settings.regions, US), ["North", "South"]);
sameList(entries(fromPairs.settings.areas, US), ["Old Town"]);
assert.strictEqual(fromPairs.contacts[0].region, "North");
assert.strictEqual(fromPairs.contacts[0].area, "Old Town");
const again = normalize(fromPairs.settings, fromPairs.contacts);
sameList(again.settings.regions, fromPairs.settings.regions,
  "repeat migration adds no duplicates");
sameList(again.settings.areas, fromPairs.settings.areas);
sameList(again.settings.cities, fromPairs.settings.cities);
console.log("PASS  legacy city-linked and string records migrate once, idempotently");

// --- Backup-style round trip preserves lists and contact selections. ---
const roundTrip = normalize(scoped.settings, scoped.contacts);
sameList(roundTrip.settings.regions, scoped.settings.regions);
sameList(roundTrip.settings.areas, scoped.settings.areas);
sameList(roundTrip.settings.cities, scoped.settings.cities);
sameList(
  roundTrip.contacts.map((contact) => [contact.country, contact.city, contact.region, contact.area]),
  scoped.contacts.map((contact) => [contact.country, contact.city, contact.region, contact.area]),
);
console.log("PASS  backup-style normalization round-trips the country-scoped lists");

// --- Merge unions by (country, name) and keeps legacy records for migration. ---
const mergedData = merge.mergeData(
  {
    settings: {
      ...scoped.settings,
      regions: [{ name: "North", country: US }],
      areas: [{ name: "Old Town", country: US }],
    },
    contacts: [],
  },
  {
    settings: {
      ...scoped.settings,
      regions: [
        { name: "north", country: US },
        { name: "Kanda", country: JP },
        "Legacy String",
      ],
      areas: [{ name: "Downtown", country: US }],
    },
    contacts: [],
  },
  { localDirty: true },
);
sameList(
  mergedData.settings.regions.filter((item) => item.country === US).map((item) => item.name),
  ["North"],
);
sameList(
  mergedData.settings.regions.filter((item) => item.country === JP).map((item) => item.name),
  ["Kanda"],
);
assert(mergedData.settings.regions.includes("Legacy String"),
  "legacy records survive merge for later migration");
sameList(
  mergedData.settings.areas.map((item) => item.name),
  ["Old Town", "Downtown"],
);
console.log("PASS  merge unions regions and areas by country and name");

// --- Unsaved-data warning: saved entries are clean, typed text stays protected. ---
const sectionOf = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `found ${JSON.stringify(start)}`);
  return source.slice(first, last);
};
const makeInput = (id, value) => ({
  id,
  type: "text",
  value,
  files: [],
  closest: () => null,
});
const pendingContext = {
  settings: {
    country: US,
    cities: [{ name: "Auburn", country: US }],
    regions: [{ name: "North", country: US }],
    areas: [{ name: "Old Town", country: US }],
  },
  meFields: {},
  toTitleCase: (value) =>
    value.trim().replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  describeSettingsField: (input) => input.id,
  document: {
    querySelectorAll: () => pendingContext.pendingInputs,
    getElementById: (id) =>
      id === "setting-location-country" ? { value: US } : { value: "" },
  },
  pendingInputs: [],
};
vm.runInNewContext(
  sectionOf("  const findPendingOtherSettingsEdit = () => {", "  const findPendingSettingsEdit =") +
    "\nthis.findPendingOtherSettingsEdit = findPendingOtherSettingsEdit;",
  pendingContext,
);
pendingContext.pendingInputs = [
  makeInput("setting-new-region", "North"),
  makeInput("setting-new-area", "Old Town"),
  makeInput("setting-new-city", "Auburn"),
];
assert.strictEqual(
  pendingContext.findPendingOtherSettingsEdit(),
  null,
  "saved entries for the selected country no longer count as unsaved edits",
);
pendingContext.pendingInputs = [makeInput("setting-new-region", "Eastside")];
assert.strictEqual(
  pendingContext.findPendingOtherSettingsEdit()?.input.id,
  "setting-new-region",
  "genuinely typed but unsaved text still triggers the warning",
);
console.log("PASS  unsaved-data warning protects typed text without re-flagging saved entries");

// --- Contact save validates against the contact country's lists only. ---
assert(source.includes("hasLocation(settings.cities, country, city)"));
assert(source.includes("hasLocation(settings.regions, country, region)"));
assert(source.includes("hasLocation(settings.areas, country, area)"));
assert(!source.includes("belong to the selected city"));
console.log("PASS  contact save accepts any saved combination within the contact's country");

// --- Changing a contact's country is confirmed; Cancel restores it. ---
assert(source.includes("confirmContactCountryChange"),
  "country change asks for confirmation");
assert(source.includes("contacts.countryChangeConfirm"));
assert(catalogs.en["contacts.countryChangeConfirm"].includes("Continue?"));
assert(catalogs.es["contacts.countryChangeConfirm"].includes("¿Continuar?"));
const changeGuard = sectionOf(
  "  const handleCountryChange = async (select) => {",
  "  const saveNewCountry =",
);
assert(changeGuard.includes("contactLocationSelectionsExist()"));
assert(changeGuard.includes("select.value = previousCountry;"),
  "Cancel restores the previous country");
assert(changeGuard.includes("resetDependentLocationFields(select)"),
  "Continue clears the editing form only");
console.log("PASS  contact country changes are confirmed and cancellable");
