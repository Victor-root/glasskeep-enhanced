import { uid } from "./helpers.js";

// Audio note content helpers.
//
// Audio notes follow the same on-disk pattern as drawing notes: the audio
// payload is stored as JSON in the shared `content` column. This keeps
// type=audio fully compatible with the existing notes table, sync queue,
// trash/archive/restore flow, labels, pinning, and import/export — no
// schema or attachment table is needed.
//
// On-disk schema (string, JSON-encoded) for type=audio:
//
//   {
//     version: 2,
//     clips: [
//       {
//         id: "abc123",
//         audioDataUrl: "data:audio/webm;base64,...",
//         mimeType: "audio/webm;codecs=opus",
//         duration: 12.345,    // seconds, may be null
//         size: 102400,        // bytes
//         createdAt: "2026-05-09T..."
//       },
//       …
//     ],
//     text: ""                 // reserved (future transcription / caption)
//   }
//
// v1 (deprecated, single-clip): { audioDataUrl, mimeType, duration, size,
// createdAt, text }. parseAudioContent transparently upgrades v1 → v2 on
// read, so existing notes keep working and re-save in v2 on next edit.

// Client-side cap on the sum of raw audio bytes across a note's clips
// (i.e. clip.size = blob.size from MediaRecorder, not the base64 length).
// Server's AUDIO_MAX_DATAURL_BYTES is sized to handle this comfortably
// once base64 inflation (~33%) and JSON wrapping are applied.
export const AUDIO_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
];

export function isAllowedAudioMime(mime) {
  if (typeof mime !== "string" || !mime) return false;
  const lower = mime.toLowerCase();
  return ALLOWED_AUDIO_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

function normalizeClip(c) {
  if (!c || typeof c !== "object") return null;
  if (typeof c.audioDataUrl !== "string" || !c.audioDataUrl.startsWith("data:")) return null;
  return {
    id: typeof c.id === "string" && c.id ? c.id : uid(),
    name: typeof c.name === "string" ? c.name : "",
    audioDataUrl: c.audioDataUrl,
    mimeType: typeof c.mimeType === "string" ? c.mimeType : "audio/webm",
    duration: Number.isFinite(c.duration) ? Number(c.duration) : null,
    size: Number.isFinite(c.size) ? Number(c.size) : null,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : null,
  };
}

// Parse a stored content string into the canonical { clips, text } shape.
// Always returns a valid object (never throws); empty/invalid inputs come
// back as { clips: [], text: "" } so callers don't need to defensive-check.
export function parseAudioContent(raw) {
  if (!raw) return { clips: [], text: "" };
  let obj;
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { clips: [], text: "" };
  }
  if (!obj || typeof obj !== "object") return { clips: [], text: "" };
  // v2: clips array
  if (Array.isArray(obj.clips)) {
    const clips = obj.clips.map(normalizeClip).filter(Boolean);
    return {
      clips,
      text: typeof obj.text === "string" ? obj.text : "",
    };
  }
  // v1: single clip at the top level
  if (typeof obj.audioDataUrl === "string" && obj.audioDataUrl.startsWith("data:")) {
    const c = normalizeClip(obj);
    return {
      clips: c ? [c] : [],
      text: typeof obj.text === "string" ? obj.text : "",
    };
  }
  return { clips: [], text: "" };
}

export function serializeAudioContent({ clips, text } = {}) {
  return JSON.stringify({
    version: 2,
    clips: Array.isArray(clips) ? clips.map(normalizeClip).filter(Boolean) : [],
    text: typeof text === "string" ? text : "",
  });
}

// Convenience: build a clip object from a freshly recorded blob payload.
export function makeClip({ audioDataUrl, mimeType, duration, size, name }) {
  return {
    id: uid(),
    name: typeof name === "string" ? name : "",
    audioDataUrl,
    mimeType: mimeType || "audio/webm",
    duration: Number.isFinite(duration) ? duration : null,
    size: Number.isFinite(size) ? size : null,
    createdAt: new Date().toISOString(),
  };
}

export function totalClipsBytes(clips) {
  if (!Array.isArray(clips)) return 0;
  let total = 0;
  for (const c of clips) {
    if (Number.isFinite(c?.size)) total += c.size;
    else if (typeof c?.audioDataUrl === "string") {
      // Approximate from the base64 payload length (4/3 ratio).
      const i = c.audioDataUrl.indexOf(",");
      const b64Len = i >= 0 ? c.audioDataUrl.length - i - 1 : c.audioDataUrl.length;
      total += Math.floor(b64Len * 0.75);
    }
  }
  return total;
}

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function pickSupportedAudioMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* ignore */ }
  }
  return "";
}

export function extensionForMime(mime) {
  if (typeof mime !== "string") return "webm";
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

// True when the parsed content has no playable audio clips.
export function isAudioContentEmpty(raw) {
  const parsed = parseAudioContent(raw);
  return parsed.clips.length === 0;
}
