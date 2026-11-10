const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const en = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));
const es = JSON.parse(fs.readFileSync(path.join(root, "locales/es.json"), "utf8"));

const contactActions = html.match(/<div class="contact-toolbar-actions">([\s\S]*?)<\/div>/)?.[1];
assert(contactActions);
assert.match(contactActions, /id="btn-contacts-backup"[\s\S]*?aria-hidden="true">↑<\/span>[\s\S]*?data-i18n="backup\.contactsBackup">Backup/);
assert.match(contactActions, /id="btn-contacts-restore"[\s\S]*?aria-hidden="true">↓<\/span>[\s\S]*?data-i18n="backup\.contactsRestore">Restore/);
assert.strictEqual((contactActions.match(/<button\b/g) || []).length, 2);
assert(!html.includes('class="contact-backup-actions"'));
assert(!html.includes('id="btn-import-contact"'));
assert(!html.includes('id="btn-export-visible"'));
assert.match(html, /id="contacts-backup-file-input"[\s\S]*?accept="application\/json,\.json"[\s\S]*?hidden/);
assert.strictEqual(en["backup.contactsBackup"], "Backup");
assert.strictEqual(en["backup.contactsBackupShort"], "Backup");
assert.strictEqual(en["backup.contactsRestore"], "Restore");
assert.strictEqual(en["backup.contactsRestoreShort"], "Restore");
assert.strictEqual(es["backup.contactsBackup"], "Copia de seguridad");
assert.strictEqual(es["backup.contactsBackupShort"], "Copia");
assert.strictEqual(es["backup.contactsRestore"], "Restaurar");
assert.strictEqual(es["backup.contactsRestoreShort"], "Restaurar");
assert.match(css, /\.contact-backup-button[\s\S]*?font-size: 14px;[\s\S]*?white-space: nowrap;/);
assert.match(css, /@media \(max-width: 560px\) \{\s+\.contact-list-actions \{\s+grid-template-columns: minmax\(98px, 1fr\) 48px minmax\(124px, 1fr\)/);
assert.match(css, /@media \(max-width: 340px\) \{\s+\.contact-list-actions \{\s+grid-template-columns: minmax\(82px, 0\.8fr\) 44px minmax\(110px, 1\.2fr\)/);
assert.match(app, /getElementById\("btn-contacts-backup"\)[\s\S]*?getElementById\("btn-export-backup"\)\.click\(\)/);
assert.match(app, /getElementById\("btn-contacts-restore"\)[\s\S]*?contactsBackupFileInput\.click\(\)/);
assert.match(app, /contactsBackupFileInput\.addEventListener\("change", async \(\) => \{[\s\S]*?await restoreBackupFile\(file\)/);

console.log("PASS Contacts full-backup shortcuts, localization, styling, and behavior");
