// Run with: node tests/contact-map-lookup.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  const findAddressOnMap = async () => {");
const end = source.indexOf('  let initialFormState = "";', start);
assert(start >= 0 && end > start);
const nodes = {
  "contact-city-select": { value: "Toronto" },
  "contact-cross-street": { value: "King St" },
  "contact-postal-code": { value: "" },
};
let responses = [];
let status = "";
let location = null;
const context = {
  pickerMap: {},
  streetAddressInput: { value: "" },
  contactCountrySelect: { value: "Canada" },
  contactStateInput: { value: "Ontario" },
  contactRegionSelect: { value: "" },
  contactAreaSelect: { value: "" },
  selectedContactAddressingCountry: "Canada",
  settings: { country: "Canada" },
  crossStreetSearch: { hidden: true },
  btnFindAddress: { disabled: false },
  btnFindCrossStreet: { disabled: false },
  document: { getElementById: (id) => nodes[id] },
  normalizeStreetName: (street) => street.trim(),
  normalizeStreetForAddressing: (street) => street.trim(),
  normalizeLocationState: (country, state) => state,
  getSavedContactFromEditor: () => null,
  getFormattedContactAddress: (parts) => [
    parts.streetAddress, parts.area, parts.region, parts.city, parts.state, parts.country,
  ].filter(Boolean).join(", "),
  setPickerLocation: (lat, lng, zoom) => { location = [Number(lat), Number(lng), zoom]; },
  setLocationStatus: (text) => { status = text; },
  clearAddressMatches() {},
  getUniqueStreetMatches: (results) => results,
  selectAddressMatch() {},
  showAddressMatches() {},
  appText: (key, fallback) => fallback,
  fetch: async () => ({ ok: true, json: async () => responses.shift() }),
  setTimeout: (callback) => callback(),
  URL, URLSearchParams, console,
};
vm.runInNewContext(`${source.slice(start, end)}
this.findAddress = findAddressOnMap; this.findCrossStreet = findCrossStreetOnMap;`, context);

async function main() {
  responses = [[{ lat: "43.7", lon: "-79.4" }]];
  await context.findAddress();
  assert.deepStrictEqual(location, [43.7, -79.4, 13]);
  assert(status.includes("centered approximately"));
  assert(!context.btnFindAddress.disabled);

  context.streetAddressInput.value = "123 Missing St";
  responses = [[], [], [{ lat: "43.7", lon: "-79.4" }]];
  await context.findAddress();
  assert.strictEqual(context.crossStreetSearch.hidden, false);
  assert(status.includes("centered near Toronto"));
  responses = [[{ lat: "43.71", lon: "-79.41" }]];
  await context.findCrossStreet();
  assert.deepStrictEqual(location, [43.71, -79.41, 16]);
  assert(status.includes("cross-street"));
  assert(!context.btnFindCrossStreet.disabled);
  console.log("PASS  city-centered address lookup, missing address fallback and cross-street lookup");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
