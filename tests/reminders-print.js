// Run with: node tests/reminders-print.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const merge = require("../merge.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n?/g, "\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const reminderStart = app.indexOf("const normalizeContactReminders = (reminders) => {");
const reminderEnd = app.indexOf("const normalizeTransferredContact", reminderStart);
assert(reminderStart >= 0 && reminderEnd > reminderStart);
const reminderHelpers = vm.runInNewContext(
  `${app.slice(reminderStart, reminderEnd)}
   ({ normalizeContactReminders, getCurrentContactReminders, getMostRecentSubstantiveNotes });`,
);

assert.deepStrictEqual(Array.from(reminderHelpers.normalizeContactReminders(undefined)), []);
const normalized = reminderHelpers.normalizeContactReminders([{
  id: "reminder-1",
  text: "  Call again  ",
  createdAt: "2026-03-01T10:00:00.000Z",
}]);
assert.strictEqual(normalized[0].text, "Call again");
assert.strictEqual(normalized[0].updatedAt, normalized[0].createdAt);
assert.strictEqual(normalized[0].dueAt, null);
assert.strictEqual(normalized[0].completedAt, null);
assert.throws(
  () => reminderHelpers.normalizeContactReminders([{ id: "bad", text: " ", createdAt: "invalid" }]),
  /reminders are invalid/,
);
console.log("PASS reminder normalization defaults legacy contacts and rejects invalid records");

const contact = {
  id: "contact-1",
  updatedAt: "2026-03-01T10:00:00.000Z",
  notesHistory: [
    { id: "note-old", text: "Old note", rawDate: "2026-01-01T10:00:00.000Z" },
    { id: "note-newest", text: "Newest note", rawDate: "2026-03-01T10:00:00.000Z" },
    { id: "note-middle", text: "Middle note", rawDate: "2026-02-01T10:00:00.000Z" },
    { id: "note-blank", text: "   ", rawDate: "2026-03-02T10:00:00.000Z" },
  ],
  reminders: [
    {
      id: "reminder-future",
      text: "<unsafe & task>",
      createdAt: "2026-03-01T10:00:00.000Z",
      dueAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
    {
      id: "reminder-no-date",
      text: "Undated task",
      createdAt: "2026-03-01T11:00:00.000Z",
      updatedAt: "2026-03-01T11:00:00.000Z",
    },
    {
      id: "reminder-done",
      text: "Completed task",
      createdAt: "2026-03-01T12:00:00.000Z",
      updatedAt: "2026-03-01T12:00:00.000Z",
      completedAt: "2026-03-02T12:00:00.000Z",
    },
  ],
};
assert.deepStrictEqual(
  Array.from(reminderHelpers.getMostRecentSubstantiveNotes(contact), (note) => note.id),
  ["note-newest", "note-middle"],
);
assert.deepStrictEqual(
  Array.from(reminderHelpers.getCurrentContactReminders(contact), (reminder) => reminder.id),
  ["reminder-future", "reminder-no-date"],
);
assert.strictEqual(contact.notesHistory.length, 4, "reading/printing notes must not reclassify or rewrite history");

const merged = merge.mergeContact(
  {
    ...contact,
    updatedAt: "2026-03-01T10:00:00.000Z",
    reminders: [{
      id: "shared-reminder",
      text: "Shared task",
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    }],
  },
  {
    ...contact,
    updatedAt: "2026-03-02T10:00:00.000Z",
    notesHistory: [{ id: "remote-note", text: "Remote note", rawDate: "2026-03-02T10:00:00.000Z" }],
    reminders: [
      {
        id: "shared-reminder",
        text: "Shared task",
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-02T10:00:00.000Z",
        completedAt: "2026-03-02T10:00:00.000Z",
      },
      {
        id: "remote-reminder",
        text: "Remote task",
        createdAt: "2026-03-02T10:00:00.000Z",
        updatedAt: "2026-03-02T10:00:00.000Z",
      },
    ],
  },
);
assert.deepStrictEqual(
  merged.reminders.map((reminder) => reminder.id).sort(),
  ["remote-reminder", "shared-reminder"],
);
assert(merged.reminders.find((reminder) => reminder.id === "shared-reminder").completedAt);
assert(merged.notesHistory.some((note) => note.id === "remote-note"));
assert(!merged.notesHistory.some((note) => note.id === "remote-reminder"));
console.log("PASS separate reminders merge across devices and do not enter Notes / History");

const printStart = app.indexOf("const getEmergencyPrintGroup = (contact) => {");
const printEnd = app.indexOf("\n  const printMyNrvInformation", printStart);
assert(printStart >= 0 && printEnd > printStart);
const printContext = {
  appText: (_key, fallback, values = {}) =>
    fallback.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`)),
  displayCountry: (country) => ({
    CA: "Canada",
    US: "United States",
  }[country] || country),
  escapeHtml: (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character])),
  getFormattedContactAddress: (entry) => entry.address || "",
  getPrintableNoteDate: (note) => note.rawDate || note.date || "Date not recorded",
  getCurrentContactReminders: reminderHelpers.getCurrentContactReminders,
  getMostRecentSubstantiveNotes: reminderHelpers.getMostRecentSubstantiveNotes,
};
const printHelpers = vm.runInNewContext(
  `${app.slice(printStart, printEnd)}
   ({ getEmergencyPrintGroup, buildEmergencyRecordContent });`,
  printContext,
);
const printed = printHelpers.buildEmergencyRecordContent([
  {
    id: "internal-contact-id",
    firstName: "Tia",
    lastName: "Zed",
    country: "US",
    city: "River",
    region: "North",
    area: "A",
    address: "12 Elm Street",
    phone: "555-0101",
    email: "tia@example.test",
    lat: "49.123",
    lng: "-120.456",
    recoveryCode: "private-recovery-code",
    notesHistory: contact.notesHistory,
    reminders: contact.reminders,
  },
  {
    id: "another-private-id",
    firstName: "Amy",
    lastName: "Able",
    country: "US",
    city: "River",
    region: "North",
    area: "A",
    notesHistory: [],
    reminders: [],
  },
  {
    id: "third-private-id",
    firstName: "Cal",
    lastName: "Other",
    country: "CA",
    city: "Lake",
    notesHistory: [],
    reminders: [],
  },
]);
assert(printed.indexOf("Canada → Lake") < printed.indexOf("United States → River → North → A"));
assert(printed.indexOf("Amy Able") < printed.indexOf("Tia Zed"));
assert(printed.includes("12 Elm Street"));
assert(printed.includes("555-0101"));
assert(printed.includes("tia@example.test"));
assert(printed.includes("Newest note") && printed.includes("Middle note"));
assert(!printed.includes("Old note") && !printed.includes("note-blank"));
assert(printed.includes("&lt;unsafe &amp; task&gt;") && printed.includes("Undated task"));
assert(!printed.includes("<unsafe & task>"));
assert(!printed.includes("Completed task"));
for (const privateValue of [
  "internal-contact-id",
  "another-private-id",
  "third-private-id",
  "49.123",
  "-120.456",
  "private-recovery-code",
]) {
  assert(!printed.includes(privateValue), `emergency print must exclude ${privateValue}`);
}
console.log("PASS emergency print groups and sorts contacts, limits Notes / History, includes current reminders, and omits internal data");

const reminderSection = html.match(
  /<section id="contact-reminders-section"[\s\S]*?<\/section>/,
);
assert(reminderSection);
assert.match(reminderSection[0], /<label for="contact-reminder-text"/);
assert.match(reminderSection[0], /<label for="contact-reminder-due"/);
assert.match(reminderSection[0], /id="contact-reminder-status" role="status" aria-live="polite"/);
assert.match(html, /id="reminders-overview-status" role="status" aria-live="polite"/);
assert.match(html, /id="btn-print-nrv-information"[^>]*data-i18n="print\.emergencyButton"/);
console.log("PASS reminder and print controls expose visible labels and polite status regions");
