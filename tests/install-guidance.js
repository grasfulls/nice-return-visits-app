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
        showModal() { this.open = true; },
        close() { this.open = false; },
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
  [agents.iphone, "We’ll proceed using an iPhone and Safari.", "iphone", "safari"],
  [agents.ipad, "We’ll proceed using an iPad and Safari.", "ipad", "safari"],
  [agents.android, "We’ll proceed using an Android phone or tablet and Google Chrome.", "android", "chrome"],
  [agents.windows, "We’ll proceed using a Windows computer and Google Chrome.", "windows", "chrome"],
  [`${agents.windows} Edg/120.0`, "We’ll proceed using a Windows computer and Microsoft Edge.", "windows", "edge"],
  [agents.mac, "We’ll proceed using a Mac and Safari.", "mac", "safari"],
  [agents.chromebook, "We’ll proceed using a Chromebook and Google Chrome.", "chromebook", "chrome"],
]) {
  const guide = createGuide(userAgent);
  assert.strictEqual(guide.node("launch-install-detected").textContent, expected);
  assert.strictEqual(guide.node("launch-install-detected").hidden, false);
  assert.strictEqual(guide.node("launch-install-device").value, device);
  assert.strictEqual(guide.node("launch-install-browser").value, browser);
  assert.strictEqual(guide.node("browser-install-screen").hidden, false);
  assert(guide.node("browser-install-steps").children.length > 0);
}
const unknown = createGuide("unknown");
assert.strictEqual(
  unknown.node("launch-install-detected").textContent,
  "We’ll proceed using a computer and another browser.",
);
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
assert.strictEqual(ipadInstallTransition.node("launch-install-detected").textContent, "We’ll proceed using an iPad and Safari.");
assert.strictEqual(ipadInstallTransition.node("launch-choice-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("launch-choice-options").hidden, false);
ipadInstallTransition.node("btn-choose-install").dispatch("click");
assert.strictEqual(ipadInstallTransition.node("launch-choice-screen").hidden, true);
assert.strictEqual(ipadInstallTransition.node("browser-install-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-instructions").hidden, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-why").hidden, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-title").textContent, "Nice Return Visits");
assert.strictEqual(ipadInstallTransition.context.document.title, "Nice Return Visits");
assert.strictEqual(ipadInstallTransition.node("browser-install-instructions-title").textContent, "Install NRV on this iPad using Safari");
assert.strictEqual(ipadInstallTransition.node("ipad-safari-sequence").hidden, false);
assert.deepStrictEqual(
  ipadInstallTransition.node("browser-install-steps").children.map((step) => step.textContent),
  ["Use a regular Safari tab. Installation is not supported from a Private tab."],
);
assert.strictEqual(ipadInstallTransition.node("browser-install-handoff").hidden, true);
assert.strictEqual(ipadInstallTransition.node("browser-install-final-action").hidden, true);
const installModeBeforeHelp = ipadInstallTransition.localValues.get("nrv_launch_mode");
ipadInstallTransition.node("ipad-search-help-link").dispatch("click");
assert.strictEqual(ipadInstallTransition.node("ipad-search-help-dialog").open, true);
assert.strictEqual(ipadInstallTransition.node("browser-install-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("launch-install-device").value, "ipad");
assert.strictEqual(ipadInstallTransition.node("launch-install-browser").value, "safari");
ipadInstallTransition.node("ipad-search-help-close").dispatch("click");
assert.strictEqual(ipadInstallTransition.node("ipad-search-help-dialog").open, false);
assert.strictEqual(ipadInstallTransition.node("browser-install-screen").hidden, false);
assert.strictEqual(ipadInstallTransition.node("launch-install-device").value, "ipad");
assert.strictEqual(ipadInstallTransition.node("launch-install-browser").value, "safari");
assert.strictEqual(ipadInstallTransition.localValues.get("nrv_launch_mode"), installModeBeforeHelp);
assert.strictEqual(ipadInstallTransition.errors.length, 0);
console.log("PASS iPad/Safari Screen 2 renders ordered guidance and in-page search help");

const failedRender = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true, failElementCreation: true },
);
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
      const ipadSafari = device === "ipad" && browser === "safari";
      assert.strictEqual(guide.node("browser-install-final-action").hidden, ipadSafari, `${device}/${browser}/${language}`);
      assert.strictEqual(guide.node("browser-install-handoff").hidden, ipadSafari);
      assert.strictEqual(guide.node("ipad-safari-sequence").hidden, !ipadSafari);
      const allSteps = guide.node("browser-install-steps").children.map((item) => item.textContent).join(" ");
      if (language === "en") assert(allSteps.includes(expected), `${device}/${browser}`);
      const handoff = guide.node("browser-install-handoff-text").textContent.toLowerCase();
      if (!ipadSafari) {
        assert(handoff.includes(language === "en" ? "icon" : "icono"), `${device}/${browser}/${language}: ${handoff}`);
        assert(handoff.includes(language === "en" ? "setup" : "configuración"));
      }
    }
  }
}
assert(html.indexOf('id="browser-install-steps"') < html.indexOf('id="browser-install-handoff"'));
assert(html.indexOf('id="browser-install-handoff"') < html.indexOf('id="browser-install-final-action"'));
assert(html.indexOf('id="launch-install-detected"') < html.indexOf('id="btn-choose-install"'));
assert(!html.includes('id="browser-install-next"'));
assert(!html.includes('id="browser-install-wrong-browser"'));
assert(!html.includes('id="browser-install-manual"'));
assert(html.includes('id="ipad-safari-following-steps" start="2"'));
assert(html.includes('id="ipad-search-help-dialog"'));
assert(html.includes('id="ipad-search-help-link" class="install-inline-link"'));
assert(html.includes('aria-hidden="true"> </span><button type="button" id="ipad-search-help-link"'));
assert(/\.install-inline-link\s*\{[^}]*text-decoration:\s*underline;/s.test(
  fs.readFileSync(path.join(root, "styles.css"), "utf8"),
));
const ipadScreen2Order = [
  'id="browser-install-title"',
  'id="browser-install-instructions-title"',
  'id="browser-install-why"',
  'data-i18n="install.appleWhy"',
  'id="browser-install-steps"',
  'id="ipad-safari-sequence"',
  'data-i18n="install.ipad.beforeProceed"',
  'data-i18n="install.ipad.proceedHeading"',
  'id="ipad-safari-following-steps"',
  'data-i18n="install.helpSummary"',
  'id="browser-install-cancel-link"',
];
let priorIpadScreen2Position = -1;
for (const marker of ipadScreen2Order) {
  const position = html.indexOf(marker);
  assert(position > priorIpadScreen2Position, `iPad Screen 2 order: ${marker}`);
  priorIpadScreen2Position = position;
}
assert.strictEqual((html.match(/install\.wizard\.safariShare/g) || []).length, 1);
assert.strictEqual((html.match(/install\.wizard\.safariHome"/g) || []).length, 1);
assert.strictEqual((html.match(/install\.wizard\.safariAdd"/g) || []).length, 1);
for (const language of ["en", "es"]) {
  const ipadLocalized = createGuide(agents.ipad, language);
  assert.strictEqual(ipadLocalized.node("browser-install-title").textContent,
    language === "en" ? "Nice Return Visits" : "Nice Return Visits");
  assert.strictEqual(ipadLocalized.node("ipad-safari-sequence").hidden, false);
  assert(html.includes('id="ipad-search-help-link" class="install-inline-link" data-i18n="install.ipad.searchLink">NRV</button>'));
  for (const key of [
    "install.ipad.beforeProceed",
    "install.ipad.readAhead",
    "install.ipad.instructionsMayDisappear",
    "install.ipad.findIcon",
    "install.ipad.noReturn",
    "install.ipad.proceedHeading",
    "install.ipad.searchHelpTitle",
    "install.ipad.searchHelpStep1",
    "install.ipad.searchHelpStep2",
    "install.ipad.searchHelpStep3",
    "install.ipad.searchHelpStep4",
    "install.ipad.searchHelpClose",
  ]) assert(i18n.t(key), `${language}: ${key}`);
  assert.strictEqual(i18n.t("install.ipad.searchLink"), "NRV");
  assert(i18n.t("install.wizard.safariShare"));
  assert(i18n.t("install.wizard.safariHome"));
  assert(i18n.t("install.wizard.safariAdd").includes("Open as Web App") ||
    language === "es" && i18n.t("install.wizard.safariAdd").includes("aplicación web"));
  assert.strictEqual(i18n.t("install.ipad.searchHelpTitle"),
    language === "en" ? "How to find NRV on your iPad" : "Cómo encontrar NRV en tu iPad");
  assert.strictEqual(i18n.t("install.ipad.searchHelpStep4"),
    language === "en" ? "Tap the NRV icon in the results." : "Toca el icono de NRV en los resultados.");
  assert.strictEqual(i18n.t("install.ipad.readAhead"),
    language === "en" ? "Read Steps 2–4 below before doing them." : "Lee los pasos 2–4 antes de realizarlos.");
  assert.strictEqual(i18n.t("install.wizard.safariAdd"),
    language === "en"
      ? "Turn on Open as Web App if offered, then tap Add."
      : "Activa Abrir como aplicación web si aparece y toca Añadir.");
}
const iphoneScreen2 = createGuide(agents.iphone);
assert.strictEqual(iphoneScreen2.node("ipad-safari-sequence").hidden, true);
assert.strictEqual(iphoneScreen2.node("browser-install-title").textContent, "Install Nice Return Visits app");
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
assert.strictEqual(correction.node("launch-install-detected").textContent, "We’ll proceed using a Windows computer and Microsoft Edge.");
assert.strictEqual(correction.node("launch-route-guidance").hidden, false);
assert.strictEqual(correction.node("btn-launch-change-route").hidden, false);
assert.strictEqual(correction.node("launch-install-device").value, "windows");
assert.strictEqual(correction.node("launch-install-browser").value, "edge");
assert.strictEqual(correction.node("launch-choice-options").hidden, false);
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
assert.strictEqual(corrected.node("launch-install-detected").textContent, "We’ll proceed using a Mac and Microsoft Edge.");
corrected.node("launch-install-browser").value = "safari";
corrected.node("launch-install-browser").dispatch("change");
assert.strictEqual(corrected.node("launch-install-detected").textContent, "We’ll proceed using a Mac and Safari.");
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
console.log("PASS default and corrected device/browser routes remain on Screen 1 and flow into installation");

const browserRisks = createGuide(
  agents.ipad,
  "en",
  0,
  null,
  "",
  { launchChoice: true },
);
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
browserChoice.node("btn-choose-browser").dispatch("click");
browserChoice.node("btn-continue-browser").dispatch("click");
assert.strictEqual(browserChoice.localValues.get("nrv_launch_mode"), "browser");
assert.strictEqual(browserChoice.reloads(), 1);
console.log("PASS Continue in Browser preserves the existing browser-use behavior after risk acknowledgment");

for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  const localized = createGuide(agents.ipad, language, 0, null, "", { launchChoice: true });
  assert.strictEqual(localized.node("launch-install-detected").hidden, false);
  assert.strictEqual(
    localized.node("launch-install-detected").textContent,
    language === "en"
      ? "We’ll proceed using an iPad and Safari."
      : "Continuaremos usando un iPad y Safari.",
  );
  localized.node("launch-route-guidance").textContent = i18n.t("launch.routeGuidance");
  assert.strictEqual(localized.node("launch-route-guidance").textContent,
    language === "en"
      ? "If that doesn’t look right, change the device or browser."
      : "Si no parece correcto, cambia el dispositivo o el navegador.");
  localized.node("btn-launch-change-route").dispatch("click");
  assert.strictEqual(localized.node("launch-install-device").value, "ipad");
  assert.strictEqual(localized.node("launch-install-browser").value, "safari");
  localized.node("launch-install-device").value = "windows";
  localized.node("launch-install-device").dispatch("change");
  localized.node("launch-install-browser").value = "chrome";
  localized.node("launch-install-browser").dispatch("change");
  assert.strictEqual(
    localized.node("launch-install-detected").textContent,
    language === "en"
      ? "We’ll proceed using a Windows computer and Google Chrome."
      : "Continuaremos usando una computadora con Windows y Google Chrome.",
  );
  localized.node("btn-launch-keep-corrected").dispatch("click");
  localized.node("btn-choose-browser").dispatch("click");
  assert.strictEqual(localized.node("launch-choice-screen").hidden, false);
  assert.strictEqual(localized.node("launch-browser-risk").hidden, false);
  assert(catalog["launch.routeProceed"]);
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
assert(!html.includes("btn-launch-keep-suggested"));
assert(!html.includes("btn-launch-keep-suggested"));
assert(!html.includes("install.keepSuggested"));
assert(!html.includes("If you’re not sure, keep the suggested device and browser."));
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
assert(/#launch-choice-screen\s+\.install-screen-actions\[hidden\]\s*\{\s*display:\s*none;/.test(
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
