// Decodes a base64url string (WebAuthn PRF salts, VAPID public keys) to
// the Uint8Array the browser APIs expect.
export function base64UrlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - b64.length % 4) : "";
  return Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
}
