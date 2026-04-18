import React from "react";

/** ---------- Icons ---------- */
export const PinOutline = () => (
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
export const PinFilled = () => (
  <svg
    className="w-5 h-5"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);
export const Trash = () => (
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
export const Sun = () => (
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
export const Moon = () => (
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
export const ImageIcon = () => (
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
export const GalleryIcon = () => (
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
export const CloseIcon = () => (
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
export const DownloadIcon = () => (
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
export const ArrowLeft = () => (
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
export const ArrowRight = () => (
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
export const SearchIcon = () => (
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
export const Kebab = () => (
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
export const Hamburger = () => (
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
export const FormatIcon = () => (
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
export const SettingsIcon = () => (
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
export const GridIcon = () => (
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
export const ListIcon = () => (
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
export const SunIcon = () => (
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

export const Sparkles = () => (
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
export const MoonIcon = () => (
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
export const CheckSquareIcon = () => (
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
export const ShieldIcon = () => (
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
export const LogOutIcon = () => (
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
export const FloatingCardsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
);

// Archive icon
export const ArchiveIcon = () => (
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
export const PinIcon = () => (
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
export const TextNoteIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-2-6H7v-2h10v2zm-4 4H7v-2h6v2zm4-8H7V7h10v2z" />
  </svg>
);


export const ChecklistIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11 7H3v2h8V7zm0 4H3v2h8v-2zm0 4H3v2h8v-2zm5.59.58L13 12l1.41-1.41L16.59 12l4.59-4.59L22.59 9 16.59 15z" />
  </svg>
);


export const BrushIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10 2C5.03 2 1 6.03 1 11s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H14c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S3.67 8 4.5 8 6 8.67 6 9.5 5.33 11 4.5 11zm3-4C6.67 7 6 6.33 6 5.5S6.67 4 7.5 4 9 4.67 9 5.5 8.33 7 7.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S11.67 4 12.5 4s1.5.67 1.5 1.5S13.33 7 12.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
    />
    <path
      fill="currentColor"
      d="M20.71 13.04l-1.75-1.75a1 1 0 0 0-1.41 0l-1.2 1.2 3.16 3.16 1.2-1.2a1 1 0 0 0 0-1.41zm-4.07 0l-6.64 6.64V22.5h2.83l6.64-6.64-2.83-2.82z"
    />
  </svg>
);


export const AddImageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 11.5L11 14.51 14.5 10l4.5 6H5l3.5-4.5z" />
  </svg>
);
