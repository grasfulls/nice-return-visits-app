// Run with: node tests/service-worker-chromium.js (CHROME_PATH may select standard Chromium).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "version.json")));
const chrome = process.env.CHROME_PATH || [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
].find(file => file && fs.existsSync(file));
assert(chrome, "Set CHROME_PATH to a standard Chromium executable; Electron is not supported");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nrv-worker-test-"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const requests = [];
const events = [];
let browser, socket, nextId = 0;
const pending = new Map();
const types = {
  ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".html": "text/html",
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const record = { url: request.url, start: Date.now(), worker: request.headers["service-worker"] };
  requests.push(record);
  response.on("finish", () => { record.finished = Date.now(); });
  let bytes, type;
  if (url.pathname === "/control.html") {
    bytes = Buffer.from("<!doctype html><title>Worker control</title>");
    type = "text/html";
  } else if (url.pathname === "/control/worker.js") {
    bytes = Buffer.from('self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));');
    type = "application/javascript";
  } else {
    if (!url.pathname.startsWith("/app/")) { response.writeHead(404).end(); return; }
    const file = url.pathname.slice(5) || "index.html";
    const fullPath = path.resolve(root, file);
    if (!fullPath.startsWith(root + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      response.writeHead(404).end(); return;
    }
    bytes = fs.readFileSync(fullPath);
    type = types[path.extname(file)] || "application/octet-stream";
  }
  record.bytes = bytes.length;
  response.writeHead(200, {
    "Content-Type": type, "Content-Length": bytes.length,
    "Cache-Control": "no-store", "X-NRV-Release": metadata.version,
  });
  response.end(bytes);
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline: ${method}`)); }, 25000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function navigate(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 100; i++) {
    await delay(100);
    const ready = await evaluate(`location.href===${JSON.stringify(url)} && document.readyState!=="loading"`);
    if (ready) return;
  }
  throw new Error("Page navigation did not finish");
}
async function waitFor(expression, description) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(description);
}
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.strictEqual((await fetch(origin + "/control.html")).status, 200);
  browser = spawn(chrome, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });
  let launchError;
  browser.on("error", error => { launchError = error; });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile) && !launchError; i++) await delay(100);
  if (launchError) throw launchError;
  assert(fs.existsSync(portFile), "Chromium did not expose its isolated debugging endpoint");
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
    } else if (message.method === "Target.attachedToTarget") {
      send("Network.enable", {}, message.params.sessionId).catch(error => events.push({ error: error.message }));
    } else events.push(message);
  });
  const identity = await send("Browser.getVersion");
  assert(/^(Chrome|HeadlessChrome|Edg)\//.test(identity.product), identity.product);
  console.log(`Standard Chromium: ${identity.product}`);
  await send("Page.enable"); await send("Runtime.enable"); await send("ServiceWorker.enable");
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await navigate(origin + "/control.html");
  assert.deepStrictEqual(await evaluate(`(async()=>({registrations:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys()}))()`),
    { registrations: 0, caches: [] });
  await evaluate(`navigator.serviceWorker.register("/control/worker.js").then(()=>true)`);
  await waitFor(`navigator.serviceWorker.getRegistration("/control/").then(r=>r?.active?.state==="activated")`, "Independent control did not activate");
  console.log("PASS independent minimal Service Worker control");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: 'Object.defineProperty(navigator,"standalone",{value:true});',
  });
  await navigate(origin + "/app/");
  await waitFor(`!document.getElementById("startup-recovery-screen").hidden ? false : !document.getElementById("unlock-screen").hidden`,
    "NRV did not reach its operational agreement screen");
  await delay(11000);
  assert(await evaluate(`document.getElementById("startup-recovery-screen").hidden && !window.NRVStartupFallback.hasFailed()`),
    "Operational readiness must cancel the watchdog");
  assert.strictEqual(await evaluate(`document.querySelector('meta[name="nrv-build-revision"]').content`), metadata.revision);
  const worker = await evaluate(`navigator.serviceWorker.getRegistration("/app/").then(r=>({state:r.active?.state,url:r.active?.scriptURL,controller:navigator.serviceWorker.controller?.scriptURL}))`);
  assert.strictEqual(worker.state, "activated");
  assert.strictEqual(worker.controller, origin + "/app/service-worker.js");
  assert(requests.some(r => r.url === "/app/service-worker.js" && r.worker === "script"));
  const shell = JSON.parse(fs.readFileSync(path.join(root, "service-worker.js"), "utf8")
    .match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const cached = await evaluate(`(async()=>{
    const cache=await caches.open(${JSON.stringify("return-visits-shell-" + metadata.revision.slice(7))});
    const rows=[];
    for(const request of await cache.keys()){
      const response=await cache.match(request);
      rows.push({url:request.url,bytes:Array.from(new Uint8Array(await response.arrayBuffer()))});
    }
    return rows;
  })()`);
  assert.strictEqual(cached.length, shell.length);
  for (const file of shell) {
    const url = new URL(file, origin + "/app/");
    url.searchParams.set("nrv-release", metadata.version);
    const entry = cached.find(row => row.url === url.href);
    assert(entry, `Required cache resource absent: ${file}`);
    const local = fs.readFileSync(path.join(root, url.pathname.slice(5) || "index.html"));
    assert(Buffer.from(entry.bytes).equals(local), `Wrong cached bytes: ${file}`);
    assert(requests.some(r => r.url === url.pathname + url.search && r.finished - r.start < 3000),
      `Fixture did not complete resource under existing deadline: ${file}`);
  }
  const starts = new Map();
  let completed = 0, maxMs = 0;
  for (const event of events) {
    const p = event.params || {};
    const key = event.sessionId + ":" + p.requestId;
    if (event.method === "Network.requestWillBeSent" && p.request.url.startsWith(origin + "/app/")) starts.set(key, p.timestamp);
    if (event.method === "Network.loadingFinished" && starts.has(key)) {
      const ms = (p.timestamp - starts.get(key)) * 1000;
      assert(ms < 3000, `Browser precache completion exceeded deadline: ${ms}ms`);
      completed += 1; maxMs = Math.max(maxMs, ms);
    }
    assert(event.method !== "ServiceWorker.workerErrorReported", JSON.stringify(event));
    assert(event.method !== "Network.loadingFailed" || !starts.has(key), JSON.stringify(event));
  }
  assert(completed >= shell.length, "Missing browser completion evidence for precache resources");
  console.log(`PASS ${shell.length} exact release-qualified cache entries; browser completion maximum ${maxMs.toFixed(1)}ms`);
  console.log("PASS NRV worker installed/activated and normal startup reached the visible operational agreement");
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  assert(await evaluate(`(async()=>{
    for(const file of ["app.js","locales/en.json","locales/es.json"]){
      const response=await fetch("./"+file+"?nrv-release=${metadata.version}");
      if(!response.ok || !(await response.arrayBuffer()).byteLength)return false;
    }
    return true;
  })()`), "Required cached resources must remain available offline");
  console.log("PASS controlled offline application and bilingual catalogs remain available");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`(() => {
    localStorage.setItem("nrv_installed_setup_completed", "true");
    const agreement = document.getElementById("user-agreement-checkbox");
    agreement.checked = true;
    agreement.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("btn-accept-agreement").click();
  })()`);
  await waitFor(`!document.getElementById("unlock-screen")`, "Synthetic user did not finish initialization");
  const guardedWrite = await evaluate(`(async () => {
    const db = await openAppDatabase();
    const before = JSON.stringify([
      await readStoredValue(db, "settings"),
      await readStoredValue(db, "contacts"),
    ]);
    const fallback = window.NRVStartupFallback;
    window.NRVStartupFallback = { hasFailed: () => true };
    let blocked = false;
    try {
      await writeStoredValues(db, [
        ["settings", { marker: "must-not-write" }],
        ["contacts", []],
      ]);
    } catch (error) {
      blocked = error.message === "Startup is blocked.";
    } finally {
      window.NRVStartupFallback = fallback;
      db.close();
    }
    return { blocked, before };
  })()`);
  assert(guardedWrite.blocked, "S02 must block a pending IndexedDB write in Chromium");
  const guardedState = await evaluate(`(async () => {
    const db = await openAppDatabase();
    const state = JSON.stringify([
      await readStoredValue(db, "settings"),
      await readStoredValue(db, "contacts"),
    ]);
    db.close();
    return state;
  })()`);
  assert.strictEqual(guardedState, guardedWrite.before, "S02 guard must preserve both stored records");
  console.log("PASS Chromium IndexedDB guard blocks writes after startup failure without changing saved records");
  await evaluate(`(async () => {
    const db = await openAppDatabase();
    await writeStoredValue(db, "contacts", [{
      id: "nrv-reminder-integration",
      firstName: "Tia",
      lastName: "Example",
      country: "United States",
      city: "",
      region: "",
      area: "",
      streetAddress: "1 Test Street",
      notesHistory: [
        { id: "old-note", text: "Older integration note", date: "2026-01-01", rawDate: "2026-01-01T10:00:00.000Z" },
        { id: "middle-note", text: "Middle integration note", date: "2026-02-01", rawDate: "2026-02-01T10:00:00.000Z" },
        { id: "newest-note", text: "Newest integration note", date: "2026-03-01", rawDate: "2026-03-01T10:00:00.000Z" },
      ],
      reminders: [{
        id: "overdue-integration-reminder",
        text: "Overdue integration task",
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
        dueAt: new Date(Date.now() - 86400000).toISOString(),
        completedAt: null,
      }],
    }]);
    db.close();
  })()`);
  for (const language of ["en", "es"]) {
    await navigate(origin + "/app/?lang=" + language);
    await waitFor(`document.getElementById("startup-recovery-screen").hidden && !document.getElementById("unlock-screen")`,
      "Saved synthetic user did not restart");
    if (language === "en") {
      const reminderPanel = await evaluate(`(() => {
        const panel = document.getElementById("reminders-panel");
        const done = document.querySelector("#reminders-list li button:last-child");
        return {
          visible: !panel.hidden,
          expanded: panel.open,
          entries: document.querySelectorAll("#reminders-list li").length,
          doneLabel: done?.getAttribute("aria-label"),
          liveStatus: document.getElementById("reminders-overview-status").getAttribute("aria-live"),
        };
      })()`);
      assert.strictEqual(reminderPanel.visible, true);
      assert.strictEqual(reminderPanel.expanded, true, "due reminders expand the overview");
      assert.strictEqual(reminderPanel.entries, 1);
      assert.match(reminderPanel.doneLabel, /Tia Example/);
      assert.strictEqual(reminderPanel.liveStatus, "polite");
      await evaluate(`document.querySelector("#reminders-list li button:last-child").click()`);
      await waitFor(
        `document.getElementById("reminders-panel").hidden`,
        "Completing the only due reminder did not update the overview",
      );
      await evaluate(`window.editContact("nrv-reminder-integration", "reminders")`);
      await evaluate(`(() => {
        document.getElementById("contact-reminder-text").value = "New integration follow-up";
        document.getElementById("btn-add-contact-reminder").click();
      })()`);
      await waitFor(
        `document.getElementById("contact-reminder-status").textContent==="Reminder added."`,
        "Adding a follow-up did not report success",
      );
      const reminderSave = await evaluate(`(async () => {
        const db = await openAppDatabase();
        const saved = await readStoredValue(db, "contacts");
        db.close();
        const contact = saved.find(item => item.id === "nrv-reminder-integration");
        return {
          noteIds: contact.notesHistory.map(note => note.id),
          reminders: contact.reminders.map(reminder => ({
            text: reminder.text,
            completed: Boolean(reminder.completedAt),
          })),
        };
      })()`);
      assert.deepStrictEqual(reminderSave.noteIds, ["old-note", "middle-note", "newest-note"]);
      assert(reminderSave.reminders.some((reminder) =>
        reminder.text === "Overdue integration task" && reminder.completed));
      assert(reminderSave.reminders.some((reminder) =>
        reminder.text === "New integration follow-up" && !reminder.completed));
      await evaluate(`document.getElementById("close-modal").click()`);
      await evaluate(`document.getElementById("btn-open-backup-restore").click()`);
      await waitFor(
        `document.getElementById("settings-view").classList.contains("active") &&
          document.getElementById("backup-section").open`,
        "Backup and Restore settings did not open",
      );
      await evaluate(`(() => {
        window.__nrvPrintCaptured = "";
        window.print = () => {
          window.__nrvPrintCaptured = document.getElementById("print-container").innerHTML;
        };
        document.getElementById("btn-print-nrv-information").click();
      })()`);
      await waitFor(`window.__nrvPrintCaptured.length > 0`, "Print My NRV Information did not invoke printing");
      const printContent = await evaluate(`window.__nrvPrintCaptured`);
      assert(printContent.includes("Tia Example"));
      assert(printContent.includes("Newest integration note"));
      assert(!printContent.includes("Older integration note"));
      assert(printContent.includes("New integration follow-up"));
      assert(!printContent.includes("nrv-reminder-integration"));
      console.log("PASS Chromium reminder completion/addition, accessible due list, Notes separation, and emergency print");
    }
    await evaluate(`document.getElementById("btn-open-goals").click()`);
    await waitFor(`document.getElementById("goals-view").classList.contains("active")`, "Goals view did not open");
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", language + ".json"), "utf8"));
    // Simplified Goals experience: approved introductory wording is visible above the picker.
    assert.strictEqual(await evaluate(`document.querySelector('[data-i18n="goals.introStatus"]').textContent`), catalog["goals.introStatus"]);
    assert.strictEqual(await evaluate(`document.querySelector('[data-i18n="goals.introUse"]').textContent`), catalog["goals.introUse"]);
    assert(await evaluate(`(() => {
      const intro = document.querySelector('[data-i18n="goals.introStatus"]');
      return intro.getBoundingClientRect().height > 0 &&
        !!(intro.compareDocumentPosition(document.getElementById("goals-path-options")) & Node.DOCUMENT_POSITION_FOLLOWING);
    })()`), "Approved introductory wording must be visible before the picker");
    // Start each language pass from a clean slate (goals persist across passes).
    await evaluate(`(async () => {
      while (document.querySelector('#goals-active-list [data-goal-action="clear"]')) {
        document.querySelector('#goals-active-list [data-goal-action="clear"]').click();
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    })()`);
    await waitFor(`!document.querySelector('#goals-active-list [data-goal-action="clear"]')`, "Could not clear existing goals");
    // Exactly the intended eleven goals; custom and legacy paths are not offered.
    assert.strictEqual(await evaluate(`document.querySelectorAll("[data-goal-path-choice]").length`), 11);
    assert(await evaluate(`!document.querySelector('[data-goal-path-choice="custom"]') && !document.querySelector('[data-goal-path-choice="seldomWorked"]')`),
      "Create My Own Path and legacy Work Seldom-Worked Territory must not be selectable");
    assert(await evaluate(`document.getElementById("goals-path-editors").childElementCount === 0`),
      "No configuration editors appear in the simplified experience");
    assert(await evaluate(`document.getElementById("goals-paused-section").hidden &&
      document.getElementById("goals-review-section").hidden &&
      document.getElementById("goals-history-section").hidden`), "Postponed lifecycle sections stay hidden");
    assert(await evaluate(`document.getElementById("encouragement-option-section").hidden`),
      "Encouragement messages option is hidden");
    assert(await evaluate(`document.getElementById("btn-create-goals").disabled`),
      "Add selected goals is unavailable until a goal is chosen");
    assert(await evaluate(`(() => {
      const table = document.querySelector(".goals-aux-months");
      return table.classList.contains("goals-aux-months-inactive") &&
        table.querySelectorAll("tbody tr").length === 12 &&
        [...table.querySelectorAll("input")].every(input => input.disabled && !input.checked);
    })()`), "Inactive Auxiliary Pioneer month controls must be greyed out and unavailable");
    // Multiple goals are added together with no required configuration.
    await evaluate(`(() => {
      for (const pathId of ["returnVisits", "signUpAuxiliary", "signUpRegular"]) {
        const choice = document.querySelector('[data-goal-path-choice="' + pathId + '"]');
        choice.checked = true;
        choice.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.getElementById("btn-create-goals").click();
    })()`);
    await waitFor(`document.querySelectorAll("#goals-active-list .goals-simple-row").length===3`, "Simplified goals were not added");
    assert(await evaluate(`document.querySelector('[data-goal-path-choice="signUpAuxiliary"]').disabled`),
      "A listed goal cannot be added again until cleared");
    const rowFor = (pathName) =>
      `[...document.querySelectorAll("#goals-active-list .goals-simple-row")].find(row => row.textContent.includes(${JSON.stringify(pathName)}))`;
    assert(await evaluate(`(() => {
      const row = ${rowFor(catalog["goals.path.signUpRegular"])};
      return !!row.querySelector("[data-goal-simple-complete]") &&
        !!row.querySelector('[data-goal-action="clear"]') &&
        !row.querySelector("[data-aux-month]") &&
        !row.querySelector('[data-goal-action="edit"]') &&
        !row.querySelector('[data-goal-action="pause"]') &&
        !row.querySelector('[data-goal-action="complete"]');
    })()`), "Sign Up for Regular Pioneer is a normal simplified goal with Completed and Clear only");
    assert(await evaluate(`(() => {
      const row = ${rowFor(catalog["goals.path.signUpAuxiliary"])};
      return !row.querySelector("[data-goal-simple-complete]") &&
        !!row.querySelector('[data-goal-action="clear"]');
    })()`), "Auxiliary Pioneer has no overall Completed checkbox");
    assert(await evaluate(`(() => {
      const table = document.querySelector(".goals-aux-months");
      return !table.classList.contains("goals-aux-months-inactive") &&
        [...table.querySelectorAll("input")].every(input => !input.disabled);
    })()`), "Month controls become usable once the Auxiliary Pioneer goal is added");
    const monthKeys = await evaluate(`[...new Set([...document.querySelectorAll("[data-aux-month]")].map(input => input.dataset.auxMonth))]`);
    assert.strictEqual(monthKeys.length, 12, "Rolling window shows twelve months");
    const monthBox = (key, field) => `document.getElementById("aux-month-${key}-${field}")`;
    // Checking Completed automatically checks Try.
    await evaluate(`${monthBox(monthKeys[0], "completed")}.click()`);
    await waitFor(`${monthBox(monthKeys[0], "try")}.checked && ${monthBox(monthKeys[0], "completed")}.checked`,
      "Completed did not automatically check Try");
    // Unchecking Try leaves an already checked Completed checked (valid state).
    await evaluate(`${monthBox(monthKeys[0], "try")}.click()`);
    await waitFor(`!${monthBox(monthKeys[0], "try")}.checked && ${monthBox(monthKeys[0], "completed")}.checked`,
      "Unchecking Try must leave Completed checked");
    // Unchecking Completed automatically unchecks Try.
    await evaluate(`${monthBox(monthKeys[1], "completed")}.click()`);
    await waitFor(`${monthBox(monthKeys[1], "completed")}.checked`, "Second month Completed did not save");
    await evaluate(`${monthBox(monthKeys[1], "completed")}.click()`);
    await waitFor(`!${monthBox(monthKeys[1], "completed")}.checked && !${monthBox(monthKeys[1], "try")}.checked`,
      "Unchecking Completed must also uncheck Try");
    // Manual completion of a normal goal.
    await evaluate(`${rowFor(catalog["goals.path.signUpRegular"])}.querySelector("[data-goal-simple-complete]").click()`);
    await waitFor(`(() => {
      const row = ${rowFor(catalog["goals.path.signUpRegular"])};
      return !!(row && row.querySelector("[data-goal-simple-complete]").checked);
    })()`, "Manual completion did not save");
    assert(await evaluate(`!document.querySelector(".goals-encouragement") && document.getElementById("goals-latest-notice").hidden`),
      "Postponed encouragement/acknowledgement messages must not appear");
    // Clearing Auxiliary Pioneer clears every month selection and greys the table.
    await evaluate(`${rowFor(catalog["goals.path.signUpAuxiliary"])}.querySelector('[data-goal-action="clear"]').click()`);
    await waitFor(`document.querySelectorAll("#goals-active-list .goals-simple-row").length===2`, "Clear did not remove the goal");
    assert(await evaluate(`(() => {
      const table = document.querySelector(".goals-aux-months");
      return table.classList.contains("goals-aux-months-inactive") &&
        [...table.querySelectorAll("input")].every(input => input.disabled && !input.checked);
    })()`), "Clearing Auxiliary Pioneer must clear all month selections and grey out the table");
    // A cleared goal may be selected and added again, with nothing retained.
    assert(await evaluate(`!document.querySelector('[data-goal-path-choice="signUpAuxiliary"]').disabled`),
      "A cleared goal must become selectable again");
    await evaluate(`(() => {
      const choice = document.querySelector('[data-goal-path-choice="signUpAuxiliary"]');
      choice.checked = true;
      choice.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("btn-create-goals").click();
    })()`);
    await waitFor(`document.querySelectorAll("#goals-active-list .goals-simple-row").length===3`, "Cleared goal could not be added again");
    assert(await evaluate(`[...document.querySelectorAll(".goals-aux-months input")].every(input => !input.disabled && !input.checked)`),
      "Re-added Auxiliary Pioneer starts with no Try or Completed selections");
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await navigate(origin + "/app/?lang=" + language);
    await waitFor(`!document.getElementById("startup-recovery-continue").hidden`, "Offline startup did not offer safe OK");
    assert.strictEqual(await evaluate(`document.getElementById("startup-recovery-continue").textContent`), catalog["common.ok"]);
    await evaluate(`document.getElementById("startup-recovery-continue").click()`);
    await waitFor(`document.getElementById("startup-recovery-screen").hidden && !document.getElementById("unlock-screen")`, "Offline OK did not safely resume");
    await evaluate(`document.getElementById("btn-open-goals").click()`);
    await waitFor(`document.querySelectorAll("#goals-active-list .goals-simple-row").length===3`, "Offline restart lost simplified goals");
    assert(await evaluate(`(() => {
      const row = ${rowFor(catalog["goals.path.signUpRegular"])};
      return !!(row && row.querySelector("[data-goal-simple-complete]").checked);
    })()`), "Offline restart lost manual completion");
    await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    console.log(`PASS ${language} simplified Goals picker/add/months/completion/clear/re-add and offline restart persistence`);
  }
  await evaluate(`(async () => {
    const passphrase = "NRV-integration-passphrase-90210";
    const db = await openAppDatabase();
    const originalSettings = await readStoredValue(db, "settings");
    const originalContacts = await readStoredValue(db, "contacts");
    const legacySettings = { ...originalSettings, schemaVersion: SCHEMA_VERSION - 1 };
    const metadata = createCryptoMetadata();
    const key = await deriveEncryptionKey(passphrase, metadata);
    await writeStoredValues(db, [
      ["settings", await encryptValue(legacySettings, key)],
      ["contacts", await encryptValue(originalContacts, key)],
      ["encryption-meta", metadata],
    ]);
    db.close();
    localStorage.setItem("nrv-test-encrypted-migration-original", JSON.stringify({
      settings: originalSettings,
      contacts: originalContacts,
    }));
  })()`);
  await navigate(origin + "/app/?lang=en");
  await waitFor(`document.getElementById("unlock-screen") && !document.getElementById("unlock-screen").hidden`,
    "Encrypted migration did not show the unlock screen");
  await evaluate(`(() => {
    const passphrase = "NRV-integration-passphrase-90210";
    document.getElementById("encryption-passphrase").value = passphrase;
    document.getElementById("unlock-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  })()`);
  await waitFor(`!document.getElementById("unlock-screen")`, "Encrypted legacy records did not unlock");
  const encryptedMigration = await evaluate(`(async () => {
    const passphrase = "NRV-integration-passphrase-90210";
    let db = await openAppDatabase();
    const original = JSON.parse(localStorage.getItem("nrv-test-encrypted-migration-original"));
    const metadata = await readStoredValue(db, "encryption-meta");
    const key = await deriveEncryptionKey(passphrase, metadata);
    const storedSettings = await decryptValue(await readStoredValue(db, "settings"), key);
    const storedContacts = await decryptValue(await readStoredValue(db, "contacts"), key);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("appData", "readwrite");
      const store = transaction.objectStore("appData");
      store.put({ key: "settings", value: original.settings });
      store.put({ key: "contacts", value: original.contacts });
      store.delete("encryption-meta");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    localStorage.removeItem("nrv-test-encrypted-migration-original");
    return {
      savedSchema: storedSettings.schemaVersion,
      savedContacts: storedContacts.length,
      originalContacts: original.contacts.length,
    };
  })()`);
  assert.strictEqual(encryptedMigration.savedSchema, await evaluate("SCHEMA_VERSION"));
  assert.strictEqual(encryptedMigration.savedContacts, encryptedMigration.originalContacts);
  console.log("PASS Chromium unlocks, decrypts, migrates and transactionally stores encrypted legacy records");
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) {
    await send("Browser.close").catch(() => {});
    await delay(500); socket.close();
  }
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise(resolve => browser.once("exit", resolve)),
      delay(3000),
    ]);
  }
  server.closeAllConnections(); server.close();
  for (const item of pending.values()) clearTimeout(item.timer);
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(profile, { recursive: true }); break; }
    catch (error) {
      if (i === 19) { console.error(`Unable to remove isolated test profile ${profile}: ${error.message}`); process.exitCode = 1; }
      await delay(200);
    }
  }
});
