import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { askAI } from "./ai";
import { marked as markedParser } from "marked";
import DOMPurify from "dompurify";
import DrawingCanvas from "./DrawingCanvas";
import { t } from "./i18n";
import Masonry from "react-masonry-css";
import SyncStatusIcon from "./sync/SyncStatusIcon.jsx";
import { SyncEngine } from "./sync/syncEngine.js";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNote as idbPutNote,
  putNotes as idbPutNotes,
  deleteNote as idbDeleteNote,
  enqueue as idbEnqueue,
  getQueueStats,
  hasPendingChanges,
  clearQueue as idbClearQueue,
  clearNotesForUser as idbClearNotesForUser,
} from "./sync/localDb.js";

function trColorName(name) {
  const v = String(name || "").trim().toLowerCase();
  const map = {
    "default": "colorDefault",
    "red": "colorRed",
    "orange": "colorOrange",
    "yellow": "colorYellow",
    "green": "colorGreen",
    "teal": "colorTeal",
    "cyan": "colorCyan",
    "blue": "colorBlue",
    "dark blue": "colorDarkBlue",
    "darkblue": "colorDarkBlue",
    "indigo": "colorIndigo",
    "purple": "colorPurple",
    "deep purple": "colorDeepPurple",
    "deeppurple": "colorDeepPurple",
    "pink": "colorPink",
    "brown": "colorBrown",
    "gray": "colorGray",
    "grey": "colorGray",
    "light gray": "colorLightGray",
    "light grey": "colorLightGray",
    "dark gray": "colorDarkGray",
    "dark grey": "colorDarkGray",
    "black": "colorBlack",
    "white": "colorWhite",
    "peach": "colorPeach",
    "sage": "colorSage",
    "mint": "colorMint",
    "sky": "colorSky",
    "sand": "colorSand",
    "mauve": "colorMauve",
  };
  return map[v] ? t(map[v]) : name;
}


// Ensure we can call marked.parse(...)
const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

/** ---------- Secure Markdown Renderer ---------- */
// Allowlist of tags produced by marked for standard markdown.
// SVG, style, script and all event-handler attributes are intentionally excluded.
const _PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a", "b", "strong", "i", "em", "del", "s", "u",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote",
    "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    // "img" intentionally excluded: prevents external image loading (tracking / IP leak)
    "span", "div",
  ],
  ALLOWED_ATTR: ["href", "title", "class", "target", "rel"],
  ALLOW_DATA_ATTR: false,
};
const renderSafeMarkdown = (md) => {
  try {
    const raw = marked.parse(md || "");
    return DOMPurify.sanitize(raw, _PURIFY_CONFIG);
  } catch {
    return "";
  }
};

/** ---------- API Helpers ---------- */
const API_BASE = "/api";
const AUTH_KEY = "glass-keep-auth";

const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch (e) {
    return null;
  }
};
const setAuth = (obj) => {
  if (obj) localStorage.setItem(AUTH_KEY, JSON.stringify(obj));
  else localStorage.removeItem(AUTH_KEY);
};
async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout (self-hosted LAN)

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    // Handle token expiration (401 Unauthorized)
    if (res.status === 401) {
      // Clear auth from localStorage
      try {
        localStorage.removeItem(AUTH_KEY);
      } catch (e) {
        console.error("Error clearing auth:", e);
      }

      // Dispatch a custom event so the app can handle it
      window.dispatchEvent(new CustomEvent("auth-expired"));

      const err = new Error(
        data?.error || t("sessionExpired"),
      );
      err.status = res.status;
      err.isAuthError = true;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (error.name === "AbortError") {
      const err = new Error(t("requestTimeout"));
      err.status = 408;
      err.isNetworkError = true;
      throw err;
    }

    // Re-throw auth errors as-is
    if (error.isAuthError) {
      throw error;
    }

    // Handle fetch failures (network errors, CORS, etc.)
    if (error instanceof TypeError && error.message.includes("fetch")) {
      const err = new Error(t("networkError"));
      err.status = 0;
      err.isNetworkError = true;
      throw err;
    }

    // Re-throw other errors
    throw error;
  }
}

/** ---------- Colors ---------- */
/* Added 6 pastel boho colors + two-line picker layout via grid-cols-6 */
const LIGHT_COLORS = {
  default: "rgba(255, 255, 255, 0.85)",
  red: "rgba(242, 139, 130, 0.85)",
  yellow: "rgba(255, 214, 51, 0.85)",
  green: "rgba(124, 233, 157, 0.85)",
  blue: "rgba(120, 180, 255, 0.85)",
  purple: "rgba(180, 160, 255, 0.85)",

  peach: "rgba(249, 160, 140, 0.85)",
  sage: "rgba(167, 205, 170, 0.85)",
  mint: "rgba(140, 225, 190, 0.85)",
  sky: "rgba(150, 210, 255, 0.85)",
  sand: "rgba(230, 200, 150, 0.85)",
  mauve: "rgba(210, 175, 218, 0.85)",
};
const DARK_COLORS = {
  default: "rgba(40, 40, 40, 0.85)",
  red: "rgba(140, 36, 36, 0.85)",
  yellow: "rgba(140, 110, 25, 0.85)",
  green: "rgba(28, 110, 58, 0.85)",
  blue: "rgba(35, 72, 165, 0.85)",
  purple: "rgba(82, 38, 140, 0.85)",

  peach: "rgba(170, 80, 62, 0.85)",
  sage: "rgba(55, 90, 65, 0.85)",
  mint: "rgba(35, 108, 82, 0.85)",
  sky: "rgba(35, 95, 145, 0.85)",
  sand: "rgba(135, 105, 60, 0.85)",
  mauve: "rgba(100, 72, 115, 0.85)",
};
const COLOR_ORDER = [
  "default",
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "peach",
  "sage",
  "mint",
  "sky",
  "sand",
  "mauve",
];
const solid = (rgba) =>
  typeof rgba === "string" ? rgba.replace("0.6", "1") : rgba;
const bgFor = (colorKey, dark) =>
  (dark ? DARK_COLORS : LIGHT_COLORS)[colorKey] ||
  (dark ? DARK_COLORS.default : LIGHT_COLORS.default);

/** ---------- Modal light boost ---------- */
const parseRGBA = (str) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/.exec(
    str || "",
  );
  if (!m) return { r: 255, g: 255, b: 255, a: 0.85 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
};
const mixWithWhite = (rgbaStr, whiteRatio = 0.8, outAlpha = 0.92) => {
  const { r, g, b } = parseRGBA(rgbaStr);
  const rr = Math.round(255 * whiteRatio + r * (1 - whiteRatio));
  const gg = Math.round(255 * whiteRatio + g * (1 - whiteRatio));
  const bb = Math.round(255 * whiteRatio + b * (1 - whiteRatio));
  return `rgba(${rr}, ${gg}, ${bb}, ${outAlpha})`;
};
const modalBgFor = (colorKey, dark, opaque = false) => {
  const base = bgFor(colorKey, dark);
  if (dark) return base.replace(/,\s*[\d.]+\)$/, ', 1)');
  return mixWithWhite(solid(base), 0.8, 1);
};

const scrollColorsFor = (colorKey, dark) => {
  if (!colorKey || colorKey === "default")
    return dark ? { thumb: "#7c3aed", track: "#3b0764" } : { thumb: "#a78bfa", track: "#e3d0ff" };
  const base = solid(bgFor(colorKey, dark));
  if (dark) {
    const { r, g, b } = parseRGBA(base);
    return {
      thumb: `rgba(${r},${g},${b},0.9)`,
      track: `rgba(${Math.round(r*0.3)},${Math.round(g*0.3)},${Math.round(b*0.3)},0.8)`,
    };
  }
  return { thumb: mixWithWhite(base, 0.1, 0.85), track: mixWithWhite(base, 0.55, 0.4) };
};

/** ---------- Special tag filters ---------- */
const ALL_IMAGES = "__ALL_IMAGES__";

/** ---------- Icons ---------- */
const PinOutline = () => (
  <svg
    className="w-5 h-5"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);
const PinFilled = () => (
  <svg
    className="w-5 h-5"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);
const Trash = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.109 1.02.17M4.772 5.79c.338-.061.678-.118 1.02-.17m12.456 0L18.16 19.24A2.25 2.25 0 0 1 15.916 21.5H8.084A2.25 2.25 0 0 1 5.84 19.24L4.772 5.79m12.456 0a48.108 48.108 0 0 0-12.456 0M10 5V4a2 2 0 1 1 4 0v1"
    />
  </svg>
);
const Sun = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <line x1="12" y1="2" x2="12" y2="4" strokeWidth="2" strokeLinecap="round" />
    <line
      x1="12"
      y1="20"
      x2="12"
      y2="22"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="20"
      y1="12"
      x2="22"
      y2="12"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line x1="2" y1="12" x2="4" y2="12" strokeWidth="2" strokeLinecap="round" />
    <line
      x1="17.657"
      y1="6.343"
      x2="18.364"
      y2="5.636"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="5.636"
      y1="18.364"
      x2="6.343"
      y2="17.657"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="17.657"
      y1="17.657"
      x2="18.364"
      y2="18.364"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="5.636"
      y1="5.636"
      x2="6.343"
      y2="6.343"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="12" r="4" strokeWidth="2" />
  </svg>
);
const Moon = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9 9 0 008.354-5.646z"
    />
  </svg>
);
const ImageIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    <path d="M8 11l2.5 3 3.5-4 4 5" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);
const GalleryIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <circle cx="6" cy="6" r="1" fill="currentColor" />
    <circle cx="16" cy="6" r="1" fill="currentColor" />
    <circle cx="6" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);
const CloseIcon = () => (
  <svg
    className="w-6 h-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 6l12 12M18 6l-12 12"
    />
  </svg>
);
const DownloadIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7 10l5 5m0 0l5-5m-5 5V3"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 21h14" />
  </svg>
);
const ArrowLeft = () => (
  <svg
    className="w-6 h-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const ArrowRight = () => (
  <svg
    className="w-6 h-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const SearchIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const Kebab = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);
const Hamburger = () => (
  <svg
    className="w-6 h-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
// Formatting "Aa" icon
const FormatIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path strokeLinecap="round" d="M3 19h18M10 17V7l-3 8m10 2V7l-3 8" />
  </svg>
);

// Settings icon
const SettingsIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

// Grid view icon
const GridIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
    />
  </svg>
);

// List view icon
const ListIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 6h16M4 10h16M4 14h16M4 18h16"
    />
  </svg>
);

// Sun icon (light mode)
const SunIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="5" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
    />
  </svg>
);

const Sparkles = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

// Moon icon (dark mode)
const MoonIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9 9 0 008.354-5.646z"
    />
  </svg>
);

// Multi-select icon (checkbox)
const CheckSquareIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
    />
  </svg>
);

// Admin/Shield icon
const ShieldIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

// Sign out/Logout icon
const LogOutIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

// Floating cards toggle icon — Layers (Lucide)
const FloatingCardsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
);

// Archive icon
const ArchiveIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
    />
  </svg>
);

// Pin icon (using the same icon as individual notes)
const PinIcon = () => (
  <svg
    className="w-4 h-4"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);

// Modern composer icons (Material Design style)

// Composer icons inspired by Google Keep / Material Design
const TextNoteIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-2-6H7v-2h10v2zm-4 4H7v-2h6v2zm4-8H7V7h10v2z" />
  </svg>
);


const ChecklistIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11 7H3v2h8V7zm0 4H3v2h8v-2zm0 4H3v2h8v-2zm5.59.58L13 12l1.41-1.41L16.59 12l4.59-4.59L22.59 9 16.59 15z" />
  </svg>
);


const BrushIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.84 12.09L12 5.25 13.41 3.84c1.17-1.17 3.07-1.17 4.24 0l2.59 2.59c1.17 1.17 1.17 3.07 0 4.24l-1.4 1.42zM11.29 5.96l6.84 6.84-7.78 7.78H3.5v-6.84l7.79-7.78z" />
  </svg>
);


const AddImageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 11.5L11 14.51 14.5 10l4.5 6H5l3.5-4.5z" />
  </svg>
);

/** ---------- Utils ---------- */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mdToPlain = (md) => {
  try {
    const html = marked.parse(md || "");
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || "";
    return text.replace(/\n{3,}/g, "\n\n");
  } catch (e) {
    return md || "";
  }
};
// Build MARKDOWN content for download
const mdForDownload = (n) => {
  const lines = [];
  if (n.title) lines.push(`# ${n.title}`, "");
  if (Array.isArray(n.tags) && n.tags.length) {
    lines.push(`**Tags:** ${n.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  }
  if (n.type === "text") {
    lines.push(String(n.content || ""));
  } else {
    const items = Array.isArray(n.items) ? n.items : [];
    for (const it of items) {
      lines.push(`- [${it.done ? "x" : " "}] ${it.text || ""}`);
    }
  }
  if (n.images?.length) {
    lines.push(
      "",
      `> _${n.images.length} image(s) attached)_ ${n.images
        .map((im) => im.name || "image")
        .join(", ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback)
    .toString()
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .slice(0, 64);
const downloadText = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
const downloadDataUrl = async (filename, dataUrl) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Download arbitrary blob
const triggerBlobDownload = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Lazy-load JSZip for generating ZIP files client-side
async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(t("failedLoadJszip")));
    document.head.appendChild(s);
  });
  if (!window.JSZip) throw new Error(t("jszipNotAvailable"));
  return window.JSZip;
}

// --- Image filename helpers (fix double extensions) ---
const imageExtFromDataURL = (dataUrl) => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl || "");
  const mime = (m?.[1] || "image/jpeg").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};
const normalizeImageFilename = (name, dataUrl, index = 1) => {
  const base = sanitizeFilename(name && name.trim() ? name : `image-${index}`);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const ext = imageExtFromDataURL(dataUrl);
  return `${withoutExt}.${ext}`;
};

/** Format "Edited" text */
function formatEditedStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();

  const sameYMD = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameYMD(d, now)) return `${t("todayLabel")}, ${timeStr}`;
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameYMD(d, yest)) return `${t("yesterdayLabel")}, ${timeStr}`;

  const month = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${day} ${month}`;
  const yyyy = String(d.getFullYear());
  return `${day} ${month} ${yyyy}`;
}

/** ---------- Global CSS injection ---------- */
const globalCSS = `
:root {
  --bg-light: #f0f2f5;
  --bg-dark: #1a1a1a;
  --card-bg-light: rgba(255, 255, 255, 0.6);
  --card-bg-dark: rgba(40, 40, 40, 0.6);
  --text-light: #1f2937;
  --text-dark: #e5e7eb;
  --border-light: rgba(209, 213, 219, 0.3);
  --border-dark: rgba(75, 85, 99, 0.3);
}
html.dark {
  --bg-light: var(--bg-dark);
  --card-bg-light: var(--card-bg-dark);
  --text-light: var(--text-dark);
  --border-light: var(--border-dark);
}
body {
  background: linear-gradient(135deg, #f0e8ff 0%, #e8f4fd 50%, #fde8f0 100%);
  background-attachment: fixed;
  color: var(--text-light);
  transition: background 0.3s ease, color 0.3s ease;
}
html.dark body {
  background: var(--bg-dark);
  background-attachment: fixed;
}
.glass-card {
  background-color: var(--card-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.07);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  break-inside: avoid;
}
/* Note cards: skip rendering when off-screen, isolate paint */
.note-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
  contain: layout style paint;
}
header.glass-card {
  background: linear-gradient(
    90deg,
    rgba(99, 102, 241, 0.07) 0%,
    rgba(168, 85, 247, 0.07) 50%,
    rgba(236, 72, 153, 0.05) 100%
  ), var(--card-bg-light);
  border-bottom: 1px solid rgba(139, 92, 246, 0.18);
  box-shadow: 0 2px 20px rgba(139, 92, 246, 0.10);
}
html.dark header.glass-card {
  background: var(--card-bg-light);
  border-bottom: 1px solid var(--border-light);
  box-shadow: none;
}
.note-content p { margin-bottom: 0.5rem; }
.note-content h1, .note-content h2, .note-content h3 { margin-bottom: 0.75rem; font-weight: 600; }
.note-content h1 { font-size: 1.5rem; line-height: 1.3; }
.note-content h2 { font-size: 1.25rem; line-height: 1.35; }
.note-content h3 { font-size: 1.125rem; line-height: 1.4; }

/* NEW: Prevent long headings/URLs from overflowing, allow tables/code to scroll */
.note-content,
.note-content * { overflow-wrap: anywhere; word-break: break-word; }
.note-content pre { overflow: hidden; white-space: pre-wrap; word-break: break-word; }

/* Make pre relative so copy button can be positioned */
.note-content pre { position: relative; }

/* Wrapper for code blocks to anchor copy button outside scroll area */
.code-block-wrapper { position: relative; }
.code-block-wrapper .code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
}


.note-content table { display: block; max-width: 100%; overflow-x: auto; }

/* Default lists (subtle spacing for inline previews) */
.note-content ul, .note-content ol { margin: 0.25rem 0 0.25rem 1.25rem; padding-left: 0.75rem; }
.note-content ul { list-style: disc; }
.note-content ol { list-style: decimal; }
.note-content li { margin: 0.15rem 0; line-height: 1.35; }

/* View-mode dense lists in modal: NO extra space between items */
.note-content--dense ul, .note-content--dense ol { margin: 0; padding-left: 1.1rem; }
.note-content--dense li { margin: 0; padding: 0; line-height: 1.15; }
.note-content--dense li > p { margin: 0; }
.note-content--dense li ul, .note-content--dense li ol { margin: 0.1rem 0 0 1.1rem; padding-left: 1.1rem; }

/* Hyperlinks in view mode */
.note-content a {
  color: #2563eb;
  text-decoration: underline;
}
.note-card .note-content a {
  pointer-events: none;
}

/* Inline code and fenced code styling */
.note-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: rgba(0,0,0,0.06);
  padding: .12rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  font-size: .9em;
}

/* Fenced code block container (pre) */
.note-content pre {
  background: rgba(0,0,0,0.06);
  border: 1px solid var(--border-light);
  border-radius: .6rem;
  padding: .75rem .9rem;
}
/* Remove inner background on code inside pre */
.note-content pre code {
  border: none !important;
  background: transparent !important;
  padding: 0;
  display: block;
}

/* Blockquote – elegant styled citation, color-aware via --note-color */
.note-content blockquote,
.prose blockquote {
  border-left: 4px solid color-mix(in srgb, var(--note-color, #6366f1) 50%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-radius: 0.5rem;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--note-color, #6366f1) 8%, transparent) 0%,
    color-mix(in srgb, var(--note-color, #6366f1) 5%, transparent) 100%
  );
  font-style: italic;
  margin: 0 0 0.75rem 0;
  padding: 0.6rem 0.9rem 0.6rem 1.25rem;
  color: var(--text-light);
}
html.dark .note-content blockquote,
html.dark .prose blockquote {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--note-color, #6366f1) 22%, #1e1e2e) 0%,
    color-mix(in srgb, var(--note-color, #6366f1) 14%, #1e1e2e) 100%
  );
  border-left-color: color-mix(in srgb, var(--note-color, #818cf8) 55%, white);
  border-right-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
  border-top-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
  border-bottom-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
}
/* Avoid double margins from <p> inside blockquote */
.note-content blockquote p,
.prose blockquote p {
  margin: 0;
}
.note-content blockquote p + p,
.prose blockquote p + p {
  margin-top: 0.35rem;
}
/* Prose plugin overrides: remove default quote pseudo-elements and italic */
.prose blockquote::before,
.prose blockquote::after {
  content: none !important;
}
.prose blockquote p:first-of-type::before,
.prose blockquote p:last-of-type::after {
  content: none !important;
}

/* ── Modal icon pill container ─────────────────────────────────────────── */
.modal-icon-group {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.05);
}
html.dark .modal-icon-group {
  background: rgba(28, 28, 34, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.5),
    0 6px 20px rgba(0, 0, 0, 0.4);
}

/* ── Buttons ───────────────────────────────────────────────────────────── */
.modal-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  position: relative;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-icon-btn svg {
  display: block;
  transition: transform 0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-icon-btn:hover {
  background: rgba(0, 0, 0, 0.07);
  color: #111827;
}
.modal-icon-btn:hover svg {
  transform: scale(1.18);
}
.modal-icon-btn:active {
  transform: scale(0.9) !important;
  transition: transform 0.08s ease !important;
}
html.dark .modal-icon-btn {
  color: rgba(255, 255, 255, 0.65);
}
html.dark .modal-icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.96);
}


.modal-icon-btn--mode {
  background: linear-gradient(90deg, #6366f1 0%, #7c3aed 100%) !important;
  color: #fff !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35) !important;
}
.modal-icon-btn--mode:hover {
  background: linear-gradient(90deg, #4f46e5 0%, #6d28d9 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.45) !important;
}
html.dark .modal-icon-btn--mode {
  color: #fff !important;
}


/* ── Séparateur avant le bouton close ──────────────────────────────────── */
.modal-icon-btn--close {
  margin-left: 1rem;
}
.modal-icon-btn--close::before {
  content: '';
  position: absolute;
  left: -0.5rem;
  top: 18%;
  height: 64%;
  width: 1px;
  background: rgba(0, 0, 0, 0.12);
  border-radius: 1px;
}
html.dark .modal-icon-btn--close::before {
  background: rgba(255, 255, 255, 0.12);
}

/* ── Close hover rouge ──────────────────────────────────────────────────── */
.modal-icon-btn--close:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #dc2626 !important;
}
html.dark .modal-icon-btn--close:hover {
  background: rgba(239, 68, 68, 0.18) !important;
  color: #fca5a5 !important;
}

/* ── Active (pin épinglé) — accent indigo fixe ──────────────────────────── */
.modal-icon-btn--active {
  background: #1e293b !important;
  color: #ffffff !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
}
.modal-icon-btn--active:hover {
  background: #0f172a !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
}
.modal-icon-btn--active svg {
  transform: none !important;
}
html.dark .modal-icon-btn--active {
  background: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.2) !important;
}
html.dark .modal-icon-btn--active:hover {
  background: rgba(255, 255, 255, 0.22) !important;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28) !important;
}

/* Copy buttons */
/* Hide scrollbars on mobile (keep scrolling) */
@media (max-width: 639px) {

  /* Hide PAGE scrollbars on mobile (keep scrolling) */
  html, body {
    scrollbar-width: none;      /* Firefox */
    -ms-overflow-style: none;   /* IE/Edge legacy */
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none;              /* Chrome/Safari/Brave */
  }
  @media (max-width: 639px) {
    .mobile-hide-scrollbar {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .mobile-hide-scrollbar::-webkit-scrollbar {
      display: none;
    }
  }
}

.note-content pre .code-copy-btn,
.code-block-wrapper .code-copy-btn {
  font-size: .75rem;
  padding: .2rem .45rem;
  border-radius: .35rem;
  background: var(--note-color, #111);
  color: #fff;
  border: none;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
  cursor: pointer;
}
.code-block-wrapper:hover .code-copy-btn {
  opacity: 1;
}
.code-block-wrapper .code-copy-btn:hover {
  opacity: 1;
  background: var(--note-color-opaque, #111);
}
html:not(.dark) .code-block-wrapper .code-copy-btn {
  color: rgba(0,0,0,0.75);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
  
.inline-code-copy-btn {
  margin-left: 6px;
  font-size: .7rem;
  padding: .05rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  background: rgba(0,0,0,0.06);
}

.dragging { opacity: 0.5; transform: scale(1.05); }
.drag-over { outline: 2px dashed rgba(99,102,241,.6); outline-offset: 6px; }
.masonry-grid { display: flex; margin-left: -0.75rem; width: auto; }
.masonry-grid-column { padding-left: 0.75rem; background-clip: padding-box; }
.masonry-grid-column > div { margin-bottom: 0.75rem; }

/* === Scrollbars thématiques === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
::-webkit-scrollbar-track { background: #e3d0ff; }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #c4b5fd 0%, #7c3aed 100%); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #ddd6fe 0%, #6d28d9 100%); }
* { scrollbar-width: thin; scrollbar-color: #a78bfa #e3d0ff; }
.dark * { scrollbar-color: #7c3aed #3b0764; }
html.dark { scrollbar-color: #7c3aed #3b0764; scrollbar-width: thin; }
/* Descendants of html.dark */
.dark ::-webkit-scrollbar-track { background: #3b0764 !important; }
.dark ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%) !important; }
.dark ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #8b5cf6 0%, #5b21b6 100%) !important; }
/* html element itself (main page scrollbar) */
html.dark::-webkit-scrollbar-track { background: #3b0764 !important; }
html.dark::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%) !important; border-radius: 10px; }
html.dark::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #8b5cf6 0%, #5b21b6 100%) !important; }
/* Modal — scrollbar adaptée à la couleur de la note */
.modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track); }
.modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb); border-radius: 10px; }
.modal-scroll-themed::-webkit-scrollbar-thumb:hover { filter: brightness(1.15); }
/* Fallback si CSS vars non résolues sur webkit (Safari) */
html.dark .modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track, #3b0764); }
html.dark .modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb, #7c3aed); border-radius: 10px; }

/* clamp for text preview */
.line-clamp-6 {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* scrim blur */
.modal-scrim {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* modal header blur */
.modal-header-blur {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Note modal enter / exit animations — only transform+opacity (GPU composited, no layout) */
@keyframes noteModalIn {
  from { opacity: 0; transform: scale(0.97) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
@keyframes noteModalOut {
  from { opacity: 1; transform: scale(1)    translateY(0);   }
  to   { opacity: 0; transform: scale(0.97) translateY(6px); }
}
/* Mobile: full-screen modal → slide-up only, no scale (avoids jitter on small screens) */
@media (max-width: 639px) {
  @keyframes noteModalIn  { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes noteModalOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(14px); } }
}
@keyframes scrimFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes scrimFadeOut { from { opacity: 1; } to { opacity: 0; } }
.note-modal-anim         { animation: noteModalIn  200ms ease-out both; }
.note-modal-anim.closing { animation: noteModalOut 180ms ease-in  both; }
.note-scrim-anim         { animation: scrimFadeIn  200ms ease-out both; }
.note-scrim-anim.closing { animation: scrimFadeOut 180ms ease-in  both; }

/* formatting popover base */
.fmt-pop {
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(0,0,0,.2);
  padding: .5rem;
}
.fmt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .35rem .5rem;
  border-radius: .5rem;
  font-size: .85rem;
}

/* Login decorative floating cards */
@keyframes floatCard {
  0%   { transform: translateY(0px) rotate(var(--rot)); }
  50%  { transform: translateY(-18px) rotate(var(--rot)); }
  100% { transform: translateY(0px) rotate(var(--rot)); }
}
.login-deco-card {
  position: absolute;
  pointer-events: none;
  background-color: var(--card-bg-light);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  padding: 1rem;
  opacity: 0.55;
  animation: floatCard var(--dur, 6s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
  will-change: transform;
  width: 160px;
}
@media (pointer: coarse) {
  .login-deco-card {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background-color: rgba(255,255,255,0.55);
  }
  html.dark .login-deco-card {
    background-color: rgba(30,30,40,0.65);
  }
  /* Disable expensive backdrop-filter on touch devices (tablets/phones) */
  .glass-card,
  .modal-scrim,
  .modal-header-blur {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .glass-card {
    background-color: rgba(255, 255, 255, 0.92);
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06);
  }
  html.dark .glass-card {
    background-color: rgba(40, 40, 40, 0.92);
  }
  .modal-scrim {
    background-color: rgba(0, 0, 0, 0.5);
  }
  .modal-header-blur {
    background-color: inherit;
  }
  header.glass-card {
    background: linear-gradient(
      90deg,
      rgba(99, 102, 241, 0.07) 0%,
      rgba(168, 85, 247, 0.07) 50%,
      rgba(236, 72, 153, 0.05) 100%
    ), rgba(255, 255, 255, 0.92);
  }
  html.dark header.glass-card {
    background: rgba(40, 40, 40, 0.92);
  }
}
html.dark .login-deco-card {
  opacity: 0.35;
}
.login-deco-card .deco-title {
  height: 10px;
  border-radius: 4px;
  background: var(--text-light);
  opacity: 0.25;
  margin-bottom: 10px;
  width: 70%;
}
.login-deco-card .deco-line {
  height: 7px;
  border-radius: 4px;
  background: var(--text-light);
  opacity: 0.15;
  margin-bottom: 7px;
}
`;

/** ---------- Image compression (client) ---------- */
async function fileToCompressedDataURL(file, maxDim = 1600, quality = 0.85) {
  /* Detect alpha support from MIME type AND filename extension */
  const alphaTypes = ["image/png", "image/webp", "image/gif", "image/avif"];
  const alphaExts = /\.(png|webp|gif|avif)$/i;
  const hasAlphaHint = alphaTypes.includes(file.type) || alphaExts.test(file.name || "");

  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { alpha: true });
  /* Start from a fully transparent canvas */
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  /* If alpha hint matched, check actual pixel data for real transparency */
  if (hasAlphaHint) {
    const pixelData = ctx.getImageData(0, 0, targetW, targetH).data;
    let hasRealAlpha = false;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] < 254) { hasRealAlpha = true; break; }
    }
    if (hasRealAlpha) return canvas.toDataURL("image/png");
  }
  return canvas.toDataURL("image/jpeg", quality);
}

/** ---------- Phone number linkification (mobile only) ---------- */
const PHONE_RE =
  /(?:\+1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+1[\s.-]?)?\d{3}[\s.-]\d{3}[\s.-]\d{4}|\+33[\s.-]?\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|0\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g;

function linkifyPhoneNumbers(text) {
  if (!text) return text;
  PHONE_RE.lastIndex = 0;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = PHONE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const phone = match[0];
    const digits = phone.replace(/[\s.()-]/g, "");
    parts.push(
      <a
        key={match.index}
        href={`tel:${digits}`}
        className="underline text-blue-600 dark:text-blue-400"
        onClick={(e) => e.stopPropagation()}
      >
        {phone}
      </a>,
    );
    lastIndex = PHONE_RE.lastIndex;
  }
  if (parts.length === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

/** ---------- Shared UI pieces ---------- */
function ChecklistRow({
  item,
  onToggle,
  onChange,
  onRemove,
  readOnly,
  disableToggle = false,
  showRemove = false,
  size = "md", // "sm" | "md" | "lg"
  preview = false,
}) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;
  const [editing, setEditing] = React.useState(false);

  const boxSize =
    size === "lg"
      ? "h-4 w-4"
      : size === "sm"
        ? "h-4 w-4 md:h-3.5 md:w-3.5"
        : "h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-4 md:w-4";

  const removeSize =
    size === "lg"
      ? "w-6 h-6 text-lg font-semibold"
      : size === "sm"
        ? "w-5 h-5 text-xs md:w-4 md:h-4"
        : "w-6 h-6 text-sm md:w-5 md:h-5";

  const removeVisibility = showRemove
    ? "opacity-80 hover:opacity-100"
    : "opacity-0 group-hover:opacity-100";

  return (
    <div className="flex items-center gap-1.5 sm:gap-3 md:gap-2 group min-w-0">
      <input
        type="checkbox"
        className={`shrink-0 ${boxSize} ${preview ? "pointer-events-none" : "cursor-pointer"}`}
        checked={!!item.done}
        onChange={(e) => {
          e.stopPropagation();
          onToggle?.(e.target.checked, e);
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={!!disableToggle || preview}
      />
      {readOnly || (!editing && !readOnly) ? (
        <span
          className={`text-sm break-words min-w-0 ${!readOnly ? "cursor-pointer" : ""} ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          onClick={!readOnly ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
        >
          {isMobile && !preview ? linkifyPhoneNumbers(item.text) : item.text}
        </span>
      ) : (
        <input
          className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-[var(--border-light)] pb-0.5 ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          value={item.text}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          placeholder={t("listItem")}
        />
      )}

      {(showRemove || !readOnly) && (
        <button
          className={`${removeVisibility} transition-opacity text-gray-500 hover:text-red-600 rounded-full border border-[var(--border-light)] flex items-center justify-center cursor-pointer ${removeSize}`}
          data-tooltip={t("removeItem")}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </div>
  );
}
const ColorDot = ({ name, selected, onClick, darkMode }) => (
  <button
    type="button"
    onClick={onClick}
    data-tooltip={trColorName(name)}
    aria-label={trColorName(name)}
    className={`w-6 h-6 rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${name === "default" ? "flex items-center justify-center" : ""} ${selected ? "ring-2 ring-indigo-500" : ""}`}
    style={{
      backgroundColor:
        name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
      borderColor: name === "default" ? "#d1d5db" : "transparent",
    }}
  >
    {name === "default" && (
      <div
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: darkMode ? "#1f2937" : "#fff" }}
      />
    )}
  </button>
);

/** ---------- Palette icon with colored blobs ---------- */
function PaletteColorIcon({ size = 22 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      {/* Palette body - white with dark navy outline */}
      <path
        fill="rgba(255, 158, 0, 0.34)"
        stroke="#1e293b"
        strokeWidth="1.1"
        strokeLinejoin="round"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z"
      />
      {/* Red - top */}
      <circle cx="9"    cy="7.5"  r="1.65" fill="#ef4444" stroke="#1e293b" strokeWidth="0.5"/>
      {/* Yellow - left */}
      <circle cx="6.5"  cy="12.5" r="1.65" fill="#f59e0b" stroke="#1e293b" strokeWidth="0.5"/>
      {/* Dark - center */}
      <circle cx="12"   cy="11"   r="1.3"  fill="#1e293b"/>
      {/* Green - between red and blue, near top-right edge */}
      <circle cx="15.5" cy="7.5"  r="1.65" fill="#10b981" stroke="#1e293b" strokeWidth="0.5"/>
      {/* Blue - right */}
      <circle cx="16.5" cy="13.5" r="1.65" fill="#3b82f6" stroke="#1e293b" strokeWidth="0.5"/>
    </svg>
  );
}

/** ---------- Color Picker Panel ---------- */
function ColorPickerPanel({ anchorRef, open, onClose, colors, selectedColor, darkMode, onSelect }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, dropUp: false });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const panelW = 256;
      const spaceBelow = window.innerHeight - r.bottom;
      const dropUp = spaceBelow < 240;
      let left = Math.min(r.left, window.innerWidth - panelW - 8);
      left = Math.max(8, left);
      setPos({ top: dropUp ? r.top - 8 : r.bottom + 8, left, dropUp });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  const panelStyle = {
    position: "fixed",
    left: pos.left,
    zIndex: 99999,
    width: 256,
    ...(pos.dropUp
      ? { bottom: window.innerHeight - pos.top }
      : { top: pos.top }),
  };

  return createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className={`rounded-2xl shadow-2xl backdrop-blur-xl border overflow-hidden ring-1 ring-black/5 dark:ring-white/5 p-3 ${
        darkMode
          ? "bg-gray-900/98 border-gray-700/50"
          : "bg-white/98 border-gray-100/80"
      }`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 48px)", gap: "12px" }}>
        {colors.map((name) => (
          <button
            key={name}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(name); onClose(); }}
            aria-label={trColorName(name)}
            data-tooltip={trColorName(name)}
            className={`w-12 h-12 rounded-full transition-transform active:scale-95 hover:scale-110 focus:outline-none flex items-center justify-center ${
              name === "default"
                ? "border-2 border-gray-300 dark:border-gray-500"
                : ""
            } ${
              selectedColor === name
                ? "ring-[3px] ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900"
                : ""
            }`}
            style={{
              backgroundColor:
                name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
            }}
          >
            {name === "default" && (
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: darkMode ? "#1f2937" : "#fff" }}
              />
            )}
            {selectedColor === name && name !== "default" && (
              <svg className="w-5 h-5 text-white drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

/** ---------- Formatting helpers ---------- */
function wrapSelection(value, start, end, before, after, placeholder = "text") {
  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : placeholder;
  const newText =
    value.slice(0, start) + before + sel + after + value.slice(end);
  const s = start + before.length;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
function fencedBlock(value, start, end) {
  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : "code";
  const block = "```\n" + sel + "\n```";
  const newText = value.slice(0, start) + block + value.slice(end);
  const s = start + 4;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
function selectionBounds(value, start, end) {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let to = value.indexOf("\n", end);
  if (to === -1) to = value.length;
  return { from, to };
}
function toggleList(value, start, end, kind /* 'ul' | 'ol' */) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n");

  const isUL = (ln) => /^\s*[-*+]\s+/.test(ln);
  const isOL = (ln) => /^\s*\d+\.\s+/.test(ln);
  const nonEmpty = (ln) => ln.trim().length > 0;

  const allUL = lines.filter(nonEmpty).every(isUL);
  const allOL = lines.filter(nonEmpty).every(isOL);

  let newLines;
  if (kind === "ul") {
    if (allUL) newLines = lines.map((ln) => ln.replace(/^\s*[-*+]\s+/, ""));
    else
      newLines = lines.map((ln) =>
        nonEmpty(ln)
          ? `- ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}`
          : ln,
      );
  } else {
    if (allOL) {
      newLines = lines.map((ln) => ln.replace(/^\s*\d+\.\s+/, ""));
    } else {
      let i = 1;
      newLines = lines.map((ln) =>
        nonEmpty(ln)
          ? `${i++}. ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}`
          : ln,
      );
    }
  }

  const replaced = newLines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  const delta = replaced.length - segment.length;
  const newStart =
    start + (kind === "ol" && !allOL ? 3 : kind === "ul" && !allUL ? 2 : 0);
  const newEnd = end + delta;
  return { text: newText, range: [newStart, newEnd] };
}
function prefixLines(value, start, end, prefix) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n").map((ln) => `${prefix}${ln}`);
  const replaced = lines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  const delta = replaced.length - segment.length;
  return { text: newText, range: [start + prefix.length, end + delta] };
}

/** Smart Enter: continue lists/quotes, or exit on empty */
function handleSmartEnter(value, start, end) {
  if (start !== end) return null; // only handle caret
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const line = value.slice(lineStart, start);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Ordered list?
  let m = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const num = parseInt(m[2], 10) || 1;
    const text = m[3] || "";
    if (text.trim() === "") {
      // exit list
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}${num + 1}. `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Unordered list?
  m = /^(\s*)([-*+])\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[3] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}- `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Blockquote?
  m = /^(\s*)>\s?(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[2] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}> `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  return null;
}

/** Small toolbar UI */
function FormatToolbar({ dark, onAction }) {
  const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
  return (
    <div
      className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
    >
      <div className="flex flex-wrap gap-1">
        <button className={base} onClick={() => onAction("h1")}>
          H1
        </button>
        <button className={base} onClick={() => onAction("h2")}>
          H2
        </button>
        <button className={base} onClick={() => onAction("h3")}>
          H3
        </button>
        <span className="mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("bold")}>
          <strong>B</strong>
        </button>
        <button className={base} onClick={() => onAction("italic")}>
          <em>I</em>
        </button>
        <button className={base} onClick={() => onAction("strike")}>
          <span className="line-through">S</span>
        </button>
        <button className={base} onClick={() => onAction("code")}>
          `code`
        </button>
        <button className={base} onClick={() => onAction("codeblock")}>
          &lt;/&gt;
        </button>
        <span className="mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("quote")}>
          &gt;
        </button>
        <button className={base} onClick={() => onAction("ul")}>{t("bulletListLabel")}</button>
        <button className={base} onClick={() => onAction("ol")}>{t("orderedListLabel")}</button>
        <button className={base} onClick={() => onAction("link")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>
    </div>
  );
}

/** ---------- Portal Popover ---------- */
function Popover({ anchorRef, open, onClose, children, offset = 8 }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      let top = r.bottom + offset;
      let left = r.left;
      setPos({ top, left });
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (!el) return;
        const bw = el.offsetWidth;
        const bh = el.offsetHeight;
        let t = top;
        let l = left;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (l + bw + 8 > vw) l = Math.max(8, vw - bw - 8);
        if (t + bh + 8 > vh) {
          t = Math.max(8, r.top - bh - offset);
        }
        setPos({ top: t, left: l });
      });
    };
    place();
    const onWin = () => place();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, anchorRef, offset]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const el = boxRef.current;
      const a = anchorRef?.current;
      if (el && el.contains(e.target)) return;
      if (a && a.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true); // useCapture: true
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={boxRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** ---------- Drawing Preview ---------- */
function DrawingPreview({ data, width, height, darkMode = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Parse drawing data
    let paths = [];
    let originalWidth = 800; // Default canvas width
    let originalHeight = 600; // Default canvas height
    let firstPageHeight = 600; // Height of first page for filtering
    try {
      let parsedData;
      if (typeof data === "string") {
        parsedData = JSON.parse(data) || [];
      } else {
        parsedData = data;
      }

      // Handle both old format (array) and new format (object with paths and dimensions)
      if (Array.isArray(parsedData)) {
        // Old format: just an array of paths
        paths = parsedData;
      } else if (
        parsedData &&
        typeof parsedData === "object" &&
        Array.isArray(parsedData.paths)
      ) {
        // New format: object with paths and dimensions
        paths = parsedData.paths;
        if (
          parsedData.dimensions &&
          parsedData.dimensions.width &&
          parsedData.dimensions.height
        ) {
          originalWidth = parsedData.dimensions.width;
          originalHeight = parsedData.dimensions.height;
          // First page height: use originalHeight if stored, otherwise estimate
          // If originalHeight is stored, use it; otherwise, if height > 1000, assume it was doubled
          if (parsedData.dimensions.originalHeight) {
            firstPageHeight = parsedData.dimensions.originalHeight;
          } else if (originalHeight > 1000) {
            // Likely doubled, estimate first page as half (common sizes: 450->900, 850->1700)
            firstPageHeight = originalHeight / 2;
          } else {
            // No pages added yet, use current height
            firstPageHeight = originalHeight;
          }
        }
      } else {
        paths = [];
      }
    } catch (e) {
      // Invalid data, show empty preview
      return;
    }

    // Filter paths to only show those in the first page (y coordinate < firstPageHeight)
    // For preview, we only want to show the first page
    paths = paths.filter((path) => {
      if (!path.points || path.points.length === 0) return false;
      // Check if any point in the path is within the first page
      return path.points.some((point) => point.y < firstPageHeight);
    });

    // Convert black/white strokes based on current theme for optimal contrast
    paths = paths.map((path) => {
      // Only convert black/white strokes for better contrast, keep other colors as-is
      if (darkMode) {
        // In dark mode, ensure black strokes are white for visibility
        if (path.color === "#000000") {
          return { ...path, color: "#FFFFFF" };
        }
      } else {
        // In light mode, ensure white strokes are black for visibility
        if (path.color === "#FFFFFF") {
          return { ...path, color: "#000000" };
        }
      }
      return path;
    });

    // Scale factor to fit drawing in preview - use firstPageHeight to avoid blank space
    const scaleX = width / originalWidth;
    const scaleY = height / firstPageHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate preview dimensions (only first page, no blank space)
    const previewWidth = width;
    const previewHeight = firstPageHeight * scale;

    // Set canvas dimensions to match preview size (no blank space below)
    canvas.width = previewWidth;
    canvas.height = previewHeight;

    // Clear canvas with calculated dimensions
    ctx.clearRect(0, 0, previewWidth, previewHeight);

    if (paths.length === 0) {
      // Draw a subtle placeholder
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(10, 10, previewWidth - 20, previewHeight - 20);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Empty", previewWidth / 2, previewHeight / 2 + 3);
      return;
    }

    // Draw paths at scaled size
    paths.forEach((path) => {
      if (path.points && path.points.length > 0) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = Math.max(1, path.size * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (path.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
        } else {
          ctx.globalCompositeOperation = "source-over";
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x * scale, path.points[0].y * scale);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x * scale, path.points[i].y * scale);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    });
  }, [data, width, height, darkMode]);

  return (
    <div className="w-[90%] mx-auto rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}

/** ---------- Note Card ---------- */
function NoteCard({
  n,
  dark,
  openModal,
  togglePin,
  // multi-select
  multiMode = false,
  selected = false,
  onToggleSelect = () => {},
  disablePin = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  // online status
  isOnline = true,
  // checklist update callback
  onUpdateChecklistItem,
  currentUser,
}) {
  const isChecklist = n.type === "checklist";
  const isDraw = n.type === "draw";
  const previewText = useMemo(() => n.content || "", [n.content]);
  const MAX_CHARS = 350;
  const isLong = previewText.length > MAX_CHARS;
  const displayText = isLong
    ? previewText.slice(0, MAX_CHARS).trimEnd() + "…"
    : previewText;

  const total = (n.items || []).length;
  const done = (n.items || []).filter((i) => i.done).length;
  // Sort items with unchecked items first, just like in the modal
  const sortedItems = (n.items || []).sort((a, b) => {
    if (a.done === b.done) return 0; // Same status, maintain order
    return a.done ? 1 : -1; // Unchecked (false) comes before checked (true)
  });
  const maxPreviewItems = (typeof window !== "undefined" && window.innerWidth < 640) ? 4 : 8;
  const visibleItems = sortedItems.slice(0, maxPreviewItems);
  const extraCount =
    total > visibleItems.length ? total - visibleItems.length : 0;

  const imgs = n.images || [];
  const mainImg = imgs[0];

  const MAX_TAG_CHIPS = 4;
  const allTags = Array.isArray(n.tags) ? n.tags : [];
  const showEllipsisChip = allTags.length > MAX_TAG_CHIPS;
  const displayTags = allTags.slice(0, MAX_TAG_CHIPS);

  const group = n.pinned ? "pinned" : "others";

  return (
    <div
      draggable={!multiMode}
      onDragStart={(e) => {
        if (!multiMode) onDragStart(n.id, e);
      }}
      onDragOver={(e) => {
        if (!multiMode) onDragOver(n.id, group, e);
      }}
      onDragLeave={(e) => {
        if (!multiMode) onDragLeave(e);
      }}
      onDrop={(e) => {
        if (!multiMode) onDrop(n.id, group, e);
      }}
      onDragEnd={(e) => {
        if (!multiMode) onDragEnd(e);
      }}
      onClick={(e) => {
        if (multiMode) {
          // In multi-select mode, clicking anywhere toggles selection
          e.stopPropagation();
          onToggleSelect?.(n.id, !selected);
        } else {
          // In normal mode, open the modal
          openModal(n.id);
        }
      }}
      className={`note-card glass-card rounded-xl p-2 sm:p-3 mb-2 sm:mb-3 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative min-h-[54px] overflow-hidden group ${
        multiMode && selected
          ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent"
          : ""
      }`}
      style={{
        backgroundColor: bgFor(n.color, dark),
        '--note-color': (!dark && (!n.color || n.color === 'default')) ? '#a78bfa' : solid(bgFor(n.color, dark)),
      }}
      data-id={n.id}
      data-group={group}
    >
      {multiMode && (
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          {/* Modern checkbox */}
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
              selected
                ? "bg-indigo-500 border-indigo-500 text-white"
                : "border-gray-300 dark:border-gray-500 bg-white/80 dark:bg-gray-700/80 hover:border-indigo-400"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(n.id, !selected);
            }}
          >
            {selected && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>
      )}
      {/* Collaboration icon - bottom right - show if note has collaborators (empty array means has collaborators) or if user is viewing a note they don't own */}
      {/* Show icon if note has collaborators (empty array) or if user is viewing someone else's note */}
      {((n.collaborators !== undefined && n.collaborators !== null) ||
        (n.user_id && currentUser && n.user_id !== currentUser.id)) && (
        <div className="absolute bottom-3 right-3 z-10">
          <div className="relative" data-tooltip={t("collaboratedNote")}>
            <svg
              className="w-5 h-5 text-black dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
            <svg
              className="w-3 h-3 absolute -top-1 -right-1 text-black dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          </div>
        </div>
      )}
      {!multiMode && !disablePin && (
        <div className="absolute top-3 right-3 h-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: bgFor(n.color, dark) }}
          />
          <button
            aria-label={n.pinned ? t("unpinNote") : t("pinNote")}
            onClick={(e) => {
              if (disablePin) return;
              e.stopPropagation();
              togglePin(n.id, !n.pinned);
            }}
            className="relative rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-tooltip={n.pinned ? t("unpin") : t("pin")}
            disabled={!!disablePin}
          >
            {n.pinned ? <PinFilled /> : <PinOutline />}
          </button>
        </div>
      )}

      {n.title && (
        <h3 className="font-bold text-sm sm:text-lg mb-2 break-words">{n.title}</h3>
      )}

      {imgs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {imgs.map((im) => (
            <div
              key={im.id}
              className="overflow-hidden rounded-lg"
              style={{ width: imgs.length === 1 ? "100%" : "calc(50% - 2px)" }}
            >
              <img
                src={im.src}
                alt={im.name || t("noteImage")}
                className="w-full h-auto object-contain object-center"
                style={{ maxHeight: "200px" }}
              />
            </div>
          ))}
        </div>
      )}

      {!isChecklist && !isDraw ? (
        <div
          className="text-sm break-words whitespace-pre-wrap overflow-hidden note-content note-content--dense"
          style={{ maxHeight: "280px" }}
          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(displayText) }}
        />
      ) : isDraw ? (
        <DrawingPreview
          data={n.content}
          width={800}
          height={600}
          darkMode={dark}
        />
      ) : (
        <div className="space-y-2">
          {visibleItems.map((it) => (
            <ChecklistRow
              key={it.id}
              item={it}
              size="md"
              readOnly={true}
              showRemove={false}
              preview={true}
            />
          ))}
          {extraCount > 0 && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              {t("moreItems").replace("{count}", String(extraCount))}
            </div>
          )}
          <div className="text-xs text-gray-600 dark:text-gray-300">
            {t("completedFraction").replace("{done}", String(done)).replace("{total}", String(total))}
          </div>
        </div>
      )}

      {!!displayTags.length && (
        <div className="mt-4 text-xs flex flex-wrap gap-2">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          {showEllipsisChip && (
            <span className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
              …
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** ---------- Auth Shell ---------- */
function AuthShell({ title, dark, onToggleDark, floatingCardsEnabled = true, loginSlogan, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative floating note cards */}
      {floatingCardsEnabled && <div aria-hidden="true">
        <div className="login-deco-card" style={{"--rot":"-12deg","--dur":"7s","--delay":"0s",top:"8%",left:"6%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"5deg","--dur":"9s","--delay":"-2s",top:"42%",left:"3%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"8deg","--dur":"8s","--delay":"-4s",bottom:"10%",left:"9%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"65%"}}/>
          <div className="deco-line" style={{width:"45%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"6deg","--dur":"10s","--delay":"-1s",top:"6%",right:"7%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-8deg","--dur":"7.5s","--delay":"-3s",top:"38%",right:"4%",borderTop:"3px solid rgba(236,72,153,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(236,72,153,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-15deg","--dur":"11s","--delay":"-5s",bottom:"8%",right:"8%",borderTop:"3px solid rgba(20,184,166,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(20,184,166,0.5)"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        {/* Extra cards — visible only on md+ screens to fill the gap */}
        <div className="login-deco-card hidden md:block" style={{"--rot":"10deg","--dur":"8.5s","--delay":"-1.5s",top:"18%",left:"22%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"64%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"-6deg","--dur":"9.5s","--delay":"-6s",bottom:"20%",left:"20%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"58%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"-9deg","--dur":"10.5s","--delay":"-2.5s",top:"14%",right:"20%",borderTop:"3px solid rgba(132,204,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(132,204,22,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"92%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"7deg","--dur":"8s","--delay":"-7s",bottom:"18%",right:"18%",borderTop:"3px solid rgba(244,63,94,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(244,63,94,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"62%"}}/>
        </div>
      </div>}
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="/pwa-192.png"
            alt="Glass Keep"
            className="h-16 w-16 rounded-2xl shadow-lg mx-auto mb-4 select-none pointer-events-none"
            draggable="false"
          />
          <h1 className="text-3xl font-bold">Glass Keep</h1>
          <p className="text-gray-500 dark:text-gray-400">{title}</p>
        </div>
        <div className="glass-card rounded-xl p-6 shadow-lg">{children}</div>
        <div className="mt-6 text-center">
          <button
            onClick={onToggleDark}
            className={`inline-flex items-center gap-2 text-sm ${dark ? "text-gray-300" : "text-gray-700"} hover:underline`}
            data-tooltip={t("toggleDarkMode")}
          >
            {dark ? <Moon /> : <Sun />} {t("toggleTheme")}
          </button>
        </div>
        {(loginSlogan || t("loginSlogan")) && (
          <div className="mt-4 text-center">
            <span className="glass-card inline-block rounded-full px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm">
              {loginSlogan || t("loginSlogan")}
            </span>
          </div>
        )}
      </div>
    <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-400 dark:text-gray-600 z-10 select-none">
      Open source project &mdash; original by{" "}
      <a href="https://github.com/nikunjsingh93" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">nikunjsingh93</a>
      {" · "}forked &amp; maintained by{" "}
      <a href="https://github.com/Victor-root/glasskeep-enhanced" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Victor-root</a>
    </p>
  </div>
  );
}

/** ---------- Avatar helper (reusable) ---------- */
function UserAvatar({ name, email, avatarUrl, size = "w-7 h-7", textSize = "text-xs", dark, className = "" }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email || "?"}
        className={`${size} rounded-full object-cover select-none ${className}`}
        draggable="false"
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center ${size} rounded-full ${textSize} font-semibold select-none ${
        dark ? "bg-indigo-500/25 text-indigo-300" : "bg-indigo-100 text-indigo-700"
      } ${className}`}
    >
      {(name?.[0] || email?.[0] || "?").toUpperCase()}
    </span>
  );
}

/** ---------- Login / Register / Secret Login ---------- */
function LoginView({
  dark,
  onToggleDark,
  onLogin,
  onLoginById,
  goRegister,
  goSecret,
  allowRegistration,
  floatingCardsEnabled,
  loginSlogan,
  loginProfiles,
}) {
  const [mode, setMode] = useState("profiles"); // "profiles" | "password" | "manual"
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  // If no visible profiles, show manual login directly
  const hasProfiles = loginProfiles && loginProfiles.length > 0;

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLogin(email.trim(), pw);
      if (!res.ok) setErr(res.error || t("loginFailed"));
    } catch (er) {
      setErr(er.message || t("loginFailed"));
    }
  };

  const handleProfileLogin = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLoginById(selectedProfile.id, pw);
      if (!res.ok) setErr(res.error || t("loginFailed"));
    } catch (er) {
      setErr(er.message || t("loginFailed"));
    }
  };

  // Profile selection screen (Jellyfin-style)
  if (hasProfiles && mode === "profiles") {
    return (
      <AuthShell
        title={t("selectProfile")}
        dark={dark}
        onToggleDark={onToggleDark}
        floatingCardsEnabled={floatingCardsEnabled}
        loginSlogan={loginSlogan}
      >
        <div className="flex flex-wrap justify-center gap-5 mb-4">
          {loginProfiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => {
                setSelectedProfile(profile);
                setPw("");
                setErr("");
                setMode("password");
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/10 hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 min-w-[90px]"
            >
              <UserAvatar
                name={profile.name}
                avatarUrl={profile.avatar_url}
                size="w-16 h-16"
                textSize="text-2xl"
                dark={dark}
              />
              <span className={`text-sm font-medium truncate max-w-[100px] ${dark ? "text-gray-200" : "text-gray-700"}`}>
                {profile.name}
              </span>
            </button>
          ))}
        </div>
        <div className="text-center">
          <button
            className="text-sm text-indigo-600 hover:underline"
            onClick={() => { setMode("manual"); setErr(""); setPw(""); setEmail(""); }}
          >{t("manualLogin")}</button>
        </div>
      </AuthShell>
    );
  }

  // Password entry for selected profile
  if (mode === "password" && selectedProfile) {
    return (
      <AuthShell
        dark={dark}
        onToggleDark={onToggleDark}
        floatingCardsEnabled={floatingCardsEnabled}
        loginSlogan={loginSlogan}
      >
        <div className="flex flex-col items-center mb-4">
          <UserAvatar
            name={selectedProfile.name}
            avatarUrl={selectedProfile.avatar_url}
            size="w-20 h-20"
            textSize="text-3xl"
            dark={dark}
          />
          <h2 className={`mt-3 text-lg font-semibold ${dark ? "text-gray-100" : "text-gray-800"}`}>
            {selectedProfile.name}
          </h2>
        </div>
        <form onSubmit={handleProfileLogin} className="space-y-4">
          <input
            type="password"
            autoFocus
            className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder={t("enterPassword")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          >{t("signIn")}</button>
        </form>
        <div className="mt-4 text-sm text-center flex justify-center gap-4">
          {hasProfiles && (
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => { setMode("profiles"); setErr(""); setPw(""); }}
            >{t("backToProfiles")}</button>
          )}
          <button
            className="text-indigo-600 hover:underline"
            onClick={() => { setMode("manual"); setErr(""); setPw(""); setEmail(""); }}
          >{t("otherAccount")}</button>
        </div>
      </AuthShell>
    );
  }

  // Manual login (classic form)
  return (
    <AuthShell
      data-tooltip={t("signInToYourAccount")}
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={floatingCardsEnabled}
      loginSlogan={loginSlogan}
    >
      <form onSubmit={handleManualSubmit} className="space-y-4">
        <input
          type="text"
          autoComplete="username"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("username")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("password")}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
        >{t("signIn")}</button>
      </form>

      <div className="mt-4 text-sm flex justify-between items-center">
        {hasProfiles && (
          <button
            className="text-indigo-600 hover:underline"
            onClick={() => { setMode("profiles"); setErr(""); setPw(""); }}
          >{t("backToProfiles")}</button>
        )}
        {allowRegistration && (
          <button
            className="text-indigo-600 hover:underline"
            onClick={goRegister}
          >{t("createAccount")}</button>
        )}
        <button className="text-indigo-600 hover:underline" onClick={goSecret}>{t("forgotUsernamePassword")}</button>
      </div>
    </AuthShell>
  );
}

function RegisterView({ dark, onToggleDark, onRegister, goLogin, floatingCardsEnabled, loginSlogan }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return setErr(t("passwordMin6Error"));
    if (pw !== pw2) return setErr(t("passwordsDoNotMatch"));
    try {
      const res = await onRegister(name.trim() || "User", email.trim(), pw);
      if (!res.ok) setErr(res.error || "Registration failed");
    } catch (er) {
      setErr(er.message || "Registration failed");
    }
  };

  return (
    <AuthShell
      data-tooltip={t("createNewAccount")}
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={floatingCardsEnabled}
      loginSlogan={loginSlogan}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          autoComplete="username"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("username")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("passwordMin6")}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("confirmPassword")}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
        >{t("createAccount")}</button>
      </form>
      <div className="mt-4 text-sm text-center">
        Already have an account?{" "}
        <button className="text-indigo-600 hover:underline" onClick={goLogin}>{t("signInLower")}</button>
      </div>
    </AuthShell>
  );
}

function SecretLoginView({ dark, onToggleDark, onLoginWithKey, goLogin, floatingCardsEnabled, loginSlogan }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await onLoginWithKey(key.trim());
      if (!res.ok) setErr(res.error || t("loginFailed"));
    } catch (er) {
      setErr(er.message || t("loginFailed"));
    }
  };

  return (
    <AuthShell
      data-tooltip={t("signInWithSecretKey")}
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={floatingCardsEnabled}
      loginSlogan={loginSlogan}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("pasteSecretKeyHere")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
        >{t("signInWithSecretKey")}</button>
      </form>
      <div className="mt-4 text-sm text-center">
        Remember your credentials?{" "}
        <button className="text-indigo-600 hover:underline" onClick={goLogin}>{t("signInWithEmailPassword")}</button>
      </div>
    </AuthShell>
  );
}

// Sidebar icons (Material Design style)
const NotesIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
    <line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);
const ImagesIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const ArchiveSidebarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);
const TrashSidebarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);
const TagIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

/** ---------- Tag Sidebar / Drawer ---------- */
function TagSidebar({
  open,
  onClose,
  tagsWithCounts,
  activeTag,
  activeTagFilters = [],
  onSelect,
  dark,
  permanent = false,
  width = 288,
  onResize,
}) {
  const isAllNotes = activeTag === null && activeTagFilters.length === 0;
  const isAllImages = activeTag === ALL_IMAGES;

  // Long-press support for multi-tag selection on touch devices
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  const handleTagTouchStart = (tag) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onSelect(tag, { ctrlKey: true });
    }, 500);
  };
  const handleTagTouchEnd = () => clearTimeout(longPressTimer.current);

  // Suppress slide animation when sidebar first becomes permanent (server load)
  const hasBeenPermanentRef = useRef(permanent);
  const [skipTransition, setSkipTransition] = useState(false);
  useLayoutEffect(() => {
    if (permanent && !hasBeenPermanentRef.current) {
      hasBeenPermanentRef.current = true;
      setSkipTransition(true);
    }
  }, [permanent]);
  useEffect(() => {
    if (skipTransition) {
      // Re-enable transitions after the browser has painted the instant position
      requestAnimationFrame(() => setSkipTransition(false));
    }
  }, [skipTransition]);

  return (
    <>
      {open && !permanent && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-40 h-full shadow-2xl ${skipTransition ? "" : "transition-transform duration-200 "}${permanent || open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: permanent ? `${width}px` : "288px",
          backgroundColor: dark ? "#222222" : "rgba(240,232,255,0.97)",
          borderRight: "1px solid var(--border-light)",
        }}
        aria-hidden={!(permanent || open)}
      >
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t("tags")}</h3>
          {!permanent && (
            <button
              className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={onClose}
              data-tooltip={t("close")}
            >
              <CloseIcon />
            </button>
          )}
        </div>
        <nav className="p-2 overflow-y-auto h-[calc(100%-56px)]">
          {/* Notes (All) */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-3 ${isAllNotes ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect(null);
              onClose();
            }}
          ><NotesIcon />{t("notesAll")}</button>

          {/* All Images */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${isAllImages ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect(ALL_IMAGES);
              onClose();
            }}
          ><ImagesIcon />{t("allImages")}</button>

          {/* Archived Notes */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${activeTag === "ARCHIVED" ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect("ARCHIVED");
              onClose();
            }}
          ><ArchiveSidebarIcon />{t("archivedNotes")}</button>

          {/* Trash */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${activeTag === "TRASHED" ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect("TRASHED");
              onClose();
            }}
          ><TrashSidebarIcon />{t("trashedNotes")}</button>

          {/* User tags */}
          {tagsWithCounts.map(({ tag, count }) => {
            const active =
              activeTagFilters.length > 0
                ? activeTagFilters.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
                : typeof activeTag === "string" &&
                  activeTag !== ALL_IMAGES &&
                  activeTag.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center justify-between cursor-pointer ${active ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
                onClick={(e) => {
                  if (longPressTriggered.current) {
                    longPressTriggered.current = false;
                    return;
                  }
                  onSelect(tag, e);
                  // Ne ferme la sidebar que si c'est un clic simple (pas Ctrl/Cmd+clic)
                  if (!e.ctrlKey && !e.metaKey) {
                    onClose();
                  }
                }}
                onTouchStart={() => handleTagTouchStart(tag)}
                onTouchEnd={handleTagTouchEnd}
                onTouchCancel={handleTagTouchEnd}
              >
                <span className="flex items-center gap-2 truncate"><TagIcon />{tag}</span>
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
          {tagsWithCounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">{t("noTagsYet")}</p>
          )}
          {activeTagFilters.length > 1 && (
            <div className="px-3 py-1 mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>🔀 {activeTagFilters.length} tags actifs</span>
              <button
                onClick={() => onSelect(null)}
                className="text-xs underline hover:no-underline cursor-pointer"
              >tout effacer</button>
            </div>
          )}
        </nav>

        {/* Resize handle - only show when permanent */}
        {permanent && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = width;

              const handleMouseMove = (moveEvent) => {
                const newWidth = Math.max(
                  200,
                  Math.min(500, startWidth + (moveEvent.clientX - startX)),
                );
                onResize(newWidth);
              };

              const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
              };

              document.addEventListener("mousemove", handleMouseMove);
              document.addEventListener("mouseup", handleMouseUp);
              document.body.style.cursor = "ew-resize";
              document.body.style.userSelect = "none";
            }}
          />
        )}
      </aside>
    </>
  );
}

/** ---------- Settings Panel ---------- */
function SettingsPanel({
  open,
  onClose,
  dark,
  onExportAll,
  onImportAll,
  onImportGKeep,
  onImportMd,
  onDownloadSecretKey,
  alwaysShowSidebarOnWide,
  setAlwaysShowSidebarOnWide,
  localAiEnabled,
  setLocalAiEnabled,
  floatingCardsEnabled,
  setFloatingCardsEnabled,
  showGenericConfirm,
  showToast,
  onResetNoteOrder,
  currentUser,
  token,
  onProfileUpdated,
}) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [overridePositions, setOverridePositions] = useState(true);
  const [profileShowOnLogin, setProfileShowOnLogin] = useState(true);
  const avatarFileRef = React.useRef(null);

  // Load profile data when panel opens
  React.useEffect(() => {
    if (open && token) {
      api("/user/profile", { token }).then((data) => {
        if (data) setProfileShowOnLogin(data.show_on_login !== false);
      }).catch(() => {});
    }
  }, [open, token]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataURL(file, 256, 0.85);
      await api("/user/avatar", { method: "PUT", body: { avatar_url: dataUrl }, token });
      onProfileUpdated?.({ avatar_url: dataUrl });
      showToast(t("photoUpdated"), "success");
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  };

  const handleAvatarRemove = async () => {
    try {
      await api("/user/avatar", { method: "DELETE", token });
      onProfileUpdated?.({ avatar_url: null });
      showToast(t("photoRemoved"), "info");
    } catch (err) {
      showToast(err.message || "Remove failed", "error");
    }
  };

  const handleShowOnLoginToggle = async () => {
    const newVal = !profileShowOnLogin;
    setProfileShowOnLogin(newVal);
    try {
      await api("/user/profile", { method: "PATCH", body: { show_on_login: newVal }, token });
    } catch (err) {
      setProfileShowOnLogin(!newVal); // revert
      showToast(err.message || "Update failed", "error");
    }
  };

  // Prevent body scroll when settings panel is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{
          backgroundColor: dark ? "#222222" : "rgba(255,255,255,0.95)",
          borderLeft: "1px solid var(--border-light)",
        }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <SettingsIcon />{t("settings")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Profile Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("profileSettings")}</h4>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                <UserAvatar
                  name={currentUser?.name}
                  email={currentUser?.email}
                  avatarUrl={currentUser?.avatar_url}
                  size="w-16 h-16"
                  textSize="text-2xl"
                  dark={dark}
                />
                <button
                  onClick={() => avatarFileRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{currentUser?.name || currentUser?.email}</div>
                <div className="flex gap-2 mt-1">
                  <button
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => avatarFileRef.current?.click()}
                  >{currentUser?.avatar_url ? t("changePhoto") : t("uploadPhoto")}</button>
                  {currentUser?.avatar_url && (
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={handleAvatarRemove}
                    >{t("removePhoto")}</button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium">{t("showOnLogin")}</div>
              </div>
              <button
                className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                  profileShowOnLogin ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
                }`}
                onClick={handleShowOnLoginToggle}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    profileShowOnLogin ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Data Management Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("dataManagement")}</h4>
            <div className="space-y-3">
              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onExportAll?.();
                }}
              >
                <div className="font-medium">{t("exportAllNotesJson")}</div>
                <div className="text-sm text-gray-500">{t("downloadAllNotesJson")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportAll?.();
                }}
              >
                <div className="font-medium">{t("importNotesJson")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromJsonFile")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportGKeep?.();
                }}
              >
                <div className="font-medium">{t("importGoogleKeepNotes")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromGoogleKeepExport")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportMd?.();
                }}
              >
                <div className="font-medium">{t("importMarkdownFilesMd")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromMarkdownFiles")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onDownloadSecretKey?.();
                }}
              >
                <div className="font-medium">{t("downloadSecretKeyTxt")}</div>
                <div className="text-sm text-gray-500">{t("downloadEncryptionKeyBackup")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  setOverridePositions(true);
                  setResetDialogOpen(true);
                }}
              >
                <div className="font-medium">{t("resetNoteOrder")}</div>
                <div className="text-sm text-gray-500">{t("resetNoteOrderDesc")}</div>
              </button>
            </div>
          </div>

          {/* UI Preferences Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("uiPreferences")}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("localAiAssistant")}</div>
                  <div className="text-sm text-gray-500">{t("askQuestionsAboutNotes")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    localAiEnabled
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => {
                    if (!localAiEnabled) {
                      // Show confirmation dialog when enabling
                      showGenericConfirm({
                        title: t("enableAiAssistantQuestion"),
                        message:
                          t("enableAiAssistantWarning"),
                        confirmText: t("enableAi"),
                        cancelText: t("cancel"),
                        danger: false,
                        onConfirm: async () => {
                          setLocalAiEnabled(true);
                          showToast(
                            t("aiAssistantEnabledModelDownload"),
                            "success",
                          );
                        },
                      });
                    } else {
                      // Disable without confirmation
                      setLocalAiEnabled(false);
                      showToast(t("aiAssistantDisabled"), "info");
                    }
                  }}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localAiEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("alwaysShowSidebarWide")}</div>
                  <div className="text-sm text-gray-500">{t("keepTagsPanelVisible")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    alwaysShowSidebarOnWide
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() =>
                    setAlwaysShowSidebarOnWide(!alwaysShowSidebarOnWide)
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      alwaysShowSidebarOnWide
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("enableAnimationsMobile")}</div>
                  <div className="text-sm text-gray-500">{t("enableAnimationsMobileDesc")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    floatingCardsEnabled
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => setFloatingCardsEnabled(!floatingCardsEnabled)}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      floatingCardsEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Note Order Dialog */}
      {resetDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setResetDialogOpen(false)}
          />
          <div
            className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
            style={{
              backgroundColor: dark
                ? "rgba(40,40,40,0.95)"
                : "rgba(255,255,255,0.95)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">{t("resetNoteOrder")}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {t("resetNoteOrderConfirm")}
            </p>
            <label className="flex items-center gap-2 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={overridePositions}
                onChange={(e) => setOverridePositions(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm">{t("resetNoteOrderOverridePositions")}</span>
            </label>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setResetDialogOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                onClick={() => {
                  setResetDialogOpen(false);
                  onClose();
                  onResetNoteOrder?.(overridePositions);
                }}
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** ---------- Admin Panel ---------- */
function AdminPanel({
  open,
  onClose,
  dark,
  adminSettings,
  setAdminSettings,
  allUsers,
  newUserForm,
  setNewUserForm,
  updateAdminSettings,
  createUser,
  deleteUser,
  updateUser,
  currentUser,
  showGenericConfirm,
  showToast,
}) {
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false,
  });
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  console.log("AdminPanel render:", {
    open,
    adminSettings,
    allUsers: allUsers?.length,
  });

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      showToast(t("pleaseFillRequiredFields"), "error");
      return;
    }

    setIsCreatingUser(true);
    try {
      await createUser(newUserForm);
      showToast(t("userCreatedSuccessfullyBang"), "success");
    } catch (e) {
      // Error already handled in createUser function
    } finally {
      setIsCreatingUser(false);
    }
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      password: "",
      is_admin: user.is_admin,
    });
    setEditUserModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editUserForm.name || !editUserForm.email) {
      showToast(t("nameAndEmailRequired"), "error");
      return;
    }

    setIsUpdatingUser(true);
    try {
      // Only include password if it's not empty
      const updateData = {
        name: editUserForm.name,
        email: editUserForm.email,
        is_admin: editUserForm.is_admin,
      };
      if (editUserForm.password) {
        updateData.password = editUserForm.password;
      }

      await updateUser(editingUser.id, updateData);
      showToast(t("userUpdatedSuccessfullyBang"), "success");
      setEditUserModalOpen(false);
      setEditingUser(null);
    } catch (e) {
      showToast(e.message || t("failedUpdateUser"), "error");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Prevent body scroll when admin panel is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{
          backgroundColor: dark
            ? "rgba(40,40,40,0.95)"
            : "rgba(255,255,255,0.95)",
          borderLeft: "1px solid var(--border-light)",
        }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold">{t("adminPanel")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Settings Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("settings")}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("allowNewAccountCreation")}</span>
                <button
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    adminSettings.allowNewAccounts
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() =>
                    updateAdminSettings({
                      allowNewAccounts: !adminSettings.allowNewAccounts,
                    })
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      adminSettings.allowNewAccounts
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div>
                <label className="text-sm block mb-1">{t("loginSloganLabel")}</label>
                <input
                  type="text"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                  placeholder={t("loginSloganPlaceholder")}
                  value={adminSettings.loginSlogan || ""}
                  onChange={(e) =>
                    setAdminSettings((prev) => ({ ...prev, loginSlogan: e.target.value }))
                  }
                  onBlur={() =>
                    updateAdminSettings({ loginSlogan: adminSettings.loginSlogan || "" })
                  }
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {t("loginSlogan")}
                </p>
              </div>
            </div>
          </div>

          {/* Create User Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("createNewUser")}</h4>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input
                type="text"
                placeholder={t("name")}
                value={newUserForm.name}
                onChange={(e) =>
                  setNewUserForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="text"
                placeholder={t("username")}
                value={newUserForm.email}
                onChange={(e) =>
                  setNewUserForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="password"
                placeholder={t("password")}
                value={newUserForm.password}
                onChange={(e) =>
                  setNewUserForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={newUserForm.is_admin}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({
                      ...prev,
                      is_admin: e.target.checked,
                    }))
                  }
                  className="mr-2"
                />
                <label htmlFor="is_admin" className="text-sm">{t("makeAdmin")}</label>
              </div>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
              >
                {isCreatingUser ? t("creating") : t("createUser")}
              </button>
            </form>
          </div>

          {/* Users List Section */}
          <div>
            <h4 className="text-md font-semibold mb-4">{t("allUsers")} ({allUsers.length})
            </h4>
            <div className="space-y-3">
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  className="p-3 border border-[var(--border-light)] rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.is_admin && (
                        <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded">{t("admin")}</span>
                      )}
                      <button
                        onClick={() => openEditUserModal(user)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      >{t("edit")}</button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => {
                            showGenericConfirm({
                              title: t("deleteUser"),
                              message: t("deleteUserConfirm").replace("{name}", user.name),
                              confirmText: t("delete"),
                              danger: true,
                              onConfirm: () => deleteUser(user.id),
                            });
                          }}
                          className="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                        >{t("delete")}</button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>{t("notes")}: {user.notes}</div>
                    <div>{t("storage")}: {formatBytes(user.storage_bytes ?? 0)}</div>
                    <div>
                      {t("joinedPrefix")} {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{t("editUser")}</h3>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("name")}</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("username")}</label>
                <input
                  type="text"
                  value={editUserForm.email}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("passwordLeaveEmptyKeepCurrent")}</label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder={t("leaveEmptyKeepCurrentPassword")}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_admin"
                  checked={editUserForm.is_admin}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      is_admin: e.target.checked,
                    }))
                  }
                  className="mr-2"
                />
                <label htmlFor="edit_is_admin" className="text-sm">{t("makeAdmin")}</label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditUserModalOpen(false)}
                  className="px-4 py-2 border border-[var(--border-light)] rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >{t("cancel")}</button>
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isUpdatingUser ? t("updating") : t("updateUser")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** ---------- NotesUI (presentational) ---------- */
function NotesUI({
  currentUser,
  dark,
  toggleDark,
  search,
  setSearch,
  composerType,
  setComposerType,
  title,
  setTitle,
  content,
  setContent,
  contentRef,
  clInput,
  setClInput,
  addComposerItem,
  clItems,
  composerDrawingData,
  setComposerDrawingData,
  composerImages,
  setComposerImages,
  composerFileRef,
  tags,
  setTags,
  composerTagList,
  setComposerTagList,
  composerTagInput,
  setComposerTagInput,
  composerTagFocused,
  setComposerTagFocused,
  composerTagInputRef,
  tagsWithCounts,
  composerColor,
  setComposerColor,
  addNote,
  pinned,
  others,
  openModal,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  togglePin,
  addImagesToState,
  onExportAll,
  onImportAll,
  onImportGKeep,
  onImportMd,
  onDownloadSecretKey,
  importFileRef,
  gkeepFileRef,
  mdFileRef,
  signOut,
  filteredEmptyWithSearch,
  allEmpty,
  headerMenuOpen,
  setHeaderMenuOpen,
  headerMenuRef,
  headerBtnRef,
  // new for sidebar
  openSidebar,
  activeTagFilter,
  activeTagFilters = [],
  sidebarPermanent,
  sidebarWidth,
  // formatting
  formatComposer,
  showComposerFmt,
  setShowComposerFmt,
  composerFmtBtnRef,
  onComposerKeyDown,
  // collapsed composer
  composerCollapsed,
  setComposerCollapsed,
  titleRef,
  composerRef,
  // color popover
  colorBtnRef,
  showColorPop,
  setShowColorPop,
  // loading state
  notesLoading,
  // multi-select
  multiMode,
  selectedIds,
  onStartMulti,
  onExitMulti,
  onToggleSelect,
  onSelectAllPinned,
  onSelectAllOthers,
  onBulkDelete,
  onBulkPin,
  onBulkArchive,
  onBulkRestore,
  onBulkColor,
  onBulkDownloadZip,
  // view mode
  listView,
  onToggleViewMode,
  // SSE connection status
  sseConnected,
  isOnline,
  loadNotes,
  loadArchivedNotes,
  // checklist update
  onUpdateChecklistItem,
  // Admin panel
  openAdminPanel,
  // Settings panel
  openSettingsPanel,
  // AI props
  localAiEnabled,
  aiResponse,
  setAiResponse,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  // header auto-hide (mobile)
  windowWidth,
  // floating cards toggle
  floatingCardsEnabled,
  onToggleFloatingCards,
  // sync
  syncStatus,
  handleSyncNow,
}) {
  // Multi-select color popover (local UI state)
  const multiColorBtnRef = useRef(null);
  const [showMultiColorPop, setShowMultiColorPop] = useState(false);

  // Mobile search expand
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);

  // Header auto-hide on scroll (mobile only)
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    if (windowWidth >= 700) {
      setHeaderVisible(true);
      return;
    }
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollYRef.current;
      if (y < 10) {
        setHeaderVisible(true);
      } else if (delta > 4) {
        setHeaderVisible(false);
      } else if (delta < -4) {
        setHeaderVisible(true);
      }
      lastScrollYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [windowWidth]);
  const sectionLabel = (() => {
    if (activeTagFilters.length > 1) return activeTagFilters.join(", ");
    if (activeTagFilters.length === 1) return activeTagFilters[0];
    if (activeTagFilter === ALL_IMAGES) return t("allImages");
    if (activeTagFilter === "ARCHIVED") return t("archivedNotes");
    if (activeTagFilter === "TRASHED") return t("trashedNotes");
    if (activeTagFilter) return activeTagFilter;
    return t("notes");
  })();

  const SectionIcon = (() => {
    if (activeTagFilter === ALL_IMAGES) return ImagesIcon;
    if (activeTagFilter === "ARCHIVED") return ArchiveSidebarIcon;
    if (activeTagFilter === "TRASHED") return TrashSidebarIcon;
    if (activeTagFilter || activeTagFilters.length > 0) return TagIcon;
    return NotesIcon;
  })();

  // Close header menu when scrolling
  React.useEffect(() => {
    if (!headerMenuOpen) return;

    const handleScroll = () => {
      setHeaderMenuOpen(false);
    };

    const scrollContainer = document.querySelector(".min-h-screen");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      });
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }
  }, [headerMenuOpen, setHeaderMenuOpen]);


  return (
    <div
      className="min-h-screen"
      style={{ marginLeft: sidebarPermanent ? `${sidebarWidth}px` : "0px", position:"relative", zIndex:2 }}
    >
      {/* Multi-select toolbar (floats above header when active) */}
      {multiMode && (
        <div
          className="p-3 sm:p-4 flex items-center justify-between sticky top-0 z-[25] glass-card mb-2"
          style={{ position: "sticky" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
              onClick={onBulkDownloadZip}
            >{t("downloadZip")}</button>
            {activeTagFilter === "TRASHED" ? (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkRestore}
                >{t("restoreFromTrash")}</button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("permanentlyDelete")}</button>
              </>
            ) : (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("moveToTrash")}</button>
                <button
                  ref={multiColorBtnRef}
                  type="button"
                  onClick={() => setShowMultiColorPop((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                  data-tooltip={t("color")}
                >{t("colorEmoji")}</button>
                <ColorPickerPanel
                  anchorRef={multiColorBtnRef}
                  open={showMultiColorPop}
                  onClose={() => setShowMultiColorPop(false)}
                  colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                  selectedColor={null}
                  darkMode={dark}
                  onSelect={(name) => { onBulkColor(name); }}
                />
                {activeTagFilter !== "ARCHIVED" && (
                  <button
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                    onClick={() => onBulkPin(true)}
                  >
                    <PinIcon />{t("pin")}</button>
                )}
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkArchive}
                >
                  <ArchiveIcon />
                  {activeTagFilter === "ARCHIVED" ? t("unarchive") : t("archive")}
                </button>
              </>
            )}
            <span className="text-xs opacity-70 ml-2">{t("selectedPrefix")} {selectedIds.length}
            </span>
          </div>
          <button
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            data-tooltip={t("exitMultiSelect")}
            onClick={onExitMulti}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Header */}
      <header
        className={`p-4 sm:p-6 flex justify-between items-center sticky top-0 ${mobileSearchOpen ? "z-[1000]" : "z-20"} glass-card mb-6 relative`}
        style={{
          transform: !headerVisible && windowWidth < 700 ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 0.3s ease",
        }}
      >
        <div className="flex items-center gap-3 shrink-0">
          {/* Hamburger - only show when sidebar is not permanent */}
          {!sidebarPermanent && (
            <button
              onClick={openSidebar}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-tooltip={t("openTags")}
              aria-label={t("openTags")}
            >
              <Hamburger />
            </button>
          )}

          {/* App logo */}
          <img
            src="/favicon-32x32.png"
            srcSet="/pwa-192.png 2x, /pwa-512.png 3x"
            alt={t("glassKeepLogo")}
            className="h-7 w-7 rounded-xl shadow-sm select-none pointer-events-none"
            draggable="false"
          />

          {/* Mobile: stacked name + badge */}
          <div className="flex flex-col sm:hidden leading-tight">
            <h1 className="text-lg font-bold">Glass Keep</h1>
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1 max-w-[160px]">
              <span className="shrink-0 w-3 h-3 [&>svg]:w-3 [&>svg]:h-3"><SectionIcon /></span>
              <span className="truncate">{sectionLabel}</span>
            </span>
          </div>

          {/* Desktop: inline name + separator + badge */}
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-bold">
            Glass Keep
          </h1>
          <span className="hidden sm:inline-block h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <span className="hidden sm:flex text-base font-medium px-3 py-1 rounded-lg bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-600/20 items-center gap-1.5 max-w-[200px]">
            <span className="shrink-0 w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"><SectionIcon /></span>
            <span className="truncate">{sectionLabel}</span>
          </span>

          {/* Offline indicator */}
          {!isOnline && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20">{t("offline")}</span>
          )}
        </div>

        {/* Desktop: full search bar */}
        <div className="hidden sm:flex flex-grow min-w-0 justify-center px-2 sm:px-8">
          <div className="relative w-full max-w-lg">
            <input
              type="text"
              placeholder={localAiEnabled ? t("searchOrAskAi") : t("search")}
              className={`w-full bg-transparent border border-[var(--border-light)] rounded-lg pl-4 ${localAiEnabled ? "pr-14" : "pr-8"} py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  localAiEnabled &&
                  search.trim().length > 0
                ) {
                  onAiSearch?.(search);
                }
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {localAiEnabled && search.trim().length > 0 && (
                <button
                  type="button"
                  data-tooltip={t("askAi")}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                  onClick={() => onAiSearch?.(search)}
                >
                  <Sparkles />
                </button>
              )}
              {search && (
                <button
                  type="button"
                  aria-label={t("clearSearch")}
                  className="h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: search icon that expands into a full search bar */}
        <div className="sm:hidden flex items-center ml-auto mr-1">
          {!mobileSearchOpen && (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600 dark:text-gray-300"
              aria-label={t("search")}
              onClick={() => {
                setMobileSearchOpen(true);
                setTimeout(() => mobileSearchRef.current?.focus(), 50);
              }}
            >
              <SearchIcon />
            </button>
          )}
        </div>
        {/* Mobile expanded search overlay - covers the header content */}
        {mobileSearchOpen && createPortal(
          <div
            className="sm:hidden fixed inset-0 z-[999]"
            onClick={() => setMobileSearchOpen(false)}
          />,
          document.body
        )}
        {mobileSearchOpen && (
          <div className="sm:hidden absolute inset-0 z-30 flex items-center px-3 gap-2 bg-[var(--bg-card,_var(--bg-primary))] backdrop-blur-xl">
            <div className="relative flex-1 min-w-0">
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder={localAiEnabled ? t("searchOrAskAi") : t("search")}
                className={`w-full bg-transparent border border-[var(--border-light)] rounded-lg pl-3 ${localAiEnabled ? "pr-12" : "pr-8"} py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMobileSearchOpen(false);
                  }
                  if (
                    e.key === "Enter" &&
                    localAiEnabled &&
                    search.trim().length > 0
                  ) {
                    onAiSearch?.(search);
                  }
                }}
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {localAiEnabled && search.trim().length > 0 && (
                  <button
                    type="button"
                    className="h-6 w-6 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                    onClick={() => onAiSearch?.(search)}
                  >
                    <Sparkles />
                  </button>
                )}
                {search && (
                  <button
                    type="button"
                    aria-label={t("clearSearch")}
                    className="h-5 w-5 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-3 shrink-0">
          {/* Desktop: icon buttons directly in header bar */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => onToggleViewMode?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/15 focus:ring-blue-500" : "text-blue-600 hover:text-blue-700 hover:bg-blue-100 focus:ring-blue-400"}`}
              data-tooltip={listView ? t("gridView") : t("listView")}
              aria-label={listView ? t("gridView") : t("listView")}
            >
              {listView ? <GridIcon /> : <ListIcon />}
            </button>
            <button
              onClick={() => toggleDark?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 focus:ring-amber-500" : "text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 focus:ring-indigo-400"}`}
              data-tooltip={dark ? t("lightMode") : t("darkMode")}
              aria-label={dark ? t("lightMode") : t("darkMode")}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} />
            <button
              onClick={() => onStartMulti?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-violet-400 hover:text-violet-300 hover:bg-violet-500/15 focus:ring-violet-500" : "text-violet-600 hover:text-violet-700 hover:bg-violet-100 focus:ring-violet-400"}`}
              data-tooltip={t("multiSelect")}
              aria-label={t("multiSelect")}
            >
              <CheckSquareIcon />
            </button>
            <button
              onClick={() => openSettingsPanel?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700 focus:ring-gray-500" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200 focus:ring-gray-400"}`}
              data-tooltip={t("settings")}
              aria-label={t("settings")}
            >
              <SettingsIcon />
            </button>
            <span className={`mx-1 w-px h-5 ${dark ? "bg-gray-600" : "bg-gray-300"}`} />
            {currentUser?.is_admin && (
              <button
                onClick={() => openAdminPanel?.()}
                className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-red-400 hover:text-red-300 hover:bg-red-500/15 focus:ring-red-500" : "text-red-600 hover:text-red-700 hover:bg-red-100 focus:ring-red-400"}`}
                data-tooltip={t("adminPanel")}
                aria-label={t("adminPanel")}
              >
                <ShieldIcon />
              </button>
            )}
            <span className="flex items-center gap-2">
              <UserAvatar
                name={currentUser?.name}
                email={currentUser?.email}
                avatarUrl={currentUser?.avatar_url}
                size="w-7 h-7"
                textSize="text-xs"
                dark={dark}
              />
              <span className={`text-sm font-medium ${dark ? "text-gray-200" : "text-gray-700"}`}>
                {currentUser?.name || currentUser?.email}
              </span>
            </span>
            <button
              onClick={() => signOut?.()}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 text-red-500 dark:text-red-400"
              data-tooltip={t("signOut")}
              aria-label={t("signOut")}
            >
              <LogOutIcon />
            </button>
          </div>

          {/* Mobile: sync icon + 3-dot menu */}
          <div className="sm:hidden flex items-center gap-1">
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} />
            <button
              ref={headerBtnRef}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
              data-tooltip={t("menu")}
              aria-haspopup="menu"
              aria-expanded={headerMenuOpen}
            >
              <Kebab />
            </button>

            {headerMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[1099]"
                  onClick={() => setHeaderMenuOpen(false)}
                />
                <div
                  ref={headerMenuRef}
                  className={`absolute top-12 right-0 min-w-[220px] z-[1100] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                  style={{ backgroundColor: dark ? "#222222" : undefined }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      openSettingsPanel?.();
                    }}
                  >
                    <span className={dark ? "text-gray-400" : "text-gray-500"}><SettingsIcon /></span>{t("settings")}</button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onToggleViewMode?.();
                    }}
                  >
                    <span className={dark ? "text-blue-400" : "text-blue-600"}>{listView ? <GridIcon /> : <ListIcon />}</span>
                    {listView ? t("gridView") : t("listView")}
                  </button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      toggleDark?.();
                    }}
                  >
                    <span className={dark ? "text-amber-400" : "text-indigo-600"}>{dark ? <SunIcon /> : <MoonIcon />}</span>
                    {dark ? t("lightMode") : t("darkMode")}
                  </button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onStartMulti?.();
                    }}
                  >
                    <span className={dark ? "text-violet-400" : "text-violet-600"}><CheckSquareIcon /></span>{t("multiSelect")}</button>
                  {currentUser?.is_admin && (
                    <button
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        openAdminPanel?.();
                      }}
                    >
                      <span className={dark ? "text-red-400" : "text-red-600"}><ShieldIcon /></span>{t("adminPanel")}</button>
                  )}
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "text-red-400 hover:bg-white/10" : "text-red-600 hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      signOut?.();
                    }}
                  >
                    <LogOutIcon />{t("signOut")}</button>
                </div>
              </>
            )}
          </div>

          {/* Hidden import input */}
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportAll?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {/* Hidden Google Keep import input (multiple) */}
          <input
            ref={gkeepFileRef}
            type="file"
            accept="application/json"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportGKeep?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {/* Hidden Markdown import input (multiple) */}
          <input
            ref={mdFileRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportMd?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </header>

      {/* AI Response Box */}
      {localAiEnabled && (aiResponse || isAiLoading) && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
          <div className="max-w-2xl mx-auto glass-card rounded-xl shadow-lg p-5 border border-indigo-500/30 relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 z-[50]">
            {isAiLoading && (
              <div
                className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300"
                style={{
                  width: aiLoadingProgress ? `${aiLoadingProgress}%` : "5%",
                }}
              />
            )}
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-semibold text-indigo-700 dark:text-indigo-300">{t("aiAssistant")}</h3>
              {aiResponse && !isAiLoading && (
                <button
                  onClick={() => {
                    setAiResponse(null);
                    setSearch("");
                  }}
                  className="ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  data-tooltip={t("clearResponse")}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {isAiLoading ? (
                <p className="animate-pulse text-gray-500 italic flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />{t("aiAssistantThinking")}</p>
              ) : (
                <div
                  className="text-gray-800 dark:text-gray-200 note-content"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(aiResponse),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Composer — hidden in trash and archive views */}
      {activeTagFilter !== "TRASHED" && activeTagFilter !== "ARCHIVED" && (
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
          {(
            <div
              ref={composerRef}
              className="glass-card rounded-xl shadow-lg p-4 mb-8 relative"
              style={{ backgroundColor: bgFor(composerColor, dark) }}
            >
              {/* Collapsed single input */}
              {composerCollapsed ? (
                <input
                  value={content}
                  onChange={(e) => {}}
                  onFocus={() => {
                    // expand and focus title
                    setComposerCollapsed(false);
                    setTimeout(() => titleRef.current?.focus(), 10);
                  }}
                  placeholder={t("writeNote")}
                  className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
                />
              ) : (
                <>
                  {/* Title */}
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("noteTitle")}
                    className="w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2"
                  />

                  {/* Body, Checklist, or Drawing */}
                  {composerType === "text" ? (
                    <textarea
                      ref={contentRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder={t("writeNote")}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none p-2"
                      rows={1}
                    />
                  ) : composerType === "checklist" ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={clInput}
                          onChange={(e) => setClInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addComposerItem();
                            }
                          }}
                          placeholder={t("listItemEllipsis")}
                          className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                        />
                        <button
                          onClick={addComposerItem}
                          className="px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        >{t("add")}</button>
                      </div>
                      {clItems.length > 0 && (
                        <div className="space-y-2">
                          {clItems.map((it) => (
                            <ChecklistRow
                              key={it.id}
                              item={it}
                              readOnly
                              disableToggle
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <DrawingCanvas
                      data={composerDrawingData}
                      onChange={setComposerDrawingData}
                      width={650}
                      height={450}
                      readOnly={false}
                      darkMode={dark}
                      hideModeToggle={true}
                    />
                  )}

                  {/* Composer image thumbnails */}
                  {composerImages.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {composerImages.map((im) => (
                        <div key={im.id} className="relative">
                          <img
                            src={im.src}
                            alt={im.name}
                            className="h-16 w-24 object-cover rounded-md border border-[var(--border-light)]"
                          />
                          <button
                            data-tooltip={t("removeImage")}
                            className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                            onClick={() =>
                              setComposerImages((prev) =>
                                prev.filter((x) => x.id !== im.id),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Responsive composer footer */}
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 relative" style={{ zIndex: 200, position: "relative" }}>
                    {/* Tag chips + suggestions (composer) */}
                    <div className="w-full sm:flex-1 flex flex-wrap items-center gap-1 p-2 min-h-[36px] relative z-[100]">
                      {composerTagList.map((ctag, i) => (
                        <span
                          key={ctag + i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        >
                          {ctag}
                          <button
                            type="button"
                            onClick={() => setComposerTagList((prev) => prev.filter((_, idx) => idx !== i))}
                            className="hover:text-red-500 font-bold"
                          >×</button>
                        </span>
                      ))}
                      {(
                        <div className="relative flex-1 min-w-[8ch]">
                          <input
                            ref={composerTagInputRef}
                            value={composerTagInput}
                            onChange={(e) => setComposerTagInput(e.target.value)}
                            onFocus={() => setComposerTagFocused(true)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === ",") && composerTagInput.trim()) {
                                e.preventDefault();
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                              } else if (e.key === "Backspace" && !composerTagInput && composerTagList.length) {
                                setComposerTagList((prev) => prev.slice(0, -1));
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                                setComposerTagFocused(false);
                              }, 200);
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pasted = e.clipboardData.getData("text");
                              const newTags = pasted.split(",").map((t) => t.trim()).filter(Boolean);
                              const unique = newTags.filter(
                                (t) => !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                              if (unique.length) setComposerTagList((prev) => [...prev, ...unique]);
                            }}
                            type="text"
                            placeholder={composerTagList.length ? t("addTag") : t("addTagsCommaSeparated")}
                            className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none w-full"
                          />
                          {composerTagFocused && (() => {
                            const suggestions = tagsWithCounts
                              .filter(
                                ({ tag: t }) =>
                                  (!composerTagInput.trim() || t.toLowerCase().includes(composerTagInput.toLowerCase())) &&
                                  !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                            const trimmed = composerTagInput.trim();
                            const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !composerTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
                            if (suggestions.length === 0 && !isNew) return null;
                            const rect = composerTagInputRef.current?.getBoundingClientRect();
                            if (!rect) return null;
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const dropUp = spaceBelow < 220;
                            return createPortal(
                              <div
                                style={{
                                  position: "fixed",
                                  ...(dropUp
                                    ? { bottom: window.innerHeight - rect.top + 6, left: rect.left }
                                    : { top: rect.bottom + 6, left: rect.left }),
                                  width: Math.max(rect.width, 220),
                                  zIndex: 99999,
                                }}
                                className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 max-h-52 overflow-y-auto overflow-x-hidden ring-1 ring-black/5 dark:ring-white/5"
                              >
                                {suggestions.length > 0 && (
                                  <div className="px-3 pt-2.5 pb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                                  </div>
                                )}
                                <div className="px-1.5 pb-1.5">
                                  {suggestions.map(({ tag: stag, count }) => (
                                    <button
                                      key={stag}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (!composerTagList.map((x) => x.toLowerCase()).includes(stag.toLowerCase())) {
                                          setComposerTagList((prev) => [...prev, stag]);
                                        }
                                        setComposerTagInput("");
                                        composerTagInputRef.current?.blur();
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                            <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                          </svg>
                                        </span>
                                        <span className="truncate font-medium">{stag}</span>
                                      </span>
                                      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                                    </button>
                                  ))}
                                </div>
                                {isNew && (
                                  <>
                                    {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                                    <div className="px-1.5 py-1.5">
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (!composerTagList.map((x) => x.toLowerCase()).includes(trimmed.toLowerCase())) {
                                            setComposerTagList((prev) => [...prev, trimmed]);
                                          }
                                          setComposerTagInput("");
                                          composerTagInputRef.current?.blur();
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                                      >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                                          </svg>
                                        </span>
                                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Créer"} "<span className="font-semibold">{trimmed}</span>"</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>,
                              document.body
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-none relative">
                      {/* Formatting button (composer) - only for text mode */}
                      {composerType === "text" && (
                        <>
                          <button
                            ref={composerFmtBtnRef}
                            type="button"
                            onClick={() => setShowComposerFmt((v) => !v)}
                            className="px-2.5 py-1.5 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 hover:from-violet-100 hover:to-purple-100 hover:border-violet-300 hover:scale-105 hover:shadow-md hover:shadow-violet-200/60 dark:hover:shadow-none active:scale-95 dark:from-violet-900/30 dark:to-purple-900/20 dark:border-violet-700/60 dark:text-violet-400 dark:hover:from-violet-800/40 dark:hover:to-purple-800/30 flex items-center gap-1.5 text-sm font-medium transition-all duration-200 flex-shrink-0"
                            data-tooltip={t("formatting")}
                          >
                            <FormatIcon />{t("formatting")}</button>
                          <Popover
                            anchorRef={composerFmtBtnRef}
                            open={showComposerFmt}
                            onClose={() => setShowComposerFmt(false)}
                          >
                            <FormatToolbar
                              dark={dark}
                              onAction={(t) => {
                                setShowComposerFmt(false);
                                formatComposer(t);
                              }}
                            />
                          </Popover>
                        </>
                      )}

                      {/* Type selection buttons */}
                      <div className="flex gap-1 bg-black/5 dark:bg-white/5 rounded-2xl p-1">
                        <button
                          type="button"
                          onClick={() => setComposerType("text")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "text"
                              ? "bg-gradient-to-br from-rose-400 to-pink-500 text-white border-transparent shadow-md shadow-rose-300/50 dark:shadow-none scale-105"
                              : "border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50/60 text-rose-400 hover:from-rose-100 hover:to-pink-100 hover:border-rose-300 hover:scale-105 hover:shadow-sm hover:shadow-rose-200/50 dark:hover:shadow-none dark:from-rose-900/20 dark:to-pink-900/10 dark:border-rose-700/50 dark:text-rose-400 dark:hover:from-rose-800/30 dark:hover:to-pink-800/20"
                          }`}
                          data-tooltip={t("textNote")}
                        >
                          <TextNoteIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("checklist")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "checklist"
                              ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white border-transparent shadow-md shadow-emerald-300/50 dark:shadow-none scale-105"
                              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-green-50/60 text-emerald-500 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:scale-105 hover:shadow-sm hover:shadow-emerald-200/50 dark:hover:shadow-none dark:from-emerald-900/20 dark:to-green-900/10 dark:border-emerald-700/50 dark:text-emerald-400 dark:hover:from-emerald-800/30 dark:hover:to-green-800/20"
                          }`}
                          data-tooltip={t("checklist")}
                        >
                          <ChecklistIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("draw")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "draw"
                              ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white border-transparent shadow-md shadow-orange-300/50 dark:shadow-none scale-105"
                              : "border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/60 text-orange-400 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:scale-105 hover:shadow-sm hover:shadow-orange-200/50 dark:hover:shadow-none dark:from-orange-900/20 dark:to-amber-900/10 dark:border-orange-700/50 dark:text-orange-400 dark:hover:from-orange-800/30 dark:hover:to-amber-800/20"
                          }`}
                          data-tooltip={t("drawing")}
                        >
                          <BrushIcon />
                        </button>
                      </div>

                      {/* Color dropdown (composer) */}
                      <button
                        ref={colorBtnRef}
                        type="button"
                        onClick={() => setShowColorPop((v) => !v)}
                        className="p-1.5 rounded-xl border-2 border-gray-200/80 bg-gradient-to-br from-white to-gray-50/60 hover:from-gray-50 hover:to-slate-100/60 hover:border-gray-300 hover:scale-105 hover:shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:from-gray-800/60 dark:to-gray-700/40 dark:border-gray-600/60 dark:hover:from-gray-700/70 dark:hover:to-gray-600/50 dark:hover:border-gray-500 transition-all duration-200 flex items-center justify-center"
                        data-tooltip={t("color")}
                      >
                        <PaletteColorIcon size={22} />
                      </button>
                      <ColorPickerPanel
                        anchorRef={colorBtnRef}
                        open={showColorPop}
                        onClose={() => setShowColorPop(false)}
                        colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                        selectedColor={composerColor}
                        darkMode={dark}
                        onSelect={(name) => setComposerColor(name)}
                      />

                      {/* Add Image (composer) */}
                      <input
                        ref={composerFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const results = [];
                          for (const f of files) {
                            try {
                              const src = await fileToCompressedDataURL(f);
                              results.push({ id: uid(), src, name: f.name });
                            } catch (e) {}
                          }
                          if (results.length)
                            setComposerImages((prev) => [...prev, ...results]);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => composerFileRef.current?.click()}
                        className="p-1.5 text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 flex-shrink-0 transition-colors duration-200"
                        data-tooltip={t("addImages")}
                      >
                        <AddImageIcon />
                      </button>

                      {/* Add Note */}
                      <button
                        onClick={addNote}
                        className="px-4 py-2 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-200 whitespace-nowrap flex-shrink-0 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("addNote")}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Notes lists */}
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {pinned.length > 0 && (
          <section className="mb-10">
            {listView ? (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  {t("pinned")}
                </h2>
              </div>
            ) : (
              <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                {t("pinned")}
              </h2>
            )}
            {listView ? (
              <div className="max-w-2xl mx-auto space-y-6">
                {pinned.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </div>
            ) : (
              <Masonry
                breakpointCols={{default: 7, 1835: 6, 1587: 5, 1339: 4, 1089: 3, 767: 2}}
                className="masonry-grid"
                columnClassName="masonry-grid-column"
              >
                {pinned.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </Masonry>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section>
            {pinned.length > 0 &&
              (listView ? (
                <div className="max-w-2xl mx-auto">
                  <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                    {t("others")}
                  </h2>
                </div>
              ) : (
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  {t("others")}
                </h2>
              ))}
            {listView ? (
              <div className="max-w-2xl mx-auto space-y-6">
                {others.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </div>
            ) : (
              <Masonry
                breakpointCols={{default: 7, 1835: 6, 1587: 5, 1339: 4, 1089: 3, 767: 2}}
                className="masonry-grid"
                columnClassName="masonry-grid-column"
              >
                {others.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </Masonry>
            )}
          </section>
        )}

        {notesLoading && pinned.length + others.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            Loading Notes…
          </p>
        )}
        {!notesLoading && filteredEmptyWithSearch && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">{t("noMatchingNotes")}</p>
        )}
        {!notesLoading && allEmpty && (
          <div className="text-center mt-10 px-4">
            <p className="text-gray-500 dark:text-gray-400">
              {activeTagFilter === "TRASHED" ? t("noTrashedNotes") : activeTagFilter === "ARCHIVED" ? t("noMatchingNotes") : t("noNotesYet")}
            </p>
            {syncStatus?.syncState === "offline" && (
              <p className="mt-2 text-sm text-amber-500 dark:text-amber-400">
                {t("offlineViewNotLoaded")}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** ---------- AdminView ---------- */
function AdminView({ dark }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const sess = getAuth();
  const token = sess?.token;

  const formatBytes = (n = 0) => {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const e = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const v = n / Math.pow(1024, e);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[e]}`;
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e.message || t("failedLoadAdminData"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      alert(e.message || t("deleteFailed"));
    }
  }

  useEffect(() => {
    load();
  }, []); // load once

  return (
    <div className="min-h-screen px-4 sm:px-6 md:px-8 lg:px-12 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">{t("admin")}</h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Manage registered users. You can remove users (this also deletes their
          notes).
        </p>

        <div className="glass-card rounded-xl p-4 shadow-lg overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">{t("users")}</h2>
            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
            >
              {loading ? t("refreshing") : t("refresh")}
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--border-light)]">
                <th className="py-2 pr-3">{t("name")}</th>
                <th className="py-2 pr-3">{t("emailOrUsername")}</th>
                <th className="py-2 pr-3">{t("notes")}</th>
                <th className="py-2 pr-3">{t("storage")}</th>
                <th className="py-2 pr-3">{t("admin")}</th>
                <th className="py-2 pr-3">{t("created")}</th>
                <th className="py-2 pr-3">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-6 text-center text-gray-500 dark:text-gray-400"
                  >{t("noUsersFound")}</td>
                </tr>
              )}
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border-light)] last:border-0"
                >
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{u.notes ?? 0}</td>
                  <td className="py-2 pr-3">
                    {formatBytes(u.storage_bytes ?? 0)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_admin
                          ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                          : "bg-gray-500/10 text-gray-700 dark:text-gray-300 border border-gray-500/20"
                      }`}
                    >
                      {u.is_admin ? t("yes") : t("no")}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="px-2.5 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                      onClick={() => {
                        showGenericConfirm({
                          title: t("deleteUser"),
                          message: t("deleteUserAllNotesConfirm"),
                          confirmText: t("delete"),
                          danger: true,
                          onConfirm: () => removeUser(u.id),
                        });
                      }}
                      data-tooltip={t("deleteUser")}
                    >{t("delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ---------- App ---------- */
function TooltipPortal() {
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => {
    let timer = null;

    const getTooltipData = (el) => {
      const label = el.getAttribute('data-tooltip');
      if (!label) return null;
      const rect = el.getBoundingClientRect();
      const below = rect.top < 60;
      return { label, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below };
    };

    // Desktop: mouse pointer only (pointerType === 'mouse' excludes touch/pen)
    const show = (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const data = getTooltipData(el);
        if (data) setTooltip(data);
      }, 600);
    };
    const hide = (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      setTooltip(null);
    };

    // Mobile: show only after 2s long press, stay visible 2s after release
    let hideTimer = null;
    const touchStart = (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const data = getTooltipData(el);
        if (data) {
          setTooltip(data);
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => setTooltip(null), 5000);
        }
      }, 1000);
    };
    const touchEnd = () => clearTimeout(timer); // cancel pending show, keep visible if already shown
    const touchCancel = () => {
      clearTimeout(timer);
      setTooltip(null); // scroll/move cancels immediately
    };

    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchend', touchEnd);
    document.addEventListener('touchmove', touchCancel, { passive: true });
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      document.removeEventListener('pointerover', show);
      document.removeEventListener('pointerout', hide);
      document.removeEventListener('touchstart', touchStart);
      document.removeEventListener('touchend', touchEnd);
      document.removeEventListener('touchmove', touchCancel);
    };
  }, []);
  const boxRef = useRef(null);
  useLayoutEffect(() => {
    if (!tooltip || !boxRef.current) return;
    const el = boxRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    let shift = 0;
    if (rect.left < pad) shift = pad - rect.left;
    else if (rect.right > vw - pad) shift = vw - pad - rect.right;
    if (shift !== 0) {
      el.style.transform = tooltip.below
        ? `translateX(calc(-50% + ${shift}px))`
        : `translate(calc(-50% + ${shift}px), -100%)`;
    }
  }, [tooltip]);

  if (!tooltip) return null;
  return createPortal(
    <div
      ref={boxRef}
      className="pointer-events-none fixed z-[100001]"
      style={tooltip.below
        ? { top: tooltip.y + 8, left: tooltip.x, transform: 'translateX(-50%)' }
        : { top: tooltip.y - 8, left: tooltip.x, transform: 'translate(-50%, -100%)' }
      }
    >
      <div className="px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded-lg whitespace-nowrap shadow-xl">
        {tooltip.label}
        <div className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltip.below ? 'bottom-full border-b-gray-800' : 'top-full border-t-gray-800'}`} />
      </div>
    </div>,
    document.body
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash || "#/login");

  // auth session { token, user }
  const [session, setSession] = useState(getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;

  // Theme
  const [dark, setDark] = useState(false);

  // Screen width for responsive behavior
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [allNotesForTags, setAllNotesForTags] = useState([]);
  const [search, setSearch] = useState("");

  // ─── Local-first sync state ───
  // Canonical reset shape — used at init, cleanup, and sign-out to avoid divergence.
  const SYNC_STATUS_RESET = useMemo(() => ({
    syncState: "checking", serverReachable: null, hasPendingChanges: false, isSyncing: false,
    lastSyncAt: null, lastSyncError: null,
    pending: 0, processing: 0, failed: 0, total: 0, items: [],
  }), []);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS_RESET);
  const syncEngineRef = useRef(null);
  const reconnectSseRef = useRef(null); // called when server recovers to revive SSE
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const tagFilterRef = useRef(tagFilter);
  const [activeTagFilters, setActiveTagFilters] = useState([]); // multi-tag filter
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebarAlwaysVisible");
      // Use localStorage value if available, otherwise null (wait for server)
      return stored !== null ? stored === "true" : null;
    } catch (e) {
      return null;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem("sidebarWidth")) || 288;
    } catch (e) {
      return 288;
    }
  });

  // Floating cards decoration toggle
  const [floatingCardsEnabled, setFloatingCardsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("floatingCardsEnabled");
      if (stored !== null) return stored === "true";
      // Default: enabled on desktop (pointer:fine), disabled on mobile/tablet
      return window.matchMedia?.("(pointer: fine)").matches ?? true;
    } catch (e) {
      return true;
    }
  });
  const toggleFloatingCards = useCallback(() => {
    setFloatingCardsEnabled((v) => {
      const next = !v;
      try { localStorage.setItem("floatingCardsEnabled", String(next)); } catch (e) {}
      return next;
    });
  }, []);

  // Local AI
  const [localAiEnabled, setLocalAiEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("localAiEnabled");
      return stored === null ? false : stored === "true";
    } catch (e) {
      return false;
    }
  });
  const [aiResponse, setAiResponse] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(null);

  // Composer
  const [composerType, setComposerType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [composerTagList, setComposerTagList] = useState([]);
  const [composerTagInput, setComposerTagInput] = useState("");
  const [composerTagFocused, setComposerTagFocused] = useState(false);
  const composerTagInputRef = useRef(null);
  const [composerColor, setComposerColor] = useState("default");
  const [composerImages, setComposerImages] = useState([]);
  const contentRef = useRef(null);
  const composerFileRef = useRef(null);

  // Formatting (composer)
  const [showComposerFmt, setShowComposerFmt] = useState(false);
  const composerFmtBtnRef = useRef(null);

  // Checklist composer
  const [clItems, setClItems] = useState([]);
  const [clInput, setClInput] = useState("");

  // Drawing composer
  const [composerDrawingData, setComposerDrawingData] = useState({
    paths: [],
    dimensions: null,
  });

  // Modal state
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mType, setMType] = useState("text");
  const [mTitle, setMTitle] = useState("");
  const [mBody, setMBody] = useState("");
  const [mTagList, setMTagList] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [modalTagFocused, setModalTagFocused] = useState(false);
  const modalTagInputRef = useRef(null);
  const modalTagBtnRef = useRef(null);
  const suppressTagBlurRef = useRef(false);
  const [mColor, setMColor] = useState("default");
  const [viewMode, setViewMode] = useState(true);
  const [mImages, setMImages] = useState([]);
  const [savingModal, setSavingModal] = useState(false);
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [genericConfirmOpen, setGenericConfirmOpen] = useState(false);
  const [genericConfirmConfig, setGenericConfirmConfig] = useState({});
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalClosingTimerRef = useRef(null);

  // Toast notification system
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = "success", duration = 3000) => {
    const id = Date.now();
    const toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  };

  // Generic confirmation dialog helper
  const showGenericConfirm = (config) => {
    setGenericConfirmConfig(config);
    setGenericConfirmOpen(true);
  };
  const [mItems, setMItems] = useState([]);
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const [mInput, setMInput] = useState("");

  // Drawing modal
  const [mDrawingData, setMDrawingData] = useState({
    paths: [],
    dimensions: null,
  });
  const skipNextDrawingAutosave = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });

  // Clear data when switching composer types
  useEffect(() => {
    if (composerType === "text") {
      setClItems([]);
      setClInput("");
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "checklist") {
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "draw") {
      setClItems([]);
      setClInput("");
    }
  }, [composerType]);

  // Collaboration modal
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [addModalCollaborators, setAddModalCollaborators] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const collaboratorInputRef = useRef(null);

  // Modal formatting
  const [showModalFmt, setShowModalFmt] = useState(false);
  const modalFmtBtnRef = useRef(null);

  // Modal color popover
  const modalColorBtnRef = useRef(null);
  const [showModalColorPop, setShowModalColorPop] = useState(false);

  // Image Viewer state (fullscreen)
  const [imgViewOpen, setImgViewOpen] = useState(false);
  const [imgViewIndex, setImgViewIndex] = useState(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const mobileNavTimer = useRef(null);
  const resetMobileNav = () => {
    setMobileNavVisible(true);
    clearTimeout(mobileNavTimer.current);
    mobileNavTimer.current = setTimeout(() => setMobileNavVisible(false), 3000);
  };

  // Drag
  const dragId = useRef(null);
  const dragGroup = useRef(null);

  // Checklist item drag (for modal reordering)
  const checklistDragId = useRef(null);


  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null);
  const gkeepFileRef = useRef(null);
  const mdFileRef = useRef(null);

  // Modal kebab anchor
  const modalMenuBtnRef = useRef(null);

  // Composer collapse + refs
  const [composerCollapsed, setComposerCollapsed] = useState(true);
  const titleRef = useRef(null);
  const composerRef = useRef(null);

  // Color dropdown (composer)
  const colorBtnRef = useRef(null);
  const [showColorPop, setShowColorPop] = useState(false);

  // Scrim click tracking to avoid closing when drag starts inside modal
  const scrimClickStartRef = useRef(false);

  // For code copy buttons in view mode
  const noteViewRef = useRef(null);

  // Loading state for notes
  const [notesLoading, setNotesLoading] = useState(false);
  const notesAreRegular = useRef(true); // tracks whether notes[] holds regular (non-archive/trash) notes
  const localEditDirtyRef = useRef(null); // noteId with unsaved local edits (set before debounce fires)
  // Remove lazy loading state

  // -------- Multi-select state --------
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of string ids
  const isSelected = (id) => selectedIds.includes(String(id));
  const onStartMulti = () => {
    setMultiMode(true);
    setSelectedIds([]);
  };
  const onExitMulti = () => {
    setMultiMode(false);
    setSelectedIds([]);
  };
  const onToggleSelect = (id, checked) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, sid]))
        : prev.filter((x) => x !== sid),
    );
  };
  const onSelectAllPinned = () => {
    const ids = notes.filter((n) => n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const onSelectAllOthers = () => {
    const ids = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  // -------- View mode: Grid vs List --------
  const [listView, setListView] = useState(() => {
    try {
      return localStorage.getItem("viewMode") === "list";
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("viewMode", listView ? "list" : "grid");
    } catch (e) {}
  }, [listView]);
  const onToggleViewMode = () => setListView((v) => !v);

  // Load user settings from server on login
  const sidebarSettingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!token) return;
    sidebarSettingsLoadedRef.current = false;
    // Immediately hide sidebar while loading server preference
    try {
      if (localStorage.getItem("sidebarAlwaysVisible") === null) {
        setAlwaysShowSidebarOnWide(null);
      }
    } catch (e) {}
    (async () => {
      try {
        const settings = await api("/user/settings", { token });
        if (settings && typeof settings.alwaysShowSidebarOnWide === "boolean") {
          setAlwaysShowSidebarOnWide(settings.alwaysShowSidebarOnWide);
          localStorage.setItem("sidebarAlwaysVisible", String(settings.alwaysShowSidebarOnWide));
        } else {
          // No server setting yet — default to true (new user)
          setAlwaysShowSidebarOnWide(true);
        }
        if (settings && typeof settings.floatingCardsEnabled === "boolean") {
          setFloatingCardsEnabled(settings.floatingCardsEnabled);
          localStorage.setItem("floatingCardsEnabled", String(settings.floatingCardsEnabled));
        }
      } catch (e) {
        // Network error — default to true
        setAlwaysShowSidebarOnWide((prev) => prev === null ? true : prev);
      } finally {
        sidebarSettingsLoadedRef.current = true;
      }
    })();
  }, [token]);

  // Save sidebar settings to localStorage and server
  useEffect(() => {
    try {
      localStorage.setItem(
        "sidebarAlwaysVisible",
        String(alwaysShowSidebarOnWide),
      );
    } catch (e) {}
    // Only sync to server after initial load from server is done
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { alwaysShowSidebarOnWide },
      }).catch(() => {});
    }
  }, [alwaysShowSidebarOnWide]);

  // Save floating cards preference to localStorage and server
  useEffect(() => {
    try { localStorage.setItem("floatingCardsEnabled", String(floatingCardsEnabled)); } catch (e) {}
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { floatingCardsEnabled },
      }).catch(() => {});
    }
  }, [floatingCardsEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarWidth", String(sidebarWidth));
    } catch (e) {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("localAiEnabled", String(localAiEnabled));
    } catch (e) {}
    if (!localAiEnabled) setAiResponse(null);
  }, [localAiEnabled]);

  // Window resize listener for responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Collapse composer when clicking outside
  useEffect(() => {
    if (composerCollapsed) return;
    const handleClickOutside = (e) => {
      if (composerRef.current && !composerRef.current.contains(e.target)) {
        setComposerCollapsed(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [composerCollapsed]);

  const onBulkDelete = async () => {
    if (!selectedIds.length) return;

    if (tagFilter === "TRASHED") {
      showGenericConfirm({
        title: t("permanentlyDelete"),
        message: t("permanentlyDeleteConfirm"),
        confirmText: t("permanentlyDelete"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          for (const id of selectedIds) {
            try { await idbDeleteNote(String(id)); } catch (e) { console.error(e); }
            enqueueAndSync({ type: "permanentDelete", noteId: String(id) });
          }
          invalidateTrashedNotesCache();
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success");
        },
      });
    } else {
      showGenericConfirm({
        title: t("moveToTrash"),
        message: t("bulkMoveToTrashConfirm").replace("{count}", String(selectedIds.length)),
        confirmText: t("moveToTrash"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          for (const id of selectedIds) {
            try {
              const existing = await idbGetNote(String(id));
              if (existing) await idbPutNote({ ...existing, trashed: true });
            } catch (e) { console.error(e); }
            enqueueAndSync({ type: "trash", noteId: String(id) });
          }
          invalidateNotesCache();
          invalidateArchivedNotesCache();
          invalidateTrashedNotesCache();
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkTrashedSuccess").replace("{count}", String(count)), "success");
        },
      });
    }
  };

  const onBulkPin = async (pinnedVal) => {
    if (!selectedIds.length) return;
    // Local-first: update UI + IndexedDB, then enqueue
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id))
          ? { ...n, pinned: !!pinnedVal }
          : n,
      ),
    );
    for (const id of selectedIds) {
      try {
        const existing = await idbGetNote(String(id));
        if (existing) await idbPutNote({ ...existing, pinned: !!pinnedVal });
      } catch (e) { console.error(e); }
      enqueueAndSync({ type: "patch", noteId: String(id), payload: { pinned: !!pinnedVal } });
    }
    invalidateNotesCache();
    invalidateArchivedNotesCache();
  };

  const onBulkRestore = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    for (const id of selectedIds) {
      try {
        const existing = await idbGetNote(String(id));
        if (existing) await idbPutNote({ ...existing, trashed: false });
      } catch (e) { console.error(e); }
      enqueueAndSync({ type: "restore", noteId: String(id) });
    }
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    onExitMulti();
    showToast(t("bulkRestoredSuccess").replace("{count}", String(count)), "success");
  };

  const onBulkArchive = async () => {
    if (!selectedIds.length) return;

    const isArchiving = tagFilter !== "ARCHIVED";
    const archivedValue = isArchiving;
    const count = selectedIds.length;

    // Local-first: update IndexedDB + UI, then enqueue
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    for (const id of selectedIds) {
      try {
        const existing = await idbGetNote(String(id));
        if (existing) await idbPutNote({ ...existing, archived: !!archivedValue });
      } catch (e) { console.error(e); }
      enqueueAndSync({ type: "archive", noteId: String(id), payload: { archived: !!archivedValue } });
    }
    invalidateNotesCache();
    invalidateArchivedNotesCache();

    if (!isArchiving && tagFilter === "ARCHIVED") {
      // Unarchiving from archived view — remove them from current list and switch view
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      setTagFilter(null);
    } else if (isArchiving) {
      // Archiving from normal view — remove them from current list
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    }

    onExitMulti();
    showToast(t(isArchiving ? "bulkArchivedSuccess" : "bulkUnarchivedSuccess").replace("{count}", String(count)), "success");
  };

  const onUpdateChecklistItem = async (noteId, itemId, checked) => {
    const note = notes.find((n) => String(n.id) === String(noteId));
    if (!note) return;

    const updatedItems = (note.items || []).map((item) =>
      item.id === itemId ? { ...item, done: checked } : item,
    );
    const updatedNote = { ...note, items: updatedItems };

    // Local-first: update UI + IndexedDB, then enqueue
    setNotes((prev) =>
      prev.map((n) => (String(n.id) === String(noteId) ? updatedNote : n)),
    );
    try {
      const existing = await idbGetNote(String(noteId));
      if (existing) await idbPutNote({ ...existing, items: updatedItems });
    } catch (e) { console.error(e); }

    invalidateNotesCache();
    invalidateArchivedNotesCache();
    enqueueAndSync({ type: "patch", noteId: String(noteId), payload: { items: updatedItems, type: "checklist", content: "" } });
  };

  const onBulkColor = async (colorName) => {
    if (!selectedIds.length) return;
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id)) ? { ...n, color: colorName } : n,
      ),
    );
    for (const id of selectedIds) {
      try {
        const existing = await idbGetNote(String(id));
        if (existing) await idbPutNote({ ...existing, color: colorName });
      } catch (e) { console.error(e); }
      enqueueAndSync({ type: "patch", noteId: String(id), payload: { color: colorName } });
    }
  };

  const onBulkDownloadZip = async () => {
    try {
      const ids = new Set(selectedIds);
      const chosen = notes.filter((n) => ids.has(String(n.id)));
      if (!chosen.length) return;
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      chosen.forEach((n, idx) => {
        const md = mdForDownload(n);
        const base = sanitizeFilename(
          n.title || `note-${String(n.id).slice(-6)}`,
        );
        zip.file(`${base || `note-${idx + 1}`}.md`, md);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      triggerBlobDownload(`glass-keep-selected-${ts}.zip`, blob);
    } catch (e) {
      alert(e.message || t("zipDownloadFailed"));
    }
  };

  // NEW: modal scroll container ref + state to place Edited at bottom when not scrollable
  const modalScrollRef = useRef(null);
  const [modalScrollable, setModalScrollable] = useState(false);
  const savedModalScrollRatioRef = useRef(0);

  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Admin panel state
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminSettings, setAdminSettings] = useState({
    allowNewAccounts: true,
    loginSlogan: "",
  });
  const [allUsers, setAllUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false,
  });
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loginSlogan, setLoginSlogan] = useState("");
  const [loginProfiles, setLoginProfiles] = useState([]);

  // Settings panel state
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // Derived: Active note + edited text
  const activeNoteObj = useMemo(
    () => notes.find((x) => String(x.id) === String(activeId)),
    [notes, activeId],
  );
  const editedStamp = useMemo(() => {
    const ts = activeNoteObj?.updated_at || activeNoteObj?.timestamp;
    const baseStamp = ts ? formatEditedStamp(ts) : "";

    // Add collaborator info if available
    if (activeNoteObj?.lastEditedBy && activeNoteObj?.lastEditedAt) {
      const editorName = activeNoteObj.lastEditedBy;
      const editTime = formatEditedStamp(activeNoteObj.lastEditedAt);
      return `${editorName}, ${editTime}`;
    }

    return baseStamp;
  }, [activeNoteObj]);

  const modalHasChanges = useMemo(() => {
    if (!activeNoteObj) return false;
    if ((mTitle || "") !== (activeNoteObj.title || "")) return true;
    if ((mColor || "default") !== (activeNoteObj.color || "default"))
      return true;
    const tagsA = JSON.stringify(mTagList || []);
    const tagsB = JSON.stringify(activeNoteObj.tags || []);
    if (tagsA !== tagsB) return true;
    const imagesA = JSON.stringify(mImages || []);
    const imagesB = JSON.stringify(activeNoteObj.images || []);
    if (imagesA !== imagesB) return true;
    if ((mType || "text") !== (activeNoteObj.type || "text")) return true;
    if ((mType || "text") === "text") {
      if ((mBody || "") !== (activeNoteObj.content || "")) return true;
    } else {
      const itemsA = JSON.stringify(mItems || []);
      const itemsB = JSON.stringify(activeNoteObj.items || []);
      if (itemsA !== itemsB) return true;
    }
    return false;
  }, [activeNoteObj, mTitle, mColor, mTagList, mImages, mType, mBody, mItems]);

  useEffect(() => {
    // Only close header kebab on outside click (modal kebab is handled by Popover)
    function onDocClick(e) {
      if (headerMenuOpen) {
        const m = headerMenuRef.current;
        const b = headerBtnRef.current;
        if (m && m.contains(e.target)) return;
        if (b && b.contains(e.target)) return;
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [headerMenuOpen]);

  // CSS inject
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = globalCSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Router
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/login");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (to) => {
    if (window.location.hash !== to) window.location.hash = to;
    setRoute(to);
  };

  // Theme init/toggle
  useEffect(() => {
    const savedDark =
      localStorage.getItem("glass-keep-dark-mode") === "true" ||
      (!("glass-keep-dark-mode" in localStorage) &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
  }, []);
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("glass-keep-dark-mode", String(next));
  };

  // Close sidebar with Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // ─── SyncEngine lifecycle ───
  //
  // CANONICAL SYNC PATH (single source of truth):
  //
  //   User action → IDB write → enqueueAndSync(action) → idbEnqueue → triggerSync
  //     → syncEngineRef.current.processQueue() → HTTP calls → onStatusChange → setSyncStatus
  //
  //   Remote updates: SSE → patchSingleNote(noteId) → hasPendingChanges guard → IDB + setNotes
  //   Retry:          processQueue self-reschedules on retryable failures
  //   Recovery:       healthCheck (adaptive 5s/10s/30s) resets transient failures → processQueue
  //   Manual:         handleSyncNow → syncEngine.forceSync() → healthCheck + reset all + processQueue
  //
  //   State ownership:
  //   - syncStatus (React state)     ← ONLY written by syncEngine.onStatusChange + reset points
  //   - IndexedDB syncQueue          ← ONLY written by idbEnqueue + syncEngine queue updates
  //   - IndexedDB notes store        ← Written by load functions, auto-save, patchSingleNote
  //   - localEditDirtyRef            ← Protects IDB from SSE overwrite during debounce window
  //
  useEffect(() => {
    if (!token || !currentUser?.id) {
      if (syncEngineRef.current) {
        syncEngineRef.current.destroy();
        syncEngineRef.current = null;
      }
      setSyncStatus(SYNC_STATUS_RESET);
      return;
    }

    const engine = new SyncEngine({
      getToken: () => tokenRef.current,
      onStatusChange: (status) => setSyncStatus(status),
      onSyncComplete: () => {},
      onSyncError: (item, err) => console.warn("[Sync] Failed:", item.type, item.noteId, err.message),
    });
    syncEngineRef.current = engine;
    engine.startHealthChecks();

    // Process leftover queue from previous session
    engine.processQueue();

    return () => {
      engine.destroy();
      syncEngineRef.current = null;
    };
  }, [token, currentUser?.id]);

  const triggerSync = useCallback(() => {
    syncEngineRef.current?.processQueue();
  }, []);

  // Ref to always hold the latest reload function (avoids stale closure in handleSyncNow)
  const reloadCurrentViewRef = useRef(null);

  const handleSyncNow = useCallback(async () => {
    await syncEngineRef.current?.forceSync();
    // After syncing the queue, also reload notes from server to pick up
    // changes made by other devices (new notes, edits, etc.)
    if (syncEngineRef.current?.serverReachable) {
      reloadCurrentViewRef.current?.();
    }
  }, []);

  // Warn before closing if there are pending local changes
  useEffect(() => {
    const handler = (e) => {
      if (syncStatus.hasPendingChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [syncStatus.hasPendingChanges]);

  // ─── Local-first helpers ───
  // Enqueue a sync action and immediately trigger the engine
  const enqueueAndSync = useCallback(async (action) => {
    await idbEnqueue(action);
    triggerSync();
  }, [triggerSync]);

  // Cache keys for localStorage
  const NOTES_CACHE_KEY = `glass-keep-notes-${currentUser?.id || "anonymous"}`;
  const ARCHIVED_NOTES_CACHE_KEY = `glass-keep-archived-${currentUser?.id || "anonymous"}`;
  const TRASHED_NOTES_CACHE_KEY = `glass-keep-trashed-${currentUser?.id || "anonymous"}`;
  const CACHE_TIMESTAMP_KEY = `glass-keep-cache-timestamp-${currentUser?.id || "anonymous"}`;

  // Cache invalidation functions
  const invalidateNotesCache = () => {
    try {
      localStorage.removeItem(NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating notes cache:", error);
    }
  };

  const invalidateArchivedNotesCache = () => {
    try {
      localStorage.removeItem(ARCHIVED_NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating archived notes cache:", error);
    }
  };

  const invalidateTrashedNotesCache = () => {
    try {
      localStorage.removeItem(TRASHED_NOTES_CACHE_KEY);
    } catch (error) {
      console.error("Error invalidating trashed notes cache:", error);
    }
  };

  const uniqueById = (arr) => {
    const m = new Map();
    for (const n of Array.isArray(arr) ? arr : []) {
      if (!n) continue;
      m.set(String(n.id), n);
    }
    return Array.from(m.values());
  };
  const persistNotesCache = (notes) => {
    try {
      localStorage.setItem(
        NOTES_CACHE_KEY,
        JSON.stringify(Array.isArray(notes) ? notes : []),
      );
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.error("Error caching notes:", e);
    }
  };
  // Consistent ordering: pinned first, then by position (server-persisted DnD),
  // fallback to updated_at/timestamp when position is missing
  const sortNotesByRecency = (arr) => {
    try {
      const list = Array.isArray(arr) ? arr.slice() : [];
      return list.sort((a, b) => {
        const ap = a?.pinned ? 1 : 0;
        const bp = b?.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap; // pinned first
        const apos = Number.isFinite(+a?.position) ? +a.position : null;
        const bpos = Number.isFinite(+b?.position) ? +b.position : null;
        if (
          apos != null &&
          bpos != null &&
          !Number.isNaN(apos) &&
          !Number.isNaN(bpos)
        ) {
          const posDiff = bpos - apos;
          if (posDiff !== 0) return posDiff; // higher position first (most recent/top)
        }
        const at = new Date(a?.updated_at || a?.timestamp || 0).getTime();
        const bt = new Date(b?.updated_at || b?.timestamp || 0).getTime();
        return bt - at; // fallback newest first
      });
    } catch {
      return Array.isArray(arr) ? arr : [];
    }
  };

  // Load notes
  const handleAiSearch = async (question) => {
    if (!question || question.trim().length < 3) return;
    setIsAiLoading(true);
    setAiResponse(null);
    setAiLoadingProgress(0);

    try {
      const answer = await askAI(question, notes, (progress) => {
        if (progress.status === "progress") {
          setAiLoadingProgress(progress.progress);
        } else if (progress.status === "ready") {
          setAiLoadingProgress(100);
        }
      });
      setAiResponse(answer);
    } catch (err) {
      console.error("AI Error:", err);
      setAiResponse(
        "Sorry, I encountered an error while processing your request.",
      );
    } finally {
      setIsAiLoading(false);
      setAiLoadingProgress(null);
    }
  };

  const loadNotes = async () => {
    if (!token) return;
    const expectedFilter = tagFilterRef.current;
    // Guard: only load active notes when we're actually in the active view
    if (expectedFilter === "ARCHIVED" || expectedFilter === "TRASHED") return;
    notesAreRegular.current = true;
    setNotesLoading(true);

    try {
      // First: show notes from IndexedDB immediately (local-first)
      try {
        const localNotes = await idbGetAllNotes(currentUser?.id, "active");
        if (localNotes.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return; // view changed
          setNotes(sortNotesByRecency(localNotes));
        }
      } catch (e) {
        console.error("IndexedDB read failed:", e);
      }

      // Then: fetch from server and merge (protecting pending local changes)
      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      // Skip API call entirely if sync engine knows server is down
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes", { token });
      if (tagFilterRef.current !== expectedFilter) return; // view changed during fetch
      const serverNotes = Array.isArray(data) ? data : [];

      // Hydrate IndexedDB, skipping notes with pending local changes
      const toWrite = [];
      for (const sn of serverNotes) {
        const pending = await hasPendingChanges(String(sn.id));
        if (!pending) {
          toWrite.push({ ...sn, id: String(sn.id), user_id: sn.user_id || currentUser?.id, archived: false, trashed: false });
        }
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite);

      // Build final list: server notes + locally-only notes with pending sync
      const serverIds = new Set(serverNotes.map((n) => String(n.id)));
      const localOnly = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, "active");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            const pending = await hasPendingChanges(String(ln.id));
            if (pending) localOnly.push(ln);
          }
        }
      } catch (e) {}

      // For notes with pending changes, use local version
      const merged = [];
      for (const sn of serverNotes) {
        const pending = await hasPendingChanges(String(sn.id));
        if (pending) {
          const localVer = await idbGetNote(String(sn.id));
          merged.push(localVer || sn);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the active view
      // (local versions of notes with pending changes might have trashed/archived flags)
      const final = [...merged, ...localOnly].filter((n) => !n.archived && !n.trashed);
      if (tagFilterRef.current !== expectedFilter) return; // view changed
      setNotes(sortNotesByRecency(final));
      persistNotesCache(final);
    } catch (error) {
      console.error("Error loading notes from server:", error);
      // Notify sync engine so it detects offline state quickly
      syncEngineRef.current?.healthCheck();
      if (tagFilterRef.current !== expectedFilter) return; // view changed
      // Fallback: use IndexedDB data (already shown above), or localStorage
      try {
        const localNotes = await idbGetAllNotes(currentUser?.id, "active");
        if (localNotes.length > 0) {
          if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(localNotes));
        } else {
          const cachedData = localStorage.getItem(NOTES_CACHE_KEY);
          if (cachedData) {
            if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(JSON.parse(cachedData)));
          }
        }
      } catch (e) {
        console.error("Fallback load failed:", e);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  // Load archived notes
  const loadArchivedNotes = async () => {
    if (!token) return;
    const expectedFilter = "ARCHIVED";
    if (tagFilterRef.current !== expectedFilter) return;
    notesAreRegular.current = false;
    setNotesLoading(true);

    try {
      // Show IndexedDB archived notes immediately
      try {
        const localArchived = await idbGetAllNotes(currentUser?.id, "archived");
        if (localArchived.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return;
          setNotes(sortNotesByRecency(localArchived));
        }
      } catch (e) {}

      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes/archived", { token });
      if (tagFilterRef.current !== expectedFilter) return;
      const notesArray = Array.isArray(data) ? data : [];

      // Hydrate IndexedDB
      const toWrite = [];
      for (const sn of notesArray) {
        const pending = await hasPendingChanges(String(sn.id));
        if (!pending) {
          toWrite.push({ ...sn, id: String(sn.id), user_id: sn.user_id || currentUser?.id, archived: true, trashed: false });
        }
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite);

      // Merge with local-only archived notes that have pending sync
      const serverIds = new Set(notesArray.map((n) => String(n.id)));
      const localOnly = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, "archived");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            const pending = await hasPendingChanges(String(ln.id));
            if (pending) localOnly.push(ln);
          }
        }
      } catch (e) {}

      const merged = [];
      for (const sn of notesArray) {
        const pending = await hasPendingChanges(String(sn.id));
        if (pending) {
          const localVer = await idbGetNote(String(sn.id));
          merged.push(localVer || sn);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the archived view
      const final = [...merged, ...localOnly].filter((n) => !!n.archived && !n.trashed);
      if (tagFilterRef.current !== expectedFilter) return;
      setNotes(sortNotesByRecency(final));
      try {
        localStorage.setItem(ARCHIVED_NOTES_CACHE_KEY, JSON.stringify(final));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (e) {}
    } catch (error) {
      console.error("Error loading archived notes from server:", error);
      syncEngineRef.current?.healthCheck();
      // Keep IndexedDB data already shown
    } finally {
      setNotesLoading(false);
    }
  };

  // Load trashed notes
  const loadTrashedNotes = async () => {
    if (!token) return;
    const expectedFilter = "TRASHED";
    if (tagFilterRef.current !== expectedFilter) return;
    notesAreRegular.current = false;
    setNotesLoading(true);

    try {
      // Show IndexedDB trashed notes immediately
      try {
        const localTrashed = await idbGetAllNotes(currentUser?.id, "trashed");
        if (localTrashed.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return;
          setNotes(sortNotesByRecency(localTrashed));
        }
      } catch (e) {}

      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes/trashed", { token });
      if (tagFilterRef.current !== expectedFilter) return;
      const notesArray = Array.isArray(data) ? data : [];

      // Hydrate IndexedDB
      const toWrite = [];
      for (const sn of notesArray) {
        const pending = await hasPendingChanges(String(sn.id));
        if (!pending) {
          toWrite.push({ ...sn, id: String(sn.id), user_id: sn.user_id || currentUser?.id, archived: false, trashed: true });
        }
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite);

      // Merge with locally-trashed notes that have pending sync
      const serverIds = new Set(notesArray.map((n) => String(n.id)));
      const localOnly = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, "trashed");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            const pending = await hasPendingChanges(String(ln.id));
            if (pending) localOnly.push(ln);
          }
        }
      } catch (e) {}

      // For notes with pending changes, use local version
      const merged = [];
      for (const sn of notesArray) {
        const pending = await hasPendingChanges(String(sn.id));
        if (pending) {
          const localVer = await idbGetNote(String(sn.id));
          merged.push(localVer || sn);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the trashed view
      const final = [...merged, ...localOnly].filter((n) => !!n.trashed);
      if (tagFilterRef.current !== expectedFilter) return;
      setNotes(sortNotesByRecency(final));
      try {
        localStorage.setItem(TRASHED_NOTES_CACHE_KEY, JSON.stringify(final));
      } catch (e) {}
    } catch (error) {
      console.error("Error loading trashed notes from server:", error);
      syncEngineRef.current?.healthCheck();
      if (tagFilterRef.current !== expectedFilter) return;
      // Keep IndexedDB data already shown, or fallback to localStorage
      try {
        const localTrashed = await idbGetAllNotes(currentUser?.id, "trashed");
        if (localTrashed.length > 0) {
          if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(localTrashed));
        } else {
          const cachedData = localStorage.getItem(TRASHED_NOTES_CACHE_KEY);
          if (cachedData) {
            if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(JSON.parse(cachedData)));
          } else {
            if (tagFilterRef.current === expectedFilter) setNotes([]);
          }
        }
      } catch {
        if (tagFilterRef.current === expectedFilter) setNotes([]);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  // Keep ref up to date so handleSyncNow always calls the latest version
  reloadCurrentViewRef.current = () => {
    const currentFilter = tagFilterRef.current;
    if (currentFilter === "ARCHIVED") {
      loadArchivedNotes().catch(() => {});
    } else if (currentFilter === "TRASHED") {
      loadTrashedNotes().catch(() => {});
    } else {
      loadNotes().catch(() => {});
    }
  };

  useEffect(() => {
    if (!token) return;

    // Update ref FIRST so load functions can use it for async staleness checks
    tagFilterRef.current = tagFilter;

    // Load appropriate notes based on tag filter
    if (tagFilter === "ARCHIVED") {
      loadArchivedNotes().catch((error) => {
        console.error("Failed to load archived notes:", error);
      });
    } else if (tagFilter === "TRASHED") {
      loadTrashedNotes().catch((error) => {
        console.error("Failed to load trashed notes:", error);
      });
    } else {
      loadNotes().catch((error) => {
        console.error("Failed to load regular notes:", error);
      });
    }
  }, [token, tagFilter]);

  // tagFilterRef is now updated inside the load useEffect above (before calling load functions)

  // Fetch login profiles (public)
  const fetchLoginProfiles = async () => {
    try {
      const profiles = await api("/login/profiles");
      setLoginProfiles(Array.isArray(profiles) ? profiles : []);
    } catch (e) {
      console.error("Failed to fetch login profiles:", e);
      setLoginProfiles([]);
    }
  };

  // Check registration setting and login slogan on app load
  useEffect(() => {
    checkRegistrationSetting();
    fetchLoginSlogan();
    fetchLoginProfiles();
  }, []);

  // Handle token expiration globally - must be after signOut is defined
  // This will be added after signOut is defined below

  useEffect(() => {
    if (token) {
      loadNotes().catch(() => {});
    }
    if (!token) return;

    let es;
    let reconnectTimeout;
    let reconnectAttempts = 0;
    let hasConnectedOnce = false; // track first vs reconnection
    const maxReconnectDelay = 30000; // cap backoff at 30s, never give up
    let reloadCooldownUntil = 0; // suppress patches during full reload

    // ─── Debounced batch patch: collect noteIds, reload once ───
    let patchBatchTimeout = null;
    const patchBatchIds = new Set();

    const flushPatchBatch = async () => {
      patchBatchTimeout = null;
      const ids = [...patchBatchIds];
      patchBatchIds.clear();
      for (const nid of ids) {
        await patchSingleNote(nid);
      }
    };

    const debouncedPatch = (noteId) => {
      // During reload cooldown, skip — full reload handles everything
      if (Date.now() < reloadCooldownUntil) return;
      patchBatchIds.add(String(noteId));
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      patchBatchTimeout = setTimeout(flushPatchBatch, 300);
    };

    // ─── Targeted single-note patch (local-first safe) ───
    const patchSingleNote = async (noteId) => {
      if (!noteId) return;
      const nid = String(noteId);

      // Don't overwrite notes with pending local changes (already in sync queue)
      const pending = await hasPendingChanges(nid);
      if (pending) return;

      // Don't overwrite note currently being edited in modal (debounce may not have fired yet)
      if (localEditDirtyRef.current === nid) return;

      try {
        const serverNote = await api(`/notes/${nid}`, { token });
        if (!serverNote || !serverNote.id) return;

        const currentFilter = tagFilterRef.current;
        const noteArchived = !!serverNote.archived;
        const noteTrashed = !!serverNote.trashed;

        // Determine if this note belongs in the current view
        const belongsInView =
          (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
          (currentFilter === "TRASHED" && noteTrashed) ||
          (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
            && !noteArchived && !noteTrashed;

        // Update IndexedDB
        try {
          await idbPutNote({
            ...serverNote,
            id: nid,
            user_id: serverNote.user_id || currentUser?.id,
          });
        } catch (e) {}

        if (belongsInView) {
          // Upsert into current notes list
          setNotes((prev) => {
            const idx = prev.findIndex((n) => String(n.id) === nid);
            if (idx >= 0) {
              // Update existing note in place
              const updated = [...prev];
              updated[idx] = serverNote;
              return updated;
            } else {
              // New note that belongs in this view - add to list
              return sortNotesByRecency([...prev, serverNote]);
            }
          });
        } else {
          // Note no longer belongs in the current view — remove it
          setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        }
      } catch (e) {
        // Fetch failed (404, network, etc.) — if 404, note was deleted
        if (e.status === 404) {
          setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
          try { await idbDeleteNote(nid); } catch (_) {}
        }
        // Other errors: silently ignore, state stays as-is
      }
    };

    const connectSSE = () => {
      try {
        const url = new URL(`${window.location.origin}/api/events`);
        url.searchParams.set("token", token);
        url.searchParams.set("_t", Date.now());
        es = new EventSource(url.toString());

        es.onopen = () => {
          console.log("SSE connected");
          setSseConnected(true);
          // On reconnection (not first connect), reload the view immediately
          // so remote changes appear right away instead of waiting for
          // individual SSE events to trickle in one by one
          if (hasConnectedOnce) {
            console.log("[SSE] reconnected — reloading current view");
            reloadCooldownUntil = Date.now() + 3000; // suppress individual patches for 3s
            reloadCurrentViewRef.current?.();
          }
          hasConnectedOnce = true;
          reconnectAttempts = 0;
        };

        // SSE message handler (server sends generic data: messages)
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data || "{}");
            if (msg && msg.type === "note_updated" && msg.noteId) {
              debouncedPatch(msg.noteId);
            }
          } catch (_) {}
        };

        es.onerror = (error) => {
          console.log("SSE error, attempting reconnect...", error);
          setSseConnected(false);

          if (es.readyState === EventSource.CLOSED) {
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) {
              return;
            }
          }

          es.close();

          // Always retry — never give up. Cap backoff at maxReconnectDelay.
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) return;
            connectSSE();
          }, delay);
        };
      } catch (error) {
        console.error("Failed to create EventSource:", error);
      }
    };

    connectSSE();

    // Expose reconnect for use when sync engine detects server recovery
    reconnectSseRef.current = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        reconnectAttempts = 0; // reset backoff on explicit reconnect
        connectSSE();
      }
    };

    // Fallback polling: only when SSE is dead, and only every 60s
    let pollInterval;
    const startPolling = () => {
      pollInterval = setInterval(() => {
        if (!es || es.readyState === EventSource.CLOSED) {
          // SSE is dead — do a full reload as last resort
          const currentFilter = tagFilterRef.current;
          if (currentFilter === "ARCHIVED") {
            loadArchivedNotes().catch(() => {});
          } else if (currentFilter === "TRASHED") {
            loadTrashedNotes().catch(() => {});
          } else {
            loadNotes().catch(() => {});
          }
        }
        // When SSE is connected, polling does nothing
      }, 60000);
    };

    const pollTimeout = setTimeout(startPolling, 15000);

    // Visibility change: reconnect SSE if dead, trigger SyncEngine
    // No full reload — trust SSE to have kept state up to date
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      // Reconnect SSE if needed
      if (es && es.readyState === EventSource.CLOSED) {
        try {
          await api("/health", { token });
          connectSSE();
        } catch (error) {
          if (error.status === 401) return;
          // Server might be down, ignore
        }
      }

      // Trigger sync engine to process any pending queue items
      triggerSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      // Browser detected network recovery — run health check first,
      // then process queue if server is reachable
      syncEngineRef.current?.healthCheck().then((ok) => {
        if (ok) triggerSync();
      });
      // Reconnect SSE if it was dead
      if (es && es.readyState === EventSource.CLOSED) {
        reconnectAttempts = 0;
        connectSSE();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      setSseConnected(false);
      try { if (es) es.close(); } catch (e) {}
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      if (pollTimeout) clearTimeout(pollTimeout);
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [token]);

  // Reconnect SSE when server recovers from offline
  const prevSyncStateRef = useRef(syncStatus.syncState);
  useEffect(() => {
    const prev = prevSyncStateRef.current;
    prevSyncStateRef.current = syncStatus.syncState;
    if (prev === "offline" && syncStatus.syncState !== "offline" && syncStatus.syncState !== "checking") {
      reconnectSseRef.current?.();
    }
  }, [syncStatus.syncState]);

  // Live-sync checklist items in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n) return;
    if ((mType || n.type) !== "checklist") return;
    const serverItems = Array.isArray(n.items) ? n.items : [];
    const prevJson = JSON.stringify(prevItemsRef.current || []);
    const serverJson = JSON.stringify(serverItems);
    if (serverJson !== prevJson) {
      setMItems(serverItems);
      prevItemsRef.current = serverItems;
    }
  }, [notes, open, activeId, mType]);

  // Auto-save drawing changes (local-first)
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    if (skipNextDrawingAutosave.current) {
      skipNextDrawingAutosave.current = false;
      return;
    }

    const prevJson = JSON.stringify(
      prevDrawingRef.current || { paths: [], dimensions: null },
    );
    const currentJson = JSON.stringify(
      mDrawingData || { paths: [], dimensions: null },
    );
    if (prevJson === currentJson) return;

    // Debounce local-first save by 500ms
    const timeoutId = setTimeout(async () => {
      prevDrawingRef.current = mDrawingData;
      const noteId = String(activeId);
      const nowIso = new Date().toISOString();
      const drawingContent = JSON.stringify(mDrawingData);

      // Update notes state
      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === noteId
            ? { ...n, content: drawingContent, updated_at: nowIso }
            : n,
        ),
      );

      // Persist to IndexedDB
      try {
        const existing = await idbGetNote(noteId);
        if (existing) {
          await idbPutNote({ ...existing, content: drawingContent, updated_at: nowIso });
        }
      } catch (e) {
        console.error("IndexedDB drawing update failed:", e);
      }
      invalidateNotesCache();

      // Enqueue for server sync
      enqueueAndSync({
        type: "patch",
        noteId,
        payload: { content: drawingContent, type: "draw" },
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mDrawingData, open, activeId, mType, enqueueAndSync]);

  // Live-sync drawing data in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type !== "draw") return;

    try {
      const serverDrawingData = JSON.parse(n.content || "[]");
      // Handle backward compatibility: if it's an array, convert to new format
      const normalizedData = Array.isArray(serverDrawingData)
        ? { paths: serverDrawingData, dimensions: null }
        : serverDrawingData;
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(normalizedData);
      if (serverJson !== prevJson) {
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId]);

  // No infinite scroll

  // Lock body scroll on modal & image viewer
  useEffect(() => {
    if (!open && !imgViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, imgViewOpen]);

  // Close image viewer if modal closes
  useEffect(() => {
    if (!open) setImgViewOpen(false);
  }, [open]);

  // Keyboard nav for image viewer
  useEffect(() => {
    if (!imgViewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setImgViewOpen(false);
      if (e.key.toLowerCase() === "d") {
        const im = mImages[imgViewIndex];
        if (im) {
          const fname = normalizeImageFilename(
            im.name,
            im.src,
            imgViewIndex + 1,
          );
          downloadDataUrl(fname, im.src);
        }
      }
      if (e.key === "ArrowRight" && mImages.length > 1) {
        setImgViewIndex((i) => (i + 1) % mImages.length);
      }
      if (e.key === "ArrowLeft" && mImages.length > 1) {
        setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [imgViewOpen, mImages, imgViewIndex]);

  // Close note modal with Escape key
  useEffect(() => {
    if (activeId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !imgViewOpen) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, imgViewOpen]);

  // Close note modal with Android back button (popstate)
  useEffect(() => {
    const onPopState = () => {
      if (modalHistoryRef.current) {
        modalHistoryRef.current = false;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setModalMenuOpen(false);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  // Auto-resize modal textarea with debouncing
  const resizeModalTextarea = useMemo(() => {
    let timeoutId = null;
    return () => {
      const el = mBodyRef.current;
      if (!el) return;

      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Debounce the resize to prevent excessive updates
      timeoutId = setTimeout(() => {
        const modalScrollEl = modalScrollRef.current;

        // Save scroll position before collapsing textarea height
        const savedScrollTop = modalScrollEl ? modalScrollEl.scrollTop : 0;

        const MIN = 160;
        el.style.height = MIN + "px";
        el.style.height = Math.max(el.scrollHeight, MIN) + "px";

        requestAnimationFrame(() => {
          if (!modalScrollEl) return;
          // Mode-switch ratio takes priority, otherwise restore pre-resize position
          const ratio = savedModalScrollRatioRef.current;
          if (ratio > 0) {
            const maxScroll = modalScrollEl.scrollHeight - modalScrollEl.clientHeight;
            modalScrollEl.scrollTop = ratio * maxScroll;
            savedModalScrollRatioRef.current = 0;
          } else {
            modalScrollEl.scrollTop = savedScrollTop;
          }
        });
      }, 10); // Small delay to batch rapid changes
    };
  }, []);
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) resizeModalTextarea();
  }, [open, viewMode, mBody, mType]);

  // Restore scroll ratio when switching edit→view (no textarea resize in this direction)
  useEffect(() => {
    if (!viewMode) return; // view→edit is handled inside resizeModalTextarea
    const el = modalScrollRef.current;
    const ratio = savedModalScrollRatioRef.current;
    if (!el || ratio === 0) return;
    requestAnimationFrame(() => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll > 0) el.scrollTop = ratio * maxScroll;
      savedModalScrollRatioRef.current = 0;
    });
  }, [viewMode]);

  // Ensure modal formatting menu hides when switching to view mode or non-text
  useEffect(() => {
    if (viewMode || mType !== "text") setShowModalFmt(false);
  }, [viewMode, mType]);

  // Detect if modal body is scrollable to decide Edited stamp placement
  useEffect(() => {
    if (!open) return;
    const el = modalScrollRef.current;
    if (!el) return;

    const check = () => {
      // +1 fudge factor to avoid off-by-one on some browsers
      setModalScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    check();

    // React to container size changes and window resizes
    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    window.addEventListener("resize", check);

    // Also recheck shortly after (images rendering, fonts, etc.)
    const t1 = setTimeout(check, 50);
    const t2 = setTimeout(check, 200);

    return () => {
      window.removeEventListener("resize", check);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [open, mBody, mTitle, mItems.length, mImages.length, viewMode, mType]);

  /** -------- Auth actions -------- */
  const signOut = () => {
    // Clear IndexedDB sync data
    if (currentUser?.id) {
      idbClearNotesForUser(currentUser.id).catch(() => {});
      idbClearQueue().catch(() => {});
    }
    if (syncEngineRef.current) {
      syncEngineRef.current.destroy();
      syncEngineRef.current = null;
    }
    setAuth(null);
    setSession(null);
    setNotes([]);
    setSyncStatus(SYNC_STATUS_RESET);
    // Clear all cached data for this user
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.includes("glass-keep-")) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Error clearing cache on sign out:", error);
    }
    navigate("#/login");
  };
  const signIn = async (email, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { email, password },
    });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };
  const signInById = async (userId, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { user_id: userId, password },
    });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };
  const signInWithSecret = async (key) => {
    const res = await api("/login/secret", { method: "POST", body: { key } });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };
  const register = async (name, email, password) => {
    const res = await api("/register", {
      method: "POST",
      body: { name, email, password },
    });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };

  // Handle token expiration globally
  useEffect(() => {
    const handleAuthExpired = () => {
      console.log("Auth expired, signing out...");
      // Clear auth and redirect to login
      setAuth(null);
      setSession(null);
      setNotes([]);
      // Clear all cached data
      try {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.includes("glass-keep-")) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        console.error("Error clearing cache on auth expiration:", error);
      }
      navigate("#/login");
    };

    window.addEventListener("auth-expired", handleAuthExpired);

    return () => {
      window.removeEventListener("auth-expired", handleAuthExpired);
    };
  }, [navigate]);

  /** -------- Composer helpers -------- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    setClItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setClInput("");
  };

  const addNote = async () => {
    const isText = composerType === "text";
    const isChecklist = composerType === "checklist";
    const isDraw = composerType === "draw";

    if (isText) {
      if (
        !title.trim() &&
        !content.trim() &&
        composerTagList.length === 0 &&
        composerImages.length === 0
      )
        return;
    } else if (isChecklist) {
      if (!title.trim() && clItems.length === 0) return;
    } else if (isDraw) {
      const drawPaths = Array.isArray(composerDrawingData)
        ? composerDrawingData
        : composerDrawingData?.paths || [];
      if (!title.trim() && drawPaths.length === 0) return;
    }

    const nowIso = new Date().toISOString();
    const newNote = {
      id: uid(),
      type: composerType,
      title: title.trim(),
      content: isText
        ? content
        : isDraw
          ? JSON.stringify(composerDrawingData)
          : "",
      items: isChecklist ? clItems : [],
      tags: composerTagList,
      images: composerImages,
      color: composerColor,
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
    };

    // Local-first: apply immediately, then sync in background
    const localNote = {
      ...newNote,
      user_id: currentUser?.id,
      archived: false,
      trashed: false,
    };
    try {
      await idbPutNote(localNote);
    } catch (e) {
      console.error("IndexedDB put failed:", e);
    }

    // Update UI immediately from local state
    setNotes((prev) =>
      sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    invalidateNotesCache();

    // Enqueue for server sync
    enqueueAndSync({ type: "create", noteId: newNote.id, payload: newNote });

    // Reset composer immediately (don't wait for server)
    setTitle("");
    setContent("");
    setTags("");
    setComposerTagList([]);
    setComposerTagInput("");
    setComposerTagFocused(false);
    setComposerImages([]);
    setComposerColor("default");
    setClItems([]);
    setClInput("");
    setComposerDrawingData({ paths: [], dimensions: null });
    setComposerType("text");
    setComposerCollapsed(true);
    if (contentRef.current) contentRef.current.style.height = "auto";
  };

  /** -------- Download single note .md -------- */
  const handleDownloadNote = (note) => {
    const md = mdForDownload(note);
    const fname = sanitizeFilename(note.title || `note-${note.id}`) + ".md";
    downloadText(fname, md);
  };

  /** -------- Archive/Unarchive note -------- */
  const handleArchiveNote = async (noteId, archived) => {
    // Local-first: apply archive state immediately
    try {
      const existing = await idbGetNote(String(noteId));
      if (existing) await idbPutNote({ ...existing, archived: !!archived });
    } catch (e) { console.error(e); }

    // Invalidate all caches since archiving affects multiple views
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();

    // Update UI: remove note from current view (it moved to another view)
    if (tagFilter === "ARCHIVED") {
      if (!archived) {
        // Unarchiving from archived view — switch view and remove from list
        setNotes((prev) => prev.filter((n) => String(n.id) !== String(noteId)));
        setTagFilter(null);
      }
      // If archiving within archived view, note stays (no-op)
    } else {
      if (archived) {
        // Archiving from normal view — remove from list
        setNotes((prev) => prev.filter((n) => String(n.id) !== String(noteId)));
      }
      // If unarchiving from normal view, note stays (no-op)
    }

    if (archived) {
      closeModal();
    }

    // Enqueue for server sync
    enqueueAndSync({ type: "archive", noteId: String(noteId), payload: { archived: !!archived } });
  };

  /** -------- Admin Panel Functions -------- */
  const loadAdminSettings = async () => {
    try {
      console.log("Loading admin settings...");
      const settings = await api("/admin/settings", { token });
      console.log("Admin settings loaded:", settings);
      setAdminSettings(settings);
    } catch (e) {
      console.error("Failed to load admin settings:", e);
    }
  };

  const updateAdminSettings = async (newSettings) => {
    try {
      const settings = await api("/admin/settings", {
        method: "PATCH",
        token,
        body: newSettings,
      });
      setAdminSettings(settings);
      if (typeof settings.loginSlogan === 'string') {
        setLoginSlogan(settings.loginSlogan);
      }
    } catch (e) {
      alert(e.message || t("failedUpdateAdminSettings"));
    }
  };

  const loadAllUsers = async () => {
    try {
      console.log("Loading all users...");
      const users = await api("/admin/users", { token });
      console.log("Users loaded:", users);
      setAllUsers(users);
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  };

  const createUser = async (userData) => {
    try {
      const newUser = await api("/admin/users", {
        method: "POST",
        token,
        body: userData,
      });
      setAllUsers((prev) => [newUser, ...prev]);
      setNewUserForm({ name: "", email: "", password: "", is_admin: false });
      return newUser;
    } catch (e) {
      alert(e.message || t("failedCreateUser"));
      throw e;
    }
  };

  const deleteUser = async (userId) => {
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE", token });
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      alert(e.message || t("failedDeleteUser"));
    }
  };

  const updateUser = async (userId, userData) => {
    const updatedUser = await api(`/admin/users/${userId}`, {
      method: "PATCH",
      token,
      body: userData,
    });
    setAllUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    return updatedUser;
  };

  const openAdminPanel = async () => {
    console.log("Opening admin panel...");
    setAdminPanelOpen(true);
    try {
      await Promise.all([loadAdminSettings(), loadAllUsers()]);
      console.log("Admin panel data loaded successfully");
    } catch (error) {
      console.error("Error loading admin panel data:", error);
    }
  };

  const openSettingsPanel = () => {
    setSettingsPanelOpen(true);
  };

  // Fetch the login slogan (public)
  const fetchLoginSlogan = async () => {
    try {
      const response = await api("/admin/login-slogan");
      setLoginSlogan(response.loginSlogan || "");
    } catch (e) {
      console.error("Failed to fetch login slogan:", e);
    }
  };

  // Check if registration is allowed
  const checkRegistrationSetting = async () => {
    try {
      const response = await api("/admin/allow-registration");
      setAllowRegistration(response.allowNewAccounts);
    } catch (e) {
      console.error("Failed to check registration setting:", e);
      setAllowRegistration(false); // Default to false if check fails
    }
  };

  /** -------- Export / Import All -------- */
  const triggerJSONDownload = (filename, jsonText) => {
    const blob = new Blob([jsonText], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    try {
      const payload = await api("/notes/export", { token });
      const json = JSON.stringify(payload, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname =
        sanitizeFilename(
          `glass-keep-notes-${currentUser?.email || "user"}-${ts}`,
        ) + ".json";
      triggerJSONDownload(fname, json);
    } catch (e) {
      alert(e.message || t("exportFailed"));
    }
  };

  const importAll = async (fileList) => {
    try {
      if (!fileList || !fileList.length) return;
      const file = fileList[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const notesArr = Array.isArray(parsed?.notes)
        ? parsed.notes
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (!notesArr.length) {
        alert(t("noNotesFoundInFile"));
        return;
      }
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedNotesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("importFailed"));
    }
  };

  /** -------- Import Google Keep single-note JSON files (multiple) -------- */
  const importGKeep = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const texts = await Promise.all(
        files.map((f) => f.text().catch(() => null)),
      );
      const notesArr = [];
      for (const t of texts) {
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (!obj || typeof obj !== "object") continue;
          const title = String(obj.title || "");
          const hasChecklist =
            Array.isArray(obj.listContent) && obj.listContent.length > 0;
          const items = hasChecklist
            ? obj.listContent.map((it) => ({
                id: uid(),
                text: String(it?.text || ""),
                done: !!it?.isChecked,
              }))
            : [];
          const content = hasChecklist ? "" : String(obj.textContent || "");
          const usec = Number(
            obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0,
          );
          const ms =
            Number.isFinite(usec) && usec > 0
              ? Math.floor(usec / 1000)
              : Date.now();
          const timestamp = new Date(ms).toISOString();
          // Extract labels to tags
          const tags = Array.isArray(obj.labels)
            ? obj.labels
                .map((l) => (typeof l?.name === "string" ? l.name.trim() : ""))
                .filter(Boolean)
            : [];
          notesArr.push({
            id: uid(),
            type: hasChecklist ? "checklist" : "text",
            title,
            content,
            items,
            tags,
            images: [],
            color: "default",
            pinned: !!obj.isPinned,
            position: ms,
            timestamp,
          });
        } catch (e) {}
      }
      if (!notesArr.length) {
        alert(t("noValidGoogleKeepNotesFound"));
        return;
      }
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedGoogleKeepNotes").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("googleKeepImportFailed"));
    }
  };

  /** -------- Import Markdown files (multiple) -------- */
  const importMd = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const notesArr = [];

      for (const file of files) {
        try {
          const text = await file.text();
          const lines = text.split("\n");

          // Extract title from first line if it starts with #
          let title = "";
          let contentStartIndex = 0;

          if (lines[0] && lines[0].trim().startsWith("#")) {
            // Remove # symbols and trim
            title = lines[0].replace(/^#+\s*/, "").trim();
            contentStartIndex = 1;
          } else {
            // Use filename as title (without .md extension)
            title = file.name.replace(/\.md$/i, "");
          }

          // Join remaining lines as content
          const content = lines.slice(contentStartIndex).join("\n").trim();

          if (title || content) {
            notesArr.push({
              id: uid(),
              type: "text",
              title,
              content,
              items: [],
              tags: [],
              images: [],
              color: "default",
              pinned: false,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`Failed to process file ${file.name}:`, e);
        }
      }

      if (!notesArr.length) {
        alert(t("noValidMarkdownFilesFound"));
        return;
      }

      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedMarkdownFilesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("markdownImportFailed"));
    }
  };

  /** -------- Collaboration actions -------- */
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false);
  const [collaborationDialogNoteId, setCollaborationDialogNoteId] =
    useState(null);
  const [noteCollaborators, setNoteCollaborators] = useState([]);
  const [isNoteOwner, setIsNoteOwner] = useState(false);

  const loadNoteCollaborators = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setNoteCollaborators(collaborators || []);

        // Check if current user is the owner
        // Try to get note from current notes list
        const note = notes.find((n) => String(n.id) === String(noteId));
        // If note has user_id, use it; otherwise check if user is in collaborators list
        if (note?.user_id) {
          setIsNoteOwner(note.user_id === currentUser?.id);
        } else {
          // If note doesn't have user_id, check if current user is NOT in collaborators
          // (if they're not a collaborator and can see the note, they're likely the owner)
          const isCollaborator = collaborators.some(
            (c) => c.id === currentUser?.id,
          );
          setIsNoteOwner(!isCollaborator);
        }
      } catch (e) {
        console.error("Failed to load collaborators:", e);
        setNoteCollaborators([]);
        setIsNoteOwner(false);
      }
    },
    [token, notes, currentUser],
  );

  const showCollaborationDialog = useCallback(
    (noteId) => {
      setCollaborationDialogNoteId(noteId);
      setCollaborationDialogOpen(true);
      loadNoteCollaborators(noteId);
    },
    [loadNoteCollaborators],
  );

  const removeCollaborator = async (collaboratorId, noteId = null) => {
    try {
      const targetNoteId = noteId || collaborationDialogNoteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token,
      });
      showToast(t("collaboratorRemovedSuccessfully"), "success");
      if (collaborationDialogNoteId) {
        loadNoteCollaborators(collaborationDialogNoteId);
      }
      if (activeId) {
        await loadCollaboratorsForAddModal(activeId);
      }
      invalidateNotesCache();
    } catch (e) {
      showToast(e.message || t("failedRemoveCollaborator"), "error");
    }
  };

  const loadCollaboratorsForAddModal = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setAddModalCollaborators(collaborators || []);
      } catch (e) {
        console.error("Failed to load collaborators:", e);
        setAddModalCollaborators([]);
      }
    },
    [token],
  );

  // Search users for collaboration dropdown
  const searchUsers = useCallback(
    async (query) => {
      setLoadingUsers(true);
      try {
        const searchQuery =
          query && query.trim().length > 0 ? query.trim() : "";
        const users = await api(
          `/users/search?q=${encodeURIComponent(searchQuery)}`,
          { token },
        );
        // Filter out current user and existing collaborators
        const existingCollaboratorIds = new Set(
          addModalCollaborators.map((c) => c.id),
        );
        const filtered = users.filter(
          (u) => u.id !== currentUser?.id && !existingCollaboratorIds.has(u.id),
        );
        setFilteredUsers(filtered);
        setShowUserDropdown(filtered.length > 0);
      } catch (e) {
        console.error("Failed to search users:", e);
        setFilteredUsers([]);
        setShowUserDropdown(false);
      } finally {
        setLoadingUsers(false);
      }
    },
    [token, addModalCollaborators, currentUser],
  );

  // Update dropdown position based on input field
  const updateDropdownPosition = useCallback(() => {
    if (collaboratorInputRef.current) {
      const rect = collaboratorInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // fixed positioning is relative to viewport
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        collaboratorInputRef.current &&
        !collaboratorInputRef.current.contains(event.target) &&
        !event.target.closest("[data-user-dropdown]")
      ) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      updateDropdownPosition();
      // Use setTimeout to ensure the portal is rendered
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [showUserDropdown, updateDropdownPosition]);

  // Load collaborators when Add Collaborator modal opens
  useEffect(() => {
    if (collaborationModalOpen && activeId) {
      loadCollaboratorsForAddModal(activeId);
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal]);

  const addCollaborator = async (username) => {
    try {
      if (!activeId) return;

      // Add collaborator to the note
      const result = await api(`/notes/${activeId}/collaborate`, {
        method: "POST",
        token,
        body: { username },
      });

      // Update local note with collaborator info
      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === String(activeId)
            ? {
                ...n,
                collaborators: [...(n.collaborators || []), username],
                lastEditedBy: currentUser?.email || currentUser?.name,
                lastEditedAt: new Date().toISOString(),
              }
            : n,
        ),
      );

      showToast(t("addedCollaboratorSuccessfully").replace("{username}", String(username)), "success");
      setCollaboratorUsername("");
      setShowUserDropdown(false);
      setFilteredUsers([]);
      // Reload collaborators for both dialogs
      await loadCollaboratorsForAddModal(activeId);
      if (collaborationDialogNoteId === activeId) {
        loadNoteCollaborators(activeId);
      }
    } catch (e) {
      showToast(e.message || t("failedAddCollaborator"), "error");
    }
  };

  /** -------- Secret Key actions -------- */
  const downloadSecretKey = async () => {
    try {
      const data = await api("/secret-key", { method: "POST", token });
      if (!data?.key) throw new Error(t("secretKeyNotReturned"));
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname = `glass-keep-secret-key-${ts}.txt`;
      const content =
        `Glass Keep — Secret Recovery Key\n\n` +
        `Keep this key safe. Anyone with this key can sign in as you.\n\n` +
        `Secret Key:\n${data.key}\n\n` +
        `Instructions:\n` +
        `1) Go to the login page.\n` +
        `2) Click ${t("forgotUsernamePassword")}.\n` +
        `3) Choose "${t("signInWithSecretKey")}" and paste this key.\n`;
      downloadText(fname, content);
      alert(t("secretKeyDownloadedSafe"));
    } catch (e) {
      alert(e.message || t("couldNotGenerateSecretKey"));
    }
  };

  /** -------- Modal tag helpers -------- */
  const addTags = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setMTagList((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const merged = [...prev];
      for (const p of parts)
        if (!set.has(p.toLowerCase())) {
          merged.push(p);
          set.add(p.toLowerCase());
        }
      return merged;
    });
  };
  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTags(tagInput);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput) {
      setMTagList((prev) => prev.slice(0, -1));
    }
  };
  const handleTagBlur = () => {
    if (tagInput.trim()) {
      addTags(tagInput);
      setTagInput("");
    }
  };
  const handleTagPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && text.includes(",")) {
      e.preventDefault();
      addTags(text);
    }
  };

  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try {
        const src = await fileToCompressedDataURL(f);
        results.push({ id: uid(), src, name: f.name });
      } catch (e) {
        console.error("Image load failed", e);
      }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  // Track initial state when opening modal to detect if user actually edited
  // Must be defined before openModal
  const initialModalStateRef = useRef(null);
  // Track if we pushed a history entry for the modal (Android back button support)
  const modalHistoryRef = useRef(false);

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    setSidebarOpen(false);
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    if (n.type === "draw") {
      try {
        const drawingData = JSON.parse(n.content || "[]");
        // Handle backward compatibility: if it's an array, convert to new format
        const normalizedData = Array.isArray(drawingData)
          ? { paths: drawingData, dimensions: null }
          : drawingData;
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      } catch (e) {
        setMDrawingData({ paths: [], dimensions: null });
        prevDrawingRef.current = { paths: [], dimensions: null };
      }
      setMBody("");
      skipNextDrawingAutosave.current = true;
    } else {
      setMBody(n.content || "");
      setMDrawingData({ paths: [], dimensions: null });
      prevDrawingRef.current = { paths: [], dimensions: null };
    }
    skipNextItemsAutosave.current = true;
    setMItems(Array.isArray(n.items) ? n.items : []);
    prevItemsRef.current = Array.isArray(n.items) ? n.items : [];
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");

    // Store initial state to detect if user actually edited
    initialModalStateRef.current = {
      title: n.title || "",
      content: n.type === "draw" ? "" : n.content || "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };

    setViewMode(true);
    setModalMenuOpen(false);
    setOpen(true);
    window.history.pushState({ noteModal: true }, "");
    modalHistoryRef.current = true;
  };

  // Check if note is collaborative (has collaborators or is owned by someone else)
  const isCollaborativeNote = useCallback(
    (noteId) => {
      if (!noteId) return false;
      const note = notes.find((n) => String(n.id) === String(noteId));
      if (!note) return false;
      const hasCollaborators =
        note.collaborators !== undefined && note.collaborators !== null;
      const isOwnedByOther =
        note.user_id && currentUser && note.user_id !== currentUser.id;
      return hasCollaborators || isOwnedByOther;
    },
    [notes, currentUser],
  );

  // Auto-save timeout ref - must be defined before closeModal


  // Check if the note has been modified from initial state
  const hasNoteBeenModified = useCallback(() => {
    if (!initialModalStateRef.current || !activeId) return false;
    const initial = initialModalStateRef.current;
    const current = {
      title: mTitle.trim(),
      content: mBody,
      tags: mTagList,
      images: mImages,
      color: mColor,
    };
    // Compare all fields
    return (
      initial.title !== current.title ||
      initial.content !== current.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(current.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(current.images) ||
      initial.color !== current.color
    );
  }, [activeId, mTitle, mBody, mTagList, mImages, mColor]);


  // Local-first auto-save for text notes: persist to IndexedDB + enqueue patch
  // Works for ALL text notes (not just collaborative) — mirrors drawing/checklist pattern
  const autoSaveTextNote = useCallback(async (noteId, fields) => {
    const nId = String(noteId);
    const nowIso = new Date().toISOString();

    // Update notes state with only provided fields
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nId
          ? { ...n, ...fields, updated_at: nowIso }
          : n,
      ),
    );

    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(nId);
      if (existing) {
        await idbPutNote({ ...existing, ...fields, updated_at: nowIso });
      }
    } catch (e) {
      console.error("IndexedDB text auto-save failed:", e);
    }
    invalidateNotesCache();

    // Enqueue targeted patch (only the changed fields)
    await enqueueAndSync({
      type: "patch",
      noteId: nId,
      payload: { ...fields, type: "text" },
    });
    // hasPendingChanges() now returns true → SSE protection via queue takes over
    // Clear the dirty ref only if it still points to this note
    if (localEditDirtyRef.current === nId) {
      localEditDirtyRef.current = null;
    }
  }, [enqueueAndSync]);

  // Local-first auto-save for text metadata (color, tags, images) — immediate, no debounce
  useEffect(() => {
    if (!open || !activeId || mType !== "text") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const colorChanged = initial.color !== mColor;
    const tagsChanged = JSON.stringify(initial.tags) !== JSON.stringify(mTagList);
    const imagesChanged = JSON.stringify(initial.images) !== JSON.stringify(mImages);

    if (!colorChanged && !tagsChanged && !imagesChanged) return;

    // Mark note as locally dirty before enqueue (protects against SSE overwrite)
    localEditDirtyRef.current = String(activeId);

    // Build patch with only changed metadata fields
    const metaPatch = {};
    if (colorChanged) metaPatch.color = mColor;
    if (tagsChanged) metaPatch.tags = mTagList;
    if (imagesChanged) metaPatch.images = mImages;

    autoSaveTextNote(activeId, metaPatch);

    // Update initial state so we don't re-trigger
    initialModalStateRef.current = {
      ...initial,
      ...(colorChanged ? { color: mColor } : {}),
      ...(tagsChanged ? { tags: mTagList } : {}),
      ...(imagesChanged ? { images: mImages } : {}),
    };
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote]);

  // Auto-save text content (title + body): debounced local-first persist + patch sync
  useEffect(() => {
    if (!open || !activeId || mType !== "text" || viewMode) return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    const contentChanged = initial.content !== mBody;
    if (!titleChanged && !contentChanged) return;

    // Mark note as locally dirty IMMEDIATELY (before debounce fires).
    // This protects against SSE overwriting IDB during the debounce window.
    localEditDirtyRef.current = String(activeId);

    const timeoutId = setTimeout(() => {
      // Build patch with only changed content fields
      const contentPatch = {};
      if (titleChanged) contentPatch.title = mTitle.trim();
      if (contentChanged) contentPatch.content = mBody;

      autoSaveTextNote(activeId, contentPatch);

      // Update initial state so subsequent comparisons are against the saved version
      if (initialModalStateRef.current) {
        initialModalStateRef.current = {
          ...initialModalStateRef.current,
          ...(titleChanged ? { title: mTitle.trim() } : {}),
          ...(contentChanged ? { content: mBody } : {}),
        };
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [mBody, mTitle, open, activeId, mType, viewMode, autoSaveTextNote]);

  // Update initial state reference when note is updated from server (for collaborative notes)
  // This prevents overwriting server changes when user hasn't edited locally
  // Must be after hasNoteBeenModified is defined
  useEffect(() => {
    if (!open || !activeId || !initialModalStateRef.current) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type === "draw") return;

    // Check if server version is different from our initial state
    const serverState = {
      title: n.title || "",
      content: n.type === "draw" ? "" : n.content || "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };

    const initial = initialModalStateRef.current;
    const serverChanged =
      initial.title !== serverState.title ||
      initial.content !== serverState.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(serverState.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(serverState.images) ||
      initial.color !== serverState.color;

    // If server changed and user hasn't edited locally, update initial state to server state
    // This prevents overwriting server changes when user closes without editing
    if (serverChanged && !hasNoteBeenModified()) {
      initialModalStateRef.current = serverState;
      // Update local modal state to match server (user hasn't edited, so safe to update)
      setMTitle(serverState.title);
      setMBody(serverState.content);
      setMTagList(serverState.tags);
      setMImages(serverState.images);
      setMColor(serverState.color);
    }
  }, [notes, open, activeId, hasNoteBeenModified]);

  const closeModal = () => {
    // Prevent double-triggering while exit animation is running
    if (modalClosingTimerRef.current) return;

    // Flush any pending text changes immediately before closing (local-first)
    if (activeId && mType === "text" && !viewMode) {
      const initial = initialModalStateRef.current;
      if (initial) {
        const patch = {};
        if (initial.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (initial.content !== mBody) patch.content = mBody;
        if (initial.color !== mColor) patch.color = mColor;
        if (JSON.stringify(initial.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(initial.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) {
          autoSaveTextNote(activeId, patch);
        }
      }
    }

    // Clear dirty flag — auto-save flush above enqueued any remaining changes
    localEditDirtyRef.current = null;

    // Start exit animation, then actually unmount after it completes
    setIsModalClosing(true);
    modalClosingTimerRef.current = setTimeout(() => {
      modalClosingTimerRef.current = null;
      if (modalHistoryRef.current) {
        modalHistoryRef.current = false;
        window.history.back();
      }
      setOpen(false);
      setActiveId(null);
      setViewMode(true);
      setModalMenuOpen(false);
      setConfirmDeleteOpen(false);
      setShowModalFmt(false);
      setIsModalClosing(false);
    }, 180);
  };

  const saveModal = async () => {
    if (activeId == null) return;
    setSavingModal(true);

    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    if (mType === "text") {
      // Text notes: use targeted patch with only changed fields
      const patch = {};
      const initial = initialModalStateRef.current;
      if (initial) {
        if (initial.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (initial.content !== mBody) patch.content = mBody;
        if (initial.color !== mColor) patch.color = mColor;
        if (JSON.stringify(initial.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(initial.images) !== JSON.stringify(mImages)) patch.images = mImages;
      } else {
        // No initial state — send everything
        Object.assign(patch, { title: mTitle.trim(), content: mBody, color: mColor, tags: mTagList, images: mImages });
      }

      if (Object.keys(patch).length > 0) {
        autoSaveTextNote(activeId, patch);
      }
    } else {
      // Checklist / Drawing: keep full update (they manage their own local-first flows)
      const base = {
        id: activeId,
        title: mTitle.trim(),
        tags: mTagList,
        images: mImages,
        color: mColor,
        pinned: !!notes.find((n) => String(n.id) === String(activeId))?.pinned,
      };
      const payload =
        mType === "checklist"
          ? { ...base, type: "checklist", content: "", items: mItems }
          : { ...base, type: "draw", content: JSON.stringify(mDrawingData), items: [] };

      prevItemsRef.current =
        mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      prevDrawingRef.current =
        mType === "draw"
          ? mDrawingData || { paths: [], dimensions: null }
          : { paths: [], dimensions: null };

      const updatedFields = {
        ...payload,
        updated_at: nowIso,
        lastEditedBy: currentUser?.email || currentUser?.name,
        lastEditedAt: nowIso,
      };

      try {
        const existing = await idbGetNote(noteId);
        if (existing) {
          await idbPutNote({ ...existing, ...updatedFields });
        }
      } catch (e) {
        console.error("IndexedDB update failed:", e);
      }

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === noteId ? { ...n, ...updatedFields } : n,
        ),
      );
      invalidateNotesCache();
      enqueueAndSync({ type: "update", noteId, payload });
    }

    setSavingModal(false);
  };
  const deleteModal = async () => {
    if (activeId == null) return;
    // Check if user owns the note
    const note = notes.find((n) => String(n.id) === String(activeId));
    if (note && note.user_id !== currentUser?.id) {
      showToast(t("cannotDeleteNotOwner"), "error");
      return;
    }

    if (tagFilter === "TRASHED") {
      // Local-first: permanent delete
      try { await idbDeleteNote(String(activeId)); } catch (e) { console.error(e); }
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(activeId)));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success");
      enqueueAndSync({ type: "permanentDelete", noteId: String(activeId) });
    } else {
      // Local-first: move to trash
      try {
        const existing = await idbGetNote(String(activeId));
        if (existing) await idbPutNote({ ...existing, trashed: true });
      } catch (e) { console.error(e); }
      invalidateNotesCache();
      invalidateArchivedNotesCache();
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(activeId)));
      closeModal();
      showToast(t("noteMovedToTrash"), "success");
      enqueueAndSync({ type: "trash", noteId: String(activeId) });
    }
  };

  const restoreFromTrash = async (noteId) => {
    // Local-first: restore immediately
    try {
      const existing = await idbGetNote(String(noteId));
      if (existing) await idbPutNote({ ...existing, trashed: false });
    } catch (e) { console.error(e); }
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();
    setNotes((prev) => prev.filter((n) => String(n.id) !== String(noteId)));
    closeModal();
    showToast(t("noteRestoredFromTrash"), "success");
    enqueueAndSync({ type: "restore", noteId: String(noteId) });
  };
  const togglePin = async (id, toPinned) => {
    // Local-first: apply pin immediately
    try {
      const existing = await idbGetNote(String(id));
      if (existing) await idbPutNote({ ...existing, pinned: !!toPinned });
    } catch (e) { console.error(e); }
    invalidateNotesCache();

    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === String(id) ? { ...n, pinned: !!toPinned } : n,
      ),
    );
    enqueueAndSync({ type: "patch", noteId: String(id), payload: { pinned: !!toPinned } });
  };

  /** -------- Reset note order -------- */
  const resetNoteOrder = async (overridePositions = true) => {
    const sorted = notes.slice().sort((a, b) => {
      const ap = a?.pinned ? 1 : 0;
      const bp = b?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const aUpd = new Date(a?.updated_at || a?.timestamp || 0).getTime();
      const bUpd = new Date(b?.updated_at || b?.timestamp || 0).getTime();
      if (aUpd !== bUpd) return bUpd - aUpd;
      const aCre = new Date(a?.created_at || 0).getTime();
      const bCre = new Date(b?.created_at || 0).getTime();
      return bCre - aCre;
    });

    // Assign new position values so the order persists across reloads
    if (overridePositions) {
      const now = Date.now();
      sorted.forEach((n, i) => {
        n.position = now - i;
      });
    }

    setNotes(sorted);

    // Local-first: update IndexedDB positions
    for (const n of sorted) {
      try {
        const existing = await idbGetNote(String(n.id));
        if (existing) await idbPutNote({ ...existing, position: n.position });
      } catch (e) {}
    }

    const pinnedIds = sorted.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = sorted.filter((n) => !n.pinned).map((n) => String(n.id));
    enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds, otherIds } });
    showToast?.(t("noteOrderReset"));
  };

  /** -------- Drag & Drop reorder (cards) -------- */
  const swapWithin = (arr, itemId, targetId) => {
    const a = arr.slice();
    const from = a.indexOf(itemId);
    const to = a.indexOf(targetId);
    if (from === -1 || to === -1) return arr;
    a[from] = targetId;
    a[to] = itemId;
    return a;
  };
  const onDragStart = (id, ev) => {
    dragId.current = String(id);
    const isPinned = !!notes.find((n) => String(n.id) === String(id))?.pinned;
    dragGroup.current = isPinned ? "pinned" : "others";
    ev.currentTarget.classList.add("dragging");
  };
  const onDragOver = (overId, group, ev) => {
    ev.preventDefault();
    if (!dragId.current) return;
    if (dragGroup.current !== group) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onDrop = async (overId, group, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = dragId.current;
    dragId.current = null;
    if (!dragged || String(dragged) === String(overId)) return;
    if (dragGroup.current !== group) return;

    const pinnedIds = notes.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    let newPinned = pinnedIds,
      newOthers = otherIds;
    if (group === "pinned")
      newPinned = swapWithin(pinnedIds, String(dragged), String(overId));
    else
      newOthers = swapWithin(otherIds, String(dragged), String(overId));

    // Optimistic update
    const byId = new Map(notes.map((n) => [String(n.id), n]));
    const reordered = [
      ...newPinned.map((id) => byId.get(id)),
      ...newOthers.map((id) => byId.get(id)),
    ];
    setNotes(reordered);

    // Local-first: enqueue reorder for server sync
    enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds: newPinned, otherIds: newOthers } });
    dragGroup.current = null;
  };
  const onDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
  };

  // Checklist item drag handlers (for modal reordering)

  // Local-first helper: persist checklist changes to IndexedDB + sync queue
  const syncChecklistItems = async (newItems) => {
    prevItemsRef.current = newItems;
    if (!activeId) return;
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();
    // Update notes state
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, items: newItems, updated_at: nowIso }
          : n,
      ),
    );
    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(noteId);
      if (existing) {
        await idbPutNote({ ...existing, items: newItems, updated_at: nowIso });
      }
    } catch (e) {
      console.error("IndexedDB checklist update failed:", e);
    }
    invalidateNotesCache();
    // Enqueue for server sync
    enqueueAndSync({
      type: "patch",
      noteId,
      payload: { items: newItems, type: "checklist", content: "" },
    });
  };

  const onChecklistDragStart = (itemId, ev) => {
    checklistDragId.current = String(itemId);
    ev.currentTarget.classList.add("dragging");
  };
  const onChecklistDragOver = (overItemId, ev) => {
    ev.preventDefault();
    if (!checklistDragId.current) return;
    if (String(checklistDragId.current) === String(overItemId)) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onChecklistDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onChecklistDrop = async (overItemId, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = checklistDragId.current;
    checklistDragId.current = null;

    if (!dragged || String(dragged) === String(overItemId)) return;

    // Only allow reordering unchecked items
    const draggedItem = mItems.find((it) => String(it.id) === String(dragged));
    const overItem = mItems.find((it) => String(it.id) === String(overItemId));

    if (!draggedItem || !overItem || draggedItem.done || overItem.done) return;

    // Reorder the unchecked items
    const uncheckedItems = mItems.filter((it) => !it.done);
    const checkedItems = mItems.filter((it) => it.done);

    const draggedIndex = uncheckedItems.findIndex(
      (it) => String(it.id) === String(dragged),
    );
    const overIndex = uncheckedItems.findIndex(
      (it) => String(it.id) === String(overItemId),
    );

    if (draggedIndex === -1 || overIndex === -1) return;

    // Remove dragged item and insert at new position
    const [removed] = uncheckedItems.splice(draggedIndex, 1);
    uncheckedItems.splice(overIndex, 0, removed);

    // Combine back with checked items
    const newItems = [...uncheckedItems, ...checkedItems];

    setMItems(newItems);
    syncChecklistItems(newItems);
  };
  const onChecklistDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
    // Clean up any remaining drag-over states
    document.querySelectorAll(".drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });
  };

  /** -------- Tags list (unique + counts) -------- */
  // Keep allNotesForTags in sync with notes when in normal view,
  // so tags remain visible when navigating to archive/trash
  useEffect(() => {
    if (notesAreRegular.current) {
      setAllNotesForTags(notes);
    }
  }, [notes]);

  const tagsWithCounts = useMemo(() => {
    const map = new Map();
    for (const n of allNotesForTags) {
      for (const t of n.tags || []) {
        const key = String(t).trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
  }, [allNotesForTags]);

  /** -------- Derived lists (search + tag filter) -------- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const tag =
      tagFilter === ALL_IMAGES
        ? null
        : tagFilter === "ARCHIVED"
          ? null
          : tagFilter === "TRASHED"
            ? null
            : tagFilter?.toLowerCase() || null;

    return notes.filter((n) => {
      if (tagFilter === ALL_IMAGES) {
        if (!(n.images && n.images.length)) return false;
      } else if (tagFilter === "ARCHIVED") {
        // In archived view, show all notes (they're already filtered by the backend)
        // Just apply search filter
      } else if (tagFilter === "TRASHED") {
        // In trashed view, show all notes (they're already filtered by the backend)
        // Just apply search filter
      } else if (activeTagFilters.length > 0) {
        // Multi-tag filter : la note doit contenir AU MOINS UN des tags sélectionnés
        const noteTags = (n.tags || []).map((t) => String(t).toLowerCase());
        if (!activeTagFilters.some((f) => noteTags.includes(f.toLowerCase()))) {
          return false;
        }
      } else if (
        tag &&
        !(n.tags || []).some((t) => String(t).toLowerCase() === tag)
      ) {
        return false;
      }
      if (!q) return true;
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      const tagsStr = (n.tags || []).join(" ").toLowerCase();
      const items = (n.items || [])
        .map((i) => i.text)
        .join(" ")
        .toLowerCase();
      const images = (n.images || [])
        .map((im) => im.name)
        .join(" ")
        .toLowerCase();
      return (
        t.includes(q) ||
        c.includes(q) ||
        tagsStr.includes(q) ||
        items.includes(q) ||
        images.includes(q)
      );
    });
  }, [notes, search, tagFilter, activeTagFilters]);
  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);
  const filteredEmptyWithSearch =
    filtered.length === 0 &&
    notes.length > 0 &&
    !!(search || (tagFilter && tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED") || activeTagFilters.length > 0);
  const allEmpty = notes.length === 0;

  /** -------- Modal link handler: open links in new tab (no auto-enter edit) -------- */
  const onModalBodyClick = (e) => {
    if (!(viewMode && mType === "text")) return;

    const a = e.target.closest("a");
    if (a) {
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
    }
    // NO automatic edit-mode toggle
  };

  /** -------- Image viewer helpers -------- */
  const openImageViewer = (index) => {
    setImgViewIndex(index);
    setImgViewOpen(true);
    resetMobileNav();
  };
  const closeImageViewer = () => setImgViewOpen(false);
  const nextImage = () => setImgViewIndex((i) => (i + 1) % mImages.length);
  const prevImage = () =>
    setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);

  /** -------- Formatting actions (composer & modal) -------- */
  const runFormat = (getter, setter, ref, type) => {
    const el = ref.current;
    if (!el) return;
    const value = getter();
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    // Insert defaults when editor is empty for quote / ul / ol
    if (
      (type === "ul" || type === "ol" || type === "quote") &&
      value.trim().length === 0
    ) {
      const snippet = type === "ul" ? "- " : type === "ol" ? "1. " : "> ";
      setter(snippet);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(snippet.length, snippet.length);
        } catch (e) {}
      });
      return;
    }

    // Handle list formatting when no text is selected
    if ((type === "ul" || type === "ol") && start === end) {
      const snippet = type === "ul" ? "- " : "1. ";
      const newValue = value.slice(0, start) + snippet + value.slice(end);
      setter(newValue);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(start + snippet.length, start + snippet.length);
        } catch (e) {}
      });
      return;
    }

    let result;
    switch (type) {
      case "h1":
        result = prefixLines(value, start, end, "# ");
        break;
      case "h2":
        result = prefixLines(value, start, end, "## ");
        break;
      case "h3":
        result = prefixLines(value, start, end, "### ");
        break;
      case "bold":
        result = wrapSelection(value, start, end, "**", "**");
        break;
      case "italic":
        result = wrapSelection(value, start, end, "_", "_");
        break;
      case "strike":
        result = wrapSelection(value, start, end, "~~", "~~");
        break;
      case "code":
        result = wrapSelection(value, start, end, "`", "`");
        break;
      case "codeblock":
        result = fencedBlock(value, start, end);
        break;
      case "quote":
        result = prefixLines(value, start, end, "> ");
        break;
      case "ul":
        result = toggleList(value, start, end, "ul");
        break;
      case "ol":
        result = toggleList(value, start, end, "ol");
        break;
      case "link":
        result = wrapSelection(value, start, end, "[", "](https://)");
        break;
      default:
        return;
    }
    setter(result.text);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(result.range[0], result.range[1]);
      } catch (e) {}
    });
  };
  const formatComposer = (type) =>
    runFormat(() => content, setContent, contentRef, type);
  const formatModal = (type) =>
    runFormat(() => mBody, setMBody, mBodyRef, type);

  /** Composer smart-enter handler */
  const onComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)
      return;
    const el = contentRef.current;
    if (!el) return;
    const value = content;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const res = handleSmartEnter(value, start, end);
    if (res) {
      e.preventDefault();
      setContent(res.text);
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(res.range[0], res.range[1]);
        } catch (e) {}
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  };

  /** Add copy buttons to code (view mode, text notes) */
  useEffect(() => {
    if (!(open && viewMode && mType === "text")) return;
    const root = noteViewRef.current;
    if (!root) return;

    const attach = () => {
      // Wrap code blocks so the copy button can stay fixed even on horizontal scroll
      root.querySelectorAll("pre").forEach((pre) => {
        // Ensure wrapper
        let wrapper = pre.closest(".code-block-wrapper");
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "code-block-wrapper";
          pre.parentNode?.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }
        if (wrapper.querySelector(".code-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const codeEl = pre.querySelector("code");
          const text = codeEl ? codeEl.textContent : pre.textContent;
          navigator.clipboard?.writeText(text || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        wrapper.appendChild(btn);

        // Keep copy button visible when code block top scrolls past the modal header
        const scrollEl = wrapper.closest(".modal-scroll-themed");
        if (scrollEl) {
          const stickyHeader = scrollEl.querySelector(".sticky");
          const adjustPos = () => {
            const headerBottom = stickyHeader
              ? stickyHeader.getBoundingClientRect().bottom
              : scrollEl.getBoundingClientRect().top;
            const wrapperTop = wrapper.getBoundingClientRect().top;
            const offset = headerBottom - wrapperTop;
            if (offset > 8) {
              const maxTop = wrapper.offsetHeight - btn.offsetHeight - 8;
              btn.style.top = Math.min(offset + 8, maxTop) + "px";
            } else {
              btn.style.top = "8px";
            }
          };
          scrollEl.addEventListener("scroll", adjustPos, { passive: true });
        }
      });

      // Inline code
      root.querySelectorAll("code").forEach((code) => {
        if (code.closest("pre")) return; // skip fenced
        if (
          code.nextSibling &&
          code.nextSibling.nodeType === 1 &&
          code.nextSibling.classList?.contains("inline-code-copy-btn")
        )
          return;
        const btn = document.createElement("button");
        btn.className = "inline-code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(code.textContent || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        code.insertAdjacentElement("afterend", btn);
      });
    };

    attach();
    // Ensure buttons after layout/async renders
    requestAnimationFrame(attach);
    const t1 = setTimeout(attach, 50);
    const t2 = setTimeout(attach, 200);

    // Observe DOM changes while in view mode
    const mo = new MutationObserver(() => attach());
    try {
      mo.observe(root, { childList: true, subtree: true });
    } catch (e) {}

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
    };
  }, [open, viewMode, mType, mBody, activeId]);

  /** -------- Modal JSX -------- */
  const modal = (open || isModalClosing) && (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 bg-black/40 z-40 flex items-center justify-center overscroll-contain`}
        onMouseDown={(e) => {
          // Only consider closing if the press STARTS on the scrim
          scrimClickStartRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Close only if press started AND ended on scrim (prevents drag-outside-close)
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-2xl w-full h-full max-w-none sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl flex flex-col relative overflow-hidden`}
          style={{ backgroundColor: modalBgFor(mColor, dark, windowWidth < 640) }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            className="relative flex-1 min-h-0 overflow-y-auto overflow-x-auto mobile-hide-scrollbar modal-scroll-themed"
            style={(() => {
              const sc = scrollColorsFor(mColor, dark);
              const noteColorBtn = (!dark && (!mColor || mColor === "default"))
                ? "#a78bfa"
                : solid(bgFor(mColor, dark));
              const noteColorOpaque = typeof noteColorBtn === "string" ? noteColorBtn.replace(/,\s*[\d.]+\)$/, ', 1)') : noteColorBtn;
              return { scrollbarColor: `${sc.thumb} ${sc.track}`, '--sb-thumb': sc.thumb, '--sb-track': sc.track, '--note-color': noteColorBtn, '--note-color-opaque': noteColorOpaque };
            })()}
          >
            {/* Sticky header (kept single line on desktop, wraps on mobile) */}
            <div
              className="sticky top-0 z-20 pt-4 modal-header-blur rounded-t-none sm:rounded-t-xl"
              style={{ backgroundColor: modalBgFor(mColor, dark, windowWidth < 640) }}
            >
              <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-3">
                <input
                  className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none pr-2"
                  style={windowWidth < 700 ? {
                    fontSize: mTitle.length > 40 ? "0.85rem"
                      : mTitle.length > 28 ? "1rem"
                      : mTitle.length > 18 ? "1.15rem"
                      : "1.25rem"
                  } : undefined}
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder={t("noteTitle")}
                />
                <div className="flex items-center gap-2 flex-none ml-auto">
                  {/* Icon buttons group – pill container */}
                  <div className="modal-icon-group">
                  {/* View/Edit toggle only for TEXT notes */}
                  {mType === "text" && (
                    <button
                      className="modal-icon-btn modal-icon-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]"
                      onClick={() => {
                        const el = modalScrollRef.current;
                        const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
                        savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
                        setViewMode((v) => !v);
                        setShowModalFmt(false);
                      }}
                      data-tooltip={
                        viewMode ? t("switchToEditMode") : t("switchToViewMode")
                      }
                      aria-label={viewMode ? t("editMode") : t("viewMode")}
                    >
                      {viewMode ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z" fill="currentColor" />
                          <path d="m14.06 4.94 3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                        </svg>
                      )}
                    </button>
                  )}
                  {/* Collaboration button - always visible */}
                  <button
                    className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                    data-tooltip={t("collaborate")}
                    onClick={async () => {
                      setCollaborationModalOpen(true);
                      if (activeId) {
                        await loadCollaboratorsForAddModal(activeId);
                      }
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                    <svg
                      className="w-3 h-3 absolute -top-1 -right-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                  </button>

                  {/* Formatting button + popover: mobile only (desktop uses inline toolbar below) */}
                  {mType === "text" && !viewMode && windowWidth < 768 && (
                    <>
                      <button
                        ref={modalFmtBtnRef}
                        className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                        data-tooltip={t("formatting")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowModalFmt((v) => !v);
                        }}
                      >
                        <FormatIcon />
                      </button>
                      <Popover
                        anchorRef={modalFmtBtnRef}
                        open={showModalFmt}
                        onClose={() => setShowModalFmt(false)}
                      >
                        <FormatToolbar
                          dark={dark}
                          onAction={(t) => {
                            setShowModalFmt(false);
                            formatModal(t);
                          }}
                        />
                      </Popover>
                    </>
                  )}

                  {/* 3-dots menu */}
                  <>
                    <button
                      ref={modalMenuBtnRef}
                        className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                        data-tooltip={t("moreOptions")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalMenuOpen((v) => !v);
                        }}
                      >
                        <Kebab />
                      </button>
                      <Popover
                        anchorRef={modalMenuBtnRef}
                        open={modalMenuOpen}
                        onClose={() => setModalMenuOpen(false)}
                      >
                        <div
                          className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                          style={{
                            backgroundColor: dark ? "#222222" : undefined,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              const n = notes.find(
                                (nn) => String(nn.id) === String(activeId),
                              );
                              if (n) handleDownloadNote(n);
                              setModalMenuOpen(false);
                            }}
                          >
                            <DownloadIcon />{t("downloadMd")}</button>
                          {tagFilter === "TRASHED" ? (
                            <>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  restoreFromTrash(activeId);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <ArchiveIcon />{t("restoreFromTrash")}
                              </button>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  setConfirmDeleteOpen(true);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <Trash />{t("permanentlyDelete")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  const note = notes.find(
                                    (nn) => String(nn.id) === String(activeId),
                                  );
                                  if (note) {
                                    handleArchiveNote(activeId, !note.archived);
                                    setModalMenuOpen(false);
                                  }
                                }}
                              >
                                <ArchiveIcon />
                                {activeNoteObj?.archived ? t("unarchive") : t("archive")}
                              </button>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  setConfirmDeleteOpen(true);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <Trash />{t("moveToTrash")}
                              </button>
                            </>
                          )}
                        </div>
                    </Popover>
                  </>

                  {/* Pin button - hidden in archived view */}
                  {tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED" && (
                    <button
                      className={`modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)] ${
                        notes.find((n) => String(n.id) === String(activeId))?.pinned
                          ? "modal-icon-btn--active"
                          : ""
                      }`}
                      data-tooltip={t("pinUnpin")}
                      onClick={() =>
                        activeId != null &&
                        togglePin(
                          activeId,
                          !notes.find((n) => String(n.id) === String(activeId))
                            ?.pinned,
                        )
                      }
                    >
                      {notes.find((n) => String(n.id) === String(activeId))
                        ?.pinned ? (
                        <PinFilled />
                      ) : (
                        <PinOutline />
                      )}
                    </button>
                  )}

                  <button
                    className="modal-icon-btn modal-icon-btn--close focus:outline-none"
                    data-tooltip={t("close")}
                    onClick={closeModal}
                  >
                    <CloseIcon />
                  </button>
                  </div>{/* end icon pill group */}
                </div>

              </div>

              {/* Desktop inline formatting toolbar (always visible in edit mode) */}
              {mType === "text" && !viewMode && windowWidth >= 768 && (
                <div
                  className={`px-4 sm:px-6 pt-2 pb-3 border-t flex flex-wrap items-center gap-1 ${
                    dark ? "border-white/10" : "border-black/8"
                  }`}
                >
                  {(() => {
                    const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
                    return (
                      <>
                        <button className={base} onClick={() => formatModal("h1")}>H1</button>
                        <button className={base} onClick={() => formatModal("h2")}>H2</button>
                        <button className={base} onClick={() => formatModal("h3")}>H3</button>
                        <span className="mx-1 opacity-40">|</span>
                        <button className={base} onClick={() => formatModal("bold")}><strong>B</strong></button>
                        <button className={base} onClick={() => formatModal("italic")}><em>I</em></button>
                        <button className={base} onClick={() => formatModal("strike")}><span className="line-through">S</span></button>
                        <button className={base} onClick={() => formatModal("code")}>`code`</button>
                        <button className={base} onClick={() => formatModal("codeblock")}>&lt;/&gt;</button>
                        <span className="mx-1 opacity-40">|</span>
                        <button className={base} onClick={() => formatModal("quote")}>&gt;</button>
                        <button className={base} onClick={() => formatModal("ul")}>{t("bulletListLabel")}</button>
                        <button className={base} onClick={() => formatModal("ol")}>{t("orderedListLabel")}</button>
                        <button className={base} onClick={() => formatModal("link")}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Images - Google Keep style grid */}
            {mImages.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center px-2 pb-2">
                {mImages.map((im, idx) => (
                  <div
                    key={im.id}
                    className="group relative overflow-hidden rounded-md border border-[var(--border-light)]"
                    style={{
                      width: mImages.length === 1 ? "100%" : "calc(50% - 4px)",
                    }}
                  >
                    <img
                      src={im.src}
                      alt={im.name}
                      className="w-full h-auto object-contain object-center cursor-pointer"
                      style={{ maxHeight: "360px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openImageViewer(idx);
                      }}
                    />
                    <button
                      data-tooltip={t("removeImage")}
                      className="absolute -top-1 right-0 text-black dark:text-white text-2xl leading-none opacity-0 group-hover:opacity-100 hover:opacity-60 transition-opacity cursor-pointer"
                      onClick={() =>
                        setMImages((prev) =>
                          prev.filter((x) => x.id !== im.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Content area */}
            <div
              className={mType === "draw" ? "p-2 pb-6" : "p-6 pb-12"}
              onClick={onModalBodyClick}
            >

              {/* Text, Checklist, or Drawing */}
              {mType === "text" ? (
                viewMode ? (
                  <div
                    ref={noteViewRef}
                    className="note-content note-content--dense whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: renderSafeMarkdown(mBody),
                    }}
                  />
                ) : (
                  <div className="relative min-h-[160px]">
                    <textarea
                      ref={mBodyRef}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px]"
                      style={{ scrollBehavior: "unset" }}
                      value={mBody}
                      onChange={(e) => {
                        setMBody(e.target.value);
                        resizeModalTextarea();
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.altKey &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          const el = mBodyRef.current;
                          const value = mBody;
                          const start = el.selectionStart ?? value.length;
                          const end = el.selectionEnd ?? value.length;

                          // Check if cursor is on the last line before Enter
                          const lastNewlineIndex = value.lastIndexOf("\n");
                          const isOnLastLine = start > lastNewlineIndex;

                          const res = handleSmartEnter(value, start, end);
                          if (res) {
                            e.preventDefault();
                            setMBody(res.text);
                            requestAnimationFrame(() => {
                              try {
                                el.setSelectionRange(
                                  res.range[0],
                                  res.range[1],
                                );
                              } catch (e) {}
                              resizeModalTextarea();

                              // If we were on the last line, scroll down a bit to ensure cursor visibility
                              if (isOnLastLine) {
                                const modalScrollEl = modalScrollRef.current;
                                if (modalScrollEl) {
                                  setTimeout(() => {
                                    modalScrollEl.scrollTop += 30; // Scroll down by 30px
                                  }, 50);
                                }
                              }
                            });
                          } else if (isOnLastLine) {
                            // If not handled by smart enter but on last line, allow normal Enter but scroll down
                            setTimeout(() => {
                              const modalScrollEl = modalScrollRef.current;
                              if (modalScrollEl) {
                                modalScrollEl.scrollTop += 30; // Scroll down by 30px
                              }
                            }, 10);
                          }
                        }
                      }}
                      placeholder={t("writeYourNoteEllipsis")}
                    />
                  </div>
                )
              ) : mType === "checklist" ? (
                <div className="space-y-4 md:space-y-2">
                  {/* Add new item row */}
                  <div className="flex gap-2">
                      <input
                        value={mInput}
                        onChange={(e) => setMInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = mInput.trim();
                            if (t) {
                              const newItems = [
                                ...mItems,
                                { id: uid(), text: t, done: false },
                              ];
                              setMItems(newItems);
                              setMInput("");
                              syncChecklistItems(newItems);
                            }
                          }
                        }}
                        placeholder={t("listItemEllipsis")}
                        className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                      />
                      <button
                        onClick={() => {
                          const t = mInput.trim();
                          if (t) {
                            const newItems = [
                              ...mItems,
                              { id: uid(), text: t, done: false },
                            ];
                            setMItems(newItems);
                            setMInput("");
                            syncChecklistItems(newItems);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("add")}</button>
                  </div>

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems
                        .filter((it) => !it.done)
                        .map((it) => (
                          <div
                            key={it.id}
                            data-checklist-item={it.id}
                            onDragOver={(e) => onChecklistDragOver(it.id, e)}
                            onDragLeave={onChecklistDragLeave}
                            onDrop={(e) => onChecklistDrop(it.id, e)}
                            className="group flex items-center gap-2"
                          >
                            {/* Drag handle */}
                            <div
                              draggable
                              onDragStart={(e) =>
                                onChecklistDragStart(it.id, e)
                              }
                              onDragEnd={onChecklistDragEnd}
                              onTouchStart={(e) => {
                                // Handle touch drag start - only when touching the handle
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );
                                if (target) {
                                  checklistDragId.current = String(it.id);
                                  target.classList.add("dragging");
                                }
                              }}
                              onTouchMove={(e) => {
                                if (!checklistDragId.current) return;

                                const touch = e.touches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                if (elementAtPoint) {
                                  // Find the checklist item container
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !==
                                      e.currentTarget.closest(
                                        "[data-checklist-item]",
                                      )
                                  ) {
                                    const dragOverEvent = new Event(
                                      "dragover",
                                      { bubbles: true },
                                    );
                                    checklistItem.dispatchEvent(dragOverEvent);
                                  }
                                }
                              }}
                              onTouchEnd={(e) => {
                                if (!checklistDragId.current) return;
                                const touch = e.changedTouches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );

                                if (elementAtPoint) {
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !== target
                                  ) {
                                    const dropEvent = new Event("drop", {
                                      bubbles: true,
                                    });
                                    checklistItem.dispatchEvent(dropEvent);
                                  }
                                }

                                if (target) {
                                  target.classList.remove("dragging");
                                }
                                checklistDragId.current = null;

                                // Clean up any remaining drag-over states
                                document
                                  .querySelectorAll(".drag-over")
                                  .forEach((el) => {
                                    el.classList.remove("drag-over");
                                  });
                              }}
                              className="flex items-center justify-center px-1 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-70 transition-opacity"
                              style={{ touchAction: "none" }}
                            >
                              <div className="grid grid-cols-2 gap-0.5">
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              </div>
                            </div>

                            <div className="flex-1">
                              <ChecklistRow
                                item={it}
                                readOnly={false}
                                disableToggle={false}
                                showRemove={true}
                                size="lg"
                                onToggle={(checked, e) => {
                                  e?.stopPropagation();
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, done: checked } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onChange={(txt) => {
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, text: txt } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onRemove={() => {
                                  const newItems = mItems.filter(
                                    (p) => p.id !== it.id,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                              />
                            </div>
                          </div>
                        ))}

                      {/* Done section */}
                      {mItems.filter((it) => it.done).length > 0 && (
                        <>
                          <div className="border-t border-[var(--border-light)] pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{t("done")}</h4>
                            {mItems
                              .filter((it) => it.done)
                              .map((it) => (
                                <ChecklistRow
                                  key={it.id}
                                  item={it}
                                  readOnly={false}
                                  disableToggle={false}
                                  showRemove={true}
                                  size="lg"
                                  onToggle={(checked, e) => {
                                    e?.stopPropagation();
                                    const newItems = mItems.map((p) =>
                                      p.id === it.id ? { ...p, done: checked } : p,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                  onChange={(txt) => {
                                    const newItems = mItems.map((p) =>
                                      p.id === it.id ? { ...p, text: txt } : p,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                  onRemove={() => {
                                    const newItems = mItems.filter(
                                      (p) => p.id !== it.id,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                />
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
                  )}
                </div>
              ) : (
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={750}
                  height={850}
                  readOnly={false}
                  darkMode={dark}
                  initialMode="view"
                />
              )}

              {/* Inline Edited stamp: only when scrollable (appears at very end) */}
              {editedStamp && modalScrollable && (
                <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right flex items-center justify-end gap-1.5">
                  <span>{t("editedPrefix")} {editedStamp}</span>
                  {activeId && (
                    <span
                      className="opacity-30 hover:opacity-100 cursor-default transition-opacity select-all"
                      title={`Note ID : ${activeId}`}
                    >ⓘ</span>
                  )}
                </div>
              )}
            </div>

            {/* Absolute Edited stamp: only when NOT scrollable (sits just above footer) */}
            {editedStamp && !modalScrollable && (
              <div className="absolute bottom-3 right-4 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span className="pointer-events-none">{t("editedPrefix")} {editedStamp}</span>
                {activeId && (
                  <span
                    className="opacity-30 hover:opacity-100 cursor-default transition-opacity select-all"
                    title={`Note ID : ${activeId}`}
                  >ⓘ</span>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border-light)] p-4 flex flex-wrap items-center gap-3">
            {/* Tags chips editor */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {mTagList.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40 backdrop-blur-sm transition-all duration-150 hover:bg-indigo-200/90 dark:hover:bg-indigo-800/60 hover:scale-105 hover:shadow-sm"
                >
                  <svg className="w-3 h-3 opacity-70 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  {tag}
                  <button
                    className="w-3.5 h-3.5 rounded-full text-indigo-400 dark:text-indigo-300 hover:bg-red-400 dark:hover:bg-red-500 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer focus:outline-none leading-none"
                    data-tooltip={t("removeTag")}
                    onClick={() =>
                      setMTagList((prev) => prev.filter((t) => t !== tag))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* Tag add button */}
              <div className="relative">
                  <button
                    ref={modalTagBtnRef}
                    type="button"
                    onClick={() => {
                      setModalTagFocused((v) => {
                        if (!v) setTimeout(() => { if (windowWidth >= 640) modalTagInputRef.current?.focus(); }, 0);
                        return !v;
                      });
                      setTagInput("");
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-500 dark:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 cursor-pointer"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                    </svg>
                    {t("addTag")}
                  </button>
                  {modalTagFocused && (() => {
                    const rect = modalTagBtnRef.current?.getBoundingClientRect();
                    if (!rect) return null;
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const dropUp = spaceBelow < 280;
                    const dropWidth = 240;
                    const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);
                    const suggestions = tagsWithCounts
                      .filter(
                        ({ tag: t }) =>
                          (!tagInput.trim() || t.toLowerCase().includes(tagInput.toLowerCase())) &&
                          !mTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                      );
                    const trimmed = tagInput.trim();
                    const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !mTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
                    return createPortal(
                      <div
                        style={{
                          position: "fixed",
                          ...(dropUp
                            ? { bottom: window.innerHeight - rect.top + 6, left: dropLeft }
                            : { top: rect.bottom + 6, left: dropLeft }),
                          width: dropWidth,
                          zIndex: 99999,
                        }}
                        className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
                      >
                        {/* Search input inside dropdown */}
                        <div className="px-2 pt-2 pb-1.5">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 transition-colors duration-150">
                            <svg className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>
                            </svg>
                            <input
                              ref={modalTagInputRef}
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") { setTagInput(""); setModalTagFocused(false); return; }
                                handleTagKeyDown(e);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  if (!suppressTagBlurRef.current) handleTagBlur();
                                  suppressTagBlurRef.current = false;
                                  setModalTagFocused(false);
                                }, 200);
                              }}
                              onPaste={handleTagPaste}
                              placeholder={t("searchOrCreateTag") || "Rechercher ou créer…"}
                              className="flex-1 bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
                            />
                          </div>
                        </div>
                        {/* Tag list */}
                        {suggestions.length > 0 && (
                          <>
                            <div className="px-3 pt-1 pb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                            </div>
                            <div className="px-1.5 pb-1.5 max-h-44 overflow-y-auto">
                              {suggestions.map(({ tag, count }) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    suppressTagBlurRef.current = true;
                                    addTags(tag);
                                    setTagInput("");
                                    setModalTagFocused(false);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                        <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                      </svg>
                                    </span>
                                    <span className="truncate font-medium">{tag}</span>
                                  </span>
                                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {suggestions.length === 0 && !isNew && (
                          <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t("noTagsFound") || "Aucun tag trouvé"}</div>
                        )}
                        {isNew && (
                          <>
                            {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                            <div className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  suppressTagBlurRef.current = true;
                                  addTags(trimmed);
                                  setTagInput("");
                                  setModalTagFocused(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                              >
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                                  </svg>
                                </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Créer"} "<span className="font-semibold">{trimmed}</span>"</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>,
                      document.body
                    );
                  })()}
              </div>
            </div>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-3 flex-shrink-0">
              {/* Color dropdown (modal) */}
              <button
                ref={modalColorBtnRef}
                type="button"
                onClick={() => setShowModalColorPop((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-opacity"
                data-tooltip={t("color")}
              >
                <PaletteColorIcon size={22} />
              </button>
              <ColorPickerPanel
                anchorRef={modalColorBtnRef}
                open={showModalColorPop}
                onClose={() => setShowModalColorPop(false)}
                colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                selectedColor={mColor}
                darkMode={dark}
                onSelect={(name) => setMColor(name)}
              />

              {/* Add images */}
              <input
                ref={modalFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files;
                  if (f && f.length) {
                    await addImagesToState(f, setMImages);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => modalFileRef.current?.click()}
                className="p-1.5 text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 flex-shrink-0 transition-colors duration-200"
                data-tooltip={t("addImages")}
              >
                <AddImageIcon />
              </button>

              {/* Save button - hidden for collaborative text notes (they auto-save) */}
              {modalHasChanges &&
                !(mType === "text" && isCollaborativeNote(activeId)) && (
                  <button
                    onClick={saveModal}
                    disabled={savingModal}
                    className={`px-4 py-2 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 whitespace-nowrap transition-all duration-200 ${savingModal ? "bg-gradient-to-r from-indigo-400 to-violet-500 text-white cursor-not-allowed opacity-70" : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient focus:ring-indigo-500"}`}
                  >
                    {savingModal ? t("saving") : t("save")}
                  </button>
                )}
              {/* Delete button moved to modal 3-dot menu */}
            </div>
          </div>

          {/* Confirm Delete Dialog */}
          {confirmDeleteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setConfirmDeleteOpen(false)}
              />
              <div
                className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
                style={{
                  backgroundColor: dark
                    ? "rgba(40,40,40,0.95)"
                    : "rgba(255,255,255,0.95)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-2">
                  {tagFilter === "TRASHED" ? t("permanentlyDeleteQuestion") : t("moveToTrashQuestion")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {tagFilter === "TRASHED" ? t("permanentlyDeleteConfirm") : t("moveToTrashConfirm")}
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setConfirmDeleteOpen(false)}
                  >{t("cancel")}</button>
                  <button
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    onClick={async () => {
                      setConfirmDeleteOpen(false);
                      await deleteModal();
                    }}
                  >{tagFilter === "TRASHED" ? t("permanentlyDelete") : t("moveToTrash")}</button>
                </div>
              </div>
            </div>
          )}

          {/* Collaboration Modal */}
          {collaborationModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                  setCollaborationModalOpen(false);
                  setCollaboratorUsername("");
                  setShowUserDropdown(false);
                  setFilteredUsers([]);
                }}
              />
              <div
                className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
                style={{
                  backgroundColor: dark
                    ? "rgba(40,40,40,0.95)"
                    : "rgba(255,255,255,0.95)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  // Check if user owns the note (or if it's a new note)
                  const note = activeId
                    ? notes.find((n) => String(n.id) === String(activeId))
                    : null;
                  const isOwner =
                    !activeId || note?.user_id === currentUser?.id;

                  return (
                    <>
                      <h3 className="text-lg font-semibold mb-4">
                        {isOwner ? t("addCollaborator") : t("collaborators")}
                      </h3>

                      {/* Show existing collaborators with remove option */}
                      {addModalCollaborators.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("currentCollaborators")}</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {addModalCollaborators.map((collab) => {
                              const canRemove =
                                isOwner || collab.id === currentUser?.id;

                              return (
                                <div
                                  key={collab.id}
                                  className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                                >
                                  <div>
                                    <p className="font-medium text-sm">
                                      {collab.name || collab.email}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {collab.email}
                                    </p>
                                  </div>
                                  {canRemove && (
                                    <button
                                      onClick={async () => {
                                        await removeCollaborator(
                                          collab.id,
                                          activeId,
                                        );
                                      }}
                                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                      data-tooltip={
                                        collab.id === currentUser?.id
                                          ? "Remove yourself"
                                          : "Remove collaborator"
                                      }
                                    >
                                      {collab.id === currentUser?.id
                                        ? "Leave"
                                        : t("remove")}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Only show add collaborator input/button if user owns the note */}
                      {isOwner && (
                        <>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            {t("collaborateInstructions")}
                          </p>
                          <div ref={collaboratorInputRef} className="relative">
                            <input
                              type="text"
                              value={collaboratorUsername}
                              onChange={(e) => {
                                const value = e.target.value;
                                setCollaboratorUsername(value);
                                updateDropdownPosition();
                                searchUsers(value);
                              }}
                              onFocus={() => {
                                updateDropdownPosition();
                                searchUsers(collaboratorUsername || "");
                              }}
                              placeholder={t("searchByUsernameOrEmail")}
                              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  collaboratorUsername.trim()
                                ) {
                                  // If dropdown is open and there's a filtered user, select the first one
                                  if (
                                    showUserDropdown &&
                                    filteredUsers.length > 0
                                  ) {
                                    const firstUser = filteredUsers[0];
                                    setCollaboratorUsername(
                                      firstUser.name || firstUser.email,
                                    );
                                    setShowUserDropdown(false);
                                  } else {
                                    addCollaborator(
                                      collaboratorUsername.trim(),
                                    );
                                  }
                                } else if (e.key === "Escape") {
                                  setShowUserDropdown(false);
                                }
                              }}
                            />
                          </div>
                          <div className="mt-5 flex justify-end gap-3">
                            <button
                              className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={() => {
                                setCollaborationModalOpen(false);
                                setCollaboratorUsername("");
                                setShowUserDropdown(false);
                                setFilteredUsers([]);
                              }}
                            >{t("cancel")}</button>
                            <button
                              className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                              onClick={async () => {
                                if (collaboratorUsername.trim()) {
                                  await addCollaborator(
                                    collaboratorUsername.trim(),
                                  );
                                }
                              }}
                            >{t("addCollaborator")}</button>
                          </div>
                        </>
                      )}

                      {/* If user doesn't own the note, show only cancel button */}
                      {!isOwner && (
                        <div className="mt-5 flex justify-end gap-3">
                          <button
                            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => {
                              setCollaborationModalOpen(false);
                              setCollaboratorUsername("");
                              setShowUserDropdown(false);
                              setFilteredUsers([]);
                            }}
                          >{t("close")}</button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* User dropdown portal - rendered outside modal */}
          {showUserDropdown &&
            filteredUsers.length > 0 &&
            createPortal(
              <div
                data-user-dropdown
                className="fixed z-[60] bg-white dark:bg-[#272727] border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                }}
              >
                {loadingUsers ? (
                  <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{t("searching")}</div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                      onClick={() => {
                        setCollaboratorUsername(user.name || user.email);
                        setShowUserDropdown(false);
                      }}
                    >
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {user.name || user.email}
                      </div>
                      {user.name && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {user.email}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>,
              document.body,
            )}
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {imgViewOpen && mImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[9999] backdrop-blur-md bg-black/30 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeImageViewer();
            resetMobileNav();
          }}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              data-tooltip={t("downloadShortcut")}
              onClick={async (e) => {
                e.stopPropagation();
                const im = mImages[imgViewIndex];
                if (im) {
                  const fname = normalizeImageFilename(
                    im.name,
                    im.src,
                    imgViewIndex + 1,
                  );
                  await downloadDataUrl(fname, im.src);
                }
              }}
            >
              <DownloadIcon />
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              data-tooltip={t("closeEsc")}
              onClick={(e) => {
                e.stopPropagation();
                closeImageViewer();
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Prev / Next */}
          {mImages.length > 1 && (
            <>
              <button
                className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                data-tooltip={t("previousArrow")}
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                  resetMobileNav();
                }}
              >
                <ArrowLeft />
              </button>
              <button
                className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                data-tooltip={t("nextArrow")}
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                  resetMobileNav();
                }}
              >
                <ArrowRight />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={mImages[imgViewIndex].src}
            alt={mImages[imgViewIndex].name || `image-${imgViewIndex + 1}`}
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
            style={{ background: dark ? "#000" : "#fff" }}
            onClick={(e) => { e.stopPropagation(); resetMobileNav(); }}
          />
          {/* Caption */}
          <div className="absolute top-4 left-0 right-0 z-10 text-xs text-white text-center">
            <span className="hidden sm:inline">{mImages[imgViewIndex].name || `image-${imgViewIndex + 1}`} </span>
            {mImages.length > 1 && (
              <span>{imgViewIndex + 1}/{mImages.length}</span>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser?.email && route !== "#/notes" && route !== "#/admin")
      navigate("#/notes");
  }, [currentUser]); // eslint-disable-line

  // Close sidebar when navigating away or opening modal
  useEffect(() => {
    if (open && !(activeTagFilters && window.matchMedia?.("(min-width: 1024px)")?.matches)) setSidebarOpen(false);
  }, [open]);

  // ---- Routing ----
  if (route === "#/admin") {
    if (!currentUser?.email) {
      return (
        <AuthShell title={t("adminPanel")} dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm mb-4">{t("mustSignInAdmin")}</p>
          <button
            className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
            onClick={() => (window.location.hash = "#/login")}
          >{t("goToSignIn")}</button>
        </AuthShell>
      );
    }
    if (!currentUser?.is_admin) {
      return (
        <AuthShell title={t("adminPanel")} dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm">{t("notAuthorizedAdmin")}</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => (window.location.hash = "#/notes")}
          >{t("backToNotes")}</button>
        </AuthShell>
      );
    }
    return (
      <AdminView
        token={token}
        currentUser={currentUser}
        dark={dark}
        onToggleDark={toggleDark}
        onBackToNotes={() => (window.location.hash = "#/notes")}
      />
    );
  }

  if (!currentUser?.email) {
    if (route === "#/register") {
      return (
        <RegisterView
          dark={dark}
          onToggleDark={toggleDark}
          onRegister={register}
          goLogin={() => navigate("#/login")}
          floatingCardsEnabled={true}
          loginSlogan={loginSlogan}
        />
      );
    }
    if (route === "#/login-secret") {
      return (
        <SecretLoginView
          dark={dark}
          onToggleDark={toggleDark}
          onLoginWithKey={signInWithSecret}
          goLogin={() => navigate("#/login")}
          floatingCardsEnabled={true}
          loginSlogan={loginSlogan}
        />
      );
    }
    return (
      <LoginView
        dark={dark}
        onToggleDark={toggleDark}
        onLogin={signIn}
        onLoginById={signInById}
        goRegister={() => navigate("#/register")}
        goSecret={() => navigate("#/login-secret")}
        allowRegistration={allowRegistration}
        floatingCardsEnabled={true}
        loginSlogan={loginSlogan}
        loginProfiles={loginProfiles}
      />
    );
  }

  return (
    <>
      <TooltipPortal />
      {/* Decorative floating background — fixed wallpaper, z-1 keeps it below all UI (desktop only) */}
      {floatingCardsEnabled && <div aria-hidden="true" style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",overflow:"hidden"}}>
        {/* Colonne gauche */}
        <div className="login-deco-card" style={{"--rot":"-12deg","--dur":"7s","--delay":"0s",top:"5%",left:"2%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"5deg","--dur":"9s","--delay":"-2s",top:"32%",left:"1%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"8deg","--dur":"8s","--delay":"-4s",top:"60%",left:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"65%"}}/>
          <div className="deco-line" style={{width:"45%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-6deg","--dur":"10s","--delay":"-7s",top:"83%",left:"5%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        {/* Colonne centre-gauche */}
        <div className="login-deco-card" style={{"--rot":"10deg","--dur":"8.5s","--delay":"-1.5s",top:"12%",left:"22%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"64%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-7deg","--dur":"9.5s","--delay":"-6s",top:"46%",left:"20%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"58%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"13deg","--dur":"7.5s","--delay":"-3.5s",top:"75%",left:"25%",borderTop:"3px solid rgba(132,204,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(132,204,22,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"52%"}}/>
          <div className="deco-line" style={{width:"68%"}}/>
        </div>
        {/* Colonne centre */}
        <div className="login-deco-card" style={{"--rot":"-4deg","--dur":"11s","--delay":"-0.5s",top:"4%",left:"44%",borderTop:"3px solid rgba(236,72,153,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(236,72,153,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"9deg","--dur":"9s","--delay":"-8s",top:"80%",left:"48%",borderTop:"3px solid rgba(20,184,166,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(20,184,166,0.5)"}}/>
          <div className="deco-line" style={{width:"74%"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        {/* Colonne centre-droite */}
        <div className="login-deco-card" style={{"--rot":"-9deg","--dur":"10.5s","--delay":"-2.5s",top:"10%",left:"65%",borderTop:"3px solid rgba(244,63,94,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(244,63,94,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"92%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"7deg","--dur":"8s","--delay":"-7s",top:"44%",left:"63%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"62%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-11deg","--dur":"9s","--delay":"-4.5s",top:"73%",left:"67%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"72%"}}/>
        </div>
        {/* Colonne droite */}
        <div className="login-deco-card" style={{"--rot":"6deg","--dur":"10s","--delay":"-1s",top:"6%",right:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-8deg","--dur":"7.5s","--delay":"-3s",top:"35%",right:"2%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-15deg","--dur":"11s","--delay":"-5s",top:"62%",right:"4%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"4deg","--dur":"8s","--delay":"-9s",top:"85%",right:"6%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"66%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
      </div>}
      {/* Tag Sidebar / Drawer */}
      <TagSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tagsWithCounts={tagsWithCounts}
        activeTag={tagFilter}
        activeTagFilters={activeTagFilters}
        onSelect={(tag, event) => {
          if (tag === "ARCHIVED" || tag === "TRASHED" || tag === ALL_IMAGES || tag === null) {
            // Only clear notes when SWITCHING views, not when re-clicking the same one
            if ((tag === "ARCHIVED" || tag === "TRASHED") && tag !== tagFilter) setNotes([]);
            setTagFilter(tag);
            setActiveTagFilters([]);
          } else if (event?.ctrlKey || event?.metaKey) {
            // Ctrl/Cmd+clic : multi-select (toggle)
            setTagFilter(null);
            setActiveTagFilters((prev) =>
              prev.includes(tag)
                ? prev.filter((t) => t !== tag)
                : [...prev, tag]
            );
          } else {
            // Clic simple : filtre unique (re-clic = désélectionne)
            setTagFilter(null);
            setActiveTagFilters((prev) =>
              prev.length === 1 && prev[0] === tag ? [] : [tag]
            );
          }
        }}
        dark={dark}
        permanent={alwaysShowSidebarOnWide && windowWidth >= 700}
        width={sidebarWidth}
        onResize={setSidebarWidth}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        dark={dark}
        onExportAll={exportAll}
        onImportAll={() => importFileRef.current?.click()}
        onImportGKeep={() => gkeepFileRef.current?.click()}
        onImportMd={() => mdFileRef.current?.click()}
        onDownloadSecretKey={downloadSecretKey}
        alwaysShowSidebarOnWide={alwaysShowSidebarOnWide}
        setAlwaysShowSidebarOnWide={setAlwaysShowSidebarOnWide}
        localAiEnabled={localAiEnabled}
        setLocalAiEnabled={setLocalAiEnabled}
        floatingCardsEnabled={floatingCardsEnabled}
        setFloatingCardsEnabled={setFloatingCardsEnabled}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
        onResetNoteOrder={resetNoteOrder}
        currentUser={currentUser}
        token={token}
        onProfileUpdated={(updates) => {
          setSession((prev) => prev ? { ...prev, user: { ...prev.user, ...updates } } : prev);
          setAuth({ ...getAuth(), user: { ...getAuth()?.user, ...updates } });
        }}
      />

      {/* Admin Panel */}
      {console.log("Rendering AdminPanel with:", {
        adminPanelOpen,
        adminSettings,
        allUsers: allUsers?.length,
      })}
      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        dark={dark}
        adminSettings={adminSettings}
        setAdminSettings={setAdminSettings}
        allUsers={allUsers}
        newUserForm={newUserForm}
        setNewUserForm={setNewUserForm}
        updateAdminSettings={updateAdminSettings}
        createUser={createUser}
        deleteUser={deleteUser}
        updateUser={updateUser}
        currentUser={currentUser}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
      />

      <NotesUI
        currentUser={currentUser}
        dark={dark}
        toggleDark={toggleDark}
        signOut={signOut}
        search={search}
        setSearch={setSearch}
        composerType={composerType}
        setComposerType={setComposerType}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        contentRef={contentRef}
        clInput={clInput}
        setClInput={setClInput}
        addComposerItem={addComposerItem}
        clItems={clItems}
        composerDrawingData={composerDrawingData}
        setComposerDrawingData={setComposerDrawingData}
        composerImages={composerImages}
        setComposerImages={setComposerImages}
        composerFileRef={composerFileRef}
        tags={tags}
        composerTagList={composerTagList}
        setComposerTagList={setComposerTagList}
        composerTagInput={composerTagInput}
        setComposerTagInput={setComposerTagInput}
        composerTagFocused={composerTagFocused}
        setComposerTagFocused={setComposerTagFocused}
        composerTagInputRef={composerTagInputRef}
        tagsWithCounts={tagsWithCounts}
        setTags={setTags}
        composerColor={composerColor}
        setComposerColor={setComposerColor}
        addNote={addNote}
        pinned={pinned}
        others={others}
        openModal={openModal}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        togglePin={togglePin}
        addImagesToState={addImagesToState}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        onExportAll={exportAll}
        onImportAll={importAll}
        onImportGKeep={importGKeep}
        onImportMd={importMd}
        onDownloadSecretKey={downloadSecretKey}
        importFileRef={importFileRef}
        gkeepFileRef={gkeepFileRef}
        mdFileRef={mdFileRef}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
        openSidebar={() => setSidebarOpen(true)}
        activeTagFilter={tagFilter}
        activeTagFilters={activeTagFilters}
        sidebarPermanent={alwaysShowSidebarOnWide && windowWidth >= 700}
        sidebarWidth={sidebarWidth}
        // AI props
        localAiEnabled={localAiEnabled}
        aiResponse={aiResponse}
        setAiResponse={setAiResponse}
        isAiLoading={isAiLoading}
        aiLoadingProgress={aiLoadingProgress}
        onAiSearch={handleAiSearch}
        // formatting props
        formatComposer={formatComposer}
        showComposerFmt={showComposerFmt}
        setShowComposerFmt={setShowComposerFmt}
        composerFmtBtnRef={composerFmtBtnRef}
        onComposerKeyDown={onComposerKeyDown}
        // collapsed composer
        composerCollapsed={composerCollapsed}
        setComposerCollapsed={setComposerCollapsed}
        titleRef={titleRef}
        composerRef={composerRef}
        // color popover
        colorBtnRef={colorBtnRef}
        showColorPop={showColorPop}
        setShowColorPop={setShowColorPop}
        // loading
        notesLoading={notesLoading}
        // multi-select
        multiMode={multiMode}
        selectedIds={selectedIds}
        onStartMulti={onStartMulti}
        onExitMulti={onExitMulti}
        onToggleSelect={onToggleSelect}
        onSelectAllPinned={onSelectAllPinned}
        onSelectAllOthers={onSelectAllOthers}
        onBulkDelete={onBulkDelete}
        onBulkPin={onBulkPin}
        onBulkArchive={onBulkArchive}
        onBulkRestore={onBulkRestore}
        onBulkColor={onBulkColor}
        onBulkDownloadZip={onBulkDownloadZip}
        // view mode
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        // SSE connection status
        sseConnected={sseConnected}
        isOnline={isOnline}
        loadNotes={loadNotes}
        loadArchivedNotes={loadArchivedNotes}
        // sync
        syncStatus={syncStatus}
        handleSyncNow={handleSyncNow}
        // checklist update
        onUpdateChecklistItem={onUpdateChecklistItem}
        // Admin panel
        openAdminPanel={openAdminPanel}
        // Settings panel
        openSettingsPanel={openSettingsPanel}
        // header auto-hide (mobile)
        windowWidth={windowWidth}
        // floating cards toggle
        floatingCardsEnabled={floatingCardsEnabled}
        onToggleFloatingCards={toggleFloatingCards}
      />
      {modal}

      {/* Generic Confirmation Dialog */}
      {genericConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGenericConfirmOpen(false)}
          />
          <div
            className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
            style={{
              backgroundColor: dark
                ? "rgba(40,40,40,0.95)"
                : "rgba(255,255,255,0.95)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">
              {genericConfirmConfig.title || "Confirm Action"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {genericConfirmConfig.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setGenericConfirmOpen(false)}
              >
                {genericConfirmConfig.cancelText || t("cancel")}
              </button>
              <button
                className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient ${genericConfirmConfig.danger ? "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-300/40 dark:shadow-none hover:shadow-lg hover:shadow-red-300/50 dark:hover:shadow-none" : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none"}`}
                onClick={async () => {
                  setGenericConfirmOpen(false);
                  if (genericConfirmConfig.onConfirm) {
                    await genericConfirmConfig.onConfirm();
                  }
                }}
              >
                {genericConfirmConfig.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] space-y-2 flex flex-col items-center">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-top-2 ${
                toast.type === "success"
                  ? "bg-green-600 text-white"
                  : toast.type === "error"
                    ? "bg-red-600 text-white"
                    : "bg-blue-600 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
