const DEFAULT_SETTINGS = {
  country: "United States",
  addressingCountry: "United States",
  workingNeedGreater: { enabled: false, designation: "", country: "" },
  countries: ["Canada", "Japan", "Mexico", "Peru", "United States"],
  state: "",
  defaultCity: "",
  cities: [],
  regions: [],
  areas: [],
};
let selectedAddressingCountry = DEFAULT_SETTINGS.addressingCountry;
let selectedContactAddressingCountry = DEFAULT_SETTINGS.addressingCountry;
const ENCRYPTION_ITERATIONS = 310000;
const ENCRYPTION_META_KEY = "encryption-meta";
// Set to true to require a passphrase when no encryption has been set up yet.
// Applies to newly created passphrases only; existing 8+ character ones still unlock.
const MIN_PASSPHRASE_LENGTH = 12;
const APP_VERSION = "0.9.060";
const APP_BUILD_REVISION = "sha256:50485d8d46da4160812c94568e1f311f5c595ccaf581a34915123f72ac5ed60c";
const appText = (key, fallback, vars) =>
  window.NRVI18n?.t(key, vars, fallback) || fallback;
const publicVersionHistoryUrl = (version, language) => {
  const page = language === "es" ? "es/version-history.html" : "version-history.html";
  const url = new URL(page, "https://nicereturnvisits.org/");
  url.hash = `version-${version.replace(/\./g, "-")}`;
  return url.href;
};
const updatePublicVersionLink = (link) => {
  link.href = publicVersionHistoryUrl(APP_VERSION, window.NRVI18n.getLanguage());
};
const parseAppVersion = (version) => {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(?:0|0(?:5[89]|[6-9]\d)|[1-9]\d*)(?![\s\S])/.test(version)) {
    throw new Error("Invalid app version; expected MAJOR.MINOR.PATCH.");
  }
  return version.split(".");
};
const parseAppBuildRevision = (revision) => {
  if (typeof revision !== "string" ||
      !/^sha256:[a-f0-9]{64}(?![\s\S])/.test(revision)) {
    throw new Error("Invalid deployment asset revision.");
  }
  return revision;
};
const appVersionOrder = (version) => {
  const parts = parseAppVersion(version);
  const patch = Number(parts[2]);
  // 0.9.51 and later are small updates to 0.9.5, before the larger 0.9.6 release.
  if (parts[0] === "0" && parts[1] === "9" && patch >= 51) {
    return [parts[0], parts[1], "5", String(patch - 50)];
  }
  return [parts[0], parts[1], parts[2], "0"];
};
const compareAppVersions = (left, right) => {
  const leftParts = appVersionOrder(left);
  const rightParts = appVersionOrder(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
};
const fetchDeployedAppMetadata = async () => {
  const url = new URL("version.json", document.baseURI);
  const nonce = new Uint32Array(4);
  crypto.getRandomValues(nonce);
  url.searchParams.set("check", Array.from(nonce, (value) => value.toString(16)).join("-"));
  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) throw new Error(`Version check failed with status ${response.status}.`);
  const metadata = await response.json();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
      Object.keys(metadata).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(metadata, "version") ||
      !Object.prototype.hasOwnProperty.call(metadata, "revision")) {
    throw new Error("Invalid deployment version metadata.");
  }
  parseAppVersion(metadata.version);
  parseAppBuildRevision(metadata.revision);
  return metadata;
};
const guardDetailsFocusScroll = (form, scroller, viewport, clock) => {
  let pending = null;
  const visibleBounds = () => {
    const bounds = scroller.getBoundingClientRect();
    return {
      top: Math.max(bounds.top, viewport.offsetTop),
      bottom: Math.min(bounds.bottom, viewport.offsetTop + viewport.height),
    };
  };
  form.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!field.matches("input, select, textarea")) {
      pending = null;
      return;
    }
    const bounds = visibleBounds();
    const rect = field.getBoundingClientRect();
    pending = rect.top >= bounds.top && rect.bottom <= bounds.bottom
      ? { field, scrollTop: scroller.scrollTop, time: clock.now() }
      : null;
  });
  form.addEventListener("focusout", () => { pending = null; });
  ["touchstart", "pointerdown", "wheel"].forEach((event) => {
    scroller.addEventListener(event, () => { pending = null; }, { passive: true });
  });
  scroller.addEventListener("scroll", () => {
    if (!pending) return;
    const { field, scrollTop, time } = pending;
    if (clock.now() - time > 800 || document.activeElement !== field) {
      pending = null;
      return;
    }
    const bounds = visibleBounds();
    const rect = field.getBoundingClientRect();
    if (Math.abs(scroller.scrollTop - scrollTop) > 100 &&
        (rect.bottom < bounds.top || rect.top > bounds.bottom)) {
      pending = null;
      scroller.scrollTop = scrollTop;
    }
  }, { passive: true });
};
const localizeMapControls = (leafletMap) => {
  const zoomControls = leafletMap.zoomControl.getContainer();
  [
    [".leaflet-control-zoom-in", appText("map.zoomIn", "Zoom in")],
    [".leaflet-control-zoom-out", appText("map.zoomOut", "Zoom out")],
  ].forEach(([selector, label]) => {
    const button = zoomControls.querySelector(selector);
    button.title = label;
    button.setAttribute("aria-label", label);
  });
  leafletMap.on("popupopen", (event) => {
    const popup = event.popup.getElement();
    const button = popup.querySelector(".leaflet-popup-close-button");
    if (button) button.setAttribute("aria-label", appText("map.closePopup", "Close popup"));
    const editButton = popup.querySelector(".map-popup-edit");
    if (
      editButton?.addEventListener &&
      editButton.dataset.contactEditBound !== "true"
    ) {
      editButton.dataset.contactEditBound = "true";
      editButton.addEventListener("click", () =>
        window.editContact?.(editButton.dataset.contactId),
      );
    }
  });
};
const displayCountry = (country) => {
  const labels = {
    Canada: appText("country.canada", "Canada"),
    Mexico: appText("country.mexico", "Mexico"),
    Peru: appText("country.peru", "Peru"),
    Japan: appText("country.japan", "Japan"),
    "United States": appText("country.unitedStates", "United States"),
  };
  return Object.prototype.hasOwnProperty.call(labels, country) ? labels[country] : country;
};
const updateAddressLabels = (prefix, country) => {
  const peru = normalizeCountry(country) === "Peru";
  const japan = normalizeCountry(country) === "Japan";
  const labels = prefix === "contact"
    ? [
        ["address-label", japan ? "contacts.japaneseAddress" : "contacts.address"],
        ["state-label", peru ? "contacts.department" : japan ? "contacts.prefecture" : "contacts.state"],
        ["city-label", peru ? "contacts.locality" : japan ? "contacts.cityWard" : "contacts.city"],
        ["region-label", peru ? "contacts.province" : japan ? "contacts.neighborhood" : "contacts.region"],
        ["area-label", peru ? "contacts.district" : japan ? "contacts.block" : "contacts.area"],
        ["new-region-label", peru ? "location.newProvince" : japan ? "location.newNeighborhood" : "location.newRegion"],
        ["new-area-label", peru ? "location.newDistrict" : japan ? "location.newBlock" : "location.newArea"],
        ["region-hint", peru ? "location.provinceHint" : "location.regionHint"],
        ["area-hint", peru ? "location.districtHint" : "location.areaHint"],
      ]
    : [
        ["address-label", japan ? "contacts.japaneseAddress" : "contacts.address"],
        ["state-label", peru ? "contacts.department" : japan ? "contacts.prefecture" : "contacts.state"],
        ["city-label", peru ? "location.localityLabel" : japan ? "contacts.cityWard" : "location.cityLabel"],
        ["region-label", peru ? "location.provinceLabel" : japan ? "contacts.neighborhood" : "location.regionLabel"],
        ["area-label", peru ? "location.districtLabel" : japan ? "contacts.block" : "location.areaLabel"],
        ["new-region-label", peru ? "location.newProvince" : japan ? "location.newNeighborhood" : "location.newRegion"],
        ["new-area-label", peru ? "location.newDistrict" : japan ? "location.newBlock" : "location.newArea"],
      ];
  labels.forEach(([suffix, key]) => {
    const element = document.getElementById(`${prefix}-${suffix}`);
    if (element) element.textContent = appText(key, element.textContent);
  });
  const stateInput = document.getElementById(`${prefix}-state`);
  const cityInput = document.getElementById(
    prefix === "contact" ? "contact-city-select" : "me-city",
  );
  const regionSelect = document.getElementById(
    prefix === "contact" ? "contact-region-select" : "me-region",
  );
  const areaSelect = document.getElementById(
    prefix === "contact" ? "contact-area-select" : "me-area",
  );
  const regionInput = document.getElementById(`input-new-${prefix}-region`);
  const areaInput = document.getElementById(`input-new-${prefix}-area`);
  const regionButton = document.getElementById(`btn-save-new-${prefix}-region`);
  const areaButton = document.getElementById(`btn-save-new-${prefix}-area`);
  if (stateInput) {
    stateInput.placeholder = appText(
      peru
        ? "location.departmentPlaceholder"
        : japan
          ? "location.prefecturePlaceholder"
          : "location.statePlaceholder",
      stateInput.placeholder,
    );
  }
  if (cityInput) {
    cityInput.placeholder = appText(
      peru
        ? "location.localityPlaceholder"
        : japan
          ? "location.cityWardPlaceholder"
          : "location.cityPlaceholder",
      cityInput.placeholder,
    );
  }
  if (regionSelect?.firstElementChild) {
    regionSelect.firstElementChild.textContent = appText(
      "common.none",
      regionSelect.firstElementChild.textContent,
    );
    const addOption = Array.from(regionSelect.options).find(
      (option) => option.value === "__ADD_NEW__",
    );
    if (addOption) {
      addOption.textContent = appText(
        peru
          ? "location.addProvinceButton"
          : japan
            ? "location.addNeighborhood"
            : "location.addRegion",
        addOption.textContent,
      );
    }
  }
  if (areaSelect?.firstElementChild) {
    areaSelect.firstElementChild.textContent = appText(
      "common.none",
      areaSelect.firstElementChild.textContent,
    );
    const addOption = Array.from(areaSelect.options).find(
      (option) => option.value === "__ADD_NEW__",
    );
    if (addOption) {
      addOption.textContent = appText(
        peru
          ? "location.addDistrictButton"
          : japan
            ? "location.addBlock"
            : "location.addArea",
        addOption.textContent,
      );
    }
  }
  if (regionInput) {
    regionInput.placeholder = appText(
      peru
        ? "location.enterProvince"
        : japan
          ? "location.enterNeighborhood"
          : "location.enterRegion",
      regionInput.placeholder,
    );
  }
  if (areaInput) {
    areaInput.placeholder = appText(
      peru
        ? "location.enterDistrict"
        : japan
          ? "location.enterBlock"
          : "location.enterArea",
      areaInput.placeholder,
    );
  }
  if (regionButton) {
    regionButton.textContent = appText(
      peru
        ? "location.addProvinceButton"
        : japan
          ? "location.addNeighborhoodButton"
          : "location.addRegionButton",
      regionButton.textContent,
    );
  }
  if (areaButton) {
    areaButton.textContent = appText(
      peru
        ? "location.addDistrictButton"
        : japan
          ? "location.addBlockButton"
          : "location.addAreaButton",
      areaButton.textContent,
    );
  }
};
const locationTypeDisplay = (type) => ({
  City: appText("location.typeCity", "city"),
  Region: appText("location.typeRegion", "region"),
  Area: appText("location.typeArea", "area"),
})[type] || type.toLowerCase();

// Bump on any change to the stored data shape, and add a migration in
// normalizeRegionData. Version 3 added country; version 5 added postal codes.
// Version 6 added independent addressing; version 7 added working designations;
// version 8 adds goals, milestones, and occurrence history.
const SCHEMA_VERSION = 10;
const EPOCH_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const GOAL_PATHS = {
  beginMinistry: {
    nameKey: "goals.path.beginMinistry",
    icon: "🌱",
    type: "target",
    items: [
      "participateAspect",
      "startConversationDoor",
      "shareThought",
      "participateAgain",
      "chooseRegularGoal",
    ],
  },
  participate: {
    nameKey: "goals.path.participate",
    icon: "📅",
    type: "recurring",
    items: ["chooseRhythm", "planAttainable", "recordSession"],
  },
  auxiliary: {
    nameKey: "goals.path.auxiliary",
    icon: "🌅",
    type: "target",
    items: ["learnAuxiliary", "choosePeriod", "planSchedule", "reviewProgress"],
  },
  regular: {
    nameKey: "goals.path.regular",
    icon: "🌄",
    type: "target",
    items: ["learnRegular", "planSustainable", "reviewProgress"],
  },
  returnVisits: {
    nameKey: "goals.path.returnVisits",
    icon: "↩️",
    type: "target",
    items: ["planFollowUp", "prepareQuestion", "recordOutcome", "reviewStudy"],
  },
  informal: {
    nameKey: "goals.path.informal",
    icon: "💬",
    type: "recurring",
    items: ["noticeOpportunity", "prepareConversation", "reflectConversation"],
  },
  skills: {
    nameKey: "goals.path.skills",
    icon: "📖",
    type: "target",
    items: ["chooseSkill", "practiceSkill", "reflectSkill"],
  },
  needGreater: {
    nameKey: "goals.path.needGreater",
    icon: "🧭",
    type: "repeatable",
    items: ["learnNeedGreater", "considerCircumstances", "planPracticalSteps"],
  },
  unassigned: {
    nameKey: "goals.path.unassigned",
    icon: "🗺️",
    type: "repeatable",
    items: ["chooseTerritory", "planSessions", "recordCompletion"],
  },
  seldomWorked: {
    nameKey: "goals.path.seldomWorked",
    icon: "🗺️",
    type: "repeatable",
    selectable: false,
    items: ["chooseTerritory", "planSessions", "recordCompletion"],
  },
};
const GOAL_ITEM_KEYS = {
  chooseRhythm: "goals.item.chooseRhythm",
  planAttainable: "goals.item.planAttainable",
  recordSession: "goals.item.recordSession",
  learnAuxiliary: "goals.item.learnAuxiliary",
  choosePeriod: "goals.item.choosePeriod",
  planSchedule: "goals.item.planSchedule",
  reviewProgress: "goals.item.reviewProgress",
  learnRegular: "goals.item.learnRegular",
  planSustainable: "goals.item.planSustainable",
  planFollowUp: "goals.item.planFollowUp",
  prepareQuestion: "goals.item.prepareQuestion",
  recordOutcome: "goals.item.recordOutcome",
  reviewStudy: "goals.item.reviewStudy",
  noticeOpportunity: "goals.item.noticeOpportunity",
  prepareConversation: "goals.item.prepareConversation",
  reflectConversation: "goals.item.reflectConversation",
  chooseSkill: "goals.item.chooseSkill",
  practiceSkill: "goals.item.practiceSkill",
  reflectSkill: "goals.item.reflectSkill",
  learnNeedGreater: "goals.item.learnNeedGreater",
  considerCircumstances: "goals.item.considerCircumstances",
  planPracticalSteps: "goals.item.planPracticalSteps",
  chooseTerritory: "goals.item.chooseTerritory",
  planSessions: "goals.item.planSessions",
  recordCompletion: "goals.item.recordCompletion",
  adjustedStep: "goals.adjustedStep",
  participateAspect: "goals.item.participateAspect",
  startConversationDoor: "goals.item.startConversationDoor",
  shareThought: "goals.item.shareThought",
  participateAgain: "goals.item.participateAgain",
  chooseRegularGoal: "goals.item.chooseRegularGoal",
};
const GOAL_METHODS = {
  doorToDoor: "goals.method.doorToDoor",
  letterWriting: "goals.method.letterWriting",
  telephone: "goals.method.telephone",
  public: "goals.method.public",
  smpw: "goals.method.smpw",
  informal: "goals.method.informal",
  other: "goals.method.other",
};

class NewerDataVersionError extends Error {
  constructor() {
    super(
      "This data was saved by a newer version of the app. Update the app (reload it) before opening this data. Nothing was changed.",
    );
    this.name = "NewerDataVersionError";
  }
}
const APP_UPDATE_PENDING_KEY = "return_visits_app_update_pending";
const INSTALLED_SETUP_COMPLETE_KEY = "nrv_installed_setup_completed";
const LAUNCH_MODE_KEY = "nrv_launch_mode";
const INSTALL_TRANSFER_PENDING_KEY = "nrv_install_transfer_pending";
const INSTALL_ROUTE_KEY = "nrv_install_route";
let browserPreview = false;
const isInstalledApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;
const launchInstall = ({ route, statusElement } = {}) => {
  if (statusElement) {
    statusElement.textContent = "";
    statusElement.hidden = true;
  }
  try {
    return showBrowserInstallGuide({ route });
  } catch (error) {
    return showInstallGuideFailure(error, route);
  }
};
const showLaunchChoice = ({
  returnToApp = false,
  preservationHandled = false,
} = {}) => {
  document.getElementById("unlock-screen").hidden = true;
  const appContainer = document.getElementById("app-container");
  appContainer.hidden = true;
  appContainer.inert = true;
  appContainer.setAttribute("aria-hidden", "true");
  const screen = document.getElementById("launch-choice-screen");
  screen.hidden = false;
  document.documentElement.classList.remove("show-launch-choice");
  document.getElementById("launch-route-editor").hidden = true;
  document.getElementById("launch-browser-risk").hidden = true;
  document.getElementById("launch-choice-options").hidden = false;
  const installButton = document.getElementById("btn-choose-install");
  const browserButton = document.getElementById("btn-choose-browser");
  const routeEditor = document.getElementById("launch-route-editor");
  const choiceOptions = document.getElementById("launch-choice-options");
  const browserRisk = document.getElementById("launch-browser-risk");
  const changeRouteButton = document.getElementById("btn-launch-change-route");
  const keepCorrectedButton = document.getElementById(
    "btn-launch-keep-corrected",
  );
  const browserRiskTitle = document.getElementById(
    "launch-browser-risk-title",
  );
  const routeSelectors = setupInstallRouteSelector({
    deviceSelect: document.getElementById("launch-install-device"),
    browserSelect: document.getElementById("launch-install-browser"),
    detected: document.getElementById("launch-install-detected"),
    environment: detectInstallEnvironment(
      navigator.userAgent || "",
      navigator.maxTouchPoints,
      navigator.platform || "",
    ),
    savedRoute: readSavedInstallRoute(),
  });
  const showInstallChoices = () => {
    routeEditor.hidden = true;
    choiceOptions.hidden = false;
    installButton.focus();
  };
  changeRouteButton.onclick = () => {
    routeEditor.hidden = false;
    document.getElementById("launch-install-device").focus();
  };
  keepCorrectedButton.onclick = showInstallChoices;
  browserButton.hidden = returnToApp;
  installButton.disabled = !preservationHandled;
  (installButton.disabled ? changeRouteButton : installButton).focus();
  if (!preservationHandled) {
    getInitialStoredInformation().then((result) => {
      if (screen.hidden) return;
      installButton.disabled = Boolean(result.error);
      if (result.error) {
        const status = document.getElementById("launch-install-status");
        status.textContent = appText(
          "install.storageCheckFailed",
          "We could not check this browser for saved NRV information. Choose browser use first, then open Settings to try installing again.",
        );
        status.hidden = false;
        (returnToApp ? changeRouteButton : browserButton).focus();
      } else {
        installButton.focus();
      }
    });
  }
  installButton.onclick = () => {
    const status = document.getElementById("launch-install-status");
    const route = routeSelectors.getRoute();
    if (!preservationHandled && (!initialStoredInformation || initialStoredInformation.error)) {
      status.textContent = appText(
        "install.storageCheckFailed",
        "We could not check this browser for saved NRV information. Choose browser use first, then open Settings to try installing again.",
      );
      status.hidden = false;
      return;
    }
    if (!preservationHandled && initialStoredInformation.hasPotentialInformation) {
      try {
        localStorage.setItem(LAUNCH_MODE_KEY, "browser");
        sessionStorage.setItem(INSTALL_TRANSFER_PENDING_KEY, "true");
        sessionStorage.setItem(INSTALL_ROUTE_KEY, JSON.stringify(route));
        window.location.reload();
      } catch (error) {
        console.error("Unable to prepare the existing-information handoff:", error);
        status.textContent = appText(
          "install.handoffStartFailed",
          "NRV could not prepare the information-preserving steps. Your browser information has not changed. Choose browser use, then open Settings to try again.",
        );
        status.hidden = false;
      }
      return;
    }
    try {
      sessionStorage.removeItem(INSTALL_ROUTE_KEY);
    } catch (error) {
      console.error("Unable to clear the saved installation route:", error);
    }
    return launchInstall({ route, statusElement: status });
  };
  const chooseBrowser = () => {
    const errorMessage = document.getElementById("launch-choice-error");
    try {
      localStorage.setItem(LAUNCH_MODE_KEY, "browser");
      sessionStorage.removeItem(INSTALL_ROUTE_KEY);
    } catch (error) {
      console.error("Unable to save the selected launch mode:", error);
      errorMessage.textContent =
        appText("launch.saveChoiceFailed", "We could not save your choice on this device. Check your browser storage settings and try again.");
      errorMessage.hidden = false;
      return;
    }
    try {
      sessionStorage.removeItem(INSTALL_TRANSFER_PENDING_KEY);
    } catch (error) {
      console.error("Unable to clear installation session state:", error);
    }
    window.location.reload();
  };
  browserButton.onclick = () => {
    choiceOptions.hidden = true;
    browserRisk.hidden = false;
    browserRiskTitle.focus();
  };
  document.getElementById("btn-continue-browser").onclick = chooseBrowser;
  document.getElementById("btn-install-instead").onclick = () => {
    browserRisk.hidden = true;
    choiceOptions.hidden = false;
    installButton.focus();
  };
};
const showInstallGuideFailure = (error, route = null) => {
  console.error("Unable to prepare the installation guide:", error);
  const launchChoice = document.getElementById("launch-choice-screen");
  if (launchChoice.hidden) {
    if (route) {
      try {
        sessionStorage.setItem(INSTALL_ROUTE_KEY, JSON.stringify(route));
      } catch (storageError) {
        console.error("Unable to preserve the selected installation route:", storageError);
      }
    }
    showLaunchChoice({ preservationHandled: true });
  }
  document.getElementById("browser-install-screen").hidden = true;
  const errorMessage = document.getElementById("launch-choice-error");
  errorMessage.textContent = appText(
    "install.renderFailed",
    "The installation instructions could not be displayed. Reload this page and try again.",
  );
  errorMessage.hidden = false;
  return false;
};
const detectInstallEnvironment = (userAgent, maxTouchPoints, platform = "") => {
  const isIPad = /iPad/i.test(userAgent) ||
    ((/Macintosh|MacIntel/i.test(userAgent) || platform === "MacIntel") &&
      maxTouchPoints > 1);
  const devices = [
    ["iphone", /iPhone|iPod/i.test(userAgent)],
    ["ipad", isIPad],
    ["android", /Android/i.test(userAgent)],
    ["chromebook", /CrOS/i.test(userAgent)],
    ["windows", /Windows/i.test(userAgent) && !/Windows Phone/i.test(userAgent)],
    ["mac", (/Macintosh|MacIntel/i.test(userAgent) || platform === "MacIntel") &&
      Number.isFinite(maxTouchPoints) && maxTouchPoints <= 1],
  ].filter((entry) => entry[1]).map((entry) => entry[0]);
  const device = devices.length === 1 &&
    !/Windows Phone/i.test(userAgent) ? devices[0] : null;
  let browser = null;
  const embedded = /FBAN|FBAV|Instagram|GSA\/| wv\)/i.test(userAgent);
  if (!embedded && !/DuckDuckGo|OPR\/|OPiOS/i.test(userAgent)) {
    if (/Edg(?:e|A|iOS)?\//i.test(userAgent)) browser = "edge";
    else if (/SamsungBrowser\//i.test(userAgent)) browser = "samsung";
    else if (/Firefox\/|FxiOS\//i.test(userAgent)) browser = "firefox";
    else if (/Chrome\/|CriOS\//i.test(userAgent)) browser = "chrome";
    else if (/Version\/[\d.]+.*Safari\//i.test(userAgent)) browser = "safari";
  }
  return { device, browser, embedded };
};
const setupInstallRouteSelector = ({
  deviceSelect,
  browserSelect,
  detected,
  environment,
  savedRoute = null,
}) => {
  const deviceNames = {
    iphone: appText("install.device.display.iphone", "an iPhone"),
    ipad: appText("install.device.display.ipad", "an iPad"),
    android: appText("install.device.display.android", "an Android phone or tablet"),
    windows: appText("install.device.display.windows", "a Windows computer"),
    mac: appText("install.device.display.mac", "a Mac"),
    chromebook: appText("install.device.display.chromebook", "a Chromebook"),
    computer: appText("install.device.display.computer", "a computer"),
  };
  const browserNames = {
    chrome: appText("install.browser.chrome", "Google Chrome"),
    edge: appText("install.browser.edge", "Microsoft Edge"),
    safari: appText("install.browser.safari", "Safari"),
    firefox: appText("install.browser.firefox", "Firefox"),
    samsung: appText("install.browser.samsung", "Samsung Internet"),
    other: appText("install.browser.other", "another browser"),
  };
  deviceSelect.value = savedRoute?.device || environment.device || "computer";
  browserSelect.value = savedRoute?.browser || environment.browser || "other";
  const update = () => {
    detected.textContent = appText(
      "launch.routeProceed",
      "We’ll proceed using {device} and {browser}.",
      {
        browser: browserNames[browserSelect.value],
        device: deviceNames[deviceSelect.value],
      },
    );
  };
  deviceSelect.onchange = update;
  browserSelect.onchange = update;
  update();
  return {
    getRoute: () => ({
      device: deviceSelect.value,
      browser: browserSelect.value,
    }),
  };
};
const readSavedInstallRoute = () => {
  try {
    const value = sessionStorage.getItem(INSTALL_ROUTE_KEY);
    if (!value) return null;
    const route = JSON.parse(value);
    const validDevices = new Set([
      "iphone", "ipad", "android", "windows", "mac", "chromebook", "computer",
    ]);
    const validBrowsers = new Set([
      "chrome", "edge", "safari", "firefox", "samsung", "other",
    ]);
    if (validDevices.has(route.device) && validBrowsers.has(route.browser)) {
      return route;
    }
    throw new Error("The saved installation route is invalid.");
  } catch (error) {
    if (error instanceof SyntaxError || error.message === "The saved installation route is invalid.") {
      console.error("Unable to use the saved installation route:", error);
      try {
        sessionStorage.removeItem(INSTALL_ROUTE_KEY);
      } catch (storageError) {
        console.error("Unable to clear the invalid installation route:", storageError);
      }
      return null;
    }
    console.error("Unable to read the saved installation route:", error);
    return null;
  }
};
const showBrowserInstallGuide = ({ route = null } = {}) => {
  const unlockScreen = document.getElementById("unlock-screen");
  if (unlockScreen) unlockScreen.hidden = true;
  const appContainer = document.getElementById("app-container");
  appContainer.hidden = true;
  appContainer.inert = true;
  appContainer.setAttribute("aria-hidden", "true");
  const screen = document.getElementById("browser-install-screen");

  const environment = detectInstallEnvironment(
    navigator.userAgent || "",
    navigator.maxTouchPoints,
    navigator.platform || "",
  );
  const device = route?.device || environment.device || "computer";
  const browser = route?.browser || environment.browser || "other";
  const instructions = document.getElementById("browser-install-steps");
  const handoff = document.getElementById("browser-install-handoff");
  const handoffText = document.getElementById("browser-install-handoff-text");
  const finalAction = document.getElementById("browser-install-final-action");
  const routeTitle = document.getElementById("browser-install-instructions-title");
  const why = document.getElementById("browser-install-why");
  const nativeButton = document.getElementById("browser-install-native");
  const status = document.getElementById("browser-install-status");
  const help = document.getElementById("browser-install-help");
  const helpText = document.getElementById("browser-install-help-text");
  const browserNames = {
    chrome: "Google Chrome",
    edge: "Microsoft Edge",
    safari: "Safari",
    firefox: "Firefox",
    samsung: "Samsung Internet",
    other: appText("install.otherBrowser", "another browser"),
  };
  const routeDeviceNames = {
    iphone: appText("install.device.route.iphone", "this iPhone"),
    ipad: appText("install.device.route.ipad", "this iPad"),
    android: appText("install.device.route.android", "this Android phone or tablet"),
    windows: appText("install.device.route.windows", "this Windows computer"),
    mac: appText("install.device.route.mac", "this Mac"),
    chromebook: appText("install.device.route.chromebook", "this Chromebook"),
    computer: appText("install.device.route.computer", "this computer"),
  };
  const locations = {
    iphone: appText("install.location.iphone", "the Home Screen"),
    ipad: appText("install.location.ipad", "the Home Screen"),
    android: appText("install.location.android", "the Home Screen or app list"),
    windows: appText("install.location.windows", "the Start menu or app list"),
    mac: appText("install.location.mac", "the Dock or Applications"),
    chromebook: appText("install.location.chromebook", "the Chromebook Launcher"),
    computer: appText("install.location.computer", "the app list"),
  };

  const planFor = (device, browser) => {
    const mobileApple = device === "iphone" || device === "ipad";
    const desktop = ["windows", "mac", "computer", "chromebook"].includes(device);
    if (mobileApple && browser === "safari") {
      return {
        supported: true,
        apple: true,
        ipadSafari: device === "ipad",
        steps: device === "ipad"
          ? [appText("install.wizard.normalSafari", "Use a regular Safari tab. Installation is not supported from a Private tab.")]
          : [
            appText("install.wizard.normalSafari", "Use a regular Safari tab. Installation is not supported from a Private tab."),
            appText("install.wizard.safariShare", "Tap Share: the square with an arrow pointing up."),
            appText("install.wizard.safariHome", "Scroll down and tap Add to Home Screen."),
          ],
        finalAction: device === "ipad"
          ? ""
          : appText("install.wizard.safariAdd", "Turn on Open as Web App if offered, then tap Add."),
        help: appText("install.wizard.safariHomeMore", "In the Share menu, scroll past the suggestions and actions. If Add to Home Screen is missing, look in Edit Actions or View More. If Share is hidden, tap the page once to show the browser controls."),
        handoff: appText("install.handoff.apple", "After you tap Add, this page may no longer be in front of you. Before you continue, turn on Open as Web App if offered. Look for NRV on your Home Screen. If you do not see it, swipe down from the middle of the Home Screen and search for NRV. Tap the NRV icon to open it. NRV will continue setup there. You do not need to return to this page."),
      };
    }
    if (device === "android" && ["chrome", "edge", "firefox", "samsung"].includes(browser)) {
      const menu = browser === "edge"
        ? appText("install.wizard.edgeAndroidMenu", "Tap the three-line menu at the bottom of Microsoft Edge.")
        : browser === "samsung"
          ? appText("install.wizard.samsungMenu", "Tap the three-line menu at the bottom of Samsung Internet.")
          : appText("install.wizard.androidMenu", "Tap the three dots in the browser, near the address bar.");
      const action = {
        chrome: appText("install.wizard.chromeAndroidAction", "Tap Install app. If you see Add to Home screen instead, tap that."),
        edge: appText("install.wizard.edgeAndroidAction", "Tap Add to phone. If asked, choose Install app rather than Create shortcut."),
        firefox: appText("install.wizard.firefoxAndroidAction", "Tap Install in the Firefox menu."),
        samsung: appText("install.wizard.samsungAction", "Tap Add page to, then tap Home screen."),
      }[browser];
      return {
        supported: true,
        steps: [menu],
        finalAction: `${action} ${appText("install.wizard.androidConfirm", "If a confirmation appears, tap Install or Add to finish.")}`,
        help: appText("install.wizard.androidActionMore", "Look for Install app, Add to Home screen, or Add to phone. Menu buttons can be three dots or three lines at the top or bottom of the browser."),
        handoff: appText("install.handoff.android", "The browser or installation confirmation may cover this page. NRV should appear on your Home Screen or in your app list. If it is not visible, open the app list and search for NRV. Tap its icon to open it. NRV will continue setup there; you do not need to return to this page."),
      };
    }
    if (desktop && ["chrome", "edge"].includes(browser)) {
      return {
        supported: true,
        steps: [
          browser === "edge"
            ? appText("install.wizard.edgeMenu", "Click the three dots at the top right of Microsoft Edge.")
            : appText("install.wizard.chromeMenu", "Click the three dots at the top right of Google Chrome."),
          browser === "edge"
            ? appText("install.wizard.edgeApps", "Click Apps, then click Install this site as an app.")
            : appText("install.wizard.chromeApps", "Click Cast, save, and share, then click Install page as app."),
        ],
        finalAction: appText("install.wizard.desktopConfirm", "In the confirmation window, click Install."),
        help: appText("install.wizard.desktopInstallMore", "If the menu option is missing, look for an install icon at the right end of the address bar. In Chrome, look for Install page as app; in Edge, look under Apps."),
        handoff: appText("install.handoff.desktop", "The browser may open NRV in a separate window and hide this page. Optional taskbar, Start, or desktop shortcuts are your choice. NRV should appear in {location}. If you do not see it, open Start or the app list and search for NRV. Open the NRV app; setup continues there, and you do not need to return to this page.", { location: locations[device] }),
      };
    }
    if (device === "mac" && browser === "safari") {
      return {
        supported: true,
        steps: [
          appText("install.wizard.macSafari", "At the top of your Mac screen, click File, then click Add to Dock."),
        ],
        finalAction: appText("install.wizard.macSafariAdd", "In the window that appears, click Add."),
        help: appText("install.wizard.macSafariTip", "If Add to Dock is missing, update macOS and Safari, or open NRV in Google Chrome instead."),
        handoff: appText("install.handoff.mac", "Adding NRV may open it in a new app window and hide this page. NRV should appear in the Dock or Applications. If you do not see it, open Launchpad or Applications and search for NRV. Open NRV from its icon; setup continues there. Choose Open at login only if you want NRV to start automatically. You do not need to return to this page."),
      };
    }
    return {
      supported: false,
      steps: [mobileApple
        ? appText("install.wizard.unsupportedApple", "For installation on an iPhone or iPad, use Safari in a normal tab and open this site there.")
        : appText("install.wizard.unsupported", "This device and browser combination is not covered here. Use Google Chrome or Microsoft Edge on a computer, or a supported browser on your device."),
      ],
      finalAction: "",
      help: "",
      handoff: appText("install.handoff.generic", "Before continuing, know that this page may no longer be in front of you. Look for NRV in {location}; if it is not visible, search your app list for NRV. Open NRV from its icon to continue setup there. You do not need to return to this page.", { location: locations[device] }),
    };
  };

  const render = () => {
    const plan = planFor(device, browser);
    const ipadSequence = document.getElementById("ipad-safari-sequence");
    routeTitle.textContent = appText(
      "install.routeTitle",
      "Install NRV on {device} using {browser}",
      {
        device: routeDeviceNames[device],
        browser: browserNames[browser],
      },
    );
    document.getElementById("browser-install-title").textContent = plan.ipadSafari
      ? appText("install.ipad.title", "Nice Return Visits")
      : appText("install.title", "Install Nice Return Visits app");
    const nativePromptAvailable = Boolean(window.nrvDeferredInstallPrompt);
    instructions.textContent = "";
    plan.steps.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      instructions.appendChild(item);
    });
    finalAction.textContent = plan.finalAction || "";
    finalAction.hidden = !plan.finalAction;
    ipadSequence.hidden = !plan.ipadSafari;
    why.hidden = !plan.apple;
    help.hidden = !plan.help;
    helpText.textContent = plan.help;
    handoff.hidden = !plan.handoff || Boolean(plan.ipadSafari);
    handoffText.textContent = plan.handoff;
    nativeButton.hidden = !nativePromptAvailable;
    nativeButton.setAttribute("aria-label", appText("install.installButton", "Install NRV Icon"));
    status.hidden = true;
    status.textContent = "";
    return plan;
  };
  const searchHelpDialog = document.getElementById("ipad-search-help-dialog");
  document.getElementById("ipad-search-help-link").onclick = () => {
    searchHelpDialog.showModal();
  };
  document.getElementById("ipad-search-help-close").onclick = () => {
    searchHelpDialog.close();
  };
  try {
    render();
  } catch (error) {
    return showInstallGuideFailure(error, route);
  }
  document.getElementById("browser-install-instructions").hidden = false;
  document.getElementById("launch-choice-screen").hidden = true;
  document.title = document.getElementById("browser-install-title").textContent;
  screen.hidden = false;
  routeTitle.focus();

  const onAppInstalled = () => {
    window.nrvDeferredInstallPrompt = null;
    status.textContent = device === "windows"
      ? appText(
        "install.nativeInstalled.windows",
        "NRV has been installed. If NRV did not open automatically, select Search on the Windows taskbar and search for Nice Return Visits. Open Nice Return Visits from the search results. You may also find NRV in Start or wherever you chose to place or pin it during installation.",
      )
      : appText(
        "install.nativeInstalled",
        "NRV has been installed. Open it from its new icon to continue setup.",
      );
    status.hidden = false;
    status.focus();
  };
  window.addEventListener("appinstalled", onAppInstalled);

  const onBeforeInstallPrompt = () => {
    nativeButton.hidden = false;
  };
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  const cancelLink = document.getElementById("browser-install-cancel-link");
  nativeButton.onclick = async () => {
    const prompt = window.nrvDeferredInstallPrompt;
    if (!prompt) {
      nativeButton.hidden = true;
      status.textContent = appText("install.nativeUnavailable", "Use the installation steps below.");
      status.hidden = false;
      return;
    }
    window.nrvDeferredInstallPrompt = null;
    nativeButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      status.textContent = choice.outcome === "accepted"
        ? appText(
          device === "windows" ? "install.nativeAccepted.windows" : "install.nativeAccepted",
          device === "windows"
            ? "Installation is starting. If NRV installs but does not open automatically, select Search on the Windows taskbar and search for Nice Return Visits. Open it from the search results. You may also find NRV in Start or wherever you chose to place or pin it during installation."
            : "Installation is starting. If NRV does not open automatically, open its new icon and continue there.",
        )
        : appText("install.nativeDismissed", "Installation was not completed. You can use the steps below.");
      status.hidden = false;
    } catch (error) {
      console.error("Unable to open the installation prompt:", error);
      status.textContent = appText("install.nativeFailed", "The installation prompt could not be opened. You can use the steps below.");
      status.hidden = false;
    } finally {
      nativeButton.disabled = false;
      nativeButton.hidden = true;
      status.focus();
    }
  };
  screen.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelLink.click();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...screen.querySelectorAll('button:not([hidden]):not(:disabled), a[href], select:not(:disabled), summary')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return true;
};
const markInstalledSetupComplete = () => {
  try {
    localStorage.setItem(INSTALLED_SETUP_COMPLETE_KEY, "true");
    return true;
  } catch (error) {
    console.error("Unable to save the installed-app setup status:", error);
    return false;
  }
};
const clearNrvWorkingState = async ({
  database,
  indexedDB,
  localStorage,
  sessionStorage,
  dropbox,
}) => {
  database.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("return-visits-app");
    request.onsuccess = resolve;
    request.onerror = () =>
      reject(request.error || new Error("Database deletion failed."));
    request.onblocked = () =>
      reject(
        new Error(
          "The database is still open in another NRV window or browser tab.",
        ),
      );
  });
  localStorage.clear();
  sessionStorage.clear();
  await new Promise((resolve, reject) => {
    const request = indexedDB.open("return-visits-app", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("appData", { keyPath: "key" });
    request.onerror = () =>
      reject(request.error || new Error("Database verification failed."));
    request.onsuccess = () => {
      const verificationDatabase = request.result;
      try {
        if (!verificationDatabase.objectStoreNames.contains("appData")) {
          throw new Error("The fresh NRV database is missing its data store.");
        }
        const transaction = verificationDatabase.transaction(
          "appData",
          "readonly",
        );
        const keysRequest = transaction.objectStore("appData").getAllKeys();
        const failVerification = (error) => {
          verificationDatabase.close();
          reject(error || new Error("Database verification failed."));
        };
        keysRequest.onsuccess = () => {
          const hasStoredData = keysRequest.result.length > 0;
          verificationDatabase.close();
          if (hasStoredData) {
            reject(new Error("Some NRV working information remains in IndexedDB."));
          } else {
            resolve();
          }
        };
        keysRequest.onerror = () => {
          failVerification(keysRequest.error);
        };
        transaction.onerror = () => {
          failVerification(transaction.error);
        };
        transaction.onabort = () => {
          failVerification(transaction.error);
        };
      } catch (error) {
        verificationDatabase.close();
        reject(error);
      }
    };
  });
  if (localStorage.length !== 0 || sessionStorage.length !== 0) {
    throw new Error("Some NRV working state could not be cleared.");
  }
  if (dropbox?.isConnected()) {
    throw new Error("The local Dropbox connection could not be cleared.");
  }
};
const runStartFreshFlow = async ({
  dropboxConnected,
  askForConfirmation,
  erase,
  showMessage,
  redirect,
}) => {
  const reminder = appText(
    "storage.eraseConfirm",
    "Start Fresh removes the contacts, visit information, settings, and security/setup information in this NRV working copy. If you may need it later, create or verify a current backup first and keep a protected recovery copy outside NRV's working data and outside locations NRV actively manages for normal backup/synchronization. Independently saved backup files are not erased. Continue?",
  );
  const confirmation = dropboxConnected
    ? `${reminder}\n\n${appText(
      "storage.eraseDropboxConfirm",
      "Using Dropbox? Erasing this NRV copy will disconnect it from Dropbox, but it will not delete your existing Dropbox backups. If you may need that information later, preserve a recovery copy outside NRV's active Dropbox backup/synchronization area before continuing. Reconnecting later is a deliberate choice; NRV will not automatically restore old Dropbox data.",
    )}`
    : reminder;
  if (!await askForConfirmation(confirmation)) return "cancelled";
  if (!await askForConfirmation(appText(
    "settings.eraseFinalConfirm",
    "Last check: erase this NRV working copy and start fresh?",
  ))) {
    return "cancelled";
  }

  while (true) {
    try {
      await erase();
      break;
    } catch (error) {
      console.error("Unable to verify the NRV working-state erase:", error);
      const detail = error?.message || appText(
        "storage.eraseRetryDetail",
        "Some NRV working information may remain.",
      );
      if (!await askForConfirmation(appText(
        "storage.eraseRetryConfirm",
        `NRV could not verify that this copy is cleared, so it has not been reported as fresh and you will not be redirected. ${detail} Choose OK to retry, or Cancel to return to Settings. If you cancel, this copy may be partially cleared.`,
        { detail },
      ))) {
        return "failed";
      }
    }
  }
  await showMessage(appText(
    "storage.eraseComplete",
    "NRV has been cleared. You’ll now return to the Nice Return Visits website to begin again.",
  ));
  redirect("https://nicereturnvisits.org/");
  return "complete";
};
let appUpdateAvailable = false;
let appReadyForUpdates = false;
let appUpdatePromptDismissed = false;
let appUpdatePromptTimer = null;
let getAppRefreshBlockMessage = () => "";
let revealAppRefreshBlock = () => {};
let confirmLeaveSettings = () => true;
let appUpdatePromptHandler = () => {
  if (!appReadyForUpdates) return;
  const dialog = document.getElementById("app-update-dialog");
  if (!appUpdateAvailable || appUpdatePromptDismissed || dialog.open) return;
  appUpdatePromptTimer = window.setTimeout(() => {
    appUpdatePromptTimer = null;
    if (
      appUpdateAvailable &&
      !appUpdatePromptDismissed &&
      !dialog.open &&
      !document.querySelector("dialog[open]")
    ) {
      dialog.showModal();
    }
  }, 750);
};
const APP_JUST_UPDATED_KEY = "return-visits-just-updated";
const reloadAfterUpdate = () => {
  try {
    sessionStorage.setItem(APP_JUST_UPDATED_KEY, "1");
  } catch (error) {
    console.error("Unable to note the app update:", error);
  }
  window.location.reload();
};
const showJustUpdatedNotice = () => {
  let pending = false;
  try {
    pending = sessionStorage.getItem(APP_JUST_UPDATED_KEY) === "1";
    sessionStorage.removeItem(APP_JUST_UPDATED_KEY);
  } catch (error) {
    console.error("Unable to read the app update note:", error);
  }
  if (!pending) return;
  const dialog = document.getElementById("app-updated-dialog");
  document.getElementById("app-updated-message").textContent = appText(
    "update.done",
    `NRV ${APP_VERSION} has refreshed. Your saved contacts remain on this device.`,
    { version: APP_VERSION },
  );
  updatePublicVersionLink(document.getElementById("app-updated-whats-new"));
  window.setTimeout(() => {
    if (!document.querySelector("dialog[open]")) dialog.showModal();
  }, 750);
};
document
  .getElementById("btn-ok-updated")
  .addEventListener("click", () =>
    document.getElementById("app-updated-dialog").close(),
  );
document
  .getElementById("btn-apply-app-update")
  .addEventListener("click", async () => {
    const blockMessage = getAppRefreshBlockMessage();
    if (blockMessage) {
      document.getElementById("app-update-dialog").close();
      document.getElementById("app-update-status").textContent = blockMessage;
      await NRVDialogs.alert(blockMessage);
      revealAppRefreshBlock();
      return;
    }
    try {
      localStorage.removeItem(APP_UPDATE_PENDING_KEY);
    } catch (error) {
      console.error("Unable to clear the pending app update status:", error);
    }
    reloadAfterUpdate();
  });
document
  .getElementById("btn-later-app-update")
  .addEventListener("click", () => {
    appUpdatePromptDismissed = true;
    document.getElementById("app-update-dialog").close();
  });
try {
  // A fresh page load already runs the newest files, so any earlier pending
  // flag is stale. The flag is set again only if an update activates later.
  localStorage.removeItem(APP_UPDATE_PENDING_KEY);
} catch (error) {
  console.error("Unable to clear the pending app update status:", error);
}
document.addEventListener("app-update-available", () => {
  appUpdateAvailable = true;
  try {
    localStorage.setItem(APP_UPDATE_PENDING_KEY, "true");
  } catch (error) {
    console.error("Unable to save the pending app update status:", error);
  }
  appUpdatePromptHandler?.();
});
const US_STATE_ABBREVIATIONS = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "puerto rico": "PR",
  "u.s. virgin islands": "VI",
  "virgin islands": "VI",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
};

const toTitleCase = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, separator, letter) =>
      `${separator}${letter.toUpperCase()}`,
    )
    .replace(/(^|[\s-])([a-z])'([a-z])/gi, (_, separator, first, following) =>
      `${separator}${first.toUpperCase()}'${following.toUpperCase()}`,
    )
    .replace(/\b(Nw|Ne|Sw|Se|N|S|E|W)\b/g, (direction) =>
      direction.toUpperCase(),
    );

const normalizeUsState = (value) => {
  const state = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!state) return "";
  const normalized = state.toLowerCase().replace(/\./g, "");
  const fullName = US_STATE_ABBREVIATIONS[normalized];
  if (fullName) return fullName;
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  return toTitleCase(state);
};
const normalizeCountry = (value) => {
  const country = String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = country.toLowerCase();
  if (["ca", "can", "canada"].includes(normalized)) return "Canada";
  if (["jp", "jpn", "japan", "日本"].includes(normalized)) return "Japan";
  if (["mx", "mex", "mexico", "méxico"].includes(normalized)) return "Mexico";
  if (["pe", "peru", "perú"].includes(normalized)) return "Peru";
  if (
    ["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"].includes(
      normalized,
    )
  ) {
    return "United States";
  }
  return toTitleCase(country);
};
const normalizeLocationState = (country, value) =>
  normalizeCountry(country) === "Japan"
    ? String(value ?? "").trim().replace(/\s+/g, " ")
    : normalizeCountry(country) === "United States"
    ? normalizeUsState(value)
    : /^[a-z]{2}$/i.test(String(value ?? "").trim())
      ? String(value).trim().toUpperCase()
      : toTitleCase(String(value ?? "").trim().replace(/\s+/g, " "));
const DEFAULT_COUNTRIES = ["Canada", "Japan", "Mexico", "Peru", "United States"];

const STREET_SUFFIX_ABBREVIATIONS = {
  alley: "Aly",
  annex: "Anx",
  arcade: "Arc",
  avenue: "Av",
  ave: "Av",
  av: "Av",
  bayou: "Byu",
  beach: "Bch",
  bend: "Bnd",
  bluff: "Blf",
  bottom: "Btm",
  boulevard: "Blvd",
  branch: "Br",
  bridge: "Brg",
  brook: "Brk",
  burg: "Bg",
  bypass: "Byp",
  camp: "Cp",
  canyon: "Cyn",
  cape: "Cpe",
  causeway: "Cswy",
  center: "Ctr",
  centre: "Ctr",
  circle: "Cir",
  cliff: "Clf",
  club: "Clb",
  common: "Cmn",
  corner: "Cor",
  course: "Crse",
  court: "Ct",
  creek: "Crk",
  crescent: "Cres",
  crossing: "Xing",
  dale: "Dl",
  dam: "Dm",
  divide: "Dv",
  drive: "Dr",
  estate: "Est",
  extension: "Ext",
  fall: "Fl",
  ferry: "Fry",
  field: "Fld",
  flat: "Flt",
  ford: "Frd",
  forest: "Frst",
  forge: "Frg",
  fork: "Frk",
  fort: "Ft",
  freeway: "Fwy",
  garden: "Gdn",
  gateway: "Gtwy",
  glen: "Gln",
  green: "Grn",
  grove: "Grv",
  harbor: "Hbr",
  haven: "Hvn",
  heights: "Hts",
  highway: "Hwy",
  hill: "Hl",
  hollow: "Holw",
  inlet: "Inlt",
  island: "Is",
  junction: "Jct",
  key: "Ky",
  knoll: "Knl",
  lake: "Lk",
  landing: "Lndg",
  light: "Lgt",
  loaf: "Lf",
  lock: "Lck",
  lodge: "Ldg",
  manor: "Mnr",
  meadow: "Mdw",
  mill: "Ml",
  mission: "Msn",
  mount: "Mt",
  mountain: "Mtn",
  neck: "Nck",
  orchard: "Orch",
  oval: "Oval",
  overpass: "Opas",
  park: "Pk",
  parkway: "Pkwy",
  pass: "Pass",
  passage: "Psge",
  path: "Path",
  pike: "Pike",
  pine: "Pnes",
  plain: "Pln",
  plaza: "Plz",
  point: "Pt",
  port: "Prt",
  prairie: "Pr",
  radial: "Radl",
  ramp: "Ramp",
  ranch: "Rnch",
  rapid: "Rpd",
  rest: "Rst",
  ridge: "Rdg",
  river: "Riv",
  road: "Rd",
  route: "Rte",
  row: "Row",
  rue: "Rue",
  run: "Run",
  shoal: "Shl",
  shore: "Shr",
  skyway: "Skwy",
  spring: "Spg",
  spur: "Spur",
  square: "Sq",
  station: "Sta",
  stravenue: "Stra",
  stream: "Strm",
  street: "St",
  summit: "Smt",
  terrace: "Ter",
  throughway: "Trwy",
  trace: "Trce",
  track: "Trak",
  trafficway: "Trfy",
  trail: "Trl",
  trailer: "Trlr",
  tunnel: "Tunl",
  turnpike: "Tpke",
  underpass: "Upas",
  union: "Un",
  valley: "Vly",
  viaduct: "Via",
  view: "Vw",
  village: "Vlg",
  ville: "Vl",
  vista: "Vis",
  walk: "Walk",
  wall: "Wall",
  way: "Way",
  wells: "Wls",
  expressway: "Expy",
  lane: "Ln",
  place: "Pl",
};
const STREET_DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

const normalizeStreetName = (value) => {
  const street = toTitleCase(value);
  const words = street.split(/\s+/);
  const finalWord = words[words.length - 1];
  const suffixIndex = STREET_DIRECTIONS.has(finalWord?.toUpperCase())
    ? words.length - 2
    : words.length - 1;
  const suffix = words[suffixIndex];
  if (suffix) {
    const match = suffix.match(/^([a-z]+)([.,]?)$/i);
    if (match) {
      words[suffixIndex] =
        STREET_SUFFIX_ABBREVIATIONS[match[1].toLowerCase()] || suffix;
    }
  }
  return words.join(" ");
};
const normalizeStreetForAddressing = (
  value,
  country = selectedAddressingCountry,
) =>
  normalizeCountry(country) === "Japan"
    ? String(value ?? "").trim().replace(/\s+/g, " ")
    : normalizeStreetName(value);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const getStreetAddress = (contact) => {
  if (typeof contact.streetAddress === "string") return contact.streetAddress;
  const parts = (contact.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    contact.country &&
    parts[parts.length - 1]?.toLowerCase() === contact.country.toLowerCase()
  ) {
    parts.pop();
  }
  if (contact.state && parts[parts.length - 1] === contact.state) parts.pop();
  if (contact.city && parts[parts.length - 1] === contact.city) parts.pop();
  return parts.join(", ");
};

const getFormattedContactAddress = (
  contact,
  addressingCountry = contact.addressingCountry || selectedAddressingCountry,
) => {
  const street = normalizeStreetForAddressing(
    getStreetAddress(contact),
    addressingCountry,
  );
  const state = normalizeLocationState(contact.country, contact.state);
  const parts = normalizeCountry(addressingCountry) === "Japan"
    ? [
        contact.postalCode ? `〒${contact.postalCode}` : "",
        state,
        contact.city,
        contact.region,
        contact.area,
        street,
        contact.country,
      ]
    : [
        street,
        contact.area,
        contact.region,
        contact.city,
        state,
        contact.postalCode,
        contact.country,
      ];
  return parts.filter(Boolean).join(", ");
};
const normalizeWorkingNeedGreater = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const designation = ["country", "unassigned", "seldomWorked"].includes(
    source.designation,
  )
    ? source.designation
    : "";
  const country =
    typeof source.country === "string" ? normalizeCountry(source.country) : "";
  return {
    enabled:
      source.enabled === true &&
      Boolean(designation) &&
      (designation !== "country" || Boolean(country)),
    designation,
    country,
  };
};
const normalizeWorkingDesignation = (value) =>
  typeof value === "string" && value.trim()
    ? value.trim() === "U" || value.trim() === "SW"
      ? value.trim()
      : normalizeCountry(value)
    : undefined;

const hasContactCoordinates = (contact) => {
  const latitude = Number(contact.lat);
  const longitude = Number(contact.lng);
  return (
    contact.lat !== undefined &&
    contact.lat !== null &&
    String(contact.lat).trim() !== "" &&
    contact.lng !== undefined &&
    contact.lng !== null &&
    String(contact.lng).trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
};

const getNavigationUrl = (contact) => {
  const latitude = Number(contact.lat);
  const longitude = Number(contact.lng);
  const hasLatitude =
    contact.lat !== undefined &&
    contact.lat !== null &&
    String(contact.lat).trim() !== "";
  const hasLongitude =
    contact.lng !== undefined &&
    contact.lng !== null &&
    String(contact.lng).trim() !== "";
  const hasCoordinates =
    hasLatitude &&
    hasLongitude &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  const address = getFormattedContactAddress(contact);
  const destination = hasCoordinates ? `${latitude},${longitude}` : address;
  if (!destination) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
};

const getContactShareText = (contact, notes = [], senderName = "") => {
  const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
  const lines = [fullName];
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  const address = getFormattedContactAddress(contact);
  if (address) lines.push(`Address: ${address}`);
  const navigationUrl = getNavigationUrl(contact);
  if (navigationUrl) lines.push(`Directions: ${navigationUrl}`);
  notes.forEach((note, index) => {
    const parsedDate = new Date(note.rawDate || note.date || "");
    const dateLabel = Number.isNaN(parsedDate.getTime())
      ? note.date || ""
      : parsedDate.toLocaleString();
    if (index === 0) lines.push("");
    lines.push(`${notes.length > 1 ? "Visit note" : "Last visit note"}${dateLabel ? ` (${dateLabel})` : ""}: ${note.text}`);
  });
  if (senderName) lines.push("", `Shared by ${senderName}`);
  return lines.join("\n");
};

const openAppDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("return-visits-app", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("appData", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });

const readStoredValue = (database, key) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readonly");
    const request = transaction.objectStore("appData").get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });

const readStoredKeys = (database) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readonly");
    const request = transaction.objectStore("appData").getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });

const writeStoredValue = (database, key, value) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    transaction.objectStore("appData").put({ key, value });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const writeStoredValues = (database, entries) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    entries.forEach(([key, value]) => store.put({ key, value }));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const replaceStoredValuesIfUnchanged = (
  database,
  expectedEntries,
  replacementEntries,
  deleteKeys = [],
) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    let remainingChecks = expectedEntries.length;
    let dataChanged = false;

    expectedEntries.forEach(([key, expectedValue]) => {
      const request = store.get(key);
      request.onsuccess = () => {
        if (
          JSON.stringify(request.result?.value ?? null) !==
          JSON.stringify(expectedValue ?? null)
        ) {
          dataChanged = true;
          transaction.abort();
          return;
        }
        remainingChecks -= 1;
        if (remainingChecks === 0) {
          replacementEntries.forEach(([replacementKey, value]) =>
            store.put({ key: replacementKey, value }),
          );
          deleteKeys.forEach((key) => store.delete(key));
        }
      };
      request.onerror = () => transaction.abort();
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        dataChanged
          ? new Error("Saved data changed during the passphrase update.")
          : transaction.error || new Error(appText("storage.updateFailed", "The storage update failed.")),
      );
    transaction.onabort = () =>
      reject(
        dataChanged
          ? new Error("Saved data changed during the passphrase update.")
          : transaction.error || new Error(appText("storage.updateAborted", "The storage update was aborted.")),
      );
  });

const deleteStoredValues = (database, keys) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    keys.forEach((key) => store.delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const parseLegacyValue = (key) => {
  const value = localStorage.getItem(key);
  return value === null ? undefined : JSON.parse(value);
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const createCryptoMetadata = () => ({
  version: 1,
  algorithm: "AES-GCM",
  keyDerivation: "PBKDF2-SHA-256",
  iterations: ENCRYPTION_ITERATIONS,
  salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
});

const deriveEncryptionKey = async (passphrase, metadata) => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(metadata.salt),
      iterations: metadata.iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptValue = async (value, key) => {
  // No key means passphrase protection is off; data is stored unencrypted.
  if (!key) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

const decryptValue = async (encryptedValue, key) => {
  if (!key) return encryptedValue;
  if (
    !encryptedValue ||
    encryptedValue.version !== 1 ||
    !encryptedValue.iv ||
    !encryptedValue.ciphertext
  ) {
    throw new Error("Encrypted data is invalid or unsupported.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encryptedValue.iv) },
    key,
    base64ToBytes(encryptedValue.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
};

// A recovery code is a random 25-character code that unlocks a copy of the
// passphrase stored in the encryption metadata (and therefore in backups).
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateRecoveryCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]);
  return [0, 5, 10, 15, 20].map((i) => chars.slice(i, i + 5).join("")).join("-");
};

const normalizeRecoveryCode = (input) => {
  const code = String(input ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return code.length === 25 && [...code].every((c) => RECOVERY_ALPHABET.includes(c))
    ? code
    : null;
};

const wrapPassphraseWithRecoveryCode = async (passphrase, recoveryCode) => {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveEncryptionKey(normalizeRecoveryCode(recoveryCode), {
    salt,
    iterations: ENCRYPTION_ITERATIONS,
  });
  return {
    version: 1,
    salt,
    iterations: ENCRYPTION_ITERATIONS,
    ...(await encryptValue(passphrase, key)),
  };
};

const withRecoveryCode = async (metadata, passphrase) => {
  const recoveryCode = generateRecoveryCode();
  return {
    recoveryCode,
    metadata: {
      ...metadata,
      recovery: await wrapPassphraseWithRecoveryCode(passphrase, recoveryCode),
    },
  };
};

// Returns the real passphrase when the input is a valid recovery code for this
// metadata; otherwise returns the input unchanged.
const resolvePassphrase = async (input, metadata) => {
  const code = normalizeRecoveryCode(input);
  const recovery = metadata?.recovery;
  if (!code || !recovery || recovery.version !== 1) return input;
  try {
    if (
      !Number.isInteger(recovery.iterations) ||
      recovery.iterations < 100000 ||
      recovery.iterations > 1000000
    ) {
      return input;
    }
    const key = await deriveEncryptionKey(code, recovery);
    const passphrase = await decryptValue(recovery, key);
    return typeof passphrase === "string" ? passphrase : input;
  } catch (error) {
    return input;
  }
};

const showRecoveryCodeDialog = (recoveryCode) =>
  new Promise((resolve) => {
    const dialog = document.getElementById("recovery-code-dialog");
    const display = document.getElementById("recovery-code-value");
    const copyStatus = document.getElementById("recovery-code-copy-status");
    display.textContent = recoveryCode;
    copyStatus.textContent = "";
    const copyButton = document.getElementById("btn-copy-recovery-code");
    const doneButton = document.getElementById("btn-recovery-code-done");
    const onCancel = (event) => event.preventDefault();
    const onCopy = async () => {
      try {
        await navigator.clipboard.writeText(recoveryCode);
        copyStatus.textContent = appText("recovery.copied", "Copied. Paste it somewhere safe.");
      } catch (error) {
        copyStatus.textContent = appText("recovery.copyFailed", "Could not copy. Write the code down instead.");
      }
    };
    const onDone = () => {
      copyButton.removeEventListener("click", onCopy);
      doneButton.removeEventListener("click", onDone);
      dialog.removeEventListener("cancel", onCancel);
      display.textContent = "";
      dialog.close();
      resolve();
    };
    copyButton.addEventListener("click", onCopy);
    doneButton.addEventListener("click", onDone);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });

const PLAIN_CONTACT_FORMAT = "return-visits-contact";

const ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  export: '<path d="M12 15V3M8 7l4-4 4 4M4 14v6h16v-6"/>',
  import: '<path d="M12 3v12M8 11l4 4 4-4M4 14v6h16v-6"/>',
  share:
    '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>',
};

const iconSvg = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
const PLAIN_CONTACTS_FORMAT = "return-visits-contacts";
const ENCRYPTED_CONTACTS_FORMAT = "return-visits-encrypted-contacts";

const isSupportedEncryptionMetadata = (metadata) =>
  metadata?.version === 1 &&
  metadata.algorithm === "AES-GCM" &&
  metadata.keyDerivation === "PBKDF2-SHA-256" &&
  Number.isInteger(metadata.iterations) &&
  metadata.iterations >= 100000 &&
  metadata.iterations <= 1000000 &&
  base64ToBytes(metadata.salt).length === 16;

const decryptContactTransfer = async (transfer, passphrase) => {
  let contact;
  if (transfer.format === PLAIN_CONTACT_FORMAT && transfer.version === 1) {
    contact = transfer.data;
  } else {
    const metadata = transfer.encryption;
    if (
      transfer.format !== "return-visits-encrypted-contact" ||
      transfer.version !== 1 ||
      metadata?.version !== 1 ||
      metadata.algorithm !== "AES-GCM" ||
      metadata.keyDerivation !== "PBKDF2-SHA-256" ||
      !Number.isInteger(metadata.iterations) ||
      metadata.iterations < 100000 ||
      metadata.iterations > 1000000 ||
      base64ToBytes(metadata.salt).length !== 16
    ) {
      throw new Error("This is not a supported contact file.");
    }
    const encryptionKey = await deriveEncryptionKey(passphrase, metadata);
    contact = await decryptValue(transfer.data, encryptionKey);
  }
  return normalizeTransferredContact(contact);
};

const normalizeTransferredContact = (contact) => {
  if (
    !contact ||
    (typeof contact.id !== "number" && typeof contact.id !== "string") ||
    typeof contact.firstName !== "string" ||
    typeof contact.lastName !== "string" ||
    (contact.notesHistory &&
      (!Array.isArray(contact.notesHistory) ||
        !contact.notesHistory.every(
          (note) => note && typeof note.text === "string",
        ))) ||
    (contact.areas &&
      (!Array.isArray(contact.areas) ||
        !contact.areas.every((area) => typeof area === "string"))) ||
    (contact.areaAssignments &&
      (!Array.isArray(contact.areaAssignments) ||
        !contact.areaAssignments.every(
          (area) =>
            area &&
            typeof area.name === "string" &&
            typeof area.region === "string" &&
            (area.city === undefined || typeof area.city === "string"),
        ))) ||
    ["country", "city", "region", "area", "state", "streetAddress", "postalCode", "addressingCountry", "workingNeedDesignation"].some(
      (field) =>
        contact[field] !== undefined && typeof contact[field] !== "string",
    ) ||
    ["email", "phone"].some(
      (field) =>
        contact[field] !== undefined && typeof contact[field] !== "string",
    )
  ) {
    throw new Error("The contact file contents are invalid.");
  }
  const transferredContact = { ...contact };
  delete transferredContact.workingNeedDesignation;
  const workingNeedDesignation = normalizeWorkingDesignation(
    contact.workingNeedDesignation,
  );
  return {
    ...transferredContact,
    region:
      contact.region ||
      contact.areaAssignments?.[0]?.region ||
      contact.areas
        ?.map((areaName) =>
          contact.areaAssignments?.find((assignment) => assignment.name === areaName)
            ?.region,
        )
        .find(Boolean) ||
      "",
    area:
      contact.area ||
      contact.areas?.[0] ||
      contact.areaAssignments?.[0]?.name ||
      "",
    email: contact.email || "",
    phone: contact.phone || "",
    addressingCountry: normalizeCountry(
      contact.addressingCountry || contact.country || DEFAULT_SETTINGS.addressingCountry,
    ),
    ...(workingNeedDesignation
      ? {
          workingNeedDesignation,
        }
      : {}),
    areaAssignments: contact.areaAssignments || [],
    notesHistory: contact.notesHistory || [],
  };
};

// Reads a file holding one contact or several, plain or encrypted.
const decryptContactsTransfer = async (transfer, passphrase) => {
  let contactList;
  if (transfer.format === PLAIN_CONTACTS_FORMAT && transfer.version === 1) {
    contactList = transfer.data?.contacts;
  } else if (
    transfer.format === ENCRYPTED_CONTACTS_FORMAT &&
    transfer.version === 1
  ) {
    if (!isSupportedEncryptionMetadata(transfer.encryption)) {
      throw new Error("This is not a supported contact file.");
    }
    const transferKey = await deriveEncryptionKey(
      passphrase,
      transfer.encryption,
    );
    contactList = (await decryptValue(transfer.data, transferKey))?.contacts;
  } else {
    return [await decryptContactTransfer(transfer, passphrase)];
  }
  if (!Array.isArray(contactList) || !contactList.length) {
    throw new Error("The contact file contains no contacts.");
  }
  return contactList.map(normalizeTransferredContact);
};

const getContactLastActivity = (contact) => {
  const noteDates = (contact.notesHistory || [])
    .map((note) => note?.rawDate)
    .filter((date) => date && !Number.isNaN(new Date(date).getTime()));
  const candidates = [contact.createdAt, ...noteDates].filter(
    (date) => date && !Number.isNaN(new Date(date).getTime()),
  );
  if (!candidates.length) return EPOCH_TIMESTAMP;
  return candidates
    .map((date) => new Date(date).toISOString())
    .sort()
    .pop();
};

const normalizeTimeTracking = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const enabled = source.enabled === true;
  const runningSince =
    enabled &&
    typeof source.runningSince === "string" &&
    !Number.isNaN(Date.parse(source.runningSince))
      ? source.runningSince
      : null;
  const entries = enabled && Array.isArray(source.entries) ? source.entries : [];
  return {
    enabled,
    showMonthly: source.showMonthly !== false,
    showYearly: source.showYearly !== false,
    runningSince,
    entries: entries
      .filter(
        (entry) =>
          entry &&
          entry.id !== undefined &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.date || "") &&
          Number(entry.seconds) > 0,
      )
      .map((entry) => ({
        id: String(entry.id),
        date: entry.date,
        seconds: Math.round(Number(entry.seconds)),
        note: typeof entry.note === "string" ? entry.note : "",
      })),
    deleted:
      enabled && Array.isArray(source.deleted)
        ? source.deleted.filter((id) => typeof id === "string")
        : [],
  };
};

const normalizeGoalsAndMilestones = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const allowedTypes = new Set(["recurring", "target", "repeatable", "custom"]);
  const allowedStatuses = new Set([
    "active",
    "paused",
    "review",
    "achieved",
  ]);
  const goals = (Array.isArray(source.goals) ? source.goals : [])
    .filter((goal) => goal && goal.id !== undefined)
    .map((goal) => {
      const items = (Array.isArray(goal.items) ? goal.items : [])
        .filter((item) => item && item.id !== undefined)
        .slice(0, 100)
        .map((item) => ({
          id: String(item.id),
          ...(typeof item.key === "string" &&
          Object.hasOwn(GOAL_ITEM_KEYS, item.key)
            ? { key: item.key }
            : {}),
          ...(typeof item.customText === "string" && item.customText.trim()
            ? { customText: item.customText.trim().slice(0, 240) }
            : {}),
          ...(typeof item.durationDay === "string" &&
          ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(
            item.durationDay,
          )
            ? { durationDay: item.durationDay }
            : {}),
          ...(item.key === "participateAspect"
            ? {
                selectedMethods: Array.isArray(item.selectedMethods)
                  ? [...new Set(
                      item.selectedMethods.filter((method) =>
                        Object.hasOwn(GOAL_METHODS, method),
                      ),
                    )]
                  : [],
                ...(typeof item.methodOtherText === "string" &&
                item.methodOtherText.trim()
                  ? { methodOtherText: item.methodOtherText.trim().slice(0, 240) }
                  : {}),
              }
            : {}),
          ...(item.key === "adjustedStep"
            ? {
                number: Math.min(
                  100,
                  Math.max(1, Math.round(Number(item.number) || 1)),
                ),
              }
            : {}),
          completed: item.completed === true,
          completedAt:
            item.completed === true &&
            typeof item.completedAt === "string" &&
            !Number.isNaN(Date.parse(item.completedAt))
              ? item.completedAt
              : null,
          durationMinutes: Math.min(
            1440,
            Math.max(0, Math.round(Number(item.durationMinutes) || 0)),
          ),
        }));
      const status = allowedStatuses.has(goal.status)
        ? goal.status
        : "active";
      const completedCount = items.filter((item) => item.completed).length;
      const normalizedStatus =
        items.length > 0 && completedCount === items.length
          ? "achieved"
          : status === "achieved"
            ? "review"
            : status;
      const dayDurations = {};
      for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
        const minutes = Math.min(
          1440,
          Math.max(0, Math.round(Number(goal.dayDurations?.[day]) || 0)),
        );
        if (minutes) dayDurations[day] = minutes;
      }
      return {
        id: String(goal.id),
        pathId:
          typeof goal.pathId === "string" &&
          (Object.hasOwn(GOAL_PATHS, goal.pathId) || goal.pathId === "custom")
            ? goal.pathId
            : "custom",
        pathName:
          typeof goal.pathName === "string"
            ? goal.pathName.trim().slice(0, 120)
            : "",
        type: allowedTypes.has(goal.type) ? goal.type : "target",
        status: normalizedStatus,
        frequency: goal.frequency === "monthly" ? "monthly" : "weekly",
        periodDays: Math.min(
          3660,
          Math.max(0, Math.round(Number(goal.periodDays) || 0)),
        ),
        periodEndsAt:
          typeof goal.periodEndsAt === "string" &&
          !Number.isNaN(Date.parse(goal.periodEndsAt))
            ? goal.periodEndsAt
            : null,
        durationMinutes: Math.min(
          1440,
          Math.max(0, Math.round(Number(goal.durationMinutes) || 0)),
        ),
        dayDurations,
        items,
        createdAt:
          typeof goal.createdAt === "string" &&
          !Number.isNaN(Date.parse(goal.createdAt))
            ? goal.createdAt
            : EPOCH_TIMESTAMP,
        updatedAt:
          typeof goal.updatedAt === "string" &&
          !Number.isNaN(Date.parse(goal.updatedAt))
            ? goal.updatedAt
            : EPOCH_TIMESTAMP,
        ...(normalizedStatus === "achieved"
          ? {
              achievedAt:
                typeof goal.achievedAt === "string" &&
                !Number.isNaN(Date.parse(goal.achievedAt))
                  ? goal.achievedAt
                  : items[items.length - 1]?.completedAt ||
                    goal.updatedAt ||
                    EPOCH_TIMESTAMP,
            }
          : {}),
        ...(typeof goal.periodEndedAt === "string" &&
        !Number.isNaN(Date.parse(goal.periodEndedAt))
          ? { periodEndedAt: goal.periodEndedAt }
          : {}),
        ...(normalizedStatus === "paused"
          ? {
              pausedFromStatus:
                goal.pausedFromStatus === "review" ? "review" : "active",
              pausedRemainingMs: Math.max(
                0,
                Math.round(Number(goal.pausedRemainingMs) || 0),
              ),
            }
          : {}),
      };
    });
  const latest = source.latestAcknowledgement;
  const latestAcknowledgement =
    latest &&
    typeof latest === "object" &&
    typeof latest.id === "string" &&
    typeof latest.at === "string" &&
    !Number.isNaN(Date.parse(latest.at))
      ? {
          id: latest.id,
          goalId: String(latest.goalId || ""),
          kind: latest.kind === "goal" ? "goal" : "milestone",
          pathId:
            typeof latest.pathId === "string" &&
            (Object.hasOwn(GOAL_PATHS, latest.pathId) ||
              latest.pathId === "custom")
              ? latest.pathId
              : "custom",
          pathName:
            typeof latest.pathName === "string"
              ? latest.pathName.trim().slice(0, 120)
              : "",
          itemKey:
            typeof latest.itemKey === "string" &&
            Object.hasOwn(GOAL_ITEM_KEYS, latest.itemKey)
              ? latest.itemKey
              : "",
          itemText:
            typeof latest.itemText === "string"
              ? latest.itemText.trim().slice(0, 240)
              : "",
          count: Math.max(0, Math.round(Number(latest.count) || 0)),
          total: Math.max(0, Math.round(Number(latest.total) || 0)),
          dismissed: latest.dismissed === true,
          at: latest.at,
        }
      : null;
  return {
    encouragementEnabled: source.encouragementEnabled !== false,
    goals,
    deletedGoalIds: Array.isArray(source.deletedGoalIds)
      ? [
          ...new Set(
            source.deletedGoalIds.filter((id) => typeof id === "string"),
          ),
        ]
      : [],
    latestAcknowledgement,
  };
};

const getGoalProgress = (goal) => {
  const total = goal.items.length;
  const completed = goal.items.filter((item) => item.completed).length;
  return {
    completed,
    count: completed,
    total,
    percent: total ? Math.floor((completed / total) * 100) : 0,
  };
};

const normalizeRegionData = (settings, contacts) => {
  if ((Number(settings.schemaVersion) || 1) > SCHEMA_VERSION) {
    throw new NewerDataVersionError();
  }
  const normalizedSettings = { ...settings };
  const defaultCountry = normalizeCountry(
    settings.me?.country || settings.country || DEFAULT_SETTINGS.country,
  );
  const addressingCountry = normalizeCountry(
    settings.addressingCountry || DEFAULT_SETTINGS.addressingCountry,
  );
  const workingNeedGreater = normalizeWorkingNeedGreater(
    settings.workingNeedGreater,
  );
  const countries = [
    ...new Set([
      ...DEFAULT_COUNTRIES,
      ...(Array.isArray(settings.countries) ? settings.countries : [])
        .filter((country) => typeof country === "string" && country.trim())
        .map(normalizeCountry),
      defaultCountry,
      addressingCountry,
      ...(workingNeedGreater.country ? [workingNeedGreater.country] : []),
    ]),
  ];
  // Cities, Regions and Areas are three independent reusable name lists, and
  // each list is scoped by Country: an entry is {name, country}. The lists
  // never depend on one another. Legacy records may be plain strings
  // (v0.9.56 and earlier), {name, city} pairs, or {name, region} areas;
  // every unique name is kept. A legacy entry's country comes from the
  // contacts (or Your Details) that use it; an entry no contact can vouch
  // for is assigned to the Default Country rather than discarded. Running
  // this again on migrated data changes nothing.
  const cityEntries = [];
  const regionEntries = [];
  const areaEntries = [];
  const addEntry = (list, value, country) => {
    const name = typeof value === "string" ? value.trim() : "";
    const scope = typeof country === "string" ? normalizeCountry(country) : "";
    if (!name || !scope) return;
    if (
      !list.some(
        (item) =>
          item.country === scope &&
          item.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      list.push({ name, country: scope });
    }
  };
  const findEntryName = (list, country, value) =>
    typeof value === "string"
      ? list.find(
          (item) =>
            item.country === country &&
            item.name.toLowerCase() === value.trim().toLowerCase(),
        )?.name || ""
      : "";
  const entryNameOf = (item) =>
    typeof item === "string" ? item : (item && typeof item === "object" && typeof item.name === "string" ? item.name : "");
  const legacyAreaRegions = new Map();
  (Array.isArray(settings.areas) ? settings.areas : []).forEach((area) => {
    const legacyRegion =
      area && typeof area === "object" && typeof area.region === "string" &&
      area.region !== "Unassigned"
        ? area.region
        : "";
    if (legacyRegion && area.name) legacyAreaRegions.set(area.name, legacyRegion);
  });

  // Pass 1: reliable evidence. Each contact and Your Details attach their
  // city, region and area to their own country.
  const meCountry = normalizeCountry(settings.me?.country || defaultCountry);
  addEntry(cityEntries, settings.me?.city, meCountry);
  addEntry(regionEntries, settings.me?.region, meCountry);
  addEntry(areaEntries, settings.me?.area, meCountry);
  const contactFacts = contacts.map((contact) => {
    const country = normalizeCountry(contact.country || defaultCountry);
    const city = typeof contact.city === "string" ? contact.city : "";
    const legacyAreaNames = Array.isArray(contact.areas)
      ? contact.areas
      : contact.area
        ? [contact.area]
        : [];
    const area = legacyAreaNames.find((name) => typeof name === "string") || "";
    const region =
      (typeof contact.region === "string" && contact.region) ||
      legacyAreaRegions.get(area) ||
      "";
    addEntry(cityEntries, city, country);
    addEntry(regionEntries, region, country);
    addEntry(areaEntries, area, country);
    return { country, city };
  });

  // Pass 2: stored list entries. Explicit countries are kept. A legacy
  // {name, city} record follows the countries of contacts using that city.
  // A name already attached to some country in pass 1 is considered placed;
  // otherwise it goes to the Default Country (approved Option A).
  const countriesUsingCity = (city) => {
    const matches = contactFacts
      .filter((fact) => fact.city && city && fact.city.toLowerCase() === String(city).toLowerCase())
      .map((fact) => fact.country);
    return [...new Set(matches)];
  };
  const placeLegacyEntry = (list, item) => {
    const name = entryNameOf(item);
    if (!name) return;
    if (item && typeof item === "object" && typeof item.country === "string" && item.country) {
      addEntry(list, name, item.country);
      return;
    }
    const cityCountries =
      item && typeof item === "object" && typeof item.city === "string"
        ? countriesUsingCity(item.city)
        : [];
    if (cityCountries.length) {
      cityCountries.forEach((country) => addEntry(list, name, country));
      return;
    }
    const alreadyPlaced = list.some(
      (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!alreadyPlaced) addEntry(list, name, defaultCountry);
  };
  (Array.isArray(settings.cities) ? settings.cities : []).forEach((city) =>
    placeLegacyEntry(cityEntries, city),
  );
  (Array.isArray(settings.regions) ? settings.regions : []).forEach((region) =>
    placeLegacyEntry(regionEntries, region),
  );
  (Array.isArray(settings.areas) ? settings.areas : []).forEach((area) => {
    placeLegacyEntry(areaEntries, area);
    const legacyRegion = entryNameOf(area) ? legacyAreaRegions.get(area.name) : "";
    if (legacyRegion) placeLegacyEntry(regionEntries, { name: legacyRegion, city: area.city });
  });

  const defaultCountryCities = cityEntries
    .filter((item) => item.country === defaultCountry)
    .map((item) => item.name);
  const defaultCity = settings.defaultCity === ""
    ? ""
    : findEntryName(cityEntries, defaultCountry, settings.defaultCity) ||
      defaultCountryCities[0] ||
      "";

  const normalizedContacts = contacts.map((contact) => {
    const legacyAreaNames = Array.isArray(contact.areas)
      ? contact.areas
      : contact.area
        ? [contact.area]
        : [];
    const areaName =
      legacyAreaNames.find((area) => typeof area === "string") || "";
    const country = normalizeCountry(contact.country || defaultCountry);
    const city = typeof contact.city === "string" ? contact.city : defaultCity;
    const candidateRegion =
      (typeof contact.region === "string" && contact.region) ||
      legacyAreaRegions.get(areaName) ||
      "";
    const region = findEntryName(regionEntries, country, candidateRegion);
    const rest = { ...contact };
    delete rest.areas;
    delete rest.areaAssignments;
    delete rest.workingNeedDesignation;
    const workingNeedDesignation = normalizeWorkingDesignation(
      contact.workingNeedDesignation,
    );
    return {
      ...rest,
      country,
      city,
      region,
      area: findEntryName(areaEntries, country, areaName),
      streetAddress: getStreetAddress(contact),
      postalCode: typeof contact.postalCode === "string" ? contact.postalCode : "",
      addressingCountry: normalizeCountry(
        contact.addressingCountry || addressingCountry,
      ),
      ...(workingNeedDesignation ? { workingNeedDesignation } : {}),
      updatedAt: contact.updatedAt || getContactLastActivity(contact),
    };
  });

  normalizedSettings.schemaVersion = SCHEMA_VERSION;
  normalizedSettings.timeTracking = normalizeTimeTracking(settings.timeTracking);
  normalizedSettings.goalsAndMilestones = normalizeGoalsAndMilestones(
    settings.goalsAndMilestones,
  );
  normalizedSettings.country = defaultCountry;
  normalizedSettings.addressingCountry = addressingCountry;
  normalizedSettings.workingNeedGreater = workingNeedGreater;
  normalizedSettings.countries = countries;
  if (normalizedSettings.me) {
    normalizedSettings.me = {
      ...normalizedSettings.me,
      country: normalizeCountry(normalizedSettings.me.country || defaultCountry),
      state: normalizeLocationState(
        normalizedSettings.me.country || defaultCountry,
        normalizedSettings.me.state,
      ),
      postalCode:
        typeof normalizedSettings.me.postalCode === "string"
          ? normalizedSettings.me.postalCode
          : "",
    };
  }
  normalizedSettings.deletedContacts = Array.isArray(settings.deletedContacts)
    ? settings.deletedContacts.filter(
        (entry) => entry && entry.id !== undefined && entry.deletedAt,
      )
    : [];
  normalizedSettings.cities = cityEntries;
  normalizedSettings.defaultCity = defaultCity;
  normalizedSettings.regions = regionEntries;
  normalizedSettings.areas = areaEntries;
  return { settings: normalizedSettings, contacts: normalizedContacts };
};

const hasMeaningfulUserInformation = (settings, contacts) => {
  const defaultSettings = normalizeRegionData(DEFAULT_SETTINGS, []).settings;
  return contacts.length > 0 ||
    JSON.stringify(settings) !== JSON.stringify(defaultSettings);
};

const inspectStoredUserInformation = async () => {
  const database = await openAppDatabase();
  try {
    const [storedSettings, storedContacts, metadata] = await Promise.all([
      readStoredValue(database, "settings"),
      readStoredValue(database, "contacts"),
      readStoredValue(database, ENCRYPTION_META_KEY),
    ]);
    if (metadata) return { hasPotentialInformation: true };
    const settings = storedSettings ??
      parseLegacyValue("return_visits_settings") ??
      DEFAULT_SETTINGS;
    const contacts = storedContacts ??
      parseLegacyValue("return_visits_contacts") ??
      [];
    const normalized = normalizeRegionData(settings, contacts);
    return {
      hasPotentialInformation: Boolean(metadata) ||
        hasMeaningfulUserInformation(normalized.settings, normalized.contacts),
    };
  } finally {
    database.close();
  }
};

let initialStoredInformation = null;
let initialStoredInformationPromise = null;
const getInitialStoredInformation = () => {
  if (!initialStoredInformationPromise) {
    initialStoredInformationPromise = inspectStoredUserInformation()
      .then((result) => {
        initialStoredInformation = result;
        return result;
      })
      .catch((error) => {
        console.error("Unable to check for saved NRV information:", error);
        initialStoredInformation = { error };
        return initialStoredInformation;
      });
  }
  return initialStoredInformationPromise;
};

const decryptBackup = async (backup, passphrase) => {
  if (passphrase !== null && passphrase.length < 8) {
    throw new Error("The backup passphrase must be at least 8 characters.");
  }
  if (
    backup.format === "return-visits-backup" &&
    backup.version === 1 &&
    backup.settings &&
    Array.isArray(backup.contacts)
  ) {
    if (
      !Array.isArray(backup.settings.cities) ||
      !Array.isArray(backup.settings.areas) ||
      !backup.contacts.every(
        (contact) =>
          contact &&
          (typeof contact.id === "number" ||
            typeof contact.id === "string") &&
          typeof contact.firstName === "string" &&
          ["email", "phone"].every(
            (field) =>
              contact[field] === undefined ||
              typeof contact[field] === "string",
          ),
      )
    ) {
      throw new Error("The backup contents are invalid.");
    }
    const metadata = passphrase === null ? null : createCryptoMetadata();
    const encryptionKey =
      passphrase === null
        ? null
        : await deriveEncryptionKey(passphrase, metadata);
    const normalized = normalizeRegionData(
      backup.settings,
      backup.contacts,
    );
    return {
      metadata,
      encryptionKey,
      settings: normalized.settings,
      contacts: normalized.contacts,
      encryptedSettings: await encryptValue(
        normalized.settings,
        encryptionKey,
      ),
      encryptedContacts: await encryptValue(
        normalized.contacts,
        encryptionKey,
      ),
      wasLegacyPlaintext: true,
    };
  }

  if (passphrase === null) {
    throw new Error("This backup requires a passphrase.");
  }
  const metadata = backup.encryption;
  if (
    backup.format !== "return-visits-encrypted-backup" ||
    backup.version !== 1 ||
    metadata?.version !== 1 ||
    metadata.algorithm !== "AES-GCM" ||
    metadata.keyDerivation !== "PBKDF2-SHA-256" ||
    !Number.isInteger(metadata.iterations) ||
    metadata.iterations < 100000 ||
    metadata.iterations > 1000000 ||
    !backup.data?.settings ||
    !backup.data?.contacts ||
    base64ToBytes(metadata.salt).length !== 16
  ) {
    throw new Error("This is not a supported encrypted backup file.");
  }
  const encryptionKey = await deriveEncryptionKey(
    await resolvePassphrase(passphrase, metadata),
    metadata,
  );
  const [settings, contacts] = await Promise.all([
    decryptValue(backup.data.settings, encryptionKey),
    decryptValue(backup.data.contacts, encryptionKey),
  ]);
  if (
    !settings ||
    !Array.isArray(settings.cities) ||
    !Array.isArray(settings.areas) ||
    !Array.isArray(contacts) ||
    !contacts.every(
      (contact) =>
        contact &&
        (typeof contact.id === "number" || typeof contact.id === "string") &&
        typeof contact.firstName === "string" &&
        ["email", "phone"].every(
          (field) =>
            contact[field] === undefined ||
            typeof contact[field] === "string",
        ),
    )
  ) {
    throw new Error("The backup contents are invalid.");
  }
  const normalized = normalizeRegionData(settings, contacts);
  return {
    metadata,
    encryptionKey,
    settings: normalized.settings,
    contacts: normalized.contacts,
    encryptedSettings: await encryptValue(
      normalized.settings,
      encryptionKey,
    ),
    encryptedContacts: await encryptValue(
      normalized.contacts,
      encryptionKey,
    ),
    wasLegacyPlaintext: false,
  };
};

const encryptStoredValue = async (database, storageKey, value, encryptionKey) =>
  writeStoredValue(
    database,
    storageKey,
    await encryptValue(value, encryptionKey),
  );

const dismissUnlockScreen = (screen) => {
  screen.remove();
  const appContainer = document.getElementById("app-container");
  appContainer.removeAttribute("inert");
  appContainer.setAttribute("aria-hidden", "false");
};

const showStartupRecovery = () => {
  const screen = document.getElementById("startup-recovery-screen");
  document.getElementById("unlock-screen").hidden = true;
  document.getElementById("startup-recovery-title").textContent = appText(
    "startup.safeTitle",
    "NRV is keeping your information safe",
  );
  document.getElementById("startup-recovery-message").textContent = appText(
    "startup.futureData",
    "This saved information needs a newer compatible NRV version. No information was changed. Connect to the internet and try again.",
  );
  document.getElementById("startup-recovery-retry").hidden = false;
  screen.hidden = false;
};

// Update this version when the Terms of Use or Privacy & Data Notice changes.
const USER_AGREEMENT_VERSION = "2026-11-05";
const requireUserAgreement = () => {
  const screen = document.getElementById("unlock-screen");
  const agreementPanel = document.getElementById("agreement-panel");
  const unlockContent = document.getElementById("unlock-content");
  const checkbox = document.getElementById("user-agreement-checkbox");
  const acceptButton = document.getElementById("btn-accept-agreement");
  const errorMessage = document.getElementById("agreement-error");
  let acceptedVersion = null;
  try {
    acceptedVersion = localStorage.getItem("return_visits_agreement_version");
  } catch (error) {
    console.error("Unable to check the user agreement status:", error);
    errorMessage.textContent =
      appText("agreement.checkFailed", "We could not check this device's agreement status. You may review and accept the notices again to continue.");
    errorMessage.hidden = false;
  }

  if (acceptedVersion === USER_AGREEMENT_VERSION) {
    agreementPanel.hidden = true;
    unlockContent.hidden = false;
    return Promise.resolve();
  }

  screen.hidden = false;
  acceptButton.disabled = !checkbox.checked;
  checkbox.addEventListener("change", () => {
    acceptButton.disabled = !checkbox.checked;
  });

  return new Promise((resolve) => {
    acceptButton.addEventListener("click", () => {
      if (!checkbox.checked) return;
      acceptButton.disabled = true;
      errorMessage.hidden = true;
      try {
        localStorage.setItem(
          "return_visits_agreement_version",
          USER_AGREEMENT_VERSION,
        );
      } catch (error) {
        console.error("Unable to save the user agreement status:", error);
        errorMessage.textContent =
          appText("agreement.saveFailed", "We could not save your agreement on this device. Check your browser storage settings and try again.");
        errorMessage.hidden = false;
        acceptButton.disabled = false;
        return;
      }
      agreementPanel.hidden = true;
      unlockContent.hidden = false;
      resolve();
    });
  });
};

const createUnlockPrompt = (hasEncryption) => {
  const screen = document.getElementById("unlock-screen");
  document.getElementById("unlock-title").textContent = hasEncryption
    ? appText("unlock.title", "Unlock Nice Return Visits")
    : appText("unlock.firstUse.heading", "First-time use");
  const description = document.getElementById("unlock-description");
  document.getElementById("first-use-notice").hidden = hasEncryption;
  const confirmContainer = document.getElementById(
    "confirm-passphrase-container",
  );
  const confirmInput = document.getElementById(
    "confirm-encryption-passphrase",
  );
  const passphraseInput = document.getElementById("encryption-passphrase");
  const submitButton = document.getElementById("unlock-submit");
  const errorMessage = document.getElementById("unlock-error");

  confirmContainer.hidden = hasEncryption;
  confirmInput.required = !hasEncryption;
  description.textContent = hasEncryption
    ? appText("unlock.description", "Enter your passphrase to decrypt and open your local contact database.")
    : appText(
        "unlock.createDescription",
        `Create a passphrase to encrypt this device's contact database. Use at least ${MIN_PASSPHRASE_LENGTH} characters and keep it safe.`,
        { count: MIN_PASSPHRASE_LENGTH },
      );
  submitButton.textContent = hasEncryption
    ? appText("unlock.button", "Unlock")
    : appText("unlock.createButton", "Encrypt and Continue");
  screen.hidden = false;
  return { screen, passphraseInput, confirmInput, submitButton, errorMessage };
};

const initializeAppData = async () => {
  const database = await openAppDatabase();
  const [storedKeys, storedSettingsBeforeInit, storedContactsBeforeInit, existingMetadata] =
    await Promise.all([
      readStoredKeys(database),
      readStoredValue(database, "settings"),
      readStoredValue(database, "contacts"),
      readStoredValue(database, ENCRYPTION_META_KEY),
    ]);
  const metadataPresent =
    existingMetadata !== undefined && existingMetadata !== null;
  if (metadataPresent) {
    let supportedMetadata = false;
    try {
      supportedMetadata = isSupportedEncryptionMetadata(existingMetadata);
    } catch (error) {
      console.error("Unable to validate stored encryption metadata:", error);
    }
    if (!supportedMetadata) {
      throw new Error("Stored encryption metadata is invalid or unsupported.");
    }
  }
  const defaultSettings = normalizeRegionData(DEFAULT_SETTINGS, []).settings;
  const hasMeaningfulStoredSettings =
    storedSettingsBeforeInit !== undefined &&
    JSON.stringify(storedSettingsBeforeInit) !== JSON.stringify(defaultSettings);
  const hasMeaningfulStoredContacts =
    storedContactsBeforeInit !== undefined &&
    (!Array.isArray(storedContactsBeforeInit) ||
      storedContactsBeforeInit.length > 0);
  const hasPriorSetupInProgress =
    localStorage.getItem("return_visits_setup_pending") === "true";
  const hasPriorSetupDismissal =
    localStorage.getItem("return_visits_onboarding_v2_dismissed") === "true";
  const hasMeaningfulLocalState = [
    "return_visits_settings",
    "return_visits_contacts",
    INSTALLED_SETUP_COMPLETE_KEY,
    "return_visits_dropbox",
  ].some((key) => localStorage.getItem(key) !== null);
  const hasOtherStoredData = storedKeys.some(
    (key) => key !== "settings" && key !== "contacts",
  );
  const existingStateDetected =
    metadataPresent ||
    hasOtherStoredData ||
    hasMeaningfulStoredSettings ||
    hasMeaningfulStoredContacts ||
    hasMeaningfulLocalState ||
    (hasPriorSetupDismissal && !hasPriorSetupInProgress);
  if (!metadataPresent) {
    const [storedSettings, storedContacts] = await Promise.all([
      readStoredValue(database, "settings"),
      readStoredValue(database, "contacts"),
    ]);
    const sourceSettings =
      storedSettings ??
      parseLegacyValue("return_visits_settings") ??
      DEFAULT_SETTINGS;
    const sourceContacts =
      storedContacts ??
      parseLegacyValue("return_visits_contacts") ??
      [];
    const storedValues = [sourceSettings, sourceContacts];
    if (
      storedValues.some(
        (value) =>
          value &&
          typeof value === "object" &&
          (Object.prototype.hasOwnProperty.call(value, "iv") ||
            Object.prototype.hasOwnProperty.call(value, "ciphertext")),
      ) ||
      !sourceSettings ||
      typeof sourceSettings !== "object" ||
      Array.isArray(sourceSettings) ||
      !Array.isArray(sourceContacts)
    ) {
      throw new Error("Stored data is invalid or its encryption metadata is missing.");
    }
    const { settings, contacts } = normalizeRegionData(
      sourceSettings,
      sourceContacts,
    );
    if ((Number(sourceSettings.schemaVersion) || 1) !== SCHEMA_VERSION) {
      await writeStoredValues(database, [
        ["settings", settings],
        ["contacts", contacts],
      ]);
      localStorage.removeItem("return_visits_settings");
      localStorage.removeItem("return_visits_contacts");
    }
    dismissUnlockScreen(document.getElementById("unlock-screen"));
    return {
      database,
      settings,
      contacts,
      encryptionKey: null,
      metadata: null,
      existingStateDetected,
      restoredFromBackup: false,
    };
  }
  const prompt = createUnlockPrompt(true);

  return new Promise((resolve) => {
    const initialBackupInput = document.getElementById(
      "initial-backup-file-input",
    );
    const initialRestoreButton = document.getElementById(
      "btn-initial-restore",
    );
    initialRestoreButton.addEventListener("click", () =>
      initialBackupInput.click(),
    );
    initialBackupInput.addEventListener("change", async () => {
      const file = initialBackupInput.files[0];
      if (!file) return;
      initialRestoreButton.disabled = true;
      prompt.errorMessage.textContent = "";
      try {
        const passphrase = prompt.passphraseInput.value;
        if (!passphrase) {
          throw new Error("Enter the backup passphrase before restoring.");
        }
        const backup = JSON.parse(await file.text());
        const restored = await decryptBackup(backup, passphrase);
        if (
          restored.wasLegacyPlaintext &&
          !await NRVDialogs.confirm(
            appText("backup.legacyConfirm", "This older backup is not encrypted. It will be encrypted with the passphrase you entered when restored. Continue?"),
          )
        ) {
          return;
        }
        const [storedSettings, storedContacts] = await Promise.all([
          readStoredValue(database, "settings"),
          readStoredValue(database, "contacts"),
        ]);
        if (
          (existingMetadata ||
            storedSettings !== undefined ||
            storedContacts !== undefined ||
            localStorage.getItem("return_visits_settings") !== null ||
            localStorage.getItem("return_visits_contacts") !== null) &&
          !await NRVDialogs.confirm(
            appText("backup.startupReplaceConfirm", "Restoring this backup will replace the data currently stored on this device. Continue?"),
          )
        ) {
          return;
        }
        await writeStoredValues(database, [
          ["settings", restored.encryptedSettings],
          ["contacts", restored.encryptedContacts],
          [ENCRYPTION_META_KEY, restored.metadata],
        ]);
        localStorage.removeItem("return_visits_settings");
        localStorage.removeItem("return_visits_contacts");
        localStorage.setItem("return_visits_last_backup_reminder", Date.now());
        if (backup.transferPurpose === "installation") {
          await NRVDialogs.alert(
            restored.metadata?.recovery
              ? appText("backup.installTransferRestored", "Your NRV information has been restored to this copy. Please check that it is here; the original browser copy remains unchanged.")
              : appText("backup.installTransferRestoredNoRecovery", "Your NRV information has been restored to this copy. Please check that it is here; the original browser copy remains unchanged. This backup has no recovery code yet; open Settings → Data/Security → Passphrase to Open App and choose Make a New Recovery Code."),
          );
        }
        dismissUnlockScreen(prompt.screen);
        resolve({
          database,
          settings: restored.settings,
          contacts: restored.contacts,
          encryptionKey: restored.encryptionKey,
          metadata: restored.metadata,
          existingStateDetected,
          restoredFromBackup: true,
        });
      } catch (error) {
        console.error("Unable to restore encrypted backup during startup:", error);
        prompt.errorMessage.textContent =
          error.message === "Enter the backup passphrase before restoring."
            ? appText("backup.requirePassphrase", "Enter the backup passphrase before restoring.")
            : error instanceof NewerDataVersionError
              ? appText("backup.newerData", "This data was saved by a newer version of the app. Update the app (reload it) before opening this data. Nothing was changed. Your current data was not replaced.")
              : appText("backup.startupRestoreFailed", "Could not restore that backup. Check that the file is valid and the passphrase is correct.");
      } finally {
        initialBackupInput.value = "";
        initialRestoreButton.disabled = false;
      }
    });

    prompt.passphraseInput.focus();
    document
      .getElementById("unlock-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        prompt.submitButton.disabled = true;
        prompt.errorMessage.textContent = "";
        try {
          const passphrase = prompt.passphraseInput.value;
          const metadata = existingMetadata;
          let encryptionKey;
          let settings;
          let contacts;

          let usedRecoveryCode = false;
          const resolvedPassphrase = await resolvePassphrase(
            passphrase,
            metadata,
          );
          usedRecoveryCode = resolvedPassphrase !== passphrase;
          encryptionKey = await deriveEncryptionKey(
            resolvedPassphrase,
            metadata,
          );
          const [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
            readStoredValue(database, "settings"),
            readStoredValue(database, "contacts"),
          ]);
          [settings, contacts] = await Promise.all([
            decryptValue(storedEncryptedSettings, encryptionKey),
            decryptValue(storedEncryptedContacts, encryptionKey),
          ]);
          if (
            !settings ||
            !Array.isArray(settings.cities) ||
            !Array.isArray(settings.areas) ||
            !Array.isArray(contacts)
          ) {
            throw new Error(appText("storage.invalidEncryptedDatabase", "The encrypted database contents are invalid."));
          }
          const sourceSchemaVersion = Number(settings.schemaVersion) || 1;
          const normalized = normalizeRegionData(settings, contacts);
          settings = normalized.settings;
          contacts = normalized.contacts;
          if (sourceSchemaVersion !== SCHEMA_VERSION) {
            await writeStoredValues(database, [
              ["settings", await encryptValue(settings, encryptionKey)],
              ["contacts", await encryptValue(contacts, encryptionKey)],
            ]);
            localStorage.removeItem("return_visits_settings");
            localStorage.removeItem("return_visits_contacts");
          }

          dismissUnlockScreen(prompt.screen);
          if (usedRecoveryCode) {
            await NRVDialogs.alert(
              appText("recovery.unlocked", "Unlocked with your recovery code. Open Settings → Data/Security → Passphrase to Open App and choose a new passphrase; you can enter your recovery code as the current passphrase. You will also get a new recovery code."),
            );
          }
          resolve({
            database,
            settings,
            contacts,
            encryptionKey,
            metadata,
            existingStateDetected,
            restoredFromBackup: false,
          });
        } catch (error) {
          console.error("Unable to unlock or encrypt local data:", error);
          if (error instanceof NewerDataVersionError) {
            showStartupRecovery();
          } else {
            prompt.errorMessage.textContent = appText(
              "unlock.readFailed",
              "The passphrase was incorrect, or the encrypted data could not be read.",
            );
            prompt.passphraseInput.select();
          }
        } finally {
          prompt.submitButton.disabled = false;
        }
      });
  });
};

const showStorageError = async (action, error) => {
  console.error(`Unable to ${action}:`, error);
  const actions = {
    "save country": appText("storage.actionCountry", "save country"),
    "save Country Addressing": appText("storage.actionAddressing", "save Country Addressing"),
    "save city": appText("storage.actionCity", "save city"),
    "save settings": appText("storage.actionSettings", "save settings"),
    "save region": appText("storage.actionRegion", "save region"),
    "save area": appText("storage.actionArea", "save area"),
    "save your details": appText("storage.actionSaveDetails", "save your details"),
    "clear your details": appText("storage.actionClearDetails", "clear your details"),
    "save location changes": appText("storage.actionLocations", "save location changes"),
    "delete the contact": appText("storage.actionDeleteContact", "delete the contact"),
    "save time in service": appText("storage.actionTime", "save time in service"),
    "save contacts": appText("storage.actionContacts", "save contacts"),
    "save your home pin": appText("storage.actionHomePin", "save your home pin"),
    "export encrypted backup": appText("storage.actionBackup", "export encrypted backup"),
    "export contacts": appText("storage.actionExportContacts", "export contacts"),
  };
  await NRVDialogs.alert(
    appText("storage.actionFailed", `Could not ${action}. Your changes may not have been saved. Please try again.`, { action: actions[action] || action }),
  );
};

const LAST_BACKUP_KEY = "return_visits_last_backup_at";
const LAST_BACKUP_PROMPT_KEY = "return_visits_last_backup_prompt";
const markBackupDone = () => {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    localStorage.removeItem(LAST_BACKUP_PROMPT_KEY);
  } catch (error) {
    console.error("Unable to save the backup time:", error);
  }
};
// Set once the app is running; called after saves so a connected Dropbox
// backup can follow.
let cloudBackupHook = () => {};

const initializeApp = async () => {
  if (!isInstalledApp()) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("install") === "1") {
      url.searchParams.delete("install");
      window.history.replaceState(null, "", url);
      showLaunchChoice();
      return;
    }
    let launchMode = null;
    try {
      launchMode = localStorage.getItem(LAUNCH_MODE_KEY);
    } catch (error) {
      console.error("Unable to read the selected launch mode:", error);
    }
    if (launchMode !== "browser") {
      showLaunchChoice();
      return;
    }
  }
  await requireUserAgreement();
  if (window.RVDropbox) await window.RVDropbox.ready;
  const {
    database,
    settings: savedSettings,
    contacts: savedContacts,
    encryptionKey: initialEncryptionKey,
    metadata: initialMetadata,
    existingStateDetected,
    restoredFromBackup,
  } =
    await initializeAppData();
  let encryptionKey = initialEncryptionKey;
  let cryptoMetadata = initialMetadata;

  // Settings State & Lists
  let settings = savedSettings;
  settings.country = normalizeCountry(settings.country);
  settings.addressingCountry = normalizeCountry(settings.addressingCountry);
  selectedAddressingCountry = settings.addressingCountry;
  selectedContactAddressingCountry = settings.addressingCountry;
  settings.workingNeedGreater = normalizeWorkingNeedGreater(
    settings.workingNeedGreater,
  );
  settings.state = normalizeLocationState(settings.country, settings.state);
  settings.timeTracking = normalizeTimeTracking(settings.timeTracking);
  const saveSettings = () =>
    encryptStoredValue(database, "settings", settings, encryptionKey).then(
      (result) => {
        cloudBackupHook();
        return result;
      },
    );

  // Populate Settings View Form
  document.getElementById("setting-state").value = settings.state;
  document.getElementById("setting-default-city").value =
    toTitleCase(settings.defaultCity || "");

  // Populate All Dropdowns (Filters & Modal Selects)
  let selectedContactArea = "";
  let selectedContactRegion = "";
  const countrySelects = [
    document.getElementById("me-country"),
    document.getElementById("contact-country"),
  ];
  const addressingCountrySelects = [
    document.getElementById("settings-address-country"),
    document.getElementById("setup-address-country"),
  ];
  const contactAddressingCountrySelect = document.getElementById(
    "contact-addressing-country",
  );
  const workingNeedCountrySelect = document.getElementById(
    "settings-working-need-country",
  );
  const populateWorkingNeedCountryOptions = () => {
    const currentCountry =
      workingNeedCountrySelect.value || settings.workingNeedGreater.country;
    workingNeedCountrySelect.replaceChildren();
    const chooseCountry = document.createElement("option");
    chooseCountry.value = "";
    chooseCountry.textContent = appText(
      "workingNeed.chooseCountry",
      "Choose a country",
    );
    workingNeedCountrySelect.appendChild(chooseCountry);
    [...DEFAULT_COUNTRIES, ...settings.countries.filter(
      (country) => !DEFAULT_COUNTRIES.includes(country),
    )].forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = displayCountry(country);
      workingNeedCountrySelect.appendChild(option);
    });
    workingNeedCountrySelect.value = Array.from(
      workingNeedCountrySelect.options,
    ).some((option) => option.value === currentCountry)
      ? currentCountry
      : "";
  };
  const populateAddressingCountryOptions = () => {
    [...addressingCountrySelects, contactAddressingCountrySelect].forEach((select) => {
      const currentCountry = select.value || settings.addressingCountry;
      select.replaceChildren();
      [...DEFAULT_COUNTRIES, ...settings.countries.filter(
        (country) => !DEFAULT_COUNTRIES.includes(country),
      )].forEach((country) => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = displayCountry(country);
        select.appendChild(option);
      });
      select.value = Array.from(select.options).some(
        (option) => option.value === currentCountry,
      )
        ? currentCountry
        : settings.addressingCountry;
    });
  };
  const populateCountryOptions = () => {
    countrySelects.forEach((select) => {
      const currentCountry = select.value || settings.country;
      select.innerHTML = "";
      [...DEFAULT_COUNTRIES, ...settings.countries.filter(
        (country) => !DEFAULT_COUNTRIES.includes(country),
      )].forEach((country) => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = displayCountry(country);
        select.appendChild(option);
      });
      const addCountryOption = document.createElement("option");
      addCountryOption.value = "__ADD_COUNTRY__";
      addCountryOption.textContent = appText("location.addCountry", "+ Country");
      select.appendChild(addCountryOption);
      select.value = Array.from(select.options).some(
        (option) => option.value === currentCountry,
      )
        ? currentCountry
        : settings.country;
      select.dataset.selectedCountry = select.value;
    });
    populateAddressingCountryOptions();
    populateWorkingNeedCountryOptions();
  };
  populateCountryOptions();
  const compareNames = (a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const sortLocations = () => {
    const byCountryThenName = (a, b) =>
      compareNames(a.country, b.country) || compareNames(a.name, b.name);
    settings.cities.sort(byCountryThenName);
    settings.regions.sort(byCountryThenName);
    settings.areas.sort(byCountryThenName);
  };
  const locationNamesFor = (list, country) =>
    list
      .filter((item) => item.country === country)
      .map((item) => item.name);
  const hasLocation = (list, country, name) =>
    list.some(
      (item) =>
        item.country === country &&
        item.name.toLowerCase() === String(name || "").toLowerCase(),
    );
  const findLocation = (list, country, name) =>
    list.find(
      (item) =>
        item.country === country &&
        item.name.toLowerCase() === String(name || "").toLowerCase(),
    )?.name || "";
  const uniqueLocationNames = (list) =>
    [...new Set(list.map((item) => item.name))].sort(compareNames);
  const addCity = (cityName, country) => {
    settings.cities.push({ name: cityName, country });
  };
  const rollbackNewCity = (cityName, country) => {
    settings.cities = settings.cities.filter(
      (city) => !(city.name === cityName && city.country === country),
    );
  };
  const populateDropdowns = () => {
    sortLocations();
    const citySelect = document.getElementById("contact-city-select");
    const meCityInput = document.getElementById("me-city");
    const contactCountry = () =>
      document.getElementById("contact-country").value;
    const meCountry = () => document.getElementById("me-country").value;
    const populateContactCityOptions = (selectedCity = citySelect.value) => {
      citySelect.innerHTML = '<option value="">Choose city</option>';
      citySelect.firstElementChild.textContent = appText("location.chooseCity", "Choose city");
      locationNamesFor(settings.cities, contactCountry()).forEach((city) => {
        const opt = document.createElement("option");
        opt.value = city;
        opt.textContent = city;
        citySelect.appendChild(opt);
      });
      const addCityOpt = document.createElement("option");
      addCityOpt.value = "__ADD_NEW__";
      addCityOpt.textContent = appText("location.addCityOption", "+ Add City");
      citySelect.appendChild(addCityOpt);
      citySelect.value = selectedCity;
      if (citySelect.selectedIndex < 0) citySelect.value = "";
    };
    populateContactCityOptions();
    const populateMeCityOptions = () => {
      const meCityOptions = document.getElementById("me-city-options");
      const currentMeCity = meCityInput.value;
      meCityOptions.innerHTML = "";
      const addMeCityOption = document.createElement("option");
      addMeCityOption.value = "+ Add New City...";
      meCityOptions.appendChild(addMeCityOption);
      locationNamesFor(settings.cities, meCountry()).forEach((city) => {
        const option = document.createElement("option");
        option.value = city;
        meCityOptions.appendChild(option);
      });
      meCityInput.value = currentMeCity;
    };
    populateMeCityOptions();

    const filterCity = document.getElementById("filter-city");
    const currentCityFilter = filterCity.value;
    filterCity.innerHTML = '<option value="">All Cities</option>';
    filterCity.firstElementChild.textContent = appText("filter.allCities", "All Cities");
    uniqueLocationNames(settings.cities).forEach((city) => {
      const opt = document.createElement("option");
      opt.value = city;
      opt.textContent = city;
      filterCity.appendChild(opt);
    });
    filterCity.value = currentCityFilter;

    const contactRegion = document.getElementById("contact-region-select");
    const contactArea = document.getElementById("contact-area-select");
    const meRegion = document.getElementById("me-region");
    const meArea = document.getElementById("me-area");
    const populateMeRegionArea = (selectedRegion = "", selectedArea = "") => {
      meRegion.innerHTML = '<option value="">None</option>';
      meRegion.firstElementChild.textContent = appText("common.none", "None");
      locationNamesFor(settings.regions, meCountry()).forEach((region) => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        meRegion.appendChild(option);
      });
      const addRegion = document.createElement("option");
      addRegion.value = "__ADD_NEW__";
      addRegion.textContent = appText("location.addRegion", "+ Add New Region...");
      meRegion.appendChild(addRegion);
      meRegion.disabled = !document.getElementById("me-country").value;
      meRegion.value = selectedRegion;
      if (meRegion.selectedIndex < 0) meRegion.value = "";

      meArea.innerHTML = '<option value="">None</option>';
      meArea.firstElementChild.textContent = appText("common.none", "None");
      locationNamesFor(settings.areas, meCountry()).forEach((area) => {
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        meArea.appendChild(option);
      });
      const addArea = document.createElement("option");
      addArea.value = "__ADD_NEW__";
      addArea.textContent = appText("location.addArea", "+ Add New Area...");
      meArea.appendChild(addArea);
      meArea.disabled = meRegion.disabled;
      meArea.value = selectedArea;
      if (meArea.selectedIndex < 0) meArea.value = "";
    };
    const populateContactRegionArea = (
      selectedRegion = "",
      selectedArea = "",
    ) => {
      contactRegion.innerHTML = '<option value="">None</option>';
      contactRegion.firstElementChild.textContent = appText("common.none", "None");
      locationNamesFor(settings.regions, contactCountry()).forEach((region) => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        contactRegion.appendChild(option);
      });
      const addRegionOption = document.createElement("option");
      addRegionOption.value = "__ADD_NEW__";
      addRegionOption.textContent = appText("location.addRegion", "+ Add New Region...");
      contactRegion.appendChild(addRegionOption);
      contactRegion.disabled =
        !document.getElementById("contact-country").value;
      contactRegion.value = selectedRegion;
      if (contactRegion.selectedIndex < 0) contactRegion.value = "";

      contactArea.innerHTML = '<option value="">None</option>';
      contactArea.firstElementChild.textContent = appText("common.none", "None");
      locationNamesFor(settings.areas, contactCountry()).forEach((area) => {
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        contactArea.appendChild(option);
      });
      const addAreaOption = document.createElement("option");
      addAreaOption.value = "__ADD_NEW__";
      addAreaOption.textContent = appText("location.addArea", "+ Add New Area...");
      contactArea.appendChild(addAreaOption);
      contactArea.disabled = contactRegion.disabled;
      contactArea.value = selectedArea;
      if (contactArea.selectedIndex < 0) contactArea.value = "";
      selectedContactArea = contactArea.value;
      selectedContactRegion = contactRegion.value;
    };
    populateContactRegionArea(contactRegion.value, contactArea.value);
    populateMeRegionArea(meRegion.value, meArea.value);

    const filterRegion = document.getElementById("filter-region");
    const currentRegionFilter = filterRegion.value;
    filterRegion.innerHTML = '<option value="">All Regions</option>';
    filterRegion.firstElementChild.textContent = appText("filter.allRegions", "All Regions");
    uniqueLocationNames(settings.regions)
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        filterRegion.appendChild(option);
      });
    filterRegion.value = Array.from(filterRegion.options).some(
      (option) => option.value === currentRegionFilter,
    )
      ? currentRegionFilter
      : "";

    const filterArea = document.getElementById("filter-area");
    let currentAreaFilter = filterArea.value;
    filterArea.innerHTML = '<option value="">All Areas</option>';
    filterArea.firstElementChild.textContent = appText("filter.allAreas", "All Areas");
    uniqueLocationNames(settings.areas)
      .forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        filterArea.appendChild(opt);
      });
    if (
      currentAreaFilter &&
      !Array.from(filterArea.options).some(
        (option) => option.value === currentAreaFilter,
      )
    ) {
      currentAreaFilter = "";
    }
    filterArea.value = currentAreaFilter;

    const hierarchyList = document.getElementById("region-area-list");
    const locationCountrySelect = document.getElementById("setting-location-country");
    const previousLocationCountry = locationCountrySelect.value;
    locationCountrySelect.innerHTML = "";
    settings.countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = displayCountry(country);
      locationCountrySelect.appendChild(option);
    });
    locationCountrySelect.value = settings.countries.includes(
      previousLocationCountry,
    )
      ? previousLocationCountry
      : settings.country;
    const locationCountry = locationCountrySelect.value;
    hierarchyList.innerHTML = "";
    const addHierarchyHeading = (text) => {
      const heading = document.createElement("h4");
      heading.className = "hierarchy-heading";
      heading.textContent = text;
      hierarchyList.appendChild(heading);
    };
    const addHierarchyRow = (type, name, className, usedIn) => {
      const location = { name, country: locationCountry };
      const item = document.createElement("div");
      item.className = className;
      const label = document.createElement("span");
      label.textContent = name;
      if (usedIn) {
        const cityNote = document.createElement("small");
        cityNote.className = "hierarchy-cities";
        cityNote.textContent = usedIn;
        label.append(document.createElement("br"), cityNote);
      }
      item.appendChild(label);

      const actions = document.createElement("div");
      actions.className = "hierarchy-actions";
      ["Edit", "Delete"].forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action === "Edit"
          ? appText("location.editAction", "Edit")
          : appText("location.deleteAction", "Delete");
        button.setAttribute(
          "aria-label",
          action === "Edit"
            ? appText("location.editLabel", `${action} ${type.toLowerCase()} ${name}`, { type: locationTypeDisplay(type), name })
            : appText("location.deleteLabel", `${action} ${type.toLowerCase()} ${name}`, { type: locationTypeDisplay(type), name }),
        );
        button.addEventListener("click", () => {
          if (action === "Edit")
            startEditingLocation(type, location, item, label, actions);
          else deleteLocation(type, location);
        });
        actions.appendChild(button);
      });
      item.appendChild(actions);
      hierarchyList.appendChild(item);
    };
    const addNameRows = (type, items, className) => {
      items.forEach((name) => addHierarchyRow(type, name, className));
    };

    const scopedCityNames = locationNamesFor(settings.cities, locationCountry);
    const scopedRegionNames = locationNamesFor(settings.regions, locationCountry);
    const scopedAreaNames = locationNamesFor(settings.areas, locationCountry);
    if (scopedCityNames.length) {
      addHierarchyHeading(appText("location.citiesHeading", "Cities"));
      scopedCityNames.forEach((city) =>
        addHierarchyRow("City", city, "hierarchy-city"),
      );
    }
    if (scopedRegionNames.length) {
      addHierarchyHeading(appText("location.regionsHeading", "Regions"));
      addNameRows("Region", scopedRegionNames, "hierarchy-region");
    }
    if (scopedAreaNames.length) {
      addHierarchyHeading(appText("location.areasHeading", "Areas"));
      addNameRows("Area", scopedAreaNames, "hierarchy-area");
    }

    const defaultCountryIsPeru = selectedAddressingCountry === "Peru";
    const defaultCountryIsJapan = selectedAddressingCountry === "Japan";
    document.getElementById("setting-state-label").textContent = appText(
      defaultCountryIsPeru
        ? "settings.defaultDepartment"
        : defaultCountryIsJapan
          ? "settings.defaultPrefecture"
          : "settings.defaultState",
      document.getElementById("setting-state-label").textContent,
    );
    document.getElementById("setting-state").placeholder = appText(
      defaultCountryIsPeru
        ? "location.departmentPlaceholder"
        : defaultCountryIsJapan
          ? "location.prefecturePlaceholder"
          : "location.statePlaceholder",
      document.getElementById("setting-state").placeholder,
    );
    document.getElementById("setting-city-label").textContent = appText(
      defaultCountryIsPeru
        ? "settings.defaultLocality"
        : defaultCountryIsJapan
          ? "settings.defaultCityWard"
          : "settings.defaultCity",
      document.getElementById("setting-city-label").textContent,
    );
    updateAddressLabels("contact", selectedContactAddressingCountry);
    updateAddressLabels("me", selectedAddressingCountry);
    return {
      populateContactRegionArea,
      populateMeRegionArea,
      populateContactCityOptions,
      populateMeCityOptions,
    };
  };
  const dropdownHelpers = populateDropdowns();
  const citySelect = document.getElementById("contact-city-select");
  const contactRegionSelect = document.getElementById("contact-region-select");
  const contactAreaSelect = document.getElementById("contact-area-select");
  const contactCountrySelect = document.getElementById("contact-country");
  const meCountrySelect = document.getElementById("me-country");
  const updateAddressingProfile = (country) => {
    selectedAddressingCountry = normalizeCountry(country);
    addressingCountrySelects.forEach((select) => {
      select.value = selectedAddressingCountry;
    });
    const peru = selectedAddressingCountry === "Peru";
    const japan = selectedAddressingCountry === "Japan";
    const stateLabel = document.getElementById("setting-state-label");
    const cityLabel = document.getElementById("setting-city-label");
    const stateInput = document.getElementById("setting-state");
    stateLabel.textContent = appText(
      peru
        ? "settings.defaultDepartment"
        : japan
          ? "settings.defaultPrefecture"
          : "settings.defaultState",
      stateLabel.textContent,
    );
    stateInput.placeholder = appText(
      peru
        ? "location.departmentPlaceholder"
        : japan
          ? "location.prefecturePlaceholder"
          : "location.statePlaceholder",
      stateInput.placeholder,
    );
    cityLabel.textContent = appText(
      peru
        ? "settings.defaultLocality"
        : japan
          ? "settings.defaultCityWard"
          : "settings.defaultCity",
      cityLabel.textContent,
    );
    updateAddressLabels("contact", selectedContactAddressingCountry);
    updateAddressLabels("me", selectedAddressingCountry);
  };
  const reorderContactAddressFields = (country) => {
    const container = document.getElementById("contact-address-fields");
    if (!container) return;
    const order =
      normalizeCountry(country) === "Japan"
        ? [
            "postal",
            "state",
            "city",
            "region",
            "area",
            "street",
            "country",
            "addressing",
          ]
        : [
            "street",
            "city",
            "state",
            "postal",
            "country",
            "addressing",
            "region",
            "area",
          ];
    order.forEach((field) => {
      const group = container.querySelector(
        `[data-address-field="${field}"]`,
      );
      if (group) container.appendChild(group);
    });
  };
  const updateContactAddressingProfile = (country) => {
    selectedContactAddressingCountry = normalizeCountry(country);
    contactAddressingCountrySelect.value = selectedContactAddressingCountry;
    updateAddressLabels("contact", selectedContactAddressingCountry);
    reorderContactAddressFields(selectedContactAddressingCountry);
  };
  const refreshAddressPresentation = () => {
    renderContacts();
    if (map) renderMapMarkers();
  };
  updateAddressingProfile(settings.addressingCountry);
  updateContactAddressingProfile(selectedContactAddressingCountry);
  contactAddressingCountrySelect.addEventListener("change", (event) => {
    updateContactAddressingProfile(event.target.value);
  });
  const workingNeedEnabledInput = document.getElementById(
    "settings-working-need-enabled",
  );
  const workingNeedDesignationSelect = document.getElementById(
    "settings-working-need-designation",
  );
  const workingNeedPrivacyDialog = document.getElementById(
    "working-need-privacy-dialog",
  );
  const workingNeedPrivacyAccepted = () =>
    new Promise((resolve) => {
      const continueButton = document.getElementById(
        "working-need-privacy-continue",
      );
      const cancelButton = document.getElementById(
        "working-need-privacy-cancel",
      );
      const onContinue = () => {
        finish(true);
        workingNeedPrivacyDialog.close();
      };
      const onCancel = () => {
        finish(false);
        workingNeedPrivacyDialog.close();
      };
      const finish = (accepted) => {
        workingNeedPrivacyDialog.removeEventListener("close", onClose);
        continueButton.removeEventListener("click", onContinue);
        cancelButton.removeEventListener("click", onCancel);
        resolve(accepted);
      };
      const onClose = () => finish(false);
      continueButton.addEventListener("click", onContinue);
      cancelButton.addEventListener("click", onCancel);
      workingNeedPrivacyDialog.addEventListener("close", onClose, {
        once: true,
      });
      workingNeedPrivacyDialog.showModal();
    });
  const syncWorkingNeedControls = () => {
    workingNeedEnabledInput.checked = settings.workingNeedGreater.enabled;
    workingNeedDesignationSelect.value =
      settings.workingNeedGreater.designation;
    workingNeedCountrySelect.value = settings.workingNeedGreater.country;
  };
  syncWorkingNeedControls();
  const saveWorkingNeedSettings = async () => {
    const previous = settings.workingNeedGreater;
    const next = {
      enabled: workingNeedEnabledInput.checked,
      designation: workingNeedDesignationSelect.value,
      country: workingNeedCountrySelect.value,
    };
    const status = document.getElementById("working-need-status");
    if (next.enabled && !next.designation) {
      status.textContent = appText(
        "workingNeed.designationRequired",
        "Choose Country, Unassigned, or Seldom Worked before turning this setting on.",
      );
      syncWorkingNeedControls();
      return;
    }
    if (next.enabled && next.designation === "country" && !next.country) {
      status.textContent = appText(
        "workingNeed.countryRequired",
        "Choose a working country for the Country designation.",
      );
      syncWorkingNeedControls();
      return;
    }
    if (
      next.enabled &&
      !previous.enabled &&
      !(await workingNeedPrivacyAccepted())
    ) {
      syncWorkingNeedControls();
      return;
    }
    settings.workingNeedGreater = normalizeWorkingNeedGreater(next);
    try {
      await saveSettings();
      status.textContent = "";
    } catch (error) {
      settings.workingNeedGreater = previous;
      syncWorkingNeedControls();
      await showStorageError("save Working Need Greater setting", error);
    }
  };
  [
    workingNeedEnabledInput,
    workingNeedDesignationSelect,
    workingNeedCountrySelect,
  ].forEach((input) =>
    input.addEventListener("change", saveWorkingNeedSettings),
  );
  document
    .getElementById("settings-address-country")
    .addEventListener("change", (event) => {
      updateAddressingProfile(event.target.value);
      refreshAddressPresentation();
    });
  document
    .getElementById("setup-address-country")
    .addEventListener("change", async (event) => {
      const previousCountry = settings.addressingCountry;
      updateAddressingProfile(event.target.value);
      refreshAddressPresentation();
      settings.addressingCountry = selectedAddressingCountry;
      try {
        await saveSettings();
        savedDetailsState = captureDetailsState();
      } catch (error) {
        settings.addressingCountry = previousCountry;
        updateAddressingProfile(previousCountry);
        refreshAddressPresentation();
        await showStorageError("save Country Addressing", error);
      }
    });
  const updateContactLocationFields = () => {
    const hasCountry = Boolean(contactCountrySelect.value);
    document.getElementById("contact-state").disabled = !hasCountry;
    citySelect.disabled = !hasCountry;
    dropdownHelpers.populateContactCityOptions();
    dropdownHelpers.populateContactRegionArea(
      contactRegionSelect.value,
      contactAreaSelect.value,
    );
    updateAddressLabels("contact", selectedContactAddressingCountry);
  };
  const updateMeLocationFields = () => {
    const hasCountry = Boolean(meCountrySelect.value);
    document.getElementById("me-state").disabled = !hasCountry;
    document.getElementById("me-city").disabled = !hasCountry;
    dropdownHelpers.populateMeCityOptions();
    dropdownHelpers.populateMeRegionArea(
      document.getElementById("me-region").value,
      document.getElementById("me-area").value,
    );
    updateAddressLabels("me", selectedAddressingCountry);
  };
  const resetDependentLocationFields = (select) => {
    if (select === contactCountrySelect) {
      document.getElementById("new-contact-region-container").hidden = true;
      document.getElementById("new-contact-area-container").hidden = true;
      document.getElementById("new-contact-city-container").hidden = true;
      citySelect.value = "";
      lastCommittedContactCity = "";
      contactRegionSelect.value = "";
      contactAreaSelect.value = "";
      updateContactLocationFields();
    } else {
      document.getElementById("me-state").value = "";
      document.getElementById("me-city").value = "";
      document.getElementById("me-region").value = "";
      document.getElementById("me-area").value = "";
      document.getElementById("new-me-region-container").hidden = true;
      document.getElementById("new-me-area-container").hidden = true;
      updateMeLocationFields();
    }
  };
  // Changing a contact's country clears the form's city, region, and area
  // choices because those lists are country-scoped. The user confirms first;
  // the saved contact record changes only when Save Contact is chosen, and
  // the master lists are never modified here.
  const contactLocationSelectionsExist = () =>
    [citySelect.value, contactRegionSelect.value, contactAreaSelect.value].some(
      (value) => value && value !== "__ADD_NEW__",
    );
  const confirmContactCountryChange = () =>
    NRVDialogs.confirm(
      appText(
        "contacts.countryChangeConfirm",
        "Changing the country clears this contact's City, Region, and Area choices for the new country. Continue?",
      ),
    );
  const getCountryAddFields = (select) =>
    select === contactCountrySelect
      ? {
          container: document.getElementById("new-contact-country-container"),
          input: document.getElementById("input-new-contact-country"),
        }
      : {
          container: document.getElementById("new-me-country-container"),
          input: document.getElementById("input-new-me-country"),
        };
  const handleCountryChange = async (select) => {
    const previousCountry = select.dataset.selectedCountry || settings.country;
    const country = select.value;
    if (country === "__ADD_COUNTRY__") {
      select.value = previousCountry;
      const { container, input } = getCountryAddFields(select);
      container.hidden = false;
      input.value = "";
      input.focus({ preventScroll: select === meCountrySelect });
      return false;
    }
    const { container, input } = getCountryAddFields(select);
    container.hidden = true;
    input.value = "";
    if (
      country !== previousCountry &&
      select === contactCountrySelect &&
      contactLocationSelectionsExist() &&
      !(await confirmContactCountryChange())
    ) {
      select.value = previousCountry;
      return false;
    }
    select.dataset.selectedCountry = country;
    if (country !== previousCountry) resetDependentLocationFields(select);
    return true;
  };
  const saveNewCountry = async (select) => {
    const { container, input } = getCountryAddFields(select);
    const enteredCountry = normalizeCountry(input.value);
    if (!enteredCountry) {
      await NRVDialogs.alert(appText("location.enterCountryError", "Enter a country name."));
      input.focus({ preventScroll: select === meCountrySelect });
      return;
    }
    const country =
      settings.countries.find(
        (existing) => existing.toLowerCase() === enteredCountry.toLowerCase(),
      ) || enteredCountry;
    const isNew = !settings.countries.includes(country);
    if (isNew) settings.countries.push(country);
    try {
      if (isNew) await saveSettings();
    } catch (error) {
      settings.countries = settings.countries.filter(
        (existing) => existing !== country,
      );
      await showStorageError("save country", error);
      return;
    }
    const previousCountry = select.dataset.selectedCountry || settings.country;
    if (
      country !== previousCountry &&
      select === contactCountrySelect &&
      contactLocationSelectionsExist() &&
      !(await confirmContactCountryChange())
    ) {
      select.value = previousCountry;
      container.hidden = true;
      input.value = "";
      return;
    }
    populateCountryOptions();
    select.value = country;
    select.dataset.selectedCountry = country;
    container.hidden = true;
    input.value = "";
    if (country !== previousCountry) resetDependentLocationFields(select);
    if (select === contactCountrySelect) {
      updateContactAddressingProfile(country);
    }
  };
  countrySelects.forEach((select) =>
    select.addEventListener("change", async () => {
      await handleCountryChange(select);
      if (select === contactCountrySelect) {
        updateContactAddressingProfile(select.value);
      } else {
        updateAddressLabels("me", selectedAddressingCountry);
      }
    }),
  );
  document
    .getElementById("btn-save-new-contact-country")
    .addEventListener("click", () => saveNewCountry(contactCountrySelect));
  document
    .getElementById("btn-save-new-me-country")
    .addEventListener("click", () => saveNewCountry(meCountrySelect));
  [
    ["contact-country", contactCountrySelect],
    ["me-country", meCountrySelect],
  ].forEach(([prefix, select]) => {
    document
      .getElementById(`btn-cancel-new-${prefix}`)
      .addEventListener("click", () => {
        const { container, input } = getCountryAddFields(select);
        container.hidden = true;
        input.value = "";
      });
  });
  document.getElementById("contact-state").addEventListener("input", () => {
    updateContactLocationFields();
  });
  document.getElementById("me-state").addEventListener("input", () => {
    updateMeLocationFields();
  });
  document.getElementById("me-city").addEventListener("input", () => {
    dropdownHelpers.populateMeRegionArea(
      document.getElementById("me-region").value,
      document.getElementById("me-area").value,
    );
  });
  let pendingContactCitySave = Promise.resolve(true);
  let lastCommittedContactCity = "";
  let activeWorkingNeedDesignation;
  const newContactCityContainer = document.getElementById("new-contact-city-container");
  const newContactCityInput = document.getElementById("input-new-contact-city");
  const newContactCityButton = document.getElementById("btn-save-new-contact-city");
  let previousContactCityRegion = "";
  let previousContactCityArea = "";
  const newContactRegionContainer = document.getElementById(
    "new-contact-region-container",
  );
  const saveNewContactCity = async () => {
    const enteredCity = toTitleCase(newContactCityInput.value.trim());
    const country = contactCountrySelect.value || settings.country;
    if (!enteredCity) {
      await NRVDialogs.alert(appText("location.enterCityError", "Enter a city name."));
      newContactCityInput.focus();
      return false;
    }
    const existingCity = findLocation(settings.cities, country, enteredCity);
    const city = existingCity || enteredCity;
    const session = contactEditorSession;
    newContactCityButton.disabled = true;
    newContactCityInput.disabled = true;
    if (!existingCity) {
      addCity(city, country);
      try {
        await saveSettings();
      } catch (error) {
        rollbackNewCity(city, country);
        await showStorageError("save city", error);
        newContactCityButton.disabled = false;
        newContactCityInput.disabled = false;
        return false;
      }
    }
    populateDropdowns();
    newContactCityButton.disabled = false;
    newContactCityInput.disabled = false;
    if (session === contactEditorSession && citySelect.value === "__ADD_NEW__") {
      citySelect.value = city;
      lastCommittedContactCity = city;
      newContactCityContainer.hidden = true;
      newContactCityInput.value = "";
      dropdownHelpers.populateContactRegionArea(
        previousContactCityRegion,
        previousContactCityArea,
      );
    }
    return true;
  };
  newContactCityButton.addEventListener("click", () => {
    pendingContactCitySave = saveNewContactCity();
  });
  newContactCityInput.addEventListener("input", () => {
    pendingContactCitySave = Promise.resolve(true);
  });
  document.getElementById("btn-cancel-new-contact-city").addEventListener("click", () => {
    citySelect.value = lastCommittedContactCity;
    pendingContactCitySave = Promise.resolve(true);
    newContactCityContainer.hidden = true;
    newContactCityInput.value = "";
    dropdownHelpers.populateContactRegionArea(previousContactCityRegion, previousContactCityArea);
    citySelect.focus();
  });
  citySelect.addEventListener("change", () => {
    newContactRegionContainer.hidden = true;
    document.getElementById("new-contact-area-container").hidden = true;
    if (citySelect.value === "__ADD_NEW__") {
      previousContactCityRegion = contactRegionSelect.value;
      previousContactCityArea = contactAreaSelect.value;
      newContactCityContainer.hidden = false;
      newContactCityInput.value = "";
      newContactCityInput.focus();
      return;
    }
    newContactCityContainer.hidden = true;
    newContactCityInput.value = "";
    pendingContactCitySave = Promise.resolve(true);
    lastCommittedContactCity = citySelect.value;
    dropdownHelpers.populateContactRegionArea(
      contactRegionSelect.value,
      contactAreaSelect.value,
    );
  });
  contactRegionSelect.addEventListener("change", () => {
    if (contactRegionSelect.value === "__ADD_NEW__") {
      contactRegionSelect.value = selectedContactRegion;
      newContactRegionContainer.hidden = false;
      const newRegionInput = document.getElementById(
        "input-new-contact-region",
      );
      newRegionInput.value = "";
      newRegionInput.focus();
      return;
    }
    dropdownHelpers.populateContactRegionArea(
      contactRegionSelect.value,
      contactAreaSelect.value,
    );
  });
  contactAreaSelect.addEventListener("change", () => {
    const newAreaContainer = document.getElementById(
      "new-contact-area-container",
    );
    if (contactAreaSelect.value === "__ADD_NEW__") {
      contactAreaSelect.value = selectedContactArea;
      newAreaContainer.hidden = false;
      const newAreaInput = document.getElementById("input-new-contact-area");
      newAreaInput.value = "";
      newAreaInput.focus();
      return;
    }
    selectedContactArea = contactAreaSelect.value;
    newAreaContainer.hidden = true;
  });
  document
  .getElementById("btn-save-new-contact-region")
  .addEventListener("click", async () => {
    const input = document.getElementById("input-new-contact-region");
    const name = toTitleCase(input.value);
    if (!name) {
      await NRVDialogs.alert(appText("location.enterRegionError", "Enter a name for the new region."));
      input.focus();
      return;
    }
    const existingRegion = findLocation(
      settings.regions,
      contactCountrySelect.value,
      name,
    );
    if (existingRegion) {
      dropdownHelpers.populateContactRegionArea(
        existingRegion,
        contactAreaSelect.value,
      );
      newContactRegionContainer.hidden = true;
      input.value = "";
      await NRVDialogs.alert(appText("location.regionExists", "That region is already in the list."));
      return;
    }

    settings.regions.push({ name, country: contactCountrySelect.value });
    try {
      await saveSettings();
    } catch (error) {
      settings.regions.pop();
      await showStorageError("save settings", error);
      return;
    }
    const area = contactAreaSelect.value;
    populateDropdowns();
    dropdownHelpers.populateContactRegionArea(name, area);
    newContactRegionContainer.hidden = true;
    input.value = "";
  });
  document
  .getElementById("btn-cancel-new-contact-region")
  .addEventListener("click", () => {
    newContactRegionContainer.hidden = true;
    document.getElementById("input-new-contact-region").value = "";
    contactRegionSelect.value = selectedContactRegion;
  });
  document
  .getElementById("btn-save-new-contact-area")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-contact-area");
      const name = toTitleCase(input.value);
      const region = contactRegionSelect.value;
      if (!name) {
        await NRVDialogs.alert(appText("location.enterAreaError", "Enter a name for the new area."));
        input.focus();
        return;
      }
      const existingArea = findLocation(
        settings.areas,
        contactCountrySelect.value,
        name,
      );
      if (existingArea) {
        dropdownHelpers.populateContactRegionArea(region, existingArea);
        document.getElementById("new-contact-area-container").hidden = true;
        await NRVDialogs.alert(appText("location.areaExists", "That area is already in the list."));
        return;
      }

      settings.areas.push({ name, country: contactCountrySelect.value });
      try {
        await saveSettings();
      } catch (error) {
        settings.areas.pop();
        await showStorageError("save settings", error);
        return;
      }
      populateDropdowns();
      dropdownHelpers.populateContactRegionArea(region, name);
      document.getElementById("new-contact-area-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-contact-area")
    .addEventListener("click", () => {
      document.getElementById("new-contact-area-container").hidden = true;
      document.getElementById("input-new-contact-area").value = "";
      contactAreaSelect.value = selectedContactArea;
    });
  document
    .getElementById("setting-new-city")
    .addEventListener("blur", (event) => {
      event.currentTarget.value = toTitleCase(event.currentTarget.value);
    });

  // Settings View Buttons
  const settingLocationCountry = () =>
    document.getElementById("setting-location-country").value ||
    settings.country;
  document
    .getElementById("setting-location-country")
    .addEventListener("change", () => populateDropdowns());
  document
    .getElementById("btn-add-setting-city")
    .addEventListener("click", async () => {
      const input = document.getElementById("setting-new-city");
      const val = toTitleCase(input.value);
      const country = settingLocationCountry();
      const existingCity = hasLocation(settings.cities, country, val);
      if (val && !existingCity) {
        addCity(val, country);
        input.value = "";
        try {
          await saveSettings();
        } catch (error) {
          rollbackNewCity(val, country);
          await showStorageError("save settings", error);
          return;
        }
        populateDropdowns();
        await NRVDialogs.alert(appText("location.cityAdded", `City "${val}" added.`, { name: val }));
      } else if (val) {
        input.value = "";
        await NRVDialogs.alert(appText("location.cityExists", "That city already exists."));
      }
    });

  const updatePendingLocationButton = (input, button) => {
    button.style.backgroundColor = input.value.trim() ? "#28a745" : "#004080";
  };
  const settingRegionInput = document.getElementById("setting-new-region");
  const addSettingRegionButton = document.getElementById(
    "btn-add-setting-region",
  );
  const settingAreaInput = document.getElementById("setting-new-area");
  const addSettingAreaButton = document.getElementById("btn-add-setting-area");
  const updateAddRegionButton = () =>
    updatePendingLocationButton(settingRegionInput, addSettingRegionButton);
  const updateAddAreaButton = () =>
    updatePendingLocationButton(settingAreaInput, addSettingAreaButton);
  settingRegionInput.addEventListener("input", updateAddRegionButton);
  settingAreaInput.addEventListener("input", updateAddAreaButton);

  document
    .getElementById("btn-add-setting-area")
    .addEventListener("click", async () => {
      const input = settingAreaInput;
      const val = toTitleCase(input.value);
      const country = settingLocationCountry();
      if (val && !hasLocation(settings.areas, country, val)) {
        settings.areas.push({ name: val, country });
        try {
          await saveSettings();
        } catch (error) {
          settings.areas.pop();
          await showStorageError("save settings", error);
          return;
        }
        input.value = "";
        updateAddAreaButton();
        populateDropdowns();
        await NRVDialogs.alert(appText("location.areaAdded", `Area "${val}" added.`, { name: val }));
      } else if (val) {
        input.value = "";
        updateAddAreaButton();
        await NRVDialogs.alert(appText("location.areaExists", "That area is already in the list."));
      }
    });

  document
    .getElementById("btn-add-setting-region")
    .addEventListener("click", async () => {
      const input = settingRegionInput;
      const region = toTitleCase(input.value);
      const country = settingLocationCountry();
      if (region && !hasLocation(settings.regions, country, region)) {
        settings.regions.push({ name: region, country });
        try {
          await saveSettings();
        } catch (error) {
          settings.regions.pop();
          await showStorageError("save settings", error);
          return;
        }
        input.value = "";
        updateAddRegionButton();
        populateDropdowns();
        await NRVDialogs.alert(appText("location.regionAdded", `Region "${region}" added.`, { name: region }));
      } else if (region) {
        input.value = "";
        updateAddRegionButton();
        await NRVDialogs.alert(appText("location.regionExists", "That region is already in the list."));
      }
    });

  document.getElementById("settings-form").addEventListener("submit", (e) => e.preventDefault());
  document.getElementById("me-form").addEventListener("submit", (e) => e.preventDefault());

  const meFields = {
    name: document.getElementById("me-name"),
    country: document.getElementById("me-country"),
    state: document.getElementById("me-state"),
    city: document.getElementById("me-city"),
    region: document.getElementById("me-region"),
    area: document.getElementById("me-area"),
    street: document.getElementById("me-street"),
    postalCode: document.getElementById("me-postal-code"),
    lat: document.getElementById("me-lat"),
    lng: document.getElementById("me-lng"),
  };
  const meStatus = document.getElementById("me-status");
  let lastCommittedMeCity = "";
  if (window.visualViewport &&
      (/iPad/i.test(navigator.userAgent) ||
       (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1))) {
    guardDetailsFocusScroll(
      document.getElementById("me-form"),
      document.querySelector("main"),
      window.visualViewport,
      performance,
    );
  }
  meFields.name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    meFields.street.focus({ preventScroll: true });
  });
  const populateMeForm = () => {
    const me = settings.me || {};
    Object.entries(meFields).forEach(([key, input]) => {
      if (key === "region" || key === "area") return;
      input.value = me[key] || "";
    });
    meFields.country.value = settings.country;
    meCountrySelect.dataset.selectedCountry = meFields.country.value;
    populateDropdowns();
    meFields.region.value = me.region || "";
    populateDropdowns();
    meFields.area.value = me.area || "";
    updateMeLocationFields();
    lastCommittedMeCity = meFields.city.value;
  };
  const readMeForm = () => {
    const me = {};
    Object.entries(meFields).forEach(([key, input]) => {
      me[key] = input.value.trim();
    });
    me.country = normalizeCountry(me.country);
    me.state = normalizeLocationState(me.country, me.state);
    me.street = me.street ? normalizeStreetForAddressing(me.street) : "";
    me.city = me.city ? toTitleCase(me.city) : "";
    return me;
  };
  populateMeForm();
  meFields.state.addEventListener("blur", () => {
    if (meFields.state.value) {
      meFields.state.value = normalizeLocationState(
        meFields.country.value,
        meFields.state.value,
      );
    }
  });
  const commitMeCity = () => {
    const enteredCity = toTitleCase(meFields.city.value.trim());
    if (!enteredCity || enteredCity === "+ Add New City...") {
      meFields.city.value = "";
      lastCommittedMeCity = "";
      populateDropdowns();
      return true;
    }
    const existingCity = findLocation(
      settings.cities,
      meFields.country.value || settings.country,
      enteredCity,
    );
    if (existingCity) {
      meFields.city.value = existingCity;
      lastCommittedMeCity = existingCity;
      populateDropdowns();
      return true;
    }
    meFields.city.value = enteredCity;
    lastCommittedMeCity = enteredCity;
    dropdownHelpers.populateMeRegionArea(
      meFields.region.value,
      meFields.area.value,
    );
    return true;
  };
  meFields.city.addEventListener("change", () => {
    if (meFields.city.value.trim() === "+ Add New City...") {
      meFields.city.value = "";
      meFields.city.focus({ preventScroll: true });
      return;
    }
    commitMeCity();
  });
  meFields.region.addEventListener("change", () => {
    if (meFields.region.value === "__ADD_NEW__") {
      meFields.region.value = "";
      document.getElementById("new-me-region-container").hidden = false;
      document
        .getElementById("input-new-me-region")
        .focus({ preventScroll: true });
    } else {
      dropdownHelpers.populateMeRegionArea(
        meFields.region.value,
        meFields.area.value,
      );
    }
  });
  meFields.area.addEventListener("change", () => {
    if (meFields.area.value === "__ADD_NEW__") {
      meFields.area.value = "";
      document.getElementById("new-me-area-container").hidden = false;
      document
        .getElementById("input-new-me-area")
        .focus({ preventScroll: true });
    }
  });
  document
    .getElementById("btn-save-new-me-region")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-me-region");
      const name = toTitleCase(input.value);
      if (!name) {
        await NRVDialogs.alert(appText("location.enterRegionError", "Enter a name for the new region."));
        input.focus({ preventScroll: true });
        return;
      }
      const existing = findLocation(
        settings.regions,
        meFields.country.value || settings.country,
        name,
      );
      if (existing) {
        populateDropdowns();
        meFields.region.value = existing;
        document.getElementById("new-me-region-container").hidden = true;
        await NRVDialogs.alert(appText("location.regionExists", "That region is already in the list."));
        return;
      }
      settings.regions.push({
        name,
        country: meFields.country.value || settings.country,
      });
      try {
        await saveSettings();
      } catch (error) {
        settings.regions.pop();
        await showStorageError("save region", error);
        return;
      }
      const area = meFields.area.value;
      populateDropdowns();
      dropdownHelpers.populateMeRegionArea(name, area);
      document.getElementById("new-me-region-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-me-region")
    .addEventListener("click", () => {
      document.getElementById("new-me-region-container").hidden = true;
      document.getElementById("input-new-me-region").value = "";
      populateDropdowns();
    });
  document
    .getElementById("btn-save-new-me-area")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-me-area");
      const name = toTitleCase(input.value);
      const region = meFields.region.value;
      if (!name) {
        await NRVDialogs.alert(appText("location.enterAreaError", "Enter a name for the new area."));
        input.focus({ preventScroll: true });
        return;
      }
      const existing = findLocation(
        settings.areas,
        meFields.country.value || settings.country,
        name,
      );
      if (existing) {
        populateDropdowns();
        meFields.area.value = existing;
        document.getElementById("new-me-area-container").hidden = true;
        await NRVDialogs.alert(appText("location.areaExists", "That area is already in the list."));
        return;
      }
      settings.areas.push({
        name,
        country: meFields.country.value || settings.country,
      });
      try {
        await saveSettings();
      } catch (error) {
        settings.areas.pop();
        await showStorageError("save area", error);
        return;
      }
      populateDropdowns();
      dropdownHelpers.populateMeRegionArea(region, name);
      document.getElementById("new-me-area-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-me-area")
    .addEventListener("click", () => {
      document.getElementById("new-me-area-container").hidden = true;
      document.getElementById("input-new-me-area").value = "";
      populateDropdowns();
    });

  document.getElementById("btn-me-find").addEventListener("click", async () => {
    const me = readMeForm();
    if (!me.street && !me.city) {
      meStatus.textContent = appText("settings.enterAddress", "Enter your street address or city first.");
      return;
    }
    const button = document.getElementById("btn-me-find");
    button.disabled = true;
    meStatus.textContent = appText("settings.lookupAddress", "Looking up your address...");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q: [
          me.street,
          me.area,
          me.region,
          me.city,
          me.state || settings.state,
          me.postalCode,
          me.country || settings.country,
        ]
          .filter(Boolean)
          .join(", "),
        format: "jsonv2",
        limit: "1",
      }).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Lookup failed (${response.status}).`);
      const results = await response.json();
      if (!results.length) {
        const defaultLocation = [
          settings.defaultCity.trim(),
          settings.state.trim(),
        ]
          .filter(Boolean)
          .join(", ");
        if (!defaultLocation) {
          meStatus.textContent = appText("settings.homeNotFoundDefault", "Could not find this address. Set your default city and state, or use Device Location if you are at the location.");
          return;
        }
        try {
          const fallbackLocation = await lookupCityPinCoordinates(
            [
              defaultLocation,
              settings.country || DEFAULT_SETTINGS.country,
            ].join(", "),
          );
          if (!fallbackLocation) {
            meStatus.textContent = appText("settings.homeNotFoundCoordinates", `Could not find this address or locate ${defaultLocation}. Use Device Location if you are at the location, or enter coordinates.`, { location: defaultLocation });
            return;
          }
          meFields.lat.value = fallbackLocation[0].toFixed(6);
          meFields.lng.value = fallbackLocation[1].toFixed(6);
          meStatus.textContent = appText("settings.homeCentered", `Could not find this address. The pin has been centered near ${defaultLocation}. Save changes when leaving, then move the pin to the correct location, or use Device Location if you are at the location.`, { location: defaultLocation });
        } catch (error) {
          console.error(
            "Unable to center the home pin on the default location:",
            error,
          );
          meStatus.textContent = appText("settings.homeNotFoundConnection", `Could not find this address or locate ${defaultLocation}. Check your connection, or use Device Location if you are at the location.`, { location: defaultLocation });
        }
      } else {
        meFields.lat.value = Number(results[0].lat).toFixed(6);
        meFields.lng.value = Number(results[0].lon).toFixed(6);
        meStatus.textContent = appText("settings.homeFound", "Home pin found. Save changes when leaving, then drag it on the Map to fine-tune.");
      }
    } catch (error) {
      console.error("Home lookup failed:", error);
      meStatus.textContent = appText("settings.homeLookupFailed", "Could not look up the address. Check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("btn-me-gps").addEventListener("click", () => {
    if (!navigator.geolocation) {
      meStatus.textContent = appText("map.deviceUnsupported", "Device location is not supported by this browser.");
      return;
    }
    const button = document.getElementById("btn-me-gps");
    button.disabled = true;
    meStatus.textContent = appText("map.gettingDevice", "Getting your device location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        meFields.lat.value = position.coords.latitude.toFixed(6);
        meFields.lng.value = position.coords.longitude.toFixed(6);
        meStatus.textContent = appText("settings.homeGpsSet", "Home pin set from device location. Save changes when leaving to keep it.");
        button.disabled = false;
      },
      () => {
        meStatus.textContent = appText("settings.homeGpsFailed", "Could not get a device location. Check permission, or use the address lookup.");
        button.disabled = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });

  const captureDetailsState = () => JSON.stringify({
    country: meFields.country.value,
    addressingCountry: document.getElementById("settings-address-country").value,
    defaultState: document.getElementById("setting-state").value.trim(),
    defaultCity: document.getElementById("setting-default-city").value.trim(),
    ...Object.fromEntries(
      Object.entries(meFields)
        .filter(([key]) => key !== "country")
        .map(([key, input]) => [key, input.value.trim()]),
    ),
  });
  let savedDetailsState = captureDetailsState();
  const showDetailsValidationError = async (message, input) => {
    meStatus.textContent = message;
    document.getElementById("defaults-your-details-section").open = true;
    document.getElementById("your-details-section").open = true;
    input.focus({ preventScroll: true });
    await NRVDialogs.alert(message);
  };
  const saveDefaultsAndDetails = async () => {
    commitMeCity();
    const me = readMeForm();
    if (
      !me.country ||
      (me.region && !hasLocation(settings.regions, me.country, me.region)) ||
      (me.area && !hasLocation(settings.areas, me.country, me.area))
    ) {
      await showDetailsValidationError(
        appText("settings.validLocation", "Choose a valid country, city, region, and area."),
        meFields.city,
      );
      return false;
    }
    const lat = parseFloat(me.lat);
    const lng = parseFloat(me.lng);
    if (
      (me.lat || me.lng) &&
      !(Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    ) {
      await showDetailsValidationError(
        appText("map.validCoordinates", "Enter valid latitude and longitude values."),
        meFields.lat,
      );
      return false;
    }
    const previousMe = settings.me;
    const previousDefaults = {
      country: settings.country,
      addressingCountry: settings.addressingCountry,
      state: settings.state,
      defaultCity: settings.defaultCity,
      cities: [...settings.cities],
    };
    settings.me = me;
    settings.country = me.country;
    settings.addressingCountry = normalizeCountry(
      document.getElementById("settings-address-country").value,
    );
    selectedAddressingCountry = settings.addressingCountry;
    settings.state = normalizeLocationState(me.country, document.getElementById("setting-state").value);
    settings.defaultCity = toTitleCase(document.getElementById("setting-default-city").value);
    for (const key of ["defaultCity", "city"]) {
      const owner = key === "city" ? me : settings;
      const city = owner[key];
      if (!city) continue;
      const existing = findLocation(settings.cities, me.country, city);
      if (existing) owner[key] = existing;
      else addCity(city, me.country);
    }
    try {
      await saveSettings();
    } catch (error) {
      settings.me = previousMe;
      Object.assign(settings, previousDefaults);
      updateAddressingProfile(previousDefaults.addressingCountry);
      await showStorageError("save your details", error);
      return false;
    }
    document.getElementById("setting-state").value = settings.state;
    document.getElementById("setting-default-city").value =
      settings.defaultCity;
    populateMeForm();
    savedDetailsState = captureDetailsState();
    if (map) renderMapMarkers();
    meStatus.textContent = "";
    return true;
  };

  document.getElementById("btn-me-clear").addEventListener("click", async () => {
    if (!await NRVDialogs.confirm(appText("settings.clearConfirm", "Clear your details and remove your home pin?"))) return;
    Object.entries(meFields).forEach(([key, input]) => {
      if (key !== "country") input.value = "";
    });
    lastCommittedMeCity = "";
    updateMeLocationFields();
    meStatus.textContent = "";
  });

  let contacts = savedContacts;
  let visibleContacts = [];
  const mapLocationSelect = document.getElementById("map-location-select");
  let selectedMapLocation = "";
  let mapLocationIsDefault = true;
  const getMapDefaultLocation = () => {
    const working = settings.workingNeedGreater;
    if (working?.enabled && working.designation === "country" && working.country) {
      return JSON.stringify(["country", working.country]);
    }
    return settings.state
      ? JSON.stringify(["division", settings.country, settings.state])
      : JSON.stringify(["country", settings.country]);
  };
  const getMapLocationParts = (value = selectedMapLocation) => {
    try {
      const parts = JSON.parse(value);
      if (parts[0] === "division") {
        return { type: "division", country: parts[1], division: parts[2] };
      }
      if (parts[0] === "country") return { type: "country", country: parts[1] };
    } catch (error) {
      console.error("Invalid saved Map Location selection:", error);
    }
    return { type: "country", country: settings.country };
  };
  const getMapLocationLabel = (parts = getMapLocationParts()) => {
    const country = displayCountry(parts.country);
    if (parts.type === "division") {
      const divisionLabel =
        parts.country === "Peru"
          ? appText("map.department", "Department")
          : parts.country === "Japan"
            ? appText("map.prefecture", "Prefecture")
            : appText("map.stateProvince", "State / Province");
      return appText(
        "map.divisionLocation",
        `${country} — ${divisionLabel}: ${parts.division}`,
        { country, division: divisionLabel, value: parts.division },
      );
    }
    return appText("map.countryLocation", country, { country });
  };
  const isContactInMapLocation = (contact, parts = getMapLocationParts()) => {
    if (normalizeCountry(contact.country || settings.country) !== parts.country) {
      return false;
    }
    return (
      parts.type !== "division" ||
      normalizeLocationState(parts.country, contact.state || "") ===
        normalizeLocationState(parts.country, parts.division)
    );
  };
  const getVisibleMapContacts = () =>
    visibleContacts.filter((contact) => isContactInMapLocation(contact));
  const getMapScopedContacts = () =>
    contacts.filter((contact) => isContactInMapLocation(contact));
  const populateMapLocationOptions = () => {
    if (mapLocationIsDefault || !selectedMapLocation) {
      selectedMapLocation = getMapDefaultLocation();
    }
    const countries = [
      ...new Set([
        ...contacts.map((contact) =>
          normalizeCountry(contact.country || settings.country),
        ),
        settings.country,
        ...(settings.workingNeedGreater?.country
          ? [settings.workingNeedGreater.country]
          : []),
      ]),
    ].filter(Boolean);
    mapLocationSelect.replaceChildren();
    countries.forEach((country) => {
      const countryOption = document.createElement("option");
      countryOption.value = JSON.stringify(["country", country]);
      countryOption.textContent = displayCountry(country);
      mapLocationSelect.appendChild(countryOption);
      const divisions = [
        ...new Set([
          ...contacts
            .filter(
              (contact) =>
                normalizeCountry(contact.country || settings.country) ===
                country,
            )
            .map((contact) =>
              normalizeLocationState(country, contact.state || ""),
            ),
          ...(country === settings.country && settings.state
            ? [normalizeLocationState(country, settings.state)]
            : []),
        ]),
      ]
        .filter(Boolean)
        .sort((a, b) =>
          a.localeCompare(b, undefined, {
            sensitivity: "base",
            numeric: true,
          }),
        );
      divisions.forEach((division) => {
        const option = document.createElement("option");
        option.value = JSON.stringify(["division", country, division]);
        option.textContent = getMapLocationLabel({
          type: "division",
          country,
          division,
        });
        mapLocationSelect.appendChild(option);
      });
    });
    if (
      !Array.from(mapLocationSelect.options).some(
        (option) => option.value === selectedMapLocation,
      )
    ) {
      mapLocationIsDefault = true;
      selectedMapLocation = getMapDefaultLocation();
    }
    mapLocationSelect.value = selectedMapLocation;
  };
  const setFilterOptions = (select, label, values, selected) => {
    select.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = label;
    select.appendChild(allOption);
    [...new Set(values.filter(Boolean))]
      .sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
      )
      .forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    select.value = Array.from(select.options).some(
      (option) => option.value === selected,
    )
      ? selected
      : "";
  };
  const populateMapGeographicFilters = () => {
    if (!document.body.classList.contains("map-view-active")) return;
    const scopedContacts = getMapScopedContacts();
    const cityFilter = document.getElementById("filter-city");
    const regionFilter = document.getElementById("filter-region");
    const areaFilter = document.getElementById("filter-area");
    const city = cityFilter.value;
    const region = regionFilter.value;
    const area = areaFilter.value;
    setFilterOptions(
      cityFilter,
      appText("filter.allCities", "All Cities"),
      scopedContacts.map((contact) => contact.city),
      city,
    );
    const cityContacts = city
      ? scopedContacts.filter((contact) => contact.city === city)
      : scopedContacts;
    setFilterOptions(
      regionFilter,
      appText("filter.allRegions", "All Regions"),
      cityContacts.map((contact) => contact.region),
      region,
    );
    const regionContacts = region
      ? cityContacts.filter((contact) => contact.region === region)
      : cityContacts;
    setFilterOptions(
      areaFilter,
      appText("filter.allAreas", "All Areas"),
      regionContacts.map((contact) => contact.area),
      area,
    );
  };
  const mapFiltersAreActive = () =>
    selectedMapLocation !== getMapDefaultLocation() ||
    Boolean(document.getElementById("search-input").value.trim()) ||
    Boolean(document.getElementById("filter-working-need").value !== "all") ||
    Boolean(document.getElementById("filter-urgency").value) ||
    Boolean(document.getElementById("filter-city").value) ||
    Boolean(document.getElementById("filter-region").value) ||
    Boolean(document.getElementById("filter-area").value) ||
    document.getElementById("sort-select").value !== "chronological-desc";
  const updateMapChangeViewIndicator = () => {
    const button = document.getElementById("btn-map-change-view");
    const active = mapFiltersAreActive();
    button.classList.toggle("filters-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute(
      "aria-label",
      appText(
        active ? "map.changeViewActive" : "map.changeViewInactive",
        active ? "Change View, filters active" : "Change View, default view",
      ),
    );
    document.getElementById("map-change-view-indicator").hidden = !active;
  };
  populateMapLocationOptions();

  // Stamp updatedAt only on contacts whose content actually changed.
  const getContactSignature = (contact) =>
    JSON.stringify({ ...contact, updatedAt: undefined });
  let contactSignatures = new Map();
  const resetContactSignatures = () => {
    contactSignatures = new Map(
      contacts.map((contact) => [
        String(contact.id),
        getContactSignature(contact),
      ]),
    );
  };
  const stampChangedContacts = () => {
    const now = new Date().toISOString();
    const nextSignatures = new Map();
    contacts.forEach((contact) => {
      const key = String(contact.id);
      const signature = getContactSignature(contact);
      if (contactSignatures.get(key) !== signature) contact.updatedAt = now;
      nextSignatures.set(key, signature);
    });
    return nextSignatures;
  };
  resetContactSignatures();

  const cloneLocationState = () => ({
    settings: JSON.parse(JSON.stringify(settings)),
    contacts: JSON.parse(JSON.stringify(contacts)),
  });

  const renameFilterValue = (filterId, oldValue, newValue) => {
    const filter = document.getElementById(filterId);
    if (filter.value !== oldValue) return;
    const selectedOption = Array.from(filter.options).find(
      (option) => option.value === oldValue,
    );
    if (selectedOption) selectedOption.value = newValue;
    filter.value = newValue;
  };

  const startEditingLocation = (type, location, row, label, actions) => {
    if (row.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "text";
    input.value = location.name;
    const newNameLabel = type === "City"
      ? appText("location.newCityName", "New city name")
      : type === "Region"
        ? appText("location.newRegionName", "New region name")
        : appText("location.newAreaName", "New area name");
    input.setAttribute("aria-label", newNameLabel);
    actions.innerHTML = "";
    label.replaceWith(input);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = appText("common.save", "Save");
    saveButton.addEventListener("click", async () => {
      await renameLocation(type, location, input.value);
    });
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = appText("common.cancel", "Cancel");
    cancelButton.addEventListener("click", () => populateDropdowns());
    actions.append(saveButton, cancelButton);
    input.focus();
    input.select();
  };

  const persistLocationChanges = async (
    previousState,
    action = "save location changes",
  ) => {
    try {
      const nextSignatures = stampChangedContacts();
      await writeStoredValues(database, [
        ["settings", await encryptValue(settings, encryptionKey)],
        ["contacts", await encryptValue(contacts, encryptionKey)],
      ]);
      contactSignatures = nextSignatures;
    } catch (error) {
      settings = previousState.settings;
      contacts = previousState.contacts;
      await showStorageError(action, error);
      populateDropdowns();
      renderContacts();
      return false;
    }
    cloudBackupHook();
    populateDropdowns();
    renderContacts();
    return true;
  };

  const renameLocation = async (type, location, proposedName) => {
    const name = toTitleCase(proposedName);
    if (!name) {
      await NRVDialogs.alert(appText("location.blankName", "A location name cannot be blank."));
      return false;
    }
    if (name === location.name) {
      populateDropdowns();
      return true;
    }

    const previousState = cloneLocationState();
    const scope = location.country;
    const renameEntry = (list) =>
      list.map((item) =>
        item.country === scope && item.name === location.name
          ? { ...item, name }
          : item,
      );
    const contactInScope = (contact) => contact.country === scope;
    if (type === "City") {
      const duplicate = hasLocation(settings.cities, scope, name);
      if (duplicate) {
        await NRVDialogs.alert(appText("location.cityNameExists", "A city with that name already exists."));
        return false;
      }
      settings.cities = renameEntry(settings.cities);
      settings.defaultCity =
        settings.defaultCity === location.name && scope === settings.country
          ? name
          : settings.defaultCity;
      contacts = contacts.map((contact) => {
        if (!contactInScope(contact) || contact.city !== location.name) return contact;
        const updatedContact = { ...contact, city: name };
        const streetAddress = getStreetAddress(updatedContact);
        return {
          ...updatedContact,
          streetAddress,
          address: getFormattedContactAddress(updatedContact),
        };
      });

      if (citySelect.value === location.name) citySelect.value = name;
      if (
        document.getElementById("filter-city").value === location.name
      ) {
        const cityFilter = document.getElementById("filter-city");
        const selectedOption = Array.from(cityFilter.options).find(
          (option) => option.value === location.name,
        );
        if (selectedOption) selectedOption.value = name;
        cityFilter.value = name;
      }
      if (settings.defaultCity === name) {
        document.getElementById("setting-default-city").value = name;
      }
    } else {
      // Renames a region or area in its country's list and on every contact
      // of that country that uses it.
      const listKey = type === "Region" ? "regions" : "areas";
      const contactField = type === "Region" ? "region" : "area";
      const duplicate = hasLocation(settings[listKey], scope, name);
      if (duplicate) {
        await NRVDialogs.alert(
          type === "Region"
            ? appText("location.regionExists", "That region is already in the list.")
            : appText("location.areaExists", "That area is already in the list."),
        );
        return false;
      }
      settings[listKey] = renameEntry(settings[listKey]);
      contacts = contacts.map((contact) =>
        contactInScope(contact) && contact[contactField] === location.name
          ? { ...contact, [contactField]: name }
          : contact,
      );
      renameFilterValue(`filter-${contactField}`, location.name, name);
    }
    return persistLocationChanges(previousState);
  };

  const deleteLocation = async (type, location) => {
    const contactField = type === "Region" ? "region" : "area";
    const scope = location.country;
    const assignedContacts = contacts.filter(
      (contact) =>
        contact.country === scope &&
        (type === "City"
          ? contact.city === location.name
          : contact[contactField] === location.name),
    );
    if (assignedContacts.length) {
      await NRVDialogs.alert(
        appText("location.deleteBlocked", `Cannot delete this ${type.toLowerCase()} while it has ${assignedContacts.length} assigned contact${assignedContacts.length === 1 ? "" : "s"}. Reassign those contacts first.`, { type: locationTypeDisplay(type), count: assignedContacts.length }),
      );
      return;
    }
    if (
      !await NRVDialogs.confirm(
        appText("location.deleteCityConfirm", `Delete ${type.toLowerCase()} "${location.name}"?`, { type: locationTypeDisplay(type), name: location.name }),
      )
    ) {
      return;
    }

    const previousState = cloneLocationState();
    const removeEntry = (list) =>
      list.filter(
        (item) => !(item.country === scope && item.name === location.name),
      );
    if (type === "City") {
      settings.cities = removeEntry(settings.cities);
      if (
        settings.defaultCity === location.name &&
        scope === settings.country
      ) {
        settings.defaultCity =
          locationNamesFor(settings.cities, settings.country)[0] || "";
        document.getElementById("setting-default-city").value =
          settings.defaultCity;
      }
    } else {
      const listKey = type === "Region" ? "regions" : "areas";
      settings[listKey] = removeEntry(settings[listKey]);
    }
    await persistLocationChanges(previousState);
  };

  // Passphrase panel: "menu" shows the Change / Turn Off choices; the other
  // modes show one flow at a time.
  let passphraseMode = "menu";
  const setPassphraseMode = (mode) => {
    passphraseMode = mode;
    const protectedNow = Boolean(cryptoMetadata);
    const show = (id, visible) => {
      document.getElementById(id).hidden = !visible;
    };
    const menu = mode === "menu";
    show("btn-start-turn-on", !protectedNow && menu);
    show("passphrase-choices", protectedNow && menu);
    show("change-passphrase-form", mode === "change" || mode === "turn-on");
    show("turn-off-explain", protectedNow && mode === "turn-off-explain");
    show("turn-off-passphrase-section", protectedNow && mode === "turn-off-confirm");
    show("recovery-code-section", protectedNow && menu);
    show("passphrase-section-description", menu);
    const title = document.getElementById("passphrase-section-title");
    title.textContent = protectedNow
      ? appText("security.isOn", "Passphrase is on")
      : mode === "turn-on"
        ? appText("security.turnOn", "Turn On Passphrase")
        : appText("security.isOff", "Passphrase is off");
    document.getElementById("change-passphrase-status").textContent = "";
    document.getElementById("turn-off-passphrase-status").textContent = "";
  };

  const updatePassphraseSection = () => {
    const protectedNow = Boolean(cryptoMetadata);
    document.getElementById("passphrase-section-description").textContent =
      protectedNow
        ? appText("security.onDescription", "A passphrase is on for this app copy. You may change it or turn it off.")
        : appText("security.offDescription", `A passphrase is optional. It locks the app so only you can open it; it does not back anything up. A passphrase is currently off. Turn it on to encrypt the data on this device; you will be asked for it each time you open the app. Use at least ${MIN_PASSPHRASE_LENGTH} characters. You will be given a recovery code to keep; without the passphrase or that code, the data cannot be opened.`, { count: MIN_PASSPHRASE_LENGTH });
    document.getElementById("current-passphrase-fields").hidden =
      !protectedNow;
    document.getElementById("current-passphrase").required = protectedNow;
    document.getElementById("btn-change-passphrase").textContent =
      protectedNow ? appText("security.change", "Change Passphrase") : appText("security.save", "Save Passphrase");
    document.getElementById("recovery-code-state").textContent =
      cryptoMetadata?.recovery
        ? appText("recovery.isSet", "A recovery code is set for this app copy. It is stored, locked, inside your backups too. If you lost the code, make a new one below.")
        : appText("recovery.notSet", "No recovery code is set yet. Make one now so a forgotten passphrase does not lock you out.");
    const keepStatus = [
      document.getElementById("change-passphrase-status").textContent,
      document.getElementById("turn-off-passphrase-status").textContent,
    ];
    setPassphraseMode("menu");
    // Keep a result message that was just written by a successful flow.
    document.getElementById("change-passphrase-status").textContent =
      keepStatus[0];
    document.getElementById("turn-off-passphrase-status").textContent =
      keepStatus[1];
  };
  updatePassphraseSection();
  // Clear old result messages once a settings section is closed.
  document.querySelectorAll(".settings-section").forEach((section) => {
    section.addEventListener("toggle", () => {
      if (section.open) {
        Array.from(section.parentElement.children).forEach((other) => {
          if (
            other !== section &&
            other.matches(".settings-section[open]")
          ) {
            other.open = false;
          }
        });
        return;
      }
      if (section.id === "defaults-your-details-section") {
        section.querySelectorAll("details[open]").forEach((child) => {
          child.open = false;
        });
      }
      section.querySelectorAll('[role="status"]').forEach((el) => {
        if (el.id.endsWith("-status")) el.textContent = "";
      });
    });
  });
  document
    .getElementById("btn-start-turn-on")
    .addEventListener("click", () => {
      setPassphraseMode("turn-on");
      document.getElementById("new-passphrase").focus();
    });
  document.getElementById("btn-show-change").addEventListener("click", () => {
    setPassphraseMode("change");
    document.getElementById("current-passphrase").focus();
  });
  document
    .getElementById("btn-show-turn-off")
    .addEventListener("click", () => setPassphraseMode("turn-off-explain"));
  document
    .getElementById("btn-turn-off-continue")
    .addEventListener("click", () => {
      setPassphraseMode("turn-off-confirm");
      document.getElementById("turn-off-current-passphrase").focus();
    });
  const backToPassphraseMenu = () => {
    document.getElementById("change-passphrase-form").reset();
    document.getElementById("turn-off-passphrase-form").reset();
    setPassphraseMode("menu");
  };
  [
    "btn-cancel-change-passphrase",
    "btn-turn-off-cancel",
    "btn-turn-off-confirm-cancel",
  ].forEach((id) =>
    document.getElementById(id).addEventListener("click", backToPassphraseMenu),
  );

  document
    .getElementById("recovery-code-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentInput = document.getElementById("recovery-current-passphrase");
      const submitButton = document.getElementById("btn-make-recovery-code");
      const status = document.getElementById("recovery-code-status");
      const appContainer = document.getElementById("app-container");
      let statusMessage = "";
      let newRecoveryCode = null;
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        const passphrase = await resolvePassphrase(
          currentInput.value,
          cryptoMetadata,
        );
        try {
          const key = await deriveEncryptionKey(passphrase, cryptoMetadata);
          await decryptValue(await readStoredValue(database, "settings"), key);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            appText("recovery.incorrectPassphrase", "The passphrase is incorrect. No recovery code was made."),
          );
        }
        const { metadata: newMetadata, recoveryCode } = await withRecoveryCode(
          cryptoMetadata,
          passphrase,
        );
        await writeStoredValues(database, [[ENCRYPTION_META_KEY, newMetadata]]);
        cryptoMetadata = newMetadata;
        newRecoveryCode = recoveryCode;
        document.getElementById("recovery-code-form").reset();
        statusMessage = appText("recovery.created", "New recovery code made. Any older recovery code no longer works.");
        updatePassphraseSection();
      } catch (error) {
        console.error("Unable to make a recovery code:", error);
        statusMessage =
          error.message || appText("recovery.createFailed", "Could not make a recovery code. Nothing was changed.");
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
      if (newRecoveryCode) await showRecoveryCodeDialog(newRecoveryCode);
    });

  document
    .getElementById("turn-off-passphrase-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentInput = document.getElementById("turn-off-current-passphrase");
      const submitButton = document.getElementById("btn-turn-off-passphrase");
      const status = document.getElementById("turn-off-passphrase-status");
      const appContainer = document.getElementById("app-container");
      let statusMessage = "";
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        if (
          !await NRVDialogs.confirm(
            appText("security.turnOffConfirm", "Turn off the passphrase? Your data on this device will be stored without encryption, and the app will open without asking for a passphrase. You can turn it on again later."),
          )
        ) {
          return;
        }
        let currentSettings;
        let currentContacts;
        let storedEncryptedSettings;
        let storedEncryptedContacts;
        try {
          const currentKey = await deriveEncryptionKey(
            await resolvePassphrase(currentInput.value, cryptoMetadata),
            cryptoMetadata,
          );
          [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
            readStoredValue(database, "settings"),
            readStoredValue(database, "contacts"),
          ]);
          [currentSettings, currentContacts] = await Promise.all([
            decryptValue(storedEncryptedSettings, currentKey),
            decryptValue(storedEncryptedContacts, currentKey),
          ]);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            appText("security.turnOffVerifyFailed", "The passphrase is incorrect, or the saved data could not be decrypted. Your data was not changed."),
          );
        }

        await replaceStoredValuesIfUnchanged(
          database,
          [
            ["settings", storedEncryptedSettings],
            ["contacts", storedEncryptedContacts],
            [ENCRYPTION_META_KEY, cryptoMetadata],
          ],
          [
            ["settings", currentSettings],
            ["contacts", currentContacts],
          ],
          [ENCRYPTION_META_KEY],
        );
        encryptionKey = null;
        cryptoMetadata = null;
        statusMessage = appText("security.turnedOff", "Passphrase turned off. The app will open without asking for one. Backups you export now will not be encrypted.");
        document.getElementById("turn-off-passphrase-form").reset();
        updatePassphraseSection();
      } catch (error) {
        console.error("Unable to turn off passphrase:", error);
        statusMessage =
          error.message === "Saved data changed during the passphrase update."
            ? appText("security.dataChangedTurnOff", "Your data changed during the update. No changes were made; please try again.")
            : error.message ||
              appText("security.turnOffFailed", "Could not turn off the passphrase. Your saved data was not changed.");
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
    });

  document
    .getElementById("change-passphrase-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentPassphrase = document.getElementById(
        "current-passphrase",
      );
      const newPassphrase = document.getElementById("new-passphrase");
      const confirmNewPassphrase = document.getElementById(
        "confirm-new-passphrase",
      );
      const submitButton = document.getElementById("btn-change-passphrase");
      const status = document.getElementById("change-passphrase-status");
      const appContainer = document.getElementById("app-container");
      const wasProtected = Boolean(cryptoMetadata);
      let statusMessage = "";
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        if (newPassphrase.value.length < MIN_PASSPHRASE_LENGTH) {
          throw new Error(
            appText("security.newMinLength", `Use a new passphrase with at least ${MIN_PASSPHRASE_LENGTH} characters.`, { count: MIN_PASSPHRASE_LENGTH }),
          );
        }
        if (newPassphrase.value !== confirmNewPassphrase.value) {
          throw new Error(appText("security.newMismatch", "The new passphrases do not match."));
        }
        if (cryptoMetadata && newPassphrase.value === currentPassphrase.value) {
          throw new Error(
            appText("security.newMustDiffer", "Choose a new passphrase that differs from the current one."),
          );
        }

        let currentSettings;
        let currentContacts;
        let storedEncryptedSettings;
        let storedEncryptedContacts;
        try {
          const currentKey = cryptoMetadata
            ? await deriveEncryptionKey(
                await resolvePassphrase(
                  currentPassphrase.value,
                  cryptoMetadata,
                ),
                cryptoMetadata,
              )
            : null;
          [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
            readStoredValue(database, "settings"),
            readStoredValue(database, "contacts"),
          ]);
          [currentSettings, currentContacts] = await Promise.all([
            decryptValue(storedEncryptedSettings, currentKey),
            decryptValue(storedEncryptedContacts, currentKey),
          ]);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            appText("security.currentVerifyFailed", "The current passphrase is incorrect, or the saved data could not be decrypted. Your data was not changed."),
          );
        }

        const baseMetadata = createCryptoMetadata();
        const newKey = await deriveEncryptionKey(
          newPassphrase.value,
          baseMetadata,
        );
        const { metadata: newMetadata, recoveryCode: newRecoveryCode } =
          await withRecoveryCode(baseMetadata, newPassphrase.value);
        const [newEncryptedSettings, newEncryptedContacts] = await Promise.all([
          encryptValue(currentSettings, newKey),
          encryptValue(currentContacts, newKey),
        ]);
        const [verifiedSettings, verifiedContacts] = await Promise.all([
          decryptValue(newEncryptedSettings, newKey),
          decryptValue(newEncryptedContacts, newKey),
        ]);
        if (
          JSON.stringify(verifiedSettings) !== JSON.stringify(currentSettings) ||
          JSON.stringify(verifiedContacts) !== JSON.stringify(currentContacts)
        ) {
          throw new Error(appText("security.verificationFailed", "Encrypted data verification did not match."));
        }

        await replaceStoredValuesIfUnchanged(
          database,
          [
            ["settings", storedEncryptedSettings],
            ["contacts", storedEncryptedContacts],
            [ENCRYPTION_META_KEY, cryptoMetadata],
          ],
          [
            ["settings", newEncryptedSettings],
            ["contacts", newEncryptedContacts],
            [ENCRYPTION_META_KEY, newMetadata],
          ],
        );
        encryptionKey = newKey;
        cryptoMetadata = newMetadata;
        statusMessage = wasProtected
          ? appText("security.changed", "Passphrase changed. Use the new passphrase next time you open this app copy. Your old recovery code no longer works; keep the new one.")
          : appText("security.turnedOn", "Passphrase turned on. You will be asked for it each time you open this app. Keep your recovery code safe; it is the only way back in if you forget the passphrase.");
        document.getElementById("change-passphrase-form").reset();
        updatePassphraseSection();
        await showRecoveryCodeDialog(newRecoveryCode);
      } catch (error) {
        console.error("Unable to change passphrase:", error);
        statusMessage =
          error.message === "Saved data changed during the passphrase update."
            ? appText("security.dataChanged", "Your data changed while the passphrase was being updated. No changes were made; please try again.")
            : error.message ||
              appText("security.changeFailed", "Could not change the passphrase. Your existing passphrase remains active and your saved data was not changed.");
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
    });

  // Helper: Calculate days between a timestamp and now
  const calculateDaysSince = (dateInput) => {
    if (!dateInput) return 0;
    const targetDate = new Date(dateInput);
    const now = new Date();
    const diffTime = now - targetDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Helper: Determine Color & Status based on Days Since Newest Visit
  const getContactStatus = (contact) => {
    let latestDate = contact.createdAt;
    if (contact.notesHistory && contact.notesHistory.length > 0) {
      const sortedNotes = [...contact.notesHistory].sort(
        (a, b) => new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      latestDate = sortedNotes[0].rawDate || sortedNotes[0].date;
    }
    const days = calculateDaysSince(latestDate);
    if (days >= 15)
      return { label: "Immediate", color: "#dc3545", class: "immediate", days };
    if (days >= 8)
      return { label: "Urgent", color: "#ffc107", class: "urgent", days };
    return { label: "Normal", color: "#28a745", class: "normal", days };
  };

  const getContactAreas = (contact) => (contact.area ? [contact.area] : []);

  const getStatusDisplay = (status) => {
    const labels = {
      Normal: appText("urgency.normal", "Normal"),
      Urgent: appText("urgency.urgent", "Urgent"),
      Immediate: appText("urgency.immediate", "Immediate"),
    };
    return labels[status.label] || status.label;
  };

  const getContactLocationSummary = (contact) =>
    [
      contact.city && appText("location.cityValue", `City: ${contact.city}`, { value: contact.city }),
      contact.region && appText("location.regionValue", `Region: ${contact.region}`, { value: contact.region }),
      contact.area && appText("location.areaValue", `Area: ${contact.area}`, { value: contact.area }),
    ]
      .filter(Boolean)
      .join(" · ") || appText("location.unassigned", "No city, region or area assigned");

  const updatePrintVisibleButton = () => {
    const count = visibleContacts.length;
    const printButton = document.getElementById("btn-print-visible");
    if (printButton) printButton.disabled = count === 0;
    const badge = document.querySelector("#btn-print-visible .nav-action-count");
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  };

  const toLocalDateTimeString = (dateObj) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  };

  // Initialize Main Leaflet Map
  let map = null;
  let mapMarkers = [];
  let homeMarker = null;
  let userLocationMarker = null;
  let userLocationAccuracy = null;
  let userLocationWatchId = null;
  let mapContactPoints = [];
  let cityPinRenderGeneration = 0;
  let lastCityPinLookupAt = 0;
  const cityPinCoordinates = new Map();
  const pendingCityPinLookups = new Map();
  const getHomePoint = () => {
    const lat = parseFloat(settings.me?.lat);
    const lng = parseFloat(settings.me?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  };
  const fitMapToContactPoints = () => {
    if (!map || !map.getContainer().offsetWidth) return;
    const points = [...mapContactPoints];
    const homeContact = {
      country: settings.me?.country || settings.country,
      state: settings.me?.state || "",
    };
    const home = isContactInMapLocation(homeContact)
      ? getHomePoint()
      : null;
    if (home) points.push(home);
    if (userLocationMarker) {
      const location = userLocationMarker.getLatLng();
      points.push([location.lat, location.lng]);
    }
    if (points.length === 1) {
      map.setView(points[0], 16);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), {
        padding: [50, 50],
        animate: false,
      });
    }
  };
  let lastDefaultCityCenterQuery = null;
  const defaultCityCoordinates = new Map();
  const pendingDefaultCityLookups = new Map();
  const getCityPinQuery = (contact) =>
    [
      contact.city.trim(),
      contact.area,
      contact.region,
      normalizeLocationState(
        contact.country || settings.country,
        contact.state || settings.state,
      ),
      contact.country || settings.country,
    ]
      .filter(Boolean)
      .join(", ");
  const getDefaultCityQuery = () => {
    const location = getMapLocationParts();
    return location.type === "division"
      ? [location.division, location.country].filter(Boolean).join(", ")
      : location.country;
  };

  const lookupCityPinCoordinates = async (query) => {
    if (cityPinCoordinates.has(query)) {
      return cityPinCoordinates.get(query);
    }
    let lookup = pendingCityPinLookups.get(query);
    if (!lookup) {
      lookup = (async () => {
        const delay = 1100 - (Date.now() - lastCityPinLookupAt);
        if (delay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        lastCityPinLookupAt = Date.now();
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.search = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "1",
        }).toString();
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`City lookup failed with status ${response.status}.`);
        }
        const results = await response.json();
        const latitude = Number(results[0]?.lat);
        const longitude = Number(results[0]?.lon);
        const location =
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
            ? [latitude, longitude]
            : null;
        cityPinCoordinates.set(query, location);
        return location;
      })();
      pendingCityPinLookups.set(query, lookup);
    }
    try {
      return await lookup;
    } finally {
      pendingCityPinLookups.delete(query);
    }
  };

  const centerMapOnDefaultCity = async () => {
    if (!map || mapMarkers.length > 0 || userLocationMarker) return;
    const query = getDefaultCityQuery();
    const displayLocation = getMapLocationLabel();
    if (query === lastDefaultCityCenterQuery) return;
    const status = document.getElementById("map-location-status");
    const cachedLocation = defaultCityCoordinates.get(query);
    if (cachedLocation) {
      map.setView(cachedLocation, getMapLocationParts().type === "division" ? 8 : 5);
      lastDefaultCityCenterQuery = query;
      status.textContent = appText(
        "map.scopeNoPins",
        `No contact pins to show for ${displayLocation}.`,
        { location: displayLocation },
      );
      return;
    }

    status.textContent = appText(
      "map.locatingScope",
      `Locating ${displayLocation}...`,
      { location: displayLocation },
    );
    try {
      let lookup = pendingDefaultCityLookups.get(query);
      if (!lookup) {
        lookup = (async () => {
          const url = new URL("https://nominatim.openstreetmap.org/search");
          url.search = new URLSearchParams({
            q: query,
            format: "jsonv2",
            limit: "1",
          }).toString();
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Default city lookup failed with status ${response.status}.`,
            );
          }
          const results = await response.json();
          const latitude = Number(results[0]?.lat);
          const longitude = Number(results[0]?.lon);
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            return null;
          }
          const location = [latitude, longitude];
          defaultCityCoordinates.set(query, location);
          return location;
        })();
        pendingDefaultCityLookups.set(query, lookup);
      }
      const location = await lookup;
      if (
        mapMarkers.length > 0 ||
        userLocationMarker ||
        query !== getDefaultCityQuery()
      )
        return;
      if (!location) {
        status.textContent = appText(
          "map.scopeNotFound",
          `Couldn't locate ${displayLocation}. Choose another Map Location or check your connection.`,
          { location: displayLocation },
        );
        return;
      }

      const zoom = getMapLocationParts().type === "division" ? 8 : 5;
      map.setView(location, zoom);
      lastDefaultCityCenterQuery = query;
      status.textContent = appText(
        "map.scopeNoPins",
        `No contact pins to show for ${displayLocation}.`,
        { location: displayLocation },
      );
    } catch (error) {
      if (
        mapMarkers.length > 0 ||
        userLocationMarker ||
        query !== getDefaultCityQuery()
      )
        return;
      console.error("Unable to locate the default city on the map:", error);
      status.textContent = appText(
        "map.scopeLookupFailed",
        `Couldn't locate ${displayLocation}. Check your connection or choose another Map Location.`,
        { location: displayLocation },
      );
    } finally {
      pendingDefaultCityLookups.delete(query);
    }
  };

  const initMap = () => {
    if (map) return;
    map = L.map("map", { doubleClickZoom: false }).setView(
      [0, 0],
      2,
    );
    localizeMapControls(map);
    map.createPane("userLocationPane");
    map.getPane("userLocationPane").style.zIndex = "650";
    window.mapInstance = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    // Wait a tick so the map knows its real size before fitting every pin.
    setTimeout(() => {
      map.invalidateSize();
      renderMapMarkers();
    }, 50);
  };

  const stopMapLocationWatch = () => {
    cityPinRenderGeneration += 1;
    if (userLocationWatchId !== null) {
      navigator.geolocation.clearWatch(userLocationWatchId);
      userLocationWatchId = null;
    }
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    if (userLocationAccuracy) {
      map.removeLayer(userLocationAccuracy);
      userLocationAccuracy = null;
    }
    document.getElementById("map-user-location-status").textContent = "";
  };

  const startMapLocationWatch = () => {
    const status = document.getElementById("map-user-location-status");
    if (!navigator.geolocation) {
      status.textContent = appText("map.locationUnsupported", "This browser does not support device location.");
      return;
    }
    if (userLocationWatchId !== null) return;
    status.textContent = appText("map.requestingLocation", "Requesting device location for the blue dot...");
    userLocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        if (currentViewId !== "map-view" || !map) return;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180
        ) {
          status.textContent = appText("map.invalidDeviceLocation", "The device returned an invalid location.");
          return;
        }
        const firstFix = !userLocationMarker;
        const location = [latitude, longitude];
        const reportedAccuracy = Number(position.coords.accuracy);
        const accuracyRadius = Number.isFinite(reportedAccuracy)
          ? Math.max(0, reportedAccuracy)
          : 0;
        if (!userLocationMarker) {
          userLocationAccuracy = L.circle(location, {
            pane: "userLocationPane",
            radius: accuracyRadius,
            color: "#1683ff",
            weight: 1,
            fillColor: "#1683ff",
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
          userLocationMarker = L.circleMarker(location, {
            pane: "userLocationPane",
            radius: 8,
            color: "#ffffff",
            weight: 3,
            fillColor: "#1683ff",
            fillOpacity: 1,
            className: "user-location-dot",
            interactive: false,
          }).addTo(map);
        } else {
          userLocationMarker.setLatLng(location);
          userLocationAccuracy.setLatLng(location);
          userLocationAccuracy.setRadius(accuracyRadius);
        }
        if (firstFix) fitMapToContactPoints();
        status.textContent = appText("map.liveLocation", "Your live location is shown by the blue dot.");
      },
      (error) => {
        if (currentViewId !== "map-view") return;
        console.error("Unable to get the live map location:", error);
        status.textContent =
          error.code === error.PERMISSION_DENIED
            ? appText("map.permissionDenied", "Location permission was denied. Allow location access to show your blue dot.")
            : appText("map.locationFailed", "Could not get your location. Check location services and try again.");
        if (error.code === error.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(userLocationWatchId);
          userLocationWatchId = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  const goalsData = () => settings.goalsAndMilestones;
  const goalDrafts = new Map();
  const goalId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const cloneGoalData = () => JSON.parse(JSON.stringify(goalsData()));
  const getGoalPathName = (goal) =>
    goal.pathId === "custom"
      ? goal.pathName || appText("goals.path.custom", "Create My Own Path")
      : appText(
          GOAL_PATHS[goal.pathId]?.nameKey || "goals.path.custom",
          goal.pathName || "Custom path",
        );
  const getGoalItemTitle = (item) => {
    if (item.customText) return item.customText;
    if (item.key === "participateAspect") {
      const methods = (item.selectedMethods || []).map((method) =>
        appText(GOAL_METHODS[method], method),
      );
      if (item.methodOtherText) methods.push(item.methodOtherText);
      const title = appText(GOAL_ITEM_KEYS[item.key], item.key);
      return methods.length
        ? `${title} — ${methods.join(", ")}`
        : title;
    }
    if (item.key === "durationTarget") {
      return appText("goals.durationTargetStep", "Duration target: {minutes} minutes", {
        minutes: item.durationMinutes,
      });
    }
    if (item.key === "durationDay") {
      const dayName = appText(
        `goals.day.${item.durationDay}`,
        item.durationDay,
      );
      return appText(
        "goals.dayDurationTargetStep",
        "{day} duration target: {minutes} minutes",
        { day: dayName, minutes: item.durationMinutes },
      );
    }
    if (item.key === "adjustedStep") {
      return appText("goals.adjustedStep", "Additional step {number}", {
        number: item.number,
      });
    }
    return appText(
      GOAL_ITEM_KEYS[item.key] || "",
      item.key || appText("goals.customStep", "Custom step"),
    );
  };
  const getGoalPeriodEnd = (startedAt, frequency, periodDays) => {
    if (periodDays > 0) {
      const end = new Date(startedAt);
      end.setDate(end.getDate() + periodDays);
      return end.toISOString();
    }
    if (!frequency) return null;
    const end = new Date(startedAt);
    if (frequency === "monthly") {
      const day = end.getDate();
      end.setDate(1);
      end.setMonth(end.getMonth() + 1);
      const lastDay = new Date(
        end.getFullYear(),
        end.getMonth() + 1,
        0,
      ).getDate();
      end.setDate(Math.min(day, lastDay));
    } else {
      end.setDate(end.getDate() + 7);
    }
    return end.toISOString();
  };
  const newGoalOccurrence = (goal, items = goal.items) => {
    const now = new Date().toISOString();
    const durationDays =
      goal.type === "recurring"
        ? 0
        : goal.periodDays;
    const periodEndsAt = getGoalPeriodEnd(
      now,
      goal.type === "recurring" ? goal.frequency : "",
      durationDays,
    );
    return {
      ...goal,
      id: goalId(),
      status: "active",
      createdAt: now,
      updatedAt: now,
      periodEndedAt: undefined,
      achievedAt: undefined,
      pausedFromStatus: undefined,
      pausedRemainingMs: undefined,
      periodEndsAt,
      items: items.map((item) => ({
        ...item,
        completed: false,
        completedAt: null,
      })),
    };
  };
  const saveGoalData = async (previous) => {
    settings.goalsAndMilestones = normalizeGoalsAndMilestones(goalsData());
    try {
      await saveSettings();
      return true;
    } catch (error) {
      settings.goalsAndMilestones = previous;
      await showStorageError("save goals and milestones", error);
      return false;
    }
  };
  const getGoalEncouragement = (goal, progress) => {
    if (!goalsData().encouragementEnabled || !progress.completed) return "";
    const range =
      progress.completed === 1 && progress.total <= 2 && progress.percent < 100
        ? "start"
        : progress.percent >= 100
        ? "done"
        : progress.percent >= 75
          ? "almost"
          : progress.percent >= 50
            ? "great"
            : progress.percent >= 25
              ? "progress"
              : "start";
    const hash = [...`${goal.id}:${progress.completed}`].reduce(
      (value, character) => value + character.charCodeAt(0),
      0,
    );
    return appText(
      `goals.encourage.${range}${(hash % 2) + 1}`,
      range === "done"
        ? "Goal achieved! Nice work!"
        : "Good progress! Keep going.",
    );
  };
  const getGoalRecordedMinutes = (goal, item) => {
    const tracking = settings.timeTracking;
    if (!tracking?.enabled) return 0;
    const start = goal.createdAt.slice(0, 10);
    const end = (goal.periodEndsAt || new Date().toISOString()).slice(0, 10);
    const dayCodes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return Math.floor(
      tracking.entries
        .filter((entry) => {
          if (entry.date < start || entry.date > end) return false;
          if (item.key !== "durationDay") return true;
          const day = dayCodes[new Date(`${entry.date}T12:00:00`).getDay()];
          return day === item.durationDay;
        })
        .reduce((sum, entry) => sum + Number(entry.seconds || 0), 0) / 60,
    );
  };
  const renderGoalPathOptions = () => {
    const container = document.getElementById("goals-path-options");
    container.innerHTML = Object.entries(GOAL_PATHS)
      .filter(([_id, path]) => path.selectable !== false)
      .map(
        ([id, path]) => `
          <label class="goals-path-option">
            <input type="checkbox" data-goal-path-choice="${id}">
            <span class="goals-path-icon" aria-hidden="true">${path.icon}</span>
            <span>${escapeHtml(appText(path.nameKey, id))}</span>
          </label>`,
      )
      .join("") +
      `<label class="goals-path-option">
        <input type="checkbox" data-goal-path-choice="custom">
        <span class="goals-path-icon" aria-hidden="true">🧭</span>
        <span>${escapeHtml(appText("goals.path.custom", "Create My Own Path"))}</span>
      </label>`;
  };
  const rememberGoalDrafts = () => {
    document
      .querySelectorAll("[data-goal-path-editor]")
      .forEach((editor) => {
        const pathId = editor.dataset.goalPathEditor;
        const existing = goalDrafts.get(pathId) || {};
        const customSteps = [...editor.querySelectorAll("[data-custom-step]")]
          .map((input) => ({
            text: input.value,
            included: Boolean(
              editor.querySelector(
                `[data-custom-step-choice="${input.dataset.customStep}"]`,
              )?.checked,
            ),
          }));
        const selectedItems = {};
        editor.querySelectorAll("[data-goal-item-choice]").forEach((input) => {
          selectedItems[input.dataset.goalItemChoice] = input.checked;
        });
        const selectedMethods = [
          ...editor.querySelectorAll("[data-goal-method-choice]:checked"),
        ].map((input) => input.dataset.goalMethodChoice);
        goalDrafts.set(pathId, {
          ...existing,
          type: editor.querySelector("[data-goal-type]")?.value || existing.type,
          frequency:
            editor.querySelector("[data-goal-frequency]")?.value ||
            existing.frequency,
          periodDays:
            editor.querySelector("[data-goal-period]")?.value ??
            existing.periodDays,
          durationMinutes:
            editor.querySelector("[data-goal-duration]")?.value ??
            existing.durationMinutes,
          dayDurations: Object.fromEntries(
            [...editor.querySelectorAll("[data-goal-day-duration]")].map(
              (input) => [input.dataset.goalDayDuration, input.value],
            ),
          ),
          selectedItems: {
            ...(existing.selectedItems || {}),
            ...selectedItems,
          },
          selectedMethods,
          methodOtherText:
            editor.querySelector("[data-goal-method-other]")?.value ??
            existing.methodOtherText ??
            "",
          customName:
            editor.querySelector("[data-custom-path-name]")?.value ||
            existing.customName ||
            "",
          customSteps:
            editor.querySelectorAll("[data-custom-step]").length
              ? customSteps
              : existing.customSteps || [],
        });
      });
  };
  const renderGoalPathEditors = () => {
    rememberGoalDrafts();
    const selected = [
      ...document.querySelectorAll("[data-goal-path-choice]:checked"),
    ].map((input) => input.dataset.goalPathChoice);
    const editors = document.getElementById("goals-path-editors");
    editors.innerHTML = selected
      .map((pathId) => {
        const definition = GOAL_PATHS[pathId];
        const draft = goalDrafts.get(pathId) || {};
        const type = draft.type || (definition?.type ?? "custom");
        const itemMarkup = (key) => {
          const checked =
            draft.selectedItems?.[key] !== undefined
              ? draft.selectedItems[key]
              : true;
          const methodOptions =
            key === "participateAspect"
              ? `<fieldset class="goals-method-picker" data-goal-methods-for="${key}" ${checked ? "" : "hidden"}>
                  <legend>${escapeHtml(appText("goals.methodPrompt", "Choose any applicable method(s)"))}</legend>
                  ${Object.entries(GOAL_METHODS)
                    .map(
                      ([method, translationKey]) => `
                        <label class="goals-method-option">
                          <input type="checkbox" data-goal-method-choice="${method}" ${draft.selectedMethods?.includes(method) ? "checked" : ""}>
                          <span>${escapeHtml(appText(translationKey, method))}</span>
                        </label>`,
                    )
                    .join("")}
                  <label class="goals-method-custom">
                    <span>${escapeHtml(appText("goals.methodOtherDetail", "Describe another method (optional)"))}</span>
                    <input type="text" maxlength="240" data-goal-method-other value="${escapeHtml(draft.methodOtherText || "")}">
                  </label>
                </fieldset>`
              : "";
          return `<div class="goals-milestone-option">
            <label class="goals-step-option">
            <input type="checkbox" data-goal-item-choice="${escapeHtml(key)}" ${checked ? "checked" : ""}>
            <span>${escapeHtml(appText(GOAL_ITEM_KEYS[key], key))}</span>
            </label>${methodOptions}</div>`;
        };
        const customName = draft.customName || "";
        const customSteps = draft.customSteps || [];
        const stepsMarkup =
          pathId === "custom"
            ? `<label>${escapeHtml(appText("goals.path.customName", "Name your path"))}
                <input type="text" maxlength="120" data-custom-path-name value="${escapeHtml(customName)}">
              </label>
              <fieldset class="goals-custom-steps">
                <legend>${escapeHtml(appText("goals.customSteps", "Add one suggested step per line"))}</legend>
                ${Array.from({ length: 6 }, (_unused, index) => {
                  const step = customSteps[index] || {};
                  return `<div class="goals-step-option">
                    <label>
                      <input type="checkbox" data-custom-step-choice="${index}" ${step.included ? "checked" : ""}>
                      <span>${escapeHtml(appText("goals.includeStep", "Include this step"))}</span>
                    </label>
                    <input type="text" maxlength="240" data-custom-step="${index}" aria-label="${escapeHtml(appText("goals.customStepNumber", "Custom step {number}", { number: index + 1 }))}" value="${escapeHtml(step.text || "")}">
                  </div>`;
                }).join("")}
              </fieldset>`
            : definition.items.map(itemMarkup).join("");
        const days = [
          ["mon", "Monday"],
          ["tue", "Tuesday"],
          ["wed", "Wednesday"],
          ["thu", "Thursday"],
          ["fri", "Friday"],
          ["sat", "Saturday"],
          ["sun", "Sunday"],
        ];
        return `<section class="goals-path-editor" data-goal-path-editor="${pathId}">
          <h3>${escapeHtml(appText(definition?.nameKey || "goals.path.custom", customName || "Create My Own Path"))}</h3>
          ${stepsMarkup}
          <label>${escapeHtml(appText("goals.goalType", "Goal type"))}
            <select data-goal-type aria-label="${escapeHtml(appText("goals.goalType", "Goal type"))}">
              ${["recurring", "target", "repeatable", "custom"].map((choice) =>
                `<option value="${choice}" ${type === choice ? "selected" : ""}>${escapeHtml(appText(`goals.type.${choice}`, choice))}</option>`,
              ).join("")}
            </select>
          </label>
          <div class="goals-frequency-field" ${type !== "recurring" ? "hidden" : ""}>
            <label>${escapeHtml(appText("goals.frequency", "Repeat every"))}
              <select data-goal-frequency aria-label="${escapeHtml(appText("goals.frequency", "Repeat every"))}">
                <option value="weekly" ${(draft.frequency || "weekly") === "weekly" ? "selected" : ""}>${escapeHtml(appText("goals.frequency.weekly", "Week"))}</option>
                <option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>${escapeHtml(appText("goals.frequency.monthly", "Month"))}</option>
              </select>
            </label>
          </div>
          <label class="goals-period-field" ${type === "recurring" ? "hidden" : ""}>${escapeHtml(appText("goals.periodDays", "Goal period in days (optional)"))}
            <input type="number" min="1" max="3660" inputmode="numeric" data-goal-period value="${escapeHtml(draft.periodDays || "")}">
          </label>
          <label>${escapeHtml(appText("goals.duration", "Optional duration target in minutes"))}
            <input type="number" min="1" max="1440" inputmode="numeric" data-goal-duration value="${escapeHtml(draft.durationMinutes || "")}">
          </label>
          <details class="goals-day-duration">
            <summary>${escapeHtml(appText("goals.durationByDay", "Optional duration targets by day"))}</summary>
            ${days.map(([day, fallback]) => `<label>${escapeHtml(appText(`goals.durationForDay`, "{day} duration target in minutes", { day: appText(`goals.day.${day}`, fallback) }))}<input type="number" min="1" max="1440" inputmode="numeric" data-goal-day-duration="${day}" value="${escapeHtml(draft.dayDurations?.[day] || "")}"></label>`).join("")}
          </details>
        </section>`;
      })
      .join("");
    const hasPath = selected.length > 0;
    document.getElementById("btn-create-goals").disabled = !hasPath;
  };
  const renderGoalAcknowledgement = () => {
    const notice = document.getElementById("goals-latest-notice");
    const acknowledgement = goalsData().latestAcknowledgement;
    notice.hidden = !acknowledgement || acknowledgement.dismissed;
    if (notice.hidden) return;
    const goal =
      goalsData().goals.find(
        (item) => item.id === acknowledgement.goalId,
      ) || {
        pathId: acknowledgement.pathId,
        pathName: acknowledgement.pathName,
      };
    const pathName = getGoalPathName(goal);
    document.getElementById("goals-latest-title").textContent =
      appText(
        acknowledgement.kind === "goal"
          ? "goals.goalAchieved"
          : "goals.milestoneReached",
        acknowledgement.kind === "goal" ? "Goal achieved" : "Milestone reached",
      );
    document.getElementById("goals-latest-message").textContent =
      acknowledgement.kind === "goal"
        ? appText("goals.achievementGoal", "You achieved your {goal} goal.", {
            goal: pathName,
          })
        : appText(
            "goals.achievementMilestone",
            "You've completed {count} steps on your {path} path.",
            { count: acknowledgement.count, path: pathName },
          );
  };
  const renderGoalCard = (goal, group) => {
    const pathName = getGoalPathName(goal);
    const progress = getGoalProgress(goal);
    const isReview = group === "review";
    const isAchieved = group === "history";
    const periodText =
      goal.periodEndsAt && !isAchieved
        ? appText(
            "goals.periodUntil",
            "Period through {date}",
            { date: new Date(goal.periodEndsAt).toLocaleDateString(document.documentElement.lang || undefined) },
          )
        : "";
    const itemList = goal.items
      .map((item) => {
        const title = getGoalItemTitle(item);
        const recordedMinutes =
          !item.completed &&
          item.durationMinutes &&
          settings.timeTracking?.enabled
            ? getGoalRecordedMinutes(goal, item)
            : 0;
        return `<li class="goals-step ${item.completed ? "completed" : ""}">
          <div><span class="goals-step-title">${escapeHtml(title)}</span>
          ${item.completedAt ? `<small>${escapeHtml(new Date(item.completedAt).toLocaleDateString(document.documentElement.lang || undefined))}</small>` : ""}
          ${recordedMinutes ? `<small>${escapeHtml(appText("goals.timeSuggestion", "{minutes} minutes recorded in Time in Service. Review the entries and mark this step complete if appropriate.", { minutes: recordedMinutes }))}</small>` : ""}
          ${item.durationMinutes && !settings.timeTracking?.enabled ? `<small>${escapeHtml(appText("goals.timeNotTracked", "Time in Service tracking is off. You can still mark this step complete yourself."))}</small>` : ""}
          </div>
          ${!item.completed && group === "active" ? `<button type="button" id="goal-item-${escapeHtml(goal.id)}-${escapeHtml(item.id)}" data-goal-action="complete" data-goal-id="${escapeHtml(goal.id)}" data-goal-item-id="${escapeHtml(item.id)}">${escapeHtml(appText("goals.markComplete", "Mark complete"))}</button>` : item.completed ? `<span class="goals-complete-mark" aria-label="${escapeHtml(appText("goals.completed", "Completed"))}">✓</span>` : ""}
        </li>`;
      })
      .join("");
    const statusMessage =
      progress.completed
        ? appText(
            goal.status === "achieved"
              ? "goals.progressAchieved"
              : "goals.progress",
            goal.status === "achieved"
              ? "{count} of {total} completed! Goal achieved!"
              : "{count} of {total} completed!",
            progress,
          )
        : appText("goals.stepsCount", "{count} steps", {
            count: progress.total,
            total: progress.total,
          });
    const encouragement = getGoalEncouragement(goal, progress);
    const reviewActions = isReview
      ? `<p>${escapeHtml(appText("goals.periodEnded", "This goal period has concluded."))}</p>
        ${encouragement ? `<p class="goals-encouragement">${escapeHtml(encouragement)}</p>` : ""}
        <p>${escapeHtml(appText("goals.continueQuestion", "Would you like to continue?"))}</p>
        <div class="goals-card-actions">
          <button type="button" data-goal-action="try-again" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.tryAgain", "Try Again"))}</button>
          <button type="button" data-goal-action="adjust-open" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.adjust", "Adjust Goal"))}</button>
          <button type="button" data-goal-action="pause" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.pause", "Pause for Now"))}</button>
        </div>
        <div class="goals-adjust-form" data-goal-adjust-form="${escapeHtml(goal.id)}" hidden>
          <label>${escapeHtml(appText("goals.newTarget", "New number of steps"))}
            <input type="number" min="1" max="100" value="${Math.max(1, progress.total)}" data-goal-new-target="${escapeHtml(goal.id)}">
          </label>
          <button type="button" data-goal-action="adjust-save" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.saveAdjustment", "Save adjusted goal"))}</button>
        </div>`
      : "";
    const actions = isAchieved
      ? `<button type="button" data-goal-action="set-again" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.setAgain", "Set Again"))}</button>`
      : group === "paused"
        ? `<button type="button" data-goal-action="resume" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.resume", "Resume"))}</button>
           <button type="button" data-goal-action="remove" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.remove", "Remove Goal"))}</button>`
        : group === "active"
          ? `<button type="button" data-goal-action="pause" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.pause", "Pause for Now"))}</button>
             <button type="button" data-goal-action="remove" data-goal-id="${escapeHtml(goal.id)}">${escapeHtml(appText("goals.remove", "Remove Goal"))}</button>`
          : "";
    return `<article class="goal-card" data-goal-card="${escapeHtml(goal.id)}">
      <header class="goal-card-header">
        <span class="goal-card-icon" aria-hidden="true">${GOAL_PATHS[goal.pathId]?.icon || "🧭"}</span>
        <h4>${escapeHtml(pathName)}</h4>
      </header>
      <p class="goal-progress" role="status" aria-live="polite" tabindex="-1">${escapeHtml(statusMessage)}</p>
      ${encouragement && !isReview ? `<p class="goals-encouragement">${escapeHtml(encouragement)}</p>` : ""}
      ${periodText ? `<p class="goal-period">${escapeHtml(periodText)}</p>` : ""}
      <ol class="goals-step-list">${itemList}</ol>
      ${reviewActions}
      ${actions ? `<div class="goals-card-actions">${actions}</div>` : ""}
    </article>`;
  };
  const renderGoalsView = async () => {
    const expired = goalsData().goals.filter(
      (goal) =>
        goal.status === "active" &&
        goal.periodEndsAt &&
        Date.parse(goal.periodEndsAt) <= Date.now() &&
        getGoalProgress(goal).completed < goal.items.length,
    );
    if (expired.length) {
      const previous = cloneGoalData();
      const now = new Date().toISOString();
      expired.forEach((goal) => {
        goal.status = "review";
        goal.periodEndedAt = now;
        goal.updatedAt = now;
      });
      await saveGoalData(previous);
    }
    const groups = {
      active: document.getElementById("goals-active-list"),
      paused: document.getElementById("goals-paused-list"),
      review: document.getElementById("goals-review-list"),
      history: document.getElementById("goals-history-list"),
    };
    Object.entries(groups).forEach(([group, container]) => {
      const goals = goalsData()
        .goals.filter((goal) =>
          group === "history"
            ? goal.status === "achieved"
            : goal.status === group,
        )
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      container.innerHTML = goals.length
        ? goals.map((goal) => renderGoalCard(goal, group)).join("")
        : `<p class="goals-empty">${escapeHtml(appText("goals.noGoals", "No goals here yet."))}</p>`;
    });
    renderGoalAcknowledgement();
  };
  const readGoalDraft = (pathId) => {
    const editor = document.querySelector(
      `[data-goal-path-editor="${pathId}"]`,
    );
    if (!editor) return null;
    const definition = GOAL_PATHS[pathId];
    const type = editor.querySelector("[data-goal-type]").value;
    let pathName = "";
    let items = [];
    if (pathId === "custom") {
      pathName = editor.querySelector("[data-custom-path-name]").value.trim();
      const customSteps = [...editor.querySelectorAll("[data-custom-step]")]
        .filter(
          (input) =>
            editor.querySelector(
              `[data-custom-step-choice="${input.dataset.customStep}"]`,
            ).checked && input.value.trim(),
        )
        .map((input) => ({
          id: `step-${input.dataset.customStep}`,
          customText: input.value.trim(),
          completed: false,
          completedAt: null,
          durationMinutes: 0,
        }));
      items = customSteps;
    } else {
      items = definition.items
        .filter((key) =>
          editor.querySelector(`[data-goal-item-choice="${key}"]`).checked,
        )
        .map((key) => {
          const item = {
            id: key,
            key,
            completed: false,
            completedAt: null,
            durationMinutes: 0,
          };
          if (key === "participateAspect") {
            item.selectedMethods = [
              ...editor.querySelectorAll("[data-goal-method-choice]:checked"),
            ].map((input) => input.dataset.goalMethodChoice);
            item.methodOtherText =
              editor.querySelector("[data-goal-method-other]")?.value.trim() ||
              "";
          }
          return item;
        });
    }
    const durationMinutes = Math.round(
      Number(editor.querySelector("[data-goal-duration]").value) || 0,
    );
    if (durationMinutes) {
      items.push({
        id: "duration-target",
        key: "durationTarget",
        completed: false,
        completedAt: null,
        durationMinutes,
      });
    }
    const dayDurations = {};
    editor.querySelectorAll("[data-goal-day-duration]").forEach((input) => {
      const minutes = Math.round(Number(input.value) || 0);
      if (!minutes) return;
      const day = input.dataset.goalDayDuration;
      dayDurations[day] = minutes;
      items.push({
        id: `duration-${day}`,
        key: "durationDay",
        durationDay: day,
        completed: false,
        completedAt: null,
        durationMinutes: minutes,
      });
    });
    const frequency =
      editor.querySelector("[data-goal-frequency]")?.value || "weekly";
    const enteredPeriodDays = Math.min(
      3660,
      Math.max(0, Math.round(Number(editor.querySelector("[data-goal-period]").value) || 0)),
    );
    const periodDays =
      type === "recurring"
        ? frequency === "monthly"
          ? 0
          : 0
        : enteredPeriodDays;
    return {
      pathId,
      pathName,
      type,
      frequency,
      periodDays,
      durationMinutes,
      dayDurations,
      items,
    };
  };
  const addSelectedGoals = async () => {
    const selected = [
      ...document.querySelectorAll("[data-goal-path-choice]:checked"),
    ].map((input) => input.dataset.goalPathChoice);
    if (!selected.length) {
      document.getElementById("goals-status").textContent = appText(
        "goals.selectPath",
        "Choose at least one path.",
      );
      return;
    }
    const invalidField = selected
      .map((pathId) =>
        document
          .querySelector(`[data-goal-path-editor="${pathId}"]`)
          ?.querySelector('input[type="number"]:invalid'),
      )
      .find(Boolean);
    if (invalidField) {
      invalidField.reportValidity();
      invalidField.focus();
      return;
    }
    const drafts = selected.map(readGoalDraft);
    const invalid = drafts.find((draft) => {
      if (draft.pathId === "custom" && !draft.pathName) return "name";
      if (draft.pathId === "custom" && !draft.items.some((item) => item.customText)) return "step";
      if (!draft.items.length) return "item";
      return "";
    });
    if (invalid) {
      document.getElementById("goals-status").textContent = appText(
        invalid.pathId === "custom" && !invalid.pathName
          ? "goals.customNameRequired"
          : invalid.pathId === "custom"
            ? "goals.customStepRequired"
            : "goals.selectStep",
        invalid.pathId === "custom" && !invalid.pathName
          ? "Enter a name for your custom path."
          : invalid.pathId === "custom"
            ? "Add at least one step to your custom path."
            : "Include at least one step or duration target for each path.",
      );
      return;
    }
    const previous = cloneGoalData();
    const now = new Date().toISOString();
    drafts.forEach((draft) => {
      const editor = document.querySelector(
        `[data-goal-path-editor="${draft.pathId}"]`,
      );
      const frequency = draft.frequency;
      const recurringDays =
        draft.type === "recurring"
          ? frequency === "monthly"
            ? 30
            : 7
          : draft.periodDays;
      const periodDays = recurringDays;
      const goal = {
        id: goalId(),
        pathId: draft.pathId,
        pathName: draft.pathName,
        type: draft.type,
        status: "active",
        frequency,
        periodDays,
        periodEndsAt: getGoalPeriodEnd(
          now,
          draft.type === "recurring" ? frequency : "",
          draft.type === "recurring" ? 0 : periodDays,
        ),
        durationMinutes: draft.durationMinutes,
        dayDurations: draft.dayDurations,
        createdAt: now,
        updatedAt: now,
        items: draft.items,
      };
      settings.goalsAndMilestones.goals.unshift(goal);
    });
    if (!(await saveGoalData(previous))) return;
    document
      .querySelectorAll("[data-goal-path-choice]")
      .forEach((input) => (input.checked = false));
    goalDrafts.clear();
    renderGoalPathEditors();
    document.getElementById("goals-status").textContent = "";
    await renderGoalsView();
  };
  const completeGoalItem = async (goal, item) => {
    const previous = cloneGoalData();
    item.completed = true;
    item.completedAt = new Date().toISOString();
    goal.updatedAt = item.completedAt;
    const progress = getGoalProgress(goal);
    const achieved = progress.total > 0 && progress.completed === progress.total;
    if (achieved) {
      goal.status = "achieved";
      goal.achievedAt = item.completedAt;
    }
    settings.goalsAndMilestones.latestAcknowledgement = {
      id: goalId(),
      goalId: goal.id,
      kind: achieved ? "goal" : "milestone",
      pathId: goal.pathId,
      pathName: goal.pathName,
      itemKey: item.key || "",
      itemText: item.customText || "",
      count: progress.completed,
      total: progress.total,
      dismissed: false,
      at: item.completedAt,
    };
    if (!(await saveGoalData(previous))) return false;
    return true;
  };
  const handleGoalAction = async (event) => {
    const button = event.target.closest("[data-goal-action]");
    if (!button) return;
    const action = button.dataset.goalAction;
    const goal = goalsData().goals.find(
      (entry) => entry.id === button.dataset.goalId,
    );
    if (!goal) return;
    if (action === "adjust-open") {
      const form = document.querySelector(
        `[data-goal-adjust-form="${goal.id}"]`,
      );
      form.hidden = false;
      form.querySelector("input").focus();
      return;
    }
    if (action === "remove") {
      if (
        !await NRVDialogs.confirm(
          appText(
            "goals.removeConfirm",
            "Remove this goal and its current progress? Completed achievements remain in history.",
          ),
        )
      ) {
        button.focus();
        return;
      }
    }
    const previous = cloneGoalData();
    const now = new Date().toISOString();
    if (action === "complete") {
      const item = goal.items.find(
        (entry) => entry.id === button.dataset.goalItemId,
      );
      if (!item || item.completed) return;
      if (!(await completeGoalItem(goal, item))) return;
    } else if (action === "pause") {
      goal.pausedFromStatus = goal.status;
      goal.status = "paused";
      goal.updatedAt = now;
      if (goal.pausedFromStatus === "active" && goal.periodEndsAt) {
        goal.pausedRemainingMs = Math.max(
          0,
          Date.parse(goal.periodEndsAt) - Date.now(),
        );
      }
    } else if (action === "resume") {
      goal.status =
        goal.pausedFromStatus === "review" ? "review" : "active";
      goal.updatedAt = now;
      if (goal.status === "active") {
        const remainingMs = Math.max(
          0,
          Number(goal.pausedRemainingMs) || 0,
        );
        goal.periodEndsAt = goal.periodEndsAt
          ? new Date(Date.now() + remainingMs).toISOString()
          : getGoalPeriodEnd(
              now,
              goal.type === "recurring" ? goal.frequency : "",
              goal.type === "recurring" ? 0 : goal.periodDays,
            );
      }
      delete goal.pausedFromStatus;
      delete goal.pausedRemainingMs;
    } else if (action === "try-again" || action === "set-again") {
      const next = newGoalOccurrence(goal);
      delete next.achievedAt;
      delete next.periodEndedAt;
      settings.goalsAndMilestones.goals.unshift(next);
    } else if (action === "adjust-save") {
      const targetInput = document.querySelector(
        `[data-goal-new-target="${goal.id}"]`,
      );
      if (!targetInput.checkValidity()) {
        targetInput.reportValidity();
        targetInput.focus();
        return;
      }
      const target = Math.min(
        100,
        Math.max(
          1,
          Math.round(Number(targetInput.value)),
        ),
      );
      const adjustedItems = goal.items
        .filter((item) => item.key !== "durationTarget" && item.key !== "durationDay")
        .slice(0, target);
      while (adjustedItems.length < target) {
        adjustedItems.push({
          id: `adjusted-step-${adjustedItems.length + 1}`,
          key: "adjustedStep",
          number: adjustedItems.length + 1,
          completed: false,
          completedAt: null,
          durationMinutes: 0,
        });
      }
      const next = newGoalOccurrence(goal, adjustedItems);
      next.durationMinutes = 0;
      next.dayDurations = {};
      delete next.achievedAt;
      delete next.periodEndedAt;
      settings.goalsAndMilestones.goals.unshift(next);
      document.getElementById("goals-status").textContent = appText(
        "goals.adjustedNotice",
        "A new goal occurrence was created. Previous progress remains in history.",
      );
    } else if (action === "remove") {
      settings.goalsAndMilestones.deletedGoalIds.push(goal.id);
      settings.goalsAndMilestones.goals =
        settings.goalsAndMilestones.goals.filter(
          (entry) => entry.id !== goal.id,
        );
    } else {
      return;
    }
    if (action !== "complete" && !(await saveGoalData(previous))) return;
    const focusId = button.id;
    await renderGoalsView();
    if (focusId && document.getElementById(focusId)) {
      document.getElementById(focusId).focus();
    } else {
      const progressStatus = document.querySelector(
        `[data-goal-card="${goal.id}"] .goal-progress`,
      );
      if (progressStatus) progressStatus.focus();
      else document.getElementById("goals-active-title").focus();
    }
  };
  renderGoalPathOptions();
  renderGoalPathEditors();
  document
    .getElementById("goals-path-options")
    .addEventListener("change", renderGoalPathEditors);
  document
    .getElementById("goals-path-editors")
    .addEventListener("input", (event) => {
      if (event.target.matches("[data-custom-step]")) {
        const editor = event.target.closest("[data-goal-path-editor]");
        const choice = editor.querySelector(
          `[data-custom-step-choice="${event.target.dataset.customStep}"]`,
        );
        if (event.target.value.trim()) choice.checked = true;
      }
    });
  document
    .getElementById("goals-path-editors")
    .addEventListener("change", (event) => {
      const editor = event.target.closest("[data-goal-path-editor]");
      if (editor && event.target.matches("[data-goal-item-choice]")) {
        const methodPicker = editor.querySelector(
          `[data-goal-methods-for="${event.target.dataset.goalItemChoice}"]`,
        );
        if (methodPicker) methodPicker.hidden = !event.target.checked;
      }
      if (
        editor &&
        event.target.matches("[data-goal-type]")
      ) {
        const frequency = editor.querySelector(".goals-frequency-field");
        const period = editor.querySelector(".goals-period-field");
        frequency.hidden = event.target.value !== "recurring";
        period.hidden = event.target.value === "recurring";
      }
    });
  document
    .getElementById("btn-create-goals")
    .addEventListener("click", addSelectedGoals);
  ["goals-active-list", "goals-paused-list", "goals-review-list", "goals-history-list"]
    .forEach((id) =>
      document
        .getElementById(id)
        .addEventListener("click", handleGoalAction),
    );
  document
    .getElementById("settings-goals-encouragement")
    .addEventListener("change", async (event) => {
      const previous = cloneGoalData();
      settings.goalsAndMilestones.encouragementEnabled = event.target.checked;
      if (!(await saveGoalData(previous))) {
        event.target.checked =
          settings.goalsAndMilestones.encouragementEnabled;
        return;
      }
      await renderGoalsView();
    });
  document
    .getElementById("btn-dismiss-goals-notice")
    .addEventListener("click", async () => {
      const previous = cloneGoalData();
      if (settings.goalsAndMilestones.latestAcknowledgement) {
        settings.goalsAndMilestones.latestAcknowledgement.dismissed = true;
      }
      if (await saveGoalData(previous)) renderGoalAcknowledgement();
    });
  document
    .getElementById("btn-view-goals")
    .addEventListener("click", async () => await navigateToView("goals-view"));
  document.getElementById("settings-goals-encouragement").checked =
    goalsData().encouragementEnabled;

  // Navigation & Dynamic Footer
  let currentViewId = "contacts-view";
  const navButtonsConfig = [
    { id: "contacts-view", icon: "👥" },
    { id: "map-view", icon: "map" },
    { id: "time-view", icon: "⏱️" },
    { id: "settings-view", icon: "⚙️" },
  ];

  const getPageActions = () => {
    if (currentViewId === "contacts-view") {
      return [
        {
          id: "btn-print-visible",
          icon: "print",
          title: appText("print.contactsShown", "Print the contacts shown"),
          onClick: async () => await printVisibleContacts(),
        },
      ];
    }
    if (currentViewId === "map-view") {
      return [
        {
          id: "btn-print-map",
          icon: "print",
          title: appText("print.mapContacts", "Print the map contacts"),
          onClick: async () => await requestMapPrint(),
        },
      ];
    }
    if (currentViewId === "settings-view") {
      return [
        {
          id: "btn-print-settings",
          icon: "print",
          title: appText("print.settings", "Print all settings"),
          onClick: async () => await printSettings(),
        },
      ];
    }
    return [];
  };

  const updateHeaderTitle = () => {
    const names = {
      "contacts-view": appText("view.contacts", "Contacts"),
      "map-view": appText("view.map", "Map"),
      "time-view": appText("view.time", "Time"),
      "goals-view": appText("goals.title", "Goals & Milestones"),
      "settings-view": appText("settings.title", "Settings"),
    };
    const contactModal = document.getElementById("contact-modal");
    const modalOpen =
      contactModal && contactModal.style.display === "flex";
    const name = document.body.classList.contains("install-setup-in-progress")
      ? appText("view.install", "Install")
      : modalOpen
        ? document.getElementById("modal-title").textContent
        : names[currentViewId] || appText("view.contacts", "Contacts");
    const h1 = document.getElementById("app-title");
    if (h1) h1.textContent = `NRV - ${name}`;
    const versionBadge = document.getElementById("app-version-badge");
    if (versionBadge) {
      const versionLabel = document.getElementById("app-version-label");
      const updateIndicator = document.getElementById(
        "app-version-update-indicator",
      );
      if (versionLabel) versionLabel.textContent = `v${APP_VERSION}`;
      if (updateIndicator) updateIndicator.hidden = !appUpdateAvailable;
      updatePublicVersionLink(versionBadge);
      versionBadge.setAttribute(
        "aria-label",
        appUpdateAvailable
          ? appText(
              "app.versionUpdateLinkLabel",
              "Version {version}. An update is ready. What's new?",
              { version: APP_VERSION },
            )
          : appText("app.versionLinkLabel", "Version {version}. What's new?", {
              version: APP_VERSION,
            }),
      );
    }
  };

  const setupNextStepsDialog = document.getElementById(
    "setup-next-steps-dialog",
  );
  const setupNextStepsNotice = document.getElementById(
    "setup-next-steps-notice",
  );
  const notifySetupSaveFailure = async () =>
    await NRVDialogs.alert(
      appText("setup.saveDeviceProgressFailed", "We could not save your setup progress on this device. Check device storage and try again."),
    );
  const showSetupNextStepsIfReady = () => {
    try {
      if (
        localStorage.getItem("return_visits_setup_pending") === "true" &&
        !setupNextStepsNotice.hidden
      ) {
        setupNextStepsDialog.showModal();
      }
    } catch (error) {
      console.error("Unable to read the first-use setup status:", error);
    }
  };
  document
    .getElementById("btn-setup-add-first-contact")
    .addEventListener("click", async () => {
      if (!markInstalledSetupComplete()) {
        await notifySetupSaveFailure();
        return;
      }
      setupNextStepsDialog.close();
      setupNextStepsNotice.hidden = true;
      try {
        localStorage.removeItem("return_visits_setup_pending");
      } catch (error) {
        console.error("Unable to save the setup status:", error);
      }
      document.body.classList.remove("install-setup-in-progress");
      document.getElementById("btn-open-modal").click();
    });
  document
    .getElementById("btn-setup-add-more-details")
    .addEventListener("click", () => {
      setupNextStepsDialog.close();
      document
        .querySelector('#bottom-nav .nav-btn[title^="settings"]')
        ?.click();
      const detailsHeading = document.getElementById("your-details-heading");
      if (detailsHeading) {
        document.getElementById("defaults-your-details-section").open = true;
        document.getElementById("your-details-section").open = true;
        detailsHeading.scrollIntoView({ block: "start" });
      }
    });
  document
    .getElementById("btn-setup-continue-later")
    .addEventListener("click", async () => {
      if (!markInstalledSetupComplete()) {
        await notifySetupSaveFailure();
        return;
      }
      setupNextStepsNotice.hidden = true;
      try {
        localStorage.removeItem("return_visits_setup_pending");
      } catch (error) {
        console.error("Unable to save the setup status:", error);
      }
      document.body.classList.remove("install-setup-in-progress");
    });

  const renderBottomNav = () => {
    const pageNames = {
      "contacts-view": appText("view.contacts", "Contacts"),
      "map-view": appText("view.map", "Map"),
      "time-view": appText("view.time", "Time"),
      "goals-view": appText("goals.title", "Goals & Milestones"),
      "settings-view": appText("settings.title", "Settings"),
    };
    document.title = `NRV - ${pageNames[currentViewId] || appText("view.contacts", "Contacts")}`;
    if (document.body.classList.contains("install-setup-in-progress")) {
      document.title = "NRV-Install";
    }
    updateHeaderTitle();
    document.body.classList.toggle(
      "settings-open",
      currentViewId === "settings-view",
    );
    document.body.classList.toggle(
      "goals-view-open",
      currentViewId === "goals-view",
    );
    const navContainer = document.getElementById("bottom-nav");
    navContainer.innerHTML = "";
    getPageActions().forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = action.id;
      btn.className = "nav-btn nav-action";
      btn.title = action.title;
      btn.setAttribute("aria-label", action.title);
      btn.innerHTML = `<span class="nav-btn-icon" aria-hidden="true">${iconSvg(action.icon)}</span><span class="nav-action-count" hidden></span>`;
      btn.addEventListener("click", action.onClick);
      navContainer.appendChild(btn);
    });
    updatePrintVisibleButton();
    const timeTracking = settings.timeTracking;
    navButtonsConfig.forEach((btnConfig) => {
      if (btnConfig.id === "time-view" && !timeTracking.enabled) return;
      if (btnConfig.id !== currentViewId) {
        const btn = document.createElement("button");
        btn.className = "nav-btn";
        const icon = document.createElement("span");
        icon.className = "nav-btn-icon";
        icon.setAttribute("aria-hidden", "true");
        if (btnConfig.id === "map-view") {
          icon.classList.add("nav-map-icon");
          icon.innerHTML = iconSvg(btnConfig.icon);
        } else {
          const glyph = document.createElement("span");
          glyph.className = "nav-glyph";
          glyph.textContent = btnConfig.icon;
          icon.appendChild(glyph);
        }
        btn.appendChild(icon);
        btn.title = btnConfig.id.replace("-view", "");
        const navLabels = {
          "contacts-view": appText("view.contacts", "Contacts"),
          "map-view": appText("view.map", "Map"),
          "time-view": appText("view.time", "Time"),
          "settings-view": appText("settings.title", "Settings"),
        };
        btn.setAttribute("aria-label", navLabels[btnConfig.id]);
        btn.title = navLabels[btnConfig.id];
        btn.dataset.view = btnConfig.id;
        if (btnConfig.id === "map-view") btn.title = navLabels[btnConfig.id];
        if (btnConfig.id === "time-view" && timeTracking.runningSince) {
          btn.title = "Time — timer running";
          btn.setAttribute("aria-label", appText("time.timerRunning", "Time, timer running"));
          const dot = document.createElement("span");
          dot.className = "nav-timer-dot";
          dot.setAttribute("aria-hidden", "true");
          icon.appendChild(dot);
        }
        if (btnConfig.id === "settings-view" && appUpdateAvailable) {
          btn.title = "Settings — app update available";
          btn.setAttribute("aria-label", appText("settings.updateAvailable", "Settings, app update available"));
          const badge = document.createElement("span");
          badge.className = "nav-update-badge";
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = "!";
          icon.appendChild(badge);
        }
        btn.addEventListener("click", () => navigateToView(btnConfig.id));
        navContainer.appendChild(btn);
      }
    });
  };
  const navigateToView = async (viewId) => {
    if (currentViewId === "settings-view" && !(await confirmLeaveSettings())) {
      return;
    }
    if (currentViewId === "map-view") stopMapLocationWatch();
    if (currentViewId === "settings-view") {
      document
        .querySelectorAll("#settings-view details[open]")
        .forEach((section) => {
          section.open = false;
        });
    }
    const previousViewId = currentViewId;
    currentViewId = viewId;
    setMapFilterPlacement(currentViewId === "map-view");
    if (currentViewId === "settings-view") discardDefaultsAndDetails();
    document
      .querySelectorAll(".view")
      .forEach((view) => view.classList.remove("active"));
    document.getElementById(currentViewId).classList.add("active");
    renderBottomNav();
    if (currentViewId === "settings-view" && appUpdateAvailable) {
      document
        .getElementById("app-update-notice")
        .closest("details").open = true;
      appUpdatePromptDismissed = false;
      appUpdatePromptHandler?.();
    }

    if (currentViewId === "time-view") renderTimeView();
    if (currentViewId === "goals-view") await renderGoalsView();
    if (currentViewId === "contacts-view") renderGoalAcknowledgement();

    if (currentViewId === "contacts-view" && previousViewId !== "settings-view") {
      showSetupNextStepsIfReady();
    }

    if (currentViewId === "map-view") {
      if (!map) {
        initMap();
      } else {
        setTimeout(() => {
          map.invalidateSize();
          renderMapMarkers();
        }, 50);
      }
      startMapLocationWatch();
    }
  };
  document
    .getElementById("btn-open-goals")
    .addEventListener("click", async () => await navigateToView("goals-view"));
  renderBottomNav();

  // ---- Time in Service ----
  const MONTHLY_GOAL_SECONDS = 50 * 3600;
  const YEARLY_GOAL_SECONDS = 600 * 3600;
  const pad2 = (number) => String(number).padStart(2, "0");
  const toDateKey = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const formatHours = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 3600)}:${pad2(Math.floor((whole % 3600) / 60))}`;
  };
  const formatClock = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${formatHours(whole)}:${pad2(whole % 60)}`;
  };
  const splitByDay = (startMs, endMs) => {
    const parts = [];
    let cursor = startMs;
    while (cursor < endMs) {
      const day = new Date(cursor);
      const nextMidnight = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate() + 1,
      ).getTime();
      const stop = Math.min(nextMidnight, endMs);
      parts.push({ date: toDateKey(day), seconds: (stop - cursor) / 1000 });
      cursor = stop;
    }
    return parts;
  };
  const getTimeTotals = () => {
    const tracking = settings.timeTracking;
    const now = new Date();
    const todayKey = toDateKey(now);
    const monthPrefix = todayKey.slice(0, 7);
    const serviceYearStart =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const yearFrom = `${serviceYearStart}-09-01`;
    const yearTo = `${serviceYearStart + 1}-09-01`;
    const running = tracking.runningSince
      ? splitByDay(Date.parse(tracking.runningSince), now.getTime())
      : [];
    const totals = { today: 0, month: 0, year: 0, serviceYearStart, now };
    [...tracking.entries, ...running].forEach((entry) => {
      if (entry.date === todayKey) totals.today += entry.seconds;
      if (entry.date.startsWith(monthPrefix)) totals.month += entry.seconds;
      if (entry.date >= yearFrom && entry.date < yearTo) {
        totals.year += entry.seconds;
      }
    });
    return totals;
  };
  const timeToggleButton = document.getElementById("btn-time-toggle");
  const timeEntryForm = document.getElementById("time-entry-form");
  let editingTimeEntryId = null;

  const updateTimeToggle = () => {
    const tracking = settings.timeTracking;
    timeToggleButton.hidden = !tracking.enabled;
    timeToggleButton.classList.toggle("running", Boolean(tracking.runningSince));
    timeToggleButton.textContent = tracking.runningSince ? "Stop Time" : "Start Time";
    timeToggleButton.setAttribute(
      "aria-label",
      tracking.runningSince
        ? "Stop timer. Time is being counted."
        : "Start timer. Time is not being counted.",
    );
  };

  const renderTimeSummary = () => {
    const tracking = settings.timeTracking;
    const totals = getTimeTotals();
    updateTimeToggle();
    document.getElementById("time-today").textContent = formatClock(totals.today);
    const renderGoal = (prefix, shown, done, goal, label) => {
      document.getElementById(`time-${prefix}-summary`).hidden = !shown;
      document.getElementById(`time-${prefix}-label`).textContent = label;
      document.getElementById(`time-${prefix}-text`).textContent =
        `${formatHours(done)} of ${goal / 3600} hrs • ${formatHours(Math.max(0, goal - done))} to go`;
      document.getElementById(`time-${prefix}-bar`).value = Math.min(
        100,
        (done / goal) * 100,
      );
    };
    renderGoal(
      "month",
      tracking.showMonthly,
      totals.month,
      MONTHLY_GOAL_SECONDS,
      totals.now.toLocaleString(undefined, { month: "long", year: "numeric" }),
    );
    renderGoal(
      "year",
      tracking.showYearly,
      totals.year,
      YEARLY_GOAL_SECONDS,
      `Service year ${totals.serviceYearStart}–${totals.serviceYearStart + 1}`,
    );
  };

  const renderTimeEntries = () => {
    const list = document.getElementById("time-entries");
    const entries = [...settings.timeTracking.entries]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 60);
    list.innerHTML = "";
    if (!entries.length) {
      list.innerHTML = "<p>No time recorded yet.</p>";
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "time-entry";
      const [year, month, day] = entry.date.split("-").map(Number);
      const label = new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const text = document.createElement("span");
      text.textContent = `${label} — ${formatHours(entry.seconds)}${entry.note ? ` — ${entry.note}` : ""}`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn-icon";
      edit.textContent = "✏️";
      edit.title = appText("time.editEntry", "Edit this time");
      edit.addEventListener("click", () => startEditingTimeEntry(entry.id));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-icon delete";
      remove.textContent = "🗑️";
      remove.title = appText("time.deleteEntry", "Delete this time");
      remove.addEventListener("click", () => deleteTimeEntry(entry.id));
      row.append(text, edit, remove);
      list.appendChild(row);
    });
  };

  const resetTimeEntryForm = () => {
    editingTimeEntryId = null;
    timeEntryForm.reset();
    const today = toDateKey(new Date());
    document.getElementById("time-entry-date").value = today;
    document.getElementById("time-entry-date").max = today;
    document.getElementById("btn-time-entry-save").textContent = appText("time.addButton", "Add Time");
    document.getElementById("btn-time-entry-cancel").hidden = true;
  };

  const renderTimeView = () => {
    renderTimeSummary();
    renderTimeEntries();
  };

  const saveTimeTracking = async (previous) => {
    try {
      await saveSettings();
      return true;
    } catch (error) {
      settings.timeTracking = normalizeTimeTracking(previous);
      await showStorageError("save time in service", error);
      return false;
    }
  };

  const newTimeEntryId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  timeToggleButton.addEventListener("click", async () => {
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    if (tracking.runningSince) {
      splitByDay(Date.parse(tracking.runningSince), Date.now()).forEach((part) => {
        const seconds = Math.round(part.seconds);
        if (seconds > 0) {
          tracking.entries.push({
            id: newTimeEntryId(),
            date: part.date,
            seconds,
            note: "Timer",
          });
        }
      });
      tracking.runningSince = null;
    } else {
      tracking.runningSince = new Date().toISOString();
    }
    await saveTimeTracking(previous);
    renderBottomNav();
    renderTimeView();
  });

  timeEntryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = document.getElementById("time-entry-date").value;
    const hours = Number(document.getElementById("time-entry-hours").value) || 0;
    const minutes = Number(document.getElementById("time-entry-minutes").value) || 0;
    const note = document.getElementById("time-entry-note").value.trim();
    const seconds = Math.round(hours * 3600 + minutes * 60);
    if (!date || date > toDateKey(new Date())) {
      await NRVDialogs.alert(appText("time.validDate", "Choose a date that is today or earlier."));
      return;
    }
    if (hours < 0 || minutes < 0 || minutes > 59 || seconds <= 0 || hours > 24) {
      await NRVDialogs.alert(appText("time.validDuration", "Enter hours (up to 24) and minutes (0–59) greater than zero."));
      return;
    }
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    const existing = tracking.entries.find((entry) => entry.id === editingTimeEntryId);
    if (existing) {
      Object.assign(existing, { date, seconds, note });
    } else {
      tracking.entries.push({ id: newTimeEntryId(), date, seconds, note });
    }
    if (await saveTimeTracking(previous)) resetTimeEntryForm();
    renderTimeView();
  });

  document
    .getElementById("btn-time-entry-cancel")
    .addEventListener("click", resetTimeEntryForm);

  const startEditingTimeEntry = (id) => {
    const entry = settings.timeTracking.entries.find((item) => item.id === id);
    if (!entry) return;
    editingTimeEntryId = id;
    document.getElementById("time-entry-date").value = entry.date;
    document.getElementById("time-entry-hours").value = Math.floor(entry.seconds / 3600);
    document.getElementById("time-entry-minutes").value = Math.floor((entry.seconds % 3600) / 60);
    document.getElementById("time-entry-note").value = entry.note;
    document.getElementById("btn-time-entry-save").textContent = appText("time.saveChanges", "Save Changes");
    document.getElementById("btn-time-entry-cancel").hidden = false;
    timeEntryForm.scrollIntoView({ block: "center" });
  };

  const deleteTimeEntry = async (id) => {
    if (!await NRVDialogs.confirm(appText("time.deleteConfirm", "Delete this time entry?"))) return;
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    tracking.entries = tracking.entries.filter((entry) => entry.id !== id);
    tracking.deleted.push(id);
    if (editingTimeEntryId === id) resetTimeEntryForm();
    await saveTimeTracking(previous);
    renderTimeView();
  };

  const trackTimeCheckbox = document.getElementById("setting-time-tracking");
  const timeOptions = document.getElementById("time-tracking-options");
  const monthlyCheckbox = document.getElementById("setting-time-monthly");
  const yearlyCheckbox = document.getElementById("setting-time-yearly");
  const syncTimeSettingsForm = () => {
    const tracking = settings.timeTracking;
    trackTimeCheckbox.checked = tracking.enabled;
    monthlyCheckbox.checked = tracking.showMonthly;
    yearlyCheckbox.checked = tracking.showYearly;
    timeOptions.hidden = !tracking.enabled;
    updateTimeToggle();
  };
  trackTimeCheckbox.addEventListener("change", async () => {
    const previous = JSON.parse(JSON.stringify(settings.timeTracking));
    if (trackTimeCheckbox.checked) {
      settings.timeTracking.enabled = true;
    } else {
      if (
        !await NRVDialogs.confirm(
          "Turning off Track Time in Service erases all the time you have recorded, including this month's and this service year's totals. This cannot be undone unless you have a backup. Turn it off?",
        )
      ) {
        trackTimeCheckbox.checked = true;
        return;
      }
      settings.timeTracking = normalizeTimeTracking({
        showMonthly: previous.showMonthly,
        showYearly: previous.showYearly,
      });
      resetTimeEntryForm();
    }
    await saveTimeTracking(previous);
    syncTimeSettingsForm();
    renderBottomNav();
  });
  [
    [monthlyCheckbox, "showMonthly"],
    [yearlyCheckbox, "showYearly"],
  ].forEach(([checkbox, key]) => {
    checkbox.addEventListener("change", async () => {
      const previous = JSON.parse(JSON.stringify(settings.timeTracking));
      settings.timeTracking[key] = checkbox.checked;
      await saveTimeTracking(previous);
      syncTimeSettingsForm();
    });
  });
  syncTimeSettingsForm();
  resetTimeEntryForm();

  // A web app can't intercept being closed, so ask when it is reopened.
  const TIME_SEEN_KEY = "return_visits_time_last_seen";
  let checkingTimer = false;
  const markTimerSeen = () => {
    try {
      if (settings.timeTracking.runningSince) {
        localStorage.setItem(TIME_SEEN_KEY, String(Date.now()));
      }
    } catch (error) {
      console.error("Unable to save the timer heartbeat:", error);
    }
  };
  const checkRunningTimer = async () => {
    const tracking = settings.timeTracking;
    if (checkingTimer || !tracking.runningSince) return;
    let lastSeen = 0;
    try {
      lastSeen = Number(localStorage.getItem(TIME_SEEN_KEY)) || 0;
    } catch (error) {
      console.error("Unable to read the timer heartbeat:", error);
    }
    const startedAt = Date.parse(tracking.runningSince);
    if (!lastSeen || lastSeen <= startedAt || Date.now() - lastSeen < 2 * 60 * 1000) {
      markTimerSeen();
      return;
    }
    checkingTimer = true;
    const keep = await NRVDialogs.confirm(
      `Your timer is still running. You were last in the app at ${new Date(lastSeen).toLocaleString()}.\n\nOK = Keep time going.\nCancel = Stop the timer at that time.`,
    );
    if (keep) {
      markTimerSeen();
    } else {
      const previous = JSON.parse(JSON.stringify(tracking));
      splitByDay(startedAt, lastSeen).forEach((part) => {
        const seconds = Math.round(part.seconds);
        if (seconds > 0) {
          tracking.entries.push({
            id: newTimeEntryId(),
            date: part.date,
            seconds,
            note: "Timer",
          });
        }
      });
      tracking.runningSince = null;
      await saveTimeTracking(previous);
      renderBottomNav();
      renderTimeView();
    }
    checkingTimer = false;
  };
  window.setInterval(markTimerSeen, 15000);
  window.addEventListener("pagehide", markTimerSeen);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markTimerSeen();
    else checkRunningTimer();
  });
  window.setTimeout(checkRunningTimer, 800);
  window.setInterval(() => {
    if (currentViewId === "time-view" && settings.timeTracking.enabled) {
      renderTimeSummary();
    }
  }, 1000);

  const saveContacts = async () => {
    try {
      const nextSignatures = stampChangedContacts();
      await encryptStoredValue(database, "contacts", contacts, encryptionKey);
      contactSignatures = nextSignatures;
    } catch (error) {
      await showStorageError("save contacts", error);
      return false;
    }
    cloudBackupHook();
    renderContacts();
    return true;
  };

  // Modal Elements & Interactive Picker Map
  const modal = document.getElementById("contact-modal");
  const btnOpenModal = document.getElementById("btn-open-modal");
  const btnFindAddress = document.getElementById("btn-find-address");
  const btnFindCrossStreet = document.getElementById("btn-find-cross-street");
  const crossStreetSearch = document.getElementById("cross-street-search");
  const closeModal = document.getElementById("close-modal");
  const contactForm = document.getElementById("contact-form");
  const contactModalBody = contactForm.querySelector(".modal-body");
  const phoneInput = document.getElementById("contact-phone");
  const streetAddressInput = document.getElementById("contact-address");
  const contactStateInput = document.getElementById("contact-state");
  const settingStateInput = document.getElementById("setting-state");
  const settingDefaultCityInput = document.getElementById(
    "setting-default-city",
  );
  const contactShareDialog = document.getElementById("contact-share-dialog");
  const contactShareTitle = document.getElementById("contact-share-title");

  // Keeps the Update Log button (or new-note box) centered in the space left
  // above the keyboard so it is not covered.
  const visitsSection = document.getElementById("contact-visits-section");
  contactModalBody.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!visitsSection.contains(field) || !field.matches("input, textarea")) {
      return;
    }
    visitsSection.classList.add("visit-editing");
    const entry = field.closest(".note-entry");
    const target = entry
      ? entry.querySelector("button") || field
      : document.getElementById("contact-notes");
    setTimeout(() => {
      if (!target.isConnected) return;
      const body = contactModalBody.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(body.top, viewport?.offsetTop ?? 0);
      const bottom = Math.min(
        body.bottom,
        viewport ? viewport.offsetTop + viewport.height : body.bottom,
      );
      const rect = target.getBoundingClientRect();
      contactModalBody.scrollTop +=
        rect.top + rect.height / 2 - (top + bottom) / 2;
    }, 300);
  });
  contactModalBody.addEventListener("focusout", (event) => {
    if (!visitsSection.contains(event.relatedTarget)) {
      visitsSection.classList.remove("visit-editing");
    }
  });

  streetAddressInput.addEventListener("blur", () => {
    streetAddressInput.value = normalizeStreetForAddressing(
      streetAddressInput.value,
      selectedContactAddressingCountry,
    );
  });
  contactStateInput.addEventListener("blur", () => {
    contactStateInput.value = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
  });
  settingStateInput.addEventListener("blur", () => {
    settingStateInput.value = normalizeLocationState(
      meCountrySelect.value,
      settingStateInput.value,
    );
  });
  settingDefaultCityInput.addEventListener("blur", () => {
    settingDefaultCityInput.value = toTitleCase(settingDefaultCityInput.value);
  });

  const setShareLink = (elementId, href) => {
    document.getElementById(elementId).href = href;
  };
  [
    "share-contact-sms",
    "share-contact-whatsapp",
    "share-contact-email",
  ].forEach((elementId) => {
    document
      .getElementById(elementId)
      .addEventListener("click", () => contactShareDialog.close());
  });

  let contactBeingShared = null;
  const updateContactShareLinks = () => {
    if (!contactBeingShared) return;
    const contact = contactBeingShared;
    const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
    const notes = getSortedVisitNotes(contact).filter((note) => note.text);
    const choice =
      contactShareDialog.querySelector('input[name="share-notes"]:checked')
        ?.value || "none";
    const selectedNotes =
      choice === "all" ? notes : choice === "latest" ? notes.slice(0, 1) : [];
    const shareText = getContactShareText(
      contact,
      selectedNotes,
      settings.me?.name || "",
    );
    const encodedText = encodeURIComponent(shareText);
    const encodedSubject = encodeURIComponent(`Contact: ${fullName}`);
    setShareLink("share-contact-sms", `sms:?body=${encodedText}`);
    setShareLink(
      "share-contact-whatsapp",
      `https://wa.me/?text=${encodedText}`,
    );
    setShareLink(
      "share-contact-email",
      `mailto:?subject=${encodedSubject}&body=${encodedText}`,
    );
  };
  contactShareDialog
    .querySelectorAll('input[name="share-notes"]')
    .forEach((radio) => {
      radio.addEventListener("change", updateContactShareLinks);
    });

  const openContactShareDialog = (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
    const noteCount = (contact.notesHistory || []).filter(
      (note) => note.text,
    ).length;
    contactBeingShared = contact;
    contactShareTitle.textContent = appText("contacts.shareTitle", `Share: ${fullName}`, { name: fullName });
    contactShareDialog.querySelector(
      'input[name="share-notes"][value="none"]',
    ).checked = true;
    document.getElementById("share-notes-options").hidden = noteCount === 0;
    document.getElementById("share-notes-latest-label").hidden = noteCount < 1;
    document.getElementById("share-notes-all-label").hidden = noteCount < 2;
    document.getElementById("share-notes-count").textContent = noteCount
      ? `This contact has ${noteCount} visit note${noteCount === 1 ? "" : "s"}.`
      : "";
    updateContactShareLinks();
    contactShareDialog.showModal();
  };
  contactShareDialog.addEventListener("close", () => {
    contactBeingShared = null;
  });

  const formatPhoneNumber = (value) => {
    let digits = value.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) return digits;
    if (digits.length <= 3) return digits ? `(${digits}` : "";
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  phoneInput.addEventListener("input", () => {
    const value = phoneInput.value;
    const start = phoneInput.selectionStart ?? value.length;
    const end = phoneInput.selectionEnd ?? start;
    const digitsBefore = value.slice(0, start).replace(/\D/g, "").length;
    const digitsThrough = value.slice(0, end).replace(/\D/g, "").length;
    const formatted = formatPhoneNumber(value);
    const positionAfterDigits = (digitCount) => {
      if (digitCount === 0) return 0;
      let position = 0;
      let digitsFound = 0;
      while (position < formatted.length && digitsFound < digitCount) {
        if (/\d/.test(formatted[position])) digitsFound += 1;
        position += 1;
      }
      return position;
    };
    phoneInput.value = formatted;
    phoneInput.setSelectionRange(
      positionAfterDigits(digitsBefore),
      positionAfterDigits(digitsThrough),
    );
  });

  let pickerMap = null;
  let pickerMarker = null;
  const defaultMapCenter = [38.8517, -121.1275];

  const setPickerLocation = (lat, lng, zoom = 16) => {
    const location = [Number(lat), Number(lng)];
    if (
      !Number.isFinite(location[0]) ||
      !Number.isFinite(location[1]) ||
      location[0] < -90 ||
      location[0] > 90 ||
      location[1] < -180 ||
      location[1] > 180
    ) {
      throw new Error("The pin coordinates are outside the valid range.");
    }
    if (!pickerMap) {
      throw new Error("The contact map is not ready yet.");
    }
    document.getElementById("contact-lat").value = location[0].toFixed(6);
    document.getElementById("contact-lng").value = location[1].toFixed(6);
    if (pickerMarker) {
      pickerMarker.setLatLng(location);
    } else {
      pickerMarker = L.marker(location, { draggable: true }).addTo(pickerMap);
      pickerMarker.on("dragend", () => {
        const movedTo = pickerMarker.getLatLng();
        document.getElementById("contact-lat").value =
          movedTo.lat.toFixed(6);
        document.getElementById("contact-lng").value =
          movedTo.lng.toFixed(6);
        updatePrintContactAvailability();
        setLocationStatus(appText("map.pinMoved", "Pin moved. The coordinates have been updated."));
      });
    }
    pickerMap.setView(location, zoom);
    updatePrintContactAvailability();
    updatePinUi();
  };

  // Pin tools collapse once the pin is confirmed; they reopen on "Adjust pin"
  // or when the address changes.
  let pinPanelOpen = true;
  const updatePinUi = () => {
    const hasPin =
      Boolean(document.getElementById("contact-lat").value.trim()) &&
      Boolean(document.getElementById("contact-lng").value.trim());
    const open = pinPanelOpen || !hasPin;
    document.getElementById("pin-tools").hidden = !open;
    document.getElementById("pin-summary").hidden = open;
    document.getElementById("btn-confirm-pin").hidden = !hasPin;
  };
  const setPinPanel = (open) => {
    pinPanelOpen = open;
    updatePinUi();
    if (open && pickerMap) {
      setTimeout(() => {
        pickerMap.invalidateSize();
        if (pickerMarker) pickerMap.setView(pickerMarker.getLatLng(), 16);
      }, 50);
    }
  };

  const locationStatus = document.getElementById("location-status");
  const addressMatchResults = document.getElementById(
    "address-match-results",
  );
  const setLocationStatus = (message) => {
    locationStatus.textContent = message;
  };
  const clearAddressMatches = () => {
    addressMatchResults.replaceChildren();
    addressMatchResults.hidden = true;
  };
  const getStreetMatchLabel = (result) =>
    result.address?.road
      ? normalizeStreetForAddressing(
          result.address.road,
          selectedContactAddressingCountry,
        )
      : result.display_name;
  const getUniqueStreetMatches = (results) => {
    const streetMatches = results.filter((result) => result.address?.road);
    if (streetMatches.length === 0) return results;
    const uniqueStreets = new Map();
    streetMatches.forEach((result) => {
      const streetName = normalizeStreetForAddressing(
        result.address.road,
        selectedContactAddressingCountry,
      );
      const key = streetName.toLowerCase();
      if (!uniqueStreets.has(key)) uniqueStreets.set(key, result);
    });
    return Array.from(uniqueStreets.values());
  };
  const selectAddressMatch = (result, enteredStreet) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    setPickerLocation(latitude, longitude);
    const address = result.address || {};
    const houseNumber = enteredStreet.match(/^\d+[A-Za-z]?\b/)?.[0];
    if (address.road) {
      streetAddressInput.value = normalizeStreetForAddressing(
        [houseNumber, address.road].filter(Boolean).join(" "),
        selectedContactAddressingCountry,
      );
    }
    updatePrintContactAvailability();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    clearAddressMatches();
    setLocationStatus(
      appText("map.pinPlacedNear", `Pin placed near ${result.display_name}. Check its position and move it on the map if needed.`, { location: result.display_name }),
    );
  };
  const showAddressMatches = (results, enteredStreet) => {
    addressMatchResults.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = appText("map.chooseMatch", "Choose the matching street or location:");
    addressMatchResults.appendChild(heading);
    const list = document.createElement("div");
    list.className = "address-match-options";
    results.forEach((result) => {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = getStreetMatchLabel(result);
      option.addEventListener("click", () =>
        selectAddressMatch(result, enteredStreet),
      );
      list.appendChild(option);
    });
    addressMatchResults.appendChild(list);
    addressMatchResults.hidden = false;
  };

  const updatePickerLocationFromCoordinates = () => {
    const latitude = document.getElementById("contact-lat").value.trim();
    const longitude = document.getElementById("contact-lng").value.trim();
    if (!latitude && !longitude) {
      if (pickerMarker) {
        pickerMap.removeLayer(pickerMarker);
        pickerMarker = null;
      }
      setLocationStatus(appText("map.pinCleared", "Pin cleared. Choose a location or place it on the map."));
      updatePinUi();
      return;
    }
    if (!latitude || !longitude) {
      setLocationStatus(appText("map.enterBothCoordinates", "Enter both latitude and longitude to set the pin."));
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setLocationStatus(appText("map.enterValidCoordinates", "Enter valid coordinates before setting the pin."));
      return;
    }
    setPickerLocation(lat, lng);
    setLocationStatus(
      appText("map.pinUpdatedCoordinates", "Pin updated from the entered coordinates. You can move it on the map."),
    );
  };

  const findAddressOnMap = async () => {
    if (!pickerMap) {
      setLocationStatus(
        appText("map.stillLoading", "The map is still loading. Please try again in a moment."),
      );
      return;
    }
    const street = normalizeStreetForAddressing(
      streetAddressInput.value,
      selectedContactAddressingCountry,
    );
    const city = document.getElementById("contact-city-select").value.trim();
    const state = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
    const country = contactCountrySelect.value || settings.country;
    const region =
      contactRegionSelect.value === "__ADD_NEW__" ? "" : contactRegionSelect.value;
    const area =
      contactAreaSelect.value === "__ADD_NEW__" ? "" : contactAreaSelect.value;
    const postalCode = document
      .getElementById("contact-postal-code")
      .value.trim();
    streetAddressInput.value = street;
    contactStateInput.value = state;
    if (
      (!street && !area && !region && !city && !state && !postalCode) ||
      city === "__ADD_NEW__"
    ) {
      setLocationStatus(
        appText("map.enterAddressOrCity", "Enter a street address or choose a city before looking up its location."),
      );
      return;
    }
    clearAddressMatches();
    const locationParts = { area, region, city, state, postalCode, country };
    const query = getFormattedContactAddress(
      { ...locationParts, streetAddress: street },
      selectedContactAddressingCountry,
    );
    const cityQuery = getFormattedContactAddress(
      locationParts,
      selectedContactAddressingCountry,
    );
    const cityState = cityQuery;
    btnFindAddress.disabled = true;
    setLocationStatus(appText("map.lookingUpAddress", "Looking up the entered address..."));
    try {
      const lookup = async (searchQuery) => {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.search = new URLSearchParams({
          q: searchQuery,
          format: "jsonv2",
          addressdetails: "1",
          limit: "5",
        }).toString();
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Address lookup failed with status ${response.status}.`,
          );
        }
        return response.json();
      };
      if (!street) {
        const cityResults = await lookup(cityQuery);
        if (cityResults.length > 0) {
          setPickerLocation(cityResults[0].lat, cityResults[0].lon, 13);
          setLocationStatus(
            appText("map.approximatePlaced", `The pin is centered approximately near ${cityState}. Move it to the contact's exact location before saving.`, { location: cityState }),
          );
          return;
        }
        setLocationStatus(
          appText("map.cityNotFound", `Couldn't locate ${cityState}. Try a street address or place the pin on the map.`, { location: cityState }),
        );
        return;
      }

      const addressResults = getUniqueStreetMatches(await lookup(query));
      if (addressResults.length > 1) {
        crossStreetSearch.hidden = true;
        showAddressMatches(addressResults, street);
        setLocationStatus(
          appText("map.possibleMatches", `Found ${addressResults.length} possible matches. Choose the correct street or location to place the pin.`, { count: addressResults.length }),
        );
        return;
      }
      const streetOnly = street.replace(/^\d+[A-Za-z]?\s*/, "").trim();
      if (addressResults.length === 0 && streetOnly && streetOnly !== street) {
        setLocationStatus(
          appText("map.houseNumberNotFound", "Couldn't match that house number. Searching for streets with a similar name..."),
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const streetResults = getUniqueStreetMatches(
          await lookup(
            getFormattedContactAddress({
              ...locationParts,
              streetAddress: streetOnly,
            }, selectedContactAddressingCountry),
          ),
        );
        if (streetResults.length > 1) {
          crossStreetSearch.hidden = true;
          showAddressMatches(streetResults, street);
          setLocationStatus(
            appText("map.streetMatches", `Found ${streetResults.length} possible street matches. Choose the correct one to place an approximate pin.`, { count: streetResults.length }),
          );
          return;
        }
        if (streetResults.length === 1) {
          selectAddressMatch(streetResults[0], street);
          setLocationStatus(
            appText("map.streetPinPlaced", `Pin placed near ${streetResults[0].display_name} based on the street name. Check and adjust its position before saving.`, { location: streetResults[0].display_name }),
          );
          return;
        }
      }
      if (addressResults.length === 0 && cityQuery) {
        crossStreetSearch.hidden = false;
        setLocationStatus(
          appText("map.searchingCity", "Couldn't find the street address. Looking for the city to place an approximate pin..."),
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const cityResults = await lookup(cityQuery);
        if (cityResults.length > 0) {
          setPickerLocation(cityResults[0].lat, cityResults[0].lon, 13);
          setLocationStatus(
            appText("map.addressMissingCentered", `Couldn't find the street address. The map is centered near ${cityState}. Enter a nearby cross-street below to narrow the pin, or adjust it on the map.`, { location: cityState }),
          );
          return;
        }
        setLocationStatus(
          appText("map.addressCityMissing", `Couldn't find the street address or locate ${cityState}. Enter a nearby cross-street below to try a more specific search, or place the pin on the map.`, { location: cityState }),
        );
        return;
      }
      if (addressResults.length === 0) {
        crossStreetSearch.hidden = false;
        setLocationStatus(
          appText("map.addressNotFound", "Couldn't find the street address. Choose a city, enter a nearby cross-street, or place the pin on the map."),
        );
        return;
      }
      crossStreetSearch.hidden = true;
      document.getElementById("contact-cross-street").value = "";
      selectAddressMatch(addressResults[0], street);
    } catch (error) {
      console.error("Unable to find address on map:", error);
      setLocationStatus(
        appText("map.addressLookupFailed", "Address lookup failed. Check your connection, then try again or place the pin manually."),
      );
    } finally {
      btnFindAddress.disabled = false;
    }
  };

  const findCrossStreetOnMap = async () => {
    if (!pickerMap) {
      setLocationStatus(
        appText("map.stillLoading", "The map is still loading. Please try again in a moment."),
      );
      return;
    }
    const crossStreet = document
      .getElementById("contact-cross-street")
      .value.trim();
    const city = document.getElementById("contact-city-select").value.trim();
    const region = contactRegionSelect.value;
    const area = contactAreaSelect.value;
    const postalCode = document
      .getElementById("contact-postal-code")
      .value.trim();
    const state = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
    contactStateInput.value = state;
    if (!crossStreet) {
      setLocationStatus(appText("map.enterCrossStreet", "Enter a nearby cross-street or intersection first."));
      return;
    }

    btnFindCrossStreet.disabled = true;
    clearAddressMatches();
    setLocationStatus(appText("map.searchingCrossStreet", "Searching near the cross-street..."));
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q: [
          crossStreet,
          getFormattedContactAddress(
            {
              area,
              region,
              city,
              state,
              postalCode,
              country: contactCountrySelect.value || settings.country,
            },
            selectedContactAddressingCountry,
          ),
        ]
          .filter(Boolean)
          .join(", "),
        format: "jsonv2",
        limit: "1",
      }).toString();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Cross-street lookup failed with status ${response.status}.`,
        );
      }
      const results = await response.json();
      if (results.length === 0) {
        setLocationStatus(
          appText("map.crossStreetMissing", "Couldn't find that cross-street. Check the names or move the city-centered pin on the map."),
        );
        return;
      }
      setPickerLocation(results[0].lat, results[0].lon, 16);
      setLocationStatus(
        appText("map.crossStreetPlaced", "Pin placed near the cross-street search. Check its position and adjust it if needed."),
      );
    } catch (error) {
      console.error("Unable to find cross-street on map:", error);
      setLocationStatus(
        appText("map.crossStreetFailed", "Cross-street lookup failed. Check your connection, then try again or adjust the pin on the map."),
      );
    } finally {
      btnFindCrossStreet.disabled = false;
    }
  };

  let initialFormState = "";
  const captureFormState = () => {
    const formEl = document.getElementById("contact-form");
    return JSON.stringify(
      Array.from(formEl.querySelectorAll("input, select, textarea")).map(
        (field) => ({
          id: field.id,
          type: field.type || field.tagName.toLowerCase(),
          value: field.value,
          checked: field.type === "checkbox" || field.type === "radio"
            ? field.checked
            : undefined,
        }),
      ),
    );
  };
  const printContactButton = document.getElementById("btn-print-contact");
  const shareContactButton = document.getElementById("btn-share-contact");
  const exportContactButton = document.getElementById("btn-export-contact");
  const directionsLink = document.getElementById("btn-directions-contact");
  const contactSecondaryActions = document.getElementById(
    "contact-secondary-actions",
  );
  const updatePrintContactAvailability = () => {
    const hasSavedContact = Boolean(
      document.getElementById("contact-id").value,
    );
    const hasUnsavedChanges = captureFormState() !== initialFormState;
    contactSecondaryActions.hidden = !hasSavedContact;
    const savedContact = hasSavedContact ? getSavedContactFromEditor() : null;
    const directionsUrl = savedContact ? getNavigationUrl(savedContact) : "";
    if (directionsUrl) {
      directionsLink.href = directionsUrl;
    } else {
      directionsLink.removeAttribute("href");
    }
    directionsLink.hidden = !directionsUrl;
    [
      [printContactButton, "printing", "Print this contact"],
      [shareContactButton, "sharing", "Share this contact"],
      [exportContactButton, "exporting", "Export this contact"],
    ].forEach(([button, verb, readyTitle]) => {
      button.disabled = !hasSavedContact || hasUnsavedChanges;
      button.title = hasUnsavedChanges
        ? `Save changes before ${verb}`
        : readyTitle;
    });
  };
  contactForm.addEventListener("input", updatePrintContactAvailability);
  contactForm.addEventListener("change", updatePrintContactAvailability);

  const appUpdateDialog = document.getElementById("app-update-dialog");
  const appUpdateStatus = document.getElementById("app-update-status");
  const describeSettingsField = (input) => {
    const label =
      (input.id &&
        document.querySelector(`label[for="${input.id}"]`)?.firstChild
          ?.textContent) ||
      input.closest("label")?.firstChild?.textContent ||
      input.getAttribute("aria-label") ||
      input.placeholder ||
      input.id;
    return String(label).replace(/:\s*$/, "").trim();
  };
  const findPendingDetailsEdit = () => {
    const saved = JSON.parse(savedDetailsState);
    const current = JSON.parse(captureDetailsState());
    const fields = {
      country: meFields.country,
      addressingCountry: document.getElementById("settings-address-country"),
      defaultState: settingStateInput,
      defaultCity: settingDefaultCityInput,
      ...meFields,
    };
    const key = Object.keys(current).find((name) => current[name] !== saved[name]);
    if (!key) return null;
    const input = fields[key];
    return {
      input,
      field: describeSettingsField(input),
      section: input.closest("details")?.querySelector("summary")?.textContent.trim() || "Settings",
    };
  };
  const findPendingOtherSettingsEdit = () => {
    const inputs = Array.from(
      document.querySelectorAll("#settings-view input"),
    ).filter(
      (input) =>
        !["checkbox", "radio", "hidden", "button", "submit"].includes(
          input.type,
        ) &&
        !input.closest("[hidden]") &&
        !Object.values(meFields).includes(input) &&
        !["setting-state", "setting-default-city"].includes(input.id),
    );
    for (const input of inputs) {
      let changed;
      if (input.type === "file") {
        changed = input.files.length > 0;
      } else if (input.id === "setting-new-city") {
        const country =
          document.getElementById("setting-location-country").value ||
          settings.country;
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !settings.cities.some(
            (city) =>
              city.country === country && city.name.toLowerCase() === name,
          );
      } else if (input.id === "setting-new-region") {
        const country =
          document.getElementById("setting-location-country").value ||
          settings.country;
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !settings.regions.some(
            (region) =>
              region.country === country && region.name.toLowerCase() === name,
          );
      } else if (input.id === "setting-new-area") {
        const country =
          document.getElementById("setting-location-country").value ||
          settings.country;
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !settings.areas.some(
            (area) =>
              area.country === country && area.name.toLowerCase() === name,
          );
      } else {
        changed = input.value.trim() !== "";
      }
      if (changed) {
        return {
          input,
          field: describeSettingsField(input),
          section:
            input.closest("details")?.querySelector("summary")?.textContent.trim() ||
            "Settings",
        };
      }
    }
    return null;
  };
  const findPendingSettingsEdit = () =>
    findPendingDetailsEdit() || findPendingOtherSettingsEdit();
  const revealSettingsEdit = (pending) => {
    if (!pending || currentViewId !== "settings-view") return;
    let section = pending.input.closest("details");
    while (section) {
      section.open = true;
      section = section.parentElement.closest("details");
    }
    pending.input.scrollIntoView({ block: "center" });
    pending.input.focus();
  };
  const discardOtherSettingsEdits = () => {
    document.querySelectorAll("#settings-view input").forEach((input) => {
      if (Object.values(meFields).includes(input) ||
          ["setting-state", "setting-default-city"].includes(input.id)) return;
      if (["checkbox", "radio", "hidden", "button", "submit"].includes(input.type)) return;
      input.value = "";
      if (input.type === "file") input.dispatchEvent(new Event("change"));
    });
  };
  const discardDefaultsAndDetails = () => {
    settingStateInput.value = settings.state;
    settingDefaultCityInput.value = settings.defaultCity;
    updateAddressingProfile(settings.addressingCountry);
    populateMeForm();
    ["country", "region", "area"].forEach((name) => {
      document.getElementById(`new-me-${name}-container`).hidden = true;
      document.getElementById(`input-new-me-${name}`).value = "";
    });
    meStatus.textContent = "";
    savedDetailsState = captureDetailsState();
  };
  const changesDialog = document.getElementById("settings-changes-dialog");
  const chooseSettingsChanges = () => new Promise((resolve) => {
    const finish = (choice) => {
      changesDialog.removeEventListener("cancel", cancel);
      saveButton.removeEventListener("click", save);
      discardButton.removeEventListener("click", discard);
      changesDialog.close();
      resolve(choice);
    };
    const cancel = (event) => { event.preventDefault(); finish("cancel"); };
    const save = () => finish("save");
    const discard = () => finish("discard");
    const saveButton = document.getElementById("btn-settings-save-changes");
    const discardButton = document.getElementById("btn-settings-discard-changes");
    changesDialog.addEventListener("cancel", cancel);
    saveButton.addEventListener("click", save);
    discardButton.addEventListener("click", discard);
    changesDialog.showModal();
  });
  let settingsLeavePending = false;
  confirmLeaveSettings = async () => {
    if (settingsLeavePending) return false;
    settingsLeavePending = true;
    try {
      const other = findPendingOtherSettingsEdit();
      if (other && !(await confirmDiscardOtherSettings(other))) return false;
      const pending = findPendingDetailsEdit();
      if (!pending) return true;
      const choice = await chooseSettingsChanges();
      if (choice === "cancel") return false;
      if (choice === "discard") {
        discardDefaultsAndDetails();
        return true;
      }
      return await saveDefaultsAndDetails();
    } finally {
      settingsLeavePending = false;
    }
  };
  const languageSelects = [document.getElementById("setup-language")];
  languageSelects.forEach((select) => {
    select.value = window.NRVI18n.getLanguage();
    select.addEventListener("change", async (event) => {
      const language = event.target.value;
      const restoreLanguage = () => {
        languageSelects.forEach((item) => {
          item.value = window.NRVI18n.getLanguage();
        });
      };
      if (document.getElementById("contact-modal").open) {
        await NRVDialogs.alert(
          appText("language.finishContact", "Save or finish the open contact before changing the language."),
        );
        restoreLanguage();
        return;
      }
      if (!(await confirmLeaveSettings())) {
        restoreLanguage();
        return;
      }
      if (!(await NRVDialogs.confirm(
        appText(
          "language.reloadConfirm",
          "Changing the language reloads NRV. Save or finish any unsaved changes first. Continue?",
        ),
      ))) {
        restoreLanguage();
        return;
      }
      try {
        window.NRVI18n.setLanguage(language);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("lang");
        window.location.href = nextUrl.href;
      } catch (error) {
        console.error("Unable to change the selected language:", error);
        await NRVDialogs.alert(
          appText("language.saveError", "The language choice could not be saved on this device. Check your browser storage settings and try again."),
        );
        restoreLanguage();
      }
    });
  });
  const confirmDiscardOtherSettings = async (pending) => {
    const pendingDescription =
      pending.input.type === "file"
        ? "A backup file is selected but has not been restored."
        : `"${pending.field}" in ${pending.section} has not been saved.`;
    if (
      await NRVDialogs.confirm(
        `Discard unsaved changes?\n\n${pendingDescription}\n\nChoose OK to discard, or Cancel to go back and finish it.`,
      )
    ) {
      discardOtherSettingsEdits();
      return true;
    }
    revealSettingsEdit(pending);
    return false;
  };
  const defaultsSection = document.getElementById("defaults-your-details-section");
  document.querySelectorAll("#settings-view > .settings-container > details > summary").forEach((summary) => {
    summary.addEventListener("click", async (event) => {
      const section = summary.parentElement;
      if (!defaultsSection.open || (section === defaultsSection && !section.open)) return;
      if (section !== defaultsSection && section.open) return;
      if (!findPendingSettingsEdit()) return;
      event.preventDefault();
      if (!(await confirmLeaveSettings())) return;
      if (section === defaultsSection) section.open = false;
      else section.open = true;
    });
  });
  revealAppRefreshBlock = () => revealSettingsEdit(findPendingSettingsEdit());
  getAppRefreshBlockMessage = () => {
    const contactEditorOpen = getComputedStyle(modal).display !== "none";
    const pending = findPendingSettingsEdit();
    if (contactEditorOpen) {
      return appText("update.finishContact", "Save or exit the open contact before refreshing the app. Your saved contacts will remain on this device.");
    }
    if (pending) {
      return appText("update.finishSettings", `Before refreshing, finish or clear "${pending.field}" in Settings → ${pending.section}. It has changes that are not saved.`, { field: pending.field, section: pending.section });
    }
    return "";
  };
  const showAppUpdatePrompt = () => {
    if (!appUpdateAvailable) return;
    renderBottomNav();
    document.getElementById("app-update-notice").hidden = false;
    document.getElementById("btn-check-updates").textContent = appText("update.nowTitle", "Update Now");
    if (getAppRefreshBlockMessage()) {
      if (currentViewId === "settings-view") {
        appUpdateStatus.textContent = appText("update.finishEdits", "An app update is ready. Save or finish your edits before refreshing.");
      }
      return;
    }
    appUpdateStatus.textContent = "";
    if (appUpdatePromptDismissed) return;
    if (appUpdatePromptTimer !== null) {
      window.clearTimeout(appUpdatePromptTimer);
    }
    appUpdatePromptTimer = window.setTimeout(() => {
      appUpdatePromptTimer = null;
      if (
        appUpdateAvailable &&
        !appUpdatePromptDismissed &&
        !appUpdateDialog.open &&
        !getAppRefreshBlockMessage() &&
        !document.querySelector("dialog[open]")
      ) {
        appUpdateDialog.showModal();
      }
    }, 750);
  };
  appUpdatePromptHandler = showAppUpdatePrompt;
  document.getElementById("app-current-version").textContent = appText(
    "update.currentVersion",
    `Current NRV version: ${APP_VERSION}`,
    { version: APP_VERSION },
  );

  document
    .getElementById("btn-ok-no-update")
    .addEventListener("click", () =>
      document.getElementById("app-no-update-dialog").close(),
    );

  document
    .getElementById("btn-check-updates")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = appUpdateStatus;
      if (!navigator.onLine) {
        status.textContent = appText("update.offline", "Connect to the internet before checking for app updates.");
        return;
      }
      const blockMessage = getAppRefreshBlockMessage();
      if (blockMessage) {
        status.textContent = blockMessage;
        revealAppRefreshBlock();
        return;
      }
      if (!("serviceWorker" in navigator)) {
        status.textContent = appText("update.unsupported", "This browser does not support app updates. Open the website in a supported browser while online.");
        return;
      }

      button.disabled = true;
      status.textContent = appText("update.checking", "Checking for updates...");
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          throw new Error("The app's update service is not registered.");
        }
        await registration.update();
        const deployedMetadata = await fetchDeployedAppMetadata();
        const versionComparison = compareAppVersions(
          deployedMetadata.version,
          APP_VERSION,
        );
        if (versionComparison < 0) {
          status.textContent = appText(
            "update.versionMismatch",
            `The deployed NRV version ${deployedMetadata.version} is older than this version ${APP_VERSION}. Please try again later.`,
            { deployed: deployedMetadata.version, current: APP_VERSION },
          );
          button.disabled = false;
          return;
        }
        const revisionMatches =
          deployedMetadata.revision === APP_BUILD_REVISION;
        const incoming = registration.installing || registration.waiting;
        if (!incoming && !appUpdateAvailable) {
          if (versionComparison > 0 || !revisionMatches) {
            status.textContent = appText(
              versionComparison > 0 ? "update.versionNotReady" : "update.buildNotReady",
              versionComparison > 0
                ? `NRV ${deployedMetadata.version} is available, but its update is not ready yet. Please try again later.`
                : "An NRV update is available, but its files are still being prepared. Please try again later.",
              { version: deployedMetadata.version },
            );
            button.disabled = false;
            return;
          }
          status.textContent = appText("update.latest", "You have the latest version.");
          button.disabled = false;
          document.getElementById("app-no-update-dialog").showModal();
          return;
        }
        let updateActivated = !incoming || incoming.state === "activated";
        if (incoming && !updateActivated) {
          updateActivated = await new Promise((resolve) => {
            let timer;
            const finish = (activated) => {
              window.clearTimeout(timer);
              incoming.removeEventListener("statechange", onStateChange);
              resolve(activated);
            };
            const onStateChange = () => {
              if (incoming.state === "activated") finish(true);
            };
            timer = window.setTimeout(
              () => finish(incoming.state === "activated"),
              15000,
            );
            incoming.addEventListener("statechange", onStateChange);
            onStateChange();
          });
        }
        if (!updateActivated) {
          status.textContent = appText(
            "update.buildNotReady",
            "An NRV update is available, but its files are still being prepared. Please try again later.",
          );
          button.disabled = false;
          return;
        }
        const refreshBlock = getAppRefreshBlockMessage();
        if (refreshBlock) {
          status.textContent = refreshBlock;
          button.disabled = false;
          revealAppRefreshBlock();
          return;
        }
        status.textContent = appText("update.refreshing", "Update check complete. Refreshing the app now; saved contacts are kept on this device.");
        try {
          localStorage.removeItem(APP_UPDATE_PENDING_KEY);
        } catch (error) {
          console.error("Unable to clear the pending app update status:", error);
        }
        reloadAfterUpdate();
      } catch (error) {
        console.error("Unable to check for app updates:", error);
        status.textContent =
          appText("update.versionCheckFailed", "Could not verify the deployed NRV version or check for updates. Check your connection and try again.");
        button.disabled = false;
      }
    });

  new MutationObserver(updateHeaderTitle).observe(modal, {
    attributes: true,
    attributeFilter: ["style"],
  });

  let contactEditorSession = 0;
  const attemptExit = async () => {
    const currentState = captureFormState();
    if (currentState !== initialFormState) {
      const confirmExit = await NRVDialogs.confirm(appText("contacts.discardExit", "Changes were made, exit without saving?"));
      if (confirmExit) {
        contactEditorSession += 1;
        modal.style.display = "none";
      }
    } else {
      contactEditorSession += 1;
      modal.style.display = "none";
    }
  };

  const contactInfoSection = document.getElementById("contact-info-section");
  const contactVisitsSection = document.getElementById(
    "contact-visits-section",
  );
  contactInfoSection.addEventListener("toggle", () => {
    if (contactInfoSection.open && pickerMap) {
      setTimeout(() => pickerMap.invalidateSize(), 50);
    }
  });
  // A required field inside a closed section cannot be focused, so open it.
  contactForm.addEventListener(
    "invalid",
    () => {
      contactInfoSection.open = true;
    },
    true,
  );

  const openModalWithCoords = (lat, lng, view = "info") => {
    contactModalBody.scrollTop = 0;
    // The map is created while Contact Info is open so it gets its size.
    contactInfoSection.open = true;
    contactVisitsSection.open = false;
    modal.style.display = "flex";
    // The map must be visible while it is created or resized.
    pinPanelOpen = true;
    updatePinUi();

    return new Promise((resolve) => {
      setTimeout(() => {
        contactModalBody.scrollTop = 0;
        if (!pickerMap) {
          pickerMap = L.map("modal-picker-map").setView(
            lat !== null && lng !== null ? [lat, lng] : defaultMapCenter,
            15,
          );
          localizeMapControls(pickerMap);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
          }).addTo(pickerMap);

          pickerMap.on("click", (e) => {
            setPickerLocation(e.latlng.lat, e.latlng.lng);
            setLocationStatus(appText("map.pinMoved", "Pin moved. The coordinates have been updated."));
          });
        } else {
          pickerMap.invalidateSize();
          pickerMap.setView(
            lat !== null && lng !== null ? [lat, lng] : defaultMapCenter,
            15,
          );
        }

        setTimeout(() => {
          if (pickerMap) pickerMap.invalidateSize();
        }, 100);

        if (lat !== null && lng !== null) {
          setPickerLocation(lat, lng, 15);
        } else if (pickerMarker) {
          pickerMap.removeLayer(pickerMarker);
          pickerMarker = null;
        }
        contactModalBody.scrollTop = 0;
        initialFormState = captureFormState();
        updatePrintContactAvailability();
        // An existing pin starts collapsed; no pin keeps the tools open.
        pinPanelOpen = !(lat !== null && lng !== null);
        updatePinUi();
        contactInfoSection.open = view !== "visits";
        contactVisitsSection.open = view === "visits";
        resolve();
      }, 150);
    });
  };

  btnOpenModal.addEventListener("click", async () => {
    contactEditorSession += 1;
    document.getElementById("btn-gps").disabled = false;
    contactForm.reset();
    lastCommittedContactCity = "";
    pendingContactCitySave = Promise.resolve(true);
    newContactCityContainer.hidden = true;
    newContactCityInput.value = "";
    setLocationStatus("");
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    document.getElementById("contact-id").value = "";
    document.getElementById("contact-record-id").hidden = true;
    contactSecondaryActions.hidden = true;
    [printContactButton, shareContactButton, exportContactButton].forEach(
      (button) => {
        button.disabled = true;
      },
    );
    const workingNeed = settings.workingNeedGreater;
    const workingInSelectedCountry =
      workingNeed.enabled && workingNeed.designation === "country";
    const newContactCountry = workingInSelectedCountry
      ? workingNeed.country
      : settings.country;
    const usePrimaryDefaults =
      normalizeCountry(newContactCountry) === settings.country;
    activeWorkingNeedDesignation = !workingNeed.enabled
      ? undefined
      : workingNeed.designation === "country"
        ? workingNeed.country
        : workingNeed.designation === "unassigned"
          ? "U"
          : "SW";
    contactCountrySelect.value = newContactCountry;
    contactCountrySelect.dataset.selectedCountry = contactCountrySelect.value;
    contactStateInput.value = usePrimaryDefaults ? settings.state || "" : "";
    citySelect.value = usePrimaryDefaults ? settings.defaultCity || "" : "";
    updateContactAddressingProfile(
      workingInSelectedCountry
        ? workingNeed.country
        : settings.addressingCountry,
    );
    lastCommittedContactCity = citySelect.value;
    updateContactLocationFields();
    dropdownHelpers.populateContactRegionArea("", "");
    document.getElementById("contact-lat").value = "";
    document.getElementById("contact-lng").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;
    document.getElementById("modal-notes-history-container").innerHTML =
      `<span style="color: #888;">${escapeHtml(appText("visits.noLogsYet", "No visit logs yet."))}</span>`;
    document.getElementById("modal-title").textContent = appText("contacts.addTitle", "Add Contact");
    await openModalWithCoords(null, null);
  });

  btnFindAddress.addEventListener("click", () => {
    setPinPanel(true);
    findAddressOnMap();
  });

  document.getElementById("btn-confirm-pin").addEventListener("click", () => {
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    setLocationStatus("");
    setPinPanel(false);
  });
  document
    .getElementById("btn-adjust-pin")
    .addEventListener("click", () => setPinPanel(true));
  const reopenPinForAddressChange = () => {
    if (pinPanelOpen || !document.getElementById("contact-lat").value.trim())
      return;
    setPinPanel(true);
    setLocationStatus(
      appText("map.addressChanged", "The address changed. Look up the pin again, or confirm the current pin."),
    );
  };
  [
    "contact-address",
    "contact-city-select",
    "contact-state",
    "contact-country",
    "contact-region-select",
    "contact-area-select",
  ].forEach((id) =>
    document
      .getElementById(id)
      .addEventListener("change", reopenPinForAddressChange),
  );
  btnFindCrossStreet.addEventListener("click", findCrossStreetOnMap);

  document
    .getElementById("contact-lat")
    .addEventListener("change", updatePickerLocationFromCoordinates);
  document
    .getElementById("contact-lng")
    .addEventListener("change", updatePickerLocationFromCoordinates);

  closeModal.addEventListener("click", attemptExit);
  document
    .getElementById("btn-add-another-contact")
    .addEventListener("click", async () => {
      if (
        captureFormState() !== initialFormState &&
        !await NRVDialogs.confirm(appText("contacts.discardNew", "Changes were made, discard them and add a new contact?"))
      ) {
        return;
      }
      btnOpenModal.click();
    });

  document.getElementById("btn-gps").addEventListener("click", () => {
    if (!pickerMap) {
      setLocationStatus(
        appText("map.stillLoading", "The map is still loading. Please try again in a moment."),
      );
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus(appText("map.deviceUnsupported", "Device location is not supported by this browser."));
      return;
    }
    const gpsButton = document.getElementById("btn-gps");
    const session = contactEditorSession;
    const latitudeInput = document.getElementById("contact-lat");
    const longitudeInput = document.getElementById("contact-lng");
    const previousLatitude = latitudeInput.value;
    const previousLongitude = longitudeInput.value;
    gpsButton.disabled = true;
    setLocationStatus(appText("map.gettingFreshDevice", "Getting a fresh device location..."));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (session !== contactEditorSession) return;
        try {
          if (latitudeInput.value !== previousLatitude || longitudeInput.value !== previousLongitude) {
            setLocationStatus(appText("map.gpsPinChanged", "The pin changed while locating the device. Your newer pin was kept."));
            return;
          }
          setPinPanel(true);
          setPickerLocation(
            position.coords.latitude,
            position.coords.longitude,
          );
          const accuracy = Math.round(position.coords.accuracy);
          setLocationStatus(
            Number.isFinite(accuracy)
              ? appText("map.gpsPinAccuracy", `Pin placed from device location (estimated accuracy: ${accuracy} m). You can move it on the map.`, { accuracy })
              : appText("map.gpsPinPlaced", "Pin placed from device location. You can move it on the map."),
          );
        } catch (error) {
          console.error("Invalid device location coordinates:", error);
          setLocationStatus(
            appText("map.gpsInvalidCoordinates", "The device returned invalid coordinates. Try the address lookup or place the pin manually."),
          );
        } finally {
          gpsButton.disabled = false;
        }
      },
      (error) => {
        if (session !== contactEditorSession) return;
        console.error("Unable to get device location:", error);
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? appText("map.gpsPermissionDenied", "Location permission was denied. Allow location access or set the pin from the address or map.")
            : appText("map.gpsLocationFailed", "Could not get a device location. Check location services or set the pin from the address or map."),
        );
        gpsButton.disabled = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });

  // Save Contact Handler
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = contactEditorSession;
    if (!(await pendingContactCitySave)) return;
    if (session !== contactEditorSession) return;
    if (citySelect.value === "__ADD_NEW__") {
      pendingContactCitySave = saveNewContactCity();
      if (!(await pendingContactCitySave) || session !== contactEditorSession) return;
    }
    const id = document.getElementById("contact-id").value;
    const firstName = document.getElementById("contact-firstname").value.trim();
    const lastName = document.getElementById("contact-lastname").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const phone = phoneInput.value.trim();
    const street = normalizeStreetForAddressing(
      streetAddressInput.value,
      selectedContactAddressingCountry,
    );
    const city = document.getElementById("contact-city-select").value.trim();
    const region = contactRegionSelect.value;
    const area = contactAreaSelect.value;
    const postalCode = document
      .getElementById("contact-postal-code")
      .value.trim();
    const country = normalizeCountry(contactCountrySelect.value);
    const state = normalizeLocationState(country, contactStateInput.value);
    if (!country) {
      await NRVDialogs.alert(appText("contacts.countryRequired", "Choose a country before saving this contact."));
      contactCountrySelect.focus();
      return;
    }
    streetAddressInput.value = street;
    contactStateInput.value = state;
    const lat = document.getElementById("contact-lat").value.trim();
    const lng = document.getElementById("contact-lng").value.trim();
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      await NRVDialogs.alert(appText("contacts.emailInvalid", "Enter an email address in the format name@example.com."));
      document.getElementById("contact-email").focus();
      return;
    }
    if (phone && !/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) {
      await NRVDialogs.alert(appText("contacts.phoneInvalid", "Enter a 10-digit phone number in the format (555) 123-4567."));
      phoneInput.focus();
      return;
    }
    if (!city || !hasLocation(settings.cities, country, city)) {
      await NRVDialogs.alert(appText("contacts.cityRequired", "Choose or add a city before saving this contact."));
      citySelect.focus();
      return;
    }
    if (
      (region && !hasLocation(settings.regions, country, region)) ||
      (area && !hasLocation(settings.areas, country, area))
    ) {
      await NRVDialogs.alert(appText("contacts.locationInvalid", "Choose a region and area from the saved lists."));
      return;
    }
    if (
      (lat || lng) &&
      (!Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180)
    ) {
      await NRVDialogs.alert(
        "Enter valid latitude and longitude coordinates, or clear both fields.",
      );
      return;
    }

    contactEditorSession += 1;
    document.getElementById("btn-gps").disabled = false;
    const newNoteText = document.getElementById("contact-notes").value.trim();
    const newNoteTimestampVal =
      document.getElementById("new-log-timestamp").value;
    // A changed visit date is kept even when no note text was typed.
    const logVisit =
      Boolean(newNoteText) ||
      document.getElementById("new-log-timestamp").dataset.touched === "1";

    const addressingContact = {
      streetAddress: street,
      area,
      region,
      city,
      state,
      postalCode,
      country,
    };
    const fullAddress = getFormattedContactAddress(
      addressingContact,
      selectedContactAddressingCountry,
    );

    let targetId = id;

    if (id) {
      const contact = contacts.find((c) => c.id == id);
      if (contact) {
        contact.firstName = firstName;
        contact.lastName = lastName;
        contact.email = email;
        contact.phone = phone;
        contact.address = fullAddress;
        contact.streetAddress = street;
        contact.country = country;
        contact.city = city;
        contact.state = state;
        contact.region = region;
        contact.area = area;
        contact.postalCode = postalCode;
        contact.addressingCountry = selectedContactAddressingCountry;
        if (activeWorkingNeedDesignation) {
          contact.workingNeedDesignation = activeWorkingNeedDesignation;
        } else {
          delete contact.workingNeedDesignation;
        }
        contact.lat = lat;
        contact.lng = lng;

        if (logVisit) {
          if (!contact.notesHistory) contact.notesHistory = [];
          const logDate = newNoteTimestampVal
            ? new Date(newNoteTimestampVal)
            : new Date();
          contact.notesHistory.push({
            id: "log_" + Date.now(),
            rawDate: logDate.toISOString(),
            date: logDate.toLocaleString(),
            text: newNoteText,
          });
        }
      }
    } else {
      const logDate = newNoteTimestampVal
        ? new Date(newNoteTimestampVal)
        : new Date();
      const notesHistory = logVisit
        ? [
            {
              id: "log_" + Date.now(),
              rawDate: logDate.toISOString(),
              date: logDate.toLocaleString(),
              text: newNoteText,
            },
          ]
        : [];

      targetId = Date.now();
      while (
        contacts.some((contact) => String(contact.id) === String(targetId))
      ) {
        targetId += 1;
      }
      const newContact = {
        id: targetId,
        createdAt: new Date().toISOString(),
        firstName,
        lastName,
        email,
        phone,
        address: fullAddress,
        streetAddress: street,
        country,
        city,
        region,
        state,
        area,
        postalCode,
        addressingCountry: selectedContactAddressingCountry,
        ...(activeWorkingNeedDesignation
          ? { workingNeedDesignation: activeWorkingNeedDesignation }
          : {}),
        lat,
        lng,
        notesHistory,
      };
      contacts.push(newContact);
      document.getElementById("contact-id").value = targetId;
    }

    if (!(await saveContacts())) return;

    document.getElementById("contact-notes").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;
    initialFormState = captureFormState();

    editContact(targetId, contactVisitsSection.open ? "visits" : "info");
    // Re-baseline right after the form is repopulated so a quick close is not seen as unsaved.
    initialFormState = captureFormState();
    await NRVDialogs.alert(appText("contacts.saved", "Contact saved successfully!"));
    initialFormState = captureFormState();
  });

  document
    .getElementById("new-log-timestamp")
    .addEventListener("change", (event) => {
      event.target.dataset.touched = "1";
    });

  // Render Contacts List
  // Render Contacts List
  const updateCopyNotice = () => {
    const notice = document.getElementById("copy-notice");
    const isInstalled = isInstalledApp();
    let browserPreview = false;
    try {
      browserPreview = localStorage.getItem(LAUNCH_MODE_KEY) === "browser";
    } catch (error) {
      console.error("Unable to read the selected launch mode:", error);
    }
    let kind = "";
    if (isInstalled && !contacts.length) kind = "empty-installed";
    else if (!isInstalled && (contacts.length || browserPreview)) kind = "browser-copy";

    try {
      if (kind && localStorage.getItem(`return_visits_copy_notice_${kind}`)) {
        kind = "";
      }
    } catch (error) {
      console.error("Unable to read the copy notice status:", error);
    }
    notice.dataset.kind = kind;
    notice.hidden = !kind;
    if (!kind) return;
    const helpPage = window.NRVI18n?.getLanguage() === "es" ? "./help-es.html" : "./help.html";
    document.getElementById("copy-notice-link").href =
      helpPage + (kind === "empty-installed" ? "#backup" : "#install-guide");
    document.getElementById("copy-notice-text").textContent =
      kind === "empty-installed"
        ? appText("contacts.emptyInstalled", "This installed copy is empty. If you already added contacts in your browser, open the app in that browser, go to Settings → Backup/Restore and back up, then restore here. Or connect Dropbox in both copies.")
        : appText("contacts.browserCopy", "You're using NRV in a browser. You can keep using it here, but we recommend installing the NRV icon for regular use. Information saved in a browser can sometimes be lost, so remember to make backups.");
    const installButton = document.getElementById("btn-copy-notice-install");
    installButton.hidden = kind !== "browser-copy";
    installButton.onclick = () => window.nrvBeginBrowserInstall({
      returnToApp: true,
      statusElement: document.getElementById("copy-notice-install-status"),
      buttonElement: installButton,
    });
  };
  document
    .getElementById("btn-copy-notice-dismiss")
    .addEventListener("click", () => {
      const notice = document.getElementById("copy-notice");
      try {
        localStorage.setItem(
          `return_visits_copy_notice_${notice.dataset.kind}`,
          "1",
        );
        if (notice.dataset.kind === "browser-copy") {
          localStorage.setItem(LAUNCH_MODE_KEY, "browser");
        }
      } catch (error) {
        console.error("Unable to save the browser-use choice:", error);
      }
      notice.hidden = true;
    });

  const updateWorkingNeedFilterOptions = () => {
    const filter = document.getElementById("filter-working-need");
    const selected = filter.value || "all";
    filter.replaceChildren();
    [
      ["all", "filter.allContacts", "All Contacts"],
      ["working", "filter.allWorkingNeed", "All Working Need Greater"],
    ].forEach(([value, key, fallback]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = appText(key, fallback);
      filter.appendChild(option);
    });
    const designations = [
      ...new Set(
        contacts
          .map((contact) => normalizeWorkingDesignation(contact.workingNeedDesignation))
          .filter(Boolean),
      ),
    ];
    designations
      .filter((designation) => designation !== "U" && designation !== "SW")
      .sort((a, b) => a.localeCompare(b))
      .forEach((country) => {
        const option = document.createElement("option");
        option.value = JSON.stringify(["country", country]);
        option.textContent = displayCountry(country);
        filter.appendChild(option);
      });
    [
      ["U", "filter.unassigned", "Unassigned"],
      ["SW", "filter.seldomWorked", "Seldom Worked"],
    ].forEach(([designation, key, fallback]) => {
      const option = document.createElement("option");
      option.value = `designation:${designation}`;
      option.textContent = appText(key, fallback);
      filter.appendChild(option);
    });
    filter.value = Array.from(filter.options).some(
      (option) => option.value === selected,
    )
      ? selected
      : "all";
  };

  const matchesWorkingNeedFilter = (contact, filter) => {
    const designation = normalizeWorkingDesignation(
      contact.workingNeedDesignation,
    );
    if (filter === "working") return Boolean(designation);
    if (filter.startsWith("designation:")) {
      return designation === filter.slice("designation:".length);
    }
    if (filter.startsWith("[")) {
      try {
        const [type, country] = JSON.parse(filter);
        return type === "country" && designation === country;
      } catch (error) {
        console.error("Invalid Working Need Greater filter selection:", error);
        return false;
      }
    }
    return true;
  };

  const renderContacts = () => {
    updateCopyNotice();
    renderGoalAcknowledgement();
    updateWorkingNeedFilterOptions();
    populateMapLocationOptions();
    if (document.body.classList.contains("map-view-active")) {
      populateMapGeographicFilters();
    }
    const listContainer = document.getElementById("contacts-list");
    const searchTerm = document
      .getElementById("search-input")
      .value.toLowerCase();
    const filterUrgency = document.getElementById("filter-urgency").value;
    const filterWorkingNeed = document.getElementById(
      "filter-working-need",
    ).value;
    const filterCity = document.getElementById("filter-city").value;
    const filterRegion = document.getElementById("filter-region").value;
    const filterArea = document.getElementById("filter-area").value;
    const sortMode = document.getElementById("sort-select").value;

    let filtered = contacts.filter((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const addr = [c.address, getFormattedContactAddress(c)].filter(Boolean).join(", ").toLowerCase();
      const areasMatch = getContactAreas(c).some((area) =>
        area.toLowerCase().includes(searchTerm),
      );
      const notesMatch =
        c.notesHistory &&
        c.notesHistory.some((n) => n.text.toLowerCase().includes(searchTerm));
      const textMatch =
        fullName.includes(searchTerm) ||
        (c.email || "").toLowerCase().includes(searchTerm) ||
        (c.phone || "").includes(searchTerm) ||
        addr.includes(searchTerm) ||
        areasMatch ||
        notesMatch;

      const status = getContactStatus(c);
      const urgencyMatch = !filterUrgency || status.label === filterUrgency;
      const cityMatch = !filterCity || c.city === filterCity;
      const regionMatch = !filterRegion || c.region === filterRegion;
      const areaMatch = !filterArea || c.area === filterArea;
      return (
        textMatch &&
        matchesWorkingNeedFilter(c, filterWorkingNeed) &&
        urgencyMatch &&
        cityMatch &&
        regionMatch &&
        areaMatch
      );
    });

    const lastContactTime = (c) => {
      const t = new Date(
        c.notesHistory && c.notesHistory.length
          ? c.notesHistory.reduce((latest, n) => {
              const d = new Date(n.rawDate || n.date);
              return d > latest ? d : latest;
            }, new Date(0))
          : c.createdAt,
      ).getTime();
      return Number.isNaN(t) ? 0 : t;
    };

    filtered.sort((a, b) => {
      if (sortMode === "chronological-asc")
        return lastContactTime(a) - lastContactTime(b);
      if (sortMode === "chronological-desc")
        return lastContactTime(b) - lastContactTime(a);
      if (sortMode === "alphabetical")
        return a.firstName.localeCompare(b.firstName);
    });

    listContainer.innerHTML = "";
    if (filtered.length === 0) {
      visibleContacts = [];
      updatePrintVisibleButton();
      const empty = document.createElement("p");
      empty.textContent = appText("contacts.noMatches", "No matching contacts found.");
      listContainer.appendChild(empty);
      if (map) renderMapMarkers();
      return;
    }

    visibleContacts = [...filtered];
    updatePrintVisibleButton();
    if (map) renderMapMarkers();
    filtered.forEach((contact, cardIndex) => {
      const card = document.createElement("div");
      const status = getContactStatus(contact);
      const navigationUrl = getNavigationUrl(contact);
      let urgencyClass = "contact-card";
      if (status.class === "urgent") urgencyClass += " urgent";
      if (status.class === "immediate") urgencyClass += " immediate";
      card.className = urgencyClass;

      const sortedNotes = [...(contact.notesHistory || [])].sort(
        (a, b) =>
          new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      const lastNote = sortedNotes[0];
      const lastVisitDate = lastNote
        ? new Date(lastNote.rawDate || lastNote.date)
        : null;
      const lastVisitHtml =
        lastVisitDate && !Number.isNaN(lastVisitDate.getTime())
          ? `<br><small>${escapeHtml(appText("contacts.lastVisit", `Last visit: ${lastVisitDate.toLocaleDateString()}`, { date: lastVisitDate.toLocaleDateString() }))} • ${escapeHtml(appText("contacts.visitCount", `${sortedNotes.length} visit note${sortedNotes.length === 1 ? "" : "s"}`, { count: sortedNotes.length }))}</small>`
          : `<br><small style="color: #888;">${escapeHtml(appText("contacts.noVisits", "No visit notes yet"))}</small>`;
      const lastNoteText = lastNote && (lastNote.text || "").trim();
      const lastNoteHtml = lastNoteText
        ? `<br><small class="card-last-note">${escapeHtml(lastNoteText.length > 140 ? lastNoteText.slice(0, 140) + "…" : lastNoteText)}</small>`
        : "";
      const contactFullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      const matchedOnlyInNotes =
        searchTerm &&
        !contactFullName.includes(searchTerm) &&
        !(contact.email || "").toLowerCase().includes(searchTerm) &&
        !(contact.phone || "").includes(searchTerm) &&
        ![contact.address, getFormattedContactAddress(contact)]
          .filter(Boolean)
          .join(", ")
          .toLowerCase()
          .includes(searchTerm) &&
        !getContactAreas(contact).some((area) =>
          area.toLowerCase().includes(searchTerm),
        );
      const noteMatchHtml = matchedOnlyInNotes
        ? `<br><small style="color: #004080; font-weight: bold;">${escapeHtml(appText("contacts.noteMatch", "Matches a visit note"))}</small>`
        : "";

      const fullName = `${contact.firstName} ${contact.lastName}`;
      const navigateLabel = appText("contacts.navigate", `Navigate to ${fullName}`, { name: fullName });
      const shareLabel = appText("contacts.share", `Share ${fullName}`, { name: fullName });
      const addVisit = escapeHtml(appText("contacts.addVisit", "Add a visit"));
      if (contact.workingNeedDesignation) {
        card.classList.add("has-working-need-marker");
      }
      card.innerHTML = `
                ${contact.workingNeedDesignation ? `<small class="working-need-marker" aria-label="${escapeHtml(appText("contacts.workingNeedMarker", `Working designation: ${contact.workingNeedDesignation}`, { designation: contact.workingNeedDesignation }))}">${escapeHtml(contact.workingNeedDesignation)}</small>` : ""}
                <strong><span class="contact-number" title="${escapeHtml(appText("contacts.mapNumber", "Matches the number on the map pin"))}">${cardIndex + 1}.</span> ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</strong><br>
                <small class="contact-record-id">${escapeHtml(appText("contacts.id", `Contact ID: ${contact.id}`, { id: contact.id }))}</small><br>
                <small>${escapeHtml(getFormattedContactAddress(contact) || appText("contacts.noAddress", "No address provided"))}</small><br>
                <small>${escapeHtml(getContactLocationSummary(contact))}</small><br>
                ${contact.phone ? `<small>${escapeHtml(appText("contacts.phoneValue", `Phone: ${contact.phone}`, { value: contact.phone }))}</small><br>` : ""}
                ${contact.email ? `<small>${escapeHtml(appText("contacts.emailValue", `Email: ${contact.email}`, { value: contact.email }))}</small><br>` : ""}
                <span>${escapeHtml(appText("contacts.daysSince", "Days Since Last Contact:"))} <strong>${escapeHtml(appText("contacts.dayCount", `${status.days} days`, { count: status.days }))}</strong> (${escapeHtml(getStatusDisplay(status))})</span>
                ${lastVisitHtml}
                ${lastNoteHtml}
                ${noteMatchHtml}
                <div class="card-actions">
                    <button class="btn-icon" data-contact-action="quick-visit" data-contact-id="${escapeHtml(String(contact.id))}" title="${addVisit}" aria-label="${addVisit}"><span class="btn-add-visit">${escapeHtml(appText("contacts.addVisitLine1", "ADD"))}<br>${escapeHtml(appText("contacts.addVisitLine2", "VISIT"))}</span></button>
                    <button class="btn-icon" data-contact-action="edit" data-contact-id="${escapeHtml(String(contact.id))}" title="${escapeHtml(appText("contacts.editDetails", "Edit Details"))}">✏️</button>
                    ${navigationUrl ? `<a class="btn-icon navigate-contact" href="${escapeHtml(navigationUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(navigateLabel)}" title="${escapeHtml(navigateLabel)}"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="6" cy="19" r="2" fill="currentColor"/><path d="M6 16V9a4 4 0 0 1 4-4h8m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg></a>` : ""}
                    <button class="btn-icon share-contact-card" data-contact-action="share" data-contact-id="${escapeHtml(String(contact.id))}" title="${escapeHtml(shareLabel)}" aria-label="${escapeHtml(shareLabel)}"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg></button>
                    <button class="btn-icon delete" data-contact-action="delete" data-contact-id="${escapeHtml(String(contact.id))}" title="${escapeHtml(appText("contacts.delete", "Delete Contact"))}">🗑️</button>
                </div>
            `;
      listContainer.appendChild(card);
      card.querySelectorAll("[data-contact-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.contactId;
          if (button.dataset.contactAction === "quick-visit") {
            window.addQuickVisit(id);
          } else if (button.dataset.contactAction === "edit") {
            window.editContact(id);
          } else if (button.dataset.contactAction === "share") {
            window.shareContact(id);
          } else if (button.dataset.contactAction === "delete") {
            window.deleteContact(id);
          }
        });
      });
    });
  };

  const filtersBar = document.getElementById("filters-bar");
  const contactFilterControls = document.getElementById(
    "contact-filter-controls",
  );
  const mapFilterControlSlot = document.getElementById(
    "map-filter-control-slot",
  );
  const mapChangeViewDialog = document.getElementById(
    "map-change-view-dialog",
  );
  const setMapFilterPlacement = (inMapView) => {
    const changeViewButton = document.getElementById("btn-map-change-view");
    if (inMapView) {
      document.body.classList.add("map-view-active");
      mapFilterControlSlot.appendChild(contactFilterControls);
      changeViewButton.hidden = false;
      populateMapLocationOptions();
      populateMapGeographicFilters();
      updateMapChangeViewIndicator();
      return;
    }
    if (mapChangeViewDialog.open) mapChangeViewDialog.close();
    document.body.classList.remove("map-view-active");
    filtersBar.appendChild(contactFilterControls);
    changeViewButton.hidden = true;
    populateDropdowns();
  };
  let mapViewSnapshot = null;
  const openMapChangeView = () => {
    populateMapLocationOptions();
    populateMapGeographicFilters();
    mapViewSnapshot = {
      location: selectedMapLocation,
      locationIsDefault: mapLocationIsDefault,
      workingNeed: document.getElementById("filter-working-need").value,
      urgency: document.getElementById("filter-urgency").value,
      city: document.getElementById("filter-city").value,
      region: document.getElementById("filter-region").value,
      area: document.getElementById("filter-area").value,
      sort: document.getElementById("sort-select").value,
    };
    mapChangeViewDialog.showModal();
    mapLocationSelect.focus();
  };
  const cancelMapChangeView = () => {
    if (!mapViewSnapshot) return;
    selectedMapLocation = mapViewSnapshot.location;
    mapLocationIsDefault = mapViewSnapshot.locationIsDefault;
    mapLocationSelect.value = selectedMapLocation;
    document.getElementById("filter-working-need").value =
      mapViewSnapshot.workingNeed;
    document.getElementById("filter-urgency").value =
      mapViewSnapshot.urgency;
    document.getElementById("filter-city").value = mapViewSnapshot.city;
    document.getElementById("filter-region").value = mapViewSnapshot.region;
    document.getElementById("filter-area").value = mapViewSnapshot.area;
    document.getElementById("sort-select").value = mapViewSnapshot.sort;
    mapViewSnapshot = null;
    populateMapGeographicFilters();
    renderContacts();
    updateMapChangeViewIndicator();
  };
  document
    .getElementById("btn-map-change-view")
    .addEventListener("click", openMapChangeView);
  mapLocationSelect.addEventListener("change", () => {
    selectedMapLocation = mapLocationSelect.value;
    mapLocationIsDefault = false;
    populateMapGeographicFilters();
    renderContacts();
    updateMapChangeViewIndicator();
  });
  document
    .getElementById("map-change-view-apply")
    .addEventListener("click", () => {
      mapViewSnapshot = null;
      mapChangeViewDialog.close();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("map-change-view-cancel")
    .addEventListener("click", () => {
      cancelMapChangeView();
      mapChangeViewDialog.close();
    });
  document
    .getElementById("map-change-view-reset")
    .addEventListener("click", () => {
      mapLocationIsDefault = true;
      selectedMapLocation = getMapDefaultLocation();
      mapLocationSelect.value = selectedMapLocation;
      document.getElementById("filter-working-need").value = "all";
      document.getElementById("filter-urgency").value = "";
      document.getElementById("filter-city").value = "";
      document.getElementById("filter-region").value = "";
      document.getElementById("filter-area").value = "";
      document.getElementById("sort-select").value = "chronological-desc";
      populateMapGeographicFilters();
      renderContacts();
      updateMapChangeViewIndicator();
    });
  mapChangeViewDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelMapChangeView();
    mapChangeViewDialog.close();
  });

  const getSortedVisitNotes = (contact) =>
    [...(contact.notesHistory || [])].sort((a, b) => {
      const dateA = new Date(a.rawDate || a.date || 0).getTime();
      const dateB = new Date(b.rawDate || b.date || 0).getTime();
      return (Number.isFinite(dateB) ? dateB : 0) -
        (Number.isFinite(dateA) ? dateA : 0);
    });

  const getPrintableNoteDate = (note) => {
    const parsedDate = new Date(note.rawDate || note.date || "");
    return Number.isNaN(parsedDate.getTime())
      ? note.date || appText("print.dateNotRecorded", "Date not recorded")
      : parsedDate.toLocaleString();
  };

  const getPrintGroup = (contact) => {
    if (contact.area || contact.region) {
      const location = [contact.city, contact.region, contact.area]
        .filter(Boolean)
        .join(" → ");
      const sortTitle = location + (contact.area ? "" : " (No area assigned)");
      return {
        key: JSON.stringify([
          "location",
          contact.city,
          contact.region,
          contact.area,
        ]),
        title: contact.area ? location : appText("print.noAreaGroup", sortTitle, { location }),
        sortTitle,
      };
    }
    if (contact.city) {
      return {
        key: JSON.stringify(["city", contact.city]),
        title: appText("print.noRegionAreaGroup", `${contact.city} (No region or area assigned)`, { city: contact.city }),
        sortTitle: `${contact.city} (No region or area assigned)`,
      };
    }
    return {
      key: JSON.stringify(["unassigned"]),
      title: appText("print.noLocationGroup", "No location assigned"),
      sortTitle: "No location assigned",
    };
  };

  const printContactEntry = (contact) => {
    const latestNote = getSortedVisitNotes(contact)[0];
    const formattedAddress =
      getFormattedContactAddress(contact) ||
      appText("print.noStreet", "No street address recorded");
    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    return `
      <article class="print-contact-entry">
        <h3>${escapeHtml(fullName)}</h3>
        <p class="print-contact-id">${escapeHtml(appText("contacts.id", `Contact ID: ${contact.id}`, { id: contact.id }))}</p>
        <p class="print-contact-address">${escapeHtml(formattedAddress)}</p>
        ${contact.phone ? `<p>${escapeHtml(appText("contacts.phoneValue", `Phone: ${contact.phone}`, { value: contact.phone }))}</p>` : ""}
        ${contact.email ? `<p>${escapeHtml(appText("contacts.emailValue", `Email: ${contact.email}`, { value: contact.email }))}</p>` : ""}
        <div class="print-latest-note">
          <strong>${escapeHtml(appText("print.mostRecentNote", "Most recent note:"))}</strong>
          ${
            latestNote
              ? `<p class="print-note-date">${escapeHtml(getPrintableNoteDate(latestNote))}</p><p class="print-note">${escapeHtml(latestNote.text)}</p>`
              : `<p class="print-note">${escapeHtml(appText("print.noVisitNotes", "No visit notes recorded."))}</p>`
          }
        </div>
      </article>
    `;
  };

  const printContainer = document.getElementById("print-container");
  const printContent = async (title, subtitle, content) => {
    printContainer.innerHTML = `
      <header class="print-header">
        <h1>${escapeHtml(title)}</h1>
        <p class="print-subtitle">${escapeHtml(subtitle)}</p>
      </header>
      ${content}
    `;
    printContainer.hidden = false;
    printContainer.setAttribute("aria-hidden", "false");
    try {
      window.print();
    } catch (error) {
      printContainer.hidden = true;
      printContainer.setAttribute("aria-hidden", "true");
      console.error("Unable to open the print dialog:", error);
      await NRVDialogs.alert(appText("print.openFailed", "Could not open the print dialog. Please try again."));
    }
  };

  window.addEventListener("afterprint", () => {
    printContainer.hidden = true;
    printContainer.setAttribute("aria-hidden", "true");
    printContainer.replaceChildren();
  });

  const printSettings = async () => {
    const nameList = (labelKey, labelFallback, names) =>
      names.length
        ? `<li>${escapeHtml(appText(labelKey, labelFallback))} ${names
            .map((name) => escapeHtml(name))
            .join(", ")}</li>`
        : "";
    const locationCountries = [
      ...new Set(
        [...settings.cities, ...settings.regions, ...settings.areas].map(
          (item) => item.country,
        ),
      ),
    ].sort(compareNames);
    const rows = locationCountries
      .map((country) => {
        const listItems = [
          nameList("print.cities", "Cities:", locationNamesFor(settings.cities, country)),
          nameList("print.regions", "Regions:", locationNamesFor(settings.regions, country)),
          nameList("print.areas", "Areas:", locationNamesFor(settings.areas, country)),
        ].join("");
        return listItems
          ? `<h3>${escapeHtml(displayCountry(country))}</h3><ul>${listItems}</ul>`
          : "";
      })
      .join("");
    await printContent(
      appText("settings.title", "Settings"),
      new Date().toLocaleDateString(),
      `<section class="print-location-group">
        <p>${escapeHtml(appText("print.defaultCountry", `Default country: ${settings.country || "Not set"}`, { value: settings.country || appText("print.notSet", "Not set") }))}</p>
        <p>${escapeHtml(appText("print.defaultState", `Default state / province: ${settings.state || "Not set"}`, { value: settings.state || appText("print.notSet", "Not set") }))}</p>
        <p>${escapeHtml(appText("print.defaultCity", `Default city: ${settings.defaultCity || "Not set"}`, { value: settings.defaultCity || appText("print.notSet", "Not set") }))}</p>
        ${
          settings.me && (settings.me.name || settings.me.street || settings.me.city)
            ? `<p>${escapeHtml(appText("print.yourDetails", "Your details:"))} ${escapeHtml(
              [settings.me.name, settings.me.street, settings.me.area, settings.me.region, settings.me.city, settings.me.state, settings.me.postalCode, settings.me.country]
                  .filter(Boolean)
                  .join(", "),
              )}</p>`
            : ""
        }
        <p>${escapeHtml(appText("print.passphrase", `Passphrase: ${encryptionKey ? "On" : "Off"}`, { value: encryptionKey ? appText("print.on", "On") : appText("print.off", "Off") }))}</p>
        <h2>${escapeHtml(appText("print.locationsHeading", "Cities, regions and areas"))}</h2>
        ${rows || `<p>${escapeHtml(appText("print.none", "None."))}</p>`}
      </section>`,
    );
  };

  const printVisibleContacts = async () => {
      if (!visibleContacts.length) return;
      const count = visibleContacts.length;
      if (
        !await NRVDialogs.confirm(
          appText("print.visibleConfirm", `Print ${count} visible contact${count === 1 ? "" : "s"}? The printout will include only the most recent note for each contact.`, { count }),
        )
      ) {
        return;
      }

      const groups = new Map();
      visibleContacts.forEach((contact) => {
        const group = getPrintGroup(contact);
        if (!groups.has(group.key)) {
          groups.set(group.key, { title: group.title, sortTitle: group.sortTitle, contacts: [] });
        }
        groups.get(group.key).contacts.push(contact);
      });
      const content = [...groups.values()]
        .sort((a, b) => a.sortTitle.localeCompare(b.sortTitle))
        .map(
          (group) => `
            <section class="print-location-group">
              <h2>${escapeHtml(group.title)}</h2>
              ${group.contacts
                .sort((a, b) => {
                  const nameA = `${a.lastName} ${a.firstName}`.trim();
                  const nameB = `${b.lastName} ${b.firstName}`.trim();
                  return (
                    nameA.localeCompare(nameB) ||
                    String(a.id).localeCompare(String(b.id))
                  );
                })
                .map(printContactEntry)
                .join("")}
            </section>
          `,
        )
        .join("");
      await printContent(
        appText("print.visibleTitle", "Visible Contacts"),
        appText("print.visibleSubtitle", `${count} contact${count === 1 ? "" : "s"} • most recent note per contact • ${new Date().toLocaleDateString()}`, { count, date: new Date().toLocaleDateString() }),
        content,
      );
    };

  // Prints the same numbered list the map pins use, then any contacts
  // that have no pin.
  const printMapList = async (detail) => {
    const mapContacts = getVisibleMapContacts();
    const precisePins = mapContacts.filter(hasContactCoordinates);
    const approximateCityPins = new Map();
    mapContacts.forEach((contact) => {
      if (hasContactCoordinates(contact) || !contact.city) return;
      const query = getCityPinQuery(contact);
      if (!cityPinCoordinates.get(query)) return;
      if (!approximateCityPins.has(query)) {
        approximateCityPins.set(query, {
          city: contact.city,
          state: normalizeLocationState(
            contact.country || settings.country,
            contact.state || settings.state,
          ),
          country: contact.country || settings.country,
          contacts: [],
        });
      }
      approximateCityPins.get(query).contacts.push(contact);
    });
    const approximateContacts = new Set(
      [...approximateCityPins.values()].flatMap((group) => group.contacts),
    );
    const unpinned = mapContacts.filter(
      (contact) =>
        !hasContactCoordinates(contact) && !approximateContacts.has(contact),
    );
    const entry = (contact, number, approximateCity = "") => {
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      const address =
        getFormattedContactAddress(contact) ||
        (approximateCity
          ? appText("print.approximateCity", `Approximate city location: ${approximateCity}`, { city: approximateCity })
          : "") ||
        appText("print.noStreet", "No street address recorded");
      const latestNote = getSortedVisitNotes(contact)[0];
      return `
        <article class="print-contact-entry">
          <h3>${number ? `${number}. ` : ""}${escapeHtml(name)}</h3>
          <p class="print-contact-address">${escapeHtml(address)}</p>
          ${
            detail === "details"
              ? `${contact.phone ? `<p>${escapeHtml(appText("contacts.phoneValue", `Phone: ${contact.phone}`, { value: contact.phone }))}</p>` : ""}
                 ${contact.email ? `<p>${escapeHtml(appText("contacts.emailValue", `Email: ${contact.email}`, { value: contact.email }))}</p>` : ""}
                 <p>${escapeHtml(appText("print.locationValue", `Location: ${getContactLocationSummary(contact)}`, { value: getContactLocationSummary(contact) }))}</p>
                 <p>${latestNote ? `${escapeHtml(appText("print.lastVisitDate", `Last visit ${getPrintableNoteDate(latestNote)}:`, { date: getPrintableNoteDate(latestNote) }))} ${escapeHtml(latestNote.text)}` : escapeHtml(appText("print.noVisitNotes", "No visit notes recorded."))}</p>`
              : ""
          }
        </article>`;
    };
    let nextCityPinNumber = precisePins.length + 1;
    const cityPinContent = [...approximateCityPins.values()]
      .map((group) => {
        const number = nextCityPinNumber++;
        const cityLabel = [group.city, group.state, group.country]
          .filter(Boolean)
          .join(", ");
        return group.contacts
        .map((contact) => entry(contact, number, cityLabel))
        .join("");
      })
      .join("");
    const pinCount = precisePins.length + approximateCityPins.size;
    const content = `
      <section class="print-location-group">
        <h2>${escapeHtml(appText("print.mapPins", "Map pins"))}</h2>
        ${precisePins.map((contact, index) => entry(contact, index + 1)).join("")}
        ${cityPinContent}
        ${pinCount ? "" : `<p>${escapeHtml(appText("print.noPins", "No pins."))}</p>`}
      </section>
      ${
        unpinned.length
          ? `<section class="print-location-group"><h2>${escapeHtml(appText("print.noMapPin", "No map pin"))}</h2>${unpinned.map((c) => entry(c, 0)).join("")}</section>`
          : ""
      }`;
    await printContent(
      appText("print.mapContactsTitle", "Map Contacts"),
      appText("print.mapLocationCount", `${pinCount} map location${pinCount === 1 ? "" : "s"} • ${new Date().toLocaleDateString()}`, { count: pinCount, date: new Date().toLocaleDateString() }),
      content,
    );
  };

  const mapPrintDialog = document.getElementById("map-print-dialog");
  const requestMapPrint = async () => {
    if (!getVisibleMapContacts().length) {
      await NRVDialogs.alert(appText("print.noContacts", "There are no contacts to print."));
      return;
    }
    mapPrintDialog.showModal();
  };
  document.getElementById("map-print-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const detail = new FormData(e.target).get("map-print-detail");
    mapPrintDialog.close();
    await printMapList(detail);
  });
  document
    .getElementById("cancel-map-print")
    .addEventListener("click", () => mapPrintDialog.close());

  const contactPrintDialog = document.getElementById("contact-print-dialog");
  const contactPrintForm = document.getElementById("contact-print-form");
  const printContactDescription = document.getElementById(
    "contact-print-description",
  );
  let selectedContactToPrint = null;

  const getSavedContactFromEditor = () => {
    const contactId = document.getElementById("contact-id").value;
    return contacts.find((contact) => String(contact.id) === String(contactId));
  };

  shareContactButton.addEventListener("click", async () => {
    if (shareContactButton.disabled) return;
    const contact = getSavedContactFromEditor();
    if (!contact) {
      await NRVDialogs.alert(appText("contacts.saveBeforeShare", "Save this contact before sharing."));
      return;
    }
    openContactShareDialog(contact);
  });

  exportContactButton.addEventListener("click", async () => {
    if (exportContactButton.disabled) return;
    const contact = getSavedContactFromEditor();
    if (!contact) {
      await NRVDialogs.alert(appText("contacts.saveBeforeExport", "Save this contact before exporting."));
      return;
    }
    exportContact(contact);
  });

  printContactButton.addEventListener("click", async () => {
    if (printContactButton.disabled) return;
    const contactId = document.getElementById("contact-id").value;
    selectedContactToPrint = contacts.find(
      (contact) => String(contact.id) === String(contactId),
    );
    if (!selectedContactToPrint) {
      await NRVDialogs.alert(appText("contacts.saveBeforePrint", "Save this contact before printing."));
      return;
    }
    const fullName =
      `${selectedContactToPrint.firstName} ${selectedContactToPrint.lastName}`.trim();
    printContactDescription.textContent = appText("print.chooseContactNotes", `Choose which visit notes to print for ${fullName} (ID ${selectedContactToPrint.id}).`, { name: fullName, id: selectedContactToPrint.id });
    contactPrintForm.elements.namedItem("print-notes").value = "latest";
    contactPrintDialog.showModal();
  });

  document
    .getElementById("cancel-contact-print")
    .addEventListener("click", () => {
      contactPrintDialog.close();
      selectedContactToPrint = null;
    });

  contactPrintDialog.addEventListener("cancel", () => {
    selectedContactToPrint = null;
  });

  contactPrintForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedContactToPrint) return;
    const contact = selectedContactToPrint;
    const includeAllNotes =
      contactPrintForm.elements.namedItem("print-notes").value === "all";
    const notes = getSortedVisitNotes(contact);
    const selectedNotes = includeAllNotes ? notes : notes.slice(0, 1);
    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    const formattedAddress =
      getFormattedContactAddress(contact) ||
      "No street address recorded";
    const location = getContactLocationSummary(contact);
    const notesMarkup = selectedNotes.length
      ? selectedNotes
          .map(
            (note) => `
              <article class="print-note-entry">
                <p class="print-note-date">${escapeHtml(getPrintableNoteDate(note))}</p>
                <p class="print-note-text">${escapeHtml(note.text)}</p>
              </article>
            `,
          )
          .join("")
      : '<p>No visit notes recorded.</p>';

    contactPrintDialog.close();
    selectedContactToPrint = null;
    await printContent(
      fullName,
      `Contact ID: ${contact.id} • ${includeAllNotes ? "all visit notes" : "most recent note only"} • ${new Date().toLocaleDateString()}`,
      `
        <article class="print-single-contact">
          <h2>${escapeHtml(fullName)}</h2>
          <p>${escapeHtml(formattedAddress)}</p>
          ${contact.phone ? `<p>Phone: ${escapeHtml(contact.phone)}</p>` : ""}
          ${contact.email ? `<p>Email: ${escapeHtml(contact.email)}</p>` : ""}
          <p class="print-single-location">${escapeHtml(location)}</p>
          <p class="print-contact-id">Contact ID: ${escapeHtml(contact.id)}</p>
          <section class="print-notes">
            <h3>${includeAllNotes ? "Visit history" : "Most recent note"}</h3>
            ${notesMarkup}
          </section>
        </article>
      `,
    );
  });

  // Render Leaflet Map Markers with Dynamic Color-Coded Pins
  const renderMapMarkers = () => {
    if (!map) return;
    const renderGeneration = ++cityPinRenderGeneration;
    const mapContacts = getVisibleMapContacts();
    const mapLocationLabel = getMapLocationLabel();
    mapMarkers.forEach((marker) => map.removeLayer(marker));
    mapMarkers = [];
    mapContactPoints = [];
    if (homeMarker) {
      map.removeLayer(homeMarker);
      homeMarker = null;
    }

    const exactPoints = [];
    const cityGroups = new Map();
    const mapStatus = document.getElementById("map-location-status");
    const contactActions = (contact) => {
      const navigationUrl = getNavigationUrl(contact);
      return `
        <div class="map-popup-actions">
          <button type="button" class="map-popup-edit" data-contact-id="${escapeHtml(String(contact.id))}">${escapeHtml(appText("contacts.editTitle", "Edit Contact"))}</button>
          ${
            navigationUrl
              ? `<a class="map-popup-directions" href="${escapeHtml(navigationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(appText("map.directions", "Get Directions"))}</a>`
              : '<span aria-hidden="true"></span>'
          }
        </div>`;
    };
    const contactDetails = (contact, number, approximate = false) => {
      const status = getContactStatus(contact);
      return `
        <section class="map-popup-contact">
          <strong>${number}. ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</strong><br>
          ${escapeHtml(getFormattedContactAddress(contact))}<br>
          ${contact.phone ? `${escapeHtml(appText("contacts.phoneValue", `Phone: ${contact.phone}`, { value: contact.phone }))}<br>` : ""}
          ${contact.email ? `${escapeHtml(appText("contacts.emailValue", `Email: ${contact.email}`, { value: contact.email }))}<br>` : ""}
          ${escapeHtml(appText("map.location", "Location:"))} ${escapeHtml(getContactLocationSummary(contact))}<br>
          ${escapeHtml(appText("map.daysSince", `Days Since Contact: ${status.days}`, { count: status.days }))} (${escapeHtml(getStatusDisplay(status))})<br>
          ${approximate ? `<em>${escapeHtml(appText("map.approximate", "Approximate city location"))}</em><br>` : ""}
          ${contactActions(contact)}
          ${approximate ? "" : `<small>${escapeHtml(appText("map.dragPin", "Drag this pin to move it. The new location saves automatically."))}</small>`}
        </section>`;
    };

    mapContacts.forEach((contact, contactIndex) => {
      const lat = Number(contact.lat);
      const lng = Number(contact.lng);
      const contactNumber = contactIndex + 1;
      if (hasContactCoordinates(contact)) {
        const latNum = lat;
        const lngNum = lng;
        const status = getContactStatus(contact);

        const svgIcon = L.divIcon({
          className: "custom-map-pin",
          html: `<div style="background-color: ${status.color};">${contactNumber}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([latNum, lngNum], {
          icon: svgIcon,
          draggable: true,
        }).addTo(map);
        marker.bindPopup(contactDetails(contact, contactNumber));
        marker.on("dragend", async () => {
          const previousCoordinates = { lat: contact.lat, lng: contact.lng };
          const previousCenter = map.getCenter();
          const previousZoom = map.getZoom();
          const movedTo = marker.getLatLng();
          contact.lat = movedTo.lat.toFixed(6);
          contact.lng = movedTo.lng.toFixed(6);
          const pointIndex = mapContactPoints.findIndex(
            (point) => point[0] === latNum && point[1] === lngNum,
          );
          if (pointIndex !== -1) {
            mapContactPoints[pointIndex] = [movedTo.lat, movedTo.lng];
          }
          const status = document.getElementById("map-location-status");
          status.textContent = appText("map.savingPin", "Saving moved pin...");
          if (await saveContacts()) {
            map.setView(previousCenter, previousZoom);
            status.textContent = appText("map.pinSaved", "Pin moved and saved.");
          } else {
            contact.lat = previousCoordinates.lat;
            contact.lng = previousCoordinates.lng;
            if (pointIndex !== -1) mapContactPoints[pointIndex] = [latNum, lngNum];
            renderMapMarkers();
            map.setView(previousCenter, previousZoom);
            status.textContent =
              appText("map.saveMovedFailed", "Could not save the moved pin. The previous location was restored.");
          }
        });

        mapMarkers.push(marker);
        exactPoints.push([latNum, lngNum]);
      } else if (contact.city && contact.city.trim()) {
        const query = getCityPinQuery(contact);
        if (!cityGroups.has(query)) {
          cityGroups.set(query, {
            city: contact.city.trim(),
            state: normalizeLocationState(
              contact.country || settings.country,
              contact.state || settings.state,
            ),
            country: contact.country || settings.country,
            contacts: [],
          });
        }
        cityGroups.get(query).contacts.push({ contact, number: contactNumber });
      }
    });

    mapContactPoints = [...exactPoints];
    const homeContact = {
      country: settings.me?.country || settings.country,
      state: settings.me?.state || "",
    };
    const home = isContactInMapLocation(homeContact)
      ? getHomePoint()
      : null;
    if (home) {
      const me = settings.me;
      homeMarker = L.marker(home, {
        icon: L.divIcon({
          className: "custom-map-pin custom-home-pin",
          html: `<div>${iconSvg("home")}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);
      homeMarker.bindPopup(
        `<b>${escapeHtml(me.name || appText("map.myHome", "My home"))}</b><br>${escapeHtml(
          [me.street, me.area, me.region, me.city, me.state, me.postalCode, displayCountry(me.country)]
            .filter(Boolean)
            .join(", "),
        )}<br><br>${escapeHtml(appText("map.dragPin", "Drag this pin to move it. The new location saves automatically."))}`,
      );
      homeMarker.on("dragend", async () => {
        const movedTo = homeMarker.getLatLng();
        settings.me.lat = movedTo.lat.toFixed(6);
        settings.me.lng = movedTo.lng.toFixed(6);
        populateMeForm();
        try {
          await saveSettings();
        } catch (error) {
          await showStorageError("save your home pin", error);
        }
      });
    }

    fitMapToContactPoints();
    if (exactPoints.length > 0) {
      lastDefaultCityCenterQuery = null;
      mapStatus.textContent = appText("map.exactPinStatus", `Showing ${exactPoints.length} contact pin${exactPoints.length === 1 ? "" : "s"} with saved coordinates. Drag a pin to move it; changes save automatically.`, { count: exactPoints.length });
    }

    if (cityGroups.size > 0) {
      const cityContactsCount = [...cityGroups.values()].reduce(
        (count, group) => count + group.contacts.length,
        0,
      );
      const locationCount = appText("map.approximateLocationCount", `${cityGroups.size} approximate city location${cityGroups.size === 1 ? "" : "s"}`, { count: cityGroups.size });
      const contactCount = appText("map.contactCount", `${cityContactsCount} contact${cityContactsCount === 1 ? "" : "s"}`, { count: cityContactsCount });
      mapStatus.textContent = appText("map.locatingCityPins", `Locating ${locationCount} for ${contactCount}...`, { locations: locationCount, contacts: contactCount });
      const locatedCityPoints = [];
      let locatedCityContacts = 0;
      let failedCityContacts = 0;
      const renderCityPins = async () => {
        for (const [query, group] of cityGroups) {
          if (renderGeneration !== cityPinRenderGeneration) return;
          let location;
          try {
            location = await lookupCityPinCoordinates(query);
          } catch (error) {
            console.error(`Unable to locate contact city "${query}":`, error);
            failedCityContacts += group.contacts.length;
            continue;
          }
          if (!location) continue;

          locatedCityContacts += group.contacts.length;
          locatedCityPoints.push(location);
          const firstStatus = getContactStatus(group.contacts[0].contact);
          const pinLabel = `${group.contacts[0].number}${group.contacts.length > 1 ? "+" : ""}`;
          const cityIcon = L.divIcon({
            className: "custom-map-pin",
            html: `<div style="background-color: ${firstStatus.color};">${pinLabel}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker(location, { icon: cityIcon }).addTo(map);
          const cityLabel = [group.city, group.state, group.country]
            .filter(Boolean)
            .join(", ");
          marker.bindPopup(`
            <div>
              <strong>${escapeHtml(appText("print.approximateCity", `Approximate city location: ${cityLabel}`, { city: cityLabel }))}</strong>
              ${group.contacts
                .map(({ contact, number }) => contactDetails(contact, number, true))
                .join("")}
            </div>
          `);
          mapMarkers.push(marker);
        }
        if (renderGeneration !== cityPinRenderGeneration) return;

        mapContactPoints = [...exactPoints, ...locatedCityPoints];
        fitMapToContactPoints();
        const locatedCityPins = locatedCityPoints.length;
        const unlocatedContacts =
          mapContacts.length - exactPoints.length - locatedCityContacts;
        const pinCount = exactPoints.length + locatedCityPins;
        if (pinCount > 0) {
          lastDefaultCityCenterQuery = null;
          const exact = appText("map.exactPinCount", `${exactPoints.length} contact pin${exactPoints.length === 1 ? "" : "s"} with saved coordinates`, { count: exactPoints.length });
          const approximate = appText("map.approximatePinCount", `${locatedCityPins} approximate city pin${locatedCityPins === 1 ? "" : "s"}`, { count: locatedCityPins });
          const cityOnly = appText("map.cityOnlyContactCount", `${locatedCityContacts} city-only contact${locatedCityContacts === 1 ? "" : "s"}`, { count: locatedCityContacts });
          mapStatus.textContent = appText("map.pinSummary", `${exact} and ${approximate} shown for ${cityOnly}.`, { exact, approximate, contacts: cityOnly }) +
            (unlocatedContacts > 0 ? appText("map.unlocatedContacts", ` ${unlocatedContacts} contact${unlocatedContacts === 1 ? " has" : "s have"} no mappable city.`, { count: unlocatedContacts }) : "");
        } else {
          mapStatus.textContent =
            appText("map.noCityContacts", "No city-only contacts could be located.") +
            (failedCityContacts ? appText("map.checkConnectionAgain", " Check your connection and try opening the Map again.") : "");
        }
        if (mapMarkers.length === 0 && !homeMarker) {
          centerMapOnDefaultCity();
        }
      };
      if (currentViewId === "map-view") renderCityPins();
    } else if (mapContacts.length > 0 && exactPoints.length === 0) {
      mapStatus.textContent =
        appText("map.contactsWithoutLocation", `${mapContacts.length} matching contact${mapContacts.length === 1 ? " has" : "s have"} no saved coordinates or city. Add a city or use Find Address or City Pin to locate a contact.`, { count: mapContacts.length });
    } else if (mapContacts.length === 0) {
      mapStatus.textContent =
        appText(
          "map.scopeNoPins",
          `No contact pins to show for ${mapLocationLabel}.`,
          { location: mapLocationLabel },
        );
    }

    if (currentViewId === "map-view" && mapMarkers.length === 0 && !homeMarker) {
      if (cityGroups.size === 0) centerMapOnDefaultCity();
    }
  };

  // Global Action Handlers
  window.addQuickVisit = async (contactId) => {
    await editContact(contactId, "visits");
    const noteBox = document.getElementById("contact-notes");
    setTimeout(() => {
      noteBox.scrollIntoView({ block: "center" });
      noteBox.focus();
    }, 150);
  };

  // Inline Visit Log Editor Functions
  window.deleteVisitLog = async (contactId, logId) => {
    if (await NRVDialogs.confirm(appText("visits.confirmDelete", "Are you sure you want to delete this visit log?"))) {
      const contact = contacts.find((c) => c.id == contactId);
      if (contact && contact.notesHistory) {
        contact.notesHistory = contact.notesHistory.filter(
          (n) => n.id != logId,
        );
        // Remembered so syncing another device does not bring the visit back.
        contact.deletedNotes = [
          ...(contact.deletedNotes || []).filter((entry) => entry.id != logId),
          { id: logId, deletedAt: new Date().toISOString() },
        ];
        if (!(await saveContacts())) return;
        editContact(contactId, "visits");
      }
    }
  };

  window.shareContact = (id) => {
    const contact = contacts.find((c) => c.id == id);
    if (contact) openContactShareDialog(contact);
  };

  window.editContact = async (id, view = "info") => {
    const contact = contacts.find((c) => c.id == id);
    if (!contact) return;
    contactEditorSession += 1;
    document.getElementById("btn-gps").disabled = false;
    newContactCityContainer.hidden = true;
    newContactCityInput.value = "";
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    setLocationStatus("");
    document.getElementById("contact-id").value = contact.id;
    contactSecondaryActions.hidden = false;
    [printContactButton, shareContactButton, exportContactButton].forEach(
      (button) => {
        button.disabled = true;
      },
    );
    const recordIdLabel = document.getElementById("contact-record-id");
    recordIdLabel.textContent = appText("contacts.permanentId", `Permanent contact ID: ${contact.id}`, { id: contact.id });
    recordIdLabel.hidden = false;
    document.getElementById("contact-firstname").value = contact.firstName;
    document.getElementById("contact-lastname").value = contact.lastName || "";
    document.getElementById("contact-email").value = contact.email || "";
    phoneInput.value = contact.phone || "";
    activeWorkingNeedDesignation = normalizeWorkingDesignation(
      contact.workingNeedDesignation,
    );
    updateContactAddressingProfile(
      contact.addressingCountry || settings.addressingCountry,
    );
    document.getElementById("contact-address").value = normalizeStreetForAddressing(
      getStreetAddress(contact),
      contact.addressingCountry || settings.addressingCountry,
    );
    document.getElementById("contact-postal-code").value =
      contact.postalCode || "";
    contactCountrySelect.value =
      contact.country || settings.country;
    contactCountrySelect.dataset.selectedCountry = contactCountrySelect.value;
    document.getElementById("contact-state").value = normalizeLocationState(
      contactCountrySelect.value,
      contact.state || "",
    );
    document.getElementById("contact-city-select").value = contact.city || "";
    lastCommittedContactCity = contact.city || "";
    pendingContactCitySave = Promise.resolve(true);
    updateContactLocationFields();
    dropdownHelpers.populateContactRegionArea(
      contact.region || "",
      contact.area || "",
    );
    document.getElementById("contact-lat").value = contact.lat || "";
    document.getElementById("contact-lng").value = contact.lng || "";
    document.getElementById("contact-notes").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;

    const historyContainer = document.getElementById(
      "modal-notes-history-container",
    );
    historyContainer.innerHTML = "";
    if (contact.notesHistory && contact.notesHistory.length > 0) {
      const sortedNotes = [...contact.notesHistory].sort(
        (a, b) => new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      sortedNotes.forEach((note) => {
        if (!note.id)
          note.id =
            "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

        const entry = document.createElement("div");
        entry.className = "note-entry";
        entry.style.padding = "6px 0";
        entry.style.borderBottom = "1px solid #ddd";

        // Default View Mode for Log Entry
        const renderViewMode = () => {
          entry.innerHTML = "";

          const infoDiv = document.createElement("div");
          infoDiv.style.marginBottom = "4px";
          infoDiv.innerHTML = `<small style="color: #6c757d; font-weight: bold;">${escapeHtml(note.date)}</small><br><span>${escapeHtml(note.text)}</span>`;

          const btnRow = document.createElement("div");
          btnRow.style.display = "flex";
          btnRow.style.gap = "6px";
          btnRow.style.marginTop = "4px";

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn-icon";
          editBtn.title = appText("visits.editLog", "Edit Log");
          editBtn.textContent = appText("visits.editButton", "✏️ Edit");
          editBtn.style.fontSize = "12px";
          editBtn.style.padding = "4px 8px";
          editBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            renderEditMode();
          });

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn-icon delete";
          delBtn.title = appText("visits.deleteLog", "Delete Log");
          delBtn.textContent = appText("visits.deleteButton", "🗑️ Delete");
          delBtn.style.fontSize = "12px";
          delBtn.style.padding = "4px 8px";
          delBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.deleteVisitLog(contact.id, note.id);
          });

          btnRow.appendChild(editBtn);
          btnRow.appendChild(delBtn);

          entry.appendChild(infoDiv);
          entry.appendChild(btnRow);
        };

        // Inline Edit Mode for Log Entry
        const renderEditMode = () => {
          entry.innerHTML = "";

          const editContainer = document.createElement("div");
          editContainer.style.display = "flex";
          editContainer.style.flexDirection = "column";
          editContainer.style.gap = "6px";

          const dateInput = document.createElement("input");
          dateInput.type = "datetime-local";
          const existingDate = note.rawDate
            ? new Date(note.rawDate)
            : new Date(note.date);
          dateInput.value = toLocalDateTimeString(
            isNaN(existingDate) ? new Date() : existingDate,
          );
          dateInput.style.padding = "6px";

          const textArea = document.createElement("textarea");
          textArea.rows = 2;
          textArea.value = note.text;
          textArea.style.padding = "6px";

          const actionRow = document.createElement("div");
          actionRow.style.display = "flex";
          actionRow.style.gap = "6px";

          const saveLogBtn = document.createElement("button");
          saveLogBtn.type = "button";
          saveLogBtn.textContent = appText("visits.updateLog", "💾 Update Log");
          saveLogBtn.style.background = "#28a745";
          saveLogBtn.style.color = "white";
          saveLogBtn.style.border = "none";
          saveLogBtn.style.padding = "6px 12px";
          saveLogBtn.style.borderRadius = "4px";
          saveLogBtn.style.cursor = "pointer";

          saveLogBtn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const updatedText = textArea.value.trim();
            if (!updatedText) {
              await NRVDialogs.alert(appText("visits.emptyError", "Note text cannot be empty."));
              return;
            }
            const updatedDate = new Date(dateInput.value);
            note.text = updatedText;
            if (!isNaN(updatedDate)) {
              note.rawDate = updatedDate.toISOString();
              note.date = updatedDate.toLocaleString();
            }
            if (await saveContacts()) editContact(contact.id, "visits");
          });

          const cancelLogBtn = document.createElement("button");
          cancelLogBtn.type = "button";
          cancelLogBtn.textContent = appText("visits.cancelButton", "❌ Cancel");
          cancelLogBtn.style.background = "#6c757d";
          cancelLogBtn.style.color = "white";
          cancelLogBtn.style.border = "none";
          cancelLogBtn.style.padding = "6px 12px";
          cancelLogBtn.style.borderRadius = "4px";
          cancelLogBtn.style.cursor = "pointer";

          cancelLogBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            renderViewMode();
          });

          actionRow.appendChild(saveLogBtn);
          actionRow.appendChild(cancelLogBtn);

          editContainer.appendChild(dateInput);
          editContainer.appendChild(textArea);
          editContainer.appendChild(actionRow);

          entry.appendChild(editContainer);
        };

        renderViewMode();
        historyContainer.appendChild(entry);
      });
    } else {
      const empty = document.createElement("span");
      empty.style.color = "#888";
      empty.textContent = appText("visits.noLogsRecorded", "No visit logs recorded yet.");
      historyContainer.appendChild(empty);
    }

    document.getElementById("modal-title").textContent =
      view === "visits"
        ? appText("visits.addEdit", "Add/Edit Visit")
        : appText("contacts.editTitle", "Edit Contact");
    const lat = Number.parseFloat(contact.lat);
    const lng = Number.parseFloat(contact.lng);
    await openModalWithCoords(
      Number.isFinite(lat) && Number.isFinite(lng) ? lat : null,
      Number.isFinite(lat) && Number.isFinite(lng) ? lng : null,
      view,
    );
  };

  window.deleteContact = async (id) => {
    if (await NRVDialogs.confirm(appText("contacts.confirmDelete", "Delete this contact and all of its data?"))) {
      const previousState = cloneLocationState();
      contacts = contacts.filter((c) => c.id != id);
      settings.deletedContacts = [
        ...(settings.deletedContacts || []).filter((entry) => entry.id != id),
        { id, deletedAt: new Date().toISOString() },
      ];
      await persistLocationChanges(previousState, "delete the contact");
    }
  };

  document
    .getElementById("search-input")
    .addEventListener("input", () => {
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("filter-working-need")
    .addEventListener("change", () => {
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("filter-urgency")
    .addEventListener("change", () => {
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("filter-city")
    .addEventListener("change", () => {
      populateDropdowns();
      populateMapGeographicFilters();
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("filter-region")
    .addEventListener("change", () => {
      populateDropdowns();
      populateMapGeographicFilters();
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("filter-area")
    .addEventListener("change", () => {
      renderContacts();
      updateMapChangeViewIndicator();
    });
  document
    .getElementById("sort-select")
    .addEventListener("change", () => {
      renderContacts();
      updateMapChangeViewIndicator();
    });

  const buildBackup = async (encrypt = Boolean(encryptionKey), options = {}) => {
    const useKey = encrypt && encryptionKey;
    return {
      format: useKey
        ? "return-visits-encrypted-backup"
        : "return-visits-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      ...(options.transferPurpose
        ? { transferPurpose: options.transferPurpose }
        : {}),
      ...(useKey
        ? {
            encryption: cryptoMetadata,
            data: {
              settings: await encryptValue(settings, encryptionKey),
              contacts: await encryptValue(contacts, encryptionKey),
            },
          }
        : { settings, contacts }),
    };
  };

  const downloadEncryptedBackup = async (encrypt = Boolean(encryptionKey)) => {
    try {
      const backup = await buildBackup(encrypt);
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      markBackupDone();
    } catch (error) {
      await showStorageError("export encrypted backup", error);
    }
  };

  const preservationScreen = document.getElementById(
    "install-preservation-screen",
  );
  const preservationChoice = document.getElementById(
    "install-preservation-choice",
  );
  const preservationBackup = document.getElementById(
    "install-preservation-backup",
  );
  const preservationNoData = document.getElementById(
    "install-preservation-no-data",
  );
  const preservationLink = document.getElementById(
    "btn-preservation-download",
  );
  const preservationSaved = document.getElementById(
    "install-preservation-saved",
  );
  const preservationContinue = document.getElementById(
    "btn-preservation-continue",
  );
  let preservationDownloadUrl = null;
  let preservationFocusTarget = null;
  const closePreservationScreen = () => {
    preservationScreen.hidden = true;
    document.getElementById("app-container").inert = false;
    document.getElementById("app-container").setAttribute("aria-hidden", "false");
    if (preservationDownloadUrl) {
      URL.revokeObjectURL(preservationDownloadUrl);
      preservationDownloadUrl = null;
    }
    if (preservationFocusTarget?.isConnected) preservationFocusTarget.focus();
  };
  const showPreservationScreen = (hasInformation, focusTarget) => {
    preservationFocusTarget = focusTarget;
    document.getElementById("app-container").inert = true;
    document.getElementById("app-container").setAttribute("aria-hidden", "true");
    preservationChoice.hidden = !hasInformation;
    preservationBackup.hidden = true;
    preservationNoData.hidden = hasInformation;
    document.getElementById("btn-preservation-save").disabled = false;
    preservationLink.removeAttribute("href");
    preservationSaved.checked = false;
    preservationSaved.disabled = true;
    preservationContinue.disabled = true;
    const error = document.getElementById("install-preservation-error");
    error.textContent = "";
    error.hidden = true;
    preservationScreen.hidden = false;
    document.getElementById(
      hasInformation ? "btn-preservation-save" : "btn-preservation-empty-continue",
    ).focus();
  };
  const beginBrowserInstall = ({
    returnToApp = false,
    statusElement,
    buttonElement,
    focusTarget,
    confirmNoData = false,
  } = {}) => {
    const hasInformation = hasMeaningfulUserInformation(settings, contacts);
    if (!hasInformation && !confirmNoData) {
      showLaunchChoice({
        returnToApp,
        preservationHandled: true,
      });
      return;
    }
    showPreservationScreen(hasInformation, focusTarget || buttonElement);
  };
  window.nrvBeginBrowserInstall = beginBrowserInstall;

  const createInstallTransferBackup = async () => {
    const error = document.getElementById("install-preservation-error");
    const saveButton = document.getElementById("btn-preservation-save");
    saveButton.disabled = true;
    error.hidden = true;
    try {
      const backup = await buildBackup(Boolean(encryptionKey), {
        transferPurpose: "installation",
      });
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      if (preservationDownloadUrl) URL.revokeObjectURL(preservationDownloadUrl);
      preservationDownloadUrl = URL.createObjectURL(blob);
      preservationLink.href = preservationDownloadUrl;
      preservationLink.download = `return-visits-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      preservationBackup.hidden = false;
      preservationChoice.hidden = true;
      document.getElementById("install-preservation-status").textContent =
        appText("install.preserve.ready", "Your NRV backup is ready. Download it, then confirm below before continuing.");
      preservationLink.focus();
    } catch (backupError) {
      console.error("Unable to create an installation-transfer backup:", backupError);
      error.textContent = appText(
        "install.preserve.backupFailed",
        "NRV could not create the backup. Your browser information has not changed. Try again or install without copying.",
      );
      error.hidden = false;
      saveButton.disabled = false;
    }
  };
  document
    .getElementById("btn-preservation-save")
    .addEventListener("click", createInstallTransferBackup);
  preservationLink.addEventListener("click", () => {
    if (preservationLink.hasAttribute("href")) {
      markBackupDone();
      preservationSaved.disabled = false;
      preservationSaved.focus();
    }
  });
  preservationSaved.addEventListener("change", () => {
    preservationContinue.disabled = !preservationSaved.checked;
  });
  const continueInstallation = () => {
    const savedRoute = readSavedInstallRoute();
    closePreservationScreen();
    if (savedRoute) {
      if (launchInstall({ route: savedRoute })) {
        try {
          sessionStorage.removeItem(INSTALL_ROUTE_KEY);
        } catch (error) {
          console.error("Unable to clear the saved installation route:", error);
        }
      }
      return;
    }
    showLaunchChoice({
      returnToApp: true,
      preservationHandled: true,
    });
  };
  const cancelInstallation = () => {
    try {
      sessionStorage.removeItem(INSTALL_ROUTE_KEY);
    } catch (error) {
      console.error("Unable to clear the cancelled installation route:", error);
    }
    closePreservationScreen();
  };
  preservationContinue.addEventListener("click", () => {
    if (preservationSaved.checked) continueInstallation();
  });
  document
    .getElementById("btn-preservation-skip")
    .addEventListener("click", continueInstallation);
  [
    "btn-preservation-cancel",
    "btn-preservation-cancel-backup",
    "btn-preservation-empty-cancel",
  ].forEach((id) =>
    document.getElementById(id).addEventListener("click", cancelInstallation),
  );
  document
    .getElementById("btn-preservation-empty-continue")
    .addEventListener("click", continueInstallation);
  preservationScreen.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInstallation();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...preservationScreen.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled)',
    )].filter((element) => !element.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const downloadContactsSubset = async (list, encrypt) => {
    try {
      const useKey = encrypt && encryptionKey;
      const data = { contacts: list };
      const transfer = {
        format: useKey ? ENCRYPTED_CONTACTS_FORMAT : PLAIN_CONTACTS_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        ...(useKey
          ? {
              encryption: cryptoMetadata,
              data: await encryptValue(data, encryptionKey),
            }
          : { data }),
      };
      const downloadUrl = URL.createObjectURL(
        new Blob([JSON.stringify(transfer, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-contacts-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      await showStorageError("export contacts", error);
    }
  };

  const exportEncryptDialog = document.getElementById("export-encrypt-dialog");
  const exportEncryptForm = document.getElementById("export-encrypt-form");
  const exportEncryptCheckbox = document.getElementById("export-encrypt-check");
  const exportEncryptWarning = document.getElementById("export-encrypt-warning");

  exportEncryptCheckbox.addEventListener("change", () => {
    exportEncryptWarning.hidden = exportEncryptCheckbox.checked;
  });

  // Resolves true (encrypt), false (plain) or null (cancelled).
  const requestExportEncryption = () =>
    new Promise((resolve) => {
      exportEncryptCheckbox.checked = true;
      exportEncryptWarning.hidden = true;
      const finish = (value) => {
        exportEncryptDialog.close();
        exportEncryptForm.removeEventListener("submit", onSubmit);
        exportEncryptDialog.removeEventListener("cancel", onCancel);
        document
          .getElementById("cancel-export-encrypt")
          .removeEventListener("click", onCancel);
        resolve(value);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        finish(exportEncryptCheckbox.checked);
      };
      const onCancel = () => finish(null);
      exportEncryptForm.addEventListener("submit", onSubmit);
      exportEncryptDialog.addEventListener("cancel", onCancel);
      document
        .getElementById("cancel-export-encrypt")
        .addEventListener("click", onCancel);
      exportEncryptDialog.showModal();
    });

  const exportSelectionDialog = document.getElementById(
    "export-selection-dialog",
  );
  const exportSelectionAll = document.getElementById("export-selection-all");
  const exportSelectionSome = document.getElementById("export-selection-some");
  const exportSelectionNumbers = document.getElementById(
    "export-selection-numbers",
  );
  const exportSelectionStatus = document.getElementById(
    "export-selection-status",
  );
  const exportSelectionFileButton = document.getElementById(
    "export-selection-file",
  );
  const exportShareLinks = [
    document.getElementById("export-selection-sms"),
    document.getElementById("export-selection-whatsapp"),
    document.getElementById("export-selection-email"),
  ];
  const maxShareLinkLength = 5000;
  let exportContactsInView = [];

  const getExportSelection = () => {
    if (exportSelectionAll.checked) {
      return { contacts: exportContactsInView, error: "" };
    }

    if (!exportSelectionNumbers.value.trim()) {
      return { contacts: [], error: "Choose at least one contact number." };
    }
    const entries = exportSelectionNumbers.value.split(",");
    const selectedNumbers = new Set();
    for (const rawEntry of entries) {
      const entry = rawEntry.trim();
      const match = entry.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) {
        return {
          contacts: [],
          error: "Enter numbers like 3, 4-7, 9.",
        };
      }
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        end > exportContactsInView.length
      ) {
        return {
          contacts: [],
          error: `Use contact numbers from 1 to ${exportContactsInView.length}.`,
        };
      }
      for (let number = start; number <= end; number += 1) {
        selectedNumbers.add(number);
      }
    }

    if (!selectedNumbers.size) {
      return { contacts: [], error: "Choose at least one contact number." };
    }
    return {
      contacts: [...selectedNumbers]
        .sort((a, b) => a - b)
        .map((number) => exportContactsInView[number - 1]),
      error: "",
    };
  };

  const updateExportSelection = () => {
    const useAll = exportSelectionAll.checked;
    exportSelectionNumbers.disabled = useAll;
    if (useAll) exportSelectionNumbers.value = "";
    document.getElementById("export-selection-all-label").textContent =
      appText(
        "export.allShownCount",
        `All filtered contacts (${exportContactsInView.length})`,
        { count: exportContactsInView.length },
      );

    const selection = getExportSelection();
    exportSelectionStatus.textContent = selection.error
      ? selection.error
      : `${selection.contacts.length} contact${
          selection.contacts.length === 1 ? "" : "s"
        } selected.`;
    document.getElementById("export-selection-scope").textContent =
      selection.error
        ? ""
        : appText(
            useAll ? "export.filteredScope" : "export.selectedScope",
            useAll
              ? `Exporting ${selection.contacts.length} filtered contacts.`
              : `Exporting ${selection.contacts.length} selected contacts from ${exportContactsInView.length} filtered contacts.`,
            {
              count: selection.contacts.length,
              total: exportContactsInView.length,
            },
          );
    exportSelectionFileButton.disabled =
      Boolean(selection.error) || selection.contacts.length === 0;

    const senderName = settings.me?.name?.trim();
    const messageParts = [];
    let encodedLength = 0;
    for (const contact of selection.contacts) {
      const part = getContactShareText(contact);
      encodedLength += encodeURIComponent(part).length + 18;
      if (encodedLength > maxShareLinkLength) break;
      messageParts.push(part);
    }
    if (senderName) {
      encodedLength += encodeURIComponent(senderName).length + 18;
    }
    const shareTooLong = encodedLength > maxShareLinkLength;
    const shareText = [
      ...messageParts,
      ...(senderName ? [`Shared by ${senderName}`] : []),
    ].join("\n\n---\n\n");
    const encodedText = shareTooLong ? "" : encodeURIComponent(shareText);
    exportShareLinks.forEach((link) => {
      const disabled =
        Boolean(selection.error) ||
        selection.contacts.length === 0 ||
        shareTooLong;
      link.setAttribute("aria-disabled", String(disabled));
      link.href = disabled ? "" : `#`;
    });
    if (!selection.error && selection.contacts.length > 0 && !shareTooLong) {
      const subject = encodeURIComponent(
        `Contacts (${selection.contacts.length})`,
      );
      document.getElementById("export-selection-sms").href =
        `sms:?body=${encodedText}`;
      document.getElementById("export-selection-whatsapp").href =
        `https://wa.me/?text=${encodedText}`;
      document.getElementById("export-selection-email").href =
        `mailto:?subject=${subject}&body=${encodedText}`;
    } else if (
      !selection.error &&
      selection.contacts.length > 0 &&
      shareTooLong
    ) {
      exportSelectionStatus.textContent =
        "That selection is too long to share as a message. Export a file instead.";
      exportSelectionFileButton.disabled = false;
    }
  };

  const openExportSelection = () => {
    if (!visibleContacts.length) return;
    exportContactsInView = [...visibleContacts];
    exportSelectionAll.checked = true;
    exportSelectionSome.checked = false;
    exportSelectionNumbers.value = "";
    updateExportSelection();
    exportSelectionDialog.showModal();
  };

  document
    .getElementById("export-selection-form")
    .addEventListener("submit", (event) => event.preventDefault());
  exportSelectionAll.addEventListener("change", updateExportSelection);
  exportSelectionSome.addEventListener("change", updateExportSelection);
  exportSelectionNumbers.addEventListener("input", () => {
    if (exportSelectionNumbers.value) exportSelectionSome.checked = true;
    updateExportSelection();
  });
  exportShareLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }
      exportSelectionDialog.close();
    });
  });
  document
    .getElementById("cancel-export-selection")
    .addEventListener("click", () => exportSelectionDialog.close());
  exportSelectionFileButton.addEventListener("click", async () => {
    const selection = getExportSelection();
    if (selection.error || !selection.contacts.length) {
      updateExportSelection();
      return;
    }
    exportSelectionDialog.close();
    let encrypt = Boolean(encryptionKey);
    if (encryptionKey) {
      encrypt = await requestExportEncryption();
      if (encrypt === null) return;
    }
    await downloadContactsSubset(selection.contacts, encrypt);
  });

  document
    .getElementById("btn-export-backup")
    .addEventListener("click", () => downloadEncryptedBackup());
  const contactTransferDialog = document.getElementById(
    "contact-transfer-dialog",
  );
  const contactTransferForm = document.getElementById(
    "contact-transfer-form",
  );
  const contactTransferPassphrase = document.getElementById(
    "contact-transfer-passphrase",
  );
  const contactTransferConfirmContainer = document.getElementById(
    "contact-transfer-confirm-container",
  );
  const contactTransferConfirm = document.getElementById(
    "contact-transfer-confirm",
  );
  let contactTransferMode = "export";
  let contactTransferDialogResolve;

  const requestContactTransferPassphrase = (mode) =>
    new Promise((resolve) => {
      contactTransferMode = mode;
      contactTransferDialogResolve = resolve;
      document.getElementById("contact-transfer-title").textContent =
        mode === "export" ? appText("contacts.protectFile", "Protect Contact File") : appText("contacts.unlockFile", "Unlock Contact File");
      document.getElementById("contact-transfer-description").textContent =
        mode === "export"
          ? appText("contacts.protectFileDescription", "Create a passphrase of at least 8 characters. Give it to the recipient separately from the contact file.")
          : appText("contacts.unlockFileDescription", "Enter the passphrase that was used to protect this contact file.");
      document.getElementById("contact-transfer-submit").textContent =
        mode === "export" ? appText("contacts.exportContact", "Export Contact") : appText("contacts.importContact", "Import Contact");
      contactTransferConfirmContainer.hidden = mode !== "export";
      contactTransferPassphrase.value = "";
      contactTransferConfirm.value = "";
      contactTransferPassphrase.autocomplete =
        mode === "export" ? "new-password" : "current-password";
      contactTransferConfirm.required = mode === "export";
      contactTransferForm.addEventListener(
        "submit",
        onContactTransferSubmit,
      );
      document
        .getElementById("cancel-contact-transfer")
        .addEventListener("click", cancelContactTransfer);
      contactTransferDialog.addEventListener("cancel", cancelContactTransfer);
      contactTransferDialog.showModal();
      contactTransferPassphrase.focus();
    });

  const finishContactTransferDialog = (passphrase) => {
    contactTransferDialog.close();
    contactTransferForm.removeEventListener(
      "submit",
      onContactTransferSubmit,
    );
    document
      .getElementById("cancel-contact-transfer")
      .removeEventListener("click", cancelContactTransfer);
    contactTransferDialog.removeEventListener("cancel", cancelContactTransfer);
    contactTransferPassphrase.value = "";
    contactTransferConfirm.value = "";
    contactTransferDialogResolve(passphrase);
    contactTransferDialogResolve = null;
  };

  async function onContactTransferSubmit(event) {
    event.preventDefault();
    const passphrase = contactTransferPassphrase.value;
    if (passphrase.length < 8) {
      await NRVDialogs.alert(appText("security.minEight", "Use a passphrase with at least 8 characters."));
      return;
    }
    if (
      contactTransferMode === "export" &&
      passphrase !== contactTransferConfirm.value
    ) {
      await NRVDialogs.alert(appText("security.mismatch", "The passphrases do not match."));
      contactTransferConfirm.select();
      return;
    }
    finishContactTransferDialog(passphrase);
  }

  function cancelContactTransfer() {
    finishContactTransferDialog(null);
  }

  const exportContact = async (contact) => {
    // With no passphrase on this device, export a plain file with no prompts.
    const passphrase = encryptionKey
      ? await requestContactTransferPassphrase("export")
      : null;
    if (encryptionKey && passphrase === null) return;
    try {
      const contactData = {
        ...contact,
        areas: getContactAreas(contact),
        areaAssignments: contact.area
          ? [
              {
                name: contact.area,
                region: contact.region,
                city: contact.city,
              },
            ]
          : [],
        notesHistory: contact.notesHistory || [],
      };
      let transfer;
      if (passphrase === null) {
        transfer = {
          format: PLAIN_CONTACT_FORMAT,
          version: 1,
          exportedAt: new Date().toISOString(),
          data: contactData,
        };
      } else {
        const metadata = createCryptoMetadata();
        const transferKey = await deriveEncryptionKey(passphrase, metadata);
        transfer = {
          format: "return-visits-encrypted-contact",
          version: 1,
          exportedAt: new Date().toISOString(),
          encryption: metadata,
          data: await encryptValue(contactData, transferKey),
        };
      }
      const downloadUrl = URL.createObjectURL(
        new Blob([JSON.stringify(transfer, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-contact-${contact.firstName
        .trim()
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "export"}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Unable to export contact:", error);
      await NRVDialogs.alert(appText("contacts.exportFailed", "Could not export this contact. No contact data was changed."));
    }
  };

  const backupFileInput = document.getElementById("backup-file-input");
  const contactFileInput = document.getElementById("contact-file-input");
  contactFileInput.addEventListener("change", async () => {
      const files = [...contactFileInput.files];
      if (!files.length) return;

      try {
        const importedList = [];
        let passphrase;
        for (const file of files) {
          const transfer = JSON.parse(await file.text());
          const isPlain =
            transfer.format === PLAIN_CONTACT_FORMAT ||
            transfer.format === PLAIN_CONTACTS_FORMAT;
          if (!isPlain && passphrase === undefined) {
            passphrase = await requestContactTransferPassphrase("import");
            if (passphrase === null) {
              contactFileInput.value = "";
              return;
            }
          }
          importedList.push(
            ...(await decryptContactsTransfer(
              transfer,
              isPlain ? null : passphrase,
            )),
          );
        }
        if (
          !await NRVDialogs.confirm(
            appText("contacts.importConfirm", `Import ${importedList.length} contact${importedList.length === 1 ? "" : "s"} as new? Visit history is included. Existing contacts will not be changed.`, { count: importedList.length }),
          )
        ) {
          contactFileInput.value = "";
          return;
        }
        const updatedSettings = {
          ...settings,
          cities: [...settings.cities],
          regions: [...settings.regions],
          areas: [...settings.areas],
        };
        const updatedContacts = [...contacts];
        let nextId = Date.now();
        const addImportedName = (list, value, country) => {
          const name = typeof value === "string" ? value.trim() : "";
          if (!name || !country) return name;
          const existing = list.find(
            (item) =>
              item.country === country &&
              item.name.toLowerCase() === name.toLowerCase(),
          );
          if (existing) return existing.name;
          list.push({ name, country });
          return name;
        };
        for (const importedContact of importedList) {
        const importedCountry = normalizeCountry(
          importedContact.country || settings.country,
        );
        const importedAreaName =
          importedContact.area || importedContact.areas?.[0] || "";
        const legacyAssignment = importedContact.areaAssignments.find(
          (assignment) => assignment.name === importedAreaName,
        );
        const importedCity =
          importedContact.city || legacyAssignment?.city || "";
        const importedRegion =
          importedContact.region || legacyAssignment?.region || "";
        importedContact.city = addImportedName(
          updatedSettings.cities,
          importedCity,
          importedCountry,
        );
        importedContact.region = addImportedName(
          updatedSettings.regions,
          importedRegion,
          importedCountry,
        );
        importedContact.area = addImportedName(
          updatedSettings.areas,
          importedAreaName,
          importedCountry,
        );
        importedContact.streetAddress = getStreetAddress(importedContact);
        delete importedContact.areas;
        delete importedContact.areaAssignments;

        while (
          updatedContacts.some((contact) => String(contact.id) === String(nextId))
        ) {
          nextId += 1;
        }
        updatedContacts.push({
          ...importedContact,
          id: nextId,
          updatedAt: new Date().toISOString(),
        });
        nextId += 1;
        }
        await writeStoredValues(database, [
          ["settings", await encryptValue(updatedSettings, encryptionKey)],
          ["contacts", await encryptValue(updatedContacts, encryptionKey)],
        ]);
        settings = updatedSettings;
        contacts = updatedContacts;
        resetContactSignatures();
        populateDropdowns();
        renderContacts();
        contactFileInput.value = "";
        await NRVDialogs.alert(
          appText("contacts.importedCount", `${importedList.length} contact${importedList.length === 1 ? "" : "s"} imported.`, { count: importedList.length }),
        );
      } catch (error) {
        contactFileInput.value = "";
        console.error("Unable to import contacts:", error);
        const importErrors = {
          "This is not a supported contact file.": appText("contacts.unsupportedFile", "This is not a supported contact file."),
          "The contact file contents are invalid.": appText("contacts.invalidFile", "The contact file contents are invalid."),
          "The contact file contains no contacts.": appText("contacts.emptyFile", "The contact file contains no contacts."),
          "Encrypted data is invalid or unsupported.": appText("contacts.invalidEncryptedData", "Encrypted data is invalid or unsupported."),
        };
        const detail = error instanceof NewerDataVersionError
          ? appText("storage.newerData", "This data was saved by a newer version of the app. Update the app (reload it) before opening this data. Nothing was changed.")
          : error instanceof SyntaxError
            ? appText("contacts.invalidJson", "The file is not valid JSON.")
            : error.name === "OperationError"
              ? appText("contacts.decryptFailed", "The file could not be decrypted. Check that the file is valid and the passphrase is correct.")
              : Object.prototype.hasOwnProperty.call(importErrors, error.message)
                ? importErrors[error.message]
                : error.message || appText("contacts.importCheckFile", "Check that the file is valid and the passphrase is correct.");
        await NRVDialogs.alert(
          appText("contacts.importFailed", `Could not import. ${detail} Your current contacts were not changed.`, { detail }),
        );
      }
    });

  const restorePassphraseDialog = document.getElementById(
    "restore-passphrase-dialog",
  );
  const restorePassphraseForm = document.getElementById(
    "restore-passphrase-form",
  );
  const restorePassphraseInput = document.getElementById("restore-passphrase");

  const requestBackupPassphrase = () =>
    new Promise((resolve) => {
      const finish = (passphrase) => {
        restorePassphraseDialog.close();
        restorePassphraseForm.removeEventListener("submit", onSubmit);
        document
          .getElementById("cancel-restore-passphrase")
          .removeEventListener("click", onCancel);
        restorePassphraseDialog.removeEventListener("cancel", onCancel);
        restorePassphraseInput.value = "";
        resolve(passphrase);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        finish(restorePassphraseInput.value);
      };
      const onCancel = () => finish(null);

      restorePassphraseForm.addEventListener("submit", onSubmit);
      document
        .getElementById("cancel-restore-passphrase")
        .addEventListener("click", onCancel);
      restorePassphraseDialog.addEventListener("cancel", onCancel);
      restorePassphraseDialog.showModal();
      restorePassphraseInput.focus();
    });

  const reportRestoreError = async (error) => {
    console.error("Unable to restore encrypted backup:", error);
    await NRVDialogs.alert(
      error instanceof NewerDataVersionError
        ? appText("backup.newerData", "This data was saved by a newer version of the app. Update the app (reload it) before opening this data. Nothing was changed. Your current data was not replaced.")
        : appText("backup.restoreFailed", "Could not restore that backup. Check that the file is valid and the passphrase is correct. Your current data was not replaced."),
    );
  };

  // Returns true once the backup replaced the current data.
  const restoreBackupObject = async (backup) => {
    const plainBackup = backup.format === "return-visits-backup";
    const deviceProtected = Boolean(encryptionKey);
    // A plain backup needs no passphrase to read; an encrypted one does.
    const backupPassphrase = plainBackup ? null : await requestBackupPassphrase();
    if (!plainBackup && backupPassphrase === null) return false;
    const restored = await decryptBackup(backup, backupPassphrase);
    if (plainBackup && deviceProtected) {
      // Keep this device's own passphrase and recovery code.
      restored.encryptionKey = encryptionKey;
      restored.metadata = cryptoMetadata;
      restored.encryptedSettings = await encryptValue(
        restored.settings,
        encryptionKey,
      );
      restored.encryptedContacts = await encryptValue(
        restored.contacts,
        encryptionKey,
      );
    } else if (plainBackup) {
      restored.encryptionKey = null;
      restored.metadata = null;
      restored.encryptedSettings = restored.settings;
      restored.encryptedContacts = restored.contacts;
    }
    restored.wasLegacyPlaintext = false;
    let passphraseNote = "";
    if (!plainBackup && !deviceProtected) {
      passphraseNote = appText("backup.restoreTurnsOn", " This backup is protected by a passphrase, so restoring it turns the passphrase on for this device. It will be the backup's passphrase and recovery code, and you will be asked for it each time you open the app.");
    } else if (!plainBackup) {
      passphraseNote = appText("backup.restoreSwitchesPassphrase", " This device will switch to the passphrase and recovery code of this backup.");
    } else if (deviceProtected) {
      passphraseNote = appText("backup.restoreDevicePassphrase", " This backup is not encrypted; the restored data will be protected by this device's passphrase.");
    }
    if (
      !await NRVDialogs.confirm(
        appText("backup.replaceConfirm", `This will replace all ${contacts.length} current contacts with ${restored.contacts.length} contacts from the backup.${passphraseNote} Continue?`, { current: contacts.length, restored: restored.contacts.length, note: passphraseNote }),
      )
    ) {
      return false;
    }

    await writeStoredValues(database, [
      ["settings", restored.encryptedSettings],
      ["contacts", restored.encryptedContacts],
      ...(restored.metadata ? [[ENCRYPTION_META_KEY, restored.metadata]] : []),
    ]);
    encryptionKey = restored.encryptionKey;
    cryptoMetadata = restored.metadata;
    settings = restored.settings;
    contacts = restored.contacts;
    resetContactSignatures();
    settings.country = normalizeCountry(settings.country);
    settings.addressingCountry = normalizeCountry(settings.addressingCountry);
    updateAddressingProfile(settings.addressingCountry);
    settings.state = normalizeLocationState(settings.country, settings.state);
    populateCountryOptions();
    populateMeForm();
    savedDetailsState = captureDetailsState();
    document.getElementById("setting-state").value = settings.state;
    document.getElementById("setting-default-city").value =
      settings.defaultCity || "";
    populateDropdowns();
    renderContacts();
    updatePassphraseSection();
    markBackupDone();
    const installationTransfer = backup.transferPurpose === "installation";
    await NRVDialogs.alert(
      installationTransfer
        ? encryptionKey && !restored.metadata?.recovery
          ? appText("backup.installTransferRestoredNoRecovery", "Your NRV information has been restored to this copy. Please check that it is here; the original browser copy remains unchanged. This backup has no recovery code yet; open Settings → Data/Security → Passphrase to Open App and choose Make a New Recovery Code.")
          : appText("backup.installTransferRestored", "Your NRV information has been restored to this copy. Please check that it is here; the original browser copy remains unchanged.")
        : encryptionKey && !restored.metadata?.recovery
          ? appText("backup.restoredNoRecovery", "Backup restored. It has no recovery code yet; open Settings → Data/Security → Passphrase to Open App and choose Make a New Recovery Code.")
          : appText("backup.restored", "Backup restored successfully."),
    );
    return true;
  };

  const restoreBackupFile = async (file) => {
    if (!file) {
      await NRVDialogs.alert(appText("backup.chooseEncrypted", "Choose an encrypted backup file first."));
      return false;
    }

    try {
      const backup = JSON.parse(await file.text());
      const restored = await restoreBackupObject(backup);
      if (restored) {
        backupFileInput.value = "";
        backupFileInput.dispatchEvent(new Event("change"));
      }
      return restored;
    } catch (error) {
      await reportRestoreError(error);
      return false;
    }
  };

  document
    .getElementById("btn-restore-backup")
    .addEventListener("click", () =>
      restoreBackupFile(backupFileInput.files[0]),
    );
  const clearRestoreFileButton = document.getElementById(
    "btn-clear-restore-file",
  );
  const restoreBackupButton = document.getElementById("btn-restore-backup");
  const syncRestoreFileUi = () => {
    const hasFile = backupFileInput.files.length > 0;
    restoreBackupButton.classList.toggle("has-file", hasFile);
    clearRestoreFileButton.hidden = !hasFile;
  };
  backupFileInput.addEventListener("change", syncRestoreFileUi);
  clearRestoreFileButton.addEventListener("click", () => {
    backupFileInput.value = "";
    syncRestoreFileUi();
  });
  // ---- Cloud backup (Dropbox, optional) ----
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CLOUD_LAST_KEY = "return_visits_cloud_last_backup";
  const CLOUD_SNAPSHOT_KEY = "return_visits_cloud_last_snapshot";
  // Dropbox's own "modified" time of latest.json as of this device's last
  // upload or restore, and whether this device has changes not yet uploaded.
  const CLOUD_SEEN_KEY = "return_visits_cloud_seen";
  const CLOUD_DIRTY_KEY = "return_visits_cloud_dirty";
  const CLOUD_RECONNECT_DECISION_KEY =
    "return_visits_cloud_reconnect_decision_required";
  const CLOUD_SNAPSHOTS_KEPT = 10;
  const dropbox = window.RVDropbox;
  const cloudSection = document.getElementById("cloud-section");
  const cloudStatus = document.getElementById("cloud-status");
  const setCloudStatus = (message) => {
    cloudStatus.textContent = message;
    if (message) cloudStatus.scrollIntoView({ block: "nearest" });
  };
  const showCloudStep = (stepId) => {
    ["cloud-question", "cloud-signup", "cloud-connect"].forEach((id) => {
      document.getElementById(id).hidden = id !== stepId;
    });
    document.getElementById("btn-cloud-cancel-setup").hidden = !stepId;
  };

  // Small status icon in the header: synced, syncing, waiting or offline.
  const getSyncSummary = () => {
    const waiting = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
    if (cloudPaused) {
      return {
        icon: "⚠️",
        text:
          localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1"
            ? appText("dropbox.pausedDecision", "Dropbox is connected, but automatic sync is paused until you choose whether to restore its existing backup or replace it with this device's data.")
            : appText("dropbox.paused", "Dropbox sync is paused. Open Settings → Backup/Restore → Cloud Backup/Restore (Dropbox) for details."),
      };
    }
    if (!navigator.onLine) {
      return {
        icon: "📴",
        text: waiting
          ? appText("dropbox.offlinePending", "Offline. Your changes are saved on this device and will upload when the connection returns.")
          : appText("dropbox.offline", "Offline. Changes will sync when the connection returns."),
      };
    }
    if (cloudBusy) return { icon: "🔄", text: appText("dropbox.syncing", "Syncing with Dropbox…") };
    if (waiting) {
      return {
        icon: "⏳",
        text: appText("dropbox.pending", "Changes saved on this device are waiting to upload to Dropbox."),
      };
    }
    const last = Number(localStorage.getItem(CLOUD_LAST_KEY) || 0);
    return {
      icon: "☁️",
      text: last
        ? appText("dropbox.syncedAt", `Synced with Dropbox (${new Date(last).toLocaleString()}).`, { date: new Date(last).toLocaleString() })
        : appText("dropbox.connected", "Connected to Dropbox."),
    };
  };
  const refreshSyncIcon = () => {
    const button = document.getElementById("sync-status");
    if (!button) return;
    if (!dropbox.isConnected()) {
      button.hidden = true;
      return;
    }
    const summary = getSyncSummary();
    button.hidden = false;
    button.textContent = summary.icon;
    button.title = summary.text;
    button.setAttribute("aria-label", summary.text);
  };

  let cloudChosen = false;
  const refreshCloudUi = async () => {
    refreshSyncIcon();
    const connected = dropbox.isConnected();
    document.getElementById("cloud-off").hidden = connected;
    document.getElementById("cloud-on").hidden = !connected;
    cloudSection.hidden = !connected && !cloudChosen;
    document.getElementById("backup-mode-status").textContent = connected
      ? appText("backup.usingDropbox", "You are using Dropbox cloud backup. Local backup files are still available below.")
      : cloudChosen
        ? appText("backup.finishDropbox", "You are using Local backup. Finish the Dropbox steps below, or go back to local only.")
        : appText("backup.usingLocal", "You are using Local backup (files saved on this device).");
    document.getElementById("btn-backup-mode-switch").textContent = connected
      ? appText("dropbox.stopUsing", "Stop using Dropbox (use local only)")
      : cloudChosen
        ? appText("dropbox.cancelSetup", "Cancel (use local only)")
        : appText("dropbox.switchTo", "Switch to Dropbox cloud backup");
    if (!connected) return;
    const last = Number(localStorage.getItem(CLOUD_LAST_KEY) || 0);
    document.getElementById("cloud-last-backup").textContent = last
      ? appText("dropbox.lastBackup", `Last Dropbox backup: ${new Date(last).toLocaleString()}`, { date: new Date(last).toLocaleString() })
      : appText("dropbox.noBackup", "No Dropbox backup yet.");
    const accountStatus = document.getElementById("cloud-account-status");
    accountStatus.textContent = appText("dropbox.connected", "Connected to Dropbox.");
    try {
      const email = await dropbox.accountEmail();
      if (email) accountStatus.textContent = appText("dropbox.connectedAs", `Connected to Dropbox as ${email}.`, { email });
    } catch (error) {
      console.error("Unable to read the Dropbox account:", error);
    }
  };

  const pruneCloudSnapshots = async () => {
    const files = (await dropbox.list())
      .filter((file) => /^backup-.*\.json$/.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const file of files.slice(CLOUD_SNAPSHOTS_KEPT)) {
      await dropbox.remove(file.path_lower);
    }
  };

  const getRemoteLatest = async () => {
    const file = (await dropbox.list()).find(
      (entry) => entry.name === "latest.json",
    );
    return file
      ? {
          path: file.path_lower,
          modified: Date.parse(file.server_modified),
          rev: file.rev,
        }
      : null;
  };

  // Counts local saves so a merge can tell if the user edited while it ran.
  let localChanges = 0;
  let cloudBusy = false;
  let cloudPaused =
    localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1";

  // Reads the Dropbox copy for merging without asking for a passphrase.
  // Returns null when that is not possible (a different passphrase, or this
  // device has none), which sends the user through the restore prompts.
  const readRemoteForMerge = async (remote) => {
    const backup = JSON.parse(await dropbox.download(remote.path));
    if (backup.format === "return-visits-backup") {
      if (!backup.settings || !Array.isArray(backup.contacts)) return null;
      return normalizeRegionData(backup.settings, backup.contacts);
    }
    if (
      backup.format === "return-visits-encrypted-backup" &&
      encryptionKey &&
      cryptoMetadata?.salt &&
      backup.encryption?.salt === cryptoMetadata.salt &&
      backup.data
    ) {
      try {
        const [remoteSettings, remoteContacts] = await Promise.all([
          decryptValue(backup.data.settings, encryptionKey),
          decryptValue(backup.data.contacts, encryptionKey),
        ]);
        if (!remoteSettings || !Array.isArray(remoteContacts)) return null;
        return normalizeRegionData(remoteSettings, remoteContacts);
      } catch (error) {
        if (error instanceof NewerDataVersionError) throw error;
        return null;
      }
    }
    return null;
  };

  // Combines the Dropbox copy with this device's data. Returns null when it
  // cannot be done silently, or { uploadNeeded } once this device is merged.
  const mergeFromCloud = async (remote) => {
    const incoming = await readRemoteForMerge(remote);
    if (!incoming) return null;
    const startedAt = localChanges;
    const localDirty = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
    const combined = window.RVMerge.mergeData(
      { settings, contacts },
      incoming,
      { localDirty },
    );
    const merged = normalizeRegionData(combined.settings, combined.contacts);
    const encryptedSettings = await encryptValue(merged.settings, encryptionKey);
    const encryptedContacts = await encryptValue(merged.contacts, encryptionKey);
    if (localChanges !== startedAt) {
      throw new Error("Changes were made while syncing; trying again shortly.");
    }
    await writeStoredValues(database, [
      ["settings", encryptedSettings],
      ["contacts", encryptedContacts],
    ]);
    const uploadNeeded =
      JSON.stringify(merged.contacts) !== JSON.stringify(incoming.contacts) ||
      JSON.stringify(merged.settings) !== JSON.stringify(incoming.settings);
    settings = merged.settings;
    contacts = merged.contacts;
    resetContactSignatures();
    updateAddressingProfile(settings.addressingCountry);
    populateMeForm();
    document.getElementById("setting-state").value = settings.state || "";
    document.getElementById("setting-default-city").value =
      settings.defaultCity || "";
    populateDropdowns();
    renderContacts();
    localStorage.setItem(CLOUD_SEEN_KEY, String(remote.modified));
    if (uploadNeeded) localStorage.setItem(CLOUD_DIRTY_KEY, "1");
    else localStorage.removeItem(CLOUD_DIRTY_KEY);
    return { uploadNeeded };
  };

  // A copy that this device has not uploaded or restored is "newer". A device
  // connected before this check existed adopts the current copy silently.
  const remoteIsNewer = (remote) => {
    if (!remote) return false;
    const seen = Number(localStorage.getItem(CLOUD_SEEN_KEY) || 0);
    if (!seen) {
      if (localStorage.getItem(CLOUD_LAST_KEY)) {
        localStorage.setItem(CLOUD_SEEN_KEY, String(remote.modified));
        return false;
      }
      return true;
    }
    return remote.modified > seen + 1000;
  };

  let cloudBackupRunning = false;
  let cloudBackupQueued = false;
  // Combines with a newer Dropbox copy when possible, then uploads the live
  // copy, plus a dated copy at most once a day (or when forced). Throws on
  // failure, or with code "cloud-newer" when Dropbox holds a newer copy that
  // cannot be combined automatically (unless overwrite is set).
  const runCloudBackup = async ({
    forceSnapshot = false,
    overwrite = false,
    userInitiated = false,
  } = {}) => {
    if (
      localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1" &&
      !userInitiated
    ) {
      return;
    }
    if (cloudBackupRunning) {
      cloudBackupQueued = true;
      return;
    }
    cloudBackupRunning = true;
    cloudBusy = true;
    refreshSyncIcon();
    try {
      let rev;
      let uploaded;
      let text;
      for (let attempt = 0; ; attempt += 1) {
        let remote = null;
        if (!overwrite) {
          remote = await getRemoteLatest();
          if (remoteIsNewer(remote)) {
            const result = await mergeFromCloud(remote);
            if (!result) {
              const newer = new Error("Dropbox has a newer backup.");
              newer.code = "cloud-newer";
              newer.remote = remote;
              throw newer;
            }
            if (!result.uploadNeeded && !forceSnapshot) {
              localStorage.setItem(CLOUD_LAST_KEY, String(Date.now()));
              cloudPaused = false;
              return;
            }
          }
        }
        rev = remote?.rev;
        localStorage.removeItem(CLOUD_DIRTY_KEY);
        text = JSON.stringify(await buildBackup(), null, 2);
        try {
          uploaded = await dropbox.upload("/latest.json", text, rev);
          break;
        } catch (error) {
          localStorage.setItem(CLOUD_DIRTY_KEY, "1");
          // Another device uploaded first: merge with it and try again.
          if (error.conflict && attempt < 2) continue;
          throw error;
        }
      }
      if (uploaded && uploaded.server_modified) {
        localStorage.setItem(
          CLOUD_SEEN_KEY,
          String(Date.parse(uploaded.server_modified)),
        );
      }
      const lastSnapshot = Number(
        localStorage.getItem(CLOUD_SNAPSHOT_KEY) || 0,
      );
      if (forceSnapshot || Date.now() - lastSnapshot >= DAY_MS) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await dropbox.upload(`/backup-${stamp}.json`, text);
        localStorage.setItem(CLOUD_SNAPSHOT_KEY, String(Date.now()));
        try {
          await pruneCloudSnapshots();
        } catch (error) {
          console.error("Unable to remove old Dropbox backups:", error);
        }
      }
      localStorage.setItem(CLOUD_LAST_KEY, String(Date.now()));
      cloudPaused = false;
      markBackupDone();
    } finally {
      cloudBackupRunning = false;
      cloudBusy = false;
      refreshSyncIcon();
      if (cloudBackupQueued) {
        cloudBackupQueued = false;
        cloudBackupHook();
      }
    }
  };

  // Never overwrite Dropbox with an empty app, for example a new phone that
  // has not restored yet.
  const autoCloudBackup = async () => {
    if (!installScreen.hidden) return false;
    if (!dropbox.isConnected() || !contacts.length) return false;
    if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
      cloudPaused = true;
      refreshSyncIcon();
      return false;
    }
    if (!navigator.onLine) {
      refreshSyncIcon();
      return false;
    }
    try {
      await runCloudBackup();
      await refreshCloudUi();
      return true;
    } catch (error) {
      if (error.code === "cloud-newer") {
        cloudPaused = true;
        refreshSyncIcon();
        setCloudStatus(
          appText("dropbox.autoPausedDifferentPassphrase", "Automatic backup is paused because Dropbox has a backup from another device that uses a different passphrase, so it cannot be combined automatically. Tap Check for a Newer Backup to restore it, or Back Up to Dropbox Now to replace it with this device's data."),
        );
        return false;
      }
      console.error("Automatic Dropbox backup failed:", error);
      setCloudStatus(
        appText("dropbox.autoSyncFailed", "The last automatic Dropbox sync did not finish. Your changes are saved on this device and it will try again."),
      );
      window.clearTimeout(cloudTimer);
      cloudTimer = window.setTimeout(() => {
        cloudTimer = null;
        autoCloudBackup();
      }, 60000);
      return false;
    }
  };

  let cloudTimer = null;
  cloudBackupHook = () => {
    localChanges += 1;
    if (!dropbox.isConnected()) return;
    localStorage.setItem(CLOUD_DIRTY_KEY, "1");
    refreshSyncIcon();
    window.clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(() => {
      cloudTimer = null;
      autoCloudBackup();
    }, 15000);
  };

  const restoreFromCloud = async (path, modified) => {
    try {
      const backup = JSON.parse(await dropbox.download(path));
      setCloudStatus("");
      if (await restoreBackupObject(backup)) {
        localStorage.setItem(CLOUD_SEEN_KEY, String(modified));
        localStorage.removeItem(CLOUD_DIRTY_KEY);
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
        await refreshCloudUi();
        return true;
      }
    } catch (error) {
      setCloudStatus("");
      await reportRestoreError(error);
    }
    return false;
  };

  let cloudChecking = false;
  let cloudCheckedAt = 0;
  let cloudDeclinedFor = 0;
  // Combines a newer Dropbox copy from another device into this one. Only
  // asks the user when the copy cannot be combined automatically (a different
  // passphrase). Quiet unless there is something to report (or manual is set).
  const checkCloudNewer = async ({ manual = false } = {}) => {
    if (!dropbox.isConnected() || cloudChecking || cloudBackupRunning) return;
    if (!installScreen.hidden && !manual) return;
    if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
      if (manual) await openCloudRestore();
      return;
    }
    if (!navigator.onLine) {
      refreshSyncIcon();
      if (manual) setCloudStatus(appText("dropbox.offlineChanges", "You are offline. Changes will sync when the connection returns."));
      return;
    }
    cloudChecking = true;
    cloudCheckedAt = Date.now();
    cloudBusy = true;
    refreshSyncIcon();
    if (manual) setCloudStatus(appText("dropbox.checkingChanges", "Checking Dropbox for changes…"));
    try {
      const remote = await getRemoteLatest();
      if (!remoteIsNewer(remote)) {
        if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1") {
          cloudBusy = false;
          await autoCloudBackup();
        }
        if (manual) setCloudStatus(appText("dropbox.upToDate", "This device is up to date with Dropbox."));
        return;
      }
      if (!manual && cloudDeclinedFor === remote.modified) return;
      let merged = null;
      try {
        merged = await mergeFromCloud(remote);
      } catch (error) {
        if (error instanceof NewerDataVersionError) {
          setCloudStatus(
            appText("dropbox.newerApp", "The Dropbox copy was made by a newer version of the app. Update the app, then try again."),
          );
          return;
        }
        throw error;
      }
      if (merged) {
        cloudPaused = false;
        setCloudStatus(
          appText("dropbox.combined", "Combined this device with the latest changes from Dropbox."),
        );
        if (merged.uploadNeeded) {
          cloudBusy = false;
          await autoCloudBackup();
        }
        return;
      }
      setCloudStatus("");
      const when = new Date(remote.modified).toLocaleString();
      const unsaved =
        localStorage.getItem(CLOUD_DIRTY_KEY) === "1"
          ? appText("dropbox.remoteUnsaved", " This device also has changes that are not in Dropbox yet; restoring will replace them.")
          : "";
      if (
        await NRVDialogs.confirm(
          appText("dropbox.remoteDifferentPassphrase", `Dropbox has a backup from another device (${when}) that uses a different passphrase, so it cannot be combined automatically.${unsaved} Restore it onto this device now?`, { when, unsaved }),
        )
      ) {
        setCloudStatus(appText("dropbox.downloading", "Downloading from Dropbox…"));
        if (await restoreFromCloud(remote.path, remote.modified)) {
          cloudPaused = false;
          setCloudStatus(appText("dropbox.restored", "Restored the Dropbox backup."));
          return;
        }
      }
      cloudDeclinedFor = remote.modified;
      cloudPaused = true;
      setCloudStatus(appText("dropbox.notRestoredPaused", "Not restored. Automatic backup stays paused until you restore, or tap Back Up to Dropbox Now to replace the Dropbox copy with this device's data."));
    } catch (error) {
      console.error("Unable to check Dropbox:", error);
      if (manual) {
        setCloudStatus(appText("dropbox.connectionFailed", "Could not reach Dropbox. Check your connection."));
      }
    } finally {
      cloudChecking = false;
      cloudBusy = false;
      refreshSyncIcon();
    }
  };
  const syncNow = () => {
    if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1" && contacts.length) {
      window.clearTimeout(cloudTimer);
      cloudTimer = null;
      return autoCloudBackup();
    }
    return checkCloudNewer();
  };
  window.addEventListener("online", () => {
    refreshSyncIcon();
    syncNow();
  });
  window.addEventListener("offline", refreshSyncIcon);
  // While the app is open, keep looking for changes from other devices.
  window.setInterval(() => {
    if (document.visibilityState === "visible") syncNow();
  }, 120000);
  document.getElementById("sync-status").addEventListener("click", async () => {
    await syncNow();
    await NRVDialogs.alert(getSyncSummary().text);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && cloudTimer) {
      window.clearTimeout(cloudTimer);
      cloudTimer = null;
      autoCloudBackup();
    } else if (
      document.visibilityState === "visible" &&
      Date.now() - cloudCheckedAt > 120000
    ) {
      syncNow();
    }
  });
  document
    .getElementById("btn-cloud-check")
    .addEventListener("click", () => checkCloudNewer({ manual: true }));

  document.getElementById("btn-cloud-begin").addEventListener("click", () => {
    document.getElementById("btn-cloud-begin").hidden = true;
    showCloudStep("cloud-question");
  });
  document.getElementById("btn-cloud-cancel-setup").addEventListener("click", () => {
    document.getElementById("btn-cloud-begin").hidden = false;
    showCloudStep("");
  });
  document
    .getElementById("btn-cloud-have")
    .addEventListener("click", () => showCloudStep("cloud-connect"));
  document
    .getElementById("btn-cloud-need")
    .addEventListener("click", () => showCloudStep("cloud-signup"));
  document
    .getElementById("btn-cloud-signup-done")
    .addEventListener("click", () => showCloudStep("cloud-connect"));
  document
    .getElementById("btn-cloud-connect")
    .addEventListener("click", async () => {
      const encryptionWarning = encryptionKey
        ? appText("dropbox.warningEncrypted", "Your Dropbox backups will be encrypted with this app's passphrase before they are uploaded. Keep that passphrase and your recovery code safe; anyone who obtains an unencrypted export or a copy made before encryption may still read it.")
        : appText("dropbox.warningUnencrypted", "No app passphrase is on, so backups in Dropbox will not be encrypted. Anyone who can access those Dropbox files may be able to read them. Turning on a passphrase first (Settings → Data/Security → Passphrase to Open App) is optional and will encrypt new backups; existing unencrypted Dropbox copies remain readable until you delete them.");
      if (
        !await NRVDialogs.confirm(
          appText("dropbox.connectionWarning", `Dropbox is optional. Connecting sends Nice Return Visits backups to the Dropbox folder named Return Visits in your account. ${encryptionWarning} You can also protect your Dropbox account with a strong password and two-step verification. Dropbox account or device security can still be compromised. Continue to Dropbox sign-in?`, { warning: encryptionWarning }),
        )
      ) {
        return;
      }
      try {
        await dropbox.startConnect();
      } catch (error) {
        console.error(error);
        setCloudStatus(appText("dropbox.signInStartFailed", "Could not start the Dropbox sign-in. Please try again."));
      }
    });

  document
    .getElementById("btn-cloud-backup-now")
    .addEventListener("click", async () => {
      const reconnectNeedsDecision =
        localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1";
      if (
        reconnectNeedsDecision &&
        !await NRVDialogs.confirm(
          appText("dropbox.replaceConfirm", "Dropbox already has NRV backup data. Backing up now will replace its latest copy with this device's data. Older dated copies stay in Dropbox. Continue?"),
        )
      ) {
        return;
      }
      if (
        !contacts.length &&
        !await NRVDialogs.confirm(
          appText("dropbox.emptyBackupConfirm", "There are no contacts on this device. Backing up now could replace your latest Dropbox copy with an empty one. Continue?"),
        )
      ) {
        return;
      }
      setCloudStatus(appText("dropbox.backingUp", "Backing up to Dropbox…"));
      try {
        try {
          await runCloudBackup({
            forceSnapshot: true,
            overwrite: reconnectNeedsDecision,
            userInitiated: true,
          });
        } catch (error) {
          if (error.code !== "cloud-newer") throw error;
          if (
            !await NRVDialogs.confirm(
              appText("dropbox.replaceNewerConfirm", `Dropbox has a newer backup from another device (${new Date(error.remote.modified).toLocaleString()}). Replace it with this device's data? Older dated copies stay in Dropbox. Choose Cancel, then Check for a Newer Backup, to restore it instead.`, { when: new Date(error.remote.modified).toLocaleString() }),
            )
          ) {
            setCloudStatus(appText("dropbox.notBackedUp", "Not backed up. Dropbox still has the newer backup."));
            return;
          }
          await runCloudBackup({
            forceSnapshot: true,
            overwrite: true,
            userInitiated: true,
          });
        }
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
        await refreshCloudUi();
        setCloudStatus(appText("dropbox.backupSuccess", "Backed up to Dropbox."));
      } catch (error) {
        console.error(error);
        setCloudStatus(
          appText("dropbox.backupFailed", "Could not back up to Dropbox. Check your connection and try again."),
        );
      }
    });

  document
    .getElementById("btn-cloud-disconnect")
    .addEventListener("click", async () => {
      if (
        !await NRVDialogs.confirm(
          appText("dropbox.disconnectConfirm", "Disconnect Dropbox? Your existing backups stay in your Dropbox, but the app will stop backing up there."),
        )
      ) {
        return;
      }
      await dropbox.disconnect();
      localStorage.removeItem(CLOUD_LAST_KEY);
      localStorage.removeItem(CLOUD_SNAPSHOT_KEY);
      localStorage.removeItem(CLOUD_SEEN_KEY);
      localStorage.removeItem(CLOUD_DIRTY_KEY);
      localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
      cloudPaused = false;
      setCloudStatus(appText("dropbox.disconnected", "Dropbox disconnected."));
      cloudChosen = false;
      document.getElementById("btn-cloud-begin").hidden = false;
      showCloudStep("");
      await refreshCloudUi();
    });

  document
    .getElementById("btn-backup-mode-switch")
    .addEventListener("click", async () => {
      if (dropbox.isConnected()) {
        document.getElementById("btn-cloud-disconnect").click();
        return;
      }
      cloudChosen = !cloudChosen;
      document.getElementById("btn-cloud-begin").hidden = false;
      showCloudStep("");
      await refreshCloudUi();
      if (cloudChosen) {
        cloudSection.open = true;
        cloudSection.scrollIntoView({ block: "nearest" });
      }
    });

  const cloudRestoreDialog = document.getElementById("cloud-restore-dialog");
  const cloudRestoreSelect = document.getElementById("cloud-restore-select");
  let cloudLatestModified = 0;
  const openCloudRestore = async () => {
    setCloudStatus(appText("dropbox.lookingForBackups", "Looking for backups in Dropbox…"));
    let files;
    try {
      files = await dropbox.list();
    } catch (error) {
      console.error(error);
      setCloudStatus(appText("dropbox.connectionFailed", "Could not reach Dropbox. Check your connection."));
      return;
    }
    const backups = files
      .filter((file) => /^(latest|backup-.*)\.json$/.test(file.name))
      .sort((a, b) => {
        if (a.name === "latest.json") return -1;
        if (b.name === "latest.json") return 1;
        return b.name.localeCompare(a.name);
      });
    if (!backups.length) {
      setCloudStatus(appText("dropbox.noBackupsFound", "No backups were found in your Dropbox yet."));
      return;
    }
    setCloudStatus("");
    const latestFile = backups.find((file) => file.name === "latest.json");
    cloudLatestModified = latestFile ? Date.parse(latestFile.server_modified) : 0;
    cloudRestoreSelect.innerHTML = "";
    backups.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.path_lower;
      const when = new Date(file.server_modified).toLocaleString();
      option.textContent =
        file.name === "latest.json" ? appText("dropbox.latestCopy", `Latest copy (${when})`, { when }) : when;
      cloudRestoreSelect.appendChild(option);
    });
    cloudRestoreDialog.showModal();
  };
  document
    .getElementById("btn-cloud-restore")
    .addEventListener("click", openCloudRestore);
  document
    .getElementById("cancel-cloud-restore")
    .addEventListener("click", () => cloudRestoreDialog.close());
  document
    .getElementById("cloud-restore-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const path = cloudRestoreSelect.value;
      cloudRestoreDialog.close();
      setCloudStatus(appText("dropbox.downloading", "Downloading from Dropbox…"));
      await restoreFromCloud(path, cloudLatestModified || Date.now());
    });

  const showSettingsView = () => {
    currentViewId = "settings-view";
    document
      .querySelectorAll(".view")
      .forEach((view) => view.classList.remove("active"));
    document.getElementById(currentViewId).classList.add("active");
    renderBottomNav();
  };

  // Dropbox just sent the user back after connecting (or declining).
  const finishDropboxReturn = async () => {
    const result = dropbox.takeConnectResult();
    if (!result) return;
    showSettingsView();
    cloudChosen = true;
    cloudSection.open = true;
    if (!result.ok) {
      await refreshCloudUi();
      const callbackMessages = {
        "Dropbox was not connected because access was not allowed.": appText("dropbox.denied", "Dropbox was not connected because access was not allowed."),
        "Dropbox could not be connected. Please try again.": appText("dropbox.connectFailed", "Dropbox could not be connected. Please try again."),
      };
      setCloudStatus(callbackMessages[result.message] || result.message);
      cloudSection.scrollIntoView({ block: "start" });
      return;
    }
    localStorage.setItem(CLOUD_RECONNECT_DECISION_KEY, "1");
    cloudPaused = true;
    await refreshCloudUi();
    cloudSection.scrollIntoView({ block: "start" });
    if (!contacts.length) {
      try {
        const existing = (await dropbox.list()).filter((file) =>
          /^(latest|backup-.*)\.json$/.test(file.name),
        );
        if (existing.length) {
          if (
            await NRVDialogs.confirm(
              appText("dropbox.chooseExistingConfirm", "Dropbox already has NRV backup data. Do you want to choose a backup to restore onto this device now?"),
            )
          ) {
            await openCloudRestore();
            return;
          }
          setCloudStatus(
            appText("dropbox.connectedPaused", "Dropbox is connected, but automatic backup and restore are paused. Choose Restore from Dropbox, or Back Up to Dropbox Now to deliberately replace its latest copy."),
          );
          return;
        }
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
      } catch (error) {
        console.error(error);
        setCloudStatus(
          appText("dropbox.checkExistingFailed", "Dropbox is connected, but NRV could not check for existing backups. Automatic sync is paused until you choose Restore from Dropbox or Back Up to Dropbox Now."),
        );
        return;
      }
      setCloudStatus(appText("dropbox.connectedAddContacts", "Dropbox connected. Add contacts and they will be backed up."));
      return;
    }
    setCloudStatus(appText("dropbox.checkingExisting", "Dropbox connected. Checking for an existing backup…"));
    try {
      const remote = await getRemoteLatest();
      let overwrite = false;
      if (remote) {
        const when = new Date(remote.modified).toLocaleString();
        if (
          await NRVDialogs.confirm(
            appText("dropbox.restoreExistingConfirm", `Dropbox already has a backup (${when}). Restore it onto this device? That replaces the ${contacts.length} contacts here.`, { when, count: contacts.length }),
          )
        ) {
          await openCloudRestore();
          return;
        }
        if (
          !await NRVDialogs.confirm(
            appText("dropbox.backupInsteadConfirm", "Back up this device to Dropbox instead? That replaces the latest Dropbox copy with this device's data. Older dated copies stay."),
          )
        ) {
          setCloudStatus(
            appText("dropbox.nothingBackedUp", "Dropbox connected. Nothing was backed up. Use Restore from Dropbox or Back Up to Dropbox Now when you are ready."),
          );
          return;
        }
        overwrite = true;
      }
      setCloudStatus(appText("dropbox.firstBackup", "Dropbox connected. Making your first backup…"));
      await runCloudBackup({
        forceSnapshot: true,
        overwrite,
        userInitiated: true,
      });
      localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
      cloudPaused = false;
      await refreshCloudUi();
      setCloudStatus(appText("dropbox.firstBackupSaved", "Dropbox connected and your first backup is saved."));
    } catch (error) {
      console.error(error);
      setCloudStatus(
        appText("dropbox.firstBackupFailed", "Dropbox connected, but the first backup did not finish. Tap Back Up to Dropbox Now."),
      );
    }
  };

  refreshCloudUi();

  renderContacts();
  const installScreen = document.getElementById("install-screen");
  // mode: "existing" (prior state found), "install" (new working copy)
  const showInstallScreen = (mode) => {
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = true;
    appContainer.inert = true;
    appContainer.setAttribute("aria-hidden", "true");
    document.getElementById("installed-welcome").hidden = !isInstalledApp();
    const step2 = document.getElementById("setup-wizard-step-2");
    document.getElementById("setup-existing-data").hidden = mode !== "existing";
    document.getElementById("setup-wizard-step-1").hidden =
      mode !== "install" || !step2.hidden;
    if (mode !== "install") step2.hidden = true;
    document.getElementById("setup-wizard-progress").hidden = mode !== "install";
    const name = "NRV-Install";
    document.getElementById("install-screen-title").textContent = name;
    document.title = name;
    installScreen.hidden = false;
  };
  const confirmEraseAllData = async () => {
    return runStartFreshFlow({
      dropboxConnected: Boolean(dropbox?.isConnected()),
      askForConfirmation: (message) => NRVDialogs.confirm(message),
      erase: () => clearNrvWorkingState({
        database,
        indexedDB,
        localStorage,
        sessionStorage,
        dropbox,
      }),
      showMessage: (message) => NRVDialogs.alert(message),
      redirect: (url) => window.location.assign(url),
    });
  };
  document
    .getElementById("btn-erase-all-data")
    .addEventListener("click", confirmEraseAllData);
  document
    .getElementById("btn-install-start-new")
    .addEventListener("click", confirmEraseAllData);
  document
    .getElementById("btn-install-open-existing")
    .addEventListener("click", () =>
      document.getElementById("btn-setup-wizard-skip").click(),
    );
  const installRestoreInput = document.getElementById(
    "install-backup-file-input",
  );
  document
    .getElementById("btn-install-restore")
    .addEventListener("click", () => installRestoreInput.click());
  installRestoreInput.addEventListener("change", async () => {
    const file = installRestoreInput.files[0];
    installRestoreInput.value = "";
    if (!file) return;
    if (await restoreBackupFile(file)) {
      document.getElementById("btn-setup-wizard-skip").click();
    }
  });
  let setupDoneFlag = false;
  try {
    setupDoneFlag =
      localStorage.getItem(INSTALLED_SETUP_COMPLETE_KEY) === "true";
  } catch (error) {
    console.error("Unable to read the installed-app setup status:", error);
  }
  try {
    browserPreview = localStorage.getItem(LAUNCH_MODE_KEY) === "browser";
  } catch (error) {
    console.error("Unable to read the selected launch mode:", error);
  }
  if (restoredFromBackup) {
    markInstalledSetupComplete();
    installScreen.hidden = true;
  } else if (existingStateDetected && !setupDoneFlag && !browserPreview) {
    showInstallScreen("existing");
  } else if (contacts.length > 0 || setupDoneFlag) {
    if (contacts.length > 0) markInstalledSetupComplete();
    installScreen.hidden = true;
  } else {
    let setupComplete = false;
    let setupPending = false;
    let previousOnboardingDismissed = false;
    try {
      setupComplete =
        localStorage.getItem(INSTALLED_SETUP_COMPLETE_KEY) === "true";
      setupPending =
        localStorage.getItem("return_visits_setup_pending") === "true";
      previousOnboardingDismissed =
        localStorage.getItem("return_visits_onboarding_v2_dismissed") ===
        "true";
    } catch (error) {
      console.error("Unable to read the installed-app setup status:", error);
    }
    if (
      isInstalledApp() &&
      !setupComplete &&
      (!previousOnboardingDismissed || setupPending)
    ) {
      showInstallScreen("install");
    } else {
      installScreen.hidden = true;
    }
  }
  // Remind after 10 days without a backup, at most once a day. Only a
  // successful backup resets the count.
  const REMIND_AFTER_DAYS = 10;
  let lastBackupAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
  if (!lastBackupAt || !contacts.length) {
    lastBackupAt =
      Number(localStorage.getItem("return_visits_last_backup_reminder") || 0) ||
      Date.now();
    if (!contacts.length) lastBackupAt = Date.now();
    localStorage.setItem(LAST_BACKUP_KEY, String(lastBackupAt));
  }
  const checkBackupReminder = async () => {
    if (
      dropbox.isConnected() &&
      contacts.length &&
      Date.now() - Number(localStorage.getItem(CLOUD_LAST_KEY) || 0) >= DAY_MS
    ) {
      await autoCloudBackup();
    }
    const lastAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
    const days = Math.floor((Date.now() - lastAt) / DAY_MS);
    const today = new Date().toDateString();
    if (
      days < REMIND_AFTER_DAYS ||
      localStorage.getItem(LAST_BACKUP_PROMPT_KEY) === today
    ) {
      return;
    }
    localStorage.setItem(LAST_BACKUP_PROMPT_KEY, today);
    if (
      !await NRVDialogs.confirm(
        appText("backup.reminder", `You haven't backed up in ${days} days. Back up now?`, { days }),
      )
    ) {
      return;
    }
    if (dropbox.isConnected()) {
      if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
        showSettingsView();
        cloudSection.open = true;
        setCloudStatus(
          appText("dropbox.autoPausedDecision", "Automatic Dropbox sync is paused until you choose to restore the existing backup or deliberately replace it."),
        );
        cloudSection.scrollIntoView({ block: "start" });
        return;
      }
      try {
        await runCloudBackup({
          forceSnapshot: true,
          userInitiated: true,
        });
        await refreshCloudUi();
        await NRVDialogs.alert(appText("dropbox.backupSuccess", "Backed up to Dropbox."));
      } catch (error) {
        console.error(error);
        await NRVDialogs.alert(appText("dropbox.backupFailed", "Could not back up to Dropbox. Check your connection and try again."));
      }
      return;
    }
    showSettingsView();
    const backupSection = document
      .getElementById("btn-export-backup")
      .closest("details");
    backupSection.open = true;
    backupSection.scrollIntoView({ block: "start" });
  };
  window.setTimeout(async () => {
    await finishDropboxReturn();
    if (installScreen.hidden) {
      await checkCloudNewer();
      await checkBackupReminder();
    }
  }, 500);
};

const initializeInstallSetup = async () => {
  await window.nrvI18nReady;
  if (window.NRVI18n?.getLanguage() === "es") {
    document.querySelectorAll("[data-help-link]").forEach((link) => {
      link.href = link.href.replace(/help\.html(?=#|$)/, "help-es.html");
    });
  }
  const installBanner = document.getElementById("install-screen");
  const installBannerKey = "return_visits_onboarding_v2_dismissed";
  const setupPendingKey = "return_visits_setup_pending";
  const wizardStepKey = "return_visits_first_run_wizard_step_v2";
  let setupPending = false;
  let wizardStep = 1;
  try {
    setupPending = localStorage.getItem(setupPendingKey) === "true";
    const savedWizardStep = Number(localStorage.getItem(wizardStepKey));
    if (savedWizardStep === 2) wizardStep = savedWizardStep;
  } catch (error) {
    console.error("Unable to read the install setup status:", error);
  }
  installBanner.hidden = true;
  document.getElementById("setup-next-steps-notice").hidden = !setupPending;

  const deviceTypeSelect = document.getElementById("setup-device-type");
  const deviceSystemSelect = document.getElementById("setup-device-system");
  const deviceBrowserSelect = document.getElementById("setup-device-browser");
  const bookmarkInstructions = document.getElementById(
    "setup-bookmark-instructions",
  );
  const deviceSystems = {
    phone: [
      { value: "ios", label: "iPhone or iPad" },
      { value: "android", label: "Android" },
      { value: "other-mobile", label: "Another phone or tablet" },
    ],
    computer: [
      { value: "windows", label: "Windows" },
      { value: "mac", label: "Mac" },
      { value: "chromeos", label: "Chromebook" },
      { value: "other-computer", label: "Another computer" },
    ],
  };
  const getDeviceHint = () => {
    const userAgent = navigator.userAgent || "";
    if (
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
    ) {
      return { type: "phone", system: "ios" };
    }
    if (/Android/i.test(userAgent)) {
      return { type: "phone", system: "android" };
    }
    if (/CrOS/i.test(userAgent)) {
      return { type: "computer", system: "chromeos" };
    }
    if (/Windows/i.test(userAgent)) {
      return { type: "computer", system: "windows" };
    }
    if (/Macintosh|Mac OS/i.test(userAgent)) {
      return { type: "computer", system: "mac" };
    }
    return { type: "computer", system: "other-computer" };
  };
  const getBrowserHint = (system) => {
    const userAgent = navigator.userAgent || "";
    if (/SamsungBrowser/i.test(userAgent)) return "samsung";
    if (/Edg|EdgiOS|EdgA/i.test(userAgent)) return "edge";
    if (/FxiOS|Firefox/i.test(userAgent)) return "firefox";
    if (/CriOS|Chrome|Chromium/i.test(userAgent)) return "chrome";
    if (/Safari/i.test(userAgent) || system === "ios" || system === "mac") {
      return "safari";
    }
    return "other";
  };
  const getBrowserChoices = (system) => {
    if (system === "ios") {
      return [
        { value: "safari", label: "Safari" },
        { value: "chrome", label: "Chrome" },
        { value: "firefox", label: "Firefox" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "other", label: "Another browser" },
      ];
    }
    if (system === "android") {
      return [
        { value: "chrome", label: "Chrome" },
        { value: "samsung", label: "Samsung Internet" },
        { value: "firefox", label: "Firefox" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "other", label: "Another browser" },
      ];
    }
    if (system === "mac") {
      return [
        { value: "safari", label: "Safari" },
        { value: "chrome", label: "Chrome" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "firefox", label: "Firefox" },
        { value: "other", label: "Another browser" },
      ];
    }
    return [
      { value: "chrome", label: "Chrome" },
      { value: "edge", label: "Microsoft Edge" },
      { value: "firefox", label: "Firefox" },
      { value: "other", label: "Another browser" },
    ];
  };
  const setSelectOptions = (select, options, selectedValue) => {
    select.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }),
    );
    select.value = options.some((option) => option.value === selectedValue)
      ? selectedValue
      : options[0].value;
  };
  const getBookmarkSteps = (system, browser) => {
    if (system === "ios" && browser === "safari") {
      return [
        "Tap the Share button (the square with an arrow pointing up).",
        "In the menu, tap Add Bookmark. Scroll the menu if you do not see it.",
        "Tap Save. The bookmark is now in Safari.",
      ];
    }
    if (system === "ios" && browser === "chrome") {
      return [
        "Tap the three-dot menu in Chrome.",
        "Tap Add to Bookmarks (look for the star).",
        "If asked, tap Save or Done.",
      ];
    }
    if (system === "android" && browser === "chrome") {
      return [
        "Tap the three-dot menu near the top of Chrome.",
        "Tap the star or Add to bookmarks.",
        "The bookmark is saved in Chrome.",
      ];
    }
    if (system === "android" && browser === "samsung") {
      return [
        "Tap the browser menu (usually three lines or three dots).",
        "Choose Add page to, then Bookmarks (or tap the star).",
        "If asked, tap Save or Done.",
      ];
    }
    if (system === "ios" || system === "android" || system === "other-mobile") {
      return [
        "Open this browser's menu or Share button.",
        "Choose Bookmark, Add Bookmark, or the star icon.",
        "Tap Save or Done if the browser asks.",
      ];
    }
    const shortcut = system === "mac" ? "Command + D" : "Ctrl + D";
    if (browser === "safari" && system === "mac") {
      return [
        `Press ${shortcut}, or choose Bookmarks in the menu bar.`,
        "Choose Add Bookmark.",
        "Choose where to save it, then click Add.",
      ];
    }
    return [
      `Press ${shortcut}. In most browsers, you can also select the star near the address bar.`,
      "If a small box opens, choose where to save this page.",
      "Select Done, Save, or Add.",
    ];
  };
  const updateBookmarkInstructions = () => {
    const steps = getBookmarkSteps(
      deviceSystemSelect.value,
      deviceBrowserSelect.value,
    );
    bookmarkInstructions.replaceChildren();
    const intro = document.createElement("p");
    intro.textContent = appText("install.inBrowser", "In this browser:");
    const list = document.createElement("ol");
    steps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
    bookmarkInstructions.append(intro, list);
  };
  const setDeviceSystem = (system) => {
    const deviceType = deviceTypeSelect.value;
    setSelectOptions(deviceSystemSelect, deviceSystems[deviceType], system);
    const browserChoices = getBrowserChoices(deviceSystemSelect.value);
    setSelectOptions(
      deviceBrowserSelect,
      browserChoices,
      getBrowserHint(deviceSystemSelect.value),
    );
    updateBookmarkInstructions();
  };
  const deviceHint = getDeviceHint();
  deviceTypeSelect.value = deviceHint.type;
  setDeviceSystem(deviceHint.system);
  deviceTypeSelect.addEventListener("change", () => {
    setDeviceSystem(deviceSystems[deviceTypeSelect.value][0].value);
  });
  deviceSystemSelect.addEventListener("change", () => {
    const browserChoices = getBrowserChoices(deviceSystemSelect.value);
    setSelectOptions(
      deviceBrowserSelect,
      browserChoices,
      getBrowserHint(deviceSystemSelect.value),
    );
    updateBookmarkInstructions();
  });
  deviceBrowserSelect.addEventListener("change", updateBookmarkInstructions);

  const showWizardStep = (step, shouldFocus = false) => {
    wizardStep = step;
    document.getElementById("setup-wizard-step-1").hidden = step !== 1;
    document.getElementById("setup-wizard-step-2").hidden = step !== 2;
    document.getElementById("setup-wizard-progress").textContent =
      appText("setup.progress", `Step ${step} of 2: ${step === 1 ? "Welcome" : "Choose your setup"}`, {
        step,
        title: step === 1 ? appText("setup.welcomeShort", "Welcome") : appText("setup.choose", "Choose your setup"),
      });
    if (shouldFocus && !installBanner.hidden) {
      document
        .querySelector(`#setup-wizard-step-${step} h2`)
        .focus({ preventScroll: true });
    }
  };
  showWizardStep(wizardStep);

  const goToView = (viewId) => {
    const navButton = Array.from(
      document.querySelectorAll("#bottom-nav .nav-btn"),
    ).find((button) =>
      button.title.toLowerCase().startsWith(viewId.replace("-view", "")),
    );
    navButton?.click();
  };
  const startSetup = async () => {
    installBanner.hidden = true;
    try {
      localStorage.setItem(installBannerKey, "true");
      localStorage.setItem(setupPendingKey, "true");
      localStorage.removeItem(wizardStepKey);
    } catch (error) {
      console.error("Unable to save the setup status:", error);
      await NRVDialogs.alert(
        appText("setup.saveProgressFailed", "We could not save your setup progress. Please check device storage and try again."),
      );
      installBanner.hidden = false;
      return false;
    }
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = false;
    appContainer.inert = false;
    appContainer.setAttribute("aria-hidden", "false");
    document.body.classList.add("install-setup-in-progress");
    document.getElementById("setup-next-steps-notice").hidden = false;
    goToView("settings-view");
    const defaults = document.getElementById("defaults-your-details-section");
    defaults.open = true;
    document.getElementById("defaults-section").open = true;
    defaults.scrollIntoView({ block: "start" });
    return true;
  };
  document
    .getElementById("btn-setup-passphrase")
    .addEventListener("click", async () => {
      if (!(await startSetup())) return;
      openSettingsSection("passphrase-section");
      window.setTimeout(() => {
        document.getElementById("choices-section").open = true;
        document.getElementById("passphrase-section").open = true;
      }, 0);
    });
  const skipSetup = async () => {
    if (!markInstalledSetupComplete()) {
      await NRVDialogs.alert(
        appText("setup.saveDeviceProgressFailed", "We could not save your setup progress on this device. Check device storage and try again."),
      );
      return;
    }
    try {
      localStorage.setItem(installBannerKey, "true");
      localStorage.removeItem(setupPendingKey);
      localStorage.removeItem(wizardStepKey);
    } catch (error) {
      console.error("Unable to save the setup status:", error);
    }
    installBanner.hidden = true;
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = false;
    appContainer.inert = false;
    appContainer.setAttribute("aria-hidden", "false");
    document.getElementById("setup-next-steps-notice").hidden = true;
    document.body.classList.remove("install-setup-in-progress");
    document.title = `NRV - ${appText("view.contacts", "Contacts")}`;
    document.getElementById("app-title").textContent = document.title;
    goToView("contacts-view");
  };
  const continueWizard = () => {
    const errorMessage = document.getElementById("setup-wizard-continue-error");
    errorMessage.hidden = true;
    try {
      showWizardStep(2, true);
      if (
        wizardStep !== 2 ||
        document.getElementById("setup-wizard-step-2").hidden
      ) {
        throw new Error("The setup walkthrough did not advance.");
      }
      try {
        localStorage.setItem(wizardStepKey, "2");
      } catch (error) {
        console.error("Unable to save the setup walkthrough progress:", error);
      }
    } catch (error) {
      console.error("Unable to continue the setup walkthrough:", error);
      errorMessage.hidden = false;
      errorMessage.focus();
    }
  };
  const openSettingsSection = async (sectionId) => {
    if (document.getElementById("settings-view").classList.contains("active") &&
        !document.getElementById("defaults-your-details-section").contains(document.getElementById(sectionId)) &&
        !(await confirmLeaveSettings())) return;
    goToView("settings-view");
    const section = document.getElementById(sectionId);
    let ancestor = section.parentElement;
    while (ancestor) {
      if (ancestor.matches("details.settings-section")) {
        ancestor.open = true;
      }
      ancestor = ancestor.parentElement;
    }
    section.open = true;
    section.scrollIntoView({ block: "start" });
  };
  document
    .getElementById("btn-setup-wizard-next")
    .addEventListener("click", continueWizard);
  document
    .getElementById("btn-setup-wizard-skip-icon")
    .addEventListener("click", continueWizard);
  document
    .getElementById("btn-setup-wizard-skip")
    .addEventListener("click", skipSetup);
  document
    .getElementById("btn-dismiss-install-banner")
    .addEventListener("click", startSetup);
  document
    .getElementById("btn-setup-locations")
    .addEventListener("click", () => openSettingsSection("locations-section"));
  document
    .getElementById("btn-setup-contacts")
    .addEventListener("click", () => goToView("contacts-view"));
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeInstallSetup, {
    once: true,
  });
} else {
  initializeInstallSetup();
}

const updateStorageProtectionStatus = async () => {
  const statusEl = document.getElementById("storage-protection-status");
  if (!statusEl) return;
  if (!navigator.storage?.persist) {
    statusEl.textContent =
      appText("storage.protectionUnsupported", "Storage protection: not supported by this browser. Keep regular backups.");
    return;
  }
  try {
    const granted =
      (await navigator.storage.persisted()) ||
      (await navigator.storage.persist());
    statusEl.textContent = granted
      ? appText("storage.protectionOn", "Storage protection: on. Your browser will not clear your contacts to free space. Backups are still recommended.")
      : appText("storage.protectionDenied", "Storage protection: not granted by this browser. Your contacts could be cleared if the device runs low on space, so keep regular backups.");
  } catch (error) {
    console.error("Unable to request persistent storage:", error);
    statusEl.textContent =
      appText("storage.protectionCheckFailed", "Storage protection: could not be checked. Keep regular backups.");
  }
};

const startApplication = async () => {
  await window.nrvI18nReady;
  initializeApp()
    .then(() => {
      if (
        !document.getElementById("launch-choice-screen").hidden ||
        !document.getElementById("browser-install-screen").hidden
      ) {
        return;
      }
      const settingsInstallButton = document.getElementById("btn-settings-install");
      const settingsInstallStatus = document.getElementById("settings-install-status");
      settingsInstallButton.hidden = isInstalledApp();
      settingsInstallButton.addEventListener("click", () =>
        window.nrvBeginBrowserInstall({
          returnToApp: true,
          statusElement: settingsInstallStatus,
          buttonElement: settingsInstallButton,
        }),
      );
      let transferPending = false;
      try {
        transferPending =
          sessionStorage.getItem(INSTALL_TRANSFER_PENDING_KEY) === "true";
        if (transferPending) {
          sessionStorage.removeItem(INSTALL_TRANSFER_PENDING_KEY);
        }
      } catch (error) {
        console.error("Unable to read the pending installation handoff:", error);
        settingsInstallStatus.textContent = appText(
          "install.handoffStartFailed",
          "NRV could not prepare the information-preserving steps. Your browser information has not changed. Choose browser use, then open Settings to try again.",
        );
        settingsInstallStatus.hidden = false;
      }
      if (transferPending && browserPreview) {
        window.nrvBeginBrowserInstall({
          returnToApp: true,
          statusElement: settingsInstallStatus,
          buttonElement: settingsInstallButton,
          focusTarget: document.getElementById("app-title"),
          confirmNoData: true,
        });
      }
      updateStorageProtectionStatus();
      appReadyForUpdates = true;
      showJustUpdatedNotice();
      if (appUpdateAvailable) appUpdatePromptHandler();
    })
    .catch(async (error) => {
      console.error("Unable to start the app:", error);
      if (error instanceof NewerDataVersionError) {
        showStartupRecovery();
        return;
      }
      await NRVDialogs.alert(
        appText("storage.startupFailed", "NRV could not open and verify its storage. Private Safari use is unsupported: close the Private tab and reopen NRV in normal Safari, then install and open NRV from its Home Screen icon. Nothing has been deleted."),
      );
    });
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApplication, { once: true });
} else {
  startApplication();
}
