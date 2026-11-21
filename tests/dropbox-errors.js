// Run with: node tests/dropbox-errors.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "dropbox.js"), "utf8");
const storage = new Map([[
  "return_visits_dropbox",
  JSON.stringify({
    refreshToken: "test-refresh-token",
    accessToken: "test-access-token",
    expiresAt: Date.now() + 60000,
  }),
]]);
let responseText = "";
const window = {
  location: {
    search: "",
    href: "https://example.test/app/",
    origin: "https://example.test",
    pathname: "/app/",
  },
  RVDropbox: null,
};
vm.runInNewContext(source, {
  window,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
  fetch: async () => ({
    ok: false,
    status: 409,
    text: async () => responseText,
  }),
  Date,
  URL,
  URLSearchParams,
  Blob,
  console,
});

async function main() {
  responseText = JSON.stringify({ error_summary: "path/insufficient_space/.." });
  await assert.rejects(
    window.RVDropbox.upload("/recovery.json", "{}"),
    (error) =>
      error.status === 409 &&
      error.errorSummary === "path/insufficient_space/.." &&
      error.insufficientSpace === true &&
      error.conflict === false,
  );
  responseText = JSON.stringify({ error_summary: "path/conflict/file/.." });
  await assert.rejects(
    window.RVDropbox.upload("/latest.json", "{}"),
    (error) =>
      error.conflict === true &&
      error.insufficientSpace === false,
  );
  console.log("PASS Dropbox upload errors distinguish insufficient capacity from revision conflicts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
