// server/routes/assetLinksRoutes.js
//
// Serves /.well-known/assetlinks.json — the Digital Asset Links file
// Android consults before sharing a domain's passkeys with the native
// app. Without this file in place, Credential Manager (the OS-level
// passkey API on Android 14+ / Play Services on older devices) refuses
// to associate the WebView's RP ID with our APK and the user sees
// "no passkeys for this site".
//
// We GENERATE the file on the fly rather than asking operators to drop
// a static file under /public — that way:
//
//   - the official + F-Droid fingerprints are always shipped by the
//     server itself (zero operator work for someone on Madame Michu's
//     side of the spectrum);
//   - bidouilleurs who rebuild the APK with their own keystore just
//     set ANDROID_EXTRA_FINGERPRINTS=AA:BB:...,CC:DD:... and the file
//     starts listing their fingerprint immediately;
//   - the same image works across every domain — there's nothing
//     domain-specific in the response, so no per-install config.
//
// Spec: https://developers.google.com/digital-asset-links/v1/getting-started

const ANDROID_PACKAGE_NAME = "com.glasskeep.app";

// SHA-256 fingerprint of the official release APK published by the
// project maintainer on the GitHub Releases page. Anyone installing
// that exact APK will be authorised to use passkeys from any domain
// running this server.
//
// Public information — extracted with:
//   keytool -list -v -keystore <release-keystore>
const OFFICIAL_RELEASE_FINGERPRINT =
  "F2:2B:D7:B4:63:D8:D8:9C:A1:AC:3B:6C:41:DB:0B:25:AA:C7:7B:86:24:C9:70:E4:52:81:2D:32:19:42:A9:71";

// SHA-256 fingerprint of the F-Droid main repository signing key.
// When (if) the app is submitted to F-Droid and they build + sign it
// on their own infrastructure, the resulting APK is signed with this
// key — so we ship the fingerprint pre-baked, ready for the day the
// app lands on f-droid.org without operators having to update anything.
//
// Public information — published by F-Droid at:
//   https://f-droid.org/repo/index-v1.jar  (and many mirror sites)
const FDROID_RELEASE_FINGERPRINT =
  "43:23:8D:51:2C:1E:5E:B2:D6:56:9F:4A:3A:FB:F5:D4:81:A1:01:E6:78:90:75:8A:09:6E:51:B9:65:18:88:01";

// Default fingerprints baked into every install. Anything beyond these
// (custom rebuilds, alternative stores) goes through the env var below.
const DEFAULT_FINGERPRINTS = [
  OFFICIAL_RELEASE_FINGERPRINT,
  FDROID_RELEASE_FINGERPRINT,
];

// Normalise a fingerprint to the AA:BB:CC: form Android expects.
// Accepts the colon form, the no-separator hex form, lowercase or
// uppercase, and trims surrounding whitespace. Returns null when the
// input doesn't look like a SHA-256 digest (32 bytes = 64 hex chars).
function normaliseFingerprint(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (cleaned.length !== 64) return null;
  return cleaned.match(/.{2}/g).join(":");
}

function parseExtraFingerprints(envValue) {
  if (!envValue) return [];
  return String(envValue)
    .split(/[\s,;]+/)
    .map(normaliseFingerprint)
    .filter(Boolean);
}

function buildAssetLinksPayload() {
  const extra = parseExtraFingerprints(process.env.ANDROID_EXTRA_FINGERPRINTS);

  // Dedupe while preserving order — defaults first, custom rebuilds
  // appended in the order the operator listed them.
  const seen = new Set();
  const fingerprints = [];
  for (const fp of [...DEFAULT_FINGERPRINTS, ...extra]) {
    const n = normaliseFingerprint(fp);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    fingerprints.push(n);
  }

  // The "get_login_creds" relation is what Android Credential Manager
  // checks for when associating passkey credentials with an APK. We
  // include "handle_all_urls" as well so the same file can later cover
  // deep-link verification (App Links) without needing a second
  // statement block — Google's verifier ignores irrelevant relations.
  return [
    {
      relation: [
        "delegate_permission/common.get_login_creds",
        "delegate_permission/common.handle_all_urls",
      ],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function attachAssetLinksRoutes(app, { log = console } = {}) {
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const payload = buildAssetLinksPayload();
    // Android's Digital Asset Links verifier expects exactly this MIME
    // type. It also caches the response, so we keep the TTL short —
    // operators flipping ANDROID_EXTRA_FINGERPRINTS won't want to
    // restart their device to see the change.
    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=300");
    res.json(payload);
  });

  if (log && typeof log.log === "function") {
    const extraCount = parseExtraFingerprints(
      process.env.ANDROID_EXTRA_FINGERPRINTS,
    ).length;
    log.log(
      `[assetlinks] /.well-known/assetlinks.json ready (` +
        `${DEFAULT_FINGERPRINTS.length} default + ${extraCount} custom fingerprint(s))`,
    );
  }
}

module.exports = {
  attachAssetLinksRoutes,
  // Exported for tests / introspection only.
  _internals: {
    ANDROID_PACKAGE_NAME,
    DEFAULT_FINGERPRINTS,
    OFFICIAL_RELEASE_FINGERPRINT,
    FDROID_RELEASE_FINGERPRINT,
    normaliseFingerprint,
    parseExtraFingerprints,
    buildAssetLinksPayload,
  },
};
