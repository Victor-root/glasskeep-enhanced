import { useCallback, useEffect, useRef, useState } from "react";
import { api, getAuth } from "../utils/api.js";
import { syncLanguageFromServer } from "../i18n";
import { setShellTheme, isValidShellTheme } from "../theme/shellTheme.js";
import { applyTaskStrikeClass, getStoredTaskStrike, TASK_STRIKE_EVENT } from "../theme/taskListStrike.js";
import { applyTypographyPresets } from "../utils/typographyPresets.js";
import { PREFERENCES, clampSidebarBreakpoint } from "../utils/userPreferences.js";

const patchSettings = (token, body) =>
  api("/user/settings", { method: "PATCH", token, body }).catch(() => {});

/**
 * Mirrors one preference to localStorage and to the server whenever it
 * changes locally. No PATCH before the server values have been loaded, nor
 * for a change that came from the server itself (echo suppression: the
 * live-sync handler marks the keys it applies).
 *
 * `patchOnTokenChange` keeps the historical behaviour of the preferences
 * whose PATCH also re-ran when the session token changed.
 */
function useSyncedPreference(key, value, sync, { patchOnTokenChange = false, debounceMs = 0, onChange, persistLocally = true } = {}) {
  const { token, loadedRef, remoteKeysRef } = sync;
  const timerRef = useRef(null);
  const tokenDep = patchOnTokenChange ? token : null;
  useEffect(() => {
    if (persistLocally) PREFERENCES[key].save(value);
    onChange?.(value);
    if (!loadedRef.current) return;
    if (remoteKeysRef.current.has(key)) {
      remoteKeysRef.current.delete(key);
      return;
    }
    if (!token) return;
    if (debounceMs > 0) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => patchSettings(token, { [key]: value }), debounceMs);
    } else {
      patchSettings(token, { [key]: value });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- PATCH when the preference changes (and on token change only where it always did)
  }, [value, tokenDep]);
}

/**
 * UI preferences that follow the user across devices: local cache at
 * boot, server values on login, outbound PATCH on local change, and
 * applyRemoteUserSettings for the live `user_settings_updated` event.
 */
export default function useUserPreferences(token) {
  const [alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide] = useState(PREFERENCES.alwaysShowSidebarOnWide.read);
  const [sidebarBreakpoint, setSidebarBreakpointState] = useState(PREFERENCES.sidebarBreakpoint.read);
  const setSidebarBreakpoint = useCallback((value) => {
    setSidebarBreakpointState(clampSidebarBreakpoint(value));
  }, []);
  const [readModeEnabled, setReadModeEnabled] = useState(PREFERENCES.readModeEnabled.read);
  const [sidebarWidth, setSidebarWidth] = useState(PREFERENCES.sidebarWidth.read);
  const [floatingCardsEnabled, setFloatingCardsEnabled] = useState(PREFERENCES.floatingCardsEnabled.read);
  const [checklistInsertPosition, setChecklistInsertPosition] = useState(PREFERENCES.checklistInsertPosition.read);
  const [checklistRemoveSectionBehavior, setChecklistRemoveSectionBehavior] = useState(PREFERENCES.checklistRemoveSectionBehavior.read);
  const [edgeToEdgeLandscape, setEdgeToEdgeLandscape] = useState(PREFERENCES.edgeToEdgeLandscape.read);
  const [edgeToEdgePortrait, setEdgeToEdgePortrait] = useState(PREFERENCES.edgeToEdgePortrait.read);
  const [editorToolbarMode, setEditorToolbarMode] = useState(PREFERENCES.editorToolbarMode.read);
  const [pasteMode, setPasteMode] = useState(PREFERENCES.pasteMode.read);
  const [notificationsPosition, setNotificationsPosition] = useState(PREFERENCES.notificationsPosition.read);
  const [notificationsPositionMobile, setNotificationsPositionMobile] = useState(PREFERENCES.notificationsPositionMobile.read);
  const [notificationsSound, setNotificationsSound] = useState(PREFERENCES.notificationsSound.read);
  const [notificationsSoundTypes, setNotificationsSoundTypes] = useState(PREFERENCES.notificationsSoundTypes.read);
  const [notificationsFilterTypes, setNotificationsFilterTypes] = useState(PREFERENCES.notificationsFilterTypes.read);
  const [notificationsDuration, setNotificationsDuration] = useState(PREFERENCES.notificationsDuration.read);
  const [typographyPresets, setTypographyPresets] = useState(PREFERENCES.typographyPresets.read);
  const [reminderTimeChips, setReminderTimeChips] = useState(PREFERENCES.reminderTimeChips.read);
  const [listView, setListView] = useState(PREFERENCES.viewMode.read);
  const [qrQuickEnabled, setQrQuickEnabledState] = useState(PREFERENCES.qrQuickEnabled.read);

  // Typography presets as CSS variables on :root, so the editor and the
  // card previews pick them up instantly.
  useEffect(() => {
    applyTypographyPresets(typographyPresets);
  }, [typographyPresets]);

  const handleReminderTimeChipsChange = (chips) => {
    setReminderTimeChips(chips);
    patchSettings(token, { reminderTimeChips: chips });
  };

  const setQrQuickEnabled = useCallback((next) => {
    const v = !!next;
    setQrQuickEnabledState(v);
    PREFERENCES.qrQuickEnabled.save(v);
    // The token is read from the current auth: before login the choice
    // just stays local.
    try {
      const tk = getAuth()?.token;
      if (tk) patchSettings(tk, { qrQuickEnabled: v });
    } catch { /* auth helper threw: non-fatal */ }
  }, []);

  const loadedRef = useRef(false);
  // Keys whose next change came from the server: the matching PATCH
  // effect consumes its key instead of echoing the value back.
  const remoteKeysRef = useRef(new Set());
  const sync = { token, loadedRef, remoteKeysRef };

  const setters = {
    alwaysShowSidebarOnWide: setAlwaysShowSidebarOnWide,
    sidebarBreakpoint: setSidebarBreakpoint,
    readModeEnabled: setReadModeEnabled,
    sidebarWidth: setSidebarWidth,
    floatingCardsEnabled: setFloatingCardsEnabled,
    checklistInsertPosition: setChecklistInsertPosition,
    checklistRemoveSectionBehavior: setChecklistRemoveSectionBehavior,
    edgeToEdgeLandscape: setEdgeToEdgeLandscape,
    edgeToEdgePortrait: setEdgeToEdgePortrait,
    editorToolbarMode: setEditorToolbarMode,
    pasteMode: setPasteMode,
    notificationsPosition: setNotificationsPosition,
    notificationsPositionMobile: setNotificationsPositionMobile,
    notificationsSound: setNotificationsSound,
    notificationsSoundTypes: setNotificationsSoundTypes,
    notificationsFilterTypes: setNotificationsFilterTypes,
    notificationsDuration: setNotificationsDuration,
    typographyPresets: setTypographyPresets,
    viewMode: setListView,
    qrQuickEnabled: setQrQuickEnabledState,
    reminderTimeChips: setReminderTimeChips,
    taskStrikeEnabled: applyTaskStrikeClass,
  };
  // Changed directly by a callback that PATCHes itself, so there is no
  // outbound effect to silence for them.
  const SELF_PATCHING = new Set(["qrQuickEnabled", "reminderTimeChips"]);

  // Applies every acceptable value of a server payload; returns the keys
  // applied.
  const applyServerValues = (settings, keys) => {
    const applied = [];
    for (const key of keys) {
      if (!(key in setters)) continue;
      const value = PREFERENCES[key].parse(settings[key]);
      if (value === undefined) continue;
      setters[key](value);
      PREFERENCES[key].save(value);
      applied.push(key);
    }
    return applied;
  };

  useSyncedPreference("viewMode", listView, sync, { patchOnTokenChange: true });
  const onToggleViewMode = () => setListView((v) => !v);

  // Mirrored as React state so its PATCH effect fires on change; the class
  // toggle and localStorage write live in taskListStrike.js.
  const [taskStrikeEnabled, setTaskStrikeEnabled] = useState(() => getStoredTaskStrike());
  useEffect(() => {
    const onStrike = (e) => setTaskStrikeEnabled(e.detail);
    document.addEventListener(TASK_STRIKE_EVENT, onStrike);
    return () => document.removeEventListener(TASK_STRIKE_EVENT, onStrike);
  }, []);

  // Server values on login. The server is the source of truth for the
  // workspace theme too (the boot script already used the local cache).
  useEffect(() => {
    if (!token) return;
    loadedRef.current = false;
    // Hide the sidebar until the server preference has loaded.
    try {
      if (localStorage.getItem("sidebarAlwaysVisible") === null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hide the sidebar until the server preference has loaded
        setAlwaysShowSidebarOnWide(null);
      }
    } catch { /* storage unavailable: keep the current visibility */ }
    (async () => {
      try {
        const settings = await api("/user/settings", { token });
        // No server setting yet (new user): show the sidebar.
        if (typeof settings?.alwaysShowSidebarOnWide !== "boolean") {
          setAlwaysShowSidebarOnWide(true);
        }
        if (settings) applyServerValues(settings, Object.keys(PREFERENCES));
        if (settings && isValidShellTheme(settings.shellTheme)) {
          setShellTheme(settings.shellTheme);
        }
        if (typeof settings?.language === "string") {
          if (syncLanguageFromServer(settings.language)) window.location.reload();
        }
      } catch {
        // Network error: show the sidebar unless it is already decided.
        setAlwaysShowSidebarOnWide((prev) => (prev === null ? true : prev));
      } finally {
        loadedRef.current = true;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per session token
  }, [token]);

  useSyncedPreference("alwaysShowSidebarOnWide", alwaysShowSidebarOnWide, sync);
  useSyncedPreference("sidebarBreakpoint", sidebarBreakpoint, sync, { patchOnTokenChange: true });
  useSyncedPreference("readModeEnabled", readModeEnabled, sync, { patchOnTokenChange: true });
  useSyncedPreference("floatingCardsEnabled", floatingCardsEnabled, sync);
  // Changes on every drag pixel: PATCH only once it settles.
  useSyncedPreference("sidebarWidth", sidebarWidth, sync, { patchOnTokenChange: true, debounceMs: 600 });
  useSyncedPreference("taskStrikeEnabled", taskStrikeEnabled, sync, { patchOnTokenChange: true, persistLocally: false });
  useSyncedPreference("checklistInsertPosition", checklistInsertPosition, sync);
  useSyncedPreference("checklistRemoveSectionBehavior", checklistRemoveSectionBehavior, sync);
  useSyncedPreference("editorToolbarMode", editorToolbarMode, sync);
  useSyncedPreference("pasteMode", pasteMode, sync);
  useSyncedPreference("notificationsPosition", notificationsPosition, sync);
  useSyncedPreference("notificationsPositionMobile", notificationsPositionMobile, sync);
  useSyncedPreference("notificationsSound", notificationsSound, sync);
  useSyncedPreference("notificationsSoundTypes", notificationsSoundTypes, sync);
  useSyncedPreference("notificationsFilterTypes", notificationsFilterTypes, sync);
  useSyncedPreference("notificationsDuration", notificationsDuration, sync);
  useSyncedPreference("edgeToEdgeLandscape", edgeToEdgeLandscape, sync, {
    onChange: (v) => { document.body.style.paddingLeft = v ? "" : "var(--safe-left)"; },
  });
  // The Android app owns the system bars and marks <html> with
  // data-gk-edge-to-edge while it applies.
  useSyncedPreference("edgeToEdgePortrait", edgeToEdgePortrait, sync, {
    onChange: (v) => {
      try { window.AndroidTheme?.setEdgeToEdgePortrait?.(v); } catch { /* Android bridge best-effort */ }
    },
  });
  useSyncedPreference("typographyPresets", typographyPresets, sync);

  // Live sync from another session of the same user. The applied keys are
  // marked so their PATCH effect doesn't echo them back; the set is
  // replaced (not merged) so a key whose value didn't change can't leak
  // into a future local change.
  const applyRemoteUserSettings = (settings) => {
    if (!settings || typeof settings !== "object") return;
    const keys = Object.keys(settings);
    remoteKeysRef.current = new Set();
    for (const key of applyServerValues(settings, keys)) {
      if (!SELF_PATCHING.has(key)) remoteKeysRef.current.add(key);
    }
    // The theme picker PATCHes the server directly: nothing to silence.
    if (keys.includes("shellTheme") && isValidShellTheme(settings.shellTheme)) {
      setShellTheme(settings.shellTheme);
    }
  };

  return {
    alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide,
    sidebarBreakpoint, setSidebarBreakpoint,
    readModeEnabled, setReadModeEnabled,
    sidebarWidth, setSidebarWidth,
    floatingCardsEnabled, setFloatingCardsEnabled,
    checklistInsertPosition, setChecklistInsertPosition,
    checklistRemoveSectionBehavior, setChecklistRemoveSectionBehavior,
    edgeToEdgeLandscape, setEdgeToEdgeLandscape,
    edgeToEdgePortrait, setEdgeToEdgePortrait,
    editorToolbarMode, setEditorToolbarMode,
    pasteMode, setPasteMode,
    notificationsPosition, setNotificationsPosition,
    notificationsPositionMobile, setNotificationsPositionMobile,
    notificationsSound, setNotificationsSound,
    notificationsSoundTypes, setNotificationsSoundTypes,
    notificationsFilterTypes, setNotificationsFilterTypes,
    notificationsDuration, setNotificationsDuration,
    typographyPresets, setTypographyPresets,
    reminderTimeChips, handleReminderTimeChipsChange,
    listView, onToggleViewMode,
    qrQuickEnabled, setQrQuickEnabled,
    applyRemoteUserSettings,
  };
}
