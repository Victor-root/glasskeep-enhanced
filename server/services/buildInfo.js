// server/services/buildInfo.js
//
// What the running build is: its package.json version, the commit it was
// built from when that is known, and whether it is a beta (a pre-release
// version, such as 2.8.0-beta). A Docker image carries its commit in
// GLASSKEEP_COMMIT, set when the image is built; a native install reads
// it from its git checkout.
//
// Betas share one version across many pushes, so the commit is what tells
// two of them apart: `label` adds it to a beta's version (2.8.0-beta+abc1234).

const path = require("path");
const { execFileSync } = require("child_process");
const pkg = require("../../package.json");
const { isPrerelease } = require("./semver");

const ROOT = path.join(__dirname, "..", "..");
const COMMIT_RE = /^[0-9a-f]{40}$/;

// The database format level a release writes (see services/dbSafety.js).
// Releases older than the field wrote level 1.
function dbCompatOf(manifest) {
  const level = Number(manifest?.glasskeep?.dbCompat);
  return Number.isInteger(level) && level > 0 ? level : 1;
}

function readCommit() {
  const fromEnv = String(process.env.GLASSKEEP_COMMIT || "").trim().toLowerCase();
  if (COMMIT_RE.test(fromEnv)) return fromEnv;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    return COMMIT_RE.test(head) ? head : null;
  } catch {
    return null;
  }
}

function buildLabel(version, commit) {
  return isPrerelease(version) && commit ? `${version}+${commit.slice(0, 7)}` : version;
}

let cached = null;

function getBuildInfo() {
  if (!cached) {
    const commit = readCommit();
    cached = {
      version: pkg.version,
      commit,
      beta: isPrerelease(pkg.version),
      label: buildLabel(pkg.version, commit),
      dbCompat: dbCompatOf(pkg),
    };
  }
  return cached;
}

module.exports = { getBuildInfo, buildLabel, dbCompatOf };
