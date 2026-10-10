import React from "react";

// Collaborate glyph of the note modal footer and its kebab menu entry.
// The viewBox is shifted onto the glyph's ink, which sits right of and below
// the centre of its 20-unit drawing, so the icon centres in its button.
export default function CollaborateIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="2 0.5 20 20" aria-hidden="true">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
    </svg>
  );
}
