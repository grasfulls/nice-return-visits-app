const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const help = {
  en: fs.readFileSync(path.join(root, "help.html"), "utf8"),
  es: fs.readFileSync(path.join(root, "help-es.html"), "utf8"),
};
const locales = Object.fromEntries(["en", "es"].map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8")),
]));

for (const language of ["en", "es"]) {
  const html = help[language];
  const troubleStart = html.indexOf('<h2 id="troubleshooting">');
  assert(troubleStart >= 0, `${language}: troubleshooting heading`);
  const troubleEnd = html.indexOf("</ul>", troubleStart);
  assert(troubleEnd > troubleStart, `${language}: troubleshooting list`);
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const troubleshooting = html
    .slice(troubleStart, troubleEnd)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

  assert.match(html, /id="backup"/, `${language}: backup anchor`);
  assert.match(html, /id="troubleshooting"/, `${language}: troubleshooting anchor`);
  assert.match(
    html,
    language === "en" ? /id="already-using-the-app-in-a-browser"/ : /id="consolidate"/,
    `${language}: browser/storage guidance anchor`,
  );
  assert(
    /NRV cannot confirm in advance whether saved information|NRV no puede confirmar de antemano si la información guardada/.test(text),
    `${language}: browser/app availability is described as unknown`,
  );
  assert(
    /verify a current backup|verifica una copia de seguridad actual/.test(text),
    `${language}: recommends a verified backup before switching`,
  );
  assert(
    /Check for Updates|Buscar actualizaciones/.test(troubleshooting),
    `${language}: future-format recovery action`,
  );
  assert(
    /does not automatically repeat the original import|no repetirá automáticamente la importación/.test(troubleshooting),
    `${language}: future-format recovery does not repeat the operation`,
  );
  assert(
    /saved the information but could not update the screen|guardó la información pero no pudo actualizar la pantalla/.test(troubleshooting),
    `${language}: post-save screen failure is distinct`,
  );
  assert(
    /Restore from Backup|Restaurar desde una copia de seguridad/.test(troubleshooting),
    `${language}: invalid decrypted structure routes to backup restore`,
  );
  assert(
    /Open Backup\/Restore|Abrir Copia de seguridad\/restauración/.test(troubleshooting),
    `${language}: unsupported update check has a direct Backup/Restore action`,
  );
  assert(
    /diagnostic|error code|código de error/i.test(troubleshooting),
    `${language}: diagnostic codes remain useful`,
  );
  assert(
    /Try Again|Intentar de nuevo/.test(troubleshooting),
    `${language}: targeted retry guidance`,
  );
  assert(
    /print action|impresión/.test(troubleshooting),
    `${language}: print retry guidance`,
  );
  assert(
    language === "en"
      ? text.includes("An update isn’t ready yet. Please try again later.")
      : text.includes("Una actualización aún no está lista. Vuelve a intentarlo más tarde."),
    `${language}: update-readiness wording states only what NRV knows`,
  );
  assert.doesNotMatch(text, /published version|file was made by a newer version|versión más reciente/);
  assert(
    !/reinstall|uninstall|start fresh|erase|reset|reinstal|desinstal|empezar de nuevo|borrar todo|restablecer/i.test(troubleshooting),
    `${language}: no generic destructive recovery in troubleshooting`,
  );
}

assert.doesNotMatch(help.en, /contacts will not appear automatically|may be separate copies and do not sync/i);
assert.doesNotMatch(help.es, /no aparecerán automáticamente|copias separadas|no se transfiere automáticamente/i);

for (const language of ["en", "es"]) {
  const note = locales[language]["release.current.change1"];
  assert(/checks for updates|busca actualizaciones/i.test(note), `${language}: What's New mentions startup updates`);
  assert(/automatically|automáticamente/i.test(note), `${language}: What's New describes automatic startup`);
  assert(/status|informa|indica/i.test(note), `${language}: What's New describes update status`);
  assert(!/how long|cuánto esperar|cuánto tiempo/i.test(note), `${language}: no unsupported retry timing claim`);
}

console.log("PASS bilingual Help clarity, recovery guidance, browser wording, and What's New");
