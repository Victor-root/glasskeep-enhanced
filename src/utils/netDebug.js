// Connectivity trace for debug builds of the Android app, which expose
// window.AndroidNetDebug (android/.../NetDebug.kt): it writes to logcat
// under the GKNet tag. Everywhere else (release APK, browsers) the bridge
// is absent and these do nothing.

const describe = (part) => {
  if (part instanceof Error) return `${part.name}: ${part.message}`;
  if (part && typeof part === "object") {
    try { return JSON.stringify(part); } catch (_) { return String(part); }
  }
  return String(part);
};

export function netLog(...parts) {
  const bridge = typeof window !== "undefined" ? window.AndroidNetDebug : null;
  if (!bridge) return;
  try { bridge.log(parts.map(describe).join(" ")); } catch (_) {}
}

// Asks the app to reach the server outside the WebView and log the result.
export function netProbe(reason) {
  const bridge = typeof window !== "undefined" ? window.AndroidNetDebug : null;
  if (!bridge) return;
  try { bridge.probe(reason); } catch (_) {}
}
