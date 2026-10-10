// src/utils/noteIcon.js
// Note icon (logo badge) helpers.
//
// The note icon is a small visual identifier (a logo or pictogram) that the
// user pins to a note to spot it in the closed-card grid. It now lives on
// note.icon, per user (see hooks/useLogoLibrary.js). Older notes may still
// carry it in their `images` array as an entry tagged role: "icon", which
// must not show as a content image.

const ICON_ROLE = "icon";

/** Returns content images (everything that is NOT the icon). */
export function getContentImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((im) => im && im.role !== ICON_ROLE);
}
