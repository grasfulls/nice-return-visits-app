// Run with: node tests/production-integrity.js
const { spawnSync } = require("child_process");
const path = require("path");
const result = spawnSync("python", ["-B", path.join(__dirname, "production-integrity.py")], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
