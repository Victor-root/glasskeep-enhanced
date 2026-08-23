// scripts/lib/secureRequest.cjs
//
// The HTTP client the maintenance scripts share, and the one place that
// decides whether a certificate has to be verified.
//
// WHY THIS EXISTS. The three CLI helpers all talked to the service with
// `rejectUnauthorized: false`, justified by a comment saying the tool
// runs on the same machine as the service. That is true of the default
// and false of the reality: every one of them takes `--host`, so the
// same command can be aimed at a box across the internet, and the
// passphrase or the admin token then rides a TLS connection whose other
// end was never identified. Encrypted to nobody in particular.
//
// The rule below keeps the convenience exactly where the justification
// holds and nowhere else:
//
//   - loopback: certificate not verified. A self-signed certificate is
//     the norm on a self-hosted box and nothing leaves the machine, so
//     there is no one to impersonate and nothing to intercept.
//   - anywhere else: verified like any other client. `--ca=<file>`
//     supplies the certificate of a private authority, which is what a
//     self-hosted setup with its own certificate needs. `--insecure`
//     still exists for the operator who knowingly wants the old
//     behaviour, and says so on stderr every time.
//
// Plaintext HTTP gets the same treatment: fine to loopback, refused to
// anywhere else when the request carries a secret.

const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");

// Judged from the host as written, with no name resolution: the answer
// has to be the same every time the operator reads the command line,
// and a name that resolves somewhere today can resolve elsewhere
// tomorrow. Someone whose local name maps to the loopback interface can
// pass the address itself.
function isLoopbackHost(host) {
  const h = String(host || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!h) return false;
  if (h === "localhost") return true;
  const version = net.isIP(h);
  if (version === 4) return h.split(".")[0] === "127";
  if (version === 6) return h === "::1" || h === "::ffff:127.0.0.1";
  return false;
}

// Reads the two TLS flags out of argv. Left separate from each script's
// own parser so the flags mean the same thing everywhere.
function parseTlsArgs(argv) {
  const out = { insecure: false, caFile: null };
  for (const a of argv) {
    if (a === "--insecure") out.insecure = true;
    else if (a.startsWith("--ca=")) out.caFile = a.slice(5);
  }
  return out;
}

const TLS_USAGE = [
  "  --ca=<file>        trust this certificate authority (private / self-signed setups)",
  "  --insecure         do not verify the certificate at all (loopback aside, unsafe)",
].join("\n");

// Builds the TLS half of the request options, or throws with something
// the operator can act on.
function tlsOptionsFor({ host, httpsEnabled, insecure = false, caFile = null }) {
  if (!httpsEnabled) return {};
  if (isLoopbackHost(host)) return { rejectUnauthorized: false };
  if (insecure) {
    process.stderr.write(
      `[warning] --insecure: the certificate of ${host} will not be verified. ` +
      "Anything sent, passphrase or token included, can be read and altered on the way.\n",
    );
    return { rejectUnauthorized: false };
  }
  if (caFile) {
    let ca;
    try {
      ca = fs.readFileSync(caFile);
    } catch (e) {
      throw new Error(`cannot read the authority file ${caFile}: ${e.message}`);
    }
    return { rejectUnauthorized: true, ca };
  }
  return { rejectUnauthorized: true };
}

// Refuses to put a secret on a link that protects nothing. The server
// refuses the plaintext unlock on its own side too; saying it here gives
// the operator the reason before the secret is typed rather than after.
function assertSafeForSecrets({ host, httpsEnabled }) {
  if (httpsEnabled || isLoopbackHost(host)) return;
  throw new Error(
    `refusing to send a secret to ${host} over plain HTTP. ` +
    "Enable HTTPS on the service, or run this from the machine itself against 127.0.0.1.",
  );
}

// Turns a failed certificate check into an explanation, because the
// stock message says nothing about what to do next.
function explainTlsError(err, host) {
  const code = err && err.code;
  const certCodes = new Set([
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  ]);
  if (!certCodes.has(code)) return err;
  return new Error(
    `the certificate of ${host} could not be verified (${code}). ` +
    "Pass --ca=<file> with the certificate of the authority that signed it, " +
    "or --insecure to skip the check knowing what that costs.",
  );
}

function requestJson({ host, port, httpsEnabled, method, path, body, token, tls }) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const lib = httpsEnabled ? https : http;
    const req = lib.request({
      host,
      port,
      method: method || (body ? "POST" : "GET"),
      path,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": data.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...tlsOptionsFor({ host, httpsEnabled, ...(tls || {}) }),
    }, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch { /* not json */ }
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    req.on("error", (e) => reject(explainTlsError(e, host)));
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  isLoopbackHost,
  parseTlsArgs,
  tlsOptionsFor,
  assertSafeForSecrets,
  requestJson,
  TLS_USAGE,
};
