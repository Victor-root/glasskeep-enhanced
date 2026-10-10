// server/utils/audioContent.js
//
// Shape and size checks for the content of an audio note.

// Audio note validation. The audio payload is stored as JSON inside `content`.
// Two on-disk shapes are accepted:
//   v2 (current): { version: 2, clips: [{ audioDataUrl, mimeType, … }, …], text }
//   v1 (legacy):  { audioDataUrl, mimeType, duration, size, … }
//
// Cap the whole serialised content at 150 MB. This must comfortably exceed
// the client's AUDIO_MAX_TOTAL_BYTES (100 MB of *raw* audio) once base64
// inflation (~33%) and JSON wrapping are applied: 100 MB raw becomes
// ~134 MB on the wire. Each clip's data URL must use an allowed audio MIME.
// An empty clips array is accepted: a freshly-created draft can have a
// title but no recordings yet (the user will record into it).
const AUDIO_MAX_DATAURL_BYTES = 150 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
];
function isAllowedAudioDataUrl(url) {
  if (typeof url !== "string" || !url.startsWith("data:")) return false;
  const mimeMatch = url.match(/^data:([^;,]+)[;,]/);
  const mime = (mimeMatch ? mimeMatch[1] : "").toLowerCase();
  return ALLOWED_AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p));
}
function validateAudioContent(raw) {
  if (typeof raw !== "string" || !raw) return "Audio note has no content";
  if (raw.length > AUDIO_MAX_DATAURL_BYTES) return "Audio recording is too large";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Audio note content is not valid JSON";
  }
  if (!parsed || typeof parsed !== "object") {
    return "Audio note content is not an object";
  }
  // v2: clips array. Empty is valid (title-only draft).
  if (Array.isArray(parsed.clips)) {
    for (const c of parsed.clips) {
      if (!c || typeof c !== "object") return "Audio clip is not an object";
      if (!isAllowedAudioDataUrl(c.audioDataUrl)) return "Unsupported audio MIME type";
    }
    return null;
  }
  // v1: single audioDataUrl
  if ("audioDataUrl" in parsed) {
    if (!isAllowedAudioDataUrl(parsed.audioDataUrl)) return "Unsupported audio MIME type";
    return null;
  }
  return "Audio note is missing recordings";
}

module.exports = { validateAudioContent };
