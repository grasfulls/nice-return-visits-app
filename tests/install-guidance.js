// Run with: node tests/install-guidance.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const code = app.slice(app.indexOf("const launchInstall ="), app.indexOf("const markInstalledSetupComplete ="));
const devices = ["iphone", "ipad", "android", "windows", "mac", "chromebook", "computer"];
const browsers = ["chrome", "edge", "safari", "firefox", "samsung", "other"];
const agents = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};
for (const language of ["en", "es"]) {
  i18n._setCatalog(language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")));
}

function createGuide(userAgent, language = "en", maxTouchPoints = 0, storedSession = new Map(), unlockScreenRemoved = false) {
  i18n._setCurrent(language);
  const nodes = new Map();
  const errors = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: "", focus() { this.focused = true; },
      setAttribute(name, value) { this[name] = value; },
      click() { if (this.onclick) return this.onclick(); },
    });
    return nodes.get(id);
  }
  const deviceButtons = devices.map((device) => Object.assign(node(`device-${device}`), { dataset: { installDevice: device } }));
  const browserButtons = browsers.map((browser) => Object.assign(node(`browser-${browser}`), { dataset: { installBrowser: browser } }));
  const context = {
    navigator: { userAgent, maxTouchPoints },
    sessionStorage: {
      getItem: (key) => storedSession.get(key) || null,
      setItem: (key, value) => storedSession.set(key, value),
      removeItem: (key) => storedSession.delete(key),
    },
    window: { nrvDeferredInstallPrompt: null, location: { reload() { context.reloaded = true; } } },
    localStorage: { setItem(key, value) { context.saved = [key, value]; } },
    LAUNCH_MODE_KEY: "nrv_launch_mode",
    INSTALL_GUIDE_STATE_KEY: "nrv_install_guide_state",
    INSTALL_TRANSFER_PENDING_KEY: "nrv_install_transfer_pending",
    initialStoredInformation: { hasPotentialInformation: false },
    getInitialStoredInformation: () => Promise.resolve(context.initialStoredInformation),
    console: { error: (...args) => errors.push(args) },
    document: {
      title: "",
      documentElement: { classList: { remove() {} } },
      getElementById: (id) => id === "unlock-screen" && unlockScreenRemoved ? null : node(id),
      querySelectorAll: (selector) => selector === "[data-install-device]" ? deviceButtons : browserButtons,
    },
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
  };
  vm.runInNewContext(`${code}\nthis.launch = showLaunchChoice; this.launchPrompt = launchInstall; this.showGuide = showBrowserInstallGuide; showBrowserInstallGuide();`, context);
  return { node, context, errors, storedSession };
}

for (const [ua, expected] of [
  [agents.windows, "Google Chrome"],
  [`${agents.windows} Edg/120.0`, "Microsoft Edge"],
  [agents.iphone, "normal Safari"],
  [agents.iphone.replace("Version/17.0", "FxiOS/120.0"), "Safari"],
  [`${agents.android} SamsungBrowser/24.0`, "three-line"],
  [agents.mac, "File"],
  [agents.chromebook, "three dots"],
]) {
  const guide = createGuide(ua);
  assert.strictEqual(guide.node("browser-install-instructions").hidden, false);
  assert.strictEqual(guide.node("browser-install-selection").hidden, true);
  assert.strictEqual(guide.node("browser-install-browser-selection").hidden, true);
  assert(guide.node("browser-install-step").textContent.includes(expected), expected);
}
const touchIpad = createGuide(agents.mac, "en", 5);
assert(touchIpad.node("browser-install-step").textContent.includes("normal Safari"));
const unknown = createGuide("unknown");
assert.strictEqual(unknown.node("browser-install-selection").hidden, false);
const embedded = createGuide(`${agents.windows} FBAN/123`);
assert.strictEqual(embedded.node("browser-install-instructions").hidden, false);
assert(embedded.node("browser-install-step").textContent.includes("Google Chrome"));
assert(html.includes('id="btn-settings-install"'));
assert(html.includes('id="browser-install-wrong-browser"'));
assert(html.includes('role="dialog"') && html.includes('aria-modal="true"'));
assert(html.includes('data-i18n="launch.browserButton"'));
console.log("PASS  detected paths skip choices; unknown and embedded browsers use fallbacks");

const supported = {
  iphone: { safari: "normal Safari" },
  ipad: { safari: "normal Safari" },
  android: { chrome: "three dots", edge: "three-line", firefox: "three dots", samsung: "three-line" },
  windows: { chrome: "Google Chrome", edge: "Microsoft Edge" },
  mac: { chrome: "Google Chrome", edge: "Microsoft Edge", safari: "File" },
  chromebook: { chrome: "three dots", edge: "Microsoft Edge" },
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
            assert.strictEqual(guide.node("browser-install-help")["aria-expanded"], "true");
            assert(guide.node("browser-install-tip").textContent);
          }
          guide.node("browser-install-next").click();
          seen.push(guide.node("browser-install-step").textContent);
        }
        assert(count < 10);
        assert(seen.length >= 5, `${device}/${browser} handoff`);
        assert(seen.some((text) => text.includes(language === "en" ? "close this browser page" : "cierra esta página")));
        assert(seen.at(-1).toLowerCase().includes(language === "en" ? "restore" : "restaurar"));
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
guide.node("browser-install-wrong-browser").click();
guide.node("browser-chrome").click();
assert(guide.node("browser-install-step").textContent.includes("three dots"));
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

const browserCorrection = createGuide(`${agents.windows} Edg/120.0`);
browserCorrection.node("browser-install-wrong-browser").click();
assert.strictEqual(browserCorrection.node("browser-install-browser-selection").hidden, false);
browserCorrection.node("browser-chrome").click();
assert(browserCorrection.node("browser-install-step").textContent.includes("Google Chrome"));
assert.strictEqual(browserCorrection.node("browser-install-wrong-browser").hidden, false);
const deviceCorrection = createGuide(agents.windows);
deviceCorrection.node("browser-install-manual").click();
deviceCorrection.node("device-mac").click();
deviceCorrection.node("browser-safari").click();
assert(deviceCorrection.node("browser-install-step").textContent.includes("File"));
console.log("PASS  detected browser and device can be corrected without losing the guide");
const selectorProgress = new Map();
const selectorVisit = createGuide(`${agents.windows} Edg/120.0`, "en", 0, selectorProgress);
selectorVisit.node("browser-install-wrong-browser").click();
const selectorReturn = createGuide(`${agents.windows} Edg/120.0`, "en", 0, selectorProgress);
assert.strictEqual(selectorReturn.node("browser-install-browser-selection").hidden, false);
selectorReturn.node("browser-chrome").click();
assert(selectorReturn.node("browser-install-step").textContent.includes("Google Chrome"));
console.log("PASS  browser correction selection resumes after reload");

const guideProgress = new Map();
const firstVisit = createGuide(agents.iphone, "en", 0, guideProgress);
firstVisit.node("browser-install-next").click();
firstVisit.node("browser-install-help").click();
assert.strictEqual(firstVisit.node("browser-install-more-help").hidden, false);
firstVisit.node("browser-install-more-help").click();
assert.strictEqual(firstVisit.node("browser-install-more-tip").hidden, false);
const returnedVisit = createGuide(agents.iphone, "en", 0, guideProgress);
assert(returnedVisit.node("browser-install-step-title").textContent.includes("Step 2 of 7"));
assert(returnedVisit.node("browser-install-step").textContent.includes("Tap Share"));
assert.strictEqual(returnedVisit.node("browser-install-tip").hidden, false);
assert.strictEqual(returnedVisit.node("browser-install-help")["aria-expanded"], "true");
assert.strictEqual(returnedVisit.node("browser-install-more-tip").hidden, false);
assert.strictEqual(returnedVisit.node("browser-install-more-help")["aria-expanded"], "true");
returnedVisit.node("browser-install-next").click();
assert(returnedVisit.node("browser-install-step").textContent.includes("Add to Home Screen"));
console.log("PASS  step and open contextual help resume from stored session progress");

const inAppGuide = createGuide(agents.android);
inAppGuide.context.showGuide({ returnToApp: true });
assert.strictEqual(inAppGuide.node("app-container").hidden, true);
inAppGuide.node("browser-install-cancel").click();
assert.strictEqual(inAppGuide.node("app-container").hidden, false);
assert.strictEqual(inAppGuide.node("app-container").inert, false);
assert.strictEqual(inAppGuide.storedSession.has("nrv_install_guide_state"), false);
console.log("PASS  installation can be opened from preview and returned to without losing app state");
const postSetupGuide = createGuide(agents.android, "en", 0, new Map(), true);
postSetupGuide.context.showGuide({ returnToApp: true });
assert.strictEqual(postSetupGuide.node("browser-install-screen").hidden, false);
assert.strictEqual(postSetupGuide.node("app-container").hidden, true);
console.log("PASS  installation guide opens after the completed setup screen has been removed");
const escapeGuide = createGuide(agents.android);
escapeGuide.context.showGuide({ returnToApp: true });
let escapePrevented = false;
escapeGuide.node("browser-install-screen").onkeydown({
  key: "Escape",
  preventDefault() { escapePrevented = true; },
});
assert(escapePrevented);
assert.strictEqual(escapeGuide.node("app-container").hidden, false);
assert.strictEqual(escapeGuide.storedSession.has("nrv_install_guide_state"), false);
console.log("PASS  Escape exits the guide and restores the preview");

async function nativeChecks() {
  for (const language of ["en", "es"]) {
    const accepted = createGuide(agents.android, language);
    accepted.context.launch();
    let prompts = 0;
    accepted.context.window.nrvDeferredInstallPrompt = {
      async prompt() { prompts++; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    };
    await accepted.node("btn-choose-install").click();
    assert.strictEqual(prompts, 1);
    assert.strictEqual(accepted.node("browser-install-screen").hidden, false);
    assert.strictEqual(accepted.node("browser-install-selection").hidden, true);
    assert.strictEqual(accepted.node("browser-install-manual").hidden, true);
    assert.strictEqual(accepted.node("browser-install-step").textContent, i18n.t("install.wizard.nativeOpen"));
    accepted.node("browser-install-next").click();
    accepted.node("browser-install-help").click();
    assert.strictEqual(accepted.node("browser-install-tip").hidden, false);

    const declined = createGuide(agents.android, language);
    declined.context.launch();
    declined.context.window.nrvDeferredInstallPrompt = {
      async prompt() {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };
    await declined.node("btn-choose-install").click();
    assert.strictEqual(declined.node("launch-install-status").textContent, i18n.t("install.nativeDismissed"));
    assert.strictEqual(declined.node("btn-choose-install").disabled, false);
    await declined.node("btn-choose-install").click();
    assert.strictEqual(declined.node("browser-install-instructions").hidden, false);

    const failed = createGuide(agents.android, language);
    failed.context.launch();
    failed.context.window.nrvDeferredInstallPrompt = {
      async prompt() { throw new Error("prompt unavailable"); },
    };
    await failed.node("btn-choose-install").click();
    assert.strictEqual(failed.node("launch-install-status").textContent, i18n.t("install.nativeFailed"));
    assert.strictEqual(failed.errors.length, 1);
    await failed.node("btn-choose-install").click();
    assert.strictEqual(failed.node("browser-install-instructions").hidden, false);

    const preview = createGuide(agents.android, language);
    preview.context.launch();
    preview.node("btn-choose-browser").click();
    assert.deepStrictEqual(preview.context.saved, ["nrv_launch_mode", "browser"]);
    assert(preview.context.reloaded);

    const existingInformation = createGuide(agents.android, language);
    existingInformation.context.initialStoredInformation = {
      hasPotentialInformation: true,
    };
    existingInformation.context.launch();
    existingInformation.node("btn-choose-install").click();
    assert.deepStrictEqual(
      existingInformation.context.saved,
      ["nrv_launch_mode", "browser"],
    );
    assert.strictEqual(
      existingInformation.storedSession.get("nrv_install_transfer_pending"),
      "true",
    );
    assert(existingInformation.context.reloaded);

    const informationCheckFailed = createGuide(agents.android, language);
    informationCheckFailed.context.initialStoredInformation = {
      error: new Error("storage unavailable"),
    };
    informationCheckFailed.context.launch();
    informationCheckFailed.node("btn-choose-install").click();
    assert.strictEqual(
      informationCheckFailed.node("launch-install-status").textContent,
      i18n.t("install.storageCheckFailed"),
    );
    assert.strictEqual(informationCheckFailed.context.reloaded, undefined);

    const storageFailure = createGuide(agents.android, language);
    storageFailure.context.launch();
    storageFailure.context.localStorage.setItem = () => { throw new Error("storage unavailable"); };
    storageFailure.node("btn-choose-browser").click();
    assert.strictEqual(storageFailure.node("launch-choice-error").hidden, false);
    assert.strictEqual(storageFailure.context.reloaded, undefined);
    assert.strictEqual(storageFailure.errors.length, 1);
  }
  const nativeUnknown = createGuide("unknown", "en");
  nativeUnknown.context.showGuide({ native: true });
  nativeUnknown.node("browser-install-next").click();
  assert.strictEqual(nativeUnknown.node("browser-install-step").textContent, i18n.t("install.wizard.openUnknown"));
  const previewInstall = createGuide(agents.android, "en");
  let previewPrompts = 0;
  previewInstall.context.window.nrvDeferredInstallPrompt = {
    async prompt() { previewPrompts++; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  };
  await previewInstall.context.launchPrompt({
    returnToApp: true,
    statusElement: previewInstall.node("settings-install-status"),
    buttonElement: previewInstall.node("btn-settings-install"),
  });
  assert.strictEqual(previewPrompts, 1);
  assert.strictEqual(previewInstall.node("browser-install-screen").hidden, false);
  assert.strictEqual(previewInstall.node("browser-install-selection").hidden, true);
  console.log("PASS  native install accepted, dismissed and failed; manual fallback and preview in both languages");

  const head = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [standalone, mode, search, shouldCapture] of [
    [false, null, "", true],
    [false, "browser", "", true],
    [false, "browser", "?lang=es&install=1", true],
    [true, null, "", false],
  ]) {
    let listener;
    let prevented = false;
    const context = {
      window: {
        matchMedia: () => ({ matches: standalone }),
        addEventListener(name, callback) { if (name === "beforeinstallprompt") listener = callback; },
      },
      navigator: {},
      document: { documentElement: { classList: { add() {} } } },
      localStorage: { getItem: () => mode },
      location: { search },
      URLSearchParams, console,
    };
    vm.runInNewContext(head, context);
    const event = { preventDefault() { prevented = true; } };
    listener(event);
    assert.strictEqual(prevented, shouldCapture);
    assert.strictEqual(context.window.nrvDeferredInstallPrompt, shouldCapture ? event : null);
  }
  console.log("PASS  early native prompt capture is delayed until user action and disabled in installed mode");
}

nativeChecks().catch((error) => { console.error(error); process.exitCode = 1; });
