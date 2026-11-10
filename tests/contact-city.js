// Run with: node tests/contact-city.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  let pendingContactCitySave = Promise.resolve(true);");
const end = source.indexOf('  contactRegionSelect.addEventListener("change",', start);
assert(start >= 0 && end > start);

const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) {
    nodes.set(id, {
      value: "", hidden: true, disabled: false, listeners: {},
      focus() { this.focused = true; },
      addEventListener(event, handler) { this.listeners[event] = handler; },
    });
  }
  return nodes.get(id);
};
const citySelect = node("contact-city-select");
const COUNTRY = "Canada";
const settings = { country: COUNTRY, cities: [{ name: "Toronto", country: COUNTRY }] };
const cityNames = () => settings.cities.map((city) => city.name);
let saved = 0;
let fail = false;
let errorReported = false;
let message = "";
const contactCountrySelect = { value: COUNTRY };
const context = {
  citySelect, settings, document: { getElementById: node },
  contactCountrySelect,
  contactRegionSelect: node("contact-region-select"),
  contactAreaSelect: node("contact-area-select"),
  dropdownHelpers: { populateContactRegionArea(region, area) {
    node("contact-region-select").value = region;
    node("contact-area-select").value = area;
  } },
  toTitleCase: (text) => text.replace(/\b\w/g, (letter) => letter.toUpperCase()),
  findLocation: (list, country, name) =>
    list.find(
      (item) =>
        item.country === country &&
        item.name.toLowerCase() === String(name || "").toLowerCase(),
    )?.name || "",
  addCity: (city, country) => settings.cities.push({ name: city, country }),
  rollbackNewCity: (city, country) => {
    settings.cities = settings.cities.filter(
      (item) => !(item.name === city && item.country === country),
    );
  },
  saveSettings: async () => { saved += 1; if (fail) throw new Error("storage"); },
  populateDropdowns() {},
  showStorageError() { errorReported = true; },
  appText: (key, fallback) => fallback,
  NRVDialogs: { alert: async (text) => { message = text; } },
  Promise,
};
vm.runInNewContext(`let contactEditorSession = 1;\n${source.slice(start, end)}
this.pending = () => pendingContactCitySave;
this.nextSession = () => { contactEditorSession += 1; };`, context);

async function main() {
  citySelect.value = "Toronto";
  citySelect.listeners.change();
  node("contact-region-select").value = "North";
  node("contact-area-select").value = "Downtown";
  citySelect.value = "__ADD_NEW__";
  citySelect.listeners.change();
  assert.strictEqual(node("new-contact-city-container").hidden, false);
  node("btn-cancel-new-contact-city").listeners.click();
  assert.strictEqual(citySelect.value, "Toronto");
  assert.strictEqual(node("contact-region-select").value, "North");
  assert.strictEqual(node("contact-area-select").value, "Downtown");

  citySelect.value = "__ADD_NEW__";
  citySelect.listeners.change();
  node("btn-save-new-contact-city").listeners.click();
  assert.strictEqual(await context.pending(), false);
  assert(message.includes("city name"));
  node("input-new-contact-city").value = "ottawa";
  node("input-new-contact-city").listeners.input();
  assert.strictEqual(await context.pending(), true);
  node("btn-save-new-contact-city").listeners.click();
  assert.strictEqual(await context.pending(), true);
  assert.strictEqual(citySelect.value, "Ottawa");
  assert(cityNames().includes("Ottawa"));
  assert.strictEqual(saved, 1);
  assert.strictEqual(node("new-contact-city-container").hidden, true);

  citySelect.value = "__ADD_NEW__";
  citySelect.listeners.change();
  node("input-new-contact-city").value = "toronto";
  node("btn-save-new-contact-city").listeners.click();
  assert.strictEqual(await context.pending(), true);
  assert.strictEqual(citySelect.value, "Toronto");
  assert.strictEqual(saved, 1);

  citySelect.value = "__ADD_NEW__";
  citySelect.listeners.change();
  node("input-new-contact-city").value = "kingston";
  fail = true;
  node("btn-save-new-contact-city").listeners.click();
  assert.strictEqual(await context.pending(), false);
  assert(errorReported);
  assert(!cityNames().includes("Kingston"));
  assert.strictEqual(node("new-contact-city-container").hidden, false);
  fail = false;
  node("btn-save-new-contact-city").listeners.click();
  assert.strictEqual(await context.pending(), true);
  assert.strictEqual(citySelect.value, "Kingston");

  citySelect.value = "__ADD_NEW__";
  citySelect.listeners.change();
  node("input-new-contact-city").value = "london";
  node("btn-save-new-contact-city").listeners.click();
  const pending = context.pending();
  context.nextSession();
  citySelect.value = "Toronto";
  assert.strictEqual(await pending, true);
  assert.strictEqual(citySelect.value, "Toronto");
  assert(cityNames().includes("London"));
  console.log("PASS  contact city selection, adding, cancellation, duplicates, storage failure and session changes");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
