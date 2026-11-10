// Run with: node tests/contact-backup-controls.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const en = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));
const es = JSON.parse(fs.readFileSync(path.join(root, "locales/es.json"), "utf8"));

const contactActions = html.match(/<div class="contact-list-actions">([\s\S]*?)<\/div>/)?.[1];
assert(contactActions);
assert.match(contactActions, /id="btn-open-modal"/);
assert.match(contactActions, /id="btn-time-toggle"/);
assert(!contactActions.includes("backup"));
assert(!html.includes('id="btn-contacts-backup"'));
assert(!html.includes('id="btn-contacts-restore"'));
assert(!html.includes('id="contacts-backup-file-input"'));
assert(!app.includes("btn-contacts-backup"));
assert(!app.includes("btn-contacts-restore"));
assert(!app.includes("contacts-backup-file-input"));
for (const key of [
  "backup.contactsBackup",
  "backup.contactsBackupShort",
  "backup.contactsRestore",
  "backup.contactsRestoreShort",
]) {
  assert.strictEqual(en[key], undefined);
  assert.strictEqual(es[key], undefined);
}
assert.match(css, /\.contact-list-actions\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 48px minmax\(0, 1fr\)/);
assert.match(css, /#btn-time-toggle\s*\{[^}]*grid-column: 3;[^}]*justify-self: end;/);
assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?#btn-time-toggle:not\(\[hidden\]\)\s*\{[^}]*grid-column: 3;[^}]*justify-self: end;/);
assert.match(html, /id="btn-export-backup"[\s\S]*?data-i18n="backup\.everything"/);
assert.match(html, /id="backup-file-input"[\s\S]*?accept="application\/json,\.json"/);
assert.match(html, /id="btn-restore-backup"[\s\S]*?data-i18n="backup\.restoreSelected"/);
assert.match(app, /getElementById\("btn-export-backup"\)[\s\S]*?downloadEncryptedBackup\(\)/);
assert.match(app, /getElementById\("btn-restore-backup"\)[\s\S]*?restoreBackupFile\(backupFileInput\.files\[0\]\)/);
assert.match(app, /const restoreBackupFile = async \(file\) => \{[\s\S]*?await reportRestoreError\(error\)/);
assert.match(html, /id="btn-time-toggle" class="time-toggle"/);
assert.match(app, /timeToggleButton\.textContent = tracking\.runningSince \? "Stop Time" : "Start Time"/);

console.log("PASS Contacts has no backup/restore shortcuts; timer is right-aligned; Settings backup/restore remains wired");
