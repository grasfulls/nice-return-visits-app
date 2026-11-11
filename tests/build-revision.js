const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { checkBuildFiles, hashAssets } = require("../scripts/build-revision.js");

const root = path.join(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "build-revision.yml"),
  "utf8",
);
assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
assert(workflow.includes("node scripts/build-revision.js --write"));
assert(workflow.includes("git add app.js index.html service-worker.js version.json"));
assert(workflow.includes("git push origin HEAD:main"));
const extensionAssets = [
  ["index.html", `<meta name="nrv-build-revision" content="sha256:${"a".repeat(64)}" />`],
  ["app.js", `const APP_BUILD_REVISION = "sha256:${"a".repeat(64)}";`],
  ["styles.css", "body { color: black; }"],
  ["locales/en.json", '{"backup.contactsBackup":"Backup"}'],
  ["icons/header-watermark.png", Buffer.from([0, 1, 2, 255])],
  ["service-worker.js", `const BUILD_REVISION = "sha256:${"a".repeat(64)}";`],
].map(([file, contents]) => ({
  path: file,
  contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
}));
const original = hashAssets(extensionAssets);

for (const asset of extensionAssets) {
  const changed = extensionAssets.map((item) => ({
    path: item.path,
    contents: Buffer.from(item.contents),
  }));
  const target = changed.find((item) => item.path === asset.path);
  target.contents = Buffer.concat([target.contents, Buffer.from("changed")]);
  assert.notStrictEqual(
    hashAssets(changed),
    original,
    `${asset.path} changes must update the asset revision`,
  );
}

const regenerated = extensionAssets.map((asset) => ({
  path: asset.path,
  contents: Buffer.from(asset.contents),
}));
for (const asset of regenerated) {
  if (asset.path === "app.js" || asset.path === "service-worker.js") {
    asset.contents = Buffer.from(
      asset.contents.toString("utf8").replace(/a{64}/, "b".repeat(64)),
    );
  }
}
assert.strictEqual(
  hashAssets(regenerated),
  original,
  "generated revision constants are excluded from their own digest",
);
assert.notStrictEqual(
  hashAssets([{ path: "icons/example.png", contents: Buffer.from([0x80]) }]),
  hashAssets([{ path: "icons/example.png", contents: Buffer.from([0x81]) }]),
  "image revisions must hash original binary bytes",
);
assert.match(checkBuildFiles(), /^sha256:[a-f0-9]{64}$/);
assert.strictEqual(
  JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version,
  "0.9.059",
);

console.log("PASS generated asset revision covers app assets and remains stable across regeneration");
