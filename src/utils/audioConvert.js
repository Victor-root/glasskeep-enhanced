// audioConvert.js — client-side audio format helpers.
//
// MediaRecorder produces webm/opus on Chromium/Firefox and m4a on Safari.
// We can re-encode to WAV in-browser via AudioContext.decodeAudioData and a
// hand-rolled RIFF writer (no dependencies). MP3 would require an external
// encoder (lamejs ~100 KB) — out of scope here, so the format menu offers
// "original" + "wav" only.
//
// All conversions return a Blob. Callers can download or re-upload them.

export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Not a data URL");
  }
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = (mimeMatch ? mimeMatch[1] : "application/octet-stream");
  const bin = atob(base64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function decodeAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API not supported");
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close?.();
  }
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// 16-bit PCM WAV encoder. Handles mono and stereo (downmixes to stereo at
// most). Float samples in [-1, 1] are clamped and scaled to Int16.
export function encodeWavFromAudioBuffer(audioBuffer) {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  let interleaved;
  if (numChannels === 2) {
    interleaved = new Float32Array(length * 2);
    const l = audioBuffer.getChannelData(0);
    const r = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      interleaved[i * 2] = l[i];
      interleaved[i * 2 + 1] = r[i];
    }
  } else {
    interleaved = audioBuffer.getChannelData(0);
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  // fmt sub-chunk
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);              // PCM fmt size
  view.setUint16(20, 1, true);               // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);              // bits per sample
  // data sub-chunk
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function convertAudioToWav(inputBlob) {
  const audioBuffer = await decodeAudioBuffer(inputBlob);
  return encodeWavFromAudioBuffer(audioBuffer);
}

// Returns true when this browser exposes enough Web Audio surface area to
// re-encode WAV from the recorded blob. Used to gate the "WAV" menu option
// so we don't show a button that will throw on click.
export function canConvertToWav() {
  return !!(window.AudioContext || window.webkitAudioContext);
}
