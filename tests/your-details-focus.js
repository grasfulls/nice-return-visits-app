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

const listeners = {};
const eventTarget = (name) => ({
  addEventListener(type, callback) { listeners[`${name}:${type}`] = callback; },
});
const form = eventTarget("form");
const scroller = {
  ...eventTarget("scroller"),
  scrollTop: 0,
  getBoundingClientRect: () => ({ top: 0, bottom: 900 }),
};
const field = {
  matches: () => true,
  getBoundingClientRect: () => ({ top: 266 - scroller.scrollTop, bottom: 308 - scroller.scrollTop }),
};
const doc = { activeElement: field };
let now = 0;
const guardContext = { document: doc };
vm.runInNewContext(
  `${section("const guardDetailsFocusScroll =", "const localizeMapControls =")}\nthis.guard = guardDetailsFocusScroll;`,
  guardContext,
);
guardContext.guard(form, scroller, { offsetTop: 137, height: 386 }, { now: () => now });
const focus = () => listeners["form:focusin"]({ target: field });
focus();
scroller.scrollTop = 708;
now = 180;
listeners["scroller:scroll"]();
assert.strictEqual(scroller.scrollTop, 0, "an immediate large jump that hides the focused field is restored");
focus();
listeners["scroller:touchstart"]();
scroller.scrollTop = 708;
listeners["scroller:scroll"]();
assert.strictEqual(scroller.scrollTop, 708, "user touch scrolling is not undone");
scroller.scrollTop = 0;
focus();
scroller.scrollTop = 708;
now += 801;
listeners["scroller:scroll"]();
assert.strictEqual(scroller.scrollTop, 708, "later scrolling is not undone");
scroller.scrollTop = 0;
focus();
scroller.scrollTop = 60;
listeners["scroller:scroll"]();
assert.strictEqual(scroller.scrollTop, 60, "normal small focus scrolling is retained");
scroller.scrollTop = 0;
focus();
listeners["form:focusout"]();
scroller.scrollTop = 708;
listeners["scroller:scroll"]();
assert.strictEqual(scroller.scrollTop, 708, "scrolling after focus leaves is not undone");
console.log("PASS  focus-scroll guard restores the observed jump while allowing user and normal scrolling");
