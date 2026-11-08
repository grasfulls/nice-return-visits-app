// Run with: node tests/presentation-branding.js
// Set NRV_WEBSITE_PATH to include the public website.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const host = /grasfulls\.github(?:\.io)?/i;

function visibleText(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, " ");
}

function checkDirectory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      checkDirectory(file);
    } else if (/\.(html|svg)$/i.test(entry.name)) {
      assert(!host.test(visibleText(file)), `Visible hosting address in ${file}`);
    }
  }
}

for (const name of ["index.html", "help.html", "privacy.html", "terms.html"]) {
  assert(!host.test(visibleText(path.join(root, name))), `Visible hosting address in ${name}`);
}
for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  for (const [key, value] of Object.entries(catalog)) {
    if (!/url$/i.test(key)) assert(!host.test(value), `Visible hosting address in ${language}: ${key}`);
  }
}
if (process.env.NRV_WEBSITE_PATH) {
  checkDirectory(process.env.NRV_WEBSITE_PATH);
  console.log("PASS  website HTML and SVG presentation uses NRV branding");
} else {
  console.log("SKIP  website presentation (set NRV_WEBSITE_PATH to the website repository)");
}
console.log("PASS  app HTML and translated text use NRV branding");
