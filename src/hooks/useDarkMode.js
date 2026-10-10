import { useEffect, useState } from "react";
import { setThemeColor, currentStatusBarColor } from "../utils/systemBars.js";

const MANUAL_PREF_KEY = "glass-keep-dark-mode-manual";

/**
 * Light / dark mode. Follows the system (or the Android app) until the
 * user toggles it; the manual choice lives in sessionStorage, so it lasts
 * while the app is backgrounded and resets on a full close.
 */
export default function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Legacy keys from previous iterations: dropped so old installs reset cleanly.
    localStorage.removeItem("glass-keep-dark-mode");
    localStorage.removeItem("glass-keep-dark-mode-manual");

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const manualPref = sessionStorage.getItem(MANUAL_PREF_KEY);
    // The Android WebView reports no dark scheme through matchMedia, so the
    // native shell plants window.__isAndroidDarkMode before React mounts.
    const androidDark =
      typeof window.__isAndroidDarkMode === "boolean"
        ? window.__isAndroidDarkMode
        : null;
    const savedDark = manualPref !== null
      ? manualPref === "true"
      : (androidDark != null ? androidDark : (mq?.matches ?? false));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apply the stored or system theme on mount, together with the DOM class
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
    setThemeColor(currentStatusBarColor());

    // System / bridge changes are applied without becoming a manual pref.
    const applyDark = (isDark) => {
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
      // An open note modal handles its own status bar colour.
      if (!window.__noteModalOpen) setThemeColor(currentStatusBarColor());
    };
    const hasManualPref = () => sessionStorage.getItem(MANUAL_PREF_KEY) !== null;

    // Called by the Android app, where the system preference doesn't
    // reach matchMedia.
    window.__setDarkMode = (isDark) => {
      if (hasManualPref()) return;
      applyDark(isDark);
    };

    if (!mq) return () => { delete window.__setDarkMode; };
    const onChange = (e) => {
      if (hasManualPref()) return;
      applyDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      delete window.__setDarkMode;
    };
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    sessionStorage.setItem(MANUAL_PREF_KEY, String(next));
    if (!window.__noteModalOpen) setThemeColor(currentStatusBarColor());
  };

  return { dark, toggleDark };
}
