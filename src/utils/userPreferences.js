// UI preferences that follow the user across devices: each one is cached
// in localStorage (read synchronously at boot) and mirrored to
// /api/user/settings under its key below.
import {
  DEFAULT_TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_STORAGE_KEY,
  normalizeTypographyPresets,
} from "./typographyPresets.js";

export const NOTIFICATION_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
const NOTIFICATION_DURATIONS = [5000, 10000, 20000, 30000];

// Sound buckets (see utils/notificationCategories.js).
const SOUND_TYPE_KEYS = ["share", "access", "success", "warning", "error", "info"];
// Display-filter buckets.
const FILTER_TYPE_KEYS = ["federation", "share", "access", "reminder", "success", "warning", "error", "info"];

const allEnabled = (keys) => Object.fromEntries(keys.map((k) => [k, true]));

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable: preference not persisted */ }
}

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

const isBoolean = (v) => (typeof v === "boolean" ? v : undefined);
const oneOf = (allowed) => (v) => (allowed.includes(v) ? v : undefined);
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function readStoredFlags(key, keys) {
  const defaults = allEnabled(keys);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) return { ...defaults, ...parsed };
    }
  } catch { /* storage unavailable or invalid value: use the default */ }
  return defaults;
}

// A server value for a set of flags: every known bucket, enabled unless
// explicitly false.
const parseFlags = (keys) => (v) =>
  isPlainObject(v) ? Object.fromEntries(keys.map((k) => [k, v[k] !== false])) : undefined;

export const clampSidebarBreakpoint = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 600 && n <= 3000 ? Math.round(n) : 1280;
};

/**
 * One entry per synced preference, keyed by its /api/user/settings key:
 *  - read():   the boot value from localStorage (or the default)
 *  - parse(v): the value to apply from a server payload, or undefined
 *              when the payload value is not acceptable
 *  - save(v):  the localStorage write for a value
 *  - toServer(v): the value PATCHed, when it differs from the state
 */
export const PREFERENCES = {
  // null = not known yet: the sidebar stays hidden until the server answers.
  alwaysShowSidebarOnWide: {
    read: () => {
      const v = stored("sidebarAlwaysVisible");
      return v !== null ? v === "true" : null;
    },
    parse: isBoolean,
    save: (v) => store("sidebarAlwaysVisible", String(v)),
  },
  sidebarBreakpoint: {
    read: () => {
      const v = stored("sidebarBreakpoint");
      return clampSidebarBreakpoint(v !== null ? Number(v) : NaN);
    },
    parse: (v) => (Number.isFinite(Number(v)) ? v : undefined),
    save: (v) => store("sidebarBreakpoint", String(Number(v))),
  },
  readModeEnabled: {
    read: () => {
      const v = stored("readModeEnabled");
      return v !== null ? v === "true" : true;
    },
    parse: isBoolean,
    save: (v) => store("readModeEnabled", String(v)),
  },
  sidebarWidth: {
    read: () => parseInt(stored("sidebarWidth")) || 288,
    parse: (v) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(200, Math.min(600, Math.round(v)))
        : undefined,
    save: (v) => store("sidebarWidth", String(v)),
  },
  // Default: enabled on desktop (pointer:fine), disabled on mobile/tablet.
  floatingCardsEnabled: {
    read: () => {
      try {
        const v = localStorage.getItem("floatingCardsEnabled");
        if (v !== null) return v === "true";
        return window.matchMedia?.("(pointer: fine)").matches ?? true;
      } catch {
        return true;
      }
    },
    parse: isBoolean,
    save: (v) => store("floatingCardsEnabled", String(v)),
  },
  checklistInsertPosition: {
    read: () => (stored("checklistInsertPosition") === "bottom" ? "bottom" : "top"),
    parse: (v) => v || undefined,
    save: (v) => store("checklistInsertPosition", v),
  },
  // "cascade" also deletes a removed section's items, "keep" moves them
  // to the default section.
  checklistRemoveSectionBehavior: {
    read: () => (stored("checklistRemoveSectionBehavior") === "keep" ? "keep" : "cascade"),
    parse: oneOf(["keep", "cascade"]),
    save: (v) => store("checklistRemoveSectionBehavior", v),
  },
  // Extend content under the status bar on the left in landscape.
  edgeToEdgeLandscape: {
    read: () => {
      const v = stored("edgeToEdgeLandscape");
      return v === null ? true : v === "true";
    },
    parse: isBoolean,
    save: (v) => store("edgeToEdgeLandscape", String(v)),
  },
  // Android app: transparent system bars, the notes scroll behind them.
  edgeToEdgePortrait: {
    read: () => stored("edgeToEdgePortrait") === "true",
    parse: isBoolean,
    save: (v) => store("edgeToEdgePortrait", String(v)),
  },
  editorToolbarMode: {
    read: () => (stored("editorToolbarMode") === "advanced" ? "advanced" : "simple"),
    parse: oneOf(["simple", "advanced"]),
    save: (v) => store("editorToolbarMode", v),
  },
  // Default Ctrl+V in the rich-text editor: "rich" keeps the clipboard's
  // formatting, "plain" strips it. Ctrl+Shift+V is always plain.
  pasteMode: {
    read: () => (stored("pasteMode") === "plain" ? "plain" : "rich"),
    parse: oneOf(["rich", "plain"]),
    save: (v) => store("pasteMode", v),
  },
  notificationsPosition: {
    read: () => {
      const v = stored("notificationsPosition");
      return NOTIFICATION_POSITIONS.includes(v) ? v : "top-center";
    },
    parse: (v) => (typeof v === "string" && NOTIFICATION_POSITIONS.includes(v) ? v : undefined),
    save: (v) => store("notificationsPosition", v),
  },
  // Mobile-only position, a separate key so phones and desktops keep
  // their own placement.
  notificationsPositionMobile: {
    read: () => {
      const v = stored("notificationsPositionMobile");
      return v === "top" || v === "bottom" ? v : "bottom";
    },
    parse: oneOf(["top", "bottom"]),
    save: (v) => store("notificationsPositionMobile", v),
  },
  // Opt-in: a fresh install doesn't ding.
  notificationsSound: {
    read: () => {
      const v = stored("notificationsSound");
      if (v === "1" || v === "true") return true;
      return false;
    },
    parse: isBoolean,
    save: (v) => store("notificationsSound", v ? "1" : "0"),
  },
  notificationsSoundTypes: {
    read: () => readStoredFlags("notificationsSoundTypes", SOUND_TYPE_KEYS),
    parse: parseFlags(SOUND_TYPE_KEYS),
    save: (v) => store("notificationsSoundTypes", JSON.stringify(v)),
  },
  notificationsFilterTypes: {
    read: () => readStoredFlags("notificationsFilterTypes", FILTER_TYPE_KEYS),
    parse: parseFlags(FILTER_TYPE_KEYS),
    save: (v) => store("notificationsFilterTypes", JSON.stringify(v)),
  },
  // Auto-dismiss delay in ms, or null for "persistent".
  notificationsDuration: {
    read: () => {
      const v = stored("notificationsDuration");
      if (v === "null" || v === "persistent") return null;
      const n = Number(v);
      return NOTIFICATION_DURATIONS.includes(n) ? n : 10000;
    },
    parse: (v) =>
      v === null || (typeof v === "number" && NOTIFICATION_DURATIONS.includes(v)) ? v : undefined,
    save: (v) => store("notificationsDuration", v == null ? "null" : String(v)),
  },
  typographyPresets: {
    read: () => {
      try {
        const v = localStorage.getItem(TYPOGRAPHY_STORAGE_KEY);
        if (v) return normalizeTypographyPresets(JSON.parse(v));
      } catch { /* storage unavailable or invalid value: use the default */ }
      return { ...DEFAULT_TYPOGRAPHY_PRESETS };
    },
    parse: (v) => (v && typeof v === "object" ? normalizeTypographyPresets(v) : undefined),
    save: (v) => store(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(v)),
  },
  // Stored as true = list, false = grid.
  viewMode: {
    read: () => stored("viewMode") === "list",
    parse: (v) => (v === "list" || v === "grid" ? v === "list" : undefined),
    save: (v) => store("viewMode", v ? "list" : "grid"),
    toServer: (v) => (v ? "list" : "grid"),
  },
  qrQuickEnabled: {
    read: () => stored("glass-keep-qr-quick") === "1",
    parse: isBoolean,
    save: (v) => store("glass-keep-qr-quick", v ? "1" : "0"),
  },
  reminderTimeChips: {
    // null until loaded: the reminder picker falls back to its defaults.
    read: () => null,
    parse: (v) => (Array.isArray(v) && v.length > 0 ? v : undefined),
    save: () => {},
  },
  // The state follows the DOM class (theme/taskListStrike.js), so applying
  // a server value goes through applyTaskStrikeClass instead of a setter.
  taskStrikeEnabled: {
    parse: isBoolean,
    save: (v) => store("gk:taskStrikeChecked", v ? "1" : "0"),
  },
};
