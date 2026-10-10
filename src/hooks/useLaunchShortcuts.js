import { useEffect } from "react";

// Removes a consumed launch parameter from the URL, so a refresh doesn't
// replay it.
function dropLaunchParam(name) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(name);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch { /* non-fatal */ }
}

/**
 * Android launcher shortcuts, which open the app with a query parameter:
 * ?qr=open ("Scan PC login") and ?new=<type> (new text note / list /
 * audio note). Read once at boot, and only acted on with a session:
 * otherwise the modal would mount over the login screen with no usable
 * token. The session is restored synchronously, so the first render
 * already has it.
 */
export default function useLaunchShortcuts({
  token,
  openQrScanner,
  handleDirectText,
  handleDirectChecklist,
  handleDirectAudio,
}) {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("qr") === "open") {
        dropLaunchParam("qr");
        if (token) openQrScanner();
      }
    } catch { /* ignore */ }
    try {
      const params = new URLSearchParams(window.location.search);
      const newType = params.get("new");
      if (!newType) return;
      dropLaunchParam("new");
      if (!token) return;
      const handlers = {
        text: handleDirectText,
        checklist: handleDirectChecklist,
        audio: handleDirectAudio,
      };
      handlers[newType]?.();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
