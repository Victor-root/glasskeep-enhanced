// src/sync/syncActions.js
// The HTTP request each queued sync action maps to (syncEngine.js sends
// them), and how its failures are classified for the retry logic: auth
// expired (401), timeout (408), network error (status 0) or server error.

import { API_BASE } from "../utils/api.js";

export async function sendQueuedAction(item, token) {
  if (!token) {
    const err = new Error("No auth token");
    err.status = 401;
    throw err;
  }

  const baseHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const doFetch = async (path, options = {}) => {
    const headers = options.body
      ? { ...baseHeaders, "Content-Type": "application/json" }
      : baseHeaders;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("auth-expired"));
        const err = new Error("Authentication expired");
        err.status = 401;
        err.isAuthError = true;
        throw err;
      }

      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON body: data stays null */ }
        const err = new Error(data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      if (res.status === 204) return null;
      try { return await res.json(); } catch { return null; }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        // Timeout is NOT a network error: the server may just be busy.
        // Don't mark server as unreachable, just retry the item.
        const e = new Error("Request timeout");
        e.status = 408;
        e.isTimeout = true;
        throw e;
      }
      if (err.isAuthError || err.status) throw err;
      // Genuine network failure (connection refused, DNS, etc.)
      const e = new Error("Network error");
      e.status = 0;
      e.isNetworkError = true;
      throw e;
    }
  };

  switch (item.type) {
    case "create":
      return doFetch("/notes", {
        method: "POST",
        body: JSON.stringify(item.payload),
      });

    case "update":
      return doFetch(`/notes/${item.noteId}`, {
        method: "PUT",
        body: JSON.stringify(item.payload),
      });

    case "patch":
      return doFetch(`/notes/${item.noteId}`, {
        method: "PATCH",
        body: JSON.stringify(item.payload),
      });

    case "archive":
      return doFetch(`/notes/${item.noteId}/archive`, {
        method: "POST",
        body: JSON.stringify(item.payload),
      });

    case "reminder":
      return doFetch(`/notes/${item.noteId}/reminder`, {
        method: "POST",
        body: JSON.stringify(item.payload),
      });

    case "trash":
      return doFetch(`/notes/${item.noteId}/trash`, {
        method: "POST",
        body: JSON.stringify(item.payload || {}),
      });

    case "restore":
      return doFetch(`/notes/${item.noteId}/restore`, {
        method: "POST",
        body: JSON.stringify(item.payload || {}),
      });

    case "permanentDelete":
      return doFetch(`/notes/${item.noteId}/permanent`, {
        method: "DELETE",
        body: JSON.stringify(item.payload || {}),
      });

    case "reorder":
      return doFetch("/notes/reorder", {
        method: "POST",
        body: JSON.stringify(item.payload),
      });

    default:
      throw new Error(`Unknown sync action type: ${item.type}`);
  }
}
