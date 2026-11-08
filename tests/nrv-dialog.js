// Run with: node tests/nrv-dialog.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

for (const file of ["app.js", "i18n.js", "index.html"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(
    !/(?<![\w$.])(?:alert|confirm)\s*\(/.test(source),
    `${file} does not call native alert() or confirm()`,
  );
}
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const dialogMarkup = index.match(/<dialog(?=[^>]*\bid="nrv-message-dialog")[^>]*>[\s\S]*?<\/dialog>/);
assert(dialogMarkup, "the reusable NRV message dialog is present");
assert(dialogMarkup[0].includes('aria-labelledby="nrv-message-title"'));
assert(dialogMarkup[0].includes('aria-describedby="nrv-message-content"'));
assert(dialogMarkup[0].includes('aria-modal="true"'));
assert(!/grasfulls|github|github\.io/i.test(dialogMarkup[0]));

class FakeElement {
  constructor(document) {
    this.document = document;
    this.hidden = false;
    this.listeners = new Map();
    this.attributes = {};
    this.textContent = "";
    this.isConnected = true;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((entry) => entry !== listener),
    );
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener(event);
    }
    return event;
  }

  focus() {
    this.document.activeElement = this;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

class FakeDialog extends FakeElement {
  constructor(document) {
    super(document);
    this.open = false;
  }

  showModal() {
    assert.strictEqual(this.open, false, "only one queued dialog is shown at a time");
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatch("close");
  }

  escape() {
    let prevented = false;
    this.dispatch("cancel", {
      preventDefault() {
        prevented = true;
      },
    });
    return prevented;
  }
}

const elements = {};
const document = {
  activeElement: null,
  getElementById(id) {
    return elements[id];
  },
};
elements["nrv-message-dialog"] = new FakeDialog(document);
for (const id of [
  "nrv-message-title",
  "nrv-message-content",
  "nrv-message-accept",
  "nrv-message-cancel",
]) {
  elements[id] = new FakeElement(document);
}
global.document = document;
global.NRVI18n = {
  t(key, _vars, fallback) {
    return ({
      "common.ok": "Aceptar",
      "common.cancel": "Cancelar",
      "dialog.confirmTitle": "Confirmar",
      "dialog.title": "Nice Return Visits",
    })[key] || fallback;
  },
};
require("../nrv-dialog.js");

async function main() {
  const previousFocus = new FakeElement(document);
  document.activeElement = previousFocus;
  const message = NRVDialogs.alert("Mensaje");
  const dialog = elements["nrv-message-dialog"];
  const accept = elements["nrv-message-accept"];
  const cancel = elements["nrv-message-cancel"];

  assert.strictEqual(dialog.open, true);
  assert.strictEqual(dialog.attributes.role, "alertdialog");
  assert.strictEqual(elements["nrv-message-title"].textContent, "Nice Return Visits");
  assert.strictEqual(elements["nrv-message-content"].textContent, "Mensaje");
  assert.strictEqual(accept.textContent, "Aceptar");
  assert.strictEqual(cancel.hidden, true);
  assert.strictEqual(document.activeElement, accept, "focus moves into the alert");
  assert.strictEqual(dialog.escape(), true, "Escape is handled as alert acknowledgement");
  assert.strictEqual(await message, undefined);
  assert.strictEqual(document.activeElement, previousFocus, "focus returns to its prior control");

  const accepted = NRVDialogs.confirm("¿Continuar?");
  assert.strictEqual(dialog.attributes.role, "dialog");
  assert.strictEqual(elements["nrv-message-title"].textContent, "Confirmar");
  assert.strictEqual(elements["nrv-message-content"].textContent, "¿Continuar?");
  assert.strictEqual(cancel.hidden, false);
  accept.dispatch("click");
  assert.strictEqual(await accepted, true, "affirmative control resolves true");

  const cancelled = NRVDialogs.confirm("¿Eliminar?");
  cancel.dispatch("click");
  assert.strictEqual(await cancelled, false, "cancel control resolves false");

  const first = NRVDialogs.alert("Primero");
  const second = NRVDialogs.confirm("Segundo");
  assert.strictEqual(elements["nrv-message-content"].textContent, "Primero");
  accept.dispatch("click");
  await first;
  assert.strictEqual(elements["nrv-message-content"].textContent, "Segundo");
  dialog.escape();
  assert.strictEqual(await second, false, "Escape cancels a confirmation");

  console.log("PASS  localized dialog labels, focus, Escape handling, and confirm decisions");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
