const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const en = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));
const es = JSON.parse(fs.readFileSync(path.join(root, "locales/es.json"), "utf8"));

assert.match(html, /id="btn-contacts-backup"[\s\S]*?aria-hidden="true">↑<\/span>[\s\S]*?data-i18n="backup\.contactsBackup">Backup/);
assert.match(html, /id="btn-contacts-restore"[\s\S]*?aria-hidden="true">↓<\/span>[\s\S]*?data-i18n="backup\.contactsRestore">Restore/);
assert.match(html, /id="btn-import-contact"/);
assert.match(html, /id="btn-export-visible"/);
assert.match(html, /id="contacts-backup-file-input"[\s\S]*?accept="application\/json,\.json"[\s\S]*?hidden/);
assert.strictEqual(en["backup.contactsBackup"], "Backup");
assert.strictEqual(en["backup.contactsRestore"], "Restore");
assert.strictEqual(es["backup.contactsBackup"], "Copia de seguridad");
assert.strictEqual(es["backup.contactsRestore"], "Restaurar");
assert.match(css, /\.contact-backup-actions[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.contact-backup-actions button[\s\S]*?border: 2px solid #004080;[\s\S]*?background: white;[\s\S]*?white-space: nowrap;/);
assert.match(css, /@media \(max-width: 340px\)[\s\S]*?\.contact-backup-actions button[\s\S]*?font-size: 12px;/);
assert.match(app, /getElementById\("btn-contacts-backup"\)[\s\S]*?getElementById\("btn-export-backup"\)\.click\(\)/);
assert.match(app, /getElementById\("btn-contacts-restore"\)[\s\S]*?contactsBackupFileInput\.click\(\)/);
assert.match(app, /contactsBackupFileInput\.addEventListener\("change", async \(\) => \{[\s\S]*?await restoreBackupFile\(file\)/);

console.log("PASS Contacts full-backup shortcuts, localization, styling, and behavior");
