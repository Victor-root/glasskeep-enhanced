// src/auth/deviceLinkClient.js
//
// Thin client for the cross-device QR sign-in flow (see
// server/routes/deviceLinkRoutes.js for the protocol). Two callers:
//
//   - the PC's login screen, which creates a challenge, encodes the
//     token into a QR code, and polls until the phone approves;
//   - the phone's in-app scanner, which fetches the challenge info
//     for the confirmation dialog and then approves / rejects.
//
// Kept as a flat module of async functions so the two UI components
// (QrLoginModal and QrScannerModal) stay focused on rendering rather
// than fetch plumbing.

const API = "/api";

function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function postJSON(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data || {};
}

async function getJSON(path, token) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(token) });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data || {};
}

// ── PC side ──────────────────────────────────────────────────────────

/** Ask the server for a new device-link challenge. Returns `{ token,
 *  expiresIn, expiresAt, pollIntervalMs }`. The PC encodes `token`
 *  (along with the current origin) into the QR shown on screen. */
export async function createDeviceLink() {
  return await postJSON("/device-link/create", {});
}

/** Single poll. Returns `{ status, token?, user? }`. The shape
 *  callers care about:
 *    - `pending`  → keep polling
 *    - `approved` → response also carries `token` (JWT) + `user`
 *    - `expired`  → drop the QR, ask the user to refresh
 *    - `rejected` → phone explicitly said no
 *    - `consumed` (HTTP 410) → another poller already picked it up;
 *      treated like `expired` from a UX standpoint. */
export async function pollDeviceLink(linkToken) {
  return await getJSON(
    `/device-link/poll?token=${encodeURIComponent(linkToken)}`,
  );
}

// ── Phone side ───────────────────────────────────────────────────────

/** Fetch what the server knows about a scanned challenge — the PC's
 *  user agent + a masked IP — so the user can sanity-check the
 *  confirmation dialog. Requires the phone to be authenticated. */
export async function getDeviceLinkInfo(linkToken, authToken) {
  return await getJSON(
    `/device-link/info?token=${encodeURIComponent(linkToken)}`,
    authToken,
  );
}

/** Approve a challenge on the phone's behalf. After this call the PC's
 *  next poll will mint a JWT for the phone's currently-signed-in
 *  user. */
export async function approveDeviceLink(linkToken, authToken) {
  return await postJSON(
    "/device-link/approve",
    { token: linkToken },
    authToken,
  );
}

/** Politely reject a challenge — flips its status to "rejected" so
 *  the PC's poll surfaces the cancellation immediately instead of
 *  having to wait for the expiry timer. */
export async function rejectDeviceLink(linkToken, authToken) {
  return await postJSON(
    "/device-link/reject",
    { token: linkToken },
    authToken,
  );
}

// ── Shared helpers ───────────────────────────────────────────────────

/** Build the URL we encode into the QR. Including the origin lets the
 *  phone refuse to approve QRs that belong to a different GlassKeep
 *  instance (the user might have scanned a phishing screen). */
export function buildLinkUrl(linkToken, origin = window.location.origin) {
  return `${origin.replace(/\/$/, "")}/#/device-link/${encodeURIComponent(linkToken)}`;
}

/** Parse a string scanned out of a QR. Returns `{ token, origin }`
 *  when the input matches `<origin>/#/device-link/<token>`; `null`
 *  otherwise. The QR could in theory contain anything (the camera
 *  doesn't know what it's looking at), so we treat it like untrusted
 *  user input. */
export function parseLinkUrl(scanned) {
  if (typeof scanned !== "string") return null;
  const trimmed = scanned.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const m = u.hash.match(/^#\/device-link\/([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    return { token: decodeURIComponent(m[1]), origin: u.origin };
  } catch {
    return null;
  }
}
