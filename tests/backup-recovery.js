// Run with: node tests/backup-recovery.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n?/g, "\n");

const downloadStart = app.indexOf(
  "const downloadEncryptedBackup = async (encrypt = Boolean(encryptionKey)) => {",
);
const downloadEnd = app.indexOf("\n\n  const preservationScreen", downloadStart);
assert(downloadStart >= 0 && downloadEnd > downloadStart);
const downloadSource = app.slice(downloadStart, downloadEnd);

const makeDownload = (confirmation, exportSucceeds = true) => {
  let markCalls = 0;
  let confirmCalls = 0;
  let confirmationText = "";
  let confirmationLabels = null;
  let downloadedFilename = "";
  const context = {
    encryptionKey: null,
    buildBackup: async () => ({ format: "return-visits-backup", version: 1 }),
    runExportWithRetry: async (_action, _key, _message, operation) => {
      if (!exportSucceeds) return false;
      await operation();
      return true;
    },
    Blob: class {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL() {},
    },
    document: {
      createElement: () => ({
        click() {},
        set download(value) { downloadedFilename = value; },
        get download() { return downloadedFilename; },
      }),
    },
    window: { setTimeout() {} },
    NRVDialogs: {
      confirm: async (message, labels) => {
        confirmCalls += 1;
        confirmationText = message;
        confirmationLabels = labels;
        return confirmation;
      },
    },
    appText: (_key, fallback) => fallback,
    markBackupDone: () => { markCalls += 1; },
    JSON,
  };
  const download = vm.runInNewContext(
    `${downloadSource}\ndownloadEncryptedBackup;`,
    context,
  );
  return {
    run: () => download(),
    get markCalls() { return markCalls; },
    get confirmCalls() { return confirmCalls; },
    get confirmationText() { return confirmationText; },
    get confirmationLabels() { return confirmationLabels; },
    get downloadedFilename() { return downloadedFilename; },
  };
};

const pruneStart = app.indexOf("const pruneCloudSnapshots = async () => {");
const pruneEnd = app.indexOf("\n\n  const cloudRecoveryFileName", pruneStart);
assert(pruneStart >= 0 && pruneEnd > pruneStart);
const pruneSource = app.slice(pruneStart, pruneEnd);

const autoBackupStart = app.indexOf("const autoCloudBackup = async () => {");
const autoBackupEnd = app.indexOf("\n\n  let cloudTimer", autoBackupStart);
assert(autoBackupStart >= 0 && autoBackupEnd > autoBackupStart);
const autoBackupSource = app.slice(autoBackupStart, autoBackupEnd);

const cloudStatusStart = app.indexOf(
  "const setCloudStatus = (message, scrollIntoView = true) => {",
);
const cloudStatusEnd = app.indexOf("\n  const showCloudStep", cloudStatusStart);
assert(cloudStatusStart >= 0 && cloudStatusEnd > cloudStatusStart);
const cloudStatusSource = app.slice(cloudStatusStart, cloudStatusEnd);

const uploadCloudFileStart = app.indexOf("const uploadCloudFile = async (path, text) => {");
const uploadCloudFileEnd = app.indexOf("\n\n  const getRemoteLatest", uploadCloudFileStart);
assert(uploadCloudFileStart >= 0 && uploadCloudFileEnd > uploadCloudFileStart);
const uploadCloudFileSource = app.slice(uploadCloudFileStart, uploadCloudFileEnd);

const recoveryFileNameStart = app.indexOf("const cloudRecoveryFileName = (remote) => {");
const recoveryFileNameEnd = app.indexOf("\n\n  const uploadCloudFile", recoveryFileNameStart);
assert(recoveryFileNameStart >= 0 && recoveryFileNameEnd > recoveryFileNameStart);
const recoveryFileNameSource = app.slice(recoveryFileNameStart, recoveryFileNameEnd);

const cloudBackupStart = app.indexOf("let cloudBackupRunning = false;");
const cloudBackupEnd = app.indexOf("\n  // Never overwrite Dropbox with an empty app", cloudBackupStart);
assert(cloudBackupStart >= 0 && cloudBackupEnd > cloudBackupStart);
const cloudBackupSource = app.slice(cloudBackupStart, cloudBackupEnd);

const cloudHookStart = app.indexOf("let cloudTimer = null;");
const cloudHookEnd = app.indexOf("\n\n  const restoreFromCloud", cloudHookStart);
assert(cloudHookStart >= 0 && cloudHookEnd > cloudHookStart);
const cloudHookSource = app.slice(cloudHookStart, cloudHookEnd);

async function main() {
  const declined = makeDownload(false);
  assert.strictEqual(await declined.run(), false);
  assert.strictEqual(declined.confirmCalls, 1);
  assert.strictEqual(declined.markCalls, 0, "a download request alone is not a successful backup");
  assert.match(declined.confirmationText, /cannot see whether your browser saved the file or where it went/i);
  assert.strictEqual(declined.confirmationLabels.acceptLabel, "I Saved It");
  assert.strictEqual(declined.confirmationLabels.cancelLabel, "Not Now");
  assert.match(declined.downloadedFilename, /^return-visits-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const confirmed = makeDownload(true);
  assert.strictEqual(await confirmed.run(), true);
  assert.strictEqual(confirmed.markCalls, 1, "only the user's saved-file confirmation resets the reminder");

  const failedExport = makeDownload(true, false);
  assert.strictEqual(await failedExport.run(), false);
  assert.strictEqual(failedExport.confirmCalls, 0);
  assert.strictEqual(failedExport.markCalls, 0);
  console.log("PASS local reminder timestamp requires user confirmation after the download request");

  const files = [
    { name: "automatic-recovery-oldest.json", path_lower: "/automatic-recovery-oldest.json", server_modified: "2026-01-01T00:00:00Z" },
    { name: "automatic-recovery-older.json", path_lower: "/automatic-recovery-older.json", server_modified: "2026-01-02T00:00:00Z" },
    { name: "automatic-recovery-middle.json", path_lower: "/automatic-recovery-middle.json", server_modified: "2026-01-03T00:00:00Z" },
    { name: "automatic-recovery-newest.json", path_lower: "/automatic-recovery-newest.json", server_modified: "2026-01-04T00:00:00Z" },
    { name: "saved-backup-user.json", path_lower: "/saved-backup-user.json", server_modified: "2026-01-05T00:00:00Z" },
    { name: "backup-legacy.json", path_lower: "/backup-legacy.json", server_modified: "2026-01-06T00:00:00Z" },
  ];
  const removed = [];
  const localRemoved = [];
  const context = {
    CLOUD_SNAPSHOTS_KEPT: 3,
    CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
    CLOUD_RETENTION_WARNING_KEY: "retention-warning",
    dropbox: {
      list: async () => files,
      remove: async (filePath) => removed.push(filePath),
    },
    localStorage: { removeItem: (key) => localRemoved.push(key) },
  };
  const prune = vm.runInNewContext(`${pruneSource}\npruneCloudSnapshots;`, context);
  await prune();
  assert.deepStrictEqual(removed, ["/automatic-recovery-oldest.json"]);
  assert.deepStrictEqual(localRemoved, ["retention-warning"]);
  console.log("PASS Dropbox rotation keeps three automatic recovery copies and leaves saved/legacy backups intact");

  const uploadAttempts = [];
  const recoveryFailure = new Error("Dropbox storage is full.");
  const failingDropbox = {
    list: async () => [{
      name: "latest.json",
      path_lower: "/latest.json",
      server_modified: "2026-01-01T00:00:00Z",
      rev: "known-good-revision",
    }],
    download: async () => '{"knownGood":true}',
    upload: async (target) => {
      uploadAttempts.push(target);
      throw recoveryFailure;
    },
  };
  const localValues = new Map();
  const backupAttempt = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: failingDropbox,
      localStorage: {
        getItem: (key) => localValues.get(key) || null,
        setItem: (key, value) => localValues.set(key, value),
        removeItem: (key) => localValues.delete(key),
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      cloudBusy: false,
      refreshSyncIcon() {},
      refreshCloudUi: async () => {},
      markBackupDone() {},
      cloudBackupHook() {},
      console,
      Date,
      JSON,
    },
  );
  await assert.rejects(backupAttempt(), (error) =>
    error.code === "cloud-recovery-preserve-failed");
  assert.deepStrictEqual(uploadAttempts, ["/automatic-recovery-2026-01-01T00-00-00-000Z-known-good-revision.json"]);
  assert.strictEqual(uploadAttempts.includes("/latest.json"), false);
  console.log("PASS failed recovery-point preservation leaves the existing latest Dropbox backup untouched");

  const latestUploadAttempts = [];
  const latestFailure = new Error("latest upload failed");
  const latestDropbox = {
    latestContent: '{"knownGood":true}',
    list: async () => [{
      name: "latest.json",
      path_lower: "/latest.json",
      server_modified: "2026-01-01T00:00:00Z",
      rev: "known-good-revision",
    }],
    download: async () => latestDropbox.latestContent,
    upload: async (target) => {
      latestUploadAttempts.push(target);
      if (target !== "/latest.json") {
        return { path_display: target, server_modified: "2026-01-02T00:00:00Z" };
      }
      throw latestFailure;
    },
  };
  const latestBackupAttempt = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: latestDropbox,
      localStorage: {
        getItem: (key) => localValues.get(key) || null,
        setItem: (key, value) => localValues.set(key, value),
        removeItem: (key) => localValues.delete(key),
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      pruneCloudSnapshots: async () => {},
      refreshSyncIcon() {},
      markBackupDone() {},
      cloudBackupHook() {},
      console,
      Date,
      JSON,
    },
  );
  await assert.rejects(latestBackupAttempt(), (error) => error === latestFailure);
  assert.deepStrictEqual(latestUploadAttempts, [
    "/automatic-recovery-2026-01-01T00-00-00-000Z-known-good-revision.json",
    "/latest.json",
  ]);
  assert.strictEqual(latestDropbox.latestContent, '{"knownGood":true}');
  assert.strictEqual(localValues.get("dirty"), "1");
  console.log("PASS failed latest upload preserves the prior latest copy and leaves Dropbox sync pending");

  const rotationFiles = [
    { name: "latest.json", path_lower: "/latest.json", server_modified: "2026-01-01T00:00:00Z", rev: "rotation-rev" },
    ...["one", "two", "three"].map((name, index) => ({
      name: `automatic-recovery-${name}.json`,
      path_lower: `/automatic-recovery-${name}.json`,
      server_modified: `2025-12-0${index + 1}T00:00:00Z`,
    })),
  ];
  const rotationAttempts = [];
  let latestContents = '{"knownGood":true}';
  const rotationStorage = new Map([
    ["retention-warning", "1"],
    ["snapshot", "0"],
  ]);
  const rotationDropbox = {
    list: async () => rotationFiles,
    download: async () => latestContents,
    upload: async (target, text) => {
      rotationAttempts.push(target);
      if (target === "/latest.json") {
        latestContents = text;
      } else {
        rotationFiles.push({
          name: target.slice(1),
          path_lower: target,
          server_modified: "2026-01-02T00:00:00Z",
        });
      }
      return { path_display: target, server_modified: "2026-01-02T00:00:00Z" };
    },
  };
  const rotateBackup = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: rotationDropbox,
      localStorage: {
        getItem: (key) => rotationStorage.get(key) || null,
        setItem: (key, value) => rotationStorage.set(key, value),
        removeItem: (key) => rotationStorage.delete(key),
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      pruneCloudSnapshots: async () => {
        throw new Error("Dropbox cleanup unavailable.");
      },
      refreshSyncIcon() {},
      markBackupDone() {},
      cloudBackupHook() {},
      console: { error() {} },
      Date,
      JSON,
    },
  );
  const rotationResult = await rotateBackup();
  assert.strictEqual(rotationResult.latestUploaded, true);
  assert.strictEqual(rotationFiles.length, 5, "safe rotation allows only one temporary extra copy");
  assert(rotationAttempts[0].startsWith("/automatic-recovery-"));
  assert.strictEqual(rotationAttempts[1], "/latest.json");
  assert.match(latestContents, /"contacts":\s*\[\]/);
  assert.strictEqual(rotationStorage.get("retention-warning"), "1");
  console.log("PASS unavailable cleanup retains known-good copies, allows one confirmed rotation copy, and does not grow the set");

  const capacityFiles = [
    { name: "latest.json", path_lower: "/latest.json", server_modified: "2026-04-04T00:00:00Z", rev: "capacity-rev" },
    ...["oldest", "middle", "newest"].map((name, index) => ({
      name: `automatic-recovery-${name}.json`,
      path_lower: `/automatic-recovery-${name}.json`,
      server_modified: `2026-04-0${index + 1}T00:00:00Z`,
    })),
  ];
  const capacityRemoved = [];
  const capacityAttempts = [];
  let capacityRecoveryAttempts = 0;
  const capacityError = new Error("Dropbox reports insufficient space.");
  capacityError.insufficientSpace = true;
  const capacityDropbox = {
    list: async () => capacityFiles,
    download: async () => '{"knownGood":true}',
    remove: async (target) => {
      capacityRemoved.push(target);
      const index = capacityFiles.findIndex((file) => file.path_lower === target);
      if (index >= 0) capacityFiles.splice(index, 1);
    },
    upload: async (target, text) => {
      capacityAttempts.push(target);
      if (target.startsWith("/automatic-recovery-")) {
        capacityRecoveryAttempts += 1;
        if (capacityRecoveryAttempts === 1) throw capacityError;
        capacityFiles.push({
          name: target.slice(1),
          path_lower: target,
          server_modified: "2026-04-05T00:00:00Z",
        });
      } else {
        latestContents = text;
      }
      return { path_display: target, server_modified: "2026-04-05T00:00:00Z" };
    },
  };
  const capacityStorage = new Map([["snapshot", "0"]]);
  const capacityBackup = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: capacityDropbox,
      localStorage: {
        getItem: (key) => capacityStorage.get(key) || null,
        setItem: (key, value) => capacityStorage.set(key, value),
        removeItem: (key) => capacityStorage.delete(key),
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      pruneCloudSnapshots: async () => {},
      refreshSyncIcon() {},
      markBackupDone() {},
      cloudBackupHook() {},
      console: { error() {} },
      Date,
      JSON,
    },
  );
  const capacityResult = await capacityBackup();
  assert.strictEqual(capacityResult.latestUploaded, true);
  assert.deepStrictEqual(capacityRemoved, ["/automatic-recovery-oldest.json"]);
  assert.strictEqual(
    capacityFiles.filter((file) => /^automatic-recovery-.*\.json$/.test(file.name)).length,
    3,
  );
  assert.strictEqual(capacityRecoveryAttempts, 2);
  console.log("PASS explicit Dropbox capacity errors retry rotation after removing only the oldest recovery point");

  const reducedFiles = [
    { name: "latest.json", path_lower: "/latest.json", server_modified: "2026-04-04T00:00:00Z", rev: "reduced-rev" },
    ...["oldest", "middle", "newest"].map((name, index) => ({
      name: `automatic-recovery-${name}.json`,
      path_lower: `/automatic-recovery-${name}.json`,
      server_modified: `2026-04-0${index + 1}T00:00:00Z`,
    })),
  ];
  const reducedRemoved = [];
  const reducedAttempts = [];
  const reducedLatest = '{"knownGood":true}';
  const reducedBackup = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: {
        list: async () => reducedFiles,
        download: async () => reducedLatest,
        remove: async (target) => {
          reducedRemoved.push(target);
          const index = reducedFiles.findIndex((file) => file.path_lower === target);
          if (index >= 0) reducedFiles.splice(index, 1);
        },
        upload: async (target) => {
          reducedAttempts.push(target);
          throw capacityError;
        },
      },
      localStorage: {
        getItem: (key) => key === "snapshot" ? "0" : null,
        setItem() {},
        removeItem() {},
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      pruneCloudSnapshots: async () => {},
      refreshSyncIcon() {},
      markBackupDone() {},
      cloudBackupHook() {},
      console: { error() {} },
      Date,
      JSON,
    },
  );
  await assert.rejects(reducedBackup(), (error) =>
    error.code === "cloud-recovery-preserve-failed");
  assert.deepStrictEqual(reducedRemoved, ["/automatic-recovery-oldest.json"]);
  assert.strictEqual(
    reducedFiles.filter((file) => /^automatic-recovery-.*\.json$/.test(file.name)).length,
    2,
  );
  assert.strictEqual(reducedAttempts.includes("/latest.json"), false);
  assert.strictEqual(reducedFiles[0].name, "latest.json");
  console.log("PASS if capacity remains insufficient, only two older recovery points remain and latest.json is not overwritten");

  const fullSet = [
    { name: "latest.json", path_lower: "/latest.json", server_modified: "2026-01-01T00:00:00Z", rev: "full-rev" },
    ...["one", "two", "three", "four"].map((name, index) => ({
      name: `automatic-recovery-${name}.json`,
      path_lower: `/automatic-recovery-${name}.json`,
      server_modified: `2025-12-0${index + 1}T00:00:00Z`,
    })),
  ];
  const blockedAttempts = [];
  const blockedRotation = vm.runInNewContext(
    `${recoveryFileNameSource}\n${uploadCloudFileSource}\n${cloudBackupSource}\nrunCloudBackup;`,
    {
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      CLOUD_SNAPSHOT_KEY: "snapshot",
      CLOUD_DIRTY_KEY: "dirty",
      CLOUD_LAST_KEY: "last",
      CLOUD_SEEN_KEY: "seen",
      CLOUD_SNAPSHOTS_KEPT: 3,
      CLOUD_SNAPSHOT_ROTATION_LIMIT: 4,
      DAY_MS: 24 * 60 * 60 * 1000,
      dropbox: {
        list: async () => fullSet,
        upload: async (target) => {
          blockedAttempts.push(target);
          throw new Error("Unexpected upload.");
        },
      },
      localStorage: {
        getItem: (key) => key === "snapshot" ? "0" : null,
        setItem() {},
        removeItem() {},
      },
      remoteIsNewer: () => false,
      mergeFromCloud: async () => null,
      buildBackup: async () => ({ format: "return-visits-backup", contacts: [] }),
      pruneCloudSnapshots: async () => {
        throw new Error("Dropbox cleanup unavailable.");
      },
      refreshSyncIcon() {},
      markBackupDone() {},
      cloudBackupHook() {},
      console: { error() {} },
      Date,
      JSON,
    },
  );
  await assert.rejects(blockedRotation(), (error) =>
    error.code === "cloud-recovery-preserve-failed");
  assert.deepStrictEqual(blockedAttempts, []);
  assert.strictEqual(fullSet[0].name, "latest.json");
  assert.strictEqual(fullSet.length, 5);
  console.log("PASS unknown capacity and failed cleanup never delete or overwrite a full known-good recovery set");

  const statusMessages = [];
  const autoBackup = vm.runInNewContext(
    `${autoBackupSource}\nautoCloudBackup;`,
    {
      installScreen: { hidden: true },
      dropbox: { isConnected: () => true },
      contacts: [{}],
      CLOUD_RECONNECT_DECISION_KEY: "decision",
      CLOUD_RETENTION_WARNING_KEY: "retention-warning",
      localStorage: { getItem: () => null },
      navigator: { onLine: true },
      runCloudBackup: async () => ({ latestUploaded: true }),
      refreshCloudUi: async () => {},
      setCloudStatus: (message, shouldScroll) => statusMessages.push([message, shouldScroll]),
      appText: (_key, fallback) => fallback,
      refreshSyncIcon() {},
      cloudPaused: false,
      NewerDataVersionError: class extends Error {},
      showStartupRecovery() {},
      console,
      window: { clearTimeout() {}, setTimeout() {} },
    },
  );
  assert.strictEqual(await autoBackup(), true);
  assert.deepStrictEqual(statusMessages, [
    ["Backing up to Dropbox…", false],
    ["Backup complete.", false],
  ]);
  let scrollCount = 0;
  const cloudStatus = { textContent: "", scrollIntoView() { scrollCount += 1; } };
  const setCloudStatus = vm.runInNewContext(`${cloudStatusSource}\nsetCloudStatus;`, { cloudStatus });
  setCloudStatus("Automatic update", false);
  assert.strictEqual(scrollCount, 0, "automatic status must not move the user's view");
  setCloudStatus("Manual action");
  assert.strictEqual(scrollCount, 1, "manual status keeps its existing scroll-to-result behavior");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /id="cloud-status" role="status" aria-live="polite"/);
  console.log("PASS automatic Dropbox backup reports progress and confirmed completion non-disruptively");

  const scheduled = [];
  const clearedTimers = [];
  let autoBackupCalls = 0;
  const cloudHook = vm.runInNewContext(
    `let localChanges = 0;\n${cloudHookSource}\n({ hook: cloudBackupHook, getChanges: () => localChanges });`,
    {
      cloudBackupHook() {},
      dropbox: { isConnected: () => true },
      CLOUD_DIRTY_KEY: "dirty",
      localStorage: { setItem: (key, value) => localValues.set(key, value) },
      refreshSyncIcon() {},
      autoCloudBackup: async () => { autoBackupCalls += 1; },
      window: {
        clearTimeout: (id) => clearedTimers.push(id),
        setTimeout: (callback, delay) => {
          scheduled.push({ callback, delay });
          return scheduled.length;
        },
      },
    },
  );
  cloudHook.hook();
  cloudHook.hook();
  assert.strictEqual(cloudHook.getChanges(), 2);
  assert.strictEqual(localValues.get("dirty"), "1");
  assert.deepStrictEqual(scheduled.map(({ delay }) => delay), [15000, 15000]);
  assert.deepStrictEqual(clearedTimers, [null, 1], "repeated edits debounce the pending backup");
  scheduled[1].callback();
  assert.strictEqual(autoBackupCalls, 1);
  assert(app.includes("}, 120000);"), "while-open Dropbox checks remain scheduled every two minutes");
  assert(app.includes('window.addEventListener("online", () => {'), "reconnection resumes synchronization");
  console.log("PASS Dropbox backup is debounced after edits and retried on schedule/reconnection");

  const reminderStart = app.indexOf("const checkBackupReminder = async () => {");
  const reminderEnd = app.indexOf("window.setTimeout(async () => {", reminderStart);
  assert(reminderStart >= 0 && reminderEnd > reminderStart);
  const reminderSource = app.slice(reminderStart, reminderEnd);
  assert(reminderSource.includes('acceptLabel: appText("backup.reminderBackUpNow"'));
  assert(reminderSource.includes('cancelLabel: appText("backup.reminderNotNow"'));
  assert(reminderSource.includes("await downloadEncryptedBackup();"));
  assert(!reminderSource.includes("markBackupDone()"));
  assert(!reminderSource.includes("showSettingsView()"));

  const restoreStart = app.indexOf("const restoreBackupObject = async (backup) => {");
  const restoreEnd = app.indexOf("\n\n  const restoreBackupFile", restoreStart);
  assert(restoreStart >= 0 && restoreEnd > restoreStart);
  assert(!app.slice(restoreStart, restoreEnd).includes("markBackupDone()"));
  assert(!app.includes('localStorage.setItem("return_visits_last_backup_reminder"'));
  console.log("PASS reminder actions are direct, Not Now/Restore do not count as backups");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
