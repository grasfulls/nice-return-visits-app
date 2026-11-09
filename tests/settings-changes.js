// Run with: node tests/settings-changes.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const section = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Found ${start}`);
  return source.slice(first, last);
};
const fields = Object.fromEntries(
  ["name", "country", "state", "city", "region", "area", "street", "postalCode", "lat", "lng"]
    .map((key) => [key, { id: key, value: "", focus() {} }]),
);
const settingState = { id: "setting-state", value: "WA" };
const settingCity = { id: "setting-default-city", value: "Seattle" };
const addressingCountry = { id: "settings-address-country", value: "United States" };
const elements = {
  "setting-state": settingState,
  "setting-default-city": settingCity,
  "settings-address-country": addressingCountry,
  "defaults-your-details-section": {},
  "your-details-section": {},
};
const settings = {
  country: "United States",
  addressingCountry: "United States",
  state: "WA",
  defaultCity: "Seattle",
  cities: ["Seattle"],
  regions: [{ city: "Seattle", name: "North" }],
  areas: [{ city: "Seattle", name: "Central" }],
  me: {
    name: "Test", country: "United States", state: "WA", city: "Seattle",
    region: "North", area: "Central", street: "", postalCode: "98101", lat: "", lng: "",
  },
};
let failSave = false;
let saves = 0;
const context = {
  settings,
  meFields: fields,
  settingStateInput: settingState,
  settingDefaultCityInput: settingCity,
  meStatus: { textContent: "" },
  document: { getElementById: (id) => elements[id] },
  map: null,
  commitMeCity() {},
  readMeForm() {
    return Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
  },
  normalizeLocationState: (country, value) => value.trim(),
  normalizeCountry: (country) => country,
  toTitleCase: (value) => value.trim(),
  addCity: (city) => settings.cities.push(city),
  saveSettings: async () => {
    if (failSave) throw new Error("storage failure");
    saves += 1;
  },
  showStorageError() {},
  updateAddressingProfile() {},
  appText: (key, fallback) => fallback,
  alert() {},
  describeSettingsField: (input) => input.id,
  populateMeForm() {
    for (const [key, input] of Object.entries(fields)) {
      input.value = settings.me?.[key] || "";
    }
    fields.country.value = settings.country;
  },
};
Object.values(fields).forEach((input) => {
  input.closest = () => ({ querySelector: () => ({ textContent: "Your Details" }) });
});
settingState.closest = settingCity.closest = fields.name.closest;
context.populateMeForm();
vm.runInNewContext(
  `${section("  const captureDetailsState =", '  document.getElementById("btn-me-clear")')}
   ${section("  const findPendingDetailsEdit =", "  const findPendingOtherSettingsEdit =")}
   this.api = { captureDetailsState, findPendingDetailsEdit, saveDefaultsAndDetails };`,
  context,
);

async function main() {
  const { findPendingDetailsEdit, saveDefaultsAndDetails } = context.api;
  assert.strictEqual(findPendingDetailsEdit(), null, "saved postal code is not dirty");
  fields.postalCode.value = "98102";
  assert.strictEqual(findPendingDetailsEdit().input, fields.postalCode);
  settingCity.value = "Tacoma";
  addressingCountry.value = "Japan";
  assert.strictEqual(await saveDefaultsAndDetails(), true);
  assert.strictEqual(settings.addressingCountry, "Japan");
  assert.strictEqual(settings.me.postalCode, "98102");
  assert.strictEqual(settings.me.city, "Seattle");
  assert.strictEqual(settings.defaultCity, "Tacoma");
  assert.strictEqual(findPendingDetailsEdit(), null, "successful save clears all dirty fields");

  fields.region.value = "";
  fields.area.value = "";
  assert.strictEqual(findPendingDetailsEdit().input, fields.region);
  assert.strictEqual(await saveDefaultsAndDetails(), true);
  assert.strictEqual(settings.me.region, "");
  assert.strictEqual(settings.me.area, "");
  assert.strictEqual(findPendingDetailsEdit(), null);

  fields.postalCode.value = "unsaved";
  settingCity.value = "Olympia";
  failSave = true;
  assert.strictEqual(await saveDefaultsAndDetails(), false);
  assert.strictEqual(settings.me.postalCode, "98102", "failed save restores stored details");
  assert.strictEqual(settings.defaultCity, "Tacoma", "failed save restores defaults");
  assert(!settings.cities.includes("Olympia"), "failed save rolls back added cities");
  assert(findPendingDetailsEdit(), "failed save keeps edits dirty for retry");
  assert.strictEqual(saves, 2);
  console.log("PASS  saved postal codes, dropdown changes, independent defaults, and failed-save rollback");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
