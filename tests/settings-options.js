const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const settingsStart = html.indexOf('<div id="settings-view"');
const settingsEnd = html.indexOf("</main>", settingsStart);
assert(settingsStart >= 0 && settingsEnd > settingsStart);
const settingsHtml = html.slice(settingsStart, settingsEnd);
const topLevelSections = [];
const optionsSections = [];
const sectionTags = /<details\b([^>]*)>|<\/details>/g;
const openDetails = [];
let match;

while ((match = sectionTags.exec(settingsHtml))) {
  if (match[0].startsWith("</")) {
    openDetails.pop();
    continue;
  }
  const attributes = match[1];
  const id = attributes.match(/\bid="([^"]+)"/)?.[1] || "";
  const summary = settingsHtml
    .slice(sectionTags.lastIndex)
    .match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1]
    ?.replace(/<[^>]*>/g, "")
    .trim();
  if (!openDetails.length) topLevelSections.push({ id, summary });
  if (openDetails.some((section) => section.id === "options-section")) {
    optionsSections.push({ id, summary });
  }
  openDetails.push({ id });
}

assert.deepStrictEqual(
  topLevelSections.map(({ id, summary }) => id || summary),
  [
    "defaults-your-details-section",
    "locations-section",
    "choices-section",
    "backup-section",
    "Help",
    "app-updates-section",
    "options-section",
  ],
);
assert.deepStrictEqual(
  optionsSections.map(({ id }) => id),
  [
    "time-tracking-section",
    "goals-option-section",
    "encouragement-option-section",
    "working-need-option-section",
  ],
);
assert(!settingsHtml.includes('id="preferences-section"'));
assert(!settingsHtml.includes('id="settings-language"'));
assert(settingsHtml.includes('id="btn-erase-all-data"'));
assert(settingsHtml.includes('id="btn-open-goals"'));
assert(settingsHtml.includes('id="setting-time-tracking"'));
assert(settingsHtml.includes('id="setting-time-monthly"'));
assert(settingsHtml.includes('id="setting-time-yearly"'));
assert(settingsHtml.includes('id="settings-goals-encouragement"'));
assert(settingsHtml.includes('id="settings-working-need-enabled"'));
assert(settingsHtml.includes('id="settings-working-need-designation"'));
assert(settingsHtml.includes('id="settings-working-need-country"'));

const navigationStart = app.indexOf("  const navButtonsConfig = [");
const navigationEnd = app.indexOf("  const getPageActions =", navigationStart);
assert(navigationStart >= 0 && navigationEnd > navigationStart);
assert(!app.slice(navigationStart, navigationEnd).includes('"goals-view"'));
assert(app.includes('getElementById("btn-open-goals")'));
assert(app.includes('addEventListener("click", async () => await navigateToView("goals-view"))'));
assert(html.includes('id="btn-view-goals"'));
assert(html.includes('id="goals-view"'));
assert(html.includes('id="search-input"'));
assert(html.includes('id="filter-urgency"'));
assert(html.includes('id="filter-city"'));
assert(html.includes('id="filter-region"'));
assert(html.includes('id="filter-area"'));
assert(html.includes('id="sort-select"'));
assert(styles.includes("body.goals-view-open #filters-bar"));

console.log("PASS  Settings order, Options features, Goals navigation, and isolated Contacts filters");
