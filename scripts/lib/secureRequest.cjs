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
// Whether to encrypt at all follows the same line, and the destination
// is what decides it. The first version of this file left that choice to
// each script, which answered it by reading the LOCAL service's TLS
// settings: run from a container with no certificate of its own, they
// sent an admin token in the clear to a public domain. usesHttps below
// is the fix, and it makes the unsafe case unrepresentable rather than
// merely checked for.

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

// Whether to speak HTTPS to this target.
//
// The three scripts used to answer this by looking at SSL_CERT and
// HTTPS_ENABLED in the local .env, which describes the service on THIS
// machine and says nothing whatsoever about a machine reached through
// --host. Run from a container with no TLS of its own, that reasoning
// sent an admin token in the clear to a public domain: the local
// configuration was the wrong thing to read.
//
// The destination decides instead. Loopback keeps the local answer,
// because there the local service IS the target. Anything else is
// spoken to over HTTPS: a request that leaves the machine carries a
// passphrase or a token, and there is no version of that worth sending
// unprotected. --insecure and --ca stay available for a certificate
// that will not verify; neither of them turns the encryption off.
function usesHttps({ host, localHttpsEnabled }) {
  return isLoopbackHost(host) ? !!localHttpsEnabled : true;
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

// Turns a failed connection into an explanation, because the stock
// messages say nothing about what to do next.
//
// There used to be a guard here that refused to send a secret in the
// clear. Once usesHttps started forcing TLS for every target off this
// machine, that guard could no longer fire: the state it protected
// against had become unreachable. What is left to explain is the shape
// it now fails in, which is a service on the other end that speaks plain
// HTTP and cannot answer a TLS handshake.
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
  if (certCodes.has(code)) {
    return new Error(
      `the certificate of ${host} could not be verified (${code}). ` +
      "Pass --ca=<file> with the certificate of the authority that signed it, " +
      "or --insecure to skip the check knowing what that costs.",
    );
  }
  const plainCodes = new Set([
    "EPROTO",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "ERR_SSL_PACKET_LENGTH_TOO_LONG",
    "ECONNRESET",
  ]);
  if (plainCodes.has(code)) {
    return new Error(
      `${host} answered as plain HTTP (${code}). This command carries an ` +
      "admin token, which is not sent unencrypted to another machine: run it " +
      "on that machine against 127.0.0.1, or put HTTPS in front of the service.",
    );
  }
  return err;
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
  usesHttps,
  parseTlsArgs,
  tlsOptionsFor,
  requestJson,
  TLS_USAGE,
};
