// Run with: node tests/independent-locations.js
// Protects the settled requirement that Cities, Regions, and Areas are three
// independent reusable lists, not a City -> Region -> Area hierarchy.
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
const index = fs.readFileSync(path.join(root, "locales", "..", "index.html"), "utf8");
const catalogs = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

// --- The UI no longer requires a City before a Region or an Area. ---
assert(!source.includes("Choose a city before adding a region"));
assert(!source.includes("Choose a city before adding an area"));
assert(!source.includes("Choose a city for this area first"));
assert(!source.includes("Enter a region name after choosing a city"));
assert(!source.includes("Enter an area name after choosing a city"));
assert(!index.includes("setting-region-city"), "settings Add Region has no city selector");
assert(!index.includes("setting-area-city"), "settings Add Area has no city selector");
["en", "es"].forEach((language) => {
  const flat = JSON.stringify(catalogs[language]);
  assert(!flat.includes("location.chooseCityRegion"), `${language}: no city-first region key`);
  assert(!flat.includes("location.chooseCityArea"), `${language}: no city-first area key`);
});
console.log("PASS  a Region or Area can be added without selecting a City");

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
  SCHEMA_VERSION: 9,
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
    "normalizeRegionData",
  ].map(declaration).join("\n") +
    "\nthis.normalizeRegionData = normalizeRegionData;",
  context,
);
const normalize = context.normalizeRegionData;
const baseSettings = (overrides) => ({
  schemaVersion: 8,
  country: "United States",
  addressingCountry: "United States",
  countries: ["United States"],
  state: "CA",
  defaultCity: "Auburn",
  cities: ["Auburn", "Lincoln"],
  regions: [],
  areas: [],
  ...overrides,
});
const contactIn = (id, city, region, area) => ({
  id,
  firstName: `First${id}`,
  lastName: "Test",
  country: "United States",
  city,
  region,
  area,
  streetAddress: "",
  postalCode: "",
});

// --- City-linked {name, city} records migrate to deduplicated name lists. ---
const migrated = normalize(
  baseSettings({
    regions: [
      { name: "North", city: "Auburn" },
      { name: "North", city: "Lincoln" },
      { name: "South", city: "Auburn" },
    ],
    areas: [
      { name: "Old Town", city: "Auburn" },
      { name: "Old Town", city: "Lincoln" },
      { name: "Downtown", city: "Lincoln" },
    ],
  }),
  [
    contactIn(1, "Auburn", "North", "Old Town"),
    contactIn(2, "Lincoln", "North", "Old Town"),
  ],
);
sameList(migrated.settings.regions, ["North", "South"]);
sameList(migrated.settings.areas, ["Old Town", "Downtown"]);
console.log("PASS  city-linked region and area records migrate to deduplicated names");

// --- The same Region and Area are reused by contacts in different Cities. ---
assert.strictEqual(migrated.contacts[0].city, "Auburn");
assert.strictEqual(migrated.contacts[0].region, "North");
assert.strictEqual(migrated.contacts[0].area, "Old Town");
assert.strictEqual(migrated.contacts[1].city, "Lincoln");
assert.strictEqual(migrated.contacts[1].region, "North");
assert.strictEqual(migrated.contacts[1].area, "Old Town");
console.log("PASS  contacts in different cities reuse the same saved Region and Area");

// --- Normalization retains any Region/Area in the global lists; nothing is blanked. ---
const retained = normalize(
  baseSettings({ regions: ["North"], areas: ["Old Town"] }),
  [contactIn(3, "Lincoln", "North", "Old Town")],
);
assert.strictEqual(retained.contacts[0].region, "North");
assert.strictEqual(retained.contacts[0].area, "Old Town");
const seeded = normalize(
  baseSettings({ regions: [], areas: [] }),
  [contactIn(4, "Auburn", "West", "Riverside")],
);
assert(seeded.settings.regions.includes("West"), "contact regions seed the list");
assert(seeded.settings.areas.includes("Riverside"), "contact areas seed the list");
assert.strictEqual(seeded.contacts[0].region, "West");
assert.strictEqual(seeded.contacts[0].area, "Riverside");
console.log("PASS  normalization keeps every contact Region and Area present in the lists");

// --- Legacy string lists remain supported; migration is repeatable. ---
const legacy = normalize(
  baseSettings({ regions: ["North", "South"], areas: ["Old Town"] }),
  [contactIn(5, "Auburn", "North", "Old Town")],
);
sameList(legacy.settings.regions, ["North", "South"]);
sameList(legacy.settings.areas, ["Old Town"]);
const again = normalize(legacy.settings, legacy.contacts);
sameList(again.settings.regions, legacy.settings.regions, "repeat migration adds no duplicates");
sameList(again.settings.areas, legacy.settings.areas);
sameList(again.contacts[0].region, "North");
const mixed = normalize(
  baseSettings({
    regions: ["North", { name: "north", city: "Lincoln" }],
    areas: [{ name: "Old Town", region: "North" }, "old town"],
  }),
  [],
);
sameList(mixed.settings.regions, ["North"]);
sameList(mixed.settings.areas, ["Old Town"]);
console.log("PASS  legacy string lists and mixed records migrate without duplicates");

// --- Backup round-trip: normalized output restores unchanged. ---
const roundTrip = normalize(migrated.settings, migrated.contacts);
sameList(roundTrip.settings.regions, migrated.settings.regions);
sameList(roundTrip.settings.areas, migrated.settings.areas);
sameList(
  roundTrip.contacts.map((contact) => [contact.city, contact.region, contact.area]),
  migrated.contacts.map((contact) => [contact.city, contact.region, contact.area]),
);
console.log("PASS  backup-style normalization round-trips the independent lists");

// --- Merge preserves the independent lists, including mixed legacy data. ---
const mergedData = merge.mergeData(
  {
    settings: { ...migrated.settings, regions: ["North"], areas: ["Old Town"] },
    contacts: [],
  },
  {
    settings: {
      ...migrated.settings,
      regions: ["South", { name: "north", city: "Lincoln" }],
      areas: ["Downtown"],
    },
    contacts: [],
  },
  { localDirty: true },
);
sameList(mergedData.settings.regions, ["North", "South"]);
sameList(mergedData.settings.areas, ["Old Town", "Downtown"]);
console.log("PASS  merge unions regions and areas by name without city pairs");

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
  settings: { cities: ["Auburn"], regions: ["North"], areas: ["Old Town"] },
  meFields: {},
  toTitleCase: (value) =>
    value.trim().replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  describeSettingsField: (input) => input.id,
  document: {
    querySelectorAll: () => pendingContext.pendingInputs,
    getElementById: () => ({ value: "" }),
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
];
assert.strictEqual(
  pendingContext.findPendingOtherSettingsEdit(),
  null,
  "saved Region and Area entries no longer count as unsaved edits",
);
pendingContext.pendingInputs = [makeInput("setting-new-region", "Eastside")];
assert.strictEqual(
  pendingContext.findPendingOtherSettingsEdit()?.input.id,
  "setting-new-region",
  "genuinely typed but unsaved text still triggers the warning",
);
pendingContext.pendingInputs = [makeInput("setting-new-area", "Harbor")];
assert.strictEqual(
  pendingContext.findPendingOtherSettingsEdit()?.input.id,
  "setting-new-area",
);
console.log("PASS  unsaved-data warning protects typed text without re-flagging saved entries");

// --- Contact save validates against the flat lists only. ---
assert(source.includes("(region && !settings.regions.includes(region))"));
assert(source.includes("(area && !settings.areas.includes(area))"));
assert(!source.includes("belong to the selected city"));
console.log("PASS  contact save accepts any saved City, Region, and Area combination");
