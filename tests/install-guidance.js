// Run with: node tests/install-guidance.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const code = app.slice(app.indexOf("const detectInstallEnvironment ="), app.indexOf("const markInstalledSetupComplete ="));
assert(code.includes("const showBrowserInstallGuide ="));
const devices = ["iphone", "ipad", "android", "windows", "mac"];
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const ipad = iphone.replace("iPhone; CPU iPhone", "iPad; CPU OS");
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

function createGuide(userAgent, maxTouchPoints = 0) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: id !== "browser-install-selection",
      checked: false,
      handlers: {},
      addEventListener(event, fn) { this.handlers[event] = fn; },
      focus() { this.focused = true; },
      remove() { this.removed = true; },
      scrollIntoView() { this.scrolled = true; },
      querySelector() { return buttons[0]; },
      dispatch(event) { this.handlers[event](); },
    });
    return nodes.get(id);
  }
  const buttons = devices.map((device) => {
    const button = node(`button-${device}`);
    button.dataset = { installDevice: device };
    return button;
  });
  const context = {
    navigator: { userAgent, maxTouchPoints },
    document: {
      getElementById: node,
      querySelectorAll: () => buttons,
    },
  };
  vm.runInNewContext(`${code}\nshowBrowserInstallGuide();`, context);
  return { node, buttons };
}

for (const [ua, touches, expected] of [
  [iphone, 5, "iphone"], [ipad, 5, "ipad"], [android, 5, "android"],
  [windows, 0, "windows"], [mac, 0, "mac"],
  [mac, 5, null], [mac, NaN, null], ["Windows Phone", 0, null], [`${android} Windows Phone`, 0, null],
  ["unknown browser", 0, null], [`${android} Windows`, 0, null],
]) {
  const guide = createGuide(ua, touches);
  assert.strictEqual(guide.node("browser-install-selection").hidden, expected !== null);
  assert.strictEqual(guide.node("browser-install-instructions").hidden, expected === null);
  if (expected) {
    for (const device of devices) {
      assert.strictEqual(guide.node(`browser-install-heading-${device}`).hidden, device !== expected);
    }
  }
}
console.log("PASS  device hints, ambiguous desktop-mode iPad, unknown and conflicting agents");

for (const ua of [
  iphone.replace("Version/17.0", "CriOS/120.0"),
  iphone.replace("Version/17.0", "FxiOS/120.0"),
  iphone.replace("Version/17.0", "EdgiOS/120.0"),
  iphone.replace("Version/17.0", "FBAN/FBIOS Version/17.0"),
  iphone.replace("Version/17.0 Mobile/15E148 Safari/604.1", "Mobile/15E148"),
]) {
  const guide = createGuide(ua);
  assert.strictEqual(guide.node("browser-install-browser-uncertain").hidden, false);
  assert.strictEqual(guide.node("browser-install-ios-steps").hidden, true);
}
console.log("PASS  other and embedded browsers do not receive unconfirmed Safari steps");

const guide = createGuide(iphone);
assert.strictEqual(guide.node("browser-install-ios-steps").hidden, true);
guide.node("browser-normal-safari-check").checked = true;
guide.node("browser-normal-safari-check").dispatch("change");
assert.strictEqual(guide.node("browser-install-ios-steps").hidden, false);
assert.strictEqual(guide.node("browser-install-iphone-steps").hidden, false);
assert.strictEqual(guide.node("browser-install-ipad-steps").hidden, true);
guide.node("browser-install-added").dispatch("click");
assert.strictEqual(guide.node("browser-install-handoff").hidden, false);
assert.strictEqual(guide.node("browser-install-handoff").scrolled, true);
for (const device of devices) {
  guide.node("browser-install-change-device").dispatch("click");
  assert.strictEqual(guide.node("browser-install-selection").hidden, false);
  assert.strictEqual(guide.buttons[0].focused, true);
  guide.buttons[devices.indexOf(device)].dispatch("click");
  assert.strictEqual(guide.node(`browser-install-heading-${device}`).hidden, false);
  assert.strictEqual(guide.node(`browser-install-heading-${device}`).focused, true);
  assert.strictEqual(guide.node("browser-install-ios").hidden, !["iphone", "ipad"].includes(device));
  assert.strictEqual(guide.node("browser-normal-safari-check").checked, false);
  assert.strictEqual(guide.node("browser-install-handoff").hidden, true);
}
guide.node("browser-install-change-device").dispatch("click");
guide.buttons[1].dispatch("click");
guide.node("browser-normal-safari-check").checked = true;
guide.node("browser-normal-safari-check").dispatch("change");
assert.strictEqual(guide.node("browser-install-ipad-steps").hidden, false);
assert.strictEqual(guide.node("browser-install-iphone-steps").hidden, true);
guide.node("browser-normal-safari-check").checked = false;
guide.node("browser-normal-safari-check").dispatch("change");
assert.strictEqual(guide.node("browser-install-confirmation").hidden, true);
console.log("PASS  manual selection, Safari confirmation, handoff and reset");

const ipadSteps = html.match(/<ol id="browser-install-ipad-steps"[\s\S]*?<\/ol>/)[0];
assert(ipadSteps.includes("install.stepShare") && ipadSteps.includes("install.ipadAddHome"));
assert(!ipadSteps.includes("install.iphoneShare"));
for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  for (const key of ["install.forIphone", "install.forIpad", "install.forAndroid", "install.forWindows",
    "install.forMac", "install.changeDevice", "install.general", "install.iphoneShare", "install.ipadAddHome",
    "install.openAsApp", "install.afterAdding"]) assert(catalog[key], `${language}: ${key}`);
}
assert.strictEqual((html.match(/data-i18n="install.afterAdding"/g) || []).length, 1);
console.log("PASS  separate iPad instructions, shared post-install guidance and both catalogs");
