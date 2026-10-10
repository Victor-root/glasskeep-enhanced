// src/auth/jsonRequest.js
//
// The JSON requests of the sign-in clients (passkeyClient.js,
// deviceLinkClient.js): a failed answer throws an Error carrying the
// server's `error` message, the HTTP status and the parsed body.
// `onUnauthorized` runs on a 401 answered to a request that carried a
// token.

import { API_BASE } from "../utils/api.js";

export function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function readJSON(res, token, onUnauthorized) {
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body: data stays null */ }
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data || {};
}

export async function postJSON(path, body, token, onUnauthorized) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body || {}),
  });
  return readJSON(res, token, onUnauthorized);
}

export async function getJSON(path, token, onUnauthorized) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  return readJSON(res, token, onUnauthorized);
}
