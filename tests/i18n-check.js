// Run with: node tests/i18n-check.js
const fs = require("fs");
const path = require("path");
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
    catalogs[lang.code] = JSON.parse(fs.readFileSync(file, "utf8"));
    check(true, `${lang.file} is valid JSON`);
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
  const mismatched = keys.filter((k) => k in en && placeholders(catalog[k]) !== placeholders(en[k]));
  check(mismatched.length === 0, `${code}: placeholders match English${mismatched.length ? ` (${mismatched.join(", ")})` : ""}`);
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
