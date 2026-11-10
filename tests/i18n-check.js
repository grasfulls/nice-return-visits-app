// Run with: node tests/i18n-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const i18n = require("../i18n.js");

const root = path.join(__dirname, "..");
let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures += 1;
};
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const baseKey = (key) => key.replace(/_(zero|one|two|few|many|other)$/, "");

const catalogs = {};
for (const lang of i18n.LANGUAGES) {
  const file = path.join(root, lang.file);
  try {
    const raw = fs.readFileSync(file, "utf8");
    catalogs[lang.code] = JSON.parse(raw);
    check(true, `${lang.file} is valid JSON`);
    const source = raw.trim();
    const property = /\s*("(?:\\.|[^"\\])*")\s*:\s*"(?:\\.|[^"\\])*"\s*(,|})/gy;
    const keys = [];
    let position = 1;
    while (position < source.length && source[position] !== "}") {
      property.lastIndex = position;
      const match = property.exec(source);
      if (!match) throw new Error("Expected a flat catalog of string values");
      keys.push(JSON.parse(match[1]));
      position = property.lastIndex;
      if (match[2] === "}") break;
    }
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    check(keys.length === Object.keys(catalogs[lang.code]).length && duplicates.length === 0,
      `${lang.file}: no duplicate keys${duplicates.length ? ` (${duplicates.join(", ")})` : ""}`);
  } catch (error) {
    check(false, `${lang.file} is valid JSON (${error.message})`);
  }
}

const en = catalogs.en || {};
check(i18n.LANGUAGES.some((l) => l.code === "en"), "English is registered");
check(Object.values(en).every((v) => typeof v === "string" && v.length > 0), "en.json values are non-empty strings");

for (const [code, catalog] of Object.entries(catalogs)) {
  if (code === "en") continue;
  const enBases = new Set(Object.keys(en).map(baseKey));
  const keys = Object.keys(catalog);
  const bases = new Set(keys.map(baseKey));
  const missing = [...enBases].filter((k) => !bases.has(k));
  const extra = [...bases].filter((k) => !enBases.has(k));
  check(missing.length === 0, `${code}: no keys missing from English${missing.length ? ` (${missing.join(", ")})` : ""}`);
  check(extra.length === 0, `${code}: no keys absent from English${extra.length ? ` (${extra.join(", ")})` : ""}`);
  check(keys.length === Object.keys(en).length && keys.every((key) => key in en), `${code}: exact keys match English`);
  check(Object.values(catalog).every((v) => typeof v === "string" && v.length > 0), `${code}: values are non-empty strings`);
  const mismatched = keys.filter((k) => k in en && placeholders(catalog[k]) !== placeholders(en[k]));
  check(mismatched.length === 0, `${code}: placeholders match English${mismatched.length ? ` (${mismatched.join(", ")})` : ""}`);
}

// The English text left in index.html must stay identical to en.json (it is the no-JS fallback).
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const norm = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|ge);/g, (entity) => ({
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&ge;": "≥",
})[entity]).replace(/\s+/g, " ").trim();
const usedKeys = new Set();
const textMismatch = [];
for (const m of html.matchAll(/<(\w+)[^>]*?data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
  usedKeys.add(m[2]);
  if (en[m[2]] !== norm(m[3])) textMismatch.push(m[2]);
}
for (const m of html.matchAll(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g)) {
  for (const pair of m[1].split(";")) {
    const [attr, key] = pair.split(":");
    const value = (m[0].match(new RegExp(`\\s${attr}="([^"]*)"`)) || [])[1];
    usedKeys.add(key);
    if (en[key] !== value) textMismatch.push(key);
  }
}
const unknown = [...usedKeys].filter((k) => !(k in en));
check(unknown.length === 0, `index.html uses only keys defined in en.json${unknown.length ? ` (${unknown.join(", ")})` : ""}`);
check(textMismatch.length === 0, `index.html English text equals en.json${textMismatch.length ? ` (${textMismatch.join(", ")})` : ""}`);
check(usedKeys.size > 0, `index.html uses ${usedKeys.size} i18n keys`);
check(en["agreement.notice.small"] ===
  "Dropbox, contact sharing, and address searches are used only when you choose to use those features." &&
  catalogs.es["agreement.notice.small"] ===
  "Dropbox, el uso compartido de contactos y las búsquedas de direcciones solo se utilizan cuando eliges usar esas funciones.",
  "privacy feature-choice wording is equivalent in English and Spanish");
check(en["backup.strategy"].includes("use Dropbox to help keep your NRV contacts synchronized across devices") &&
  catalogs.es["backup.strategy"].includes("usa Dropbox para ayudar a mantener sincronizados tus contactos de NRV entre dispositivos") &&
  en["setup.securityDetails"].includes("use Dropbox to help keep your NRV contacts synchronized across devices") &&
  catalogs.es["setup.securityDetails"].includes("usa Dropbox para ayudar a mantener sincronizados tus contactos de NRV entre dispositivos"),
  "Dropbox wording avoids promising automatic or error-free synchronization");

const runtimeKeys = new Set();
for (const filename of ["app.js", "dropbox.js", "i18n.js"]) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  for (const match of source.matchAll(/\b(?:appText|NRVI18n\.t|t)\(\s*["']([^"']+)["']/g)) {
    runtimeKeys.add(match[1]);
  }
}
const undefinedRuntimeKeys = [...runtimeKeys].filter((key) =>
  !(key in en) && !(`${key}_one` in en && `${key}_other` in en));
check(undefinedRuntimeKeys.length === 0,
  `runtime literal translation keys exist${undefinedRuntimeKeys.length ? ` (${undefinedRuntimeKeys.join(", ")})` : ""}`);

// Exercise the real plural catalogs used by dynamically rendered contact cards.
i18n._setCatalog("en", catalogs.en);
i18n._setCatalog("es", catalogs.es);
i18n._setCurrent("en");
check(i18n.t("contacts.visitCount", { count: 1 }) === "1 visit note" &&
  i18n.t("contacts.visitCount", { count: 2 }) === "2 visit notes",
  "English visit counts use the correct plural forms");
i18n._setCurrent("es");
check(i18n.t("contacts.visitCount", { count: 1 }) === "1 nota de visita" &&
  i18n.t("contacts.visitCount", { count: 2 }) === "2 notas de visita" &&
  i18n.t("contacts.dayCount", { count: 1 }) === "1 día" &&
  i18n.t("contacts.dayCount", { count: 2 }) === "2 días",
  "Spanish contact counts use the correct plural forms");
check(i18n.t("location.areaAdded", { name: "Centro", city: "Lima" }) ===
  "Se agregó el área «Centro» a Lima." &&
  i18n.t("map.centeredNear", { location: "Lima, Lima" }) ===
  "No hay marcadores de contactos para mostrar. El mapa está centrado cerca de Lima, Lima." &&
  i18n.t("print.mapLocationCount", { count: 2, date: "11/5" }) ===
  "2 ubicaciones en el mapa • 11/5" &&
  i18n.t("location.deleteBlocked", { type: "región", count: 1 }) ===
  "No se puede eliminar la ubicación de tipo región mientras tenga 1 contacto asignado. Primero reasigna ese contacto.",
  "Spanish dynamic messages interpolate location values without changing them");
i18n._setCurrent("en");
check(i18n.t("location.areaAdded", { name: "Centro", city: "Lima" }) ===
  'Area "Centro" added to Lima.' &&
  i18n.t("map.centeredNear", { location: "Lima, Lima" }) ===
  "No contact pins to show. The map is centered near Lima, Lima." &&
  i18n.t("print.mapLocationCount", { count: 1, date: "11/5" }) ===
  "1 map location • 11/5" &&
  i18n.t("location.deleteBlocked", { type: "region", count: 2 }) ===
  "Cannot delete this region while it has 2 assigned contacts. Reassign those contacts first.",
  "English dynamic messages retain existing wording and location values");
check(
  i18n.t("goals.stepsCount", { count: 1 }) === "1 step" &&
    i18n.t("goals.stepsCount", { count: 4 }) === "4 steps" &&
    i18n.t("goals.progress", { count: 1, total: 4 }) ===
      "1 of 4 completed!" &&
    i18n.t("goals.achievementMilestone", { count: 1, path: "Custom" }) ===
      "You completed 1 step on your Custom path.",
  "English goal counts and milestones use correct singular and plural forms",
);
check(
  i18n.t("goals.path.beginMinistry") === "Begin Participating in the Ministry" &&
    i18n.t("goals.item.startConversationDoor") ===
      "Start a conversation at a door" &&
    i18n.t("goals.method.smpw") ===
      "Special Metropolitan Public Witnessing (SMPW)",
  "English introductory ministry path uses the specified milestones and terminology",
);
i18n._setCurrent("es");
check(
  i18n.t("goals.stepsCount", { count: 1 }) === "1 paso" &&
    i18n.t("goals.stepsCount", { count: 4 }) === "4 pasos" &&
    i18n.t("goals.progress", { count: 1, total: 4 }) ===
      "¡1 de 4 completado!" &&
    i18n.t("goals.achievementMilestone", { count: 1, path: "Personal" }) ===
      "Completaste 1 paso de tu camino Personal.",
  "Spanish goal counts and milestones use correct singular and plural forms",
);
check(
  i18n.t("goals.path.beginMinistry") ===
    "Comenzar a participar en el ministerio" &&
    i18n.t("goals.method.smpw") ===
      "Special Metropolitan Public Witnessing (SMPW)",
  "Spanish introductory path is localized and retains the SMPW terminology",
);
i18n._setCurrent("en");

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const mapControlsHandler = appSource.match(/const localizeMapControls = [\s\S]*?\r?\n};/);
check(Boolean(mapControlsHandler), "Leaflet control localization is available for tests");
if (mapControlsHandler) {
  const context = { appText: (key, fallback, vars) => i18n.t(key, vars, fallback) };
  vm.runInNewContext(mapControlsHandler[0] + "\nthis.localizeMapControls = localizeMapControls;", context);
  for (const [language, labels] of Object.entries({
    en: ["Zoom in", "Zoom out", "Close popup"],
    es: ["Acercar", "Alejar", "Cerrar ventana emergente"],
  })) {
    i18n._setCurrent(language);
    const buttons = Array.from({ length: 3 }, () => ({
      title: "",
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
    }));
    let popupOpen;
    const map = {
      zoomControl: { getContainer: () => ({
        querySelector: (selector) => buttons[selector === ".leaflet-control-zoom-in" ? 0 : 1],
      }) },
      on: (event, handler) => { if (event === "popupopen") popupOpen = handler; },
    };
    context.localizeMapControls(map);
    popupOpen({ popup: { getElement: () => ({ querySelector: () => buttons[2] }) } });
    check(buttons[0].title === labels[0] && buttons[0].attributes["aria-label"] === labels[0] &&
      buttons[1].title === labels[1] && buttons[1].attributes["aria-label"] === labels[1] &&
      buttons[2].attributes["aria-label"] === labels[2],
    `${language}: Leaflet zoom controls and popup close button are localized`);
  }
  check(appSource.includes("localizeMapControls(map);") &&
    appSource.includes("localizeMapControls(pickerMap);"),
  "Leaflet controls are localized on both maps");
}
const storageHandler = appSource.match(/const showStorageError = async \([\s\S]*?\r?\n};\r?\n\r?\nconst LAST_BACKUP_KEY/);
check(Boolean(storageHandler), "storage error handler is available for translation tests");
if (storageHandler) {
  const actions = [
    "save country", "save city", "save settings", "save region", "save area",
    "save your details", "clear your details", "save location changes",
    "delete the contact", "save time in service", "save contacts",
    "save your home pin", "export encrypted backup", "export contacts",
  ];
  let message = "";
  const context = {
    appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
    console: { error() {} },
    NRVDialogs: { alert: async (text) => { message = text; } },
  };
  vm.runInNewContext(storageHandler[0].replace(/\r?\n\r?\nconst LAST_BACKUP_KEY$/, "") +
    "\nthis.showStorageError = showStorageError;", context);
  i18n._setCurrent("en");
  check(actions.every((action) => {
    context.showStorageError(action, new Error("test"));
    return message === `Could not ${action}. Your changes may not have been saved. Please try again.`;
  }), "storage errors preserve English wording for every known action");
  i18n._setCurrent("es");
  check(actions.every((action) => {
    context.showStorageError(action, new Error("test"));
    return message.startsWith("No se pudo ") && !message.includes(action);
  }), "storage errors translate every known action into Spanish");
  check(i18n.t("contacts.importFailed", { detail: i18n.t("contacts.invalidFile") }) ===
    "No se pudo importar. El contenido del archivo de contacto no es válido. Tus contactos actuales no se modificaron." &&
    i18n.t("dropbox.latestCopy", { when: "2026-11-05" }) ===
    "Copia más reciente (2026-11-05)" &&
    i18n.t("map.myHome") === "Mi casa",
  "Spanish import, Dropbox and map messages interpolate without changing values");
}

// Runtime behavior
i18n._setCatalog("en", { greet: "Hello {name}", item_one: "{count} item", item_other: "{count} items", only_en: "English only" });
i18n._setCatalog("xx", { greet: "Hola {name}" });
i18n._setCurrent("en");
check(i18n.t("greet", { name: "Ana" }) === "Hello Ana", "interpolates variables");
check(i18n.t("item", { count: 1 }) === "1 item" && i18n.t("item", { count: 3 }) === "3 items", "selects plural forms");
check(i18n.t("missing.key") === "missing.key", "unknown key returns the key");
check(i18n.t("missing.key", null, "Fallback") === "Fallback", "unknown key returns supplied fallback");
check(i18n.t("greet") === "Hello {name}", "unfilled placeholder is left intact");
i18n._setCurrent("xx");
check(i18n.t("greet", { name: "Ana" }) === "Hola Ana", "uses the selected language");
check(i18n.t("only_en") === "English only", "falls back to English for missing keys");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll i18n checks passed");
process.exit(failures ? 1 : 0);
