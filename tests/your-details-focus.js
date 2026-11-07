// Run with: node tests/your-details-focus.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const section = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Found ${start}`);
  return source.slice(first, last);
};

let handler;
let success;
let status = "";
let focused = 0;
const button = { disabled: false, addEventListener(event, callback) { handler = callback; } };
const context = {
  navigator: { geolocation: { getCurrentPosition(callback) { success = callback; } } },
  document: { getElementById: () => button },
  meFields: { lat: { value: "", focus() { focused += 1; } }, lng: { value: "", focus() { focused += 1; } } },
  meStatus: { set textContent(value) { status = value; } },
  appText: (key, fallback) => fallback,
};
vm.runInNewContext(section('  document.getElementById("btn-me-gps")', "  const captureDetailsState ="), context);
handler();
assert(button.disabled);
success({ coords: { latitude: 40.1, longitude: -75.2 } });
assert.strictEqual(context.meFields.lat.value, "40.100000");
assert.strictEqual(context.meFields.lng.value, "-75.200000");
assert(!button.disabled);
assert(status.includes("Home pin set"));
assert.strictEqual(focused, 0, "device location must not focus coordinates");
console.log("PASS  device location updates coordinates without focusing them");
