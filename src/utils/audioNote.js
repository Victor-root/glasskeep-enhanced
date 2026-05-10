// Audio note content helpers.
//
// Audio notes follow the same on-disk pattern as drawing notes: the audio
// payload is stored as JSON in the shared `content` column. This keeps
// type=audio fully compatible with the existing notes table, sync queue,
// trash/archive/restore flow, labels, pinning, and import/export — no schema
// or attachment table is needed.
//
// Shape of `content` for an audio note (string, JSON-encoded):
//
//   {
//     audioDataUrl: "data:audio/webm;base64,...",
//     mimeType:     "audio/webm;codecs=opus",
//     duration:     12.345,        // seconds, may be null if unknown
//     size:         102400,        // bytes of the encoded audio
//     createdAt:    "2026-05-09T...",
//     text:         ""             // reserved for future transcription
//   }

export const AUDIO_MAX_BYTES = 12 * 1024 * 1024; // 12 MB encoded — leaves headroom under the 20 MB body limit

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

export function parseAudioContent(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.audioDataUrl !== "string" || !obj.audioDataUrl.startsWith("data:")) return null;
    return {
      audioDataUrl: obj.audioDataUrl,
      mimeType: typeof obj.mimeType === "string" ? obj.mimeType : "audio/webm",
      duration: Number.isFinite(obj.duration) ? Number(obj.duration) : null,
      size: Number.isFinite(obj.size) ? Number(obj.size) : null,
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : null,
      text: typeof obj.text === "string" ? obj.text : "",
    };
  } catch {
    return null;
  }
}

export function serializeAudioContent({ audioDataUrl, mimeType, duration, size, text }) {
  return JSON.stringify({
    audioDataUrl,
    mimeType: mimeType || "audio/webm",
    duration: Number.isFinite(duration) ? Number(duration) : null,
    size: Number.isFinite(size) ? Number(size) : null,
    createdAt: new Date().toISOString(),
    text: typeof text === "string" ? text : "",
  });
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
