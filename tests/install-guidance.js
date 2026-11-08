// Run with: node tests/install-guidance.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const code = app.slice(app.indexOf("const detectInstallEnvironment ="), app.indexOf("const markInstalledSetupComplete ="));
const devices = ["iphone", "ipad", "android", "windows", "mac", "computer"];
const browsers = ["chrome", "edge", "safari", "firefox", "samsung", "other"];
const agents = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
};
for (const language of ["en", "es"]) {
  i18n._setCatalog(language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")));
}

function createGuide(userAgent, language = "en", maxTouchPoints = 0) {
  i18n._setCurrent(language);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: "", focus() { this.focused = true; },
      click() { if (this.onclick) this.onclick(); },
    });
    return nodes.get(id);
  }
  const deviceButtons = devices.map((device) => Object.assign(node(`device-${device}`), { dataset: { installDevice: device } }));
  const browserButtons = browsers.map((browser) => Object.assign(node(`browser-${browser}`), { dataset: { installBrowser: browser } }));
  const context = {
    navigator: { userAgent, maxTouchPoints },
    document: {
      title: "",
      getElementById: node,
      querySelectorAll: (selector) => selector === "[data-install-device]" ? deviceButtons : browserButtons,
    },
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
  };
  vm.runInNewContext(`${code}\nshowBrowserInstallGuide();`, context);
  return { node, context };
}

for (const [ua, browser] of [
  [agents.windows, "Google Chrome"],
  [`${agents.windows} Edg/120.0`, "Microsoft Edge"],
  [agents.iphone, "Safari"],
  [agents.iphone.replace("Version/17.0", "FxiOS/120.0"), "Firefox"],
  [`${agents.android} SamsungBrowser/24.0`, "Samsung Internet"],
]) {
  const guide = createGuide(ua);
  guide.node("device-windows").click();
  assert(guide.node("browser-install-detected").textContent.includes(browser));
}
for (const ua of ["unknown", `${agents.windows} FBAN/123`]) {
  const guide = createGuide(ua);
  guide.node("device-iphone").click();
  assert(guide.node("browser-install-detected").textContent.includes("couldn't identify"));
}
console.log("PASS  browser detection and unknown/embedded fallback");

const supported = {
  iphone: { safari: "normal Safari" },
  ipad: { safari: "normal Safari" },
  android: { chrome: "three dots", edge: "three-line", firefox: "three dots", samsung: "three-line" },
  windows: { chrome: "Google Chrome", edge: "Microsoft Edge" },
  mac: { chrome: "Google Chrome", edge: "Microsoft Edge", safari: "File" },
  computer: { chrome: "Google Chrome", edge: "Microsoft Edge" },
};
for (const language of ["en", "es"]) {
  for (const device of devices) {
    for (const browser of browsers) {
      const guide = createGuide("unknown", language);
      assert.strictEqual(guide.node("browser-install-selection").hidden, false);
      guide.node(`device-${device}`).click();
      assert.strictEqual(guide.node("browser-install-browser-selection").hidden, false);
      guide.node(`browser-${browser}`).click();
      assert.strictEqual(guide.node("browser-install-instructions").hidden, false);
      const isSupported = Boolean(supported[device][browser]);
      if (language === "en" && isSupported) {
        assert(guide.node("browser-install-step").textContent.includes(supported[device][browser]), `${device}/${browser}`);
      }
      if (isSupported) {
        const seen = [guide.node("browser-install-step").textContent];
        let count = 0;
        while (!guide.node("browser-install-next").hidden && count++ < 10) {
          if (!guide.node("browser-install-help").hidden) {
            guide.node("browser-install-help").click();
            assert.strictEqual(guide.node("browser-install-tip").hidden, false);
            assert(guide.node("browser-install-tip").textContent);
          }
          guide.node("browser-install-next").click();
          seen.push(guide.node("browser-install-step").textContent);
        }
        assert(count < 10);
        assert(seen.length >= 5, `${device}/${browser} handoff`);
        assert(seen.some((text) => text.includes(language === "en" ? "close this browser page" : "cierra esta página")));
        assert(seen.at(-1).includes(language === "en" ? "restore" : "restaurar"));
        guide.node("browser-install-back").click();
        assert(!guide.node("browser-install-next").hidden);
      } else {
        assert(guide.node("browser-install-next").hidden, `${device}/${browser} must not pretend to install`);
      }
      guide.node("browser-install-cancel").click();
      assert.strictEqual(guide.node("browser-install-screen").hidden, true);
      assert.strictEqual(guide.node("launch-choice-screen").hidden, false);
    }
  }
}
console.log("PASS  all device/browser combinations, both languages, handoff, tips and cancel");

const guide = createGuide(`${agents.windows} Edg/120.0`);
guide.node("device-windows").click();
guide.node("browser-chrome").click();
assert(guide.node("browser-install-step").textContent.includes("open Google Chrome"));
assert(!guide.node("browser-install-next").hidden);
guide.node("browser-install-next").click();
assert(guide.node("browser-install-step").textContent.includes("three dots"));
guide.node("browser-install-back").click();
guide.node("browser-install-back").click();
assert.strictEqual(guide.node("browser-install-browser-selection").hidden, false);
guide.node("browser-install-back").click();
assert.strictEqual(guide.node("browser-install-selection").hidden, false);
guide.node("browser-install-back").click();
assert.strictEqual(guide.node("launch-choice-screen").hidden, false);
assert(html.includes('id="browser-install-cancel"'));
assert(app.includes('url.searchParams.get("install") === "1"'));
assert(!app.slice(app.indexOf("const showBrowserInstallGuide ="), app.indexOf("const markInstalledSetupComplete =")).includes('.remove()'));
console.log("PASS  browser mismatch, back navigation and direct guide entry");
