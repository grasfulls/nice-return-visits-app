// Run with: node tests/install-guidance.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const launchStart = app.indexOf("const launchInstall =");
const start = app.indexOf("const detectInstallEnvironment =");
const end = app.indexOf("\nconst markInstalledSetupComplete =", start);
const launchEnd = app.indexOf("\nconst detectInstallEnvironment", launchStart);
assert(launchStart >= 0 && launchEnd > launchStart && end > start);
const launchCode = app.slice(launchStart, launchEnd);
const code = app.slice(start, end);
for (const language of ["en", "es"]) {
  i18n._setCatalog(language, JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")));
}

const agents = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

function createGuide(
  userAgent,
  language = "en",
  maxTouchPoints = 0,
  prompt = null,
  platform = "",
  { launchChoice = false, legacyDomApi = false, failElementCreation = false } = {},
) {
  i18n._setCurrent(language);
  const nodes = new Map();
  const errors = [];
  let activeElement;
  const node = (id) => {
    if (!nodes.has(id)) {
      const listeners = new Map();
      const created = {
        id,
        hidden: ![
          "launch-choice-screen",
          "launch-install-detected",
          "launch-route-guidance",
          "launch-route-choice",
          "btn-launch-keep-suggested",
          "btn-launch-change-route",
          "btn-launch-keep-corrected",
          "btn-choose-install",
          "btn-choose-browser",
          "btn-continue-browser",
          "btn-install-instead",
        ].includes(id),
        open: false,
        disabled: false,
        _textContent: "",
        get textContent() { return this._textContent; },
        set textContent(value) {
          this._textContent = String(value);
          if (this._textContent === "") this.children = [];
        },
        value: "",
        children: [],
        isConnected: true,
        onclick: null,
        addEventListener(name, callback) {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name).add(callback);
        },
        removeEventListener(name, callback) {
          listeners.get(name)?.delete(callback);
        },
        dispatch(name) {
          this[`on${name}`]?.({ target: this });
          for (const callback of listeners.get(name) || []) callback({ target: this });
        },
        setAttribute(name, value) { this[name] = value; },
        removeAttribute(name) { delete this[name]; },
        replaceChildren() { this.children = []; },
        appendChild(child) { this.children.push(child); },
        focus() { activeElement = this; },
        getClientRects() { return [1]; },
        querySelectorAll() { return []; },
        click() { return this.onclick?.(); },
      };
      if (legacyDomApi && id === "browser-install-steps") {
        delete created.replaceChildren;
      }
      nodes.set(id, created);
    }
    return nodes.get(id);
  };
  const eventListeners = new Map();
  const localValues = new Map();
  const sessionValues = new Map();
  let reloads = 0;
  const context = {
    navigator: { userAgent, maxTouchPoints, platform },
    window: {
      nrvDeferredInstallPrompt: prompt,
      location: { reload() { reloads += 1; } },
      addEventListener(name, callback) {
        if (!eventListeners.has(name)) eventListeners.set(name, new Set());
        eventListeners.get(name).add(callback);
      },
      removeEventListener(name, callback) {
        eventListeners.get(name)?.delete(callback);
      },
      fire(name) {
        for (const callback of eventListeners.get(name) || []) callback();
      },
    },
    document: {
      title: "NRV",
      get activeElement() { return activeElement; },
      set activeElement(value) { activeElement = value; },
      getElementById: node,
      documentElement: { classList: { remove() {} } },
      createElement: (tagName) => {
        if (failElementCreation) throw new Error("DOM unavailable");
        return { tagName, textContent: "" };
      },
    },
    sessionStorage: {
      getItem(key) { return sessionValues.get(key) || null; },
      setItem(key, value) { sessionValues.set(key, String(value)); },
      removeItem(key) { sessionValues.delete(key); },
    },
    localStorage: {
      getItem(key) { return localValues.get(key) || null; },
      setItem(key, value) { localValues.set(key, String(value)); },
      removeItem(key) { localValues.delete(key); },
    },
    console: { error: (...args) => errors.push(args) },
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
  };
  activeElement = node("btn-choose-install");
  vm.runInNewContext(
    `const LAUNCH_MODE_KEY = "nrv_launch_mode";
      const INSTALL_ROUTE_KEY = "nrv_install_route";
      ${launchCode}
      ${code}
      const routeSelector = setupInstallRouteSelector({
        deviceSelect: document.getElementById("launch-install-device"),
        browserSelect: document.getElementById("launch-install-browser"),
        detected: document.getElementById("launch-install-detected"),
        environment: detectInstallEnvironment(
          navigator.userAgent,
          navigator.maxTouchPoints,
          navigator.platform,
        ),
      });
      this.routeSelector = routeSelector;
      this.showGuide = showBrowserInstallGuide;
      this.showLaunchChoice = showLaunchChoice;
      if (${launchChoice}) {
        showLaunchChoice({ preservationHandled: true });
      } else {
        showBrowserInstallGuide({ route: routeSelector.getRoute() });
      }`,
    context,
  );
  return {
    context,
    errors,
    node,
    localValues,
    reloads: () => reloads,
    routeSelector: context.routeSelector,
    showGuide: context.showGuide,
    showLaunchChoice: context.showLaunchChoice,
  };
}

for (const [userAgent, expected, device, browser] of [
  [agents.iphone, "Safari on an iPhone", "iphone", "safari"],
  [agents.ipad, "Safari on an iPad", "ipad", "safari"],
  [agents.android, "Google Chrome on an Android phone or tablet", "android", "chrome"],
  [agents.windows, "Google Chrome on a Windows computer", "windows", "chrome"],
  [`${agents.windows} Edg/120.0`, "Microsoft Edge on a Windows computer", "windows", "edge"],
  [agents.mac, "Safari on a Mac", "mac", "safari"],
  [agents.chromebook, "Google Chrome on a Chromebook", "chromebook", "chrome"],
]) {
  const guide = createGuide(userAgent);
  assert(guide.node("launch-install-detected").textContent.includes(expected));
  assert.strictEqual(guide.node("launch-install-device").value, device);
  assert.strictEqual(guide.node("launch-install-browser").value, browser);
  assert.strictEqual(guide.node("browser-install-screen").hidden, false);
  assert(guide.node("browser-install-steps").children.length > 0);
}
const unknown = createGuide("unknown");
assert(unknown.node("launch-install-detected").textContent.includes("another browser"));
assert.strictEqual(unknown.node("launch-install-device").value, "computer");
assert.strictEqual(unknown.node("launch-install-browser").value, "other");
console.log("PASS device/browser detection identifies supported routes and exposes correction when unknown");
const ipadDesktop = createGuide(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  "en",
  5,
  null,
  "MacIntel",
);
assert.strictEqual(ipadDesktop.node("launch-install-device").value, "ipad");
assert.strictEqual(ipadDesktop.node("launch-install-browser").value, "safari");
console.log("PASS iPadOS desktop-mode Safari is identified from platform and touch points");

const ipadInstallTransition = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true, legacyDomApi: true },
);
assert.strictEqual(ipadInstallTransition.node("launch-choice-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-screen").hidden, true);
assert.strictEqual(ipadInstallTransition.node("launch-choice-options").hidden, true);
ipadInstallTransition.node("btn-launch-keep-suggested").dispatch("click");
assert.strictEqual(ipadInstallTransition.node("launch-choice-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("launch-choice-options").hidden, false);
ipadInstallTransition.node("btn-choose-install").dispatch("click");
assert.strictEqual(ipadInstallTransition.node("launch-choice-screen").hidden, true);
assert.strictEqual(ipadInstallTransition.node("browser-install-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-instructions").hidden, false);
assert(ipadInstallTransition.node("browser-install-steps").children.some((step) => step.textContent.includes("Share")));
assert(ipadInstallTransition.node("browser-install-steps").children.some((step) => step.textContent.includes("Add to Home Screen")));
assert(ipadInstallTransition.node("browser-install-handoff-text").textContent.includes("swipe down"));
assert(ipadInstallTransition.node("browser-install-final-action").textContent.includes("Open as Web App"));
assert.strictEqual(ipadInstallTransition.node("browser-install-why").hidden, false);
assert.strictEqual(ipadInstallTransition.errors.length, 0);
console.log("PASS iPad/Safari Install NRV Icon transition renders complete guidance without replaceChildren");

const failedRender = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true, failElementCreation: true },
);
failedRender.node("btn-launch-keep-suggested").dispatch("click");
failedRender.node("btn-choose-install").dispatch("click");
assert.strictEqual(failedRender.node("launch-choice-screen").hidden, false);
assert.strictEqual(failedRender.node("browser-install-screen").hidden, true);
assert.strictEqual(failedRender.node("launch-choice-error").hidden, false);
assert.strictEqual(failedRender.errors.length, 1);
console.log("PASS a guide rendering error keeps the user on the chooser with a clear recovery message");

const preservedRouteFailure = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true, failElementCreation: true },
);
preservedRouteFailure.node("launch-choice-screen").hidden = true;
preservedRouteFailure.showGuide({ route: { device: "ipad", browser: "safari" } });
assert.strictEqual(preservedRouteFailure.node("launch-choice-screen").hidden, false);
assert.strictEqual(preservedRouteFailure.node("browser-install-screen").hidden, true);
assert.strictEqual(preservedRouteFailure.node("launch-install-device").value, "ipad");
assert.strictEqual(preservedRouteFailure.node("launch-install-browser").value, "safari");
assert.strictEqual(preservedRouteFailure.node("launch-choice-error").hidden, false);
console.log("PASS a failed guide from the data-preservation path restores the selected route for retry");

const supported = {
  iphone: { safari: "regular Safari" },
  ipad: { safari: "regular Safari" },
  android: {
    chrome: "three dots",
    edge: "three-line",
    firefox: "three dots",
    samsung: "three-line",
  },
  windows: { chrome: "Google Chrome", edge: "Microsoft Edge" },
  mac: { chrome: "Google Chrome", edge: "Microsoft Edge", safari: "File" },
  chromebook: { chrome: "three dots", edge: "Microsoft Edge" },
  computer: { chrome: "Google Chrome", edge: "Microsoft Edge" },
};
for (const language of ["en", "es"]) {
  for (const [device, browsers] of Object.entries(supported)) {
    for (const [browser, expected] of Object.entries(browsers)) {
      const guide = createGuide("unknown", language);
      guide.node("launch-install-device").value = device;
      guide.node("launch-install-device").dispatch("change");
      guide.node("launch-install-browser").value = browser;
      guide.node("launch-install-browser").dispatch("change");
      assert(guide.node("launch-install-detected").textContent);
      guide.showGuide({ route: guide.routeSelector.getRoute() });
      assert(guide.node("browser-install-steps").children.length >= 1, `${device}/${browser}/${language}`);
      assert.strictEqual(guide.node("browser-install-final-action").hidden, false, `${device}/${browser}/${language}`);
      assert.strictEqual(guide.node("browser-install-handoff").hidden, false);
      const allSteps = guide.node("browser-install-steps").children.map((item) => item.textContent).join(" ");
      if (language === "en") assert(allSteps.includes(expected), `${device}/${browser}`);
      const handoff = guide.node("browser-install-handoff-text").textContent.toLowerCase();
      assert(handoff.includes(language === "en" ? "icon" : "icono"), `${device}/${browser}/${language}: ${handoff}`);
      assert(handoff.includes(language === "en" ? "setup" : "configuración"));
    }
  }
}
assert(html.indexOf('id="browser-install-steps"') < html.indexOf('id="browser-install-handoff"'));
assert(html.indexOf('id="browser-install-handoff"') < html.indexOf('id="browser-install-final-action"'));
assert(html.indexOf('id="launch-install-detected"') < html.indexOf('id="btn-choose-install"'));
assert(!html.includes('id="browser-install-next"'));
assert(!html.includes('id="browser-install-wrong-browser"'));
assert(!html.includes('id="browser-install-manual"'));
console.log("PASS every supported route shows all steps and handoff guidance together in English and Spanish");

const apple = createGuide(agents.ipad);
assert.strictEqual(apple.node("browser-install-why").hidden, false);
const appleWhy = html.slice(html.indexOf('id="browser-install-why"'), html.indexOf('id="browser-install-handoff"'));
assert(appleWhy.includes("install.appleWhy"));
assert(i18n.t("install.appleWhy").includes("Apple requires"));
assert(apple.node("browser-install-handoff-text").textContent.includes("Open as Web App"));
assert(apple.node("browser-install-handoff-text").textContent.includes("Home Screen"));
const appleRoute = createGuide(agents.ipad, "es");
assert(appleRoute.node("browser-install-handoff-text").textContent.includes("pantalla de inicio"));
assert(!appleRoute.node("browser-install-handoff-text").textContent.includes("iPad"));
console.log("PASS Apple instructions explain the required Safari process and warn before Add");

const correction = createGuide(
  `${agents.windows} Edg/120.0`,
  "en",
  0,
  null,
  "",
  { launchChoice: true },
);
assert(correction.node("launch-install-detected").textContent.includes("Microsoft Edge on a Windows computer"));
assert.strictEqual(correction.node("launch-route-guidance").hidden, false);
assert.strictEqual(correction.node("btn-launch-keep-suggested").hidden, false);
assert.strictEqual(correction.node("btn-launch-change-route").hidden, false);
assert.strictEqual(correction.node("launch-install-device").value, "windows");
assert.strictEqual(correction.node("launch-install-browser").value, "edge");
correction.node("btn-launch-keep-suggested").dispatch("click");
correction.node("btn-choose-install").dispatch("click");
assert(correction.node("browser-install-instructions-title").textContent.includes("Microsoft Edge"));
assert(correction.node("browser-install-instructions-title").textContent.includes("Windows"));

const corrected = createGuide(
  `${agents.windows} Edg/120.0`,
  "en",
  0,
  null,
  "",
  { launchChoice: true },
);
corrected.node("btn-launch-change-route").dispatch("click");
assert.strictEqual(corrected.node("launch-choice-screen").hidden, false);
assert.strictEqual(corrected.node("launch-route-editor").hidden, false);
assert.strictEqual(corrected.node("launch-install-device").value, "windows");
assert.strictEqual(corrected.node("launch-install-browser").value, "edge");
corrected.node("launch-install-device").value = "mac";
corrected.node("launch-install-device").dispatch("change");
assert(corrected.node("launch-install-detected").textContent.includes("Mac"));
corrected.node("launch-install-browser").value = "safari";
corrected.node("launch-install-browser").dispatch("change");
assert(corrected.node("launch-install-detected").textContent.includes("Safari on a Mac"));
corrected.node("btn-launch-keep-corrected").dispatch("click");
assert.strictEqual(corrected.node("launch-route-editor").hidden, true);
assert.strictEqual(corrected.node("launch-choice-options").hidden, false);
assert.strictEqual(corrected.node("launch-choice-screen").hidden, false);
corrected.node("btn-choose-install").dispatch("click");
assert(corrected.node("browser-install-instructions-title").textContent.includes("Safari"));
assert(corrected.node("browser-install-instructions-title").textContent.includes("Mac"));
assert(!html.includes("That's not my browser"));
assert(!html.includes("That's not my device"));
assert(!html.includes("what's next"));
console.log("PASS suggested and corrected device/browser routes remain on Screen 1 and flow into installation");

const browserRisks = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true },
);
browserRisks.node("btn-launch-keep-suggested").dispatch("click");
browserRisks.node("btn-choose-browser").dispatch("click");
assert.strictEqual(browserRisks.node("launch-choice-screen").hidden, false);
assert.strictEqual(browserRisks.node("launch-browser-risk").hidden, false);
const englishCatalog = JSON.parse(fs.readFileSync(path.join(root, "locales", "en.json"), "utf8"));
assert(englishCatalog["launch.browserRiskTitle"].includes("Using NRV in a browser"));
assert(englishCatalog["launch.continueBrowser"].includes("Continue in Browser"));
assert(englishCatalog["launch.installInstead"].includes("Install NRV Icon Instead"));
browserRisks.node("btn-install-instead").dispatch("click");
assert.strictEqual(browserRisks.node("launch-browser-risk").hidden, true);
assert.strictEqual(browserRisks.node("launch-choice-options").hidden, false);
browserRisks.node("btn-choose-install").dispatch("click");
assert(browserRisks.node("browser-install-instructions-title").textContent.includes("Safari"));
console.log("PASS browser risk details stay in the first panel and icon-install return preserves the route");

const browserChoice = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true },
);
browserChoice.node("btn-launch-keep-suggested").dispatch("click");
browserChoice.node("btn-choose-browser").dispatch("click");
browserChoice.node("btn-continue-browser").dispatch("click");
assert.strictEqual(browserChoice.localValues.get("nrv_launch_mode"), "browser");
assert.strictEqual(browserChoice.reloads(), 1);
console.log("PASS Continue in Browser preserves the existing browser-use behavior after risk acknowledgment");

for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  const localized = createGuide(agents.ipad, language, 0, null, "", { launchChoice: true });
  assert(localized.node("launch-install-detected").textContent.includes("Safari"));
  localized.node("btn-launch-keep-suggested").dispatch("click");
  localized.node("btn-choose-browser").dispatch("click");
  assert.strictEqual(localized.node("launch-choice-screen").hidden, false);
  assert.strictEqual(localized.node("launch-browser-risk").hidden, false);
  assert(catalog["launch.routeGuidance"]);
  assert(catalog["launch.installRecommended"]);
  assert(catalog["launch.browserRisks"]);
  for (const phrase of language === "en"
    ? ["browser profiles", "separate copies", "multiple datasets", "update the wrong copy", "lose information", "current backup", "installed NRV icon is recommended"]
    : ["perfiles de navegador", "copias separadas", "varios conjuntos de datos", "copia equivocada", "perder información", "copia de seguridad actual", "icono instalado de NRV"]) {
    assert(catalog["launch.browserRiskText"].includes(phrase), `${language}: ${phrase}`);
  }
  assert(catalog["launch.continueBrowser"]);
  assert(catalog["launch.installInstead"]);
}
assert(html.includes('id="launch-install-detected"'));
assert(html.includes('data-i18n="install.keepSuggested"'));
assert(html.includes('data-i18n="launch.changeRoute"'));
assert(html.includes('data-i18n="launch.installRecommended"'));
assert(html.includes('id="launch-browser-risk"'));
assert(html.includes('id="launch-browser-risk-title"'));
assert(html.includes('data-i18n="launch.browserRiskText"'));
assert(html.includes('data-i18n="launch.continueBrowser"'));
assert(html.includes('data-i18n="launch.installInstead"'));
assert(html.includes('data-i18n="launch.websiteLink"'));
assert(/\.install-screen-actions button\s*\{\s*min-height:\s*44px;/.test(
  fs.readFileSync(path.join(root, "styles.css"), "utf8"),
));
assert(/\.install-screen-actions\[hidden\]\s*\{\s*display:\s*none;/.test(
  fs.readFileSync(path.join(root, "styles.css"), "utf8"),
));
console.log("PASS English/Spanish Screen 1 controls, risk details, back link, and mobile-sized buttons");

async function nativeChecks() {
  let prompts = 0;
  const accepted = createGuide(agents.android, "en", 0, {
    async prompt() { prompts += 1; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  assert.strictEqual(accepted.node("browser-install-native").hidden, false);
  assert(accepted.node("browser-install-handoff-text").textContent.includes("Home Screen"));
  await accepted.node("browser-install-native").click();
  assert.strictEqual(prompts, 1);
  assert(accepted.node("browser-install-status").textContent.includes("starting"));
  assert.strictEqual(accepted.context.window.nrvDeferredInstallPrompt, null);

  const dismissed = createGuide(agents.windows, "es", 0, {
    async prompt() { prompts += 1; },
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  await dismissed.node("browser-install-native").click();
  assert(dismissed.node("browser-install-status").textContent.includes("no se completó"));
  assert(dismissed.node("browser-install-steps").children.length > 0);

  const failed = createGuide(agents.windows, "en", 0, {
    async prompt() { throw new Error("prompt unavailable"); },
  });
  await failed.node("browser-install-native").click();
  assert(failed.node("browser-install-status").textContent.includes("could not be opened"));
  assert.strictEqual(failed.errors.length, 1);

  const latePrompt = createGuide(agents.android);
  latePrompt.context.window.nrvDeferredInstallPrompt = {
    async prompt() {},
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  };
  latePrompt.context.window.fire("beforeinstallprompt");
  assert.strictEqual(latePrompt.node("browser-install-native").hidden, false);
  const windowsInstalled = createGuide(agents.windows, "en", 0, {
    async prompt() { prompts += 1; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  }, "", { launchChoice: true });
  windowsInstalled.node("btn-launch-keep-suggested").dispatch("click");
  windowsInstalled.node("btn-choose-install").dispatch("click");
  assert.strictEqual(windowsInstalled.node("browser-install-screen").hidden, false);
  await windowsInstalled.node("browser-install-native").click();
  const windowsPendingHandoff = windowsInstalled.node("browser-install-status").textContent;
  assert(windowsPendingHandoff.includes("Search on the Windows taskbar"));
  assert(windowsPendingHandoff.includes("Start"));
  windowsInstalled.context.window.fire("appinstalled");
  const windowsHandoff = windowsInstalled.node("browser-install-status").textContent;
  assert(windowsHandoff.includes("NRV has been installed"));
  assert(windowsHandoff.includes("Search on the Windows taskbar"));
  assert(windowsHandoff.includes("search for Nice Return Visits"));
  assert(windowsHandoff.includes("Start"));
  assert(windowsHandoff.includes("place or pin it during installation"));
  assert.strictEqual(windowsInstalled.node("browser-install-instructions").hidden, false);
  assert.strictEqual(windowsInstalled.node("browser-install-screen").hidden, false);

  const windowsInstalledEs = createGuide(agents.windows, "es", 0, null, "", { launchChoice: true });
  windowsInstalledEs.node("btn-launch-keep-suggested").dispatch("click");
  windowsInstalledEs.node("btn-choose-install").dispatch("click");
  windowsInstalledEs.context.window.fire("appinstalled");
  const windowsHandoffEs = windowsInstalledEs.node("browser-install-status").textContent;
  assert(windowsHandoffEs.includes("NRV se instaló"));
  assert(windowsHandoffEs.includes("Buscar"));
  assert(windowsHandoffEs.includes("Nice Return Visits"));
  assert(windowsHandoffEs.includes("Inicio"));
  console.log("PASS native install accept/dismiss/failure and late browser prompt fallback");
  console.log("PASS Windows successful installation shows English/Spanish Search and optional-location guidance");
}

nativeChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert(html.includes('id="browser-install-cancel-link"'));
assert(html.includes('data-i18n="install.cancelLink"'));
assert(html.includes('data-i18n-attr="href:launch.websiteUrl"'));
assert(!/browser-install-cancel-link[\s\S]{0,300}(?:eraseAllData|deleteDatabase)/.test(app));
console.log("PASS install cancellation returns to the NRV site without erasing app data");

const setupFlow = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(setupFlow.includes('id="agreement-panel"'));
assert(setupFlow.includes('id="setup-wizard-step-1"'));
assert(setupFlow.includes('id="setup-existing-data"'));
assert(setupFlow.includes('id="installed-welcome"'));
assert(setupFlow.includes('id="btn-install-restore"'));
assert(setupFlow.includes('id="btn-install-open-existing"'));
assert(app.includes("showInstallScreen(\"install\")"));
assert(app.includes("showInstallScreen(\"existing\")"));
assert(app.includes("if (restoredFromBackup)"));
assert(app.includes('document.getElementById("installed-welcome").hidden = !isInstalledApp()'));
console.log("PASS installed NRV retains Terms/Privacy, new setup, existing-data and restore entry paths");
