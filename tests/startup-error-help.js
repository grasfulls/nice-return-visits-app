// Run with: node tests/startup-error-help.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { fixture } = require("./startup-handoff.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const source = html.match(/<script id="nrv-error-help-script">([\s\S]*?)<\/script>/)[1];
const verificationCodes = [...html.matchAll(/:\s*"(NRV-V\d{2})"/g)].map((match) => match[1]);
const codes = [...new Set([...verificationCodes, "NRV-S01", "NRV-S02", "NRV-A01"])];

function helpFixture(language) {
  const test = fixture(language);
  let click;
  test.document.addEventListener = (type, handler) => {
    assert.strictEqual(type, "click");
    click = handler;
  };
  const dialog = test.element("nrv-error-help");
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => {
    dialog.open = false;
    test.listeners.get("nrv-error-help:close")();
  };
  const codeButton = test.element("startup-recovery-code");
  codeButton.id = "startup-recovery-code";
  codeButton.hidden = false;
  codeButton.focus = () => { test.focused = codeButton; };
  const setupButton = test.element("setup-error-code");
  setupButton.id = "setup-error-code";
  setupButton.focus = () => { test.focused = setupButton; };
  vm.runInContext(source, test.context);
  test.open = (code) => {
    const button = code === "NRV-A01" ? setupButton : codeButton;
    button.textContent = `Error code: ${code}`;
    click({ target: button });
  };
  test.close = () => dialog.close();
  test.click = (target) => click({ target });
  return test;
}

for (const language of ["en", "es"]) {
  const test = helpFixture(language);
  const originalTimers = [...test.timers.keys()];
  for (const code of codes) {
    test.open(code);
    assert.strictEqual(test.element("nrv-error-help").open, true, code);
    assert.strictEqual(test.element("nrv-error-help").lang, language);
    assert(test.element("nrv-error-help-title").textContent.includes(code));
    assert(test.element("nrv-error-help-meaning").textContent.length > 30, code);
    const action = test.element("nrv-error-help-action").textContent;
    if (/NRV-V(?:04|05|12|13)/.test(code)) assert(action.includes("60"), code);
    else if (!["NRV-V01", "NRV-A01"].includes(code)) assert(action.includes("10"), code);
    if (code === "NRV-V01") {
      assert(action.includes("Safari") && action.includes("Chrome") && action.includes("Edge"));
      assert(!action.includes("Check for Updates"));
    }
    if (/NRV-S/.test(code)) assert(action.includes(language === "es" ? "Intentar de nuevo" : "Try Again"));
    if (code === "NRV-S02") {
      assert(test.element("nrv-error-help-meaning").textContent.includes(
        language === "es" ? "no permite confirmar" : "cannot confirm"));
      assert(!test.element("nrv-error-help-safety").textContent.includes(
        language === "es" ? "no ha abierto" : "has not opened"));
    }
    assert(test.element("nrv-error-help-safety").textContent.includes(
      language === "es" ? "copia de seguridad verificada" : "verified backup"));
    assert(test.element("nrv-error-help-support").textContent.includes(
      language === "es" ? "No envíes contactos" : "Do not send contacts"));
    test.close();
    assert.strictEqual(test.focused, test.element(
      code === "NRV-A01" ? "setup-error-code" : "startup-recovery-code"));
  }
  assert.deepStrictEqual([...test.timers.keys()], originalTimers, "help must not schedule recovery");
  assert.strictEqual(test.reloads, 0);
  assert.strictEqual(test.fallback.hasFailed(), false);
  test.open("NRV-V99");
  assert(!test.element("nrv-error-help").open, "unknown codes do not display misleading help");
  test.click({ id: "another-button", textContent: "NRV-V04" });
  assert(!test.element("nrv-error-help").open);
  test.open("NRV-V04");
  let prevented = false;
  test.listeners.get("nrv-error-help:keydown")({
    key: "Escape", preventDefault() { prevented = true; },
  });
  assert(prevented && !test.element("nrv-error-help").open, "Escape explicitly closes help");
  assert.strictEqual(test.focused, test.element("startup-recovery-code"));
}
console.log("PASS all startup/setup codes have bilingual help, code-specific retry guidance and safe close behavior");

const earlySpanish = helpFixture("en");
earlySpanish.window.location.search = "";
earlySpanish.window.localStorage.getItem = () => "es";
earlySpanish.open("NRV-S01");
assert.strictEqual(earlySpanish.element("nrv-error-help").lang, "es",
  "stored Spanish works before language initialization");
earlySpanish.close();
earlySpanish.window.location.search = "?lang=en";
earlySpanish.document.documentElement.lang = "es";
earlySpanish.open("NRV-V04");
assert.strictEqual(earlySpanish.element("nrv-error-help").lang, "en", "explicit language wins");
assert.match(html, /<button[^>]*id="startup-recovery-code"[^>]*aria-haspopup="dialog"/);
assert.match(html, /<button[^>]*id="setup-error-code"[^>]*aria-haspopup="dialog"/);
assert.match(html, /<dialog id="nrv-error-help" aria-labelledby="nrv-error-help-title"/);
assert.match(html, /<form method="dialog">/);
assert(html.indexOf('id="nrv-error-help-script"') < html.indexOf('<script src="i18n.js'),
  "help must not depend on downloaded language or dialog scripts");
console.log("PASS early recovery language, native dialog semantics and independence from external scripts");
