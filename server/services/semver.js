// server/services/semver.js
//
// The release comparison the update check and the self-update share: a
// version is "x.y.z", with or without a leading "v", optionally followed
// by a pre-release ("-beta", "-beta.2") and build metadata ("+abc1234",
// ignored). Ordered as semver orders them: 2.8.0-beta < 2.8.0-beta.2 <
// 2.8.0. Anything else is never newer than anything.

function parseSemver(v) {
  if (!v) return null;
  const m = String(v).trim().replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
  };
}

// Pre-release identifiers, compared one by one: numbers numerically and
// below words, words alphabetically, and a shorter list first when the
// longer one only adds to it.
function comparePre(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const an = /^\d+$/.test(a[i]);
    const bn = /^\d+$/.test(b[i]);
    if (an && bn) {
      if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]) ? 1 : -1;
    } else if (an !== bn) {
      return an ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] > b[i] ? 1 : -1;
    }
  }
  return 0;
}

// -1, 0 or 1, or null when either is not a version.
function compareVersions(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] > y.core[i] ? 1 : -1;
  }
  // A release ranks above its own pre-releases.
  if (!x.pre.length || !y.pre.length) {
    return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  }
  return comparePre(x.pre, y.pre);
}

function isStrictlyNewer(latest, current) {
  return compareVersions(latest, current) === 1;
}

function isPrerelease(v) {
  return !!parseSemver(v)?.pre.length;
}

module.exports = { compareVersions, isStrictlyNewer, isPrerelease };
