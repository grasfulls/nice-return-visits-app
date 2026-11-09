// Run with: node tests/map-filter-export.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const locales = Object.fromEntries(
  ["en", "es"].map((language) => [
    language,
    JSON.parse(
      fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"),
    ),
  ]),
);

for (const id of [
  "filter-working-need",
  "btn-map-change-view",
  "map-change-view-dialog",
  "map-location-select",
  "map-change-view-cancel",
  "map-change-view-apply",
  "map-change-view-reset",
  "export-selection-title",
  "export-selection-scope",
  "cancel-export-selection",
]) {
  assert(html.includes(`id="${id}"`), `Interface includes ${id}`);
}
for (const [id, labelKey] of [
  ["filter-working-need", "filter.workingNeedLabel"],
  ["filter-urgency", "filter.urgencyLabel"],
  ["filter-city", "filter.cityLabel"],
  ["filter-region", "filter.regionLabel"],
  ["filter-area", "filter.areaLabel"],
  ["sort-select", "filter.chronologyLabel"],
]) {
  assert(
    html.includes(`id="${id}" aria-label=`) &&
      html.includes(`data-i18n-attr="aria-label:${labelKey}"`),
    `${id} has a localized accessible name`,
  );
}
assert(
  source.includes('document.getElementById("export-selection-scope").textContent'),
  "Export scope is announced before an export choice",
);
assert(
  html.includes('aria-describedby="export-selection-scope"'),
  "Export dialog announces the current scope when opened",
);
assert(
  source.includes('"cancel-export-selection")') &&
    source.includes("() => exportSelectionDialog.close()"),
  "Filtered export dialog exposes a cancel action",
);
assert(
  Object.keys(locales.en).sort().join("|") ===
    Object.keys(locales.es).sort().join("|"),
  "English and Spanish catalogs have matching keys",
);
for (const language of ["en", "es"]) {
  assert(locales[language]["export.filteredScope_one"]);
  assert(locales[language]["export.filteredScope_other"]);
  assert(locales[language]["export.selectedScope_one"]);
  assert(locales[language]["export.selectedScope_other"]);
}

const filterStart = source.indexOf("  const matchesWorkingNeedFilter =");
const filterEnd = source.indexOf("  const renderContacts =", filterStart);
assert(filterStart >= 0 && filterEnd > filterStart);
const filterContext = {
  normalizeWorkingDesignation: (designation) =>
    designation === "U" || designation === "SW" || designation === "Peru"
      ? designation
      : "",
  console,
};
vm.runInNewContext(
  `${source.slice(filterStart, filterEnd)}
this.matchesWorkingNeedFilter = matchesWorkingNeedFilter;`,
  filterContext,
);
const matchesWorkingNeed = filterContext.matchesWorkingNeedFilter;
assert(matchesWorkingNeed({ workingNeedDesignation: "" }, "all"));
assert(matchesWorkingNeed({ workingNeedDesignation: "U" }, "working"));
assert(matchesWorkingNeed({ workingNeedDesignation: "Peru" }, "working"));
assert(matchesWorkingNeed({ workingNeedDesignation: "Peru" }, '["country","Peru"]'));
assert(!matchesWorkingNeed({ workingNeedDesignation: "" }, '["country","Peru"]'));
assert(matchesWorkingNeed({ workingNeedDesignation: "U" }, "designation:U"));
assert(matchesWorkingNeed({ workingNeedDesignation: "SW" }, "designation:SW"));
assert(!matchesWorkingNeed({ workingNeedDesignation: "SW" }, "designation:U"));

let mapLocationSelect;
const optionList = [];
mapLocationSelect = {
  options: optionList,
  value: "",
  replaceChildren() {
    optionList.length = 0;
  },
  appendChild(option) {
    optionList.push(option);
  },
};
const settings = {
  country: "Canada",
  state: "Ontario",
  workingNeedGreater: {
    enabled: true,
    designation: "country",
    country: "Peru",
  },
};
const contacts = [
  { country: "Peru", state: "Lima" },
  { country: "Peru", state: "Cusco" },
  { country: "United States", state: "Oregon" },
];
let visibleContacts = [...contacts];
const mapContext = {
  settings,
  contacts,
  visibleContacts,
  mapLocationSelect,
  document: {
    createElement: () => ({ value: "", textContent: "" }),
  },
  mapLocationIsDefault: true,
  selectedMapLocation: "",
  displayCountry: (country) => country,
  normalizeCountry: (country) => country,
  normalizeLocationState: (_country, state) =>
    String(state || "")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  appText: (_key, fallback) => fallback,
  console,
};
const mapStart = source.indexOf("  const getMapDefaultLocation = () => {");
const mapEnd = source.indexOf("  const setFilterOptions =", mapStart);
assert(mapStart >= 0 && mapEnd > mapStart);
vm.runInNewContext(
  `${source.slice(mapStart, mapEnd)}
this.mapApi = {
  getMapDefaultLocation,
  getMapLocationParts,
  getMapLocationLabel,
  isContactInMapLocation,
  getVisibleMapContacts,
  getMapScopedContacts,
  populateMapLocationOptions,
};`,
  mapContext,
);
const mapApi = mapContext.mapApi;
assert.strictEqual(
  mapApi.getMapDefaultLocation(),
  JSON.stringify(["country", "Peru"]),
);
settings.workingNeedGreater.designation = "unassigned";
assert.strictEqual(
  mapApi.getMapDefaultLocation(),
  JSON.stringify(["division", "Canada", "Ontario"]),
  "Unassigned work retains the normal Primary Country map default",
);
settings.workingNeedGreater.enabled = false;
assert.strictEqual(
  mapApi.getMapDefaultLocation(),
  JSON.stringify(["division", "Canada", "Ontario"]),
  "Turning Working Need Greater off restores the normal map default",
);
settings.workingNeedGreater.enabled = true;
settings.workingNeedGreater.designation = "country";
mapApi.populateMapLocationOptions();
assert(
  optionList.some(
    (option) => option.value === JSON.stringify(["country", "United States"]),
  ),
  "Map Location offers countries represented by saved contacts",
);
assert(
  optionList.some(
    (option) => option.value === JSON.stringify(["division", "Peru", "Lima"]),
  ),
  "Map Location offers first-level divisions represented by saved contacts",
);
assert.deepStrictEqual(
  mapApi.getMapScopedContacts().map((contact) => contact.state),
  ["Lima", "Cusco"],
);
assert.deepStrictEqual(
  mapApi.getVisibleMapContacts().map((contact) => contact.state),
  ["Lima", "Cusco"],
);
mapContext.selectedMapLocation = JSON.stringify(["division", "Peru", "Lima"]);
assert(mapApi.isContactInMapLocation(contacts[0]));
assert(!mapApi.isContactInMapLocation(contacts[1]));
assert(!mapApi.isContactInMapLocation(contacts[2]));
assert.deepStrictEqual(
  mapApi.getVisibleMapContacts().map((contact) => contact.state),
  ["Lima"],
);

console.log(
  "PASS  retained-designation filtering, independent Map Location scope, export scope and cancellation controls",
);
