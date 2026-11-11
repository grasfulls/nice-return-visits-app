// Run with: node scripts/version.js --write  or  node scripts/version.js --check
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*|058|059)(?![\s\S])/;

const canonicalVersion = (source) => {
  const declarations = [...source.matchAll(/^const APP_VERSION = "([^"]*)";$/gm)];
  if (declarations.length !== 1 || !versionPattern.test(declarations[0][1])) {
    throw new Error("app.js must contain exactly one valid APP_VERSION declaration.");
  }
  return declarations[0][1];
};
const compareVersions = (left, right) => {
  const order = (version) => {
    const parts = version.split(".");
    const patch = Number(parts[2]);
    if (parts[0] === "0" && parts[1] === "9" && patch >= 51 && patch <= 59) {
      return [parts[0], parts[1], "5", String(patch - 50)];
    }
    return [parts[0], parts[1], parts[2], "0"];
  };
  const leftParts = order(left);
  const rightParts = order(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index].length !== rightParts[index].length) {
      return leftParts[index].length > rightParts[index].length ? 1 : -1;
    }
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
};
const revisionPattern = /^sha256:[a-f0-9]{64}(?![\s\S])/;
const metadataFor = (version, revision) => {
  if (!versionPattern.test(version)) throw new Error("Invalid app version.");
  if (!revisionPattern.test(revision)) throw new Error("Invalid asset revision.");
  return `${JSON.stringify({ version, revision }, null, 2)}\n`;
};
const checkMetadata = (contents, version, revision) => {
  let metadata;
  try {
    metadata = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid version metadata JSON: ${error.message}`);
  }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object" ||
      Object.keys(metadata).length !== 2 ||
      metadata.version !== version || metadata.revision !== revision ||
      !revisionPattern.test(metadata.revision)) {
    throw new Error("Deployment metadata does not match APP_VERSION and asset revision.");
  }
};

if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !["--write", "--check"].includes(mode)) {
      throw new Error("Usage: node scripts/version.js --write|--check");
    }
    const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
    const version = canonicalVersion(appSource);
    const revision = appSource.match(/^const APP_BUILD_REVISION = "([^"]+)";$/m)?.[1];
    const file = path.join(root, "version.json");
    if (!revisionPattern.test(revision)) throw new Error("Invalid app asset revision.");
    if (mode === "--write") {
      fs.writeFileSync(file, metadataFor(version, revision));
    }
    checkMetadata(fs.readFileSync(file, "utf8"), version, revision);
    console.log(`Deployment metadata matches NRV ${version}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  canonicalVersion,
  compareVersions,
  metadataFor,
  checkMetadata,
  revisionPattern,
};
