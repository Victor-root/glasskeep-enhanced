import React from "react";

/** ---------- Palette icon with colored blobs ---------- */
export default function PaletteColorIcon({ size = 22 }) {
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
