// server/middleware/trustProxy.js
//
// Which reverse proxies the server believes when they report the
// client's address and protocol.

// Trust proxy headers (X-Forwarded-Proto / X-Forwarded-For) when:
//   - the operator explicitly set TRUST_PROXY=true, OR
//   - HTTPS is disabled at the Node level (HTTPS_ENABLED=false), which
//     means TLS is necessarily terminated at an upstream reverse proxy.
// Without this, req.secure stays false on a perfectly-fine HTTPS request
// forwarded by Nginx/Caddy/Traefik, and the at-rest unlock endpoint
// would refuse the request as "plaintext HTTP".
// WHAT "trust" MEANS HERE, and why it is not simply `true`.
//
// X-Forwarded-For is written by whoever sends the request. Express turns it
// into req.ip only for hops it is told to trust; `true` trusts every hop,
// which means req.ip becomes the first value in a header the CLIENT controls.
// That value is what the at-rest unlock throttle counts attempts against and
// what decides whether a request looks like it came from loopback, so with
// `true` a passphrase guesser only had to vary one header to get a fresh
// allowance on every try, and could claim 127.0.0.1 at will.
//
// The default is therefore the set of addresses a reverse proxy actually sits
// on for a self-hosted deployment: loopback (proxy on the same host), and
// private / link-local ranges (proxy in another container or elsewhere on the
// LAN). A request arriving straight from a public address is not a trusted
// hop, so its X-Forwarded-For is ignored and req.ip is the address it really
// came from.
//
// TRUST_PROXY accepts more than a boolean for deployments this does not fit:
//   true                 the safe default described above
//   a number             count of proxy hops in front of Node (e.g. "2")
//   a comma-separated    addresses, CIDR ranges or Express presets to trust
//   list                 (e.g. "10.0.0.7", "192.168.1.0/24", "loopback")
// A proxy on a PUBLIC address (a CDN in front of the origin, say) is not
// trusted by the default: name its addresses here, or the whole site shares
// one throttle bucket. That fails closed rather than open, which is the point.
const SAFE_PROXY_RANGES = "loopback, linklocal, uniquelocal";

function configureTrustProxy(app) {
  const TRUST_PROXY_RAW = (process.env.TRUST_PROXY || "").trim();
  const TRUST_PROXY = TRUST_PROXY_RAW !== "" && TRUST_PROXY_RAW !== "false"
    ? TRUST_PROXY_RAW
    : (process.env.HTTPS_ENABLED === "false" ? "true" : "");
  if (TRUST_PROXY) {
    // "true" keeps meaning "there is a proxy in front of me", but resolves to
    // the private-range set rather than to Express's trust-everything.
    const setting = TRUST_PROXY === "true"
      ? SAFE_PROXY_RANGES
      : (/^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
    app.set("trust proxy", setting);
    console.log(
      "[boot] trust proxy enabled (TRUST_PROXY=" + (process.env.TRUST_PROXY || "(unset)")
      + ", HTTPS_ENABLED=" + (process.env.HTTPS_ENABLED || "(unset)")
      + ") -> trusting " + JSON.stringify(setting)
      + "; TLS termination is the operator's responsibility upstream of Node.",
    );
  }
  // The Docker image ships HTTPS_ENABLED=false, which switches proxy-header
  // handling on but says nothing about whether a proxy is actually there. The
  // at-rest unlock endpoints no longer read it as "the operator promised TLS
  // upstream" (they used to, silently), so say out loud what will happen: with
  // a proxy that forwards X-Forwarded-Proto nothing changes, without one the
  // passphrase will be refused rather than accepted over plaintext.
  if (process.env.HTTPS_ENABLED === "false" && TRUST_PROXY_RAW === "") {
    console.warn(
      "[boot] HTTPS is off at the Node level and TRUST_PROXY is unset. Unlocking "
      + "the at-rest vault needs either a reverse proxy that forwards "
      + "X-Forwarded-Proto: https, or TRUST_PROXY=true to assert that TLS is "
      + "terminated upstream. Without one of the two the unlock endpoints will "
      + "refuse the passphrase rather than accept it over plaintext HTTP.",
    );
  }
}

module.exports = { configureTrustProxy };
