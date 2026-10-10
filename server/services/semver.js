// server/services/semver.js
//
// The release comparison the update check and the self-update share: a
// version is "x.y.z", with or without a leading "v"; anything else is
// never newer than anything.

function parseSemver(v) {
  if (!v) return null;
  const m = String(v).trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isStrictlyNewer(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

module.exports = { isStrictlyNewer };
