// src/utils/logoLibrary.js
// Server-backed per-user logo library.
//
// Logos live in a dedicated `logos` table on the server, scoped by
// user_id. They are independent of the notes that reference them: a
// user can curate the list, reuse logos across notes, and remove ones
// they no longer want — even if no note currently uses them.
//
// All sessions of the same user always see the same list, since the
// server is the source of truth.

import { api } from "./api.js";

export async function fetchLogoLibrary(token) {
  if (!token) return [];
  const rows = await api("/logos", { token });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Persists a logo to the user's library. The server dedupes by `src`,
 * so calling this twice with the same image is safe and returns the
 * existing entry.
 */
export async function createLogo(token, { name, src }) {
  if (!token || !src) return null;
  return api("/logos", {
    method: "POST",
    token,
    body: { name: name || "", src },
  });
}

export async function deleteLogo(token, id) {
  if (!token || !id) return;
  await api(`/logos/${encodeURIComponent(id)}`, { method: "DELETE", token });
}
