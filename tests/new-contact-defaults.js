// Run with: node tests/new-contact-defaults.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const contactSection = html.slice(html.indexOf('id="contact-info-section"'), html.indexOf('id="contact-visits-section"'));
const fieldIds = ["contact-firstname", "contact-lastname", "contact-address", "contact-city-select",
  "contact-state", "contact-country", "contact-region-select", "contact-area-select"];
const positions = fieldIds.map((id) => contactSection.indexOf(`id="${id}"`));
assert(positions.every((position) => position >= 0));
assert.deepStrictEqual(positions, [...positions].sort((a, b) => a - b));
assert(!contactSection.includes("contact-postal-code"));
assert(contactSection.indexOf('id="btn-find-address"') > contactSection.indexOf('id="contact-phone"'));
assert(contactSection.indexOf('id="btn-gps"') > contactSection.indexOf('id="btn-find-address"'));
assert(contactSection.indexOf('id="btn-gps"') < contactSection.indexOf('id="location-status"'));
assert(/<select id="contact-city-select" required/.test(contactSection));
assert(/<input type="text" id="contact-lastname"\s*\/>/.test(contactSection));
assert(contactSection.includes('id="contact-cross-street"'));
assert.strictEqual((contactSection.match(/id="btn-gps"/g) || []).length, 1);

const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, { value: "", hidden: false, disabled: false, dataset: {}, innerHTML: "" });
  return nodes.get(id);
};
const listeners = {};
const settings = { country: "Canada", state: "Ontario", defaultCity: "Toronto", me: { country: "Peru", state: "Lima", city: "Miraflores" } };
const context = {
  settings,
  document: { getElementById: node },
  btnOpenModal: { addEventListener: (event, handler) => { listeners.open = handler; } },
  contactForm: { reset() {} },
  contactCountrySelect: node("contact-country"),
  contactStateInput: node("contact-state"),
  citySelect: node("contact-city-select"),
  contactSecondaryActions: {},
  printContactButton: {}, shareContactButton: {}, exportContactButton: {},
  crossStreetSearch: {},
  newContactCityContainer: {},
  newContactCityInput: {},
  dropdownHelpers: { populateContactRegionArea(region, area) {
    node("contact-region-select").value = region;
    node("contact-area-select").value = area;
  } },
  updateContactLocationFields() {},
  setLocationStatus() {}, clearAddressMatches() {},
  toLocalDateTimeString: () => "2026-01-01T00:00",
  escapeHtml: (text) => text,
  appText: (key, fallback) => fallback,
  openModalWithCoords: async () => {},
  Promise,
};
const start = source.indexOf('  btnOpenModal.addEventListener("click", async () => {');
const end = source.indexOf('  btnFindAddress.addEventListener("click", () => {', start);
assert(start >= 0 && end > start);
vm.runInNewContext(`let contactEditorSession = 0, lastCommittedContactCity = "", pendingContactCitySave;\n${source.slice(start, end)}\nthis.committedCity = () => lastCommittedContactCity;`, context);

async function main() {
  await listeners.open();
  assert.strictEqual(context.citySelect.value, "Toronto");
  assert.strictEqual(context.contactStateInput.value, "Ontario");
  assert.strictEqual(context.contactCountrySelect.value, "Canada");
  assert.strictEqual(node("contact-region-select").value, "");
  assert.strictEqual(node("contact-area-select").value, "");
  assert.strictEqual(context.committedCity(), "Toronto");
  context.citySelect.value = "Ottawa";
  context.contactStateInput.value = "Quebec";
  context.contactCountrySelect.value = "Mexico";
  assert.deepStrictEqual(settings, { country: "Canada", state: "Ontario", defaultCity: "Toronto", me: { country: "Peru", state: "Lima", city: "Miraflores" } });
  await listeners.open();
  assert.deepStrictEqual([context.citySelect.value, context.contactStateInput.value, context.contactCountrySelect.value], ["Toronto", "Ontario", "Canada"]);
  assert(source.includes('contact.state || "",'));
  assert(source.includes('getElementById("contact-lastname").value = contact.lastName || "";'));
  assert(!source.includes('getElementById("contact-postal-code")'));
  assert(source.includes('const postalCode = getSavedContactFromEditor()?.postalCode || "";'));
  assert(source.includes('contact.postalCode = postalCode;'));
  console.log("PASS  new-contact order, saved defaults, independent edits, None and preserved postal data");

  let success;
  let failure;
  let message = "";
  const gps = node("btn-gps");
  gps.addEventListener = (event, handler) => { listeners.gps = handler; };
  const gpsContext = {
    document: context.document,
    navigator: { geolocation: { getCurrentPosition(ok, fail) { success = ok; failure = fail; } } },
    pickerMap: {},
    setLocationStatus: (text) => { message = text; },
    setPinPanel() {},
    setPickerLocation(lat, lng) {
      node("contact-lat").value = lat.toFixed(6);
      node("contact-lng").value = lng.toFixed(6);
    },
    appText: context.appText,
    console,
  };
  const gpsStart = source.indexOf('  document.getElementById("btn-gps").addEventListener("click", () => {');
  const gpsEnd = source.indexOf("  // Save Contact Handler", gpsStart);
  assert(gpsStart >= 0 && gpsEnd > gpsStart);
  vm.runInNewContext(`let contactEditorSession = 1;\n${source.slice(gpsStart, gpsEnd)}\nthis.nextSession = () => { contactEditorSession += 1; };`, gpsContext);
  node("contact-address").value = "123 Sample St";
  node("contact-lat").value = "";
  node("contact-lng").value = "";
  listeners.gps();
  assert(gps.disabled);
  success({ coords: { latitude: 43.7, longitude: -79.4, accuracy: 10 } });
  assert.strictEqual(node("contact-lat").value, "43.700000");
  assert.strictEqual(node("contact-lng").value, "-79.400000");
  assert.strictEqual(node("contact-address").value, "123 Sample St");
  assert(!gps.disabled);
  listeners.gps();
  node("contact-lat").value = "20";
  success({ coords: { latitude: 1, longitude: 2, accuracy: 10 } });
  assert.strictEqual(node("contact-lat").value, "20");
  assert(message.includes("newer pin was kept"));
  listeners.gps();
  gpsContext.nextSession();
  node("contact-lat").value = "30";
  success({ coords: { latitude: 1, longitude: 2, accuracy: 10 } });
  assert.strictEqual(node("contact-lat").value, "30");
  gps.disabled = false;
  listeners.gps();
  failure({ code: 1, PERMISSION_DENIED: 1 });
  assert(message.includes("permission was denied"));
  assert(!gps.disabled);
  console.log("PASS  device location updates only the pin and protects newer or other-contact edits");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
