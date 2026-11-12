const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const versionTools = require("./version.js");

const root = path.join(__dirname, "..");
const revisionPattern = /^sha256:[a-f0-9]{64}(?![\s\S])/;
const assetExtensions = new Set([
  ".avif",
  ".bmp",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
]);
const textAssetExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".webmanifest",
]);
const revisionPlaceholders = {
  "app.js": /^const APP_BUILD_REVISION = "[^"]+";/m,
  "index.html": /<meta name="nrv-build-revision" content="[^"]+" \/>/,
  "service-worker.js": /^const BUILD_REVISION = "[^"]+";/m,
};

const getAssetPaths = () =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && file !== "version.json")
    .filter((file) => !file.startsWith("tests/") && !file.startsWith("scripts/"))
    .filter((file) => assetExtensions.has(path.extname(file).toLowerCase()))
    .sort();

const normalizedAssetContents = (file, contents) => {
  if (textAssetExtensions.has(path.extname(file).toLowerCase())) {
    let text = contents.toString("utf8").replace(/\r\n?/g, "\n");
    const placeholder = revisionPlaceholders[file];
    if (placeholder) {
      if (!placeholder.test(text)) {
        throw new Error(`${file} must contain its generated build revision.`);
      }
      text = text.replace(placeholder, (declaration) =>
        file === "index.html"
          ? declaration.replace(/content="[^"]+"/, 'content="sha256:__ASSET_REVISION__"')
          : declaration.replace(/"[^"]+";$/, '"sha256:__ASSET_REVISION__";'),
      );
    }
    return Buffer.from(text, "utf8");
  }
  return contents;
};

const hashAssets = (assets) => {
  const hash = crypto.createHash("sha256");
  for (const asset of [...assets].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    hash.update(asset.path.replace(/\\/g, "/"), "utf8");
    hash.update("\0");
    hash.update(normalizedAssetContents(asset.path, asset.contents));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
};

const computeBuildRevision = () =>
  hashAssets(
    getAssetPaths().map((file) => ({
      path: file,
      contents: fs.readFileSync(path.join(root, file)),
    })),
  );

const replaceRevision = (file, expression, revision) => {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, "utf8");
  if (!expression.test(source)) {
    throw new Error(`${file} must contain its generated build revision.`);
  }
  const updated = source.replace(expression, (declaration) =>
    file === "index.html"
      ? declaration.replace(/content="[^"]+"/, `content="${revision}"`)
      : declaration.replace(/"[^"]+";$/, `"${revision}";`),
  );
  if (updated !== source) fs.writeFileSync(fullPath, updated);
};

const generateBuildFiles = () => {
  const version = versionTools.canonicalVersion(fs.readFileSync(path.join(root, "app.js"), "utf8"));
  for (const [file, expression, replacement] of [
    ["index.html", /nrv-release=\d+\.\d+\.\d+/g, `nrv-release=${version}`],
    ["index.html", /var release = "[^"]+";/, `var release = "${version}";`],
    ["service-worker.js", /const RELEASE_VERSION = "[^"]+";/, `const RELEASE_VERSION = "${version}";`],
    [".htaccess", /X-NRV-Release "[^"]+"/, `X-NRV-Release "${version}"`],
  ]) {
    const fullPath = path.join(root, file);
    const source = fs.readFileSync(fullPath, "utf8");
    fs.writeFileSync(fullPath, source.replace(expression, replacement));
  }
  const revision = computeBuildRevision();
  replaceRevision("app.js", revisionPlaceholders["app.js"], revision);
  replaceRevision(
    "service-worker.js",
    revisionPlaceholders["service-worker.js"],
    revision,
  );
  replaceRevision(
    "index.html",
    revisionPlaceholders["index.html"],
    revision,
  );
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  fs.writeFileSync(
    path.join(root, "version.json"),
    versionTools.metadataFor(version, revision),
  );
  return revision;
};

const checkBuildFiles = () => {
  const revision = computeBuildRevision();
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const workerSource = fs.readFileSync(
    path.join(root, "service-worker.js"),
    "utf8",
  );
  const appRevision = appSource.match(
    /^const APP_BUILD_REVISION = "([^"]+)";$/m,
  )?.[1];
  const workerRevision = workerSource.match(
    /^const BUILD_REVISION = "([^"]+)";$/m,
  )?.[1];
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const pageRevision = indexSource.match(
    /<meta name="nrv-build-revision" content="([^"]+)" \/>/,
  )?.[1];
  const version = versionTools.canonicalVersion(appSource);
  if (!indexSource.includes(`var release = "${version}";`) ||
      !workerSource.includes(`const RELEASE_VERSION = "${version}";`) ||
      !fs.readFileSync(path.join(root, ".htaccess"), "utf8").includes(`X-NRV-Release "${version}"`) ||
      [...indexSource.matchAll(/nrv-release=(\d+\.\d+\.\d+)/g)].some((match) => match[1] !== version)) {
    throw new Error("Release-specific resources do not match APP_VERSION.");
  }
  if (
    appRevision !== revision ||
    workerRevision !== revision ||
    pageRevision !== revision
  ) {
    throw new Error("Generated page, app, and service-worker revisions are stale.");
  }
  versionTools.checkMetadata(
    fs.readFileSync(path.join(root, "version.json"), "utf8"),
    versionTools.canonicalVersion(appSource),
    revision,
  );
  if (!revisionPattern.test(revision)) {
    throw new Error("Generated asset revision is invalid.");
  }
  return revision;
};

if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !["--write", "--check"].includes(mode)) {
      throw new Error("Usage: node scripts/build-revision.js --write|--check");
    }
    const revision =
      mode === "--write" ? generateBuildFiles() : checkBuildFiles();
    console.log(`Verified generated app asset revision ${revision}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { computeBuildRevision, generateBuildFiles, checkBuildFiles, hashAssets };
