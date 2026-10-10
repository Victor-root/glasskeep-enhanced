import { useEffect, useState } from "react";

// The Android app's version, F-Droid origin and pending update, read from
// the AndroidTheme bridge when the Settings panel opens and kept current
// by the bridge's manual-check callbacks.
export default function useAndroidAppUpdate(open, isWebView) {
  // Current installed APK version, fetched once from the Android
  // bridge. Empty string when running on the web/PWA (no bridge) so
  // the "v…" line stays hidden.
  const [appVersion, setAppVersion] = useState("");
  // True when the APK was installed by F-Droid — we step out of the
  // updater UI in that case (F-Droid handles updates itself).
  const [installedFromFdroid, setInstalledFromFdroid] = useState(false);
  // Latest detected Android-app release as reported by the
  // AndroidTheme.getAvailableUpdate() bridge. The Settings card under
  // "Vérifier les mises à jour" renders when this is non-null.
  const [availableUpdate, setAvailableUpdate] = useState(null);
  useEffect(() => {
    if (!open) return;
    if (!isWebView) return;
    try {
      const v = window?.AndroidTheme?.getAppVersion?.();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the app info from the Android bridge each time the panel opens
      if (typeof v === "string" && v.length) setAppVersion(v);
    } catch { /* bridge unavailable: keep the default */ }
    try {
      const fd = window?.AndroidTheme?.isFdroidInstall?.();
      setInstalledFromFdroid(fd === true);
    } catch { /* bridge unavailable: keep the default */ }
    try {
      const json = window?.AndroidTheme?.getAvailableUpdate?.();
      if (typeof json === "string" && json.length) {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object" && parsed.version) {
          setAvailableUpdate(parsed);
          return;
        }
      }
    } catch { /* bridge or JSON failure: treated as no update below */ }
    setAvailableUpdate(null);
  }, [open, isWebView]);
  // Hook the Android-side notification callbacks for the manual check
  // (Settings → Application → "Check for updates" → check runs → bridge
  // calls back into JS with the result). Registered once for the
  // lifetime of the panel component.
  useEffect(() => {
    const onAvail = (info) => {
      if (info && typeof info === "object" && info.version) {
        setAvailableUpdate(info);
      }
    };
    const onUpToDate = () => setAvailableUpdate(null);
    if (typeof window !== "undefined") {
      window.__glasskeepUpdateAvailable = onAvail;
      window.__glasskeepUpdateUpToDate = onUpToDate;
    }
    return () => {
      if (typeof window === "undefined") return;
      if (window.__glasskeepUpdateAvailable === onAvail) {
        window.__glasskeepUpdateAvailable = undefined;
      }
      if (window.__glasskeepUpdateUpToDate === onUpToDate) {
        window.__glasskeepUpdateUpToDate = undefined;
      }
    };
  }, []);

  return { appVersion, installedFromFdroid, availableUpdate, setAvailableUpdate };
}
